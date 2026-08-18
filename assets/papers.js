/* ============================================================
   papers.js — the single source of truth for every paper.

   One record per paper. Everything on the Research tab (stats,
   published grid, in-progress list, the papers modal, the
   "Submitted · N papers" block on each conference card) and the
   Overview tiles derive from this store, so a change made anywhere
   shows up everywhere.

   Persistence and offline behaviour come from SyncCore: local
   changes are never dropped, failed uploads retry, and the cache
   is always current so the page paints instantly.
   ============================================================ */
window.PAPERS = (function () {
  'use strict';

  var FIELDS = ['id', 'title', 'venue', 'status', 'link', 'year', 'date', 'notes'];
  var STATUS = ['Writing', 'Submitted', 'Under Review', 'Accepted', 'Published', 'Rejected'];
  // Statuses that mean "this paper is with a conference right now".
  var LIVE = ['Submitted', 'Under Review', 'Accepted'];

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

  var core = SyncCore.create({ key: 'papers', tab: 'Papers', fields: FIELDS, norm: norm });

  /* ---------- reads ---------- */
  function all() { return core.all(); }
  function published() { return core.rows().filter(function (p) { return p.status === 'Published'; }); }
  function inProgress() { return core.rows().filter(function (p) { return p.status !== 'Published'; }); }
  function forVenue(venue) {
    var v = String(venue || '').trim().toLowerCase();
    if (!v) return [];
    return core.rows().filter(function (p) {
      return String(p.venue || '').trim().toLowerCase() === v && LIVE.indexOf(p.status) !== -1;
    });
  }
  function counts() {
    var c = {};
    STATUS.forEach(function (s) { c[s] = 0; });
    core.rows().forEach(function (p) { if (c[p.status] != null) c[p.status]++; });
    c.total = core.rows().length;
    c.live = core.rows().filter(function (p) { return LIVE.indexOf(p.status) !== -1; }).length;
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
  function add(rec) { return core.add(Object.assign({ id: uuid() }, rec)); }
  function setField(id, key, value) {
    var p = core.byId(id);
    if (!p || p[key] === value) return p;
    var patch = {}; patch[key] = value;
    return core.update(id, patch);
  }

  /* A stable id derived from the title, so re-running the seed lands on the
     same rows instead of creating a second copy of everything. */
  function seedId(title) {
    var s = String(title || '').trim().toLowerCase();
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return 'seed-' + h.toString(36);
  }

  /* ---------- one-time seed from the old hardcoded lists ----------
     Waits for the first sync to settle: on a device that already has papers
     on the Sheet, seeding before that answer would duplicate all of them. */
  function seed(seedRows) {
    if (!seedRows || !seedRows.length) return Promise.resolve(false);
    return core.whenSettled().then(function () {
      if (core.rows().length) return dedupe();                    // real data exists
      if (window.DB && DB.load('papers_seeded', false)) return false;
      core.replaceAll(seedRows.map(function (r) {
        return Object.assign({}, r, { id: seedId(r.title) });
      }));
      if (window.DB) DB.save('papers_seeded', true);
      return true;
    });
  }

  /* Collapse rows that share a title. Fields are merged rather than dropped,
     so nothing typed on either copy is lost — only the redundant row goes.
     Runs only against a settled view: with uploads still in flight the row
     set is mid-change and a "duplicate" may just be a row about to vanish. */
  function dedupe(force) {
    if (!force && (core.state() !== 'ok' || core.pending() > 0)) return false;
    var groups = {};
    core.rows().forEach(function (p) {
      var k = String(p.title || '').trim().toLowerCase();
      if (!k) return;
      (groups[k] = groups[k] || []).push(p);
    });
    var removed = 0;
    Object.keys(groups).forEach(function (k) {
      var g = groups[k];
      if (g.length < 2) return;
      // Keep whichever row carries the most information.
      var filled = function (p) { return FIELDS.filter(function (f) { return f !== 'id' && p[f]; }).length; };
      g.sort(function (a, b) { return filled(b) - filled(a); });
      var keep = g[0], patch = {};
      g.slice(1).forEach(function (dup) {
        FIELDS.forEach(function (f) {
          if (f === 'id') return;
          if (!keep[f] && dup[f]) patch[f] = dup[f];
        });
      });
      if (Object.keys(patch).length) core.update(keep.id, patch);
      g.slice(1).forEach(function (dup) { core.remove(dup.id); removed++; });
    });
    if (removed && window.toast) toast('Merged ' + removed + ' duplicate paper row(s)', 'ok');
    return removed > 0;
  }

  /* Self-heal: collapse duplicate titles, then re-add any seed paper that
     is missing. Stable seed ids plus the title check make it idempotent, so
     it can be run any number of times. Exposed for the Repair action. */
  function repair(seedRows) {
    return core.sync().then(function () {
      dedupe(true);
      var have = {};
      core.rows().forEach(function (p) { have[String(p.title || '').trim().toLowerCase()] = true; });
      var missing = (seedRows || []).filter(function (r) {
        return !have[String(r.title || '').trim().toLowerCase()];
      });
      missing.forEach(function (r) { core.add(Object.assign({}, r, { id: seedId(r.title) })); });
      return { restored: missing.length, total: core.rows().length };
    });
  }

  return {
    TAB: core.TAB, HEADERS: FIELDS, STATUS: STATUS, LIVE: LIVE,
    repair: repair,
    onChange: core.onChange, sync: core.sync, retrySheet: core.retry, flush: core.flush,
    state: core.state, pending: core.pending, whenSettled: core.whenSettled,
    all: all, byId: core.byId, published: published, inProgress: inProgress,
    forVenue: forVenue, counts: counts, indexOf: indexOf, isIndexed: isIndexed,
    add: add, update: core.update, setField: setField, remove: core.remove,
    seed: seed, dedupe: dedupe
  };
})();
