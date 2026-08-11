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

  var UNI_FIELDS = ['id', 'country', 'name', 'location', 'website', 'status', 'notes'];
  var PROF_FIELDS = ['id', 'uniId', 'uniName', 'name', 'email', 'mobile', 'subject', 'status', 'updates', 'notes'];

  var UNI_STATUS = ['Researching', 'Shortlisted', 'Applied', 'Accepted', 'Rejected'];
  var PROF_STATUS = ['Not contacted', 'Emailed', 'Discussing', 'Interviewing', 'Positive', 'Rejected', 'No response'];

  var unis = [];
  var profs = [];
  var subs = [];
  var syncState = 'idle';   // idle | syncing | ok | offline | no-tab
  var pending = {};
  var timer = null;

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
     so the Sheet stays readable and hand-editable. */
  function parseUpdates(raw) {
    if (Array.isArray(raw)) return raw;
    if (!raw) return [];
    return String(raw).split('|').map(function (chunk) {
      var s = chunk.trim();
      if (!s) return null;
      var i = s.indexOf('::');
      return i === -1 ? { date: '', text: s } : { date: s.slice(0, i).trim(), text: s.slice(i + 2).trim() };
    }).filter(Boolean);
  }
  function joinUpdates(list) {
    return (list || []).map(function (u) { return (u.date || '') + '::' + (u.text || ''); }).join(' | ');
  }

  function normUni(r) {
    var o = {};
    UNI_FIELDS.forEach(function (k) { o[k] = r[k] == null ? '' : String(r[k]); });
    if (!o.id) o.id = uuid();
    if (!o.status) o.status = 'Researching';
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

  function save() {
    try {
      localStorage.setItem(LS_UNI, JSON.stringify(unis));
      localStorage.setItem(LS_PROF, JSON.stringify(profs.map(function (p) { return rowOf(p, PROF_FIELDS); })));
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

  function sync() {
    if (!(window.SHEET && SHEET.configured())) { syncState = 'offline'; return Promise.resolve(false); }
    syncState = 'syncing';
    return Promise.all([SHEET.get(UNI_TAB), SHEET.get(PROF_TAB)]).then(function (res) {
      unis = res[0].map(normUni);
      profs = res[1].map(normProf);
      syncState = 'ok';
      emit();
      return true;
    }).catch(function (err) {
      if (!flagNoTab(err)) { syncState = 'offline'; notify(); }
      return false;
    });
  }

  function push(tab, action, payload) {
    if (!sheetOn()) return Promise.resolve(false);
    var call = action === 'create' ? SHEET.create(tab, payload)
      : action === 'update' ? SHEET.update(tab, payload)
        : SHEET.remove(tab, payload);
    return call.then(function () { return true; }).catch(function (err) {
      if (!flagNoTab(err) && window.toast) toast('Sheet save failed — kept locally', 'warn');
      return false;
    });
  }

  /* Debounced, so typing in a grid cell is not one request per keystroke. */
  function queue(tab, obj, fields) {
    pending[tab + ':' + obj.id] = { tab: tab, row: rowOf(obj, fields) };
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      var batch = pending; pending = {};
      Object.keys(batch).forEach(function (k) { push(batch[k].tab, 'update', batch[k].row); });
    }, 800);
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

  /* ---------- university writes ---------- */
  function addUni(rec) {
    var u = normUni(Object.assign({ id: uuid() }, rec));
    unis.push(u); emit();
    push(UNI_TAB, 'create', rowOf(u, UNI_FIELDS));
    return u;
  }
  function updateUni(id, rec) {
    var u = uniById(id); if (!u) return null;
    var renamed = rec.name != null && rec.name !== u.name;
    Object.assign(u, normUni(Object.assign({}, u, rec, { id: id })));
    if (renamed) {
      profsFor(id).forEach(function (p) { p.uniName = u.name; queue(PROF_TAB, p, PROF_FIELDS); });
    }
    emit();
    push(UNI_TAB, 'update', rowOf(u, UNI_FIELDS));
    return u;
  }
  function removeUni(id) {
    var kids = profsFor(id);
    unis = unis.filter(function (u) { return u.id !== id; });
    profs = profs.filter(function (p) { return p.uniId !== id; });
    emit();
    push(UNI_TAB, 'delete', id);
    kids.forEach(function (p) { push(PROF_TAB, 'delete', p.id); });
  }

  /* ---------- professor writes ---------- */
  function addProf(uniId, rec) {
    var u = uniById(uniId);
    var p = normProf(Object.assign({ id: uuid(), uniId: uniId, uniName: u ? u.name : '' }, rec || {}));
    profs.push(p); emit();
    push(PROF_TAB, 'create', rowOf(p, PROF_FIELDS));
    return p;
  }
  /* Used by the inline grid — saves locally at once, pushes debounced. */
  function setProfCell(id, key, value) {
    var p = profById(id); if (!p || p[key] === value) return p;
    p[key] = value;
    save();
    queue(PROF_TAB, p, PROF_FIELDS);
    return p;
  }
  function updateProf(id, rec) {
    var p = profById(id); if (!p) return null;
    if (rec.updateList) rec.updates = joinUpdates(rec.updateList);
    Object.assign(p, normProf(Object.assign({}, rowOf(p, PROF_FIELDS), rec, { id: id })));
    emit();
    push(PROF_TAB, 'update', rowOf(p, PROF_FIELDS));
    return p;
  }
  function removeProf(id) {
    profs = profs.filter(function (p) { return p.id !== id; });
    emit();
    push(PROF_TAB, 'delete', id);
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
    var localU = unis.slice(), localP = profs.slice();
    return Promise.all([SHEET.get(UNI_TAB), SHEET.get(PROF_TAB)]).then(function (res) {
      var haveU = {}, haveP = {};
      res[0].forEach(function (r) { haveU[r.id] = 1; });
      res[1].forEach(function (r) { haveP[r.id] = 1; });
      var jobs = [];
      localU.forEach(function (u) { if (!haveU[u.id]) jobs.push(push(UNI_TAB, 'create', rowOf(u, UNI_FIELDS))); });
      localP.forEach(function (p) { if (!haveP[p.id]) jobs.push(push(PROF_TAB, 'create', rowOf(p, PROF_FIELDS))); });
      return Promise.all(jobs).then(function () { return sync(); });
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
    var head = ['University', 'Location', 'Website', 'Uni Status', 'Professor', 'Email', 'Mobile', 'Subject', 'Status', 'Email Updates', 'Notes'];
    var body = [];
    unisFor(country).forEach(function (u) {
      var kids = profsFor(u.id);
      if (!kids.length) { body.push([u.name, u.location, u.website, u.status, '', '', '', '', '', '', u.notes]); return; }
      kids.forEach(function (p) {
        body.push([u.name, u.location, u.website, u.status, p.name, p.email, p.mobile, p.subject, p.status,
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
  } catch (e) {}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { sync(); });
  else sync();

  return {
    UNI_STATUS: UNI_STATUS, PROF_STATUS: PROF_STATUS,
    onChange: onChange, sync: sync, retrySheet: retrySheet,
    syncState: function () { return syncState; },
    unisFor: unisFor, profsFor: profsFor, profsForCountry: profsForCountry,
    uniById: uniById, profById: profById, stats: stats,
    addUni: addUni, updateUni: updateUni, removeUni: removeUni,
    addProf: addProf, updateProf: updateProf, removeProf: removeProf, setProfCell: setProfCell,
    addUpdate: addUpdate, editUpdate: editUpdate, removeUpdate: removeUpdate,
    exportCsv: exportCsv, today: today
  };
})();
