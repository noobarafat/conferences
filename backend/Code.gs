/**
 * Generic Google Sheet CRUD backend for the Education Dashboard.
 * One Spreadsheet, many tabs (sheets). Each tab = one dataset.
 * Row 1 of every tab MUST be the header row. An "id" column is required
 * (auto-filled on create) so rows can be updated/deleted reliably.
 *
 * DEPLOY: Extensions > Apps Script, paste this file, Save.
 *   Deploy > New deployment > type "Web app"
 *   Execute as: Me | Who has access: Anyone
 *   Copy the /exec URL into sheet-api.js (API_URL).
 *
 * SECURITY: writes require the shared token below. Change it and mirror
 * the same value in sheet-api.js (API_TOKEN). Read (GET) is public.
 */

var API_TOKEN = 'edudash_7Kq9mZ2pR4vX8nL3bW6tY1cH5jF0sA';

function doGet(e) {
  try {
    var name = (e.parameter.sheet || '').trim();
    if (name === 'all' || name === '') {
      return json(readAll());
    }
    return json({ ok: true, sheet: name, rows: readSheet(name) });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    // Sent as text/plain to avoid CORS preflight; parse manually.
    var body = JSON.parse(e.postData.contents || '{}');
    if (body.token !== API_TOKEN) {
      return json({ ok: false, error: 'unauthorized' });
    }
    var action = body.action;
    var name = body.sheet;
    if (!name) return json({ ok: false, error: 'missing sheet' });

    if (action === 'create') return json(createRow(name, body.record));
    if (action === 'update') return json(updateRow(name, body.record));
    if (action === 'delete') return json(deleteRow(name, body.id));
    return json({ ok: false, error: 'unknown action: ' + action });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

/* ---------- helpers ---------- */

function ss() { return SpreadsheetApp.getActiveSpreadsheet(); }

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheetOrThrow(name) {
  var sh = ss().getSheetByName(name);
  if (!sh) throw new Error('no tab named "' + name + '"');
  return sh;
}

function headers(sh) {
  var last = sh.getLastColumn();
  if (last === 0) return [];
  return sh.getRange(1, 1, 1, last).getValues()[0].map(function (h) {
    return String(h).trim();
  });
}

function readSheet(name) {
  var sh = getSheetOrThrow(name);
  var hs = headers(sh);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  var values = sh.getRange(2, 1, lastRow - 1, hs.length).getValues();
  return values.map(function (row) {
    var obj = {};
    hs.forEach(function (h, i) { if (h) obj[h] = row[i]; });
    return obj;
  }).filter(function (obj) {
    // drop fully-empty rows
    return Object.keys(obj).some(function (k) { return String(obj[k]).trim() !== ''; });
  });
}

function readAll() {
  var out = {};
  ss().getSheets().forEach(function (sh) {
    out[sh.getName()] = readSheet(sh.getName());
  });
  return { ok: true, sheets: out };
}

function findRowById(sh, hs, id) {
  var idCol = hs.indexOf('id');
  if (idCol === -1) throw new Error('tab "' + sh.getName() + '" has no "id" column');
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return -1;
  var ids = sh.getRange(2, idCol + 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2; // sheet row number
  }
  return -1;
}

// Create the tab (with a header row) if it doesn't exist yet.
// Headers = "id" first, then the record's own keys. Lets the site add a
// brand-new dataset (e.g. Conferences) with zero manual Sheet setup.
function ensureSheet(name, record) {
  var sh = ss().getSheetByName(name);
  if (sh) return sh;
  sh = ss().insertSheet(name);
  var keys = Object.keys(record || {}).filter(function (k) { return k !== 'id'; });
  var hs = ['id'].concat(keys);
  sh.getRange(1, 1, 1, hs.length).setValues([hs]);
  sh.setFrozenRows(1);
  return sh;
}

function createRow(name, record) {
  record = record || {};
  var sh = ensureSheet(name, record);
  var hs = headers(sh);
  if (hs.indexOf('id') !== -1 && !record.id) {
    record.id = Utilities.getUuid();
  }
  var row = hs.map(function (h) { return record[h] !== undefined ? record[h] : ''; });
  sh.appendRow(row);
  return { ok: true, id: record.id, record: record };
}

function updateRow(name, record) {
  var sh = getSheetOrThrow(name);
  var hs = headers(sh);
  var r = findRowById(sh, hs, record.id);
  if (r === -1) return { ok: false, error: 'id not found: ' + record.id };
  var row = hs.map(function (h) { return record[h] !== undefined ? record[h] : ''; });
  sh.getRange(r, 1, 1, hs.length).setValues([row]);
  return { ok: true, id: record.id };
}

function deleteRow(name, id) {
  var sh = getSheetOrThrow(name);
  var hs = headers(sh);
  var r = findRowById(sh, hs, id);
  if (r === -1) return { ok: false, error: 'id not found: ' + id };
  sh.deleteRow(r);
  return { ok: true, id: id };
}
