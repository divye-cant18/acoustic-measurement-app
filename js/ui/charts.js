/* Charts. Screens place a placeholder (src/ui/kit.tsx Chart: data-chart, data-spec); the shell calls hydrate()
   after every render and on resize, so each SVG is drawn at its real width and text stays legible.
   Marks: columns ≤ 24px with 4px rounded tops, 2px lines, hairline solid grid. Hover a band for its values. */
(function (AM) {
  'use strict';
  const { esc, fmt, isNum } = AM.util;
  const BUILDERS = {};

  function niceStep(span, n) {
    const raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }
  const f1 = x => x.toFixed(1);
  // Column with a rounded data end and a square base.
  function colPath(x, y, w, base, r = 4) {
    const h = base - y;
    if (h <= 0.5) return '';
    const rr = Math.min(r, h, w / 2);
    return `M${f1(x)},${f1(base)}V${f1(y + rr)}Q${f1(x)},${f1(y)} ${f1(x + rr)},${f1(y)}H${f1(x + w - rr)}Q${f1(x + w)},${f1(y)} ${f1(x + w)},${f1(y + rr)}V${f1(base)}Z`;
  }

  /* Columns over frequency bands (the six octave bands unless spec.freqs is given).
     spec: { series: [{ label, kind: 'measured'|'predicted'|'material', values }], freqs?, target?, unit: 's'|'',
             yMax?, step?, digits?, label?: band whose caps get value labels, emphasis?: bands drawn solid (others soft),
             ticks?: bands that get an axis label, missingText?, height?, yTitle?, aria? } */
  BUILDERS.bands = (spec, width) => {
    const H = spec.height || 240, M = { l: 40, r: 10, t: 24, b: 28 };
    const w = Math.max(260, width), pw = w - M.l - M.r, ph = H - M.t - M.b;
    const bands = spec.freqs || AM.demo.BANDS;
    const vals = spec.series.flatMap(s => s.values).filter(isNum).concat(spec.target ? [spec.target.max] : []);
    const top = Math.max(0.1, ...vals) * 1.12;
    const step = spec.step || niceStep(top, 4);
    const yMax = spec.yMax || Math.ceil(top / step) * step;
    const y = v => M.t + ph - (v / yMax) * ph;
    const slot = pw / bands.length, n = spec.series.length, gap = 2;
    const bw = Math.max(6, Math.min(24, (slot * 0.62 - gap * (n - 1)) / n));
    const gw = bw * n + gap * (n - 1);
    const d = spec.digits ?? 2, unit = spec.unit === 's' ? ' s' : '';
    let g = `<text x="0" y="11" class="tick">${esc(spec.yTitle || '')}</text>`;

    for (let v = 0; v <= yMax + 1e-9; v += step) {
      g += `<line class="gl" x1="${M.l}" x2="${w - M.r}" y1="${f1(y(v))}" y2="${f1(y(v))}"/>`;
      g += `<text class="tick" x="${M.l - 8}" y="${f1(y(v) + 4)}" text-anchor="end">${+v.toFixed(2)}</text>`;
    }
    if (spec.target) {
      const t = spec.target;
      g += `<rect class="zone" x="${M.l}" width="${pw}" y="${f1(y(t.max))}" height="${f1(y(t.min) - y(t.max))}"/>`;
      g += `<line class="zone-line" x1="${M.l}" x2="${w - M.r}" y1="${f1(y(t.preferred))}" y2="${f1(y(t.preferred))}"/>`;
    }
    bands.forEach((f, i) => {
      const cx = M.l + slot * (i + 0.5), x0 = cx - gw / 2;
      const tip = [fmt.hz(f), ...spec.series.map(s => `${s.label}: ${isNum(s.values[i]) ? s.values[i].toFixed(d) + unit : (spec.missingText || 'not calculated')}`)];
      if (spec.target) tip.push(`Target range: ${spec.target.min.toFixed(2)}–${spec.target.max.toFixed(2)} s`);
      const soft = spec.emphasis && !spec.emphasis.includes(f);
      let marks = '';
      spec.series.forEach((s, j) => {
        const v = s.values[i], x = x0 + j * (bw + gap);
        if (!isNum(v)) { marks += `<text class="tick" x="${f1(x + bw / 2)}" y="${f1(y(0) - 6)}" text-anchor="middle">–</text>`; return; }
        marks += `<path class="m-${s.kind}${soft ? '-soft' : ''}" d="${colPath(x, y(v), bw, y(0))}"/>`;
        if (spec.label === f) marks += `<text class="val" x="${f1(x + bw / 2)}" y="${f1(y(v) - 6)}" text-anchor="middle">${v.toFixed(d)}</text>`;
      });
      g += `<g class="col" tabindex="0" data-tip="${esc(tip.join('\n'))}"><rect class="hit" x="${f1(cx - slot / 2 + 1)}" y="${M.t - 18}" width="${f1(Math.max(2, slot - 2))}" height="${ph + 18}" rx="${slot > 20 ? 6 : 3}"/>${marks}</g>`;
      if (!spec.ticks || spec.ticks.includes(f)) g += `<text class="tick${spec.label === f ? ' tick-strong' : ''}" x="${f1(cx)}" y="${H - 8}" text-anchor="middle">${fmt.hzShort(f)}</text>`;
    });
    g += `<line class="baseline" x1="${M.l}" x2="${w - M.r}" y1="${f1(y(0))}" y2="${f1(y(0))}"/>`;
    return `<svg width="${w}" height="${H}" viewBox="0 0 ${w} ${H}" role="img" aria-label="${esc(spec.aria || '')}">${g}</svg>`;
  };

  /* Measured decay in one octave band (from AM.analysis): band energy relative to its 10 ms peak, the backward-integrated
     decay curve up to the point where the decay meets the noise, the noise floor, and, when the band has a valid
     calculation path, the evaluation range and the fitted line, from where the room's decay starts (at the arrival,
     below any direct sound of the measuring device) over 60 dB. Nothing is modelled or smoothed in.
     spec: { curve: { dt, env[], edc[] }, noiseDb, fit: { from, to, slope, intercept, t1, t2, T } | null, path, rt, f } */
  BUILDERS.decay = (spec, width) => {
    const H = 290, M = { l: 44, r: 16, t: 26, b: 38 };
    const w = Math.max(280, width), pw = w - M.l - M.r, ph = H - M.t - M.b;
    const c = spec.curve;
    if (!c || !c.env || !c.env.length) return `<svg width="${w}" height="${H}"><text class="ann" x="${w / 2}" y="${H / 2}" text-anchor="middle">No decay data for this band</text></svg>`;
    const fit = spec.fit && spec.rt != null ? spec.fit : null;
    // The fitted line runs from the start of the room's decay (its value at the arrival) 60 dB down: that takes RT60.
    const t60 = fit ? -60 / fit.slope : 0, end = fit ? fit.intercept - 60 : -60;
    const tData = c.env.length * c.dt;
    const span = Math.max(tData, t60 * 1.05);
    const tStep = niceStep(span, 6), tMax = Math.ceil(span / tStep) * tStep;
    const noise = spec.noiseDb != null ? spec.noiseDb : Math.min(...c.env);
    const yMin = -Math.max(70, Math.ceil((-noise + 12) / 10) * 10, Math.ceil((-end + 6) / 10) * 10);
    const X = t => M.l + (t / tMax) * pw, Y = db => M.t + (Math.max(yMin, Math.min(0, db)) / yMin) * ph;

    let g = `<text x="0" y="12" class="tick">Level (dB)</text><text x="${w - M.r}" y="${H - 4}" class="tick" text-anchor="end">Time (s)</text>`;
    for (let db = 0; db >= yMin; db -= 10) {
      g += `<line class="gl" x1="${M.l}" x2="${w - M.r}" y1="${f1(Y(db))}" y2="${f1(Y(db))}"/>`;
      g += `<text class="tick" x="${M.l - 8}" y="${f1(Y(db) + 4)}" text-anchor="end">${db === 0 ? '0' : '−' + Math.abs(db)}</text>`;
    }
    for (let t = 0; t <= tMax + 1e-9; t += tStep) g += `<text class="tick" x="${f1(X(t))}" y="${H - 20}" text-anchor="middle">${+t.toFixed(2)}</text>`;

    if (fit) {
      g += `<rect class="evalz" x="${M.l}" width="${pw}" y="${f1(Y(fit.from))}" height="${f1(Y(fit.to) - Y(fit.from))}"/>`;
      g += `<text class="ann" x="${w - M.r - 8}" y="${f1(Y(fit.from) + 15)}" text-anchor="end">${spec.path} evaluation range, −${+Math.abs(fit.from).toFixed(1)} to −${+Math.abs(fit.to).toFixed(1)} dB</text>`;
    }
    g += `<line class="noise" x1="${M.l}" x2="${w - M.r}" y1="${f1(Y(noise))}" y2="${f1(Y(noise))}"/>`;
    // Named at the left of its line, where the decay is still far above it; on a narrow chart on two lines, so the label
    // ends well before the decay comes down to the line.
    const nx = M.l + 8, ny = Y(noise) - 6, nLabel = `Recording background noise ${fmt.db(noise)}`;
    g += nLabel.length * 6 > pw * 0.55
      ? `<text class="ann" x="${nx}" y="${f1(ny - 14)}"><tspan x="${nx}">Recording background</tspan><tspan x="${nx}" dy="14">noise ${fmt.db(noise)}</tspan></text>`
      : `<text class="ann" x="${nx}" y="${f1(ny)}">${nLabel}</text>`;

    // The decay curve is 0 dB at the arrival by definition; starting the line there shows the drop through a strong
    // direct sound, which the averaged points after it cannot.
    let raw = '', sch = `M${f1(X(0))},${f1(Y(0))}`;
    c.env.forEach((v, i) => { raw += (i ? 'L' : 'M') + f1(X((i + 0.5) * c.dt)) + ',' + f1(Y(v)); });
    c.edc.forEach((v, i) => { if (v == null) return; sch += 'L' + f1(X((i + 0.5) * c.dt)) + ',' + f1(Y(v)); });
    g += `<path class="raw" d="${raw}"/><path class="sch" d="${sch}"/>`;

    if (fit) {
      g += `<line class="fit" x1="${f1(X(0))}" y1="${f1(Y(fit.intercept))}" x2="${f1(X(t60))}" y2="${f1(Y(end))}"/>`;
      g += `<circle class="pt" cx="${f1(X(fit.t1))}" cy="${f1(Y(fit.from))}" r="4.5"/><circle class="pt" cx="${f1(X(fit.t2))}" cy="${f1(Y(fit.to))}" r="4.5"/>`;
      g += `<circle class="pt-end" cx="${f1(X(t60))}" cy="${f1(Y(end))}" r="5"/>`;
      const right = X(t60) + 120 > w - M.r;
      g += `<text class="val" x="${f1(X(t60) + (right ? -10 : 10))}" y="${f1(Y(end) + 4)}" text-anchor="${right ? 'end' : 'start'}">RT60 ${fmt.s(spec.rt)}</text>`;
      // A strong direct sound from the measuring device sits above the start of the room's decay.
      if (fit.intercept < -3) g += `<text class="ann" x="${f1(X(0) + 10)}" y="${f1(Y(fit.intercept) - 7)}">Direct sound above · room's decay starts ${fmt.db(fit.intercept)}</text>`;
    } else {
      g += `<text class="ann" x="${f1(M.l + pw / 2)}" y="${f1(M.t + ph / 2 - 7)}" text-anchor="middle"><tspan x="${f1(M.l + pw / 2)}">Not enough reliable decay above the recording</tspan><tspan x="${f1(M.l + pw / 2)}" dy="15">background noise to calculate RT60</tspan></text>`;
    }

    // Hover: the measured values under the pointer.
    const S = Math.min(40, c.env.length), sw = pw / S;
    for (let i = 0; i < S; i++) {
      const t = (i + 0.5) / S * tMax, k = Math.min(c.env.length - 1, Math.floor(t / c.dt));
      const inData = t <= tData, ev = inData ? c.env[k] : null, dv = inData ? c.edc[k] : null;
      const tip = [`${t.toFixed(2)} s`, `Decay curve: ${dv == null ? 'beyond the noise point' : fmt.db(dv, 1)}`, `Band energy: ${ev == null ? '—' : fmt.db(ev, 1)}`];
      g += `<g class="slice" data-tip="${esc(tip.join('\n'))}"><rect class="hit" x="${f1(M.l + i * sw)}" y="${M.t}" width="${f1(sw)}" height="${ph}"/><line class="xh" x1="${f1(X(t))}" x2="${f1(X(t))}" y1="${M.t}" y2="${M.t + ph}"/></g>`;
    }
    g += `<line class="baseline" x1="${M.l}" x2="${M.l}" y1="${M.t}" y2="${M.t + ph}"/>`;
    return `<svg width="${w}" height="${H}" viewBox="0 0 ${w} ${H}" role="img" aria-label="Measured decay curve at ${fmt.hz(spec.f)}">${g}</svg>`;
  };

  function hydrate(root) {
    root.querySelectorAll('[data-chart]').forEach(el => {
      const w = Math.floor(el.clientWidth);
      if (!w) return;
      const key = w + '|' + el.dataset.spec;
      if (el._key === key) return;
      const build = BUILDERS[el.dataset.chart];
      if (!build) return;
      el.innerHTML = build(JSON.parse(el.dataset.spec), w);
      el._key = key;
    });
  }

  AM.charts = { hydrate, BUILDERS };
})(window.AM);
