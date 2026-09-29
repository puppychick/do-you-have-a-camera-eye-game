/*
 * color.js
 * Judges whether the colors inside a crop feel harmonious. Pure logic with no DOM:
 * it works on pixel data that game.js reads from a small canvas.
 *
 * Method, in short:
 *   1. Convert pixels to OKLCH (lightness, chroma, hue), which tracks human
 *      perception better than HSL.
 *   2. Set aside neutral pixels (grays, near-black, near-white). Their hue is noise.
 *   3. Build a hue wheel histogram, weighting each pixel by how colorful it is.
 *   4. Fit Matsuda's hue templates (as used in Cohen-Or et al. 2006, "Color
 *      Harmonization") and measure how much color falls outside the best fit.
 *   5. Subtract a penalty when too many separate color families compete.
 */
(function (root) {
  'use strict';

  const TUNING = {
    neutralChroma: 0.025, // below this chroma a pixel counts as gray
    tooDark: 0.12, // OKLCH lightness below this counts as black
    tooBright: 0.96, // ...and above this as white
    neutralShare: 0.85, // a crop this neutral is described as a neutral palette
    costScale: 6, // degrees of average "outside the template" error; bigger = more forgiving
    familyShare: 0.12, // a color family needs this share of the color to be named
    groupShare: 0.12, // a hue group needs this share of the color to count as competing
    groupGap: 40, // hue groups closer than this (degrees) count as one
    describeFit: 0.75, // how well a template must fit before it is used to describe the palette
    clutterPenalty: 0.07, // per hue group beyond two
  };

  // Hue sectors (offset, width in degrees) of Matsuda's harmonic templates,
  // listed from tightest to loosest. Looser templates fit almost anything, so a
  // fit to them earns less credit.
  const TEMPLATES = [
    { id: 'i', credit: 1.0, sectors: [[0, 18]], says: 'one color family, calm and unified' },
    { id: 'I', credit: 1.0, sectors: [[0, 18], [180, 18]], says: 'a complementary pair, vivid but balanced' },
    { id: 'V', credit: 0.96, sectors: [[0, 93.6]], says: 'neighboring colors that blend naturally' },
    { id: 'L', credit: 0.92, sectors: [[0, 18], [90, 79.2]], says: 'a main color with a contrasting side color' },
    { id: 'Y', credit: 0.9, sectors: [[0, 93.6], [180, 18]], says: 'one color family with an opposite accent' },
    { id: 'X', credit: 0.82, sectors: [[0, 93.6], [180, 93.6]], says: 'two opposing color groups, lively but held together' },
  ];

  // Color family names by OKLCH hue angle.
  const FAMILIES = [
    { name: 'pink', from: 330, to: 10 },
    { name: 'red', from: 10, to: 45 },
    { name: 'orange', from: 45, to: 75 },
    { name: 'gold', from: 75, to: 115 },
    { name: 'green', from: 115, to: 165 },
    { name: 'teal', from: 165, to: 215 },
    { name: 'blue', from: 215, to: 290 },
    { name: 'purple', from: 290, to: 330 },
  ];
  const BROWN = FAMILIES.length; // extra slot: dark, muted reds and oranges read as brown
  const FAMILY_NAMES = FAMILIES.map((f) => f.name).concat('brown');

  const BINS = 72; // 5° each

  const LINEAR = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    LINEAR[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function familyOf(h, L, C) {
    for (let i = 0; i < FAMILIES.length; i++) {
      const f = FAMILIES[i];
      const inside = f.from < f.to ? h >= f.from && h < f.to : h >= f.from || h < f.to;
      if (inside) {
        if ((f.name === 'red' || f.name === 'orange' || f.name === 'gold') && L < 0.5 && C < 0.13) return BROWN;
        return i;
      }
    }
    return 0;
  }

  /**
   * Convert RGBA pixel data (e.g. from getImageData) to OKLCH once, so many
   * crops can be scored quickly.
   */
  function prepare(data, width, height) {
    const n = width * height;
    const L = new Float32Array(n);
    const C = new Float32Array(n);
    const H = new Float32Array(n);
    const F = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const r = LINEAR[data[i * 4]];
      const g = LINEAR[data[i * 4 + 1]];
      const b = LINEAR[data[i * 4 + 2]];
      const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
      const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
      const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
      const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
      const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
      const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
      let hue = (Math.atan2(B, A) * 180) / Math.PI;
      if (hue < 0) hue += 360;
      L[i] = lightness;
      C[i] = Math.hypot(A, B);
      H[i] = hue;
      F[i] = familyOf(hue, lightness, C[i]);
    }
    return { width, height, L, C, H, F };
  }

  const angleGap = (a, b) => {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  };

  function templateCost(hist, template, rotation) {
    let cost = 0;
    for (let b = 0; b < BINS; b++) {
      if (!hist[b]) continue;
      const hue = b * 5 + 2.5;
      let best = Infinity;
      for (const [offset, width] of template.sectors) {
        best = Math.min(best, Math.max(0, angleGap(hue, rotation + offset) - width / 2));
      }
      cost += hist[b] * best;
    }
    return cost;
  }

  function joinWords(list) {
    return list.length <= 1 ? list[0] || '' : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
  }

  // Peaks on the hue wheel, merged when closer than groupGap. Returns their shares, largest first.
  function hueGroups(wheel, t) {
    const reach = Math.round(t.groupGap / 2 / (360 / BINS));
    const peaks = [];
    for (let b = 0; b < BINS; b++) {
      const v = wheel[b];
      if (v > 0 && v >= wheel[(b + BINS - 1) % BINS] && v >= wheel[(b + 1) % BINS]) {
        let mass = 0;
        for (let k = -reach; k <= reach; k++) mass += wheel[(b + k + BINS) % BINS];
        peaks.push({ hue: b * (360 / BINS), mass });
      }
    }
    peaks.sort((a, b) => b.mass - a.mass);
    const kept = [];
    for (const p of peaks) {
      if (p.mass < t.groupShare) break;
      if (kept.every((k) => angleGap(k.hue, p.hue) >= t.groupGap)) kept.push(p);
    }
    return kept.map((k) => k.mass);
  }

  function describeFamilies(shares) {
    return shares
      .map((share, i) => ({ name: FAMILY_NAMES[i], share }))
      .filter((f) => f.share > 0)
      .sort((a, b) => b.share - a.share);
  }

  /**
   * Score the colors inside a pixel rectangle of prepared data.
   * @param {object} px     result of prepare()
   * @param {object} region { x0, y0, x1, y1 } in pixel indices (x1, y1 exclusive)
   * @returns {{ score, mode, description, families }}
   */
  function scoreColor(px, region, overrides) {
    const t = Object.assign({}, TUNING, overrides);
    const hist = new Float64Array(BINS);
    const familyWeight = new Float64Array(FAMILY_NAMES.length);
    let total = 0;
    let neutral = 0;
    let colorWeight = 0;
    let sumL = 0;
    let sumL2 = 0;

    for (let y = region.y0; y < region.y1; y++) {
      for (let x = region.x0; x < region.x1; x++) {
        const i = y * px.width + x;
        total++;
        const L = px.L[i];
        const C = px.C[i];
        sumL += L;
        sumL2 += L * L;
        if (C < t.neutralChroma || L < t.tooDark || L > t.tooBright) {
          neutral++;
          continue;
        }
        hist[Math.floor(px.H[i] / 5) % BINS] += C;
        familyWeight[px.F[i]] += C;
        colorWeight += C;
      }
    }

    const families = describeFamilies(Array.from(familyWeight, (w) => (colorWeight ? w / colorWeight : 0)));

    const neutralShare = total ? neutral / total : 1;

    // Mostly grays: don't judge hue from a few specks of color. Judge tonal range instead.
    if (neutralShare > t.neutralShare || colorWeight === 0) {
      const mean = sumL / Math.max(1, total);
      const spread = Math.sqrt(Math.max(0, sumL2 / Math.max(1, total) - mean * mean));
      const range = Math.min(1, spread / 0.25);
      const accent = families[0] && families[0].share > 0.4 ? ` with a touch of ${families[0].name}` : '';
      return {
        score: Math.round(55 + 35 * range),
        mode: 'neutral',
        description:
          `Mostly neutral grays, whites and blacks${accent}, so light and shape carry this shot. ` +
          (range > 0.6 ? 'The strong range from dark to light keeps it lively.' : 'The tones sit close together, so it feels a little flat.'),
        families,
      };
    }

    // Normalize and lightly smooth the hue wheel.
    const smooth = new Float64Array(BINS);
    for (let b = 0; b < BINS; b++) {
      smooth[b] = 0.25 * hist[(b + BINS - 1) % BINS] + 0.5 * hist[b] + 0.25 * hist[(b + 1) % BINS];
    }
    const sum = smooth.reduce((a, v) => a + v, 0);
    for (let b = 0; b < BINS; b++) smooth[b] /= sum;

    // Best fit per template, discounted for loose templates.
    const fits = TEMPLATES.map((tpl) => {
      let cost = Infinity;
      for (let r = 0; r < 360; r += 5) cost = Math.min(cost, templateCost(smooth, tpl, r));
      const fit = Math.exp(-cost / t.costScale);
      return { tpl, fit, value: tpl.credit * fit };
    });
    const best = fits.reduce((a, b) => (b.value > a.value ? b : a));
    const harmony = best.value;
    // Describe the palette with the tightest template that fits well.
    const named = (fits.find((f) => f.fit >= t.describeFit) || best).tpl;

    // Separate hue groups: neighbors like gold and orange count as one group.
    const groups = hueGroups(smooth, t);
    const dominance = Math.min(1, Math.max(0, ((groups[0] || 0) - 0.3) / 0.3)); // 60-30-10 idea
    const clutter = Math.max(0, groups.length - 2) * t.clutterPenalty;
    const score = Math.round(100 * Math.max(0, harmony * (0.85 + 0.15 * dominance) - clutter));

    const named3 = families.filter((f) => f.share >= t.familyShare).slice(0, 3).map((f) => f.name);
    if (!named3.length) named3.push(families[0].name);
    let opening;
    if (neutralShare > 0.5) opening = `Mostly neutral tones, with touches of ${joinWords(named3)}`;
    else if (named3.length === 1) opening = `Mostly ${named3[0]}`;
    else if (named3.length === 2) opening = `Mostly ${named3[0]} with ${named3[1]} accents`;
    else opening = `Mostly ${named3[0]}, with ${named3[1]} and ${named3[2]} accents`;

    let description = harmony >= 0.6 ? `${opening}: ${named.says}.` : `${opening}, but the colors don't settle into a clear scheme.`;
    if (groups.length > 3) description += ` ${groups.length} separate colors compete for attention.`;

    return { score, mode: 'color', template: named.id, description, families };
  }

  const api = { prepareColor: prepare, scoreColor, COLOR_TUNING: TUNING };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CameraEye = Object.assign(root.CameraEye || {}, api);
})(typeof window !== 'undefined' ? window : globalThis);
