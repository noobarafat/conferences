/* ============================================================
   outreach.js — data layer for the university / professor tracker.

   Shape:
     University (card)  →  Professors (grid inside the card)
                            →  Email updates (dated log per professor)

   Two Google Sheet tabs, linked by uniId:
     Universities : id, country, name, location, website, status, notes
     Professors   : id, uniId, uniName, name, email, mobile, subject,
                    status, updates, notes

   Local-first: localStorage is what the UI renders from, so nothing
   ever waits on the network. Writes apply locally first, then push
   to the Sheet in the background.
   ============================================================ */
window.OUTREACH = (function () {
  'use strict';

  var UNI_TAB = 'Universities';
  var PROF_TAB = 'Professors';
  var LS_UNI = 'outreach_unis_v2';
  var LS_PROF = 'outreach_profs_v2';

  var UNI_FIELDS = ['id', 'country', 'name', 'location', 'website', 'status', 'notes', 'documents'];
  var PROF_FIELDS = ['id', 'uniId', 'uniName', 'name', 'email', 'mobile', 'subject', 'status', 'updates', 'notes'];

  var UNI_STATUS = ['Researching', 'Shortlisted', 'Applied', 'Accepted', 'Rejected'];
  var PROF_STATUS = ['Not contacted', 'Emailed', 'Discussing', 'Interviewing', 'Positive', 'Rejected', 'No response'];

  var unis = [];
  var profs = [];
  var subs = [];
  var syncState = 'idle';   // idle | syncing | ok | offline | no-tab
  var pending = {};
  var timer = null;
  // Rows the Sheet has not confirmed yet, and rows deleted locally awaiting
  // confirmation. Persisted, so a reload or a crash cannot lose the intent.
  var pendingUni = {}, pendingProf = {}, tombUni = {}, tombProf = {};

  /* ---------- helpers ---------- */
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* Updates live in one cell as  YYYY-MM-DD::text | YYYY-MM-DD::text
     so the Sheet stays readable and hand-editable. A literal "|" typed by
     the user would otherwise split one entry into two, so the delimiter is
     escaped on the way in and restored on the way out. */
  var PIPE = '&#124;';
  function encPipe(s) { return String(s == null ? '' : s).replace(/\|/g, PIPE); }
  function decPipe(s) { return String(s == null ? '' : s).split(PIPE).join('|'); }

  function parseUpdates(raw) {
    if (Array.isArray(raw)) return raw;
    if (!raw) return [];
    return String(raw).split('|').map(function (chunk) {
      var s = chunk.trim();
      if (!s) return null;
      var i = s.indexOf('::');
      return i === -1
        ? { date: '', text: decPipe(s) }
        : { date: s.slice(0, i).trim(), text: decPipe(s.slice(i + 2).trim()) };
    }).filter(Boolean);
  }
  function joinUpdates(list) {
    return (list || []).map(function (u) { return (u.date || '') + '::' + encPipe(u.text); }).join(' | ');
  }

  /* Per-university documents share the same one-cell encoding, using a
     0/1 done flag instead of a date:  text::1 | text::0  */
  function parseDocs(raw) {
    if (Array.isArray(raw)) return raw;
    if (!raw) return [];
    return String(raw).split('|').map(function (chunk) {
      var s = chunk.trim();
      if (!s) return null;
      var i = s.lastIndexOf('::');
      if (i === -1) return { text: decPipe(s), done: false };
      return { text: decPipe(s.slice(0, i).trim()), done: s.slice(i + 2).trim() === '1' };
    }).filter(Boolean);
  }
  function joinDocs(list) {
    return (list || []).map(function (d) { return encPipe(d.text) + '::' + (d.done ? '1' : '0'); }).join(' | ');
  }

  function normUni(r) {
    var o = {};
    UNI_FIELDS.forEach(function (k) { o[k] = r[k] == null ? '' : String(r[k]); });
    if (!o.id) o.id = uuid();
    if (!o.status) o.status = 'Researching';
    o.docList = parseDocs(o.documents);
    return o;
  }
  function normProf(r) {
    var o = {};
    PROF_FIELDS.forEach(function (k) { o[k] = r[k] == null ? '' : String(r[k]); });
    if (!o.id) o.id = uuid();
    if (!o.status) o.status = 'Not contacted';
    o.updateList = parseUpdates(o.updates);
    return o;
  }
  function rowOf(o, fields) {
    var r = {}; fields.forEach(function (k) { r[k] = o[k] == null ? '' : o[k]; }); return r;
  }

  var LS_Q = 'outreach_queue_v2';
  function save() {
    try {
      localStorage.setItem(LS_UNI, JSON.stringify(unis.map(function (u) { return rowOf(u, UNI_FIELDS); })));
      localStorage.setItem(LS_PROF, JSON.stringify(profs.map(function (p) { return rowOf(p, PROF_FIELDS); })));
      localStorage.setItem(LS_Q, JSON.stringify({ pu: pendingUni, pp: pendingProf, tu: tombUni, tp: tombProf }));
    } catch (e) {}
  }
  function emit() { save(); subs.forEach(function (f) { try { f(); } catch (e) {} }); }
  function notify() { subs.forEach(function (f) { try { f(); } catch (e) {} }); }
  function onChange(f) { subs.push(f); }

  /* ---------- Sheet ---------- */
  function sheetOn() { return window.SHEET && SHEET.configured() && syncState !== 'no-tab'; }
  function flagNoTab(err) {
    if (/no tab named/i.test(String(err && err.message))) { syncState = 'no-tab'; notify(); return true; }
    return false;
  }

  /* Merge remote into local without ever discarding something the Sheet has
     not accepted yet — an edit made offline, or a create whose request
     failed. Replacing the arrays outright (the old behaviour) meant an empty
     or lagging tab could erase everything held locally. */
  function mergeInto(local, remote, normFn, pendingSet, tombSet) {
    var seen = {}, next = [];
    remote.forEach(function (r) {
      if (!r || !r.id) return;
      var id = String(r.id);
      seen[id] = true;
      // Still listed remotely means the delete never took — re-arm it, but
      // only a few times. Giving up leaves a spare row on the Sheet, which
      // is far safer than a stuck tombstone deleting a real row forever.
      if (tombSet[id]) {
        var tries = (typeof tombSet[id] === 'number' ? tombSet[id] : 0) + 1;
        if (tries > 3) { delete tombSet[id]; next.push(normFn(r)); return; }
        tombSet[id] = tries;
        return;
      }
      var mine = local.find(function (x) { return x.id === id; });
      if (mine && pendingSet[id]) { next.push(mine); return; }   // local edit wins
      next.push(normFn(r));
    });
    local.forEach(function (l) {
      if (seen[l.id] || tombSet[l.id]) return;
      next.push(l);
      if (!pendingSet[l.id]) pendingSet[l.id] = 'create';         // re-queue: never landed
    });
    Object.keys(tombSet).forEach(function (id) { if (!seen[id]) delete tombSet[id]; });
    return next;
  }

  function sync() {
    if (!(window.SHEET && SHEET.configured())) { syncState = 'offline'; return Promise.resolve(false); }
    syncState = 'syncing';
    return Promise.all([SHEET.get(UNI_TAB), SHEET.get(PROF_TAB)]).then(function (res) {
      unis = mergeInto(unis, res[0] || [], normUni, pendingUni, tombUni);
      profs = mergeInto(profs, res[1] || [], normProf, pendingProf, tombProf);
      syncState = 'ok';
      emit();
      flushPending();
      return true;
    }).catch(function (err) {
      if (!flagNoTab(err)) { syncState = 'offline'; notify(); }
      return false;
    });
  }

  /* Retry anything the Sheet has not confirmed. Survives reloads because the
     queues are persisted alongside the rows. */
  function flushPending() {
    if (!sheetOn()) return Promise.resolve(false);
    var jobs = [];
    function drain(pendingSet, tombSet, tab, list, fields) {
      Object.keys(tombSet).forEach(function (id) {
        if (tombSet[id] !== 'pending' && typeof tombSet[id] !== 'number') return;
        var attempt = typeof tombSet[id] === 'number' ? tombSet[id] : 0;
        jobs.push(SHEET.remove(tab, id).then(function () { tombSet[id] = true; save(); })
          .catch(function (err) {
            if (flagNoTab(err)) return;
            if (/id not found/i.test(String(err && err.message))) { delete tombSet[id]; save(); return; }
            tombSet[id] = attempt;
          }));
      });
      Object.keys(pendingSet).forEach(function (id) {
        var rec = list.find(function (x) { return x.id === id; });
        if (!rec) { delete pendingSet[id]; return; }
        var verb = pendingSet[id];
        var call = verb === 'create' ? SHEET.create(tab, rowOf(rec, fields)) : SHEET.update(tab, rowOf(rec, fields));
        jobs.push(call.then(function () { delete pendingSet[id]; save(); }).catch(function (err) {
          if (flagNoTab(err)) return;
          // Switch verb only when the row genuinely is not there; creating
          // after a transient update failure would append a duplicate.
          if (verb === 'update' && /id not found/i.test(String(err && err.message))) {
            return SHEET.create(tab, rowOf(rec, fields))
              .then(function () { delete pendingSet[id]; save(); }).catch(function () {});
          }
        }));
      });
    }
    drain(pendingUni, tombUni, UNI_TAB, unis, UNI_FIELDS);
    drain(pendingProf, tombProf, PROF_TAB, profs, PROF_FIELDS);
    if (!jobs.length) return Promise.resolve(true);
    return Promise.all(jobs).then(function () { save(); return true; });
  }

  /* The backend writes a row by mapping the record onto the tab's header
     row. A tab created by hand with no headers therefore accepts writes
     but stores nothing — which looks like success. Probe for that case so
     the UI can say exactly what is wrong instead of silently losing data. */
  function verifySetup() {
    if (!(window.SHEET && SHEET.configured())) { syncState = 'offline'; notify(); return Promise.resolve('offline'); }
    var probe = { id: '__probe__' };
    UNI_FIELDS.forEach(function (k) { if (k !== 'id') probe[k] = k === 'name' ? '__probe__' : ''; });
    return SHEET.create(UNI_TAB, probe).then(function () {
      return SHEET.get(UNI_TAB);
    }).then(function (rows) {
      var landed = rows.some(function (r) { return String(r.id) === '__probe__'; });
      return SHEET.remove(UNI_TAB, '__probe__').catch(function () {}).then(function () {
        syncState = landed ? 'ok' : 'no-headers';
        notify();
        return syncState;
      });
    }).catch(function (err) {
      syncState = /no tab named/i.test(String(err && err.message)) ? 'no-tab' : 'offline';
      notify();
      return syncState;
    });
  }

  /* Debounced, so typing in a grid cell is not one request per keystroke. */
  function scheduleFlush() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { timer = null; flushPending(); }, 900);
  }

  /* ---------- reads ---------- */
  function unisFor(c) { return unis.filter(function (u) { return u.country === c; }); }
  function profsFor(uniId) { return profs.filter(function (p) { return p.uniId === uniId; }); }
  function profsForCountry(c) {
    var ids = {};
    unisFor(c).forEach(function (u) { ids[u.id] = 1; });
    return profs.filter(function (p) { return ids[p.uniId]; });
  }
  function uniById(id) { return unis.find(function (u) { return u.id === id; }); }
  function profById(id) { return profs.find(function (p) { return p.id === id; }); }

  function stats(country) {
    var list = country ? profsForCountry(country) : profs;
    var contacted = list.filter(function (p) { return p.status && p.status !== 'Not contacted'; }).length;
    var talking = list.filter(function (p) {
      return p.status === 'Discussing' || p.status === 'Interviewing' || p.status === 'Positive';
    }).length;
    var replied = list.filter(function (p) {
      return (p.updateList && p.updateList.length) || p.status === 'Discussing' ||
        p.status === 'Interviewing' || p.status === 'Positive' || p.status === 'Rejected';
    }).length;
    return {
      unis: country ? unisFor(country).length : unis.length,
      profs: list.length,
      contacted: contacted,
      replied: replied,
      talking: talking,
      replyRate: contacted ? Math.round(replied / contacted * 100) : 0
    };
  }

  /* Every write marks the row pending and lets flushPending() do the upload,
     so a failed request is retried instead of being lost. */
  function markUni(id, verb) { if (pendingUni[id] !== 'create') pendingUni[id] = verb; }
  function markProf(id, verb) { if (pendingProf[id] !== 'create') pendingProf[id] = verb; }

  /* ---------- university writes ---------- */
  function addUni(rec) {
    var u = normUni(Object.assign({ id: uuid() }, rec));
    unis.push(u);
    pendingUni[u.id] = 'create'; delete tombUni[u.id];
    emit(); flushPending();
    return u;
  }
  function updateUni(id, rec) {
    var u = uniById(id); if (!u) return null;
    var renamed = rec.name != null && rec.name !== u.name;
    if (rec.docList) rec.documents = joinDocs(rec.docList);
    Object.assign(u, normUni(Object.assign({}, rowOf(u, UNI_FIELDS), rec, { id: id })));
    if (renamed) {
      profsFor(id).forEach(function (p) { p.uniName = u.name; markProf(p.id, 'update'); });
    }
    markUni(id, 'update');
    emit(); scheduleFlush();
    return u;
  }
  function removeUni(id) {
    var kids = profsFor(id);
    unis = unis.filter(function (u) { return u.id !== id; });
    profs = profs.filter(function (p) { return p.uniId !== id; });
    delete pendingUni[id]; tombUni[id] = 'pending';
    kids.forEach(function (p) { delete pendingProf[p.id]; tombProf[p.id] = 'pending'; });
    emit(); flushPending();
  }

  /* ---------- professor writes ---------- */
  function addProf(uniId, rec) {
    var u = uniById(uniId);
    var p = normProf(Object.assign({ id: uuid(), uniId: uniId, uniName: u ? u.name : '' }, rec || {}));
    profs.push(p);
    pendingProf[p.id] = 'create'; delete tombProf[p.id];
    emit(); flushPending();
    return p;
  }
  /* Used by the inline grid — saves locally at once, uploads debounced. */
  function setProfCell(id, key, value) {
    var p = profById(id); if (!p || p[key] === value) return p;
    p[key] = value;
    markProf(id, 'update');
    save(); scheduleFlush();
    return p;
  }
  function updateProf(id, rec) {
    var p = profById(id); if (!p) return null;
    if (rec.updateList) rec.updates = joinUpdates(rec.updateList);
    Object.assign(p, normProf(Object.assign({}, rowOf(p, PROF_FIELDS), rec, { id: id })));
    markProf(id, 'update');
    emit(); scheduleFlush();
    return p;
  }
  function removeProf(id) {
    profs = profs.filter(function (p) { return p.id !== id; });
    delete pendingProf[id]; tombProf[id] = 'pending';
    emit(); flushPending();
  }

  /* ---------- per-university documents (optional) ---------- */
  function addUniDoc(uniId, text) {
    var u = uniById(uniId); if (!u || !text) return null;
    var list = (u.docList || []).slice();
    list.push({ text: text, done: false });
    return updateUni(uniId, { docList: list });
  }
  function toggleUniDoc(uniId, idx) {
    var u = uniById(uniId); if (!u) return null;
    var list = (u.docList || []).slice();
    if (!list[idx]) return null;
    list[idx] = { text: list[idx].text, done: !list[idx].done };
    return updateUni(uniId, { docList: list });
  }
  function editUniDoc(uniId, idx, text) {
    var u = uniById(uniId); if (!u) return null;
    var list = (u.docList || []).slice();
    if (!list[idx]) return null;
    list[idx] = { text: text, done: list[idx].done };
    return updateUni(uniId, { docList: list });
  }
  function removeUniDoc(uniId, idx) {
    var u = uniById(uniId); if (!u) return null;
    var list = (u.docList || []).slice();
    list.splice(idx, 1);
    return updateUni(uniId, { docList: list });
  }

  /* ---------- email updates ---------- */
  function addUpdate(profId, text, date) {
    var p = profById(profId); if (!p) return null;
    var list = (p.updateList || []).slice();
    list.push({ date: date || today(), text: text });
    var patch = { updateList: list };
    if (p.status === 'Not contacted' || p.status === 'Emailed') patch.status = 'Discussing';
    return updateProf(profId, patch);
  }
  function editUpdate(profId, idx, text, date) {
    var p = profById(profId); if (!p) return null;
    var list = (p.updateList || []).slice();
    if (!list[idx]) return null;
    list[idx] = { date: date || list[idx].date, text: text };
    return updateProf(profId, { updateList: list });
  }
  function removeUpdate(profId, idx) {
    var p = profById(profId); if (!p) return null;
    var list = (p.updateList || []).slice();
    list.splice(idx, 1);
    return updateProf(profId, { updateList: list });
  }

  /* ---------- retry after the backend is redeployed ---------- */
  function retrySheet() {
    syncState = 'idle';
    if (!(window.SHEET && SHEET.configured())) { syncState = 'offline'; notify(); return Promise.resolve(false); }
    // Confirm the tabs exist AND carry a header row before uploading, so a
    // half-finished setup never silently swallows the local data.
    return verifySetup().then(function (state) {
      return state === 'ok' ? uploadLocal() : false;
    });
  }

  function uploadLocal() {
    // Queue anything the Sheet does not have, then let the shared flush do
    // the work — it already handles retries and create/update mismatches.
    return Promise.all([SHEET.get(UNI_TAB), SHEET.get(PROF_TAB)]).then(function (res) {
      var haveU = {}, haveP = {};
      (res[0] || []).forEach(function (r) { haveU[r.id] = 1; });
      (res[1] || []).forEach(function (r) { haveP[r.id] = 1; });
      unis.forEach(function (u) { if (!haveU[u.id]) pendingUni[u.id] = 'create'; });
      profs.forEach(function (p) { if (!haveP[p.id]) pendingProf[p.id] = 'create'; });
      save();
      return flushPending().then(function () { return sync(); });
    }).catch(function (err) {
      if (!flagNoTab(err)) { syncState = 'offline'; notify(); }
      return false;
    });
  }

  /* ---------- CSV ---------- */
  function cell(v) {
    var s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function exportCsv(country) {
    var head = ['University', 'Location', 'Website', 'Uni Status', 'Uni Documents', 'Professor', 'Email', 'Mobile', 'Subject', 'Status', 'Email Updates', 'Notes'];
    var body = [];
    unisFor(country).forEach(function (u) {
      var docs = (u.docList || []).map(function (d) { return (d.done ? '[x] ' : '[ ] ') + d.text; }).join(' ; ');
      var kids = profsFor(u.id);
      if (!kids.length) { body.push([u.name, u.location, u.website, u.status, docs, '', '', '', '', '', '', u.notes]); return; }
      kids.forEach(function (p) {
        body.push([u.name, u.location, u.website, u.status, docs, p.name, p.email, p.mobile, p.subject, p.status,
          (p.updateList || []).map(function (x) { return x.date + ' ' + x.text; }).join(' ; '), p.notes]);
      });
    });
    var csv = [head].concat(body).map(function (r) { return r.map(cell).join(','); }).join('\r\n');
    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'outreach-' + (country || 'all') + '-' + today() + '.csv';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }

  /* ---------- boot ---------- */
  try {
    var cu = JSON.parse(localStorage.getItem(LS_UNI) || '[]');
    var cp = JSON.parse(localStorage.getItem(LS_PROF) || '[]');
    if (Array.isArray(cu)) unis = cu.map(normUni);
    if (Array.isArray(cp)) profs = cp.map(normProf);
    var q = JSON.parse(localStorage.getItem(LS_Q) || '{}') || {};
    pendingUni = q.pu || {}; pendingProf = q.pp || {};
    tombUni = q.tu || {}; tombProf = q.tp || {};
  } catch (e) {}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { sync(); });
  else sync();

  window.addEventListener('online', function () { if (syncState !== 'no-tab') sync(); });
  // Keep retrying anything the Sheet has not confirmed.
  setInterval(function () {
    if (syncState !== 'no-tab' &&
      (Object.keys(pendingUni).length || Object.keys(pendingProf).length ||
        Object.keys(tombUni).length || Object.keys(tombProf).length)) flushPending();
  }, 60000);

  return {
    UNI_STATUS: UNI_STATUS, PROF_STATUS: PROF_STATUS,
    onChange: onChange, sync: sync, retrySheet: retrySheet, verifySetup: verifySetup,
    syncState: function () { return syncState; },
    pending: function () {
      return Object.keys(pendingUni).length + Object.keys(pendingProf).length +
        Object.keys(tombUni).length + Object.keys(tombProf).length;
    },
    HEADERS: { Universities: UNI_FIELDS, Professors: PROF_FIELDS },
    unisFor: unisFor, profsFor: profsFor, profsForCountry: profsForCountry,
    uniById: uniById, profById: profById, stats: stats,
    addUni: addUni, updateUni: updateUni, removeUni: removeUni,
    addUniDoc: addUniDoc, toggleUniDoc: toggleUniDoc, editUniDoc: editUniDoc, removeUniDoc: removeUniDoc,
    addProf: addProf, updateProf: updateProf, removeProf: removeProf, setProfCell: setProfCell,
    addUpdate: addUpdate, editUpdate: editUpdate, removeUpdate: removeUpdate,
    exportCsv: exportCsv, today: today
  };
})();
