/* ============================================================
   sync-status.js — the small chip in the header that says whether
   your data is safely on the Sheet.

   Three states worth distinguishing:
     Saved    every change has been accepted by the Sheet
     Saving   changes are queued or in flight (nothing is lost —
              the queue is on disk and retries by itself)
     Local    the Sheet is unreachable or not set up yet, so this
              device is holding everything for now
   ============================================================ */
(function () {
  'use strict';

  function stores() {
    var out = [];
    if (window.DB) out.push({ state: DB.state(), pending: DB.pendingCount() });
    if (window.PAPERS) out.push({ state: PAPERS.state(), pending: PAPERS.pending() });
    if (window.OUTREACH) out.push({ state: OUTREACH.syncState(), pending: OUTREACH.pending() });
    return out;
  }

  function render() {
    var chip = document.getElementById('sync-chip');
    if (!chip) return;
    var all = stores();
    if (!all.length) return;

    var pending = all.reduce(function (n, s) { return n + (s.pending || 0); }, 0);
    var blocked = all.some(function (s) { return s.state === 'no-tab' || s.state === 'no-headers'; });
    var offline = all.some(function (s) { return s.state === 'offline'; });
    var syncing = all.some(function (s) { return s.state === 'syncing'; });

    var cls, label, title;
    if (blocked) {
      cls = 'local'; label = 'Local';
      title = 'Saved on this device. Finish the Sheet setup in the banner to sync everywhere.';
    } else if (offline) {
      cls = 'local'; label = 'Offline';
      title = 'Sheet unreachable. ' + pending + ' change(s) queued on this device and will upload automatically.';
    } else if (syncing || pending) {
      cls = 'saving'; label = pending ? 'Saving ' + pending : 'Saving';
      title = 'Uploading to the Google Sheet. Nothing is lost if you close the page — the queue is saved and retries.';
    } else {
      cls = 'saved'; label = 'Saved';
      title = 'Every change is on the Google Sheet.';
    }
    chip.className = 'tool-btn sync-chip ' + cls;
    chip.innerHTML = '●<span>' + label + '</span>';
    chip.title = title;
  }

  function boot() {
    if (window.DB) DB.onChange(render);
    if (window.PAPERS) PAPERS.onChange(render);
    if (window.OUTREACH) OUTREACH.onChange(render);
    render();
    setInterval(render, 2000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
