/* ============================================================
   outreach-ui.js — renders the university + professor tracker
   inside a country panel. Data lives in OUTREACH (outreach.js);
   this file only draws it and wires the forms.

   Loaded at the end of <body> so the dashboard's generic modal
   (openForm) and helpers are already defined.
   ============================================================ */
window.OUTREACH_UI = (function () {
  'use strict';

  var expanded = {};   // uniId -> bool
  var query = '';
  var mountedCountry = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function attr(s) { return esc(s).replace(/\n/g, ' '); }
  function statusClass(s) { return 'os-' + String(s || '').toLowerCase().replace(/\s+/g, '-'); }
  function safeUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    return /^https?:\/\//i.test(u) ? u : 'https://' + u;
  }

  /* ---------- sync notice ---------- */
  function syncHTML() {
    if (OUTREACH.syncState() !== 'no-tab') return '';
    return '<div class="ov-sync">' +
      '<b>Saved on this device only.</b> The Google Sheet backend is running an older ' +
      '<code>Code.gs</code> that cannot create the <code>Universities</code> / <code>Professors</code> tabs. ' +
      'Redeploy <code>backend/Code.gs</code> (Extensions → Apps Script → paste → Deploy), then hit retry — ' +
      'everything already entered will be pushed up.' +
      '<button class="mini-btn" data-act="retry-sheet">Retry sync</button>' +
      '</div>';
  }

  /* ---------- stats strip ---------- */
  function statsHTML(country) {
    var s = OUTREACH.stats(country);
    var tiles = [
      { l: 'Universities', v: s.unis, c: '' },
      { l: 'Professors', v: s.profs, c: '' },
      { l: 'Contacted', v: s.contacted, c: 'ov-accent' },
      { l: 'Replied', v: s.replied, c: 'ov-green' },
      { l: 'Reply rate', v: s.replyRate + '%', c: 'ov-green' },
      { l: 'Follow-up due', v: s.followUp, c: s.followUp ? 'ov-amber' : '' }
    ];
    return '<div class="ov-strip">' + tiles.map(function (t) {
      return '<div class="ov-stat"><b class="' + t.c + '">' + t.v + '</b><span>' + t.l + '</span></div>';
    }).join('') + '</div>';
  }

  /* ---------- follow-up radar ---------- */
  function radarHTML(country) {
    var due = OUTREACH.profsForCountry(country).filter(OUTREACH.needsFollowUp);
    if (!due.length) return '';
    return '<div class="ov-radar"><h5>⏰ Follow-up due · no reply after ' + OUTREACH.FOLLOWUP_DAYS + ' days</h5>' +
      due.map(function (p) {
        var d = OUTREACH.daysSince(p.emailedOn);
        return '<div class="ov-radar-row">' +
          '<span class="ov-radar-name">' + esc(p.name) + '<em> · ' + esc(p.uniName) + '</em></span>' +
          '<span class="ov-radar-age">' + d + ' days ago</span>' +
          '<button class="mini-btn" data-act="respond" data-id="' + p.id + '">Log reply</button>' +
          (p.email ? '<a class="mini-btn" href="mailto:' + attr(p.email) + '?subject=' + encodeURIComponent('Following up — prospective MS applicant') + '">Nudge ✉</a>' : '') +
          '</div>';
      }).join('') + '</div>';
  }

  /* ---------- professor row ---------- */
  function profHTML(p) {
    var responses = p.responseList || [];
    var flag = OUTREACH.needsFollowUp(p);
    return '<div class="ov-prof' + (flag ? ' is-due' : '') + '">' +
      '<div class="ov-prof-head">' +
        '<div class="ov-prof-id">' +
          '<span class="ov-prof-name">' + esc(p.name) + (p.title ? ' <em>' + esc(p.title) + '</em>' : '') + '</span>' +
          (p.research ? '<span class="ov-prof-research">' + esc(p.research) + '</span>' : '') +
        '</div>' +
        '<span class="ov-pill ' + statusClass(p.status) + '">' + esc(p.status) + '</span>' +
      '</div>' +
      '<div class="ov-prof-contact">' +
        (p.email ? '<span class="ov-chip">✉ ' + esc(p.email) +
          '<button class="ov-icon" data-act="copy" data-val="' + attr(p.email) + '" title="Copy email">⧉</button>' +
          '<a class="ov-icon" href="mailto:' + attr(p.email) + '" title="Send email">↗</a></span>' : '') +
        (p.mobile ? '<span class="ov-chip">☎ ' + esc(p.mobile) +
          '<button class="ov-icon" data-act="copy" data-val="' + attr(p.mobile) + '" title="Copy number">⧉</button></span>' : '') +
        (p.emailedOn ? '<span class="ov-chip muted">Emailed ' + esc(p.emailedOn) + '</span>' : '') +
      '</div>' +
      (responses.length
        ? '<ol class="ov-resp">' + responses.map(function (r, i) {
            return '<li><span class="ov-resp-n">Response ' + (i + 1) + '</span>' +
              '<span class="ov-resp-d">' + esc(r.date) + '</span>' +
              '<span class="ov-resp-t">' + esc(r.text) + '</span>' +
              '<button class="ov-icon del" data-act="del-resp" data-id="' + p.id + '" data-i="' + i + '" title="Remove">×</button></li>';
          }).join('') + '</ol>'
        : '') +
      (p.notes ? '<div class="ov-prof-notes">' + esc(p.notes) + '</div>' : '') +
      '<div class="ov-prof-actions">' +
        '<button class="mini-btn" data-act="respond" data-id="' + p.id + '">+ Response</button>' +
        (p.status === 'Not contacted' ? '<button class="mini-btn" data-act="emailed" data-id="' + p.id + '">Mark emailed</button>' : '') +
        '<button class="mini-btn" data-act="edit-prof" data-id="' + p.id + '">Edit</button>' +
        '<button class="mini-btn del" data-act="del-prof" data-id="' + p.id + '">Delete</button>' +
      '</div>' +
    '</div>';
  }

  /* ---------- university card ---------- */
  function uniHTML(u, matchedProfs) {
    var open = expanded[u.id] !== false;   // default open
    var site = safeUrl(u.website);
    return '<div class="ov-uni">' +
      '<div class="ov-uni-head" data-act="toggle" data-id="' + u.id + '">' +
        '<div>' +
          '<div class="ov-uni-name">' + esc(u.name) +
            '<span class="ov-count">' + matchedProfs.length + ' prof' + (matchedProfs.length === 1 ? '' : 's') + '</span></div>' +
          '<div class="ov-uni-meta">' +
            (site ? '<a href="' + attr(site) + '" target="_blank" rel="noopener" data-stop="1">🌐 Website</a>' : '') +
            (u.course ? '<span>🎓 ' + esc(u.course) + '</span>' : '') +
            (u.location ? '<span>📍 ' + esc(u.location) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="ov-uni-right">' +
          '<span class="ov-pill ' + statusClass(u.status) + '">' + esc(u.status) + '</span>' +
          '<button class="ov-icon" data-act="edit-uni" data-id="' + u.id + '" title="Edit university">✎</button>' +
          '<button class="ov-icon del" data-act="del-uni" data-id="' + u.id + '" title="Delete university">🗑</button>' +
          '<span class="ov-caret' + (open ? ' open' : '') + '">▾</span>' +
        '</div>' +
      '</div>' +
      (open
        ? '<div class="ov-uni-body">' +
            (u.notes ? '<div class="ov-uni-notes">' + esc(u.notes) + '</div>' : '') +
            (matchedProfs.length ? matchedProfs.map(profHTML).join('')
              : '<div class="ov-empty">No professors logged yet for this university.</div>') +
            '<button class="btn btn-ghost btn-sm" data-act="add-prof" data-id="' + u.id + '">+ Add professor</button>' +
          '</div>'
        : '') +
    '</div>';
  }

  /* ---------- main render ---------- */
  function render(host, country) {
    if (!host) return;
    mountedCountry = country;
    var all = OUTREACH.unisFor(country);
    var q = query.trim().toLowerCase();

    var shown = all.map(function (u) {
      var kids = OUTREACH.profsFor(u.id);
      if (!q) return { u: u, kids: kids };
      var uniHit = (u.name + ' ' + u.course + ' ' + u.location + ' ' + u.website).toLowerCase().indexOf(q) !== -1;
      var hitKids = kids.filter(function (p) {
        return (p.name + ' ' + p.email + ' ' + p.research + ' ' + p.title + ' ' + p.notes).toLowerCase().indexOf(q) !== -1;
      });
      if (uniHit) return { u: u, kids: kids };
      return hitKids.length ? { u: u, kids: hitKids } : null;
    }).filter(Boolean);

    host.innerHTML =
      '<div class="ov-wrap">' +
        '<div class="ov-bar">' +
          '<input class="ov-search" id="ov-search" type="text" placeholder="Search university, professor, email, research area…" value="' + attr(query) + '">' +
          '<button class="btn" data-act="add-uni">+ Add University</button>' +
          '<button class="btn btn-ghost" data-act="export">⭳ CSV</button>' +
        '</div>' +
        syncHTML() +
        statsHTML(country) +
        radarHTML(country) +
        (shown.length
          ? shown.map(function (r) { return uniHTML(r.u, r.kids); }).join('')
          : '<div class="ov-empty big">' + (all.length
              ? 'Nothing matches “' + esc(query) + '”.'
              : 'No universities yet. Add one, then log the professors you contact there.') + '</div>') +
      '</div>';

    var box = host.querySelector('.ov-wrap');
    box.addEventListener('click', onClick);
    var s = host.querySelector('#ov-search');
    s.addEventListener('input', function (e) {
      query = e.target.value;
      var pos = e.target.selectionStart;
      render(host, country);
      var ns = host.querySelector('#ov-search');
      if (ns) { ns.focus(); try { ns.setSelectionRange(pos, pos); } catch (err) {} }
    });
  }

  function rerender() {
    var host = document.getElementById('outreach-host');
    if (host && mountedCountry) render(host, mountedCountry);
  }

  /* ---------- interactions ---------- */
  function onClick(e) {
    var stop = e.target.closest('[data-stop]');
    if (stop) { e.stopPropagation(); return; }
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.dataset.act, id = el.dataset.id;

    if (act === 'toggle') { expanded[id] = expanded[id] === false; rerender(); return; }
    e.stopPropagation();

    if (act === 'add-uni') return uniForm(null);
    if (act === 'edit-uni') return uniForm(id);
    if (act === 'del-uni') {
      var u = OUTREACH.uniById(id);
      var n = OUTREACH.profsFor(id).length;
      if (!confirm('Delete "' + (u ? u.name : id) + '"' + (n ? ' and its ' + n + ' professor record(s)' : '') + '?')) return;
      OUTREACH.removeUni(id); return;
    }
    if (act === 'add-prof') return profForm(null, id);
    if (act === 'edit-prof') return profForm(id);
    if (act === 'del-prof') {
      var p = OUTREACH.profById(id);
      if (!confirm('Delete professor "' + (p ? p.name : id) + '"?')) return;
      OUTREACH.removeProf(id); return;
    }
    if (act === 'emailed') { OUTREACH.markEmailed(id); if (window.toast) toast('Marked as emailed today'); return; }
    if (act === 'respond') return responseForm(id);
    if (act === 'del-resp') { OUTREACH.removeResponse(id, parseInt(el.dataset.i, 10)); return; }
    if (act === 'export') { OUTREACH.exportCsv(mountedCountry); if (window.toast) toast('CSV exported'); return; }
    if (act === 'retry-sheet') {
      if (window.toast) toast('Retrying Sheet sync…');
      OUTREACH.retrySheet().then(function (ok) {
        if (window.toast) toast(ok ? 'Synced to Google Sheet' : 'Still unavailable — backend needs redeploying', ok ? 'ok' : 'warn');
        rerender();
      });
      return;
    }
    if (act === 'copy') {
      var v = el.dataset.val || '';
      if (navigator.clipboard) navigator.clipboard.writeText(v).then(function () {
        if (window.toast) toast('Copied ' + v);
      }).catch(function () {});
      return;
    }
  }

  /* ---------- forms (reuse the dashboard's generic modal) ---------- */
  function uniForm(id) {
    var u = id ? OUTREACH.uniById(id) : {};
    if (!u) return;
    openForm({
      title: id ? 'Edit University' : 'Add University',
      sub: 'Where you are applying, and what you are applying for',
      fields: [
        { k: 'name', label: 'University Name', type: 'text', val: u.name, req: true, full: true },
        { k: 'website', label: 'University Website', type: 'text', val: u.website, full: true },
        { k: 'course', label: 'Course / Programme', type: 'text', val: u.course },
        { k: 'location', label: 'University Location', type: 'text', val: u.location },
        { k: 'status', label: 'Status', type: 'select', opts: OUTREACH.UNI_STATUS, val: u.status || 'Researching' },
        { k: 'notes', label: 'Notes', type: 'textarea', val: u.notes, full: true }
      ],
      onSave: function (f) {
        if (id) OUTREACH.updateUni(id, f);
        else OUTREACH.addUni(Object.assign({ country: mountedCountry }, f));
        if (window.toast) toast(id ? 'University updated' : 'University added', 'ok');
      }
    });
  }

  function profForm(id, uniId) {
    var p = id ? OUTREACH.profById(id) : {};
    if (!p) return;
    var targetUni = uniId || p.uniId;
    var list = OUTREACH.unisFor(mountedCountry);
    var names = list.map(function (x) { return x.name; });
    var cur = OUTREACH.uniById(targetUni);
    openForm({
      title: id ? 'Edit Professor' : 'Add Professor',
      sub: cur ? cur.name : '',
      fields: [
        { k: 'name', label: 'Professor Name', type: 'text', val: p.name, req: true, full: true },
        { k: 'uniName', label: 'University', type: 'select', opts: names, val: cur ? cur.name : names[0] },
        { k: 'title', label: 'Title / Department', type: 'text', val: p.title },
        { k: 'email', label: 'Professor Email', type: 'text', val: p.email },
        { k: 'mobile', label: 'Professor Mobile', type: 'text', val: p.mobile },
        { k: 'research', label: 'Research Area', type: 'text', val: p.research, full: true },
        { k: 'status', label: 'Status', type: 'select', opts: OUTREACH.PROF_STATUS, val: p.status || 'Not contacted' },
        { k: 'emailedOn', label: 'Emailed On', type: 'date', val: p.emailedOn },
        { k: 'notes', label: 'Notes', type: 'textarea', val: p.notes, full: true }
      ],
      onSave: function (f) {
        var picked = list.find(function (x) { return x.name === f.uniName; });
        var rec = Object.assign({}, f, { uniId: picked ? picked.id : targetUni, uniName: f.uniName });
        if (id) OUTREACH.updateProf(id, rec);
        else OUTREACH.addProf(rec);
        if (window.toast) toast(id ? 'Professor updated' : 'Professor added', 'ok');
      }
    });
  }

  function responseForm(profId) {
    var p = OUTREACH.profById(profId);
    if (!p) return;
    var n = (p.responseList || []).length + 1;
    openForm({
      title: 'Response ' + n,
      sub: p.name + (p.uniName ? ' · ' + p.uniName : ''),
      fields: [
        { k: 'date', label: 'Date', type: 'date', val: OUTREACH.today() },
        { k: 'text', label: 'What did they say?', type: 'textarea', val: '', req: true, full: true }
      ],
      onSave: function (f) {
        if (!f.text) return;
        OUTREACH.addResponse(profId, f.text, f.date);
        if (window.toast) toast('Response ' + n + ' logged', 'ok');
      }
    });
  }

  OUTREACH.onChange(rerender);

  return { render: render, rerender: rerender };
})();
