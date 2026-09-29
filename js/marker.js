/*
 * marker.js
 * Marking mode: open index.html?mark to draw subjects, distractions, the horizon
 * and other marks on each photo, then copy the data into data/photos.js.
 */
(function (root) {
  'use strict';

  const TOOLS = [
    ['main', 'Main subject', 'Drag a box around the main subject.'],
    ['subject', 'Other subject', 'Drag a box around something that shouldn’t be sliced by an edge.'],
    ['distraction', 'Distraction', 'Drag a box around something that pulls the eye away.'],
    ['anchor', 'Anchor point', 'Click the point of the selected subject that should sit on a third line (an eye, a sign’s center).'],
    ['pattern', 'Pattern area', 'For fill-the-frame photos: drag a box around the area the frame must stay inside.'],
    ['horizon', 'Horizon', 'Drag along the horizon. It is extended across the whole photo.'],
    ['axis', 'Symmetry line', 'For symmetry photos: click where the mirror line runs.'],
  ];

  const round = (v) => Math.round(v * 1000) / 1000;
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // JSON with short number arrays kept on one line.
  function pretty(obj) {
    return JSON.stringify(obj, (k, v) => (typeof v === 'number' ? round(v) : v), 2).replace(
      /\[\s+(-?[\d.]+(?:,\s+-?[\d.]+)*)\s+\]/g,
      (m, inner) => '[' + inner.split(/,\s+/).join(', ') + ']'
    );
  }

  function startMarker(game) {
    document.body.classList.add('mark-mode');
    const panel = document.getElementById('marker');
    panel.hidden = false;

    let tool = 'main';
    let selected = null; // { list: 'subjects' | 'distractions', i }
    let drag = null;

    panel.innerHTML = `
      <h2>Marking mode</h2>
      <p class="hint">Pick a tool, then drag on the photo. When a photo is done, copy its data into
        <code>data/photos.js</code> and reload. Leave this mode by removing <code>?mark</code> from the address.</p>
      <label class="mk-field">Rule
        <select id="mk-rule">
          <option value="thirds">Rule of thirds</option>
          <option value="center">Symmetry</option>
          <option value="fill">Fill the frame</option>
        </select>
      </label>
      <div class="mk-tools" id="mk-tools">
        ${TOOLS.map(([id, name]) => `<button type="button" class="chip" data-tool="${id}" aria-pressed="${id === tool}">${name}</button>`).join('')}
      </div>
      <p class="muted" id="mk-tip"></p>
      <ul class="mk-items" id="mk-items"></ul>
      <div class="mk-actions">
        <button type="button" class="btn" id="mk-copy">Copy this photo’s data</button>
        <button type="button" class="btn btn-quiet" id="mk-copy-all">Copy the whole file</button>
        <span class="muted" id="mk-copied" aria-live="polite"></span>
      </div>
      <textarea id="mk-json" rows="14" spellcheck="false" aria-label="Data for this photo"></textarea>
      <h3 class="mk-sub">Color data for a new photo</h3>
      <p class="hint">Pick this photo’s image file. A line is copied for you: paste it into
        <code>data/color-grids.js</code>, inside the braces, with a comma after the line before it.</p>
      <input type="file" id="mk-grid" accept="image/*">`;

    const $ = (id) => document.getElementById(id);
    const photo = () => game.photo();
    const ensureLists = () => {
      photo().subjects = photo().subjects || [];
      photo().distractions = photo().distractions || [];
    };

    function setTool(id) {
      tool = id;
      $('mk-tools').querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.tool === id)));
      $('mk-tip').textContent = TOOLS.find((t) => t[0] === id)[2];
    }

    $('mk-tools').addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (chip) setTool(chip.dataset.tool);
    });

    $('mk-rule').addEventListener('change', (e) => {
      photo().rule = e.target.value;
      refresh();
    });

    // ---- Item list ------------------------------------------------------------------------

    function renderList() {
      ensureLists();
      const rows = [];
      photo().subjects.forEach((s, i) => {
        const isSel = selected && selected.list === 'subjects' && selected.i === i;
        rows.push(`
          <li class="mk-item${isSel ? ' is-selected' : ''}" data-list="subjects" data-i="${i}">
            <span class="mk-kind mk-kind-subject">${s.main ? 'Main subject' : 'Subject'}</span>
            <input type="text" class="mk-label" value="${esc(s.label || '')}" aria-label="Label">
            <label class="mk-check"><input type="checkbox" class="mk-cropok" ${s.cropOK ? 'checked' : ''}> OK to crop</label>
            <button type="button" class="mk-remove" aria-label="Remove">×</button>
          </li>`);
      });
      photo().distractions.forEach((d, i) => {
        const isSel = selected && selected.list === 'distractions' && selected.i === i;
        rows.push(`
          <li class="mk-item${isSel ? ' is-selected' : ''}" data-list="distractions" data-i="${i}">
            <span class="mk-kind mk-kind-distraction">Distraction</span>
            <input type="text" class="mk-label" value="${esc(d.label || '')}" aria-label="Label">
            <label class="mk-check">Weight
              <select class="mk-weight">${[1, 2, 3].map((w) => `<option ${w === (d.weight || 1) ? 'selected' : ''}>${w}</option>`).join('')}</select>
            </label>
            <button type="button" class="mk-remove" aria-label="Remove">×</button>
          </li>`);
      });
      $('mk-items').innerHTML = rows.join('') || '<li class="muted">Nothing marked yet.</li>';
    }

    const itemOf = (node) => {
      const li = node.closest('.mk-item');
      return li ? { list: li.dataset.list, i: Number(li.dataset.i) } : null;
    };

    $('mk-items').addEventListener('input', (e) => {
      const it = itemOf(e.target);
      if (!it) return;
      const obj = photo()[it.list][it.i];
      if (e.target.classList.contains('mk-label')) obj.label = e.target.value;
      if (e.target.classList.contains('mk-weight')) obj.weight = Number(e.target.value);
      if (e.target.classList.contains('mk-cropok')) {
        if (e.target.checked) obj.cropOK = true;
        else delete obj.cropOK;
      }
      renderMarks();
      renderJson();
    });

    $('mk-items').addEventListener('click', (e) => {
      const it = itemOf(e.target);
      if (!it) return;
      if (e.target.classList.contains('mk-remove')) {
        photo()[it.list].splice(it.i, 1);
        selected = null;
        refresh();
        return;
      }
      if (e.target.matches('input, select, label')) return;
      selected = it;
      renderList();
      renderMarks();
    });

    // ---- Drawing on the photo ------------------------------------------------------------------

    game.photoEl.addEventListener('pointerdown', (e) => {
      const p = game.pointFromEvent(e);
      ensureLists();
      if (tool === 'anchor') {
        let target = selected && selected.list === 'subjects' ? photo().subjects[selected.i] : null;
        if (!target) target = photo().subjects.find((s) => s.main);
        if (target) target.anchor = [round(p.x), round(p.y)];
        refresh();
        return;
      }
      if (tool === 'axis') {
        photo().axis = round(p.x);
        refresh();
        return;
      }
      drag = { start: p, now: p };
      game.photoEl.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    game.photoEl.addEventListener('pointermove', (e) => {
      if (!drag) return;
      drag.now = game.pointFromEvent(e);
      renderMarks();
    });

    game.photoEl.addEventListener('pointerup', () => {
      if (!drag) return;
      const { start: a, now: b } = drag;
      drag = null;
      const box = [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)].map(round);
      const center = [round(box[0] + box[2] / 2), round(box[1] + box[3] / 2)];

      if (tool === 'horizon') {
        const dx = b.x - a.x;
        if (Math.abs(dx) > 0.02) {
          const slope = (b.y - a.y) / dx;
          photo().horizon = [0, round(a.y - slope * a.x), 1, round(a.y + slope * (1 - a.x))];
        }
      } else if (box[2] > 0.005 && box[3] > 0.005) {
        if (tool === 'main') {
          photo().subjects.forEach((s) => delete s.main);
          photo().subjects.unshift({ label: 'main subject', main: true, box, anchor: center });
          selected = { list: 'subjects', i: 0 };
        } else if (tool === 'subject') {
          photo().subjects.push({ label: 'subject', box, anchor: center });
          selected = { list: 'subjects', i: photo().subjects.length - 1 };
        } else if (tool === 'distraction') {
          photo().distractions.push({ label: 'distraction', box, weight: 2 });
          selected = { list: 'distractions', i: photo().distractions.length - 1 };
        } else if (tool === 'pattern') {
          photo().pattern = box;
        }
      }
      refresh();
    });

    // ---- Drawing the marks ----------------------------------------------------------------------

    function renderMarks() {
      const N = game.natural();
      const unit = Math.min(N.w, N.h);
      const fs = unit * 0.03;
      const X = (v) => (v * N.w).toFixed(1);
      const Y = (v) => (v * N.h).toFixed(1);
      const out = [];
      const rect = (b, cls) => `<rect class="${cls}" x="${X(b[0])}" y="${Y(b[1])}" width="${X(b[2])}" height="${Y(b[3])}"/>`;
      const label = (text, x, y, cls) =>
        `<text class="mk-text ${cls}" x="${x}" y="${y}" font-size="${fs.toFixed(1)}" stroke-width="${(fs * 0.2).toFixed(1)}">${esc(text)}</text>`;
      const p = photo();

      if (p.pattern) out.push(rect(p.pattern, 'mk-pattern'));
      if (p.horizon) {
        const [x1, y1, x2, y2] = p.horizon;
        out.push(`<line class="mk-horizon" x1="${X(x1)}" y1="${Y(y1)}" x2="${X(x2)}" y2="${Y(y2)}"/>`);
      }
      if (typeof p.axis === 'number') out.push(`<line class="mk-axis" x1="${X(p.axis)}" y1="0" x2="${X(p.axis)}" y2="${N.h}"/>`);

      (p.subjects || []).forEach((s, i) => {
        const sel = selected && selected.list === 'subjects' && selected.i === i;
        out.push(rect(s.box, `mk-subject${s.main ? ' is-main' : ''}${sel ? ' is-selected' : ''}`));
        out.push(label(s.label || '', X(s.box[0]), (s.box[1] * N.h - fs * 0.3).toFixed(1), 'mk-text-subject'));
        if (s.anchor) out.push(`<circle class="mk-anchor" cx="${X(s.anchor[0])}" cy="${Y(s.anchor[1])}" r="${(unit * 0.008).toFixed(1)}"/>`);
      });
      (p.distractions || []).forEach((d, i) => {
        const sel = selected && selected.list === 'distractions' && selected.i === i;
        out.push(rect(d.box, `mk-distraction${sel ? ' is-selected' : ''}`));
        out.push(label(`${d.label || ''} (${d.weight || 1})`, X(d.box[0]), (d.box[1] * N.h + fs * 1.1).toFixed(1), 'mk-text-distraction'));
      });

      if (drag) {
        const a = drag.start;
        const b = drag.now;
        if (tool === 'horizon') out.push(`<line class="mk-preview" x1="${X(a.x)}" y1="${Y(a.y)}" x2="${X(b.x)}" y2="${Y(b.y)}"/>`);
        else out.push(rect([Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)], 'mk-preview'));
      }
      game.marksEl.innerHTML = `<g stroke-width="${(unit * 0.004).toFixed(1)}">${out.join('')}</g>`;
    }

    function renderJson() {
      $('mk-json').value = pretty(photo());
    }

    function refresh() {
      $('mk-rule').value = photo().rule || 'thirds';
      renderList();
      renderMarks();
      renderJson();
    }

    async function copy(text) {
      try {
        await navigator.clipboard.writeText(text);
        $('mk-copied').textContent = 'Copied.';
      } catch (e) {
        $('mk-json').value = text;
        $('mk-json').select();
        $('mk-copied').textContent = 'Press Ctrl+C or ⌘C to copy the selected text.';
      }
      setTimeout(() => ($('mk-copied').textContent = ''), 2500);
    }

    $('mk-copy').addEventListener('click', () => copy(pretty(photo())));
    $('mk-copy-all').addEventListener('click', () =>
      copy(
        '// Hand-marked data for each photo. Edit it here, or use marking mode (open index.html?mark).\n' +
          `window.CAMERA_EYE_PHOTOS = ${pretty({ photos: game.photos })};\n`
      )
    );

    // A small copy of a photo, readable even when the game is opened by double-click.
    $('mk-grid').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, 240 / Math.max(img.naturalWidth, img.naturalHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.naturalWidth * scale);
          canvas.height = Math.round(img.naturalHeight * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          const line = `  "${photo().id}": "${canvas.toDataURL('image/jpeg', 0.88)}"`;
          $('mk-json').value = line;
          copy(line);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });

    game.onPhotoChange(() => {
      selected = null;
      refresh();
    });
    setTool(tool);
    refresh();
  }

  root.CameraEye = Object.assign(root.CameraEye || {}, { startMarker });
})(window);
