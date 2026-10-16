/* Project report — a 1–2 page PDF of the open project, made from its saved state (AM.pdf writes the file).

     model(project, now)   -> everything the report shows, taken from AM.derive and the project. Nothing is measured,
                              assumed or recalculated here: measured values come from the CURRENT valid measurement,
                              predicted values from the prediction engine for the complete treatment plan, and missing
                              values stay missing ("Not measured", "Not available", with the reason).
     render(model, opts)   -> AM.pdf.Doc. Page 1: room, measurement, target and assessment. Page 2 (only with a
                              treatment plan): treatment, predicted outcome (labelled a model estimate), assumptions and
                              limitations, summary. Without a plan, the summary closes page 1.
     filename(model)       -> "Room-Acoustic-Report_<room>_<YYYY-MM-DD>.pdf", safe characters only
     download(project)     -> builds and saves the file: through the viewer's download prompt when the page runs as a
                              published artifact, otherwise as a normal browser download. Resolves { ok, name, message }.
                              Locked until the project's report form has been received and the server confirms it
                              (AM.reportGate.check). build() makes the bytes without saving them, for tests.

   Measured, target, predicted (model estimate) and recommended content keep their own labels and colours, as in the app.
   The room's values are the average over the valid measuring positions, band by band (AM.derive.room), with each
   position's own values in the report. The room is judged as the app judges it (AM.derive.assessment): every band its
   criterion sets has to lie within the target range (the verdict); the average over those bands is its summary figure,
   and bands with their own wider limits are band warnings, listed apart from the verdict. 1000 Hz stays marked as the
   reference band that decides whether a take is valid. */
