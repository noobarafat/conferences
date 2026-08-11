/* ============================================================
   ui-pro.js — the "pro" layer: 3D animated background, tilt
   surfaces, animated counters, command palette, toasts,
   confetti, theme switching and keyboard shortcuts.

   Loaded at the END of <body>, after the page's own inline
   script, so every global it hooks into (switchTab, gotoTab,
   allDocsStats, renderOverview, ERASMUS_PROGRAMS, COUNTRIES…)
   already exists. Everything degrades quietly if a hook is
   missing, so this file can never break the dashboard.
   ============================================================ */
(function () {
  'use strict';

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  /* ============================================================
     1. THEME
     ============================================================ */
  const THEME_KEY = 'edu_theme';
  function currentTheme() { return document.documentElement.getAttribute('data-theme') || 'dark'; }
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
    const btn = $('#theme-btn');
    if (btn) btn.innerHTML = (t === 'dark' ? '🌙' : '☀️') + '<span>' + (t === 'dark' ? 'Dark' : 'Light') + '</span>';
    if (field) field.recolor();
  }
  function toggleTheme() {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    toast((next === 'dark' ? '🌙' : '☀️') + ' ' + next[0].toUpperCase() + next.slice(1) + ' theme');
  }

  /* ============================================================
     2. 3D PARTICLE FIELD
     True perspective projection: each particle lives at (x,y,z),
     the field yaws/pitches toward the pointer, and points are
     divided by depth before being drawn. Near particles are
     bigger, brighter and link to their neighbours.
     ============================================================ */
  function ParticleField(canvas) {
    const ctx = canvas.getContext('2d', { alpha: true });
    let W = 0, H = 0, dpr = 1;
    let pts = [];
    let rgbA = [79, 141, 255], rgbB = [124, 92, 252];
    let targetYaw = 0, targetPitch = 0, yaw = 0, pitch = 0;
    let raf = null, running = false;
    const FOCAL = 620, DEPTH = 1500;

    function readAccent() {
      const cs = getComputedStyle(document.documentElement);
      rgbA = hexToRgb(cs.getPropertyValue('--accent').trim()) || rgbA;
      rgbB = hexToRgb(cs.getPropertyValue('--accent2').trim()) || rgbB;
    }
    function hexToRgb(h) {
      const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h);
      return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
    }

    function seed() {
      const target = Math.round(Math.min(150, Math.max(50, (W * H) / 15000)));
      pts = [];
      for (let i = 0; i < target; i++) {
        pts.push({
          x: (Math.random() - .5) * 2400,
          y: (Math.random() - .5) * 1500,
          z: Math.random() * DEPTH,
          r: Math.random() * 1.5 + .7,
          drift: (Math.random() - .5) * .16,
          speed: Math.random() * .55 + .28,
          mix: Math.random()
        });
      }
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth || window.innerWidth;
      H = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function project(p) {
      // yaw around Y, pitch around X, then perspective divide
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      let x = p.x * cy - p.z * sy;
      let z = p.x * sy + p.z * cy;
      let y = p.y * cp - z * sp;
      z = p.y * sp + z * cp;
      const d = z + FOCAL;
      if (d <= 1) return null;
      const k = FOCAL / d;
      return { sx: W / 2 + x * k, sy: H / 2 + y * k, k, z };
    }

    function frame() {
      if (!running) return;
      yaw += (targetYaw - yaw) * .045;
      pitch += (targetPitch - pitch) * .045;
      ctx.clearRect(0, 0, W, H);

      const shown = [];
      for (const p of pts) {
        p.z -= p.speed;
        p.x += p.drift;
        if (p.z < -FOCAL + 20) { p.z = DEPTH; p.x = (Math.random() - .5) * 2400; p.y = (Math.random() - .5) * 1500; }
        const pr = project(p);
        if (!pr) continue;
        if (pr.sx < -120 || pr.sx > W + 120 || pr.sy < -120 || pr.sy > H + 120) continue;
        pr.p = p;
        shown.push(pr);
      }

      // depth-linked links between close neighbours
      ctx.lineWidth = 1;
      for (let i = 0; i < shown.length; i++) {
        const a = shown[i];
        for (let j = i + 1; j < shown.length; j++) {
          const b = shown[j];
          const dx = a.sx - b.sx, dy = a.sy - b.sy;
          const dist2 = dx * dx + dy * dy;
          if (dist2 > 18000) continue;
          const near = (a.k + b.k) / 2;
          const alpha = (1 - dist2 / 18000) * near * .30;
          if (alpha < .012) continue;
          ctx.strokeStyle = 'rgba(' + rgbA[0] + ',' + rgbA[1] + ',' + rgbA[2] + ',' + alpha.toFixed(3) + ')';
          ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
        }
      }

      for (const s of shown) {
        const m = s.p.mix;
        const cr = Math.round(rgbA[0] * (1 - m) + rgbB[0] * m);
        const cg = Math.round(rgbA[1] * (1 - m) + rgbB[1] * m);
        const cb = Math.round(rgbA[2] * (1 - m) + rgbB[2] * m);
        const a = Math.min(.85, s.k * .95);
        const rad = Math.max(.4, s.p.r * s.k * 1.7);
        ctx.beginPath();
        ctx.arc(s.sx, s.sy, rad, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',' + a.toFixed(3) + ')';
        ctx.fill();
        if (s.k > .75) {
          ctx.beginPath();
          ctx.arc(s.sx, s.sy, rad * 3.4, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',' + (a * .07).toFixed(3) + ')';
          ctx.fill();
        }
      }
      raf = requestAnimationFrame(frame);
    }

    // start() always re-arms the rAF. A page opened in a background tab
    // gets running=true but no frame ever fires, so on becoming visible we
    // must schedule again rather than early-return on the stale flag.
    function start() { if (raf) cancelAnimationFrame(raf); running = true; raf = requestAnimationFrame(frame); }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = null; }

    window.addEventListener('resize', resize, { passive: true });
    // layout can still be settling on first paint — re-measure once it has
    if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
    window.addEventListener('pointermove', e => {
      targetYaw = ((e.clientX / window.innerWidth) - .5) * .5;
      targetPitch = ((e.clientY / window.innerHeight) - .5) * .32;
    }, { passive: true });
    document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start(); });

    readAccent(); resize(); start();
    return { recolor: () => setTimeout(readAccent, 60), stop, start };
  }

  let field = null;

  /* ============================================================
     3. 3D TILT
     ============================================================ */
  const TILT_SEL = '.stat-tile, .card, .prog-card, .ctry-card, .pub-card, .ov-hero';
  function bindTilt(root) {
    $$(TILT_SEL, root || document).forEach(el => {
      if (el.dataset.tiltBound) return;
      el.dataset.tiltBound = '1';
      el.classList.add('tilt');
      if (reduced) return;

      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        el.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
        el.style.setProperty('--my', (py * 100).toFixed(1) + '%');
        const max = el.classList.contains('ov-hero') ? 3 : 7;
        const ry = (px - .5) * max * 2;
        const rx = (.5 - py) * max * 2;
        el.classList.add('is-tilting');
        el.style.transform = 'perspective(900px) rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg) translateZ(8px) scale(1.012)';
      });
      el.addEventListener('pointerleave', () => {
        el.classList.remove('is-tilting');
        el.style.transform = '';
      });
    });
  }

  /* ============================================================
     4. ANIMATED COUNTERS
     ============================================================ */
  function animateCounters(root) {
    if (reduced) return;
    $$('.stat-val, .ring-pct', root || document).forEach(el => {
      const raw = el.textContent.trim();
      const m = raw.match(/^(\D*)(\d+)(.*)$/);
      if (!m) return;
      const pre = m[1], end = parseInt(m[2], 10), post = m[3];
      if (end === 0) return;
      if (el.dataset.counted === raw) return;
      el.dataset.counted = raw;
      const dur = 850, t0 = performance.now();
      function tick(now) {
        const t = Math.min(1, (now - t0) / dur);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = pre + Math.round(end * eased) + post;
        if (t < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }

  /* ============================================================
     5. TOASTS
     ============================================================ */
  function toast(msg, kind) {
    const box = $('#toasts');
    if (!box) return;
    const t = document.createElement('div');
    t.className = 'toast' + (kind ? ' ' + kind : '');
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 320);
    }, 2600);
  }
  window.toast = toast;

  /* ============================================================
     6. CONFETTI (3D-ish tumbling ribbons)
     ============================================================ */
  function confetti() {
    if (reduced) return;
    const cv = $('#confetti');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cv.classList.add('on');

    const cs = getComputedStyle(document.documentElement);
    const colors = ['--accent', '--accent2', '--green', '--amber'].map(v => cs.getPropertyValue(v).trim() || '#4f8dff');
    const bits = [];
    for (let i = 0; i < 130; i++) {
      bits.push({
        x: innerWidth / 2 + (Math.random() - .5) * 260,
        y: innerHeight * .32 + (Math.random() - .5) * 90,
        vx: (Math.random() - .5) * 11,
        vy: Math.random() * -13 - 4,
        w: Math.random() * 8 + 4,
        h: Math.random() * 5 + 3,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - .5) * .3,
        spin: Math.random() * Math.PI * 2,
        vs: Math.random() * .22 + .08,
        c: colors[(Math.random() * colors.length) | 0],
        life: 1
      });
    }
    const t0 = performance.now();
    (function run(now) {
      const elapsed = now - t0;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      let alive = 0;
      for (const b of bits) {
        b.vy += .34; b.vx *= .995;
        b.x += b.vx; b.y += b.vy;
        b.rot += b.vr; b.spin += b.vs;
        if (elapsed > 1400) b.life -= .022;
        if (b.life <= 0 || b.y > innerHeight + 40) continue;
        alive++;
        // the sine on spin fakes a ribbon flipping through 3D
        const squish = Math.abs(Math.cos(b.spin));
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.globalAlpha = Math.max(0, b.life);
        ctx.fillStyle = b.c;
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, Math.max(.6, b.h * squish));
        ctx.restore();
      }
      if (alive > 0) requestAnimationFrame(run);
      else { ctx.clearRect(0, 0, innerWidth, innerHeight); cv.classList.remove('on'); }
    })(t0);
  }
  window.confetti = confetti;

  /* ============================================================
     7. OVERVIEW HERO (progress ring + breakdown bars)
     ============================================================ */
  function heroStats() {
    const out = { overall: { done: 0, total: 0 }, rows: [] };
    if (typeof allDocsStats === 'function') {
      const s = allDocsStats();
      out.overall = { done: s.ready, total: s.total };
    }
    if (typeof ERASMUS_PROGRAMS !== 'undefined' && typeof docsProgress === 'function') {
      let d = 0, t = 0;
      ERASMUS_PROGRAMS.forEach(p => { const pr = docsProgress(p); d += pr.done; t += pr.total; });
      out.rows.push({ label: 'Erasmus docs', done: d, total: t, cls: '' });
    }
    if (typeof COUNTRIES !== 'undefined' && typeof countryDocsProgress === 'function') {
      let d = 0, t = 0;
      COUNTRIES.forEach(c => { const pr = countryDocsProgress(c); d += pr.done; t += pr.total; });
      out.rows.push({ label: 'Country docs', done: d, total: t, cls: 'g' });
    }
    if (typeof allPapers === 'function') {
      const papers = allPapers();
      const pub = papers.filter(p => p.status === 'Published').length;
      out.rows.push({ label: 'Papers published', done: pub, total: papers.length, cls: 'a' });
    }
    return out;
  }

  function renderHero() {
    const host = $('#ov-hero');
    if (!host) return;
    const s = heroStats();
    const pct = s.overall.total ? Math.round(s.overall.done / s.overall.total * 100) : 0;
    const R = 62, C = 2 * Math.PI * R;

    let verdict = 'Just getting started — pick one document and knock it out today.';
    if (pct >= 100) verdict = 'Everything is ready. Time to hit submit. 🎉';
    else if (pct >= 75) verdict = 'Almost there. The finish line is in sight.';
    else if (pct >= 40) verdict = 'Solid momentum — keep the streak going.';
    else if (pct > 0) verdict = 'Good start. Small steps every day add up fast.';

    host.innerHTML =
      '<div class="ov-hero">' +
        '<div class="ring-wrap">' +
          '<svg width="148" height="148" viewBox="0 0 148 148">' +
            '<defs><linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">' +
              '<stop offset="0%" stop-color="var(--accent)"/><stop offset="100%" stop-color="var(--accent2)"/>' +
            '</linearGradient></defs>' +
            '<circle class="ring-track" cx="74" cy="74" r="' + R + '" fill="none" stroke-width="11"/>' +
            '<circle class="ring-fill" id="ring-fill" cx="74" cy="74" r="' + R + '" fill="none" stroke-width="11" ' +
              'stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + C.toFixed(1) + '"/>' +
          '</svg>' +
          '<div class="ring-center"><div class="ring-pct" id="ring-pct">' + pct + '%</div><div class="ring-lbl">Ready</div></div>' +
        '</div>' +
        '<div class="hero-right">' +
          '<h3>Application readiness</h3>' +
          '<p>' + verdict + ' <b style="color:var(--text)">' + s.overall.done + ' of ' + s.overall.total + '</b> documents across every programme and country are done.</p>' +
          '<div class="hero-bars">' + s.rows.map(r => {
            const p = r.total ? Math.round(r.done / r.total * 100) : 0;
            return '<div class="hero-bar-row">' +
              '<span class="hero-bar-lbl">' + r.label + '</span>' +
              '<span class="hero-bar-track"><span class="hero-bar-fill ' + r.cls + '" data-w="' + p + '"></span></span>' +
              '<span class="hero-bar-val">' + r.done + '/' + r.total + '</span>' +
            '</div>';
          }).join('') + '</div>' +
        '</div>' +
      '</div>';

    // rAF gives the CSS transition a frame to latch onto; the timeout is a
    // fallback so the ring/bars can never sit empty if rAF is throttled
    // (e.g. the page was opened in a background tab).
    const paint = () => {
      const fill = $('#ring-fill');
      if (fill) fill.style.strokeDashoffset = (C * (1 - pct / 100)).toFixed(1);
      $$('.hero-bar-fill', host).forEach(b => { b.style.width = b.dataset.w + '%'; });
    };
    requestAnimationFrame(paint);
    setTimeout(paint, 400);
    bindTilt(host);
    animateCounters(host);
  }

  /* ============================================================
     8. COMMAND PALETTE
     ============================================================ */
  let palItems = [], palFiltered = [], palSel = 0;

  function buildPaletteIndex() {
    const items = [];
    $$('#tab-nav .tab-btn').forEach(b => {
      items.push({
        ico: (b.querySelector('.tab-ico') || {}).textContent || '▸',
        title: b.textContent.replace(/[^\w\s]/g, '').trim(),
        sub: 'Jump to tab', kind: 'tab',
        run: () => b.click()
      });
    });
    if (typeof ERASMUS_PROGRAMS !== 'undefined') {
      ERASMUS_PROGRAMS.forEach(p => items.push({
        ico: p.flag, title: p.shortName, sub: p.name, kind: 'erasmus',
        run: () => { if (typeof gotoTab === 'function') gotoTab('scholarships'); if (typeof openScholarshipDetail === 'function') openScholarshipDetail(p.id); }
      }));
    }
    if (typeof COUNTRIES !== 'undefined') {
      COUNTRIES.forEach(c => items.push({
        ico: c.flag, title: c.name, sub: c.documents.length + ' documents tracked', kind: 'country',
        run: () => { if (typeof gotoTab === 'function') gotoTab('country'); if (typeof openCountryDetail === 'function') openCountryDetail(c.id); }
      }));
    }
    $$('#conf-cards .card').forEach(card => {
      const link = card.querySelector('.conf-name a');
      if (!link) return;
      items.push({
        ico: '📅', title: link.textContent.trim(),
        sub: 'Deadline ' + (card.dataset.deadline || '—'), kind: 'conf',
        run: () => { if (typeof gotoTab === 'function') gotoTab('research'); setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'center' }), 260); }
      });
    });
    items.push({ ico: '🎨', title: 'Toggle theme', sub: 'Switch dark / light', kind: 'action', run: toggleTheme });
    items.push({ ico: '⌨️', title: 'Keyboard shortcuts', sub: 'Show all shortcuts', kind: 'action', run: () => $('#shortcuts').classList.add('open') });
    palItems = items;
  }

  function palRender() {
    const box = $('#pal-results');
    if (!palFiltered.length) { box.innerHTML = '<div class="pal-empty">Nothing matches that.</div>'; return; }
    box.innerHTML = palFiltered.map((it, i) =>
      '<div class="pal-item' + (i === palSel ? ' sel' : '') + '" data-i="' + i + '">' +
        '<span class="pi-ico">' + it.ico + '</span>' +
        '<span class="pi-txt"><span class="pi-title">' + escapeHtml(it.title) + '</span>' +
        '<span class="pi-sub">' + escapeHtml(it.sub) + '</span></span>' +
        '<span class="pi-kind">' + it.kind + '</span>' +
      '</div>'
    ).join('');
    const sel = box.querySelector('.pal-item.sel');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function palFilter(q) {
    q = q.trim().toLowerCase();
    palFiltered = !q ? palItems.slice(0, 40) : palItems.filter(it =>
      (it.title + ' ' + it.sub + ' ' + it.kind).toLowerCase().includes(q)
    ).slice(0, 40);
    palSel = 0;
    palRender();
  }
  function openPalette() {
    buildPaletteIndex();
    $('#palette').classList.add('open');
    const inp = $('#pal-input');
    inp.value = '';
    palFilter('');
    setTimeout(() => inp.focus(), 40);
  }
  function closePalette() { $('#palette').classList.remove('open'); }
  function palRun(i) {
    const it = palFiltered[i];
    if (!it) return;
    closePalette();
    setTimeout(it.run, 60);
  }
  window.openPalette = openPalette;

  /* ============================================================
     9. SCROLL REVEAL
     ============================================================ */
  let io = null;
  function bindReveal(root) {
    if (reduced) return;
    if (!io) {
      io = new IntersectionObserver(entries => {
        entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
      }, { rootMargin: '0px 0px -8% 0px', threshold: .06 });
    }
    $$('.entry, .pub-card, .prog-card, .ctry-card', root || document).forEach(el => {
      if (el.dataset.revealBound) return;
      el.dataset.revealBound = '1';
      el.classList.add('reveal');
      io.observe(el);
    });
  }

  /* ============================================================
     10. TAB UNDERLINE
     ============================================================ */
  function moveUnderline() {
    const nav = $('#tab-nav'), bar = $('#tab-underline'), act = $('#tab-nav .tab-btn.active');
    if (!nav || !bar || !act) return;
    const nr = nav.getBoundingClientRect(), ar = act.getBoundingClientRect();
    bar.style.width = ar.width + 'px';
    bar.style.transform = 'translateX(' + (ar.left - nr.left + nav.scrollLeft) + 'px)';
  }

  /* ============================================================
     11. GREETING
     ============================================================ */
  function renderGreeting() {
    const el = $('#greeting');
    if (!el) return;
    const h = new Date().getHours();
    const part = h < 5 ? 'Burning the midnight oil' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Working late';
    const lines = [
      'Every document you tick is one less thing between you and Europe.',
      'Consistency beats intensity. One task today is enough.',
      'Future you is going to be very glad you did this.',
      'Seven programmes, one shot each. Make them count.',
      'Deadlines are just dates. Preparation is the real work.'
    ];
    const day = Math.floor(Date.now() / 86400000);
    el.innerHTML = part + ', <b>Arafat</b>.';
    const sub = $('#greeting-sub');
    if (sub) sub.textContent = lines[day % lines.length];
  }

  /* ============================================================
     12. HOOKS — wrap existing renderers so the pro layer keeps up
     ============================================================ */
  function wrap(name, after) {
    const orig = window[name];
    if (typeof orig !== 'function') return;
    window[name] = function () {
      const r = orig.apply(this, arguments);
      try { after.apply(this, arguments); } catch (e) {}
      return r;
    };
  }

  function afterAnyRender() {
    bindTilt(); bindReveal(); animateCounters();
  }

  // Celebrate whenever a whole checklist reaches 100%.
  const doneSet = new Set();
  function checkCelebrations(silent) {
    const hits = [];
    if (typeof ERASMUS_PROGRAMS !== 'undefined' && typeof docsProgress === 'function') {
      ERASMUS_PROGRAMS.forEach(p => {
        const pr = docsProgress(p);
        if (pr.total && pr.done === pr.total) hits.push({ key: 'e:' + p.id, name: p.shortName });
      });
    }
    if (typeof COUNTRIES !== 'undefined' && typeof countryDocsProgress === 'function') {
      COUNTRIES.forEach(c => {
        const pr = countryDocsProgress(c);
        if (pr.total && pr.done === pr.total) hits.push({ key: 'c:' + c.id, name: c.name });
      });
    }
    const keys = new Set(hits.map(h => h.key));
    hits.forEach(h => {
      if (!doneSet.has(h.key)) {
        doneSet.add(h.key);
        if (!silent) { confetti(); toast('🎉 ' + h.name + ' — all documents ready!', 'ok'); }
      }
    });
    // allow re-celebration if a box gets unticked then re-ticked
    Array.from(doneSet).forEach(k => { if (!keys.has(k)) doneSet.delete(k); });
  }

  /* ============================================================
     13. BOOT
     ============================================================ */
  function boot() {
    // theme first, so nothing flashes
    let saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
    applyTheme(saved === 'light' ? 'light' : 'dark');

    const cv = $('#bg-canvas');
    if (cv && !reduced) field = ParticleField(cv);

    renderGreeting();
    renderHero();
    afterAnyRender();
    moveUnderline();
    checkCelebrations(true);

    // keep the pro layer in sync with the dashboard's own re-renders
    wrap('renderOverview', () => { renderHero(); afterAnyRender(); });
    wrap('renderDocs', () => { renderHero(); checkCelebrations(); afterAnyRender(); });
    wrap('renderErasmusDocs', afterAnyRender);
    wrap('renderCountryDocsPending', afterAnyRender);
    wrap('renderScholarshipsPanel', afterAnyRender);
    wrap('renderCountryPanel', afterAnyRender);
    wrap('renderScholarshipDetail', afterAnyRender);
    wrap('renderCountryDetail', afterAnyRender);
    wrap('renderResearch', afterAnyRender);
    wrap('renderUni', afterAnyRender);
    wrap('switchTab', () => { setTimeout(moveUnderline, 30); afterAnyRender(); });

    // ---- wiring ----
    const tb = $('#theme-btn'); if (tb) tb.addEventListener('click', toggleTheme);
    const pb = $('#palette-btn'); if (pb) pb.addEventListener('click', openPalette);
    const sb = $('#shortcut-btn'); if (sb) sb.addEventListener('click', () => $('#shortcuts').classList.add('open'));

    const pal = $('#palette');
    if (pal) {
      pal.addEventListener('click', e => { if (e.target === pal) closePalette(); });
      $('#pal-input').addEventListener('input', e => palFilter(e.target.value));
      $('#pal-results').addEventListener('click', e => {
        const it = e.target.closest('.pal-item');
        if (it) palRun(parseInt(it.dataset.i, 10));
      });
    }
    const sc = $('#shortcuts');
    if (sc) sc.addEventListener('click', e => { if (e.target === sc) sc.classList.remove('open'); });

    window.addEventListener('resize', moveUnderline, { passive: true });

    document.addEventListener('keydown', e => {
      const inField = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || '')) || e.target.isContentEditable;
      const palOpen = $('#palette').classList.contains('open');

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); palOpen ? closePalette() : openPalette(); return;
      }
      if (palOpen) {
        if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); palSel = Math.min(palSel + 1, palFiltered.length - 1); palRender(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); palSel = Math.max(palSel - 1, 0); palRender(); }
        else if (e.key === 'Enter') { e.preventDefault(); palRun(palSel); }
        return;
      }
      if (e.key === 'Escape') { $('#shortcuts').classList.remove('open'); return; }
      if (inField || e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === '?') { e.preventDefault(); $('#shortcuts').classList.toggle('open'); return; }
      if (e.key.toLowerCase() === 't') { toggleTheme(); return; }
      if (/^[1-6]$/.test(e.key)) {
        const btns = $$('#tab-nav .tab-btn');
        const b = btns[parseInt(e.key, 10) - 1];
        if (b) b.click();
      }
    });

    // lift the curtain
    const bootEl = $('#boot');
    if (bootEl) setTimeout(() => bootEl.classList.add('gone'), 420);

    setTimeout(() => toast('⌘K / Ctrl+K to search anything'), 1500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
