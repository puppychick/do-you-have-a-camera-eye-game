/*
 * game.js
 * Runs the game: loads the photos and their marks, handles the viewfinder,
 * scores a shot with composition.js and color.js, and shows the result.
 */
(function () {
  'use strict';

  const CE = window.CameraEye;
  const MARK_MODE = new URLSearchParams(location.search).has('mark');

  const WEIGHTS = { composition: 0.7, color: 0.3 };
  const MIN_SIDE = 0.15; // smallest crop side, as a share of the photo's shorter side
  const COLOR_GRID = 240; // long edge of the pixel grid used for color scoring
  const BASELINE_SAMPLES = 160; // random crops used to rank the player's colors
  const STARS_AT = [50, 70, 85]; // total needed for 1, 2 and 3 stars
  const TITLES = ['Missed shot', 'Keep practicing', 'Almost there', 'Camera eye!'];
  const RULE_NAMES = { thirds: 'rule of thirds', center: 'symmetry', fill: 'fill the frame' };
  const RATIOS = [
    ['Free', null],
    ['1:1', 1],
    ['4:5', 4 / 5],
    ['3:2', 3 / 2],
    ['16:9', 16 / 9],
    ['9:16', 9 / 16],
  ];

  const $ = (sel) => document.querySelector(sel);
  const el = {
    strip: $('#strip'),
    stage: $('#stage'),
    photo: $('#photo'),
    img: $('#photo-img'),
    frame: $('#frame'),
    shade: $('#shade'),
    marks: $('#marks'),
    flash: $('#flash'),
    ratios: $('#ratios'),
    shoot: $('#shoot'),
    result: $('#result'),
  };

  const state = {
    photos: [],
    index: 0,
    nat: { w: 1, h: 1 },
    frame: { x: 0.2, y: 0.2, w: 0.6, h: 0.6 },
    ratio: null,
    shot: false,
    pixels: null, // color data for the current photo
    baseline: [], // color scores of random crops, sorted
    colorProblem: false,
  };
  const listeners = [];

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---- Start -----------------------------------------------------------------

  function start() {
    const data = window.CAMERA_EYE_PHOTOS;
    state.photos = (data && data.photos) || [];
    if (!state.photos.length) {
      el.result.innerHTML =
        '<h2>The photos didn’t load</h2>' +
        '<p class="hint">The game couldn’t read <code>data/photos.js</code>. If you just edited it, ' +
        'check for a missing comma, quote or bracket near your change.</p>';
      return;
    }

    buildStrip();
    buildRatios();
    bindViewfinder();
    el.shoot.addEventListener('click', toggleShot);
    window.addEventListener('resize', layout);
    loadPhoto(0);
    if (MARK_MODE && CE.startMarker) CE.startMarker(api);
  }

  // ---- Photo strip -------------------------------------------------------------

  function loadBest() {
    try {
      return JSON.parse(localStorage.getItem('camera-eye-best') || '{}');
    } catch (e) {
      return {};
    }
  }

  function saveBest(id, stars) {
    const best = loadBest();
    if ((best[id] || 0) >= stars) return;
    best[id] = stars;
    try {
      localStorage.setItem('camera-eye-best', JSON.stringify(best));
    } catch (e) {
      /* private mode: skip */
    }
  }

  function buildStrip() {
    el.strip.innerHTML = state.photos
      .map(
        (p, i) =>
          `<button type="button" class="strip-item" data-i="${i}" aria-label="Photo ${i + 1}: ${esc(p.title)}">` +
          `<img src="${esc(p.thumb || p.file)}" alt="" loading="lazy">` +
          `<span class="strip-meta"><span>${i + 1}</span><span class="strip-stars"></span></span>` +
          '</button>'
      )
      .join('');
    el.strip.addEventListener('click', (e) => {
      const item = e.target.closest('.strip-item');
      if (item) loadPhoto(Number(item.dataset.i));
    });
  }

  function updateStrip() {
    const best = loadBest();
    el.strip.querySelectorAll('.strip-item').forEach((item, i) => {
      const stars = best[state.photos[i].id] || 0;
      item.querySelector('.strip-stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
      item.querySelector('.strip-stars').setAttribute('aria-label', `best ${stars} of 3 stars`);
      item.setAttribute('aria-current', i === state.index ? 'true' : 'false');
    });
  }

  // ---- Loading a photo -----------------------------------------------------------

  function loadPhoto(i) {
    state.index = i;
    state.pixels = null;
    state.baseline = [];
    state.colorProblem = false;
    state.colorReady = null;
    resetShot();
    showIntro();
    updateStrip();

    const photo = state.photos[i];
    const onLoaded = () => {
      state.nat = { w: el.img.naturalWidth, h: el.img.naturalHeight };
      el.marks.setAttribute('viewBox', `0 0 ${state.nat.w} ${state.nat.h}`);
      state.frame = startFrame(photo);
      if (state.ratio) applyRatio(state.ratio);
      layout();
      renderFrame();
      listeners.forEach((fn) => fn());
      // Let the photo paint first, then read its colors.
      state.colorReady = new Promise((r) => setTimeout(r, 30)).then(prepareColors);
    };
    el.img.alt = photo.title;
    el.img.onload = onLoaded;
    // Re-picking the same photo doesn't fire a new load event.
    if (el.img.getAttribute('src') === photo.file && el.img.complete && el.img.naturalWidth) onLoaded();
    else el.img.src = photo.file;
  }

  // A random starting frame that still needs work, so there is something to fix.
  function startFrame(photo) {
    let best = null;
    for (let k = 0; k < 40; k++) {
      const w = 0.45 + Math.random() * 0.25;
      const h = 0.45 + Math.random() * 0.25;
      const f = { x: Math.random() * (1 - w), y: Math.random() * (1 - h), w, h };
      const score = CE.scoreComposition(photo, f).score;
      if (score < 60) return f;
      if (!best || score < best.score) best = { f, score };
    }
    return best.f;
  }

  // Read the photo's colors. The small copy in data/color-grids.js works even when the
  // game is opened by double-click; without it, browsers only allow this through a server.
  function prepareColors() {
    const photo = state.photos[state.index];
    const grid = (window.CAMERA_EYE_COLOR_GRIDS || {})[photo.id];
    const source = new Promise((resolve) => {
      if (!grid) return resolve(el.img);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(el.img);
      img.src = grid;
    });
    return source.then((img) => {
      if (state.photos[state.index] === photo) readPixels(img);
    });
  }

  function readPixels(img) {
    const scale = Math.min(1, COLOR_GRID / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    try {
      state.pixels = CE.prepareColor(ctx.getImageData(0, 0, w, h).data, w, h);
    } catch (err) {
      state.colorProblem = true;
      return;
    }

    const min = minSize();
    const scores = [];
    for (let k = 0; k < BASELINE_SAMPLES; k++) {
      const fw = min.w + Math.random() * (1 - min.w);
      const fh = min.h + Math.random() * (1 - min.h);
      const f = { x: Math.random() * (1 - fw), y: Math.random() * (1 - fh), w: fw, h: fh };
      scores.push(CE.scoreColor(state.pixels, regionFor(f)).score);
    }
    state.baseline = scores.sort((a, b) => a - b);
  }

  function regionFor(f) {
    const px = state.pixels;
    const x0 = clamp(Math.floor(f.x * px.width), 0, px.width - 1);
    const y0 = clamp(Math.floor(f.y * px.height), 0, px.height - 1);
    return {
      x0,
      y0,
      x1: clamp(Math.round((f.x + f.w) * px.width), x0 + 1, px.width),
      y1: clamp(Math.round((f.y + f.h) * px.height), y0 + 1, px.height),
    };
  }

  // Share of random crops whose colors scored lower (ties count half).
  function percentile(score) {
    const list = state.baseline;
    if (!list.length) return 0.5;
    let below = 0;
    let equal = 0;
    for (const s of list) {
      if (s < score) below++;
      else if (s === score) equal++;
    }
    return (below + equal / 2) / list.length;
  }

  // ---- Layout and the viewfinder -----------------------------------------------------

  function layout() {
    const available = el.stage.clientWidth;
    const maxHeight = Math.max(260, Math.min(window.innerHeight * 0.72, 820));
    const s = Math.min(available / state.nat.w, maxHeight / state.nat.h);
    el.photo.style.width = Math.round(state.nat.w * s) + 'px';
    el.photo.style.height = Math.round(state.nat.h * s) + 'px';
  }

  function minSize() {
    const side = MIN_SIDE * Math.min(state.nat.w, state.nat.h);
    return { w: side / state.nat.w, h: side / state.nat.h };
  }

  // The frame (with its handles) and the shade that dims everything outside it.
  function renderFrame() {
    const f = state.frame;
    [el.frame, el.shade].forEach((node) => {
      const s = node.style;
      s.left = f.x * 100 + '%';
      s.top = f.y * 100 + '%';
      s.width = f.w * 100 + '%';
      s.height = f.h * 100 + '%';
    });
  }

  // Photo fractions per unit of frame width → height, for a locked shape.
  const heightPerWidth = (ratio) => state.nat.w / (ratio * state.nat.h);

  function applyRatio(ratio) {
    state.ratio = ratio;
    el.frame.classList.toggle('is-locked', !!ratio);
    if (!ratio) return;
    const f = state.frame;
    const k = heightPerWidth(ratio);
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h / 2;
    let w = Math.sqrt((f.w * f.h) / k); // keep roughly the same area
    let h = w * k;
    const min = minSize();
    if (w < min.w) (w = min.w), (h = w * k);
    if (h < min.h) (h = min.h), (w = h / k);
    const fit = Math.min(1, 1 / w, 1 / h);
    w *= fit;
    h *= fit;
    state.frame = { x: clamp(cx - w / 2, 0, 1 - w), y: clamp(cy - h / 2, 0, 1 - h), w, h };
  }

  function buildRatios() {
    el.ratios.innerHTML = RATIOS.map(
      ([label], i) => `<button type="button" class="chip" data-i="${i}" aria-pressed="${i === 0}">${label}</button>`
    ).join('');
    el.ratios.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip || state.shot) return;
      el.ratios.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      applyRatio(RATIOS[Number(chip.dataset.i)][1]);
      renderFrame();
    });
  }

  // Resize from a handle ('n', 'se', ...) while the opposite side stays put.
  function resizeFrame(handle, s, p) {
    const min = minSize();
    const W = handle.includes('w');
    const E = handle.includes('e');
    const N = handle.includes('n');
    const S = handle.includes('s');
    let x0 = s.x;
    let y0 = s.y;
    let x1 = s.x + s.w;
    let y1 = s.y + s.h;
    if (W) x0 = Math.min(p.x, x1 - min.w);
    if (E) x1 = Math.max(p.x, x0 + min.w);
    if (N) y0 = Math.min(p.y, y1 - min.h);
    if (S) y1 = Math.max(p.y, y0 + min.h);

    const locked = state.ratio && (W || E) && (N || S);
    if (locked) {
      const k = heightPerWidth(state.ratio);
      let w = x1 - x0;
      let h = y1 - y0;
      if (h < w * k) h = w * k;
      else w = h / k;
      if (W) x0 = x1 - w;
      else x1 = x0 + w;
      if (N) y0 = y1 - h;
      else y1 = y0 + h;
    }

    // Keep inside the photo; for a locked shape, shrink to fit instead of stretching.
    x0 = Math.max(0, x0);
    y0 = Math.max(0, y0);
    x1 = Math.min(1, x1);
    y1 = Math.min(1, y1);
    if (locked) {
      const k = heightPerWidth(state.ratio);
      let w = x1 - x0;
      let h = y1 - y0;
      if (h > w * k) h = w * k;
      else w = h / k;
      if (W) x0 = x1 - w;
      else x1 = x0 + w;
      if (N) y0 = y1 - h;
      else y1 = y0 + h;
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  function pointFromEvent(e) {
    const r = el.photo.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp((e.clientY - r.top) / r.height, 0, 1) };
  }

  function bindViewfinder() {
    let drag = null;

    el.photo.addEventListener('pointerdown', (e) => {
      if (MARK_MODE || state.shot || e.button > 0) return;
      const handle = e.target.dataset ? e.target.dataset.handle : undefined;
      const p = pointFromEvent(e);
      el.photo.setPointerCapture(e.pointerId);
      if (handle === 'move') drag = { kind: 'move', p0: p, start: { ...state.frame } };
      else if (handle) drag = { kind: 'resize', handle, start: { ...state.frame } };
      else drag = { kind: 'new', origin: p }; // drag on the dimmed area draws a new frame
      el.photo.classList.add('is-dragging');
      e.preventDefault();
    });

    el.photo.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const p = pointFromEvent(e);
      if (drag.kind === 'move') {
        const s = drag.start;
        state.frame = { ...s, x: clamp(s.x + p.x - drag.p0.x, 0, 1 - s.w), y: clamp(s.y + p.y - drag.p0.y, 0, 1 - s.h) };
      } else if (drag.kind === 'resize') {
        state.frame = resizeFrame(drag.handle, drag.start, p);
      } else {
        const o = drag.origin;
        const handle = (p.y < o.y ? 'n' : 's') + (p.x < o.x ? 'w' : 'e');
        state.frame = resizeFrame(handle, { x: o.x, y: o.y, w: 0, h: 0 }, p);
      }
      renderFrame();
    });

    const end = () => {
      drag = null;
      el.photo.classList.remove('is-dragging');
    };
    el.photo.addEventListener('pointerup', end);
    el.photo.addEventListener('pointercancel', end);

    el.frame.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleShot();
        return;
      }
      if (state.shot) return;
      const f = state.frame;
      const step = e.shiftKey ? 0.05 : 0.01;
      const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (moves[e.key]) {
        e.preventDefault();
        state.frame = { ...f, x: clamp(f.x + moves[e.key][0], 0, 1 - f.w), y: clamp(f.y + moves[e.key][1], 0, 1 - f.h) };
      } else if (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_') {
        e.preventDefault();
        const grow = e.key === '+' || e.key === '=' ? 1.05 : 1 / 1.05;
        const min = minSize();
        let w = f.w * grow;
        let h = f.h * grow;
        const fit = Math.min(1, 1 / w, 1 / h);
        w *= fit;
        h *= fit;
        if (w < min.w || h < min.h) return;
        const cx = f.x + f.w / 2;
        const cy = f.y + f.h / 2;
        state.frame = { x: clamp(cx - w / 2, 0, 1 - w), y: clamp(cy - h / 2, 0, 1 - h), w, h };
      } else {
        return;
      }
      renderFrame();
    });
  }

  // ---- Shooting ------------------------------------------------------------------------

  function toggleShot() {
    if (state.shot) resetShot(true);
    else shoot();
  }

  async function shoot() {
    if (!state.photos.length) return;
    const photo = state.photos[state.index];
    const f = { ...state.frame };
    state.shot = true;
    if (state.colorReady) await state.colorReady; // a shot right after loading waits for the colors
    if (state.photos[state.index] !== photo) return;

    const comp = CE.scoreComposition(photo, f);
    let color = null;
    if (state.pixels) {
      const c = CE.scoreColor(state.pixels, regionFor(f));
      const rank = percentile(c.score);
      // Half absolute, half relative to what this photo allows.
      color = { ...c, rank, score: Math.round(0.5 * c.score + 0.5 * rank * 100) };
    }
    const total = color
      ? Math.round(WEIGHTS.composition * comp.score + WEIGHTS.color * color.score)
      : comp.score;
    const stars = STARS_AT.filter((v) => total >= v).length;

    saveBest(photo.id, stars);
    updateStrip();
    flash();
    drawMarks(photo, f, comp);
    showResult({ photo, f, comp, color, total, stars });

    el.photo.classList.add('is-shot');
    el.shoot.textContent = 'Try again';
  }

  // Back to framing. The frame stays where it was so the player can fix the shot.
  function resetShot(keepResult) {
    state.shot = false;
    el.marks.innerHTML = '';
    el.photo.classList.remove('is-shot');
    el.shoot.textContent = 'Shoot';
    if (keepResult && el.result.querySelector('.stars')) {
      el.result.classList.add('is-past');
      if (!el.result.querySelector('.past-label')) {
        el.result.insertAdjacentHTML('afterbegin', '<p class="past-label">Your last shot</p>');
      }
    }
  }

  function flash() {
    el.flash.classList.remove('is-on');
    void el.flash.offsetWidth; // restart the animation
    el.flash.classList.add('is-on');
  }

  // ---- Result -------------------------------------------------------------------------------

  function showIntro() {
    el.result.classList.remove('is-past');
    el.result.innerHTML =
      '<p class="hint">Drag the viewfinder to move it, pull its corners to resize, or drag across the dark area ' +
      'to draw a new frame. Pick a shape if you want one. When the shot feels right, press Shoot.</p>';
  }

  function showResult({ photo, f, comp, color, total, stars }) {
    const list = (items, cls) =>
      items.length ? `<ul class="${cls}">${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '';

    const colorPart = color
      ? `<section class="part">
           <h3>Color <span class="part-score">${color.score}</span></h3>
           <p>${esc(color.description)}</p>
           <p class="muted">Your colors beat ${Math.round(color.rank * 100)}% of the crops you could take from this photo.</p>
         </section>`
      : `<section class="part">
           <h3>Color</h3>
           <p class="muted">Color wasn’t scored: this photo has no color data yet. Make it in marking mode and add it to <code>data/color-grids.js</code>.</p>
         </section>`;

    el.result.classList.remove('is-past');
    el.result.innerHTML = `
      <div class="print-layout">
        <figure class="print-photo"><canvas id="print-canvas" aria-label="Your crop"></canvas></figure>
        <div class="print-text">
          <p class="stars"><span aria-hidden="true">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span><span class="visually-hidden">${stars} out of 3 stars</span></p>
          <h2>${TITLES[stars]}</h2>
          <p class="total"><strong>${total}</strong> out of 100</p>
          <section class="part">
            <h3>Composition <span class="part-score">${comp.score}</span></h3>
            <p class="muted">This photo is judged on ${RULE_NAMES[photo.rule] || photo.rule}.</p>
            ${list(comp.fixes.slice(0, 3), 'fixes')}
            ${list(comp.good.slice(0, 3), 'good')}
          </section>
          ${colorPart}
          <div class="result-actions">
            <button type="button" class="btn" id="next-photo">Next photo</button>
          </div>
        </div>
      </div>`;

    drawPrint(f);
    $('#next-photo').addEventListener('click', () => loadPhoto((state.index + 1) % state.photos.length));
  }

  function drawPrint(f) {
    const canvas = $('#print-canvas');
    const sw = f.w * state.nat.w;
    const sh = f.h * state.nat.h;
    const scale = Math.min(1, 900 / Math.max(sw, sh));
    canvas.width = Math.round(sw * scale);
    canvas.height = Math.round(sh * scale);
    canvas.getContext('2d').drawImage(el.img, f.x * state.nat.w, f.y * state.nat.h, sw, sh, 0, 0, canvas.width, canvas.height);
  }

  // ---- Marks on the photo after Shoot -------------------------------------------------------------

  function drawMarks(photo, f, comp) {
    const N = state.nat;
    const m = comp.marks;
    const unit = Math.min(N.w, N.h);
    const X = (v) => (v * N.w).toFixed(1);
    const Y = (v) => (v * N.h).toFixed(1);
    const fx0 = f.x * N.w;
    const fy0 = f.y * N.h;
    const fx1 = (f.x + f.w) * N.w;
    const fy1 = (f.y + f.h) * N.h;
    const r = unit * 0.03;
    const fontSize = unit * 0.035;
    const dash = `${(unit * 0.014).toFixed(1)} ${(unit * 0.01).toFixed(1)}`;
    const out = [];

    out.push(
      '<defs>' +
        `<clipPath id="frame-clip"><rect x="${fx0}" y="${fy0}" width="${fx1 - fx0}" height="${fy1 - fy0}"/></clipPath>` +
        `<filter id="pencil" filterUnits="userSpaceOnUse" x="0" y="0" width="${N.w}" height="${N.h}">` +
        `<feTurbulence type="fractalNoise" baseFrequency="${(8 / unit).toFixed(4)}" numOctaves="2" seed="4" result="noise"/>` +
        `<feDisplacementMap in="SourceGraphic" in2="noise" scale="${(unit * 0.006).toFixed(1)}"/>` +
        '</filter>' +
        '<marker id="arrowhead" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto">' +
        '<path class="arrowhead" d="M1 1 L8 5 L1 9"/></marker>' +
        '</defs>'
    );

    // Guides in white.
    const guides = [];
    if (photo.rule === 'thirds') {
      [1 / 3, 2 / 3].forEach((t, i) => {
        const gx = fx0 + (fx1 - fx0) * t;
        const gy = fy0 + (fy1 - fy0) * t;
        guides.push(`<line class="draw" style="--i:${i * 2}" pathLength="1" x1="${gx}" y1="${fy0}" x2="${gx}" y2="${fy1}"/>`);
        guides.push(`<line class="draw" style="--i:${i * 2 + 1}" pathLength="1" x1="${fx0}" y1="${gy}" x2="${fx1}" y2="${gy}"/>`);
      });
    } else if (photo.rule === 'center') {
      const cx = (fx0 + fx1) / 2;
      guides.push(`<line stroke-dasharray="${dash}" x1="${cx}" y1="${fy0}" x2="${cx}" y2="${fy1}"/>`);
    }
    if (m.horizonY != null) {
      const hy = m.horizonY * N.h;
      guides.push(`<line stroke-dasharray="${dash}" x1="${fx0}" y1="${hy}" x2="${fx1}" y2="${hy}"/>`);
    }
    out.push(`<g class="guides" clip-path="url(#frame-clip)" stroke-width="${(unit * 0.0025).toFixed(2)}">${guides.join('')}</g>`);
    if (photo.rule === 'fill' && m.pattern) {
      // Show the whole pattern area, so it's clear where the frame has to stay.
      const [px, py, pw, ph] = m.pattern;
      out.push(
        `<rect class="guides" stroke-width="${(unit * 0.0025).toFixed(2)}" stroke-dasharray="${dash}" ` +
          `x="${X(px)}" y="${Y(py)}" width="${X(pw)}" height="${Y(ph)}"/>`
      );
    }

    // Red grease pencil: targets, distractions, cut edges.
    const pencil = [];
    const notes = [];
    const note = (text, x, y, anchor) =>
      notes.push(
        `<text class="note" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor || 'start'}" ` +
          `font-size="${fontSize.toFixed(1)}" stroke-width="${(fontSize * 0.2).toFixed(1)}">${esc(text)}</text>`
      );

    if (m.target && m.anchor) {
      const [tx, ty] = [m.target[0] * N.w, m.target[1] * N.h];
      const [ax, ay] = [m.anchor[0] * N.w, m.anchor[1] * N.h];
      pencil.push(`<circle class="draw" pathLength="1" cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="${r.toFixed(1)}"/>`);
      const dist = Math.hypot(tx - ax, ty - ay);
      if (dist > r * 1.6) {
        const ux = (tx - ax) / dist;
        const uy = (ty - ay) / dist;
        pencil.push(
          `<path class="draw" pathLength="1" marker-end="url(#arrowhead)" d="M${(ax + ux * r * 0.5).toFixed(1)} ${(ay + uy * r * 0.5).toFixed(1)} L${(tx - ux * r * 1.2).toFixed(1)} ${(ty - uy * r * 1.2).toFixed(1)}"/>`
        );
      }
      note('sweet spot', tx, ty - r - fontSize * 0.4, 'middle');
    }

    if (m.axis != null) {
      const ax = m.axis * N.w;
      pencil.push(`<line class="draw" pathLength="1" x1="${ax.toFixed(1)}" y1="${fy0}" x2="${ax.toFixed(1)}" y2="${fy1}"/>`);
      const inside = ax > fx0 && ax < fx1;
      if (inside) note('symmetry line', ax + fontSize * 0.3, fy0 + fontSize * 1.4);
    }

    m.distractions.forEach((d) => {
      const x = d.rect.x * N.w;
      const y = d.rect.y * N.h;
      const w = d.rect.w * N.w;
      const h = d.rect.h * N.h;
      pencil.push(`<rect class="draw" pathLength="1" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}"/>`);
      const ly = clamp(y + fontSize * 1.2, fy0 + fontSize * 1.2, fy1 - fontSize * 0.4);
      // Keep the label inside the frame: if it would run off the right, end it at the right.
      const textWidth = d.label.length * fontSize * 0.52;
      if (x + fontSize * 0.3 + textWidth > fx1) note(d.label, Math.max(fx0 + textWidth, fx1 - fontSize * 0.3), ly, 'end');
      else note(d.label, x + fontSize * 0.3, ly);
    });

    const inset = unit * 0.006;
    const edgeLine = {
      top: [fx0 + inset, fy0 + inset, fx1 - inset, fy0 + inset],
      bottom: [fx0 + inset, fy1 - inset, fx1 - inset, fy1 - inset],
      left: [fx0 + inset, fy0 + inset, fx0 + inset, fy1 - inset],
      right: [fx1 - inset, fy0 + inset, fx1 - inset, fy1 - inset],
    };
    m.edges.forEach((e) => {
      const [x1, y1, x2, y2] = edgeLine[e];
      pencil.push(`<line class="draw" pathLength="1" stroke-width="${(unit * 0.012).toFixed(1)}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`);
    });

    out.push(
      `<g clip-path="url(#frame-clip)"><g class="pencil" filter="url(#pencil)" stroke-width="${(unit * 0.006).toFixed(1)}">${pencil.join('')}</g></g>`
    );
    if (m.anchor) {
      out.push(
        `<circle class="anchor-dot" cx="${X(m.anchor[0])}" cy="${Y(m.anchor[1])}" r="${(r * 0.3).toFixed(1)}" stroke-width="${(unit * 0.003).toFixed(1)}"/>`
      );
    }
    if (m.horizonY != null) note('horizon', fx0 + fontSize * 0.4, m.horizonY * N.h - fontSize * 0.35);
    out.push(`<g clip-path="url(#frame-clip)">${notes.join('')}</g>`);

    el.marks.innerHTML = out.join('');
  }

  // ---- Shared with marker.js -------------------------------------------------------------------

  const api = {
    get photos() {
      return state.photos;
    },
    get index() {
      return state.index;
    },
    photo: () => state.photos[state.index],
    natural: () => state.nat,
    photoEl: el.photo,
    marksEl: el.marks,
    pointFromEvent,
    onPhotoChange: (fn) => listeners.push(fn),
  };

  start();
})();
