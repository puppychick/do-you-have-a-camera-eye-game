/*
 * composition.js
 * Scores how a crop is framed, using the hand-marked data in data/photos.js.
 * Pure logic with no DOM access.
 *
 * Every position is a fraction of the photo: x 0 = left edge, 1 = right edge;
 * y 0 = top edge, 1 = bottom edge. A frame is { x, y, w, h } in the same units.
 */
(function (root) {
  'use strict';

  const THIRD = 1 / 3;

  // Tuning knobs. "Frame" distances are fractions of the crop, not of the photo.
  const TUNING = {
    lineTolerance: 0.12, // subject within this of a third line still earns some placement credit
    pointTolerance: 0.2, // ...and within this of a third-line crossing earns the bonus
    axisTolerance: 0.06, // symmetry line within this of the frame's center
    fillNeeded: 0.97, // share of the frame that must be pattern for full marks
    placementPoints: 35,
    missingScore: 10,
    distractionPoints: 8, // per weight unit when fully in the frame
    distractionCap: 40,
    secondaryCutPoints: 6,
    secondaryCutCap: 12,
    horizonPoints: 10,
    tinySubject: 0.015, // main subject smaller than this share of the frame is "lost"
  };

  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const toRect = (b) => ({ x: b[0], y: b[1], w: b[2], h: b[3] });
  const area = (r) => (r ? r.w * r.h : 0);

  function overlap(a, b) {
    const x = Math.max(a.x, b.x);
    const y = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.w, b.x + b.w);
    const y2 = Math.min(a.y + a.h, b.y + b.h);
    return x2 > x && y2 > y ? { x, y, w: x2 - x, h: y2 - y } : null;
  }

  // Frame edges that a box sticks out past (only meaningful when they overlap).
  function edgesCrossed(box, f) {
    const e = [];
    const eps = 1e-4;
    if (box.y < f.y - eps) e.push('top');
    if (box.y + box.h > f.y + f.h + eps) e.push('bottom');
    if (box.x < f.x - eps) e.push('left');
    if (box.x + box.w > f.x + f.w + eps) e.push('right');
    return e;
  }

  function joinWords(list) {
    if (list.length <= 1) return list[0] || '';
    return list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
  }

  const inFrame = (p, f) => [(p[0] - f.x) / f.w, (p[1] - f.y) / f.h];
  const center = (b) => [b[0] + b[2] / 2, b[1] + b[3] / 2];

  /**
   * @param {object} photo  one entry from data/photos.js
   * @param {object} f      the crop { x, y, w, h }
   * @returns {{ score, fixes, good, marks }}
   */
  function scoreComposition(photo, f, overrides) {
    const t = Object.assign({}, TUNING, overrides);
    const fixes = []; // { text, cost }
    const good = [];
    const marks = { edges: new Set(), distractions: [], anchor: null, target: null, axis: null, horizonY: null };
    let score = 100;
    const lose = (cost, text) => {
      if (cost <= 0.5) return;
      score -= cost;
      if (text) fixes.push({ text, cost });
    };

    const subjects = photo.subjects || [];
    const main = subjects.find((s) => s.main);
    const mainName = main ? main.label : 'subject';

    // ---- 1. Main subject: in the shot, not cut off, not tiny -------------------
    if (main && photo.rule !== 'fill') {
      const box = toRect(main.box);
      const anchor = main.anchor || center(main.box);
      const a = inFrame(anchor, f);
      const visible = area(overlap(box, f)) / area(box);
      const anchorInside = a[0] >= 0 && a[0] <= 1 && a[1] >= 0 && a[1] <= 1;
      marks.anchor = anchor;

      if (!anchorInside && visible < 0.5) {
        return {
          score: t.missingScore,
          fixes: [`The ${mainName} isn't in your shot. Start by putting it in the frame, then work on placement.`],
          good: [],
          marks: { ...marks, edges: [] },
        };
      }

      if (!main.cropOK && visible < 0.98) {
        const edges = edgesCrossed(box, f);
        edges.forEach((e) => marks.edges.add(e));
        lose(
          Math.min(35, 12 + 23 * (1 - visible)),
          `The ${mainName} is cut off at the ${joinWords(edges)} edge. Give it room, or crop in close on purpose.`
        );
      }

      if (area(overlap(box, f)) / area(f) < t.tinySubject) {
        lose(10, `The ${mainName} is tiny in this crop. Move in closer so it clearly leads the eye.`);
      }
    }

    // ---- 2. Placement, by the photo's rule --------------------------------------
    if (photo.rule === 'thirds' && main) {
      const anchor = main.anchor || center(main.box);
      const a = inFrame(anchor, f);
      const lx = Math.abs(a[0] - THIRD) < Math.abs(a[0] - 2 * THIRD) ? THIRD : 2 * THIRD;
      const ly = Math.abs(a[1] - THIRD) < Math.abs(a[1] - 2 * THIRD) ? THIRD : 2 * THIRD;
      const dx = Math.abs(a[0] - lx);
      const dy = Math.abs(a[1] - ly);
      const onLine = 1 - clamp01(Math.min(dx, dy) / t.lineTolerance);
      const onPoint = 1 - clamp01(Math.hypot(dx, dy) / t.pointTolerance);
      const p = 0.75 * onLine + 0.25 * onPoint;
      marks.target = [f.x + lx * f.w, f.y + ly * f.h];

      if (p >= 0.85) {
        good.push(onPoint > 0.8
          ? `The ${mainName} sits right where two third lines cross.`
          : `The ${mainName} sits on a third line.`);
      } else {
        // Fix whichever line is closer. Moving the frame shifts the subject the opposite way.
        let move, line;
        if (dx <= dy) {
          move = a[0] < lx ? 'left' : 'right';
          line = lx < 0.5 ? 'left' : 'right';
        } else {
          move = a[1] < ly ? 'up' : 'down';
          line = ly < 0.5 ? 'top' : 'bottom';
        }
        const centered = Math.abs(a[0] - 0.5) < 0.08 && Math.abs(a[1] - 0.5) < 0.08;
        let text;
        if (centered) text = `The ${mainName} is dead center, which feels static here. Move the frame ${move} so it lands on the ${line} third line.`;
        else if (p >= 0.5) text = `Close. Nudge the frame ${move} so the ${mainName} lands on the ${line} third line.`;
        else text = `The ${mainName} is off the grid. Move the frame ${move} so it lands on the ${line} third line.`;
        lose(t.placementPoints * (1 - p), text);
      }
    }

    if (photo.rule === 'center' && main) {
      const axisX = typeof photo.axis === 'number' ? photo.axis : (main.anchor || center(main.box))[0];
      const ax = (axisX - f.x) / f.w;
      const p = 1 - clamp01(Math.abs(ax - 0.5) / t.axisTolerance);
      marks.axis = axisX;

      if (p >= 0.85) {
        good.push('The frame is centered on the symmetry line, so both sides mirror each other.');
      } else {
        const move = ax < 0.5 ? 'left' : 'right';
        lose(
          t.placementPoints * (1 - p),
          p >= 0.5
            ? `Almost symmetrical. Nudge the frame ${move} so both sides match.`
            : `This shot is built on symmetry, but its center line sits off-center in your frame. Move the frame ${move} so both sides match.`
        );
      }

      const a = inFrame(main.anchor || center(main.box), f);
      if (a[1] < 0.12 || a[1] > 0.88) {
        lose(8, `The ${mainName} is pushed against the ${a[1] < 0.5 ? 'top' : 'bottom'} of the frame. Give it more room.`);
      }
    }

    if (photo.rule === 'fill' && photo.pattern) {
      const pattern = toRect(photo.pattern);
      const inside = area(overlap(pattern, f)) / area(f);
      const p = clamp01((inside - 0.85) / (t.fillNeeded - 0.85));
      const showing = [];
      if (f.x < pattern.x - 0.005) showing.push('left');
      if (f.x + f.w > pattern.x + pattern.w + 0.005) showing.push('right');
      if (f.y < pattern.y - 0.005) showing.push('top');
      if (f.y + f.h > pattern.y + pattern.h + 0.005) showing.push('bottom');
      marks.pattern = photo.pattern;

      if (inside >= t.fillNeeded) {
        good.push('The pattern fills the whole frame, with no edges breaking it.');
      } else {
        showing.forEach((e) => marks.edges.add(e));
        lose(
          (t.placementPoints + 10) * (1 - p),
          `This is a fill-the-frame shot, but the pattern ends at the ${joinWords(showing)}. Pull the frame inside the pattern.`
        );
      }
    }

    // ---- 3. Secondary subjects sliced by an edge ---------------------------------
    let sliced = 0;
    subjects
      .filter((s) => !s.main && !s.cropOK)
      .forEach((s) => {
        const box = toRect(s.box);
        const visible = area(overlap(box, f)) / area(box);
        if (visible > 0.05 && visible < 0.9 && sliced < t.secondaryCutCap) {
          const edges = edgesCrossed(box, f);
          edges.forEach((e) => marks.edges.add(e));
          sliced += t.secondaryCutPoints;
          lose(t.secondaryCutPoints, `The ${s.label} is sliced by the ${joinWords(edges)} edge. Include it fully or leave it out.`);
        }
      });

    // ---- 4. Distractions -----------------------------------------------------------
    let distractionCost = 0;
    const left = [];
    const seen = new Set();
    (photo.distractions || []).forEach((d) => {
      const box = toRect(d.box);
      const part = overlap(box, f);
      const visible = area(part) / area(box);
      if (visible > 0.002) {
        marks.distractions.push({ label: d.label, rect: part });
        const cost = Math.min(t.distractionCap - distractionCost, (d.weight || 1) * t.distractionPoints * (0.5 + 0.5 * visible));
        distractionCost += cost;
        if (seen.has(d.label)) {
          score -= cost; // same thing marked twice: charge it, but say it once
          return;
        }
        seen.add(d.label);
        const edges = edgesCrossed(box, f);
        lose(
          cost,
          visible < 0.35 && edges.length
            ? `A sliver of the ${d.label} creeps in at the ${joinWords(edges)} edge${edges.length > 1 ? 's' : ''}. Even a small piece pulls the eye.`
            : `The ${d.label} is in the frame and pulls attention away from the ${mainName}.`
        );
      } else if ((d.weight || 1) >= 2 && !seen.has(d.label)) {
        left.push(d.label);
        seen.add(d.label);
      }
    });
    if (left.length) good.push(`You left out ${joinWords(left.slice(0, 2).map((l) => 'the ' + l))}.`);

    // ---- 5. Horizon ---------------------------------------------------------------
    if (photo.horizon) {
      const [x1, y1, x2, y2] = photo.horizon;
      const mx = f.x + f.w / 2;
      const yh = x2 === x1 ? y1 : y1 + ((y2 - y1) * (mx - x1)) / (x2 - x1);
      const fy = (yh - f.y) / f.h;
      if (fy > 0.03 && fy < 0.97) {
        marks.horizonY = yh;
        if (Math.abs(fy - 0.5) < 0.07) {
          lose(t.horizonPoints, 'The horizon cuts the frame in half. Move the frame so it sits on the top or bottom third line.');
        } else if (Math.min(Math.abs(fy - THIRD), Math.abs(fy - 2 * THIRD)) < 0.06) {
          good.push('The horizon sits on a third line.');
        }
      }
    }

    fixes.sort((a, b) => b.cost - a.cost);
    return {
      score: Math.round(Math.max(0, Math.min(100, score))),
      fixes: fixes.map((x) => x.text),
      good,
      marks: { ...marks, edges: Array.from(marks.edges) },
    };
  }

  const api = { scoreComposition, COMPOSITION_TUNING: TUNING };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CameraEye = Object.assign(root.CameraEye || {}, api);
})(typeof window !== 'undefined' ? window : globalThis);
