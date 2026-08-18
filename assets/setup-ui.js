/* ============================================================
   setup-ui.js — one banner that gets the Google Sheet ready.

   The dashboard needs three tabs to be a real cross-device store:
     AppState     — checkbox / outcome / entry state (id | value)
     Universities — one row per university
     Professors   — one row per professor, linked by uniId

   The deployed Apps Script only creates tabs if it is running a
   current Code.gs. Rather than assume that, this banner detects
   exactly which tabs are missing and lets you create them by hand
   in about a minute, with the header row one click away.
   ============================================================ */
(function () {
  'use strict';

  var HOST_ID = 'db-setup';

  function tabsNeeded() {
    var out = [];
    if (window.DB) {
      var s = DB.state();
      if (s === 'no-tab' || s === 'no-headers') {
        out.push({ name: DB.TAB, headers: DB.HEADERS, why: 'checkboxes, paper outcomes and entries', state: s });
      }
    }
    if (window.OUTREACH && OUTREACH.HEADERS) {
      var os = OUTREACH.syncState();
      if (os === 'no-tab' || os === 'no-headers') {
        out.push({ name: 'Universities', headers: OUTREACH.HEADERS.Universities, why: 'universities you are applying to', state: os });
        out.push({ name: 'Professors', headers: OUTREACH.HEADERS.Professors, why: 'professor contacts and email updates', state: os });
      }
    }
    return out;
  }

  function render() {
    var host = document.getElementById(HOST_ID);
    if (!host) return;
    var need = tabsNeeded();

    if (!need.length) {
      var syncing = (window.DB && DB.state() === 'syncing');
      var offline = (window.DB && DB.state() === 'offline');
      host.innerHTML = offline
        ? '<div class="setup-bar offline"><span>⚠︎ Sheet unreachable — changes are saved on this device and will sync when it is back.</span>' +
          '<button class="mini-btn" data-setup="retry">Retry</button></div>'
        : (syncing ? '' : '');
      return;
    }

    var headerMissing = need.some(function (t) { return t.state === 'no-headers'; });
    host.innerHTML =
      '<div class="setup-bar">' +
        '<div class="setup-head">' +
          '<b>' + (headerMissing
            ? 'Almost there — a tab is missing its header row'
            : 'Finish the database setup to sync across devices') + '</b>' +
          '<span>Right now everything is saved on this device only. ' +
            'Add ' + need.length + ' tab' + (need.length === 1 ? '' : 's') + ' to your Google Sheet and it works everywhere.</span>' +
        '</div>' +
        '<ol class="setup-steps">' +
          '<li>In the Sheet, click <b>+</b> (bottom-left) and rename the new tab exactly as shown.</li>' +
          '<li>Click cell <b>A1</b> of that tab, press <b>Copy headers</b> here, then paste.</li>' +
          '<li>Repeat for each tab, then press <b>Verify &amp; sync</b>.</li>' +
        '</ol>' +
        '<div class="setup-tabs">' +
          need.map(function (t) {
            return '<div class="setup-tab">' +
              '<code class="setup-name">' + t.name + '</code>' +
              '<span class="setup-why">' + t.why + '</span>' +
              '<code class="setup-hdrs">' + t.headers.join('  ') + '</code>' +
              '<button class="mini-btn" data-setup="copy" data-hdr="' + t.headers.join('\t') + '">Copy headers</button>' +
            '</div>';
          }).join('') +
        '</div>' +
        '<div class="setup-foot">' +
          '<button class="btn" data-setup="verify">Verify &amp; sync</button>' +
          '<span>Or redeploy <code>backend/Code.gs</code> once (Extensions → Apps Script → paste → Deploy) ' +
            'and every tab is created automatically.</span>' +
        '</div>' +
      '</div>';
  }

  function onClick(e) {
    var el = e.target.closest('[data-setup]');
    if (!el) return;
    var act = el.dataset.setup;

    if (act === 'copy') {
      var hdr = el.dataset.hdr || '';
      if (navigator.clipboard) {
        navigator.clipboard.writeText(hdr)
          .then(function () { if (window.toast) toast('Header row copied — paste into A1', 'ok'); })
          .catch(function () { if (window.toast) toast('Copy blocked — select the text manually', 'warn'); });
      }
      return;
    }
    if (act === 'verify' || act === 'retry') {
      if (window.toast) toast('Checking the Sheet…');
      var jobs = [];
      if (window.DB) jobs.push(DB.retry());
      if (window.OUTREACH) jobs.push(OUTREACH.retrySheet());
      Promise.all(jobs).then(function () {
        var left = tabsNeeded();
        if (window.toast) {
          toast(left.length
            ? left.length + ' tab' + (left.length === 1 ? '' : 's') + ' still not ready'
            : 'Synced — your data is on the Google Sheet now', left.length ? 'warn' : 'ok');
        }
        render();
      });
    }
  }

  function boot() {
    if (!document.getElementById(HOST_ID)) {
      var d = document.createElement('div');
      d.id = HOST_ID;
      var nav = document.getElementById('tab-nav');
      if (nav && nav.parentNode) nav.parentNode.insertBefore(d, nav.nextSibling);
      else document.body.insertBefore(d, document.body.firstChild);
    }
    document.getElementById(HOST_ID).addEventListener('click', onClick);
    if (window.DB) DB.onChange(render);
    if (window.OUTREACH) OUTREACH.onChange(render);
    render();
    // states resolve a moment after boot, once both stores have answered
    setTimeout(render, 2500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
