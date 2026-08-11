/* ============================================================
   outreach-ui.js — university cards, each holding an editable
   professor grid, each professor row expanding into a dated
   email-update log.

   Grid cells are edited in place (type straight in, saves as you
   go). Universities and updates use the dashboard's shared modal.
   ============================================================ */
window.OUTREACH_UI = (function () {
  'use strict';

  var country = null;
  var host = null;
  var query = '';
  var openUni = {};    // uniId  -> false to collapse (default open)
  var openProf = {};   // profId -> true to show the update log

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function slug(s) { return 'st-' + String(s || '').toLowerCase().replace(/\s+/g, '-'); }
  function href(u) {
    u = String(u || '').trim();
    return !u ? '' : (/^https?:\/\//i.test(u) ? u : 'https://' + u);
  }

  var GRID = [
    { k: 'name', label: 'Professor Name', w: 170 },
    { k: 'email', label: 'Email', w: 200, type: 'email' },
    { k: 'mobile', label: 'Mobile', w: 140 },
    { k: 'subject', label: 'Subject', w: 160 }
  ];

  /* ---------- Sheet setup notice ----------
     Two ways to make the Sheet accept this data. Creating the tabs by hand
     is quickest; redeploying Code.gs fixes it permanently for any future
     tab too. Both are spelled out with one-click header copying. */
  function setupHTML() {
    var st = OUTREACH.syncState();
    if (st === 'ok' || st === 'idle' || st === 'syncing') return '';

    if (st === 'offline') {
      return '<div class="ot-warn"><b>Offline / Sheet unreachable.</b> Everything is saved on this device and ' +
        'will upload when the connection is back. <button class="mini-btn" data-act="retry">Retry sync</button></div>';
    }

    var headerRow = function (tab) { return OUTREACH.HEADERS[tab].join('\t'); };
    var tabs = ['Universities', 'Professors'];

    var body = st === 'no-headers'
      ? '<b>Tabs found, but the header row is missing.</b> The backend fills a row by matching column ' +
        'names, so without headers nothing gets stored. Paste the header row into cell <code>A1</code> of each tab:'
      : '<b>Saved on this device only</b> — the Sheet has no <code>Universities</code> / <code>Professors</code> tab yet. ' +
        'Add them once and everything here uploads automatically:';

    return '<div class="ot-warn ot-setup">' + body +
      '<ol class="ot-steps">' +
        '<li>Open the Google Sheet → <b>+</b> at the bottom to add a tab → rename it exactly as shown.</li>' +
        '<li>Click into cell <b>A1</b> of that tab and paste the header row.</li>' +
        '<li>Come back here and hit <b>Retry sync</b>.</li>' +
      '</ol>' +
      '<div class="ot-setup-rows">' +
        tabs.map(function (t) {
          return '<div class="ot-setup-row">' +
            '<code class="ot-tabname">' + t + '</code>' +
            '<code class="ot-headers">' + esc(OUTREACH.HEADERS[t].join('  ')) + '</code>' +
            '<button class="mini-btn" data-act="copy-hdr" data-hdr="' + esc(headerRow(t)) + '">Copy headers</button>' +
          '</div>';
        }).join('') +
      '</div>' +
      '<div class="ot-setup-foot">' +
        '<button class="mini-btn" data-act="retry">Retry sync</button>' +
        '<span>Prefer a permanent fix? Redeploy <code>backend/Code.gs</code> (Extensions → Apps Script → paste → Deploy) ' +
        'and it will create any tab it needs on its own.</span>' +
      '</div>' +
    '</div>';
  }

  /* ---------- render ---------- */
  function render(mount, countryId) {
    if (mount) host = mount;
    if (countryId) country = countryId;
    if (!host) return;

    var q = query.trim().toLowerCase();
    var all = OUTREACH.unisFor(country);
    var shown = all.map(function (u) {
      var kids = OUTREACH.profsFor(u.id);
      if (!q) return { u: u, kids: kids };
      var uniHit = (u.name + ' ' + u.location + ' ' + u.website).toLowerCase().indexOf(q) !== -1;
      if (uniHit) return { u: u, kids: kids };
      var hit = kids.filter(function (p) {
        return (p.name + ' ' + p.email + ' ' + p.subject + ' ' + p.status + ' ' + p.updates).toLowerCase().indexOf(q) !== -1;
      });
      return hit.length ? { u: u, kids: hit } : null;
    }).filter(Boolean);

    var s = OUTREACH.stats(country);

    host.innerHTML =
      '<div class="ot">' +
        '<div class="ot-bar">' +
          '<input class="ot-search" id="ot-search" placeholder="Search university, professor, subject, update…" value="' + esc(query) + '">' +
          '<button class="btn" data-act="add-uni">+ Add University</button>' +
          '<button class="btn btn-ghost" data-act="csv">⭳ CSV</button>' +
        '</div>' +
        '<div class="ot-stats">' +
          statTile(s.unis, 'Universities') + statTile(s.profs, 'Professors') +
          statTile(s.contacted, 'Contacted', 'a') + statTile(s.talking, 'In talks', 'v') +
          statTile(s.replied, 'Replied', 'g') + statTile(s.replyRate + '%', 'Reply rate', 'g') +
        '</div>' +
        setupHTML() +
        (shown.length ? shown.map(function (r) { return uniCard(r.u, r.kids); }).join('')
          : '<div class="ot-blank">' + (all.length
              ? 'Nothing matches “' + esc(query) + '”.'
              : 'No universities yet. Click “+ Add University” to start.') + '</div>') +
      '</div>';

    wire();
  }
  function statTile(v, l, tone) {
    return '<div class="ot-stat"><b class="' + (tone ? 'tone-' + tone : '') + '">' + v + '</b><span>' + l + '</span></div>';
  }

  function uniCard(u, kids) {
    var open = openUni[u.id] !== false;
    var site = href(u.website);
    return '<div class="ot-uni">' +
      '<div class="ot-uni-head">' +
        '<div class="ot-uni-main" data-act="toggle-uni" data-id="' + u.id + '">' +
          '<div class="ot-uni-name">' + esc(u.name) +
            '<span class="ot-badge">' + kids.length + ' prof' + (kids.length === 1 ? '' : 's') + '</span></div>' +
          '<div class="ot-uni-meta">' +
            (u.location ? '<span>📍 ' + esc(u.location) + '</span>' : '') +
            (site ? '<a href="' + esc(site) + '" target="_blank" rel="noopener" data-stop="1">🌐 ' + esc(u.website) + '</a>' : '') +
          '</div>' +
        '</div>' +
        '<div class="ot-uni-side">' +
          '<span class="ot-pill ' + slug(u.status) + '">' + esc(u.status) + '</span>' +
          '<button class="ot-ico" data-act="edit-uni" data-id="' + u.id + '" title="Edit university">✎</button>' +
          '<button class="ot-ico del" data-act="del-uni" data-id="' + u.id + '" title="Delete university">🗑</button>' +
          '<span class="ot-caret' + (open ? ' open' : '') + '" data-act="toggle-uni" data-id="' + u.id + '">▾</span>' +
        '</div>' +
      '</div>' +
      (open ? '<div class="ot-uni-body">' +
        (u.notes ? '<div class="ot-uni-notes">' + esc(u.notes) + '</div>' : '') +
        profGrid(u, kids) +
        '<button class="btn btn-ghost btn-sm" data-act="add-prof" data-id="' + u.id + '">+ Add professor</button>' +
        docSection(u) +
      '</div>' : '') +
    '</div>';
  }

  /* Optional per-university document list — only shows the list once
     something has been added, so an unused card stays clean. */
  function docSection(u) {
    var list = u.docList || [];
    var done = list.filter(function (d) { return d.done; }).length;
    return '<div class="ot-docs">' +
      '<div class="ot-docs-head">' +
        '<span class="ot-docs-title">Documents' + (list.length ? ' · ' + done + '/' + list.length : '') + '</span>' +
        '<button class="btn btn-ghost btn-sm" data-act="add-doc" data-id="' + u.id + '">+ Add document</button>' +
      '</div>' +
      (list.length
        ? '<ul class="ot-doclist">' + list.map(function (d, i) {
            return '<li class="' + (d.done ? 'done' : '') + '">' +
              '<input type="checkbox" data-act="tog-doc" data-id="' + u.id + '" data-i="' + i + '"' + (d.done ? ' checked' : '') + '>' +
              '<span>' + esc(d.text) + '</span>' +
              '<button class="ot-ico" data-act="edit-doc" data-id="' + u.id + '" data-i="' + i + '" title="Edit">✎</button>' +
              '<button class="ot-ico del" data-act="del-doc" data-id="' + u.id + '" data-i="' + i + '" title="Delete">×</button>' +
            '</li>';
          }).join('') + '</ul>'
        : '') +
    '</div>';
  }

  function profGrid(u, kids) {
    if (!kids.length) return '<div class="ot-nogrid">No professors yet for this university.</div>';
    return '<div class="ot-scroll"><table class="ot-grid"><thead><tr>' +
      GRID.map(function (c) { return '<th style="min-width:' + c.w + 'px">' + c.label + '</th>'; }).join('') +
      '<th style="min-width:130px">Status</th><th style="min-width:96px">Updates</th><th class="ot-act"></th>' +
      '</tr></thead><tbody>' +
      kids.map(function (p) { return profRow(p); }).join('') +
      '</tbody></table></div>';
  }

  function profRow(p) {
    var n = (p.updateList || []).length;
    var open = !!openProf[p.id];
    var cells = GRID.map(function (c) {
      var v = p[c.k] || '';
      var go = '';
      if (c.type === 'email' && v) go = '<a class="ot-go" href="mailto:' + esc(v) + '" title="Send email" tabindex="-1">✉</a>';
      return '<td class="' + (go ? 'has-go' : '') + '">' +
        '<input class="ot-cell" data-k="' + c.k + '" value="' + esc(v) + '">' + go + '</td>';
    }).join('');

    var row = '<tr data-pid="' + p.id + '">' + cells +
      '<td><select class="ot-cell ot-sel ' + slug(p.status) + '" data-k="status">' +
        OUTREACH.PROF_STATUS.map(function (o) {
          return '<option value="' + esc(o) + '"' + (o === p.status ? ' selected' : '') + '>' + esc(o) + '</option>';
        }).join('') + '</select></td>' +
      '<td><button class="ot-updbtn' + (open ? ' open' : '') + '" data-act="toggle-prof" data-id="' + p.id + '">' +
        n + ' update' + (n === 1 ? '' : 's') + ' <span class="ot-caret' + (open ? ' open' : '') + '">▾</span></button></td>' +
      '<td class="ot-act">' +
        '<button class="ot-ico del" data-act="del-prof" data-id="' + p.id + '" title="Delete professor">×</button>' +
      '</td></tr>';

    if (!open) return row;

    var log = (p.updateList || []).map(function (up, i) {
      return '<li><span class="ot-updn">' + (i + 1) + '</span>' +
        '<span class="ot-updd">' + esc(up.date) + '</span>' +
        '<span class="ot-updt">' + esc(up.text) + '</span>' +
        '<button class="ot-ico" data-act="edit-upd" data-id="' + p.id + '" data-i="' + i + '" title="Edit">✎</button>' +
        '<button class="ot-ico del" data-act="del-upd" data-id="' + p.id + '" data-i="' + i + '" title="Delete">×</button></li>';
    }).join('');

    return row + '<tr class="ot-logrow"><td colspan="' + (GRID.length + 3) + '">' +
      '<div class="ot-log">' +
        (log ? '<ol class="ot-updlist">' + log + '</ol>' : '<div class="ot-noupd">No email updates logged yet.</div>') +
        '<button class="btn btn-ghost btn-sm" data-act="add-upd" data-id="' + p.id + '">+ Add update</button>' +
      '</div></td></tr>';
  }

  /* ---------- wiring ---------- */
  function wire() {
    var box = host.querySelector('.ot');

    var search = host.querySelector('#ot-search');
    search.addEventListener('input', function (e) {
      query = e.target.value;
      var pos = e.target.selectionStart;
      render();
      var ns = host.querySelector('#ot-search');
      if (ns) { ns.focus(); try { ns.setSelectionRange(pos, pos); } catch (err) {} }
    });

    box.addEventListener('click', onClick);
    box.addEventListener('input', onCellEdit);
    box.addEventListener('change', onCellEdit);
    box.addEventListener('keydown', onGridKey);
  }

  function onClick(e) {
    if (e.target.closest('[data-stop]')) { e.stopPropagation(); return; }
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.dataset.act, id = el.dataset.id;

    if (act === 'toggle-uni') { openUni[id] = openUni[id] === false; return render(); }
    if (act === 'toggle-prof') { openProf[id] = !openProf[id]; return render(); }
    if (act === 'add-uni') return uniForm(null);
    if (act === 'edit-uni') return uniForm(id);
    if (act === 'del-uni') {
      var u = OUTREACH.uniById(id);
      var n = OUTREACH.profsFor(id).length;
      if (!confirm('Delete "' + (u ? u.name : id) + '"' + (n ? ' and its ' + n + ' professor row(s)' : '') + '?')) return;
      OUTREACH.removeUni(id); return render();
    }
    if (act === 'add-prof') {
      var p = OUTREACH.addProf(id);
      render();
      var inp = host.querySelector('tr[data-pid="' + p.id + '"] .ot-cell');
      if (inp) inp.focus();
      return;
    }
    if (act === 'del-prof') {
      var pr = OUTREACH.profById(id);
      if (!confirm('Delete ' + ((pr && pr.name) || 'this professor') + '?')) return;
      OUTREACH.removeProf(id); return render();
    }
    if (act === 'add-doc') return docForm(id, null);
    if (act === 'edit-doc') return docForm(id, parseInt(el.dataset.i, 10));
    if (act === 'tog-doc') { OUTREACH.toggleUniDoc(id, parseInt(el.dataset.i, 10)); return render(); }
    if (act === 'del-doc') {
      if (!confirm('Delete this document?')) return;
      OUTREACH.removeUniDoc(id, parseInt(el.dataset.i, 10)); return render();
    }
    if (act === 'add-upd') return updForm(id, null);
    if (act === 'edit-upd') return updForm(id, parseInt(el.dataset.i, 10));
    if (act === 'del-upd') {
      if (!confirm('Delete this update?')) return;
      OUTREACH.removeUpdate(id, parseInt(el.dataset.i, 10)); return render();
    }
    if (act === 'csv') { OUTREACH.exportCsv(country); if (window.toast) toast('CSV exported'); return; }
    if (act === 'copy-hdr') {
      var hdr = el.dataset.hdr || '';
      if (navigator.clipboard) {
        navigator.clipboard.writeText(hdr)
          .then(function () { if (window.toast) toast('Header row copied — paste into A1', 'ok'); })
          .catch(function () { if (window.toast) toast('Copy failed — select the text manually', 'warn'); });
      }
      return;
    }
    if (act === 'retry') {
      if (window.toast) toast('Checking the Sheet…');
      OUTREACH.retrySheet().then(function (ok) {
        var st = OUTREACH.syncState();
        var msg = ok ? 'Synced — everything is on the Google Sheet now'
          : st === 'no-headers' ? 'Tabs found, but A1 header row is still missing'
            : st === 'no-tab' ? 'Still no Universities / Professors tab'
              : 'Sheet unreachable — kept locally';
        if (window.toast) toast(msg, ok ? 'ok' : 'warn');
        render();
      });
      return;
    }
  }

  /* inline grid edit — save without re-rendering so the caret stays put */
  function onCellEdit(e) {
    var el = e.target;
    if (!el.classList || !el.classList.contains('ot-cell')) return;
    var tr = el.closest('tr[data-pid]');
    if (!tr) return;
    OUTREACH.setProfCell(tr.dataset.pid, el.dataset.k, el.value);
    if (el.dataset.k === 'status') {
      el.className = 'ot-cell ot-sel ' + slug(el.value);
      refreshStats();
    }
  }
  function refreshStats() {
    var s = OUTREACH.stats(country);
    var box = host.querySelector('.ot-stats');
    if (!box) return;
    box.innerHTML = statTile(s.unis, 'Universities') + statTile(s.profs, 'Professors') +
      statTile(s.contacted, 'Contacted', 'a') + statTile(s.talking, 'In talks', 'v') +
      statTile(s.replied, 'Replied', 'g') + statTile(s.replyRate + '%', 'Reply rate', 'g');
  }

  /* Excel-ish movement inside the professor grid */
  function onGridKey(e) {
    var el = e.target;
    if (!el.classList || !el.classList.contains('ot-cell')) return;
    var tr = el.closest('tr[data-pid]');
    if (!tr) return;
    var cellsIn = function (row) { return Array.from(row.querySelectorAll('.ot-cell')); };
    var rowsAll = Array.from(tr.closest('tbody').querySelectorAll('tr[data-pid]'));
    var ri = rowsAll.indexOf(tr), ci = cellsIn(tr).indexOf(el);

    function go(r, c) {
      if (r < 0 || r >= rowsAll.length) return;
      var cs = cellsIn(rowsAll[r]);
      if (c < 0 || c >= cs.length) return;
      cs[c].focus();
      if (cs[c].select && cs[c].tagName === 'INPUT') cs[c].select();
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      var next = ci + (e.shiftKey ? -1 : 1);
      var width = cellsIn(tr).length;
      if (next >= width) go(ri + 1, 0);
      else if (next < 0) go(ri - 1, width - 1);
      else go(ri, next);
    } else if (e.key === 'Enter') {
      e.preventDefault(); go(ri + (e.shiftKey ? -1 : 1), ci);
    } else if (e.key === 'ArrowDown' && el.tagName === 'INPUT') {
      e.preventDefault(); go(ri + 1, ci);
    } else if (e.key === 'ArrowUp' && el.tagName === 'INPUT') {
      e.preventDefault(); go(ri - 1, ci);
    }
  }

  /* ---------- forms ---------- */
  function uniForm(id) {
    var u = id ? OUTREACH.uniById(id) : {};
    if (!u) return;
    openForm({
      title: id ? 'Edit University' : 'Add University',
      sub: id ? '' : 'Then add the professors you contact there',
      fields: [
        { k: 'name', label: 'University Name', type: 'text', val: u.name, req: true, full: true },
        { k: 'location', label: 'Location', type: 'text', val: u.location },
        { k: 'website', label: 'Website', type: 'text', val: u.website },
        { k: 'status', label: 'Status', type: 'select', opts: OUTREACH.UNI_STATUS, val: u.status || 'Researching' },
        { k: 'notes', label: 'Notes', type: 'textarea', val: u.notes, full: true }
      ],
      onSave: function (f) {
        if (id) OUTREACH.updateUni(id, f);
        else OUTREACH.addUni(Object.assign({ country: country }, f));
        if (window.toast) toast(id ? 'University updated' : 'University added', 'ok');
        render();
      }
    });
  }

  function docForm(uniId, idx) {
    var u = OUTREACH.uniById(uniId);
    if (!u) return;
    var cur = idx == null ? null : (u.docList || [])[idx];
    openForm({
      title: cur ? 'Edit document' : 'Add document',
      sub: u.name,
      fields: [{ k: 'text', label: 'Document', type: 'text', val: cur ? cur.text : '', req: true, full: true }],
      onSave: function (f) {
        if (!f.text) return;
        if (cur) OUTREACH.editUniDoc(uniId, idx, f.text);
        else OUTREACH.addUniDoc(uniId, f.text);
        render();
      }
    });
  }

  function updForm(profId, idx) {
    var p = OUTREACH.profById(profId);
    if (!p) return;
    var cur = idx == null ? null : (p.updateList || [])[idx];
    openForm({
      title: cur ? 'Edit update' : 'Email update ' + ((p.updateList || []).length + 1),
      sub: p.name || 'Professor',
      fields: [
        { k: 'date', label: 'Date', type: 'date', val: cur ? cur.date : OUTREACH.today() },
        { k: 'text', label: 'What happened?', type: 'textarea', val: cur ? cur.text : '', req: true, full: true }
      ],
      onSave: function (f) {
        if (!f.text) return;
        if (cur) OUTREACH.editUpdate(profId, idx, f.text, f.date);
        else { OUTREACH.addUpdate(profId, f.text, f.date); openProf[profId] = true; }
        if (window.toast) toast('Update saved', 'ok');
        render();
      }
    });
  }

  OUTREACH.onChange(function () {
    // never redraw out from under a cell being typed in
    if (host && host.contains(document.activeElement)) return;
    if (host && country) render();
  });

  return { render: render, rerender: function () { if (host && country) render(); } };
})();
