/* Project report — a 1–2 page PDF of the open project, made from its saved state (AM.pdf writes the file).

     model(project, now)   -> everything the report shows, taken from AM.derive and the project. Nothing is measured,
                              assumed or recalculated here: measured values come from the CURRENT valid measurement,
                              predicted values from the prediction engine for the complete treatment plan, and missing
                              values stay missing ("Not measured", "Not available", with the reason).
     render(model, opts)   -> AM.pdf.Doc. Page 1: room, measurement (a few plain rows, every band on its allowed
                              range, the notes said once), target and assessment. Page 2 (only with a treatment plan):
                              treatment, predicted outcome (labelled a model estimate: every band now and after), the
                              summary in three lines, the assumptions in plain words, and the details for an acoustic
                              consultant (each position's values, the device, the notes as recorded, the tested α, the
                              calculation and the model). Without a plan, the summary and those details close page 1.
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
  // The logo's two colours and their shades, as in the app: warm black for text, measured values and "within"; the red
  // (one step deeper, for print) for the brand and predicted values; a lighter and a deeper red for warnings and failures.
  const C = {
    ink: hex('#231E1F'), ink2: hex('#423B3C'), muted: hex('#6B6263'), faint: hex('#A1999A'), line: hex('#D6CFCE'), soft: hex('#E7E2E1'),
    wash: hex('#F8F6F5'), brand: hex('#D23A25'), acoustic: hex('#231E1F'), predicted: hex('#D23A25'), predictedTint: hex('#FBE7E3'),
    targetWash: hex('#EEEAE9'), good: hex('#231E1F'), warn: hex('#C25037'), critical: hex('#A3241A'), white: [1, 1, 1],
  };
  const STATUS = {
    within: { word: 'Within range', long: 'Within the target range', color: C.good },
    above: { word: 'Above range', long: 'Above the target range', color: C.critical },
    below: { word: 'Below range', long: 'Below the target range', color: C.warn },
  };
  const BAND_STATUS = { within: 'Within', above: 'Above', below: 'Below' };
  const s2 = x => (isNum(x) ? fmt.s(x) : null);
  // A range target, or an upper limit only (form 'max', min null).
  const range = t => (isNum(t.min) ? `${t.min.toFixed(2)}–${fmt.s(t.max)}` : `at most ${fmt.s(t.max)}`);
  /* Treatment in everyday words, as on screen (no areas): how much of a surface each product covers, and which sounds
     would still be wrong after treatment. The areas, α and the calculation are in the consultant's details at the end. */
  const whereW = pl => (/^Wall \d$/.test(pl) ? pl : pl === 'Ceiling' ? 'the ceiling' : pl === 'Walls' ? 'the walls' : `the ${String(pl).toLowerCase()}`);
  const covering = (M, it) => {
    if (!(it.areaM2 > 0) && it.amountBy === 'app') return 'none needed with the other products';
    const c = (M.coverage || []).find(x => x.placement === it.placement), sh = c && c.surfaceM2 > 0 ? it.areaM2 / c.surfaceM2 : null;
    return sh != null ? `covering ${sh < 0.995 ? 'about ' : ''}${Math.round(Math.min(1, sh) * 100)} % of ${whereW(it.placement)}` : `on ${whereW(it.placement)}`;
  };
  const howMuch = (M, it) => (it.mode === 'units' ? `${it.quantity} panel${it.quantity === 1 ? '' : 's'} of ${it.product.name}, ${covering(M, it)}` : `${it.product.name}, ${covering(M, it)}`);
  const soundOf = f => (f <= 250 ? 'low sounds' : f >= 4000 ? 'high sounds' : 'voices');
  const soundsWords = (above, below) => {
    const names = fs => fmt.list([...new Set(fs.map(soundOf))]);
    return [above.length ? `${names(above)} would still echo too long` : '', below.length ? `${names(below)} would become too dull` : ''].filter(Boolean).join(', and ');
  };
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
      else if (a && a.thinBands && a.thinBands.length) notes.push({ kind: 'warn', text: `${a.thinBands.map(f => `${f} Hz`).join(', ')} rest${a.thinBands.length > 1 ? '' : 's'} on fewer than ${pos.required} positions: the result is provisional there.` });
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
      target: t ? { preferred: t.preferred, min: t.min, max: t.max, form: AM.services.target.form(t), source: p.target.source, basis: p.target.basis, note: p.target.note || '', record: p.target.record || null, bands: pol.short, judged: pol.judgedShort } : null,
      // Why there is no target, when no verified criterion gives one (AM.services.target.availability).
      noTarget: t ? null : (av => (av.status === 'ok' ? null : av.message))(AM.services.target.availability(p.room)),
      assessment: a,
      plan, prediction: pred, none,
      planProblem: plan.items.length ? D.planProblem(p) : null,
      predictedStatus: pred && t ? (pred.predictedStatus || A.classify(pred.predicted, t)) : null,
      coverage: D.coverage(p), overfill: D.overfill(p),
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
    const fails = fmt.list(a.verdict.failing.map(r => `${r.f} Hz (${fmt.s(r.rt)})`)), many = a.verdict.failing.length > 1;
    const outside = a.verdict.failing.some(r => r.role === 'edge') ? `${many ? 'their' : 'its'} limits` : isNum(t.min) ? `the ${range(t)} target` : `the ${fmt.s(t.max)} limit`;
    out.push(`Measured at ${over}. ${a.explanation.headline}${fails ? `: ${fails} outside ${outside}` : a.verdict.complete ? `: every band ${a.policy.judgedShort} within its limits` : `; ${a.verdict.missing.map(f => `${f} Hz`).join(', ')} could not be measured`}. The average over ${SHORT} is ${fmt.s(a.rt)}${a.verdict.masked ? ', inside the range, but every band has to be' : ''}.`);
    if (a.warnings.length) out.push(`Band warning${a.warnings.length > 1 ? 's' : ''}, not part of the verdict: ${a.warnings.map(r => `${r.f} Hz ${fmt.s(r.rt)} (its own limit ${range(r)})`).join(', ')}.`);
    const pr = M.prediction, ps = M.predictedStatus;
    if (pr) {
      const n = pr.items.length, what = n > 1 ? `The selected treatment plan (${fmt.list(pr.items.map(it => howMuch(M, it)))})` : `The selected treatment (${howMuch(M, pr.items[0])})`;
      const v = pr.predicted, pv = pr.verdict;
      // Band by band, each against its own limits (never a difference that can turn negative).
      const bl = rs => fmt.list(rs.map(r => `${r.f} Hz ${fmt.s(r.rt)} (limit ${range(r)})`));
      const plain = pv ? soundsWords(pv.above.map(r => r.f), pv.below.map(r => r.f)) : '';
      const fails = pv ? [plain, pv.tmFails ? `the room's Tm, ${fmt.s(pv.tm)}, would be outside ${range(t)}` : ''].filter(Boolean).join('; ') + (pv.failing.length ? `: ${bl(pv.failing)}` : '') : '';
      if (ps === 'within') out.push(`${what} is predicted to bring the average to ${fmt.s(v)}, with every band ${(M.assessment && M.assessment.policy.judgedShort) || SHORT} within its limits. This is a model estimate, not a measurement.`);
      else if (ps === 'above') out.push(`${what} is predicted to bring the average to ${fmt.s(v)}, but the room would not yet meet the target: ${fails}.${pv && pv.masked ? ' The average alone is inside the range, but every band has to be.' : ''} This is a model estimate, not a measurement.`);
      else if (a.status === 'below') out.push(`The room is already below the target range, and ${what.charAt(0).toLowerCase()}${what.slice(1)} would make it drier still: ${fails}. This is a model estimate, not a measurement.`);
      else out.push(`${what} is predicted to bring the average to ${fmt.s(v)}, but it would over-treat the room: ${fails}. This is a model estimate, not a measurement.`);
      // Some bands too long and others too dry: more of the same would make the dry ones worse.
      const mixed = pv && pv.above.length && pv.below.length;
      out.push(ps === 'within'
        ? 'Next: install the treatment as specified, then measure the room again to confirm the result.'
        : mixed
          ? 'Next: change the mix rather than the amount: a tested configuration that absorbs more in the bands that ring too long and less in those already too dry, then check the prediction again before installing.'
          : ps === 'above'
            ? (pv && pv.above.some(r => r.f <= 250) ? 'Next: add a product that absorbs low sounds well (thicker panels, or panels mounted with an air gap), or use more of the treatment, and check the prediction again before installing.' : 'Next: use more of the treatment, or choose a more absorbent tested mounting, and check the prediction again before installing.')
            : a.status === 'below'
              ? 'Next: no treatment for reverberation is recommended; remove it from the plan, or measure again if the room changes.'
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

  /* Notes said once: the same note at several positions ("P1: …", "P2: …", "P1, 125 Hz: … (non-linearity 22.3 ‰)") is
     one line naming the positions, each with its own figure where the note had one. */
  function mergeNotes(notes) {
    const by = new Map(), out = [];
    notes.forEach(nt => {
      const m = /^(P\d+)(?::|,) ([\s\S]*)$/.exec(nt.text);
      if (!m) { out.push(nt); return; }
      const fig = /\s*\(([^()]*)\)\s*\.?$/.exec(m[2]), text = m[2].replace(/\s*\([^()]*\)\s*\.?$/, '').replace(/\.$/, ''), key = `${nt.kind}|${text}`;
      if (!by.has(key)) { const e = { kind: nt.kind, text, ps: [] }; by.set(key, e); out.push(e); }
      by.get(key).ps.push(fig ? `${m[1]}: ${fig[1]}` : m[1]);
    });
    return out.map(x => (x.ps ? { kind: x.kind, text: `${x.text} (${x.ps.some(q => q.includes(':')) ? x.ps.join('; ') : fmt.list(x.ps)}).` } : x));
  }

  /* The summary in three short lines: what was found, what the plan does, and what to do next. Where there is nothing to
     assess (no measurement, no target, no average) the full reading says why. */
  function shortSummary(M) {
    const a = M.assessment, t = M.target, pr = M.prediction, full = summary(M);
    if (!M.measurement || !a || !a.available || (!pr && !M.none)) return full;
    const next = full.find(s => /^Next:/.test(s)), review = full.find(s => /^Note:/.test(s));
    const fails = a.verdict.failing, hz = rs => fmt.list(rs.map(r => `${r.f} Hz`));
    const ab = fails.filter(r => r.status === 'above'), be = fails.filter(r => r.status === 'below');
    const where = [ab.length ? `too long at ${hz(ab)}` : '', be.length ? `too short at ${hz(be)}` : ''].filter(Boolean).join(' and ');
    const h = a.explanation.headline, verb = /^(Does|Meets)/.test(h) ? `${h.charAt(0).toLowerCase()}${h.slice(1)}` : `is ${h.charAt(0).toLowerCase()}${h.slice(1)}`;
    const goal = isNum(t.preferred) ? `the ${fmt.s(t.preferred)} target` : `the ${fmt.s(t.max)} limit`;
    const out = [`Found: the room ${verb}${where ? `, ${where}` : ''} (average ${fmt.s(a.rt)} against ${goal}).`];
    if (pr) {
      const pv = pr.verdict, plain = pv ? soundsWords(pv.above.map(r => r.f), pv.below.map(r => r.f)) : '';
      out.push(`With the plan: ${pr.items.length > 1 ? 'the treatment plan' : howMuch(M, pr.items[0])} would bring the average to about ${fmt.s(pr.predicted)}${M.predictedStatus === 'within' ? ', within the target' : plain ? `; ${plain}` : ''}. A model estimate, not a measurement.`);
    }
    if (next) out.push(next);
    if (review) out.push(review);
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

    /* RT60 per octave band: bars for each series, each band's limits shaded (limits: from the verdict's band rows; the
       target range across every band without them), the preferred value dashed when the target has one */
    function bandChart(x, y0, w, h, { series, target, bands, limits }) {
      // legend first: as many rows as its items need within the chart's width
      const items = [...series.map(s => ({ color: s.color, label: s.label })), ...(target ? [{ color: C.targetWash, label: limits ? 'Limits per band' : 'Target range' }, ...(isNum(target.preferred) ? [{ color: C.muted, label: 'Preferred', dash: true }] : [])] : [])];
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
      const vals = series.flatMap(s => s.values).filter(isNum).concat(target ? [target.max] : [], (limits || []).map(Lm => Lm && Lm.max).filter(isNum));
      const vmax = Math.max(...vals, 0.1), step = [0.2, 0.5, 1, 2, 5, 10, 20].find(s => vmax / s <= 6) || 50, top = Math.max(step, Math.ceil(vmax / step + 0.25) * step);
      const Y = v => py + ph - (v / top) * ph;
      if (target) {
        const gw0 = pw / bands.length;
        if (limits) limits.forEach((Lm, i) => { if (Lm && isNum(Lm.max)) { const lo = isNum(Lm.min) ? Lm.min : 0; doc.rect(px + gw0 * i, Y(Lm.max), gw0, Y(lo) - Y(Lm.max), { fill: C.targetWash }); } });
        else doc.rect(px, Y(target.max), pw, Y(isNum(target.min) ? target.min : 0) - Y(target.max), { fill: C.targetWash });
        if (isNum(target.preferred)) doc.line(px, Y(target.preferred), px + pw, Y(target.preferred), { color: C.muted, lw: 0.7, dash: [2, 2] });
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
          else doc.text(bx + bw / 2, Y(0) - 2.5, s.missing || 'n/r', { size: 5.6, color: C.faint, align: 'center' });
        });
        doc.text(cx, y0 + h - 2, AM.util.fmt.hzShort(f), { size: 6.3, color: C.muted, align: 'center' });
      });
    }

    function notesList(items, title = 'Notes and warnings') {
      if (!items.length) return;
      const size = Z.small, lh = lineH(size), w = WD - 12;
      const heights = items.map(it => doc.wrap(it.text, size, w).length * lh + 1.5);
      need(lineH(Z.small) + 6 + heights[0]);
      y += 3;
      doc.text(L.l, y + Z.small, title, { size: Z.small, bold: true, color: C.ink2 });
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
    boxes.push(t ? (isNum(t.preferred)
      ? { label: 'TARGET RT60 · PREFERRED', value: fmt.s(t.preferred), sub: `Range ${range(t)} · every band ${t.judged} judged`, color: C.muted, dash: true }
      : { label: 'TARGET RT60 · UPPER LIMIT', value: fmt.s(t.max), sub: `At most this, at ${t.bands}; no lower limit`, color: C.muted, dash: true })
      : { label: 'TARGET RT60', value: 'Not set', sub: M.noTarget ? 'No verified criteria for this room' : 'No target in this project', color: C.muted, dash: true });
    const st = a && a.available && STATUS[a.status];
    boxes.push(st ? { label: 'VERDICT · BAND BY BAND', value: st.word, sub: a.verdict.failing.length ? `${fmt.list(a.verdict.failing.map(r => `${r.f} Hz`))} outside ${a.verdict.failing.length > 1 ? 'their' : 'its'} limits` : `Every band ${a.policy.judgedShort} within its limits${a.verdict.complete ? '' : ' (where measured)'}`, color: st.color }
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
    const sf = M.surfaces, said = s => (s.chosen ? s.text : s.legacy ? `${s.legacy} (earlier entry)` : 'not recorded');
    const surf = k => { const s = sf.find(x => x.key === k); return s ? said(s) : 'not recorded'; };
    // The room's walls in pairs, in their order (Walls 1 · 2, Walls 3 · 4, … with their own numbers); the ceiling and any
    // sections after the floor.
    const num = s => s.key.replace(/^\D+/, '') || '1', walls = sf.filter(s => /^wall\d+$/.test(s.key)), ceil = sf.filter(s => /^ceiling\d*$/.test(s.key));
    const wallRows = [];
    for (let i = 0; i < walls.length; i += 2) {
      const pair = walls.slice(i, i + 2);
      wallRows.push([pair.length > 1 ? `Walls ${pair.map(num).join(' · ')}` : `Wall ${num(pair[0])}`, pair.map(s => `${num(s)}: ${said(s)}`).join(' · ')]);
    }
    const ceilText = ceil.length > 1 ? ceil.map(s => `${s.key === 'ceiling' ? 'ceiling' : `section ${num(s)}`}: ${said(s)}`).join('; ') : surf('ceiling');
    const named = (v, other, typed) => (v === other && typed ? typed : v);
    kv([
      [['Room', rm.name], ['Industry · type', [named(rm.industry, AM.demo.OTHER_INDUSTRY, rm.industryOther), named(rm.type, AM.demo.OTHER_TYPE, rm.typeOther)].filter(Boolean).join(' · ') || 'Not recorded'], ['Use', rec(rm.use)],
        ['Size (L × W × H)', g ? `${fmt.dims(g)} · ${fmt.m3(g.V, g.V % 1 ? 1 : 0)} · surfaces ${fmt.m2(g.total)}` : 'Not available']],
      [['Occupancy · furnishing', `${isNum(rm.occupancy) ? `${rm.occupancy} people` : 'Occupancy not recorded'} · ${rec(rm.furnishing)}`],
        ...wallRows, ['Floor · ceiling', `${surf('floor')} · ${ceilText}`]],
    ]);

    /* Every band on one row, as on the app's screens (src/ui/bands.tsx): its allowed range as a dashed box, the value as a
       dot coloured by its status, and the value and status in words. With `from` (the measured value): now (black) and
       after treatment (red), joined. The preferred value is the dashed line through the rows. */
    const WORD = { within: 'just right', above: 'too echoey', below: 'too dull' };
    const groupOf = f => (f <= 250 ? 'low sounds' : f >= 4000 ? 'high sounds' : 'voices');
    function bandRows(rows, preferred) {
      const rh = 15, n = rows.length, lw = 78, vw = 132, x0 = L.l + lw, x1 = L.r - vw - 8, change = rows.some(r => isNum(r.from));
      const top = Math.max(0.5, ...rows.map(r => Math.max(r.rt || 0, r.max || 0, r.from || 0)), preferred || 0);
      const Mx = Math.ceil(top * 1.15 * 10) / 10, X = v => x0 + Math.max(0, Math.min(1, v / Mx)) * (x1 - x0);
      need(n * rh + 30);
      y += 3;
      const yTop = y;
      rows.forEach((r, i) => {
        const cy = y + rh / 2, measured = isNum(r.rt) && r.status !== 'insufficient';
        const st = measured && WORD[r.status] ? r.status : measured ? 'free' : 'none', col = st === 'above' ? C.critical : st === 'below' ? C.warn : C.ink;
        doc.text(L.l, cy + 2.7, AM.util.fmt.hz(r.f), { size: Z.table, bold: true, color: C.ink });
        doc.text(L.l + 38, cy + 2.5, groupOf(r.f), { size: 6.2, color: C.muted });
        doc.line(x0, cy, x1, cy, { color: C.soft, lw: 1.6 });
        if (isNum(r.max)) {
          const lo = isNum(r.min) ? r.min : 0, out = st === 'above' || st === 'below';
          doc.rect(X(lo), cy - 4.5, Math.max(1, X(r.max) - X(lo)), 9, { fill: out ? C.predictedTint : C.targetWash, stroke: st === 'above' ? C.critical : st === 'below' ? C.warn : C.faint, lw: 0.6, dash: [2, 1.6] });
        }
        if (change && isNum(r.from) && measured) doc.line(X(r.from), cy, X(r.rt), cy, { color: C.predicted, lw: 1.2 });
        if (isNum(r.from)) doc.circle(X(r.from), cy, 3.1, { fill: C.ink, stroke: C.white, lw: 0.8 });
        if (measured) doc.circle(X(r.rt), cy, 3.1, { fill: change ? C.predicted : col, stroke: C.white, lw: 0.8 });
        const word = r.note || (measured ? (st === 'free' ? 'no limit here' : WORD[st]) : 'not measured');
        if (measured) {
          const val = `${isNum(r.from) ? `${r.from.toFixed(2)} → ` : ''}${fmt.s(r.rt)}`;
          doc.text(x1 + 10, cy + 2.7, val, { size: Z.table, bold: true, color: C.ink });
          doc.text(x1 + 10 + doc.textWidth(val, Z.table, true) + 5, cy + 2.7, word, { size: Z.small, bold: st === 'above' || st === 'below', color: st === 'free' ? C.muted : col });
        } else doc.text(x1 + 10, cy + 2.7, isNum(r.from) ? `${fmt.s(r.from)} now · ${word}` : word, { size: Z.small, color: C.muted });
        y += rh;
        if (i < n - 1) doc.line(L.l, y, L.r, y, { color: C.soft, lw: 0.4 });
      });
      if (isNum(preferred)) doc.line(X(preferred), yTop, X(preferred), y, { color: C.muted, lw: 0.6, dash: [2, 2] });
      doc.text(x0, y + 8, '0 s', { size: 6.2, color: C.faint });
      doc.text(x1, y + 8, `${Mx.toFixed(1)} s`, { size: 6.2, color: C.faint, align: 'right' });
      if (isNum(preferred)) doc.text(X(preferred), y + 8, `preferred ${fmt.s(preferred)}`, { size: 6.2, color: C.muted, align: 'center' });
      y += 12;
      const items = change ? [['dot', C.ink, 'Now (measured)'], ['dot', C.predicted, 'After treatment (model estimate)']] : [['dot', C.ink, 'Just right'], ['dot', C.warn, 'Too dull'], ['dot', C.critical, 'Too echoey']];
      items.push(['box', null, 'Allowed range']);
      let lx = L.l;
      items.forEach(([k, c, label]) => {
        if (k === 'dot') doc.circle(lx + 3, y + 4.3, 2.6, { fill: c }); else doc.rect(lx, y + 1.3, 8, 6, { fill: C.targetWash, stroke: C.faint, lw: 0.5, dash: [1.5, 1.2] });
        doc.text(lx + 11, y + 6.8, label, { size: 6.4, color: C.muted });
        lx += 11 + doc.textWidth(label, 6.4) + 12;
      });
      y += 11;
    }

    // What moved to the consultant's details, in small print: each position's band values, the device's details, the
    // background level, the reference band's result, and how the target is set and judged.
    const processingOf = mm => (mm.config && mm.config.processing ? AM.services.measurement.processingShort(mm.config.processing) : mm.settings ? AM.services.measurement.processingShort(AM.services.measurement.processingState(mm.settings, null)) : 'Not recorded');
    function measurementDetails() {
      if (!meas) return;
      const mm = meas.meta, nc = mm.noiseCheck, plan = mm.plan || {}, used = meas.room.positions.map(x => x.id);
      const small = { size: Z.small, color: C.ink2 };
      if (used.length > 1) {
        const per = meas.bands.map(b => `${fmt.hz(b.f)} ${b.values.map(v => (v.rt60 != null ? fmt.s(v.rt60) : '—')).join(' / ')}`).join(' · ');
        const spread = Math.max(...meas.bands.map(b => (b.spread != null ? b.spread : 0)));
        block(L.l, WD, `At each position (${used.join(' / ')}): ${per}. The room's value is their mean; the largest spread is ${fmt.s(spread)}.`, small);
        y += 2;
      }
      block(L.l, WD, `Device: microphone ${mm.deviceLabel || 'not reported'} · ${plan.f1 ? `sine sweep ${plan.f1} Hz–${(plan.f2 / 1000).toFixed(plan.f2 % 1000 ? 1 : 0)} kHz, ${plan.count > 1 ? `${plan.count} × ` : ''}${plan.seconds} s, level ${AM.ui.levelDb(plan.levelDb)}` : 'test signal not recorded'} · background ${nc && isNum(nc.bandLeqDbfs) ? `${fmt.dbfs(nc.bandLeqDbfs)} (RT60 bands)` : nc && isNum(nc.leqDbfs) ? `${fmt.dbfs(nc.leqDbfs)} (all frequencies)` : 'not measured'} · ${meas.f} Hz: ${meas.headline.method || '—'}, ${meas.headline.quality}, ${meas.headline.confidence.toLowerCase()} confidence (the reference band, where a take's validity is decided).`, small);
      if (a || (t && t.record && t.source !== 'custom')) { y += 2; block(L.l, WD, `${a ? `How the room is judged: ${String(a.policy.brief).replace(/\.$/, '')}.` : ''}${t && t.record && t.source !== 'custom' ? ` Target condition: ${String(t.record.condition).replace(/\.$/, '')}.` : ''}`.trim(), small); }
      y += 3;
    }

    // 2 Measurement
    heading(2, 'Measurement', { text: 'MEASURED', color: C.ink }, 70);
    if (!meas) {
      kv([[['RT60', 'Not measured', { bold: true }], ['Reason', M.missing]]]);
      block(L.l, WD, 'No RT60 is reported, and no assessment or prediction is made, until the project has a valid measurement.', { size: Z.small, color: C.muted });
    } else {
      const mm = meas.meta, lv = mm.levels || {}, nc = mm.noiseCheck, av = meas.average, sv = meas.summary, P = meas.positions;
      const quiet = nc ? ({ valid: 'Quiet enough', warning: 'Quiet enough, measured with care', unassessed: 'Not assessed (no signal)' }[nc.status] || nc.status) : 'Not measured';
      kv([
        [['Positions', `${meas.room.positions.map(x => x.id).join(', ')}${P.complete ? '' : ` · ${P.count} of ${P.required}: provisional`} · latest take ${when(meas.takenAt)}`, { bold: true, color: P.complete ? C.ink : C.warn }],
          ['Measuring device', `${meas.deviceKind || 'This device'}: built-in speaker and microphone`],
          // As the take recorded it: each feature reported off, on, or not reported (unknown, never shown as off).
          ['Browser processing', processingOf(mm)]],
        [[`Average ${meas.policy.short}`, sv.available ? `${fmt.s(sv.value)}${sv.partial ? ` (${sv.n} of ${sv.total} bands, ${sv.missing.map(x => `${x.f} Hz`).join(', ')} not measured)` : ''}` : `Not available: ${sv.missing.map(x => `${x.f} Hz`).join(', ')} not reliable`, { bold: true }],
          ['Average RT60, all bands', av.available ? `${fmt.s(av.value)} (${av.partial ? `${av.n} of ${av.total} bands, ${av.missing.map(x => `${x.f} Hz`).join(', ')} not measured` : AM.services.rt60Average.SHORT})` : `Not available: ${av.missing.map(x => `${x.f} Hz`).join(', ')} not reliable`],
          ['Background noise', `${quiet}${isNum(lv.snrDb) ? ` · test signal ${lv.snrDb.toFixed(0)} dB above it` : ''}`]],
      ], { labelW: 90 });
      bandRows(meas.bands.map(b => {
        const s = a && a.available ? a.bands.find(x => x.f === b.f) : null;
        return { f: b.f, rt: b.rt60, min: s ? s.min : null, max: s ? s.max : null, status: b.rt60 == null ? 'insufficient' : s ? s.status : null, note: b.rt60 != null && !s ? 'measured' : null };
      }), t && isNum(t.preferred) && a && a.available ? t.preferred : null);
      notesList(mergeNotes(meas.notes), 'Notes');
    }

    // 3 Target and assessment. A DIN 18041 target is for the room in use: its verdict is a guide (target.js isDin).
    const din = AM.services.target.isDin(t), vNote = AM.services.target.verdictNote(t);
    const fitRec = t && t.source !== 'custom' && t.record ? AM.services.target.recommend(M.room) : null, fit = fitRec && fitRec.fit ? ' · the room type is not named in the reference: applied by its use' : '';
    heading(3, 'Target and assessment', { text: 'TARGET', color: C.muted }, 60);
    if (!t) {
      kv([[['Target RT60', 'Not set', { bold: true }]]]);
      block(L.l, WD, `${M.noTarget ? `${M.noTarget} ` : 'No target is set in this project. '}The measurement is not assessed.`, { size: Z.small, color: C.muted });
    } else {
      const basis = `${t.basis || (t.source === 'custom' ? 'Set by the user' : 'Recommended from the room type and use')}${t.note ? ` · source: ${t.note}` : ''}`;
      const left = [['Target RT60', isNum(t.preferred) ? `${fmt.s(t.preferred)} preferred · range ${range(t)}` : `Upper limit: ${range(t)}`, { bold: true }], ['Standard', `${basis}${fit}`]];
      const hzOf = rs => fmt.list(rs.map(r => `${r.f} Hz`));
      const ab = a && a.available ? a.verdict.failing.filter(r => r.status === 'above') : [], be = a && a.available ? a.verdict.failing.filter(r => r.status === 'below') : [];
      const right = a && !a.available ? [['Verdict', `Not assessed: ${a.reason}`, { bold: true }]]
        : a ? [
          ['Verdict', `${a.explanation.headline}${a.verdict.complete ? '' : ' (not every band measured)'}`, { bold: true, color: STATUS[a.status].color }],
          ...(ab.length ? [['Too long at', hzOf(ab)]] : []), ...(be.length ? [['Too short at', hzOf(be)]] : []),
          ...(!ab.length && !be.length ? [['Outside the limits', 'No judged band']] : []),
          ...(a.warnings.length ? [['Band warnings', a.warnings.map(r => `${r.f} Hz ${fmt.s(r.rt)} (own limit ${range(r)})`).join(', ')]] : []),
        ] : [['Verdict', 'Not available: needs a valid measurement', { bold: true }]];
      kv([left, right]);
      if (a && a.available) { y += 2; block(L.l, WD, `${explanation(a.status)}${a.verdict.masked ? ' The average alone is inside the range, but every judged band has to be.' : ''}`, { size: Z.body, color: C.ink2 }); }
      if (a && a.available && vNote) { y += 1; block(L.l, WD, vNote, { size: Z.small, color: C.muted }); }
    }

    const hasPage2 = !!(pr || M.plan.items.length);
    const limitsMeasurement = `One device's uncalibrated built-in speaker and microphone in a web browser, at ${meas ? meas.positions.count : 0} position${meas && meas.positions.count === 1 ? '' : 's'}. Evaluated as ISO 3382-2 sets out (T20/T30, noise compensation, straightness checks), but not validated against a reference instrument: no conformity with ISO 3382-2 and no measurement uncertainty are claimed. Room treated as a box (V = L × W × H).${din ? ' DIN 18041 sets its targets for the room in use; no conversion to that is applied.' : ''}`;
    const limitsShort = `Measured with one device's built-in speaker and microphone in a web browser, at ${meas ? meas.positions.count : 0} position${meas && meas.positions.count === 1 ? '' : 's'}: not a laboratory measurement; no conformity with ISO 3382-2 and no measurement uncertainty are claimed.${din ? ' DIN 18041 sets its targets for the room in use; no conversion to that is applied.' : ''}`;

    if (!hasPage2) {
      heading(4, 'Summary and next steps', { text: 'RECOMMENDATION', color: C.acoustic }, 40);
      bullets(shortSummary(M), Z.body);
      need(lineH(Z.small) + 24);
      y += 3;
      doc.text(L.l, y + Z.small, 'Limitations', { size: Z.small, bold: true, color: C.ink2 });
      y += lineH(Z.small) + 2;
      bullets([limitsMeasurement]);
      if (meas) {
        heading(5, 'Details for your acoustic consultant', null, 30);
        measurementDetails();
      }
    } else {
      /* ===== page 2 ===== */
      if (doc.pages.length === 1) newPage();
      heading(4, 'Your treatment', { text: 'SELECTED TREATMENT', color: C.acoustic }, 70);
      const items = M.plan.items, bands = AM.demo.BANDS;
      // Each product keeps its own identity: products can share a name and differ in thickness, weight or finish.
      const variant = pd => [pd.category || null, pd.thickness && isNum(pd.thickness.mm) ? `${pd.thickness.mm} mm` : null, pd.gsm && isNum(pd.gsm.value) ? `${pd.gsm.value} GSM` : null, pd.finish || null].filter(Boolean).join(' · ');
      // How much, as on screen: panels, and how much of the surface they cover (the areas are in the details at the end).
      const pcols = [{ title: '#', w: 16 }, { title: 'Product', w: 150 }, { title: 'Mounting (tested configuration · certificate)', w: 200 }, { title: 'How much', w: WD - 366 }];
      const prows = items.map(it => [`#${it.no}`, { t: it.product.name, bold: true, sub: variant(it.product) },
        it.configuration ? { t: it.configuration.label, sub: it.configuration.test && it.configuration.test.certificate ? it.configuration.test.certificate : 'No certificate number in the source' } : { t: 'No tested configuration chosen: not included in the prediction', color: C.warn },
        it.mode === 'units' ? { t: `${it.quantity} panel${it.quantity === 1 ? '' : 's'} of ${it.size.label}`, sub: covering(M, it) } : { t: covering(M, it).replace(/^covering/, 'Covering') }]);
      flowTable(pcols, prows, 3);
      y += 4;
      const over = M.coverage.filter(c => c.over);
      if (over.length) block(L.l, WD, `More treatment than fits on ${fmt.list(over.map(c => whereW(c.placement)))}: the amounts need checking. There is no predicted result until it fits.`, { size: Z.small, color: C.warn, bold: true });
      if (M.planProblem && M.planProblem !== M.overfill) block(L.l, WD, `Open issue in the plan: ${M.planProblem}`, { size: Z.small, color: C.warn, bold: true });

      heading(5, 'Predicted outcome', { text: 'PREDICTED · MODEL ESTIMATE', color: C.predicted }, 80);
      if (!pr) {
        kv([[['Predicted RT60', 'Not available', { bold: true }], ['Reason', M.planProblem || 'The prediction needs a valid measurement and a complete treatment plan.']]]);
      } else {
        const ps = M.predictedStatus, pv = pr.verdict, plain = pv ? soundsWords(pv.above.map(r => r.f), pv.below.map(r => r.f)) : '';
        kv([[
          [`RT60, average ${pr.policy.short}`, `Measured ${fmt.s(pr.measured)}  →  predicted ${fmt.s(pr.predicted)} (${fmt.signedS(pr.predicted - pr.measured)})`, { bold: true, color: C.predicted }],
          ...(t ? [['Predicted verdict', `${STATUS[ps] ? STATUS[ps].long : '—'}${ps === 'within' ? ' in every band judged' : plain ? `: ${plain}` : ''}`, { bold: true, color: STATUS[ps] ? STATUS[ps].color : C.ink }]] : []),
        ]], { labelW: 120 });
        bandRows(pr.bands.map(b => {
          const row = (pr.verdictRows || []).find(r => r.f === b.f), vr = row || {}, lim = { f: b.f, min: isNum(vr.min) ? vr.min : null, max: isNum(vr.max) ? vr.max : null };
          if (!isNum(b.measured)) return Object.assign(lim, { rt: null, status: 'insufficient' });
          if (!isNum(b.predicted) || b.missingAlpha || b.coveredExceedsMeasured) return Object.assign(lim, { rt: null, from: b.measured, status: 'insufficient', note: b.missingAlpha ? 'no tested α here' : 'finish values do not fit' });
          // The band's own verdict row (null: no limit there); a band without one is judged against the target itself.
          return Object.assign(lim, { rt: b.predicted, from: b.measured, status: row ? row.status : t ? AM.acoustics.classify(b.predicted, t) : null });
        }), t && isNum(t.preferred) ? t.preferred : null);
      }

      heading(6, 'Summary and next steps', { text: 'RECOMMENDATION', color: C.acoustic }, 40);
      bullets(shortSummary(M), Z.body);

      heading(7, 'Assumptions and limitations', null, 40);
      bullets([
        ...(pr ? [`Prediction after treatment: an estimate from the ${pr.model} model, starting from the measured room. Panel placement and edge effects are not modelled; how it is worked out is in section 8.`,
          'The treatment has not been installed or verified. Only a new measurement after installation can confirm the result.'] : []),
        limitsShort,
      ]);

      /* ===== the details for an acoustic consultant: each position, the device, areas, tested α and the calculation ===== */
      heading(8, 'Details for your acoustic consultant', null, 60);
      measurementDetails();
      y += 2;
      const cov = M.coverage.map(c => `${c.label}: ${fmt.m2(c.areaM2)} of ${fmt.m2(c.surfaceM2)} free (${fmt.pct(c.fraction)})${c.over ? ' – more than the surface holds' : ''}`).join(' · ');
      block(L.l, WD, `Treatment areas: ${items.map(it => `#${it.no} ${fmt.m2(it.areaM2)}${it.mode === 'units' ? ` (${it.quantity} × ${trim(it.size.areaM2)} m²)` : ''} on ${it.placement}`).join('; ')}. Total in the prediction ${fmt.m2(M.plan.areaM2)}.${cov ? ` Coverage of the free surface: ${cov}.` : ''}`, { size: Z.small, color: C.ink2 });
      // Tested absorption of each configuration at the measurement bands; one line per product, # as above.
      const acols = [{ title: '#', w: 16 }, { title: 'Octave-band α of the configuration', w: 205 }, ...bands.map(f => ({ title: `α ${AM.util.fmt.hzShort(f)}`, w: 39, align: 'right' })), { title: 'NRC', w: 40, align: 'right' }];
      const arows = items.filter(it => it.configuration).map(it => [`#${it.no}`, it.configuration.label,
        ...bands.map(f => (isNum(it.alpha[f]) ? it.alpha[f].toFixed(2) : { t: 'n/a', color: C.warn })), isNum(it.configuration.ratings.nrc) ? it.configuration.ratings.nrc.toFixed(2) : '—']);
      if (arows.length) {
        const asz = tableSize(acols, arows);
        need(asz.total + 14);
        y += 5;
        y += table(L.l, y, acols, arows, asz);
        y += 2;
        block(L.l, WD, 'α: octave-band sound absorption coefficient: the mean of the three one-third-octave values in the configuration\'s test certificate, at most 1.00 (n/a: no tested value).', { size: Z.small, color: C.muted });
      }
      if (pr) {
        // The calculation at the reference band, with the values the app used. The inputs are shown exactly as stored
        // (volume, measured RT60 to 0.001 s, panel area, entered area, octave-band α to 0.01); each result is rounded half-up to
        // 0.01 m², and the total is the sum of the parts as shown, so every line adds up as printed.
        const h = pr.headline, V = g.V, f = h.f, vText = trim(V);
        const r2 = x => Math.round((x + Math.sign(x) * 1e-9) * 100) / 100, m2 = x => r2(x).toFixed(2);
        const parts = [r2(h.existingA), ...h.items.map(x => r2(x.addedA))];
        const shownTotal = Math.round(parts.reduce((sm, x) => sm + x, 0) * 100) / 100;
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
        y += 5;
        y += table(L.l, y, ccols, crow, csz);
        y += 3;
        block(L.l, WD, `Inputs as stored; results rounded to 0.01 m² Sabine and the total is the sum of the values shown. RT60 as the app calculated it, unrounded. Every band is calculated the same way; the predicted average over ${pr.policy.short} is their mean: (${pr.average.included.map(b => b.rt60.toFixed(3)).join(' + ')}) ÷ ${pr.average.n} = ${fmt.s(pr.predicted)}. The predicted verdict judges each band on its own.`, { size: Z.small, color: C.muted });
      }
      y += 3;
      bullets([
        ...(pr ? [
          `The model: RT60 = 0.161 × V ÷ A, starting from the measured room. The measured RT60 gives the room's equivalent absorption A0 = 0.161 × V ÷ RT60 (the relation ISO 354 uses), which includes furniture, people and air absorption; each product adds its area × its octave-band α (mean of its tested one-third-octave values, at most 1.00), band by band, less the absorption of the finish it covers where Room Setup says what that is (finish α from published or manufacturer data for the chosen material).${pr.items.some((it, k) => pr.headline && !pr.headline.items[k].coveredKnown) ? ' For a product whose covered finish is not set, that finish is not subtracted, which can overstate the effect a little.' : ''} The model assumes an even (diffuse) sound field and that the measured RT60 represents the room. A band without a tested α or a reliable measured value gets no prediction. The room's own RT60 is measured, never estimated from its surfaces.`,
          ...(pr.checks || []).map(c => c.text),
        ] : []),
        limitsMeasurement,
      ]);
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

  /* The full report, aiming for one page, or two with a treatment plan. Compact type is used only when the normal size
     would need more than that; content is never dropped to make it fit, so a long report runs on to another page. */
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
