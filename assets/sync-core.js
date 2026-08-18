/* ============================================================
   sync-core.js — one correct offline-first sync engine, shared by
   every row-based store (papers, universities, professors).

   Why this exists
   ---------------
   Each store used to do `rows = remote` on sync. That destroys any
   row the Sheet has not accepted yet — an edit made offline, a
   create whose request failed, or anything written while a slow
   Apps Script round-trip was still in flight. Creating an empty tab
   was enough to erase everything held locally.

   Guarantees here
   ---------------
   1. Nothing is dropped. A local row the remote does not have is
      kept and re-queued for upload, never deleted.
   2. A local edit outranks the remote copy until it is confirmed
      pushed, so a stale server value can't clobber fresh input.
   3. Deletes are explicit. Only a row you actually deleted goes
      away, tracked by a tombstone so a merge can't resurrect it.
   4. Failed writes stay queued (in localStorage, so they survive a
      reload) and retry on the next sync, on reconnect, and on a
      timer.
   5. localStorage always holds the newest state, so the first paint
      is instant and never waits on the network.
   ============================================================ */
window.SyncCore = (function () {
  'use strict';

  function create(cfg) {
    var TAB = cfg.tab;
    var FIELDS = cfg.fields;
    var norm = cfg.norm;
    var CK = 'sc_rows_' + cfg.key;      // cached rows
    var OK_ = 'sc_out_' + cfg.key;      // outbox
    var TK = 'sc_tomb_' + cfg.key;      // tombstones

    var rows = [];
    var outbox = {};      // id -> 'create' | 'update'
    var tombs = {};       // id -> true (deleted locally, not yet confirmed)
    var subs = [];
    var state = 'idle';   // idle | syncing | ok | offline | no-tab
    var timer = null;
    var settled = null;   // resolves after the first sync attempt finishes

    /* ---------- persistence ---------- */
    function readJSON(k, fb) {
      try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; }
      catch (e) { return fb; }
    }
    function persist() {
      try {
        localStorage.setItem(CK, JSON.stringify(rows.map(row)));
        localStorage.setItem(OK_, JSON.stringify(outbox));
        localStorage.setItem(TK, JSON.stringify(tombs));
      } catch (e) {}
    }
    function row(o) { var r = {}; FIELDS.forEach(function (k) { r[k] = o[k] == null ? '' : o[k]; }); return r; }

    function notify() { subs.forEach(function (f) { try { f(); } catch (e) {} }); }
    function emit() { persist(); notify(); }
    function onChange(f) { subs.push(f); }

    /* ---------- Sheet ---------- */
    function usable() { return window.SHEET && SHEET.configured(); }
    function isNoTab(err) { return /no tab named/i.test(String(err && err.message)); }

    function sync() {
      if (!usable()) { state = 'offline'; notify(); return Promise.resolve(false); }
      state = 'syncing';
      return SHEET.get(TAB).then(function (remote) {
        merge(remote || []);
        state = 'ok';
        emit();
        flush();
        return true;
      }).catch(function (err) {
        state = isNoTab(err) ? 'no-tab' : 'offline';
        notify();
        return false;
      });
    }

    /* The merge that makes data loss impossible. */
    function merge(remote) {
      var seen = {};
      var next = [];

      remote.forEach(function (r) {
        if (!r || !r.id) return;
        var id = String(r.id);
        seen[id] = true;
        // A row we deleted is still listed, so the delete did not take.
        // Re-arm it — but only a few times. Giving up leaves an extra row
        // on the Sheet, which is strictly safer than a stuck tombstone
        // quietly deleting a legitimate row over and over.
        if (tombs[id]) {
          var tries = (typeof tombs[id] === 'number' ? tombs[id] : 0) + 1;
          if (tries > 3) { delete tombs[id]; next.push(norm(r)); return; }
          tombs[id] = tries;
          return;
        }
        var mine = byId(id);
        // Unpushed local edit beats the older remote copy.
        if (mine && outbox[id]) { next.push(mine); return; }
        next.push(norm(r));
      });

      // Local rows the Sheet has never seen: keep them and make sure they
      // are queued, so a failed or in-flight create is not silently lost.
      rows.forEach(function (l) {
        if (seen[l.id] || tombs[l.id]) return;
        next.push(l);
        if (!outbox[l.id]) outbox[l.id] = 'create';
      });

      // Tombstones for rows the remote no longer lists have done their job.
      Object.keys(tombs).forEach(function (id) { if (!seen[id]) delete tombs[id]; });

      rows = next;
    }

    /* ---------- outbox ---------- */
    function schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { timer = null; flush(); }, 900);
    }

    function flush() {
      if (!usable() || state === 'no-tab') return Promise.resolve(false);
      var jobs = [];

      Object.keys(tombs).forEach(function (id) {
        // 'pending' = not sent yet; a number = re-armed after a sync still
        // saw the row. Anything else is already sent and awaiting proof.
        if (tombs[id] !== 'pending' && typeof tombs[id] !== 'number') return;
        var attempt = typeof tombs[id] === 'number' ? tombs[id] : 0;
        jobs.push(SHEET.remove(TAB, id).then(function () {
          tombs[id] = true; persist();          // held until a sync confirms
        }).catch(function (err) {
          if (isNoTab(err)) { state = 'no-tab'; notify(); return; }
          // Row already gone is a success for our purposes.
          if (/id not found/i.test(String(err && err.message))) { delete tombs[id]; persist(); return; }
          tombs[id] = attempt;                  // keep for the next attempt
        }));
      });

      Object.keys(outbox).forEach(function (id) {
        var r = byId(id);
        if (!r) { delete outbox[id]; return; }
        var verb = outbox[id];
        var call = verb === 'create' ? SHEET.create(TAB, row(r)) : SHEET.update(TAB, row(r));
        jobs.push(call.then(function () {
          delete outbox[id]; persist();
        }).catch(function (err) {
          if (isNoTab(err)) { state = 'no-tab'; notify(); return; }
          // Only switch verb when the backend actually says the row is not
          // there. Falling back to create on a transient failure would append
          // a second copy of a row that already exists.
          if (verb === 'update' && /id not found/i.test(String(err && err.message))) {
            return SHEET.create(TAB, row(r)).then(function () { delete outbox[id]; persist(); }).catch(function () {});
          }
          // Anything else stays queued and is retried on the next flush.
        }));
      });

      if (!jobs.length) return Promise.resolve(true);
      return Promise.all(jobs).then(function () { persist(); return true; });
    }

    /* ---------- reads ---------- */
    function all() { return rows.slice(); }
    function byId(id) { return rows.find(function (r) { return String(r.id) === String(id); }); }

    /* ---------- writes ---------- */
    function add(rec) {
      var r = norm(rec);
      rows.push(r);
      outbox[r.id] = 'create';
      delete tombs[r.id];
      emit();
      schedule();
      return r;
    }
    function update(id, rec) {
      var r = byId(id); if (!r) return null;
      Object.assign(r, norm(Object.assign({}, row(r), rec, { id: id })));
      if (outbox[id] !== 'create') outbox[id] = 'update';
      emit();
      schedule();
      return r;
    }
    function remove(id) {
      var had = byId(id);
      rows = rows.filter(function (r) { return String(r.id) !== String(id); });
      delete outbox[id];
      if (had) tombs[id] = 'pending';
      emit();
      schedule();
    }
    /* Replace the whole set (used by the one-time seed). */
    function replaceAll(list) {
      rows = list.map(norm);
      rows.forEach(function (r) { outbox[r.id] = 'create'; });
      emit();
      schedule();
      return rows.slice();
    }

    function retry() {
      state = 'idle';
      return sync().then(function (ok) { return ok ? flush().then(function () { return true; }) : false; });
    }

    /* ---------- boot ---------- */
    rows = readJSON(CK, []).map(norm);
    outbox = readJSON(OK_, {});
    tombs = readJSON(TK, {});

    function start() { settled = sync(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();

    window.addEventListener('online', function () { if (state !== 'no-tab') sync(); });
    // Anything left queued (a failed push, an edit made offline) keeps trying.
    setInterval(function () {
      if (state !== 'no-tab' && (Object.keys(outbox).length || Object.keys(tombs).length)) flush();
    }, 60000);

    return {
      TAB: TAB, HEADERS: FIELDS,
      all: all, byId: byId, rows: function () { return rows; },
      add: add, update: update, remove: remove, replaceAll: replaceAll,
      sync: sync, retry: retry, flush: flush,
      onChange: onChange, emit: emit, notify: notify,
      state: function () { return state; },
      setState: function (s) { state = s; },
      pending: function () { return Object.keys(outbox).length + Object.keys(tombs).length; },
      whenSettled: function () { return settled || Promise.resolve(false); }
    };
  }

  return { create: create };
})();