(function (AM) {
  'use strict';
  const { fmt, isNum } = AM.util;

  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const C = {
    ink: hex('#14191B'), ink2: hex('#384145'), muted: hex('#566065'), faint: hex('#8A9496'), line: hex('#C9D0CF'), soft: hex('#E3E7E7'),
    wash: hex('#F4F6F6'), brand: hex('#D93A27'), acoustic: hex('#0B7A73'), predicted: hex('#6A4BD6'), predictedTint: hex('#EEEAFB'),
    targetWash: hex('#E7EBEB'), good: hex('#16884A'), warn: hex('#A8670A'), critical: hex('#C42E42'), white: [1, 1, 1],
  };
  const STATUS = {
    within: { word: 'Within range', long: 'Within the target range', color: C.good },
    above: { word: 'Above range', long: 'Above the target range', color: C.critical },
    below: { word: 'Below range', long: 'Below the target range', color: C.warn },
  };
  const BAND_STATUS = { within: 'Within', above: 'Above', below: 'Below' };
  const s2 = x => (isNum(x) ? fmt.s(x) : null);
  const range = t => `${t.min.toFixed(2)}–${fmt.s(t.max)}`;
  const trim = x => String(+x.toFixed(3));
  // Dates in the report: always Latin digits and English month names. The browser's own locale can write them in a
  // script the PDF's fonts do not have (ru-RU "14 окт.", hi-IN "14 अक्टू॰"), which would print as "?".
  const when = iso => { const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };

  /* ---------- the report's content ---------- */
  function model(p, now = new Date()) {
    const D = AM.derive, W = AM.workflow, A = AM.acoustics;
    const g = D.geometry(p), m = D.measured(p), t = D.target(p), a = D.assessment(p), room = D.room(p), pos = D.positions(p), pol = D.policy(p);
    const plan = D.treatmentPlan(p), pred = D.prediction(p), none = D.noTreatment(p);
    // The report uses the CURRENT valid measurement. Later takes that were not used are named, not substituted.
    const later = D.laterTakes(p).map(k => (k.kind === 'invalid' ? `A later take (${when(k.takenAt)}) was not valid and is not used: ${k.reason || 'see Processing'}`
      : k.kind === 'failed' ? `A later take (${when(k.takenAt)}) could not be used: ${k.reason}` : `A later take (${when(k.takenAt)}) has not been processed and is not used.`));
    const missing = m ? null
      : p.processing.attempt ? `The latest take was not valid: ${p.processing.attempt.reason || 'see Processing'}`
        : p.measurement.failed ? `The latest take could not be used: ${p.measurement.failed.reason}`
          : p.measurement.recording ? 'A take was recorded but has not been processed.'
            : 'No measurement has been taken in this project.';

    const notes = [];
    if (m && room) {
      if (!pos.complete) notes.push({ kind: 'warn', text: `Measured at ${pos.count} of the ${pos.required} positions a complete measurement needs: the result is provisional.` });
      pos.rows.filter(r => r.issue).forEach(r => notes.push({ kind: 'warn', text: `${r.id}: the latest take ${r.issue.kind === 'failed' ? 'could not be used' : 'was not valid'} (${r.issue.reason || 'see Processing'})${r.result ? '; the earlier valid take there is used' : '; this position is not part of the room\'s values'}.` }));
      (room.warnings || []).forEach(w => notes.push({ kind: 'warn', text: w }));
      positionResultsOf(p).forEach(e => e.result.bands.forEach(b => (b.notes || []).forEach(x => notes.push({ kind: 'warn', text: `${room.count > 1 ? `${e.id}, ` : ''}${b.f} Hz: ${x}` }))));
      room.bands.forEach(b => (b.notes || []).forEach(x => notes.push({ kind: 'info', text: `${b.f} Hz: ${x}` })));
      room.bands.filter(b => b.rt60 == null).forEach(b => notes.push({ kind: 'warn', text: `${b.f} Hz not reliable at any position: ${b.reason || 'not enough usable decay'}` }));
      const nc = D.noiseChange(p);
      if (nc != null) notes.push({ kind: 'warn', text: `The latest background-noise measurement is ${Math.abs(nc)} dB ${nc > 0 ? 'louder' : 'quieter'} than when this RT60 was measured. Measure again to confirm it.` });
      // A later take already named with its position (above) is not listed again.
      const named = new Set(pos.rows.filter(r => r.issue).map(r => r.issue.takenAt));
      D.laterTakes(p).forEach((k, i) => { if (!named.has(k.takenAt)) notes.push({ kind: 'warn', text: later[i] }); });
      const allow = AM.analysis.CRITERIA.decay.directAllowanceDb;
      const direct = m.bands.filter(b => isNum(b.headDb) && b.headDb > allow).sort((x, y) => y.headDb - x.headDb)[0];
      if (direct) notes.push({ kind: 'info', text: `The measuring device's direct sound was separated from the room's decay (up to ${direct.headDb.toFixed(1)} dB above it, at ${direct.f} Hz); the evaluation starts below it.` });
    }

    const at = m && m.meta && D_POS(m.meta.position || p.setup.position);
    const kindKey = m && m.meta && m.meta.deviceKind;
    const original = p.followUpOf ? (AM.store.state.projects || []).find(x => x.id === p.followUpOf) : null;
    const review = p.review.filter(id => id !== 'final').map(id => W.get(id).title);

    return {
      generatedAt: now, lang: document.documentElement.lang || navigator.language || 'en',
      brand: AM.brand || { name: 'Acoustic Measurement' },
      project: {
        id: p.id, done: W.isDone(p, 'final'), review,
        followUpOf: p.followUpOf ? (original ? original.room.name || 'Untitled room' : 'an earlier project') : null,
      },
      room: Object.assign({}, p.room, { name: p.room.name || 'Untitled room' }), geometry: g,
      // What the surfaces are made of, as described in Room Setup (no RT60 is estimated from them).
      surfaces: AM.services.surfaces.describe(p.room),
      measurement: m && room ? {
        // the latest take (its device, signal and checks) and the room over every valid position
        id: m.recordingId, takenAt: m.takenAt, f: room.referenceBand, headline: room.headline, status: room.status,
        // the summaries over the room's bands, from the same service as every screen: the policy's bands and all bands
        summary: D.summaryRT60(p), average: D.averageRT60(p), policy: pol,
        bands: room.bands, ref: m.bands.find(b => b.f === m.referenceBand), meta: m.meta || {}, position: at,
        positions: pos, room,
        deviceKind: kindKey && AM.demo.DEVICE_KINDS[kindKey] ? AM.demo.DEVICE_KINDS[kindKey].name : null,
        superseded: (p.processing.history || []).length, notes,
      } : null,
      missing,
      target: t ? { preferred: t.preferred, min: t.min, max: t.max, source: p.target.source, basis: p.target.basis } : null,
      assessment: a,
      plan, prediction: pred, none,
      planProblem: plan.items.length ? D.planProblem(p) : null,
      predictedStatus: pred && t ? (pred.predictedStatus || A.classify(pred.predicted, t)) : null,
      coverage: D.coverage(p),
    };
  }
  const D_POS = id => AM.demo.POSITIONS.find(x => x.id === id) || null;
  const positionResultsOf = p => AM.derive.positionResults(p);

  /* Plain-language reading of the result, from the statuses the app computed. */
  function explanation(status) {
    return {
      above: 'The room rings longer than recommended for this use: sound lingers and overlaps, so speech is less clear and the room sounds louder. Sound-absorbing treatment shortens the reverberation.',
      within: 'The reverberation is within the range recommended for this use in every band it is judged in. No treatment is needed for reverberation.',
      below: 'The room is less reverberant than recommended for this use. More absorption would make it drier still, so treatment for reverberation is not recommended.',
    }[status] || '';
  }

  function summary(M) {
    const out = [], a = M.assessment, t = M.target;
    if (!M.measurement) {
      out.push('This project has no valid measurement, so no RT60, assessment or prediction is given.');
      out.push(M.missing);
      out.push('Next: measure the room in the app, then generate the report again.');
      return out;
    }
    // The summary narrates the verdict (every band the room's criterion sets, judged on its own) and its summary figure.
    const avg = M.measurement.summary, SHORT = M.measurement.policy.short, P = M.measurement.positions;
    const over = `${P.count} position${P.count > 1 ? 's' : ''}${P.complete ? '' : ` (provisional: ${P.required} needed)`}`;
    if (!a) {
      out.push(`${avg.available ? `Averaged over ${AM.services.rt60Average.describe(avg)} (${SHORT}) and ${over}, the room's RT60 is ${fmt.s(avg.value)}` : `There is no average RT60 (${SHORT}): ${avg.reason}`}. No target is set, so it is not assessed.`);
      out.push('Next: set the target RT60 in the app, then generate the report again.');
      return out;
    }
    if (!a.available) {
      out.push(`There is no average RT60 (${SHORT}): ${a.reason} The room is judged in those bands, so it is not assessed and no treatment is worked out.`);
      out.push('Next: measure the room again in the app, then generate the report again.');
      return out;
    }
    const fails = a.verdict.failing.map(r => `${r.f} Hz (${fmt.s(r.rt)})`).join(', ');
    out.push(`Measured at ${over}. ${a.explanation.headline}${fails ? `: ${fails} outside the ${range(t)} range` : a.verdict.complete ? `: every band ${SHORT} inside the ${range(t)} range` : `; ${a.verdict.missing.map(f => `${f} Hz`).join(', ')} could not be measured`}. The average over ${SHORT} is ${fmt.s(a.rt)}${a.verdict.masked ? ', inside the range, but every band has to be' : ''}.`);
    if (a.warnings.length) out.push(`Band warning${a.warnings.length > 1 ? 's' : ''}, not part of the verdict: ${a.warnings.map(r => `${r.f} Hz ${fmt.s(r.rt)} (its own limit ${r.min.toFixed(2)}–${fmt.s(r.max)})`).join(', ')}.`);
    const pr = M.prediction, ps = M.predictedStatus;
    if (pr) {
      const n = pr.items.length, what = n > 1 ? `The selected treatment plan (${n} products, ${fmt.m2(pr.plan.areaM2)} in total)` : `The selected treatment (${fmt.m2(pr.plan.areaM2)} of ${pr.items[0].product.name})`;
      const v = pr.predicted, pv = pr.verdict;
      if (ps === 'within') out.push(`${what} is predicted to bring it to ${fmt.s(v)}, with every band ${SHORT} inside the target range. This is a model estimate, not a measurement.`);
      else if (ps === 'above' && pv && pv.masked) out.push(`${what} is predicted to bring the average to ${fmt.s(v)}, inside the range, but ${pv.above.map(r => `${r.f} Hz (${fmt.s(r.rt)})`).join(', ')} would still ring longer than ${fmt.s(t.max)}. This is a model estimate, not a measurement.`);
      else if (ps === 'above') out.push(`${what} is predicted to bring it to ${fmt.s(v)}, still ${fmt.s(v - t.max)} above the target range. This is a model estimate, not a measurement.`);
      else out.push(`${what} is predicted to bring it to ${fmt.s(v)}, below the target range: it would over-treat the room. This is a model estimate, not a measurement.`);
      out.push(ps === 'within'
        ? 'Next: install the treatment as specified, then measure the room again to confirm the result.'
        : ps === 'above'
          ? 'Next: increase the treatment area or choose a more absorbent tested configuration, and check the prediction again before installing.'
          : 'Next: reduce the treatment amount and check the prediction again before installing.');
    } else if (M.none) {
      out[out.length - 1] = out[out.length - 1].replace(/\.$/, a.status === 'within' ? ', so no treatment is needed for reverberation.' : '; adding absorption would make it drier, so no treatment is recommended.');
      out.push('Next: keep this report on file, and measure again if the room\'s use, furnishing or finishes change.');
    } else if (M.plan.items.length) {
      out.push(`No valid prediction: ${M.planProblem || 'the treatment plan is not complete'}`);
      out.push('Next: complete the treatment plan in the app, then generate the report again.');
    } else {
      out.push('No treatment has been selected yet.');
      out.push('Next: choose a tested treatment in the app to see its predicted effect.');
    }
    if (M.project.review.length) out.push(`Note: ${M.project.review.join(', ')} ${M.project.review.length > 1 ? 'are' : 'is'} marked for review in the app. Review before relying on this report.`);
    return out;
  }

  /* ---------- layout ---------- */
  function render(M, opts = {}) {
    const doc = new AM.pdf.Doc({
      title: `Room Acoustic Measurement Report – ${M.room.name}`, author: M.brand.name, subject: 'Room acoustic measurement: RT60, target assessment and predicted treatment outcome',
      creator: `${M.brand.name} Acoustic Measurement`, producer: `${M.brand.name} report`, created: M.generatedAt, lang: M.lang,
    });
    if (opts.logo) doc.addImage('Logo', opts.logo);
    const Z = {
      normal: { body: 8.4, small: 7.3, table: 7.8, head: 10.4, title: 17, gap: 9, pad: 2.8 },
      compact: { body: 7.9, small: 7, table: 7.4, head: 9.8, title: 15.5, gap: 6, pad: 2.5 },
      dense: { body: 7.5, small: 6.7, table: 7.1, head: 9.2, title: 14.5, gap: 4, pad: 2 },
    }[opts.size || 'normal'];
    const L = { l: 40, r: doc.width - 40, t: 36, b: doc.height - 42 }, WD = L.r - L.l;
    let y = 0;
    const newPage = () => { doc.addPage(); y = L.t; };
    const need = h => { if (y + h > L.b) newPage(); };
    const lineH = size => size * 1.3;

    /* text helpers */
    // A paragraph; it starts a new page when it would run into the footer (wrapped first, so its height is known).
    const block = (x, w, str, o = {}) => {
      const op = Object.assign({ size: Z.body, color: C.ink2 }, o), lead = op.lead || op.size * 1.32;
      need(doc.wrap(str, op.size, w, op.bold).length * lead);
      const h = doc.para(x, y, str, w, op); y += h; return h;
    };
    const tag = (xRight, yBase, text, color) => {
      const size = 6.6, w = doc.textWidth(text, size, true) + 9;
      doc.rect(xRight - w, yBase - size - 2.6, w, size + 5.2, { stroke: color, lw: 0.7 });
      doc.text(xRight - w / 2, yBase, text, { size, bold: true, color, align: 'center' });
    };
    function heading(num, title, t, keep = 60) {
      need(Z.head + 16 + keep);
      y += Z.gap;
      doc.text(L.l, y + Z.head, `${num}   ${title}`, { size: Z.head, bold: true, color: C.ink });
      if (t) tag(L.r, y + Z.head - 1, t.text, t.color);
      y += Z.head + 5;
      doc.line(L.l, y, L.r, y, { color: C.line, lw: 0.7 });
      y += 6;
    }

    /* key–value rows in columns; rows of the columns line up */
    function kv(cols, o = {}) {
      const gap = 20, cw = (WD - gap * (cols.length - 1)) / cols.length, lw = o.labelW || 96, size = Z.body, lh = lineH(size);
      const rows = Math.max(...cols.map(c => c.length));
      const cell = r => (r ? { l: doc.wrap(r[0], Z.small, lw - 6), v: doc.wrap(r[1], size, cw - lw, !!(r[2] && r[2].bold)) } : { l: [], v: [] });
      const heights = [];
      for (let i = 0; i < rows; i++) heights.push(Math.max(...cols.map(c => { const k = cell(c[i]); return Math.max(k.l.length, k.v.length, 1); })) * lh + 3);
      need(heights.reduce((s, h) => s + h, 0));
      for (let i = 0; i < rows; i++) {
        cols.forEach((c, j) => {
          const r = c[i];
          if (!r) return;
          const x = L.l + j * (cw + gap), st = r[2] || {}, k = cell(r);
          k.l.forEach((ln, q) => doc.text(x, y + size + q * lh, ln, { size: Z.small, color: C.muted }));
          k.v.forEach((ln, q) => doc.text(x + lw, y + size + q * lh, ln, { size, bold: !!st.bold, color: st.color || C.ink }));
        });
        y += heights[i];
        if (i < rows - 1) doc.line(L.l, y - 1.5, L.r, y - 1.5, { color: C.soft, lw: 0.4 });
      }
    }

    /* a table: cols [{ title, w, align }], rows of cells (string or { t, bold, color, sub }: sub is a second, smaller
       muted text under t); returns its height */
    const cellLines = (c, w) => {
      const st = c && typeof c === 'object' ? c : {};
      return { main: doc.wrap(cellText(c), Z.table, w, !!st.bold), sub: st.sub ? doc.wrap(st.sub, Z.small, w) : [] };
    };
    const cellHeight = (c, w) => { const k = cellLines(c, w); return k.main.length * lineH(Z.table) + k.sub.length * lineH(Z.small); };
    function tableSize(cols, rows) {
      const pad = Z.pad;
      const head = Math.max(...cols.map(c => doc.wrap(c.title, Z.small, c.w - 4, true).length)) * lineH(Z.small) + pad * 2;
      const heights = rows.map(r => Math.max(...r.map((c, i) => cellHeight(c, cols[i].w - 5))) + pad * 2);
      return { head, heights, total: head + heights.reduce((s, h) => s + h, 0) };
    }
    function table(x, y0, cols, rows, sz, o = {}) {
      const size = Z.table, lh = lineH(size), pad = Z.pad;
      let cx = x, yy = y0;
      doc.rect(x, yy, cols.reduce((s, c) => s + c.w, 0), sz.head, { fill: C.wash });
      cols.forEach(c => {
        doc.wrap(c.title, Z.small, c.w - 4, true).forEach((ln, q) => doc.text(c.align === 'right' ? cx + c.w - 3 : cx + 2.5, yy + pad + Z.small + q * lineH(Z.small) - 1, ln, { size: Z.small, bold: true, color: C.muted, align: c.align === 'right' ? 'right' : 'left' }));
        cx += c.w;
      });
      yy += sz.head;
      const totalW = cols.reduce((s, c) => s + c.w, 0);
      rows.forEach((r, ri) => {
        if (o.highlight && o.highlight(ri)) doc.rect(x, yy, totalW, sz.heights[ri], { fill: C.wash });
        cx = x;
        r.forEach((c, i) => {
          const col = cols[i], st = c && typeof c === 'object' ? c : {}, k = cellLines(c, col.w - 5);
          const tx = col.align === 'right' ? cx + col.w - 3 : cx + 2.5, al = col.align === 'right' ? 'right' : 'left';
          k.main.forEach((ln, q) => doc.text(tx, yy + pad + size + q * lh - 1, ln, { size, bold: !!st.bold, color: st.color || C.ink, align: al }));
          const sy = yy + pad + k.main.length * lh;
          k.sub.forEach((ln, q) => doc.text(tx, sy + Z.small + q * lineH(Z.small) - 1, ln, { size: Z.small, color: C.muted, align: al }));
          cx += col.w;
        });
        yy += sz.heights[ri];
        doc.line(x, yy, x + totalW, yy, { color: C.soft, lw: 0.5 });
      });
      return yy - y0;
    }
    const cellText = c => (c == null ? '' : typeof c === 'object' ? c.t : String(c));
    // A full-width table that starts a new page when it does not fit; one taller than a page continues on the next
    // page with its header repeated, so a long treatment plan never runs into the footer.
    function flowTable(cols, rows, before = 0) {
      const sz = tableSize(cols, rows);
      if (sz.total + before <= L.b - L.t) { need(sz.total + before); y += before; y += table(L.l, y, cols, rows, sz); return; }
      need(sz.head + (sz.heights[0] || 0) + before);
      y += before;
      for (let i = 0; i < rows.length;) {
        let h = sz.head, j = i;
        while (j < rows.length && y + h + sz.heights[j] <= L.b) h += sz.heights[j++];
        if (j === i) { if (y > L.t) { newPage(); continue; } h += sz.heights[j++]; } // a row taller than a page: drawn anyway
        y += table(L.l, y, cols, rows.slice(i, j), { head: sz.head, heights: sz.heights.slice(i, j), total: h });
        i = j;
        if (i < rows.length) newPage();
      }
    }

    /* RT60 per octave band: bars for each series, the target range shaded, the preferred value dashed */
    function bandChart(x, y0, w, h, { series, target, bands }) {
      // legend first: as many rows as its items need within the chart's width
      const items = [...series.map(s => ({ color: s.color, label: s.label })), ...(target ? [{ color: C.targetWash, label: 'Target range' }, { color: C.muted, label: 'Preferred', dash: true }] : [])];
      const legend = [[]];
      let rw = 0;
      items.forEach(it => {
        it.w = 10.5 + doc.textWidth(it.label, 6.4) + 8;
        if (rw + it.w > w && legend[legend.length - 1].length) { legend.push([]); rw = 0; }
        legend[legend.length - 1].push(it); rw += it.w;
      });
      legend.forEach((row, r) => {
        let lx = x;
        const ly = y0 + r * 10;
        row.forEach(it => {
          if (it.dash) doc.line(lx, ly + 5.5, lx + 9, ly + 5.5, { color: it.color, lw: 0.8, dash: [2, 2] }); else doc.rect(lx, ly + 2, 7, 7, { fill: it.color });
          doc.text(lx + 10.5, ly + 8.2, it.label, { size: 6.4, color: C.muted });
          lx += it.w;
        });
      });
      const padL = 24, padB = 13, padT = 6 + legend.length * 10, px = x + padL, pw = w - padL - 4, py = y0 + padT, ph = h - padT - padB;
      const vals = series.flatMap(s => s.values).filter(isNum).concat(target ? [target.max] : []);
      const vmax = Math.max(...vals, 0.1), step = [0.2, 0.5, 1, 2, 5, 10, 20].find(s => vmax / s <= 6) || 50, top = Math.max(step, Math.ceil(vmax / step + 0.25) * step);
      const Y = v => py + ph - (v / top) * ph;
      if (target) {
        doc.rect(px, Y(target.max), pw, Y(target.min) - Y(target.max), { fill: C.targetWash });
        doc.line(px, Y(target.preferred), px + pw, Y(target.preferred), { color: C.muted, lw: 0.7, dash: [2, 2] });
      }
      for (let v = 0; v <= top + 1e-9; v += step) {
        doc.line(px, Y(v), px + pw, Y(v), { color: v === 0 ? C.line : C.soft, lw: v === 0 ? 0.7 : 0.4 });
        doc.text(px - 3, Y(v) + 2.3, v.toFixed(step < 1 ? 1 : 0), { size: 6.3, color: C.faint, align: 'right' });
      }
      const gw = pw / bands.length, bw = Math.min(14, gw * 0.7 / series.length);
      bands.forEach((f, i) => {
        const cx = px + gw * i + gw / 2;
        series.forEach((s, k) => {
          const v = s.values[i], bx = cx - (bw * series.length) / 2 + k * bw;
          if (isNum(v)) doc.rect(bx + 0.6, Y(v), bw - 1.2, Y(0) - Y(v), { fill: s.color });
          else doc.text(bx + bw / 2, Y(0) - 2.5, 'n/r', { size: 5.6, color: C.faint, align: 'center' });
        });
        doc.text(cx, y0 + h - 2, AM.util.fmt.hzShort(f), { size: 6.3, color: C.muted, align: 'center' });
      });
    }

    function notesList(items) {
      if (!items.length) return;
      const size = Z.small, lh = lineH(size), w = WD - 12;
      const heights = items.map(it => doc.wrap(it.text, size, w).length * lh + 1.5);
      need(lineH(Z.small) + 6 + heights[0]);
      y += 3;
      doc.text(L.l, y + Z.small, 'Notes and warnings', { size: Z.small, bold: true, color: C.ink2 });
      y += lineH(Z.small) + 2;
      items.forEach((it, i) => {
        need(heights[i]);
        doc.text(L.l + 2, y + size, it.kind === 'warn' ? '!' : '•', { size, bold: true, color: it.kind === 'warn' ? C.warn : C.muted });
        doc.para(L.l + 12, y, it.text, w, { size, color: C.ink2, lead: lh });
        y += heights[i];
      });
    }

    function bullets(items, size = Z.small) {
      const lh = lineH(size), w = WD - 12;
      items.forEach(t => {
        const h = doc.wrap(t, size, w).length * lh + 1.8;
        need(h);
        doc.text(L.l + 2, y + size, '•', { size, color: C.muted });
        doc.para(L.l + 12, y, t, w, { size, color: C.ink2, lead: lh });
        y += h;
      });
    }

    /* ===== page 1 ===== */
    newPage();
    const meas = M.measurement, t = M.target, a = M.assessment, pr = M.prediction, g = M.geometry;
    // header
    let bx = L.l;
    if (opts.logo) { doc.image('Logo', L.l, y, 26, 26 * opts.logo.height / opts.logo.width); bx = L.l + 33; }
    doc.text(bx, y + 11, M.brand.name, { size: 11, bold: true, color: C.ink });
    if (M.brand.descriptor) doc.text(bx, y + 21, M.brand.descriptor, { size: 7, color: C.muted });
    doc.text(L.r, y + 9, `Generated ${when(M.generatedAt.toISOString())}`, { size: 7, color: C.muted, align: 'right' });
    doc.text(L.r, y + 18.5, `Project ref. ${M.project.id}`, { size: 7, color: C.muted, align: 'right' });
    if (meas) doc.text(L.r, y + 28, `Measurement ref. ${meas.id}`, { size: 7, color: C.muted, align: 'right' });
    y += 36;
    doc.line(L.l, y, L.r, y, { color: C.brand, lw: 1.4 });
    y += 6;
    doc.text(L.l, y + Z.title, 'Room Acoustic Measurement Report', { size: Z.title, bold: true, color: C.ink });
    y += Z.title + 6;
    const sub = [M.room.name, [M.room.industry, M.room.type].filter(Boolean).join(' · ')].filter(Boolean).join('  —  ');
    const status = `${M.project.review.length ? `Steps marked for review in the app: ${M.project.review.join(', ')}` : M.project.done ? 'Project complete' : 'Project in progress'}${M.project.followUpOf ? ` · Follow-up measurement after treatment of “${M.project.followUpOf}”` : ''}`;
    const statusColor = M.project.review.length ? C.warn : C.muted;
    if (!M.project.review.length && !M.project.followUpOf && doc.textWidth(sub, 10) + doc.textWidth(status, Z.small) + 20 < WD) {
      // one line: the room on the left, the project's status on the right
      doc.text(L.l, y + 10, sub, { size: 10, color: C.ink2 });
      doc.text(L.r, y + 10, status, { size: Z.small, color: statusColor, align: 'right' });
      y += 14;
    } else {
      block(L.l, WD, sub, { size: 10, color: C.ink2 });
      block(L.l, WD, status, { size: Z.small, color: statusColor });
    }
    y += 6;

    // key figures: the room's measured average over the bands it is judged in (and over how many positions), the target,
    // the verdict, and the predicted average (each label says so)
    const boxes = [], avg = meas && meas.summary, SHORT = meas ? meas.policy.short : AM.services.rt60Average.SHORT;
    boxes.push(meas
      ? { label: `MEASURED RT60 · ${SHORT}`, value: avg.available ? fmt.s(avg.value) : 'Not available', sub: `${avg.available ? `Average of ${meas.positions.count} position${meas.positions.count > 1 ? 's' : ''}${avg.partial ? `, ${avg.n} of ${avg.total} bands` : ''}` : `${avg.missing.map(x => `${x.f} Hz`).join(', ')} not reliable`} · ${meas.positions.complete ? (meas.status === 'warning' ? 'valid, with warnings' : 'valid') : 'provisional'}`, color: C.ink }
      : { label: 'MEASURED RT60', value: 'Not measured', sub: 'No valid measurement in this project', color: C.ink });
    boxes.push(t ? { label: 'TARGET RT60 · PREFERRED', value: fmt.s(t.preferred), sub: `Range ${range(t)} · every band ${SHORT} checked`, color: C.muted, dash: true }
      : { label: 'TARGET RT60', value: 'Not set', sub: 'No target in this project', color: C.muted, dash: true });
    const st = a && a.available && STATUS[a.status];
    boxes.push(st ? { label: 'VERDICT · BAND BY BAND', value: st.word, sub: a.verdict.failing.length ? `${a.verdict.failing.map(r => `${r.f} Hz`).join(', ')} outside the range` : `Every band ${SHORT} in range${a.verdict.complete ? '' : ' (where measured)'}`, color: st.color }
      : { label: 'VERDICT', value: 'Not available', sub: !meas ? 'Needs a valid measurement' : a ? `No result for ${SHORT}` : 'Needs a target RT60', color: C.muted });
    if (pr) boxes.push({ label: 'PREDICTED RT60 · MODEL ESTIMATE', value: fmt.s(pr.predicted), sub: `Average ${SHORT} · ${STATUS[M.predictedStatus] ? STATUS[M.predictedStatus].word : ''} · with the treatment plan`, color: C.predicted });
    else boxes.push({ label: 'TREATMENT', value: M.none ? 'None' : M.plan.items.length ? 'No prediction' : 'Not selected', sub: M.none ? (a && a.status === 'within' ? 'Not needed: within the target range' : 'Not recommended: below the target range') : M.plan.items.length ? 'The treatment plan is not complete' : 'No product chosen yet', color: C.acoustic });
    {
      const gap = 8, w = (WD - gap * (boxes.length - 1)) / boxes.length, h = 54;
      need(h + 4);
      boxes.forEach((b, i) => {
        const x = L.l + i * (w + gap);
        doc.rect(x, y, w, h, { stroke: C.line, lw: 0.6, dash: b.dash ? [2.5, 2] : null });
        doc.rect(x, y, w, 2.4, { fill: b.color });
        const ls = Math.min(6.2, 6.2 * (w - 14) / doc.textWidth(b.label, 6.2, true));
        doc.text(x + 7, y + 12.5, b.label, { size: ls, bold: true, color: C.muted });
        doc.text(x + 7, y + 30, b.value, { size: b.value.length > 9 ? 12 : 15, bold: true, color: b.color });
        doc.para(x + 7, y + 34, b.sub, w - 12, { size: 6.6, color: C.ink2, lead: 8 });
      });
      y += h + 2;
    }

    // 1 Room
    heading(1, 'Room', null, 50);
    const rm = M.room, rec = v => (v ? String(v) : 'Not recorded');
    // Surfaces as set in Room Setup (an earlier version's single entry where a surface was never set).
    const sf = M.surfaces, surf = k => { const s = sf.find(x => x.key === k); return s.chosen ? s.text : s.legacy ? `${s.legacy} (earlier entry)` : 'not recorded'; };
    kv([
      [['Room', rm.name], ['Industry · type', [rm.industry, rm.type].filter(Boolean).join(' · ') || 'Not recorded'], ['Use', rec(rm.use)],
        ['Size (L × W × H)', g ? `${fmt.dims(g)} · ${fmt.m3(g.V, g.V % 1 ? 1 : 0)} · surfaces ${fmt.m2(g.total)}` : 'Not available']],
      [['Occupancy · furnishing', `${isNum(rm.occupancy) ? `${rm.occupancy} people` : 'Occupancy not recorded'} · ${rec(rm.furnishing)}`],
        ['Walls 1 · 2', `1: ${surf('wall1')} · 2: ${surf('wall2')}`], ['Walls 3 · 4', `3: ${surf('wall3')} · 4: ${surf('wall4')}`], ['Floor · ceiling', `${surf('floor')} · ${surf('ceiling')}`]],
    ]);

    // 2 Measurement
    heading(2, 'Measurement', { text: 'MEASURED', color: C.ink }, 70);
    if (!meas) {
      kv([[['RT60', 'Not measured', { bold: true }], ['Reason', M.missing]]]);
      block(L.l, WD, 'No RT60 is reported, and no assessment or prediction is made, until the project has a valid measurement.', { size: Z.small, color: C.muted });
    } else {
      const mm = meas.meta, lv = mm.levels || {}, nc = mm.noiseCheck, ref = meas.ref || {}, plan = mm.plan || {};
      const noiseWord = nc ? (nc.status === 'valid' ? 'suitable' : nc.status === 'warning' ? 'suitable, measured with care' : nc.status === 'unassessed' ? 'not assessed (no signal)' : nc.status) : null;
      // The average over the bands measured (AM.services.rt60Average) heads the right column; the reference band's result (1000 Hz,
      // which decides validity) and its quality share one row, so the section keeps its height.
      const av = meas.average, sv = meas.summary, P = meas.positions;
      kv([
        [['Positions', `${meas.room.positions.map(x => x.id).join(', ')}${P.complete ? '' : ` · ${P.count} of ${P.required}: provisional`}`, { bold: true, color: P.complete ? C.ink : C.warn }],
          ['Latest take', `${when(meas.takenAt)} at ${meas.position ? meas.position.id : '—'}`],
          ['Measuring device', `${meas.deviceKind || 'This device'}: built-in speaker and microphone`],
          ['Microphone', mm.deviceLabel || 'Not reported'],
          ['Test signal', plan.f1 ? `Sine sweep ${plan.f1} Hz–${(plan.f2 / 1000).toFixed(plan.f2 % 1000 ? 1 : 0)} kHz, ${plan.seconds} s, level ${AM.ui.levelDb(plan.levelDb)}` : 'Not recorded']],
        [[`Average ${meas.policy.short}`, sv.available ? `${fmt.s(sv.value)}${sv.partial ? ` (${sv.n} of ${sv.total} bands, ${sv.missing.map(x => `${x.f} Hz`).join(', ')} not measured)` : ''}` : `Not available: ${sv.missing.map(x => `${x.f} Hz`).join(', ')} not reliable`, { bold: true }],
          ['Average RT60, all bands', av.available ? `${fmt.s(av.value)} (${av.partial ? `${av.n} of ${av.total} bands, ${av.missing.map(x => `${x.f} Hz`).join(', ')} not measured` : AM.services.rt60Average.SHORT})` : `Not available: ${av.missing.map(x => `${x.f} Hz`).join(', ')} not reliable`],
          ['Background noise', `${nc && isNum(nc.bandLeqDbfs) ? `${fmt.dbfs(nc.bandLeqDbfs)} (RT60 bands), ${noiseWord}` : nc && isNum(nc.leqDbfs) ? `${fmt.dbfs(nc.leqDbfs)} (all frequencies), ${noiseWord}` : 'Not measured'}${isNum(lv.snrDb) ? ` · signal +${lv.snrDb.toFixed(0)} dB` : ''}`],
          // As the take recorded it: each feature reported off, on, or not reported (unknown, never shown as off).
          ['Browser processing', mm.config && mm.config.processing ? AM.services.measurement.processingShort(mm.config.processing) : mm.settings ? AM.services.measurement.processingShort(AM.services.measurement.processingState(mm.settings, null)) : 'Not recorded'],
          [`Result at ${meas.f} Hz`, `${meas.headline.method || '—'} · ${meas.headline.quality}, ${meas.headline.confidence.toLowerCase()} confidence${meas.status === 'warning' ? ' · with warnings' : ''}`, { color: meas.status === 'warning' ? C.warn : C.ink }]],
      ], { labelW: 90 });
      // band table (the room per band, each position's value, the spread, the band against its own limits) and chart
      const used = meas.room.positions.map(x => x.id), pw = used.length > 2 ? 34 : 40;
      const cols = [{ title: 'Band', w: 42 }, { title: 'Room RT60', w: 46, align: 'right' }, ...used.map(id => ({ title: id, w: pw, align: 'right' })), { title: 'Spread', w: 36, align: 'right' }, { title: 'vs target', w: 78 }];
      const ab = a ? new Map(a.bands.map(b => [b.f, b])) : new Map();
      const rows = meas.bands.map(b => {
        const s = ab.get(b.f);
        return [{ t: fmt.hz(b.f), bold: b.f === meas.f }, b.rt60 != null ? { t: fmt.s(b.rt60), bold: true } : { t: 'Not reliable', color: C.warn },
          ...b.values.map(v => (v.rt60 != null ? fmt.s(v.rt60) : { t: '—', color: C.faint })), b.spread != null ? fmt.s(b.spread) : '—',
          s && BAND_STATUS[s.status] ? { t: `${BAND_STATUS[s.status]}${s.role === 'secondary' ? ' · own limit' : ''}`, color: STATUS[s.status].color } : s && s.role === 'info' && b.rt60 != null ? { t: 'No limit', color: C.muted } : '—'];
      });
      const sz = tableSize(cols, rows), tw = cols.reduce((s, c) => s + c.w, 0), ch = Math.max(sz.total, 96);
      need(ch + 8);
      y += 5;
      table(L.l, y, cols, rows, sz, { highlight: i => meas.bands[i].f === meas.f });
      bandChart(L.l + tw + 16, y, WD - tw - 16, ch, { series: [{ label: 'Measured RT60 (s)', color: C.ink, values: meas.bands.map(b => b.rt60) }], target: t, bands: meas.bands.map(b => b.f) });
      y += ch + 4;
      block(L.l, WD, `Room RT60: the mean over the positions; spread: longest − shortest. Judged: ${meas.policy.short}; "own limit": a band warning. ${meas.f} Hz highlighted.`, { size: Z.small, color: C.muted });
      notesList(meas.notes);
    }

    // 3 Target and assessment
    heading(3, 'Target and assessment', { text: 'TARGET', color: C.muted }, 60);
    if (!t) {
      kv([[['Target RT60', 'Not set', { bold: true }]]]);
      block(L.l, WD, 'No target is set in this project, so the measurement is not assessed.', { size: Z.small, color: C.muted });
    } else {
      const basis = t.basis || (t.source === 'custom' ? 'Set by the user' : 'Recommended from the room type and use');
      const left = [['Target RT60', `${fmt.s(t.preferred)} preferred · range ${range(t)}`, { bold: true }], ['Basis', basis],
        ...(a ? [['Verdict rule', a.policy.brief]] : [])];
      const right = a && !a.available ? [
        ['Verdict', `Not assessed: ${a.reason}`, { bold: true }],
      ] : a ? [
        ['Verdict', `${a.explanation.headline}${a.verdict.complete ? '' : ' (not every band measured)'}`, { bold: true, color: STATUS[a.status].color }],
        [`Average ${a.policy.short}`, `${fmt.s(a.rt)} (${fmt.signedS(a.diff)}), a summary`],
        ['Outside the range', `${a.verdict.failing.length ? a.verdict.failing.map(r => `${r.f} Hz ${fmt.s(r.rt)}`).join(', ') : 'No judged band'}${a.warnings.length ? ` · band warning${a.warnings.length > 1 ? 's' : ''}: ${a.warnings.map(r => `${r.f} Hz ${fmt.s(r.rt)} (own limit ${r.min.toFixed(2)}–${fmt.s(r.max)})`).join(', ')}` : ' · no band warning'}`],
      ] : [['Verdict', 'Not available: needs a valid measurement', { bold: true }]];
      kv([left, right]);
      if (a && a.available) { y += 2; block(L.l, WD, `${explanation(a.status)}${a.verdict.masked ? ' The average alone is inside the range, but every judged band has to be.' : ''}`, { size: Z.body, color: C.ink2 }); }
    }

    const hasPage2 = !!(pr || M.plan.items.length);
    const limitsMeasurement = `One device's uncalibrated built-in speaker and microphone in a web browser, at ${meas ? meas.positions.count : 0} position${meas && meas.positions.count === 1 ? '' : 's'}. Evaluated as ISO 3382-2 sets out (T20/T30, noise compensation, straightness checks), but not validated against a reference instrument: no conformity with ISO 3382-2 and no measurement uncertainty are claimed. Room treated as a box (V = L × W × H).`;

    if (!hasPage2) {
      heading(4, 'Summary and next steps', { text: 'RECOMMENDATION', color: C.acoustic }, 40);
      summary(M).forEach(s => { block(L.l, WD, s, { size: Z.body, color: C.ink }); y += 2; });
      need(lineH(Z.small) + 30);
      y += 4;
      doc.text(L.l, y + Z.small, 'Limitations', { size: Z.small, bold: true, color: C.ink2 });
      y += lineH(Z.small) + 2;
      bullets([limitsMeasurement]);
    } else {
      /* ===== page 2 ===== */
      if (doc.pages.length === 1) newPage();
      heading(4, 'Treatment plan', { text: 'SELECTED TREATMENT', color: C.acoustic }, 70);
      const items = M.plan.items, predItems = pr ? new Map(pr.items.map(it => [it.id, it])) : new Map();
      const amount = it => (it.mode === 'units' ? { t: `${it.quantity} × ${it.size.label}`, sub: `${trim(it.size.areaM2)} m² each` } : 'Area entered directly');
      const bands = AM.demo.BANDS;
      // A long plan keeps each configuration's octave-band α on its own row here instead of in a separate table.
      const alphaInline = items.length >= 4;
      const alphaText = it => `α 125–4k Hz: ${bands.map(f => (isNum(it.alpha[f]) ? it.alpha[f].toFixed(2) : 'n/a')).join(' · ')}${isNum(it.configuration.ratings.nrc) ? ` · NRC ${it.configuration.ratings.nrc.toFixed(2)}` : ''}`;
      const pcols = [{ title: '#', w: 16 }, { title: 'Product (range · variant)', w: 130 }, { title: `Tested configuration · certificate${alphaInline ? ' · α' : ''}`, w: 232 }, { title: 'Amount', w: 90 }, { title: 'Area · placement', w: 47, align: 'right' }];
      // Each product keeps its own identity: products can share a name and differ in thickness, weight or finish.
      const variant = pd => [pd.category || null, pd.thickness && isNum(pd.thickness.mm) ? `${pd.thickness.mm} mm` : null, pd.gsm && isNum(pd.gsm.value) ? `${pd.gsm.value} GSM` : null, pd.finish || null].filter(Boolean).join(' · ');
      const prows = items.map(it => [`#${it.no}`, { t: it.product.name, bold: true, sub: variant(it.product) },
        it.configuration ? { t: it.configuration.label, sub: `${it.configuration.test && it.configuration.test.certificate ? it.configuration.test.certificate : 'No certificate number in the source'}${alphaInline ? `\n${alphaText(it)}` : ''}` } : { t: 'No tested configuration chosen: not included in the prediction', color: C.warn },
        amount(it), { t: fmt.m2(it.areaM2), sub: it.placement }]);
      flowTable(pcols, prows, 3);
      y += 4;
      const cov = M.coverage.map(c => `${c.label}: ${fmt.m2(c.areaM2)} of ${fmt.m2(c.surfaceM2)} (${fmt.pct(c.fraction)})${c.fraction > 1 ? ' – more than the surface holds' : ''}`).join(' · ');
      block(L.l, WD, `Total treatment area in the prediction: ${fmt.m2(M.plan.areaM2)}${items.length > 1 ? ` (${M.plan.complete.length} product${M.plan.complete.length > 1 ? 's' : ''})` : ''}.${cov ? ` Coverage: ${cov}.` : ''}`, { size: Z.small, color: C.ink2 });
      if (M.planProblem) block(L.l, WD, `Open issue in the plan: ${M.planProblem}`, { size: Z.small, color: C.warn, bold: true });
      // tested absorption of each configuration at the measurement bands (shorter plans: its own table)
      // One line per product: the product is the one with the same # in the table above.
      const acols = [{ title: '#', w: 16 }, { title: 'Octave-band α of the configuration', w: 205 }, ...bands.map(f => ({ title: `α ${AM.util.fmt.hzShort(f)}`, w: 39, align: 'right' })), { title: 'NRC', w: 40, align: 'right' }];
      const arows = items.filter(it => it.configuration).map(it => [`#${it.no}`, it.configuration.label,
        ...bands.map(f => (isNum(it.alpha[f]) ? it.alpha[f].toFixed(2) : { t: 'n/a', color: C.warn })), isNum(it.configuration.ratings.nrc) ? it.configuration.ratings.nrc.toFixed(2) : '—']);
      if (alphaInline && arows.length) {
        block(L.l, WD, 'α: octave-band sound absorption coefficient of each configuration at 125/250/500/1k/2k/4k Hz: the mean of the three one-third-octave values in its test certificate, at most 1.00 (n/a: no tested value).', { size: Z.small, color: C.muted });
      } else if (arows.length) {
        const asz = tableSize(acols, arows);
        need(asz.total + 14);
        y += 5;
        y += table(L.l, y, acols, arows, asz);
        y += 2;
        block(L.l, WD, 'α: octave-band sound absorption coefficient: the mean of the three one-third-octave values in the configuration\'s test certificate, at most 1.00 (n/a: no tested value).', { size: Z.small, color: C.muted });
      }

      heading(5, 'Predicted outcome', { text: 'PREDICTED · MODEL ESTIMATE', color: C.predicted }, 80);
      if (!pr) {
        kv([[['Predicted RT60', 'Not available', { bold: true }], ['Reason', M.planProblem || 'The prediction needs a valid measurement and a complete treatment plan.']]]);
      } else {
        const h = pr.headline, ps = M.predictedStatus;
        kv([[
          [`Average RT60, ${pr.policy.short}`, `Measured ${fmt.s(pr.measured)}  →  predicted ${fmt.s(pr.predicted)} (${fmt.signedS(pr.predicted - pr.measured)})`, { bold: true, color: C.predicted }],
          ...(t ? [['Predicted verdict', `${STATUS[ps] ? STATUS[ps].long : '—'}${pr.verdict && pr.verdict.failing.length ? `: ${pr.verdict.failing.map(r => `${r.f} Hz ${fmt.s(r.rt)}`).join(', ')} outside` : ' in every band judged'}; average ${fmt.signedS(pr.predicted - t.preferred)} from the preferred ${fmt.s(t.preferred)} (range ${range(t)})`, { bold: true, color: STATUS[ps] ? STATUS[ps].color : C.ink }]] : []),
        ]], { labelW: 96 });
        const cols = [{ title: 'Band', w: 46 }, { title: 'Measured', w: 52, align: 'right' }, { title: 'Predicted', w: 52, align: 'right' }, { title: 'Change', w: 50, align: 'right' }, { title: 'Predicted vs target', w: 96 }];
        const rows = pr.bands.map(b => {
          const vr = (pr.verdictRows || []).find(r => r.f === b.f), s = t && isNum(b.predicted) ? (vr ? vr.status : AM.acoustics.classify(b.predicted, t)) : null;
          return [fmt.hz(b.f), isNum(b.measured) ? fmt.s(b.measured) : { t: 'Not reliable', color: C.warn },
            isNum(b.predicted) ? { t: fmt.s(b.predicted), bold: true, color: C.predicted } : '—', isNum(b.predicted) ? fmt.signedS(b.predicted - b.measured) : '—',
            !isNum(b.measured) ? { t: 'Not measured reliably', color: C.muted } : b.missingAlpha ? { t: 'No tested α at this band', color: C.muted } : b.coveredExceedsMeasured ? { t: 'Finish values do not fit the room', color: C.warn } : s ? { t: BAND_STATUS[s], color: STATUS[s].color } : '—'];
        });
        const sz = tableSize(cols, rows), tw = cols.reduce((s, c) => s + c.w, 0), ch = Math.max(sz.total, 96);
        need(ch + 8);
        y += 5;
        table(L.l, y, cols, rows, sz);
        bandChart(L.l + tw + 16, y, WD - tw - 16, ch, { series: [{ label: 'Measured (s)', color: C.ink, values: pr.bands.map(b => b.measured) }, { label: 'Predicted (s)', color: C.predicted, values: pr.bands.map(b => b.predicted) }], target: t, bands: pr.bands.map(b => b.f) });
        y += ch + 6;

        // The calculation at the reference band, with the values the app used. The inputs are shown exactly as stored
        // (volume, measured RT60 to 0.001 s, panel area, entered area, octave-band α to 0.01); each result is rounded half-up to
        // 0.01 m², and the total is the sum of the parts as shown, so every line adds up as printed.
        const V = g.V, f = h.f, vText = trim(V);
        const r2 = x => Math.round((x + Math.sign(x) * 1e-9) * 100) / 100, m2 = x => r2(x).toFixed(2);
        const parts = [r2(h.existingA), ...h.items.map(x => r2(x.addedA))];
        const shownTotal = Math.round(parts.reduce((s, x) => s + x, 0) * 100) / 100;
        const rtFromShown = fmt.s(AM.acoustics.rtFromAbsorption(V, shownTotal)) === fmt.s(h.predicted);
        const crow = [
          ['Room volume', 'V = length × width × height', `${trim(g.L)} × ${trim(g.W)} × ${trim(g.H)} = ${vText} m³`],
          ['Existing absorption', 'A0 = 0.161 × V ÷ measured RT60', `0.161 × ${vText} ÷ ${trim(h.measured)} = ${m2(h.existingA)} m²`],
          ...pr.items.map((it, k) => {
            const al = it.alpha[f], x = h.items[k], add = x.addedA;
            // The covered finish's α is subtracted where Room Setup says what it is (no surface counted twice).
            const fac = x.coveredKnown ? '(α − finish α)' : 'α', fv = x.coveredKnown ? `(${al.toFixed(2)} − ${String(+x.coveredAlpha.toFixed(4))})` : al.toFixed(2);
            return it.mode === 'units'
              ? [`Added by #${it.no}`, `ΔA${it.no} = panels × panel area × ${fac}(${f} Hz)`, `${it.quantity} × ${String(+it.size.areaM2.toFixed(4))} × ${fv} = ${m2(add)} m²`]
              : [`Added by #${it.no}`, `ΔA${it.no} = area × ${fac}(${f} Hz)`, `${String(+it.areaM2.toFixed(4))} × ${fv} = ${m2(add)} m²`];
          }),
          ['Total absorption', `A = A0 + ${pr.items.map(it => `ΔA${it.no}`).join(' + ')}`, `${parts.map(x => x.toFixed(2)).join(' + ')} = ${shownTotal.toFixed(2)} m²`],
          ['Predicted RT60', 'RT60 = 0.161 × V ÷ A', { t: `0.161 × ${vText} ÷ ${rtFromShown ? shownTotal.toFixed(2) : String(+h.totalA.toFixed(4))} = ${fmt.s(h.predicted)}`, bold: true, color: C.predicted }],
        ];
        const ccols = [{ title: `Calculation at ${f} Hz`, w: 120 }, { title: `Formula (${pr.model} model)`, w: 200 }, { title: 'Values', w: WD - 320, align: 'right' }];
        const csz = tableSize(ccols, crow);
        need(csz.total + 16);
        y += table(L.l, y, ccols, crow, csz);
        y += 3;
        block(L.l, WD, `Inputs as stored; results rounded to 0.01 m² Sabine and the total is the sum of the values shown. RT60 as the app calculated it, unrounded. Every band is calculated the same way; the predicted average over ${pr.policy.short} is their mean: (${pr.average.included.map(b => b.rt60.toFixed(3)).join(' + ')}) ÷ ${pr.average.n} = ${fmt.s(pr.predicted)}. The predicted verdict judges each band on its own.`, { size: Z.small, color: C.muted });
      }

      heading(6, 'Assumptions and limitations', null, 40);
      bullets([
        ...(pr ? [
          `Prediction after treatment: ${pr.model} model (RT60 = 0.161 × V ÷ A), starting from the measured room. The measured RT60 gives the room's equivalent absorption A0 = 0.161 × V ÷ RT60 (the relation ISO 354 uses), which includes furniture, people and air absorption; each product adds its area × its octave-band α (mean of its tested one-third-octave values, at most 1.00), band by band, less the absorption of the finish it covers where Room Setup says what that is (finish α from published or manufacturer data for the chosen material).${pr.items.some((it, k) => pr.headline && !pr.headline.items[k].coveredKnown) ? ' For a product whose covered finish is not set, that finish is not subtracted, which can overstate the effect a little.' : ''} The model assumes an even (diffuse) sound field and that the measured RT60 represents the room; panel placement and edge effects are not modelled. A band without a tested α or a reliable measured value gets no prediction. The room's own RT60 is measured, never estimated from its surfaces.`,
          ...(pr.checks || []).map(c => c.text),
          'The treatment has not been installed or verified. Only a new measurement after installation can confirm the result.',
        ] : []),
        limitsMeasurement,
      ]);
      heading(7, 'Summary and next steps', { text: 'RECOMMENDATION', color: C.acoustic }, 40);
      summary(M).forEach(s => { block(L.l, WD, s, { size: Z.body, color: C.ink }); y += 2; });
    }

    // footers
    const N = doc.pages.length;
    doc.pages.forEach((_, i) => {
      doc.usePage(i);
      const fy = doc.height - 26;
      doc.line(L.l, fy - 9, L.r, fy - 9, { color: C.line, lw: 0.5 });
      const left = `${M.brand.name} · Room Acoustic Measurement Report · ${M.room.name}`;
      const room = doc.wrap(left, 6.8, WD - 170);
      let first = room[0];
      if (room.length > 1) { while (first && doc.textWidth(`${first}…`, 6.8) > WD - 170) first = first.slice(0, -1); first = `${first.replace(/\s+$/, '')}…`; }
      doc.text(L.l, fy, first, { size: 6.8, color: C.muted });
      doc.text(L.r, fy, `Generated ${when(M.generatedAt.toISOString())}${N > 1 ? `  ·  Page ${i + 1} of ${N}` : ''}`, { size: 6.8, color: C.muted, align: 'right' });
    });
    return doc;
  }

  /* The full report: one page, or two with a treatment plan. Compact type is used only when the normal size would need
     more than that; content is never dropped to make it fit. */
  function make(M, logo) {
    const pages = M.prediction || M.plan.items.length ? 2 : 1;
    let best = null;
    for (const size of ['normal', 'compact', 'dense']) {
      const doc = render(M, { logo, size });
      if (!best || doc.pages.length < best.pages.length) best = doc;
      if (doc.pages.length <= pages) break;
    }
    return best;
  }

  function filename(M) {
    const clean = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
    const d = M.generatedAt, p2 = x => String(x).padStart(2, '0');
    return `Room-Acoustic-Report_${clean(M.room.name) || 'Untitled-room'}_${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}.pdf`;
  }

  /* The brand icon as a JPEG for the PDF (white behind its transparent parts). Browsers do not let a page read an image
     opened from a local file, so from a file the report carries the brand name without the icon. */
  let logoPromise = null;
  function logo() {
    if (logoPromise) return logoPromise;
    logoPromise = new Promise(resolve => {
      const src = AM.brand && AM.brand.icon;
      if (!src) { resolve(null); return; }
      const img = new Image(), timer = setTimeout(() => resolve(null), 4000);
      img.onload = () => {
        try {
          const w = 192, h = Math.max(1, Math.round(w * img.naturalHeight / img.naturalWidth)), c = document.createElement('canvas');
          c.width = w; c.height = h;
          const g = c.getContext('2d');
          g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
          c.toBlob(b => {
            clearTimeout(timer);
            if (!b) { resolve(null); return; }
            b.arrayBuffer().then(buf => resolve({ bytes: new Uint8Array(buf), width: w, height: h }), () => resolve(null));
          }, 'image/jpeg', 0.92);
        } catch (e) { clearTimeout(timer); resolve(null); }
      };
      img.onerror = () => { clearTimeout(timer); resolve(null); };
      img.src = src;
    });
    return logoPromise;
  }

  // In a published artifact the viewer's own download prompt saves the file; elsewhere the browser downloads it.
  const downloads = window.claude && typeof window.claude.use === 'function' ? window.claude.use('downloads').catch(() => null) : Promise.resolve(null);
  async function save(name, bytes) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const dl = await downloads;
    if (dl) {
      try { await dl.save({ filename: name, data: blob }); return { ok: true, name }; } catch (e) {
        const code = e && e.code;
        if (code === 'declined') return { ok: false, name, message: 'The download was cancelled.' };
        if (code === 'rate_limited') return { ok: false, name, message: 'A download prompt is already open. Finish it, then try again.' };
        if (!['unavailable', 'not_granted', 'capability_disabled', 'capability_removed'].includes(code)) return { ok: false, name, message: `The PDF could not be saved (${code || 'error'}).` };
      }
    }
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = name; link.rel = 'noopener';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return { ok: true, name };
  }

  async function build(p, now = new Date()) {
    const M = model(p, now), doc = make(M, await logo());
    return { model: M, doc, bytes: doc.bytes(), name: filename(M) };
  }
  // The user-facing route to the file. It is locked until this project's report form has been received, and the server
  // is asked to confirm that every time (AM.reportGate.check); without the gate the report stays locked.
  async function download(p) {
    const gate = AM.reportGate ? await AM.reportGate.check(p) : { ok: false, message: 'The report form is not available, so the PDF report is locked.' };
    if (!gate.ok) return { ok: false, message: gate.message || 'The PDF report is locked until the report form is received.' };
    const r = await build(p);
    const out = await save(r.name, r.bytes);
    // Characters the PDF's fonts do not have (non-Latin scripts in a room name or a device label) print as "?": say so.
    const odd = [...(r.doc.unsupported || [])];
    if (out.ok && odd.length) out.message = `PDF report ready: ${r.name}. Some characters (${odd.slice(0, 6).join(' ')}${odd.length > 6 ? ' …' : ''}) cannot be shown in the PDF and appear as "?".`;
    return out;
  }

  AM.report = { model, render, make, filename, build, download, summary };
})(window.AM);
