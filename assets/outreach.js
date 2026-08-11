/* ============================================================
   outreach.js — university + professor contact tracker.

   Purpose: keep a record of every professor contacted and every
   university researched, so the outreach effort is measurable
   and reusable later.

   Storage strategy (local-first, Sheet-backed):
     • localStorage is the render cache — the UI paints instantly,
       never waiting on the network.
     • Google Sheet is the durable store. Reads happen in the
       background on load; writes are optimistic (local first,
       then pushed to the Sheet).
     • Two auto-created tabs: "Universities" and "Professors",
       linked by uniId. Code.gs::ensureSheet builds the headers
       on the first create, so no manual Sheet setup is needed.

   Loaded in <head> (after sheet-api.js) so the dashboard's inline
   script can call OUTREACH.* during its own init.
   ============================================================ */
window.OUTREACH = (function () {
  'use strict';

  var UNI_TAB = 'Universities';
  var PROF_TAB = 'Professors';
  var LS_UNI = 'outreach_unis';
  var LS_PROF = 'outreach_profs';
  var FOLLOWUP_DAYS = 10;   // no reply after this many days -> nudge

  var unis = [];
  var profs = [];
  var subscribers = [];
  var syncState = 'idle';   // idle | syncing | ok | offline

  var UNI_FIELDS = ['id', 'country', 'name', 'website', 'course', 'location', 'status', 'notes'];
  var PROF_FIELDS = ['id', 'uniId', 'uniName', 'name', 'email', 'mobile', 'title', 'research', 'status', 'emailedOn', 'responses', 'notes'];

  var PROF_STATUS = ['Not contacted', 'Emailed', 'Replied', 'Positive', 'Negative', 'No response'];
  var UNI_STATUS = ['Researching', 'Shortlisted', 'Applied', 'Accepted', 'Rejected'];

  /* ---------- small helpers ---------- */
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  function lsGet(k, fb) {
    try { var v = JSON.parse(localStorage.getItem(k)); return Array.isArray(v) ? v : fb; }
    catch (e) { return fb; }
  }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function daysSince(ds) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ds || '')) return null;
    var p = ds.split('-').map(Number);
    var then = Date.UTC(p[0], p[1] - 1, p[2]);
    var n = new Date();
    var now = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
    return Math.round((now - then) / 86400000);
  }

  /* Responses are stored in one cell as:  YYYY-MM-DD::text | YYYY-MM-DD::text
     Kept human-readable so the Sheet stays editable by hand. */
  function parseResponses(raw) {
    if (Array.isArray(raw)) return raw;
    if (!raw) return [];
    return String(raw).split('|').map(function (chunk) {
      var s = chunk.trim();
      if (!s) return null;
      var i = s.indexOf('::');
      return i === -1 ? { date: '', text: s } : { date: s.slice(0, i).trim(), text: s.slice(i + 2).trim() };
    }).filter(Boolean);
  }
  function serializeResponses(list) {
    return (list || []).map(function (r) { return (r.date || '') + '::' + (r.text || ''); }).join(' | ');
  }

  function normUni(r) {
    var o = {};
    UNI_FIELDS.forEach(function (k) { o[k] = r[k] == null ? '' : String(r[k]); });
    if (!o.status) o.status = 'Researching';
    return o;
  }
  function normProf(r) {
    var o = {};
    PROF_FIELDS.forEach(function (k) { o[k] = r[k] == null ? '' : String(r[k]); });
    if (!o.status) o.status = 'Not contacted';
    o.emailedOn = (o.emailedOn || '').slice(0, 10);
    o.responseList = parseResponses(o.responses);
    return o;
  }

  /* ---------- change notification ---------- */
  function onChange(fn) { subscribers.push(fn); }
  function emit() {
    lsSet(LS_UNI, unis);
    lsSet(LS_PROF, profs.map(function (p) {
      var c = {}; PROF_FIELDS.forEach(function (k) { c[k] = p[k]; }); return c;
    }));
    subscribers.forEach(function (fn) { try { fn(); } catch (e) {} });
  }

  /* ---------- Sheet sync ---------- */
  function sheetReady() { return window.SHEET && SHEET.configured(); }

  function sync() {
    if (!sheetReady()) { syncState = 'offline'; return Promise.resolve(false); }
    syncState = 'syncing';
    return Promise.all([
      SHEET.get(UNI_TAB).catch(function () { return null; }),
      SHEET.get(PROF_TAB).catch(function () { return null; })
    ]).then(function (res) {
      // A missing tab returns null (it just hasn't been created yet) — that's
      // not an error, it only means nothing has been saved there so far.
      if (res[0]) unis = res[0].map(normUni).filter(function (u) { return u.id; });
      if (res[1]) profs = res[1].map(normProf).filter(function (p) { return p.id; });
      syncState = 'ok';
      emit();
      return true;
    }).catch(function () { syncState = 'offline'; return false; });
  }

  /* The deployed Apps Script may predate Code.gs::ensureSheet, in which case
     it cannot auto-create the Universities / Professors tabs and every write
     fails with `no tab named "…"`. That is a deployment issue, not a data
     issue: we keep everything in localStorage, flag the tab as unavailable so
     we stop retrying on every keystroke, and surface one actionable notice. */
  var missingTabs = {};
  function tabMissing(tab) { return !!missingTabs[tab]; }

  function push(tab, action, payload) {
    if (!sheetReady() || missingTabs[tab]) return Promise.resolve(false);
    var call = action === 'create' ? SHEET.create(tab, payload)
      : action === 'update' ? SHEET.update(tab, payload)
        : SHEET.remove(tab, payload);
    return call.then(function () { return true; }).catch(function (err) {
      var msg = String(err && err.message || err);
      if (/no tab named/i.test(msg)) {
        missingTabs[tab] = true;
        syncState = 'no-tab';
        subscribers.forEach(function (fn) { try { fn(); } catch (e) {} });
      } else if (window.toast) {
        toast('Sheet save failed — kept locally. ' + msg, 'warn');
      }
      return false;
    });
  }

  // Re-try the Sheet after the backend has been redeployed.
  function retrySheet() {
    missingTabs = {};
    syncState = 'idle';
    return sync().then(function (ok) {
      if (!ok) return false;
      // replay everything we hold locally so the Sheet catches up
      var jobs = [];
      unis.forEach(function (u) { jobs.push(push(UNI_TAB, 'create', toRow(u, UNI_FIELDS))); });
      profs.forEach(function (p) { jobs.push(push(PROF_TAB, 'create', toRow(p, PROF_FIELDS))); });
      return Promise.all(jobs).then(function () { return sync(); });
    });
  }
  function toRow(obj, fields) {
    var r = {}; fields.forEach(function (k) { r[k] = obj[k] == null ? '' : obj[k]; }); return r;
  }

  /* ---------- reads ---------- */
  function unisFor(country) { return unis.filter(function (u) { return u.country === country; }); }
  function profsFor(uniId) { return profs.filter(function (p) { return p.uniId === uniId; }); }
  function profsForCountry(country) {
    var ids = {};
    unisFor(country).forEach(function (u) { ids[u.id] = 1; });
    return profs.filter(function (p) { return ids[p.uniId]; });
  }
  function uniById(id) { return unis.find(function (u) { return u.id === id; }); }
  function profById(id) { return profs.find(function (p) { return p.id === id; }); }

  function needsFollowUp(p) {
    if (p.status !== 'Emailed') return false;
    if (p.responseList && p.responseList.length) return false;
    var d = daysSince(p.emailedOn);
    return d !== null && d >= FOLLOWUP_DAYS;
  }

  function stats(country) {
    var list = country ? profsForCountry(country) : profs;
    var contacted = list.filter(function (p) { return p.status !== 'Not contacted'; }).length;
    var replied = list.filter(function (p) {
      return p.status === 'Replied' || p.status === 'Positive' || p.status === 'Negative' ||
        (p.responseList && p.responseList.length);
    }).length;
    var positive = list.filter(function (p) { return p.status === 'Positive'; }).length;
    return {
      unis: country ? unisFor(country).length : unis.length,
      profs: list.length,
      contacted: contacted,
      replied: replied,
      positive: positive,
      awaiting: list.filter(function (p) { return p.status === 'Emailed'; }).length,
      followUp: list.filter(needsFollowUp).length,
      replyRate: contacted ? Math.round(replied / contacted * 100) : 0
    };
  }

  /* ---------- writes ---------- */
  function addUni(rec) {
    var u = normUni(Object.assign({ id: uuid() }, rec));
    unis.push(u); emit();
    push(UNI_TAB, 'create', toRow(u, UNI_FIELDS));
    return u;
  }
  function updateUni(id, rec) {
    var u = uniById(id); if (!u) return null;
    Object.assign(u, normUni(Object.assign({}, u, rec, { id: id })));
    // keep the denormalized name on child rows in step
    profsFor(id).forEach(function (p) {
      if (p.uniName !== u.name) { p.uniName = u.name; push(PROF_TAB, 'update', toRow(p, PROF_FIELDS)); }
    });
    emit();
    push(UNI_TAB, 'update', toRow(u, UNI_FIELDS));
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
  function addProf(rec) {
    var u = uniById(rec.uniId);
    var p = normProf(Object.assign({ id: uuid(), uniName: u ? u.name : '' }, rec));
    profs.push(p); emit();
    push(PROF_TAB, 'create', toRow(p, PROF_FIELDS));
    return p;
  }
  function updateProf(id, rec) {
    var p = profById(id); if (!p) return null;
    var merged = Object.assign({}, p, rec, { id: id });
    merged.responses = rec.responseList ? serializeResponses(rec.responseList) : p.responses;
    Object.assign(p, normProf(merged));
    emit();
    push(PROF_TAB, 'update', toRow(p, PROF_FIELDS));
    return p;
  }
  function removeProf(id) {
    profs = profs.filter(function (p) { return p.id !== id; });
    emit();
    push(PROF_TAB, 'delete', id);
  }
  function addResponse(profId, text, date) {
    var p = profById(profId); if (!p) return null;
    var list = (p.responseList || []).slice();
    list.push({ date: date || today(), text: text });
    var next = { responseList: list };
    // first reply logged -> move the pipeline forward automatically
    if (p.status === 'Emailed' || p.status === 'Not contacted') next.status = 'Replied';
    return updateProf(profId, next);
  }
  function removeResponse(profId, idx) {
    var p = profById(profId); if (!p) return null;
    var list = (p.responseList || []).slice();
    list.splice(idx, 1);
    return updateProf(profId, { responseList: list });
  }
  function markEmailed(profId) {
    return updateProf(profId, { status: 'Emailed', emailedOn: today() });
  }

  /* ---------- CSV export ---------- */
  function csvCell(v) {
    var s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function exportCsv(country) {
    var list = country ? profsForCountry(country) : profs;
    var head = ['University', 'Website', 'Course', 'Location', 'Professor', 'Title', 'Email', 'Mobile', 'Research', 'Status', 'Emailed On', 'Responses', 'Notes'];
    var rows = list.map(function (p) {
      var u = uniById(p.uniId) || {};
      return [u.name || p.uniName, u.website, u.course, u.location, p.name, p.title, p.email, p.mobile,
        p.research, p.status, p.emailedOn,
      (p.responseList || []).map(function (r) { return r.date + ' ' + r.text; }).join(' ; '), p.notes];
    });
    var csv = [head].concat(rows).map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'outreach-' + (country || 'all') + '-' + today() + '.csv';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---------- boot: hydrate from cache, then reconcile with the Sheet ---------- */
  unis = lsGet(LS_UNI, []).map(normUni);
  profs = lsGet(LS_PROF, []).map(normProf);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { sync(); });
  else sync();

  return {
    UNI_STATUS: UNI_STATUS, PROF_STATUS: PROF_STATUS, FOLLOWUP_DAYS: FOLLOWUP_DAYS,
    onChange: onChange, sync: sync, retrySheet: retrySheet,
    syncState: function () { return syncState; }, tabMissing: tabMissing,
    unisFor: unisFor, profsFor: profsFor, profsForCountry: profsForCountry,
    uniById: uniById, profById: profById,
    addUni: addUni, updateUni: updateUni, removeUni: removeUni,
    addProf: addProf, updateProf: updateProf, removeProf: removeProf,
    addResponse: addResponse, removeResponse: removeResponse, markEmailed: markEmailed,
    needsFollowUp: needsFollowUp, daysSince: daysSince, stats: stats,
    exportCsv: exportCsv, today: today
  };
})();
