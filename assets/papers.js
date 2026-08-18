/* ============================================================
   papers.js — the single source of truth for every paper.

   Before this, a paper existed in up to three disconnected places:
   a hardcoded conference→titles map, a hardcoded published list,
   and a separate user-added list — so moving a paper from
   "Under Review" to "Published" meant editing it in two places and
   the conference card still showed the old state.

   Now there is one record per paper. Everything on the Research
   tab (stats, published grid, in-progress list, the papers modal,
   the "Submitted · N papers" block on each conference card) and
   the Overview tiles derive from this store, so a change made
   anywhere shows up everywhere.

   Storage: Sheet tab "Papers", one row per paper, with
   localStorage as the instant-paint cache (same pattern as
   outreach.js / db.js).
   ============================================================ */
window.PAPERS = (function () {
  'use strict';

  var TAB = 'Papers';
  var LS = 'papers_cache';
  var FIELDS = ['id', 'title', 'venue', 'status', 'link', 'year', 'date', 'notes'];

  var STATUS = ['Writing', 'Submitted', 'Under Review', 'Accepted', 'Published', 'Rejected'];
  // Statuses that mean "this paper is with a conference right now".
  var LIVE = ['Submitted', 'Under Review', 'Accepted'];

  var rows = [];
  var subs = [];
  var state = 'idle';     // idle | syncing | ok | offline | no-tab
  var dirty = {};
  var timer = null;

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function norm(r) {
    var o = {};
    FIELDS.forEach(function (k) { o[k] = r[k] == null ? '' : String(r[k]); });
    if (!o.id) o.id = uuid();
    if (STATUS.indexOf(o.status) === -1) o.status = 'Under Review';
    return o;
  }
  function rowOf(p) { var r = {}; FIELDS.forEach(function (k) { r[k] = p[k] == null ? '' : p[k]; }); return r; }

  function cache() { try { localStorage.setItem(LS, JSON.stringify(rows)); } catch (e) {} }
  function emit() { cache(); subs.forEach(function (f) { try { f(); } catch (e) {} }); }
  function notify() { subs.forEach(function (f) { try { f(); } catch (e) {} }); }
  function onChange(f) { subs.push(f); }

  /* ---------- Sheet ---------- */
  function sheetOn() { return window.SHEET && SHEET.configured() && state !== 'no-tab'; }
  function flagNoTab(err) {
    if (/no tab named/i.test(String(err && err.message))) { state = 'no-tab'; notify(); return true; }
    return false;
  }

  function sync() {
    if (!(window.SHEET && SHEET.configured())) { state = 'offline'; notify(); return Promise.resolve(false); }
    state = 'syncing';
    return SHEET.get(TAB).then(function (remote) {
      rows = remote.map(norm);
      state = 'ok';
      emit();
      return true;
    }).catch(function (err) {
      if (!flagNoTab(err)) { state = 'offline'; notify(); }
      return false;
    });
  }

  function push(action, payload) {
    if (!sheetOn()) return Promise.resolve(false);
    var call = action === 'create' ? SHEET.create(TAB, payload)
      : action === 'update' ? SHEET.update(TAB, payload)
        : SHEET.remove(TAB, payload);
    return call.then(function () { return true; }).catch(function (err) { flagNoTab(err); return false; });
  }

  /* Debounced so editing a title does not fire one request per keystroke. */
  function queue(p) {
    dirty[p.id] = p;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      var batch = dirty; dirty = {};
      Object.keys(batch).forEach(function (k) { push('update', rowOf(batch[k])); });
    }, 800);
  }

  /* ---------- reads ---------- */
  function all() { return rows.slice(); }
  function byId(id) { return rows.find(function (p) { return p.id === id; }); }
  function published() { return rows.filter(function (p) { return p.status === 'Published'; }); }
  function inProgress() { return rows.filter(function (p) { return p.status !== 'Published'; }); }
  /* Papers currently sitting with a given conference. */
  function forVenue(venue) {
    var v = String(venue || '').trim().toLowerCase();
    if (!v) return [];
    return rows.filter(function (p) {
      return String(p.venue || '').trim().toLowerCase() === v && LIVE.indexOf(p.status) !== -1;
    });
  }
  function counts() {
    var c = {};
    STATUS.forEach(function (s) { c[s] = 0; });
    rows.forEach(function (p) { if (c[p.status] != null) c[p.status]++; });
    c.total = rows.length;
    c.live = rows.filter(function (p) { return LIVE.indexOf(p.status) !== -1; }).length;
    return c;
  }

  /* Which index a published paper lives in, derived from its link. */
  function indexOf(link) {
    link = String(link || '');
    if (/ieeexplore\.ieee\.org/.test(link)) return { cls: 'idx-ieee', accent: '#4fa8e8', label: 'IEEE Xplore', ico: '⚡' };
    if (/link\.springer\.com/.test(link)) return { cls: 'idx-springer', accent: '#f5c518', label: 'Springer', ico: '📗' };
    if (/books\.google\.com|atlantis-press/.test(link)) return { cls: 'idx-atlantis', accent: '#2ecc8a', label: 'Atlantis Press', ico: '📘' };
    return { cls: 'idx-rg', accent: '#7c5cfc', label: 'ResearchGate', ico: '🎓' };
  }
  function isIndexed(p) { return indexOf(p.link).cls !== 'idx-rg'; }

  /* ---------- writes ---------- */
  function add(rec) {
    var p = norm(Object.assign({ id: uuid() }, rec));
    rows.push(p);
    emit();
    push('create', rowOf(p));
    return p;
  }
  function update(id, rec) {
    var p = byId(id); if (!p) return null;
    Object.assign(p, norm(Object.assign({}, rowOf(p), rec, { id: id })));
    emit();
    push('update', rowOf(p));
    return p;
  }
  /* Used by inline controls — saves locally at once, pushes debounced. */
  function setField(id, key, value) {
    var p = byId(id); if (!p || p[key] === value) return p;
    p[key] = value;
    emit();
    queue(p);
    return p;
  }
  function remove(id) {
    rows = rows.filter(function (p) { return p.id !== id; });
    emit();
    push('delete', id);
  }

  /* ---------- one-time seed from the old hardcoded lists ---------- */
  function seed(seedRows) {
    if (!seedRows || !seedRows.length) return Promise.resolve(false);
    if (rows.length) return Promise.resolve(false);          // never overwrite real data
    if (window.DB && DB.load('papers_seeded', false)) return Promise.resolve(false);
    rows = seedRows.map(function (r) { return norm(Object.assign({ id: uuid() }, r)); });
    emit();
    if (window.DB) DB.save('papers_seeded', true);
    if (!sheetOn()) return Promise.resolve(true);
    return Promise.all(rows.map(function (p) { return push('create', rowOf(p)); })).then(function () { return true; });
  }

  function retrySheet() {
    state = 'idle';
    if (!(window.SHEET && SHEET.configured())) { state = 'offline'; notify(); return Promise.resolve(false); }
    var local = rows.slice();
    return SHEET.get(TAB).then(function (remote) {
      var have = {};
      remote.forEach(function (r) { have[r.id] = 1; });
      var jobs = local.filter(function (p) { return !have[p.id]; }).map(function (p) { return push('create', rowOf(p)); });
      return Promise.all(jobs).then(function () { return sync(); });
    }).catch(function (err) {
      if (!flagNoTab(err)) { state = 'offline'; notify(); }
      return false;
    });
  }

  /* ---------- boot ---------- */
  try {
    var c = JSON.parse(localStorage.getItem(LS) || '[]');
    if (Array.isArray(c)) rows = c.map(norm);
  } catch (e) { rows = []; }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { sync(); });
  else sync();

  return {
    TAB: TAB, HEADERS: FIELDS, STATUS: STATUS, LIVE: LIVE,
    onChange: onChange, sync: sync, retrySheet: retrySheet,
    state: function () { return state; },
    all: all, byId: byId, published: published, inProgress: inProgress,
    forVenue: forVenue, counts: counts, indexOf: indexOf, isIndexed: isIndexed,
    add: add, update: update, setField: setField, remove: remove, seed: seed
  };
})();
