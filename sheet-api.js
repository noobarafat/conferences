/* ============================================================
   Shared Google Sheet API layer for all dashboard pages.
   Fill API_URL + API_TOKEN after deploying gsheet/Code.gs.
   ============================================================ */
window.SHEET = (function () {
  // Paste your Apps Script Web App /exec URL here:
  var API_URL   = 'https://script.google.com/macros/s/AKfycby905WIjM4KUB4jrv3jTKDVvoS6zEN2dYrKv7mWpWPgXqXMoWq_J60Iz5mdcLp57AF3/exec';
  // Must match API_TOKEN in Code.gs (only needed for editing):
  var API_TOKEN = 'edudash_7Kq9mZ2pR4vX8nL3bW6tY1cH5jF0sA';

  // Admin can supply the token at runtime instead of baking it in.
  var runtimeToken = null;
  try {
    runtimeToken = sessionStorage.getItem('sheet_token') || null;
  } catch (e) {}

  function setToken(t) {
    runtimeToken = t || null;
    try {
      if (t) sessionStorage.setItem('sheet_token', t);
      else sessionStorage.removeItem('sheet_token');
    } catch (e) {}
  }
  function token() { return runtimeToken || API_TOKEN; }
  function hasToken() { return !!(runtimeToken || (API_TOKEN.indexOf('CHANGE_ME') !== 0)); }

  function configured() {
    return API_URL.indexOf('http') === 0;
  }

  // Read one tab -> array of row objects.
  async function get(sheetName) {
    if (!configured()) throw new Error('SHEET API_URL not set');
    var res = await fetch(API_URL + '?sheet=' + encodeURIComponent(sheetName), {
      method: 'GET'
    });
    var data = await res.json();
    if (!data.ok) throw new Error(data.error || 'read failed');
    return data.rows;
  }

  // Read every tab -> { tabName: [...rows] }.
  async function getAll() {
    if (!configured()) throw new Error('SHEET API_URL not set');
    var res = await fetch(API_URL, { method: 'GET' });
    var data = await res.json();
    if (!data.ok) throw new Error(data.error || 'read failed');
    return data.sheets;
  }

  // text/plain avoids CORS preflight (Apps Script can't answer OPTIONS).
  async function write(action, sheetName, payload) {
    if (!configured()) throw new Error('SHEET API_URL not set');
    var body = { token: token(), action: action, sheet: sheetName };
    if (action === 'delete') body.id = payload;
    else body.record = payload;
    var res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    });
    var data = await res.json();
    if (!data.ok) throw new Error(data.error || 'write failed');
    return data;
  }

  return {
    configured: configured,
    setToken: setToken,
    hasToken: hasToken,
    get: get,
    getAll: getAll,
    create: function (sheet, record) { return write('create', sheet, record); },
    update: function (sheet, record) { return write('update', sheet, record); },
    remove: function (sheet, id)     { return write('delete', sheet, id); }
  };
})();
