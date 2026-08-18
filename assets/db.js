/* ============================================================
   db.js — cross-device state store backed by the Google Sheet.

   Everything the dashboard remembers (document checkboxes, paper
   outcomes, manual entries, programme statuses) lives here, so
   opening the site on another device shows the same state.

   How it works
   ------------
   • One Sheet tab, "AppState", with two columns: id | value.
     Each id is a state key; value is its JSON.
   • localStorage is a cache, not the source of truth. It exists so
     the first paint is instant and so edits survive being offline.
   • On boot: paint from cache, fetch the Sheet, then reconcile.
     The Sheet wins for any key it holds — that is what makes a
     second device see the first device's edits.
   • Writes go to memory + cache immediately, then to the Sheet
     debounced. Anything that fails to send is queued and retried.

   Load this BEFORE the page's own script so DB.load() is available
   during first render.
   ============================================================ */
window.DB = (function () {
  'use strict';

  var TAB = 'AppState';
  var CACHE = 'db_cache';
  var QUEUE = 'db_queue';

  var mem = {};          // key -> parsed value
  var dirty = {};        // keys not yet confirmed on the Sheet
  var known = {};        // keys the Sheet already has a row for
  var subs = [];
  var state = 'idle';    // idle | syncing | ok | offline | no-tab
  var timer = null;
  var loaded = false;

  function notify() { subs.forEach(function (f) { try { f(); } catch (e) {} }); }
  function onChange(f) { subs.push(f); }

  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function writeCache() {
    try { localStorage.setItem(CACHE, JSON.stringify(mem)); } catch (e) {}
  }
  function readQueue() {
    try { return JSON.parse(localStorage.getItem(QUEUE) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function writeQueue() {
    try { localStorage.setItem(QUEUE, JSON.stringify(dirty)); } catch (e) {}
  }

  /* ---------- public read / write ---------- */
  function load(key, fallback) {
    if (!(key in mem) || mem[key] == null) return fallback;
    return mem[key];
  }
  function save(key, val) {
    mem[key] = val;
    dirty[key] = true;
    writeCache();
    writeQueue();
    schedule();
  }

  /* ---------- Sheet plumbing ---------- */
  function sheetOn() { return window.SHEET && SHEET.configured(); }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 700);
  }

  function flush() {
    timer = null;
    if (!sheetOn() || state === 'no-tab') return;
    var keys = Object.keys(dirty);
    if (!keys.length) return;
    // Apps Script round-trips are slow (seconds), so pick create vs update
    // from what the last pull saw rather than always trying both.
    keys.forEach(function (k) {
      var payload = { id: k, value: JSON.stringify(mem[k]) };
      var first = known[k] ? SHEET.update(TAB, payload) : SHEET.create(TAB, payload);
      first.then(function () {
        known[k] = true;
        delete dirty[k]; writeQueue();
      }).catch(function (err) {
        if (/no tab named/i.test(String(err && err.message))) { state = 'no-tab'; notify(); return; }
        // Wrong guess (row missing, or already present) — try the other verb once.
        var other = known[k] ? SHEET.create(TAB, payload) : SHEET.update(TAB, payload);
        return other.then(function () {
          known[k] = true;
          delete dirty[k]; writeQueue();
        }).catch(function () { /* stays dirty; retried on the next flush */ });
      });
    });
  }

  function pull() {
    if (!sheetOn()) { state = 'offline'; notify(); return Promise.resolve(false); }
    state = 'syncing';
    return SHEET.get(TAB).then(function (rows) {
      rows.forEach(function (r) {
        if (!r.id) return;
        known[r.id] = true;
        // A key edited here but not yet pushed must not be clobbered by the
        // older value still sitting on the Sheet.
        if (dirty[r.id]) return;
        try { mem[r.id] = JSON.parse(r.value); }
        catch (e) { mem[r.id] = r.value; }
      });
      writeCache();
      state = 'ok';
      loaded = true;
      notify();
      flush();               // push anything queued while we were away
      return true;
    }).catch(function (err) {
      state = /no tab named/i.test(String(err && err.message)) ? 'no-tab' : 'offline';
      notify();
      return false;
    });
  }

  /* Verify the tab exists AND has a header row. The backend maps a record
     onto column names, so a tab with no headers accepts writes and stores
     nothing — which would look like success while silently losing data. */
  function verify() {
    if (!sheetOn()) { state = 'offline'; notify(); return Promise.resolve('offline'); }
    var probe = { id: '__db_probe__', value: '1' };
    return SHEET.create(TAB, probe).then(function () {
      return SHEET.get(TAB);
    }).then(function (rows) {
      var landed = rows.some(function (r) { return String(r.id) === '__db_probe__'; });
      return SHEET.remove(TAB, '__db_probe__').catch(function () {}).then(function () {
        state = landed ? 'ok' : 'no-headers';
        notify();
        return state;
      });
    }).catch(function (err) {
      state = /no tab named/i.test(String(err && err.message)) ? 'no-tab' : 'offline';
      notify();
      return state;
    });
  }

  function retry() {
    return verify().then(function (st) {
      if (st !== 'ok') return false;
      return pull().then(function (ok) { if (ok) flush(); return ok; });
    });
  }

  /* ---------- boot ---------- */
  mem = readCache();
  dirty = readQueue();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { pull(); });
  else pull();
  // Coming back online is the moment queued edits should go out.
  window.addEventListener('online', function () { if (state !== 'no-tab') pull(); });

  return {
    HEADERS: ['id', 'value'],
    TAB: TAB,
    load: load, save: save,
    onChange: onChange, pull: pull, retry: retry, verify: verify,
    state: function () { return state; },
    isLoaded: function () { return loaded; },
    pendingCount: function () { return Object.keys(dirty).length; }
  };
})();
