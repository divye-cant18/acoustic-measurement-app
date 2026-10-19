/* Derived values shared across stages, so every screen reads the same numbers the same way.
   Measured values come only from a valid processing result. Predicted values come only from the prediction engine.
   Product data comes only from the catalog; the project stores ids and amounts, never product data. */
(function (AM) {
  'use strict';
  const W = AM.workflow, A = AM.acoustics;
  const { isNum } = AM.util;

  const geometry = p => (p ? A.geometry(p.room) : null);
  const target = p => {
    const t = p && p.target;
    return t && [t.preferred, t.min, t.max].every(isNum) ? t : null;
  };
  // The latest valid take: what Processing, the take list, the decay curves and the diagnostics show. Not the room's
  // values, which come from every measured position (room).
  const measured = p => {
    const r = p && p.processing.result;
    return r && r.valid ? r : null;
  };

  /* ---------- measuring positions ---------- */
  // Where a take was made (recorded with it); takes from before positions were recorded count as P1.
  const posOf = r => (r && r.meta && r.meta.position) || (r && r.position) || 'P1';
  /* The latest VALID result at each position, in position order: [{ id, name, result }]. Processing keeps them in
     processing.positions; the current take always counts at its own position (projects measured before positions were
     kept have only that). An invalid take is never one of them. */
  function positionResults(p) {
    if (!p || !p.processing) return [];
    const map = Object.assign({}, p.processing.positions || {}), cur = p.processing.result;
    if (cur && cur.valid) map[posOf(cur)] = cur;
    return AM.demo.POSITIONS.filter(x => map[x.id] && map[x.id].valid).map(x => ({ id: x.id, name: x.name, result: map[x.id] }));
  }
  /* The room as measured: per band, the arithmetic mean over the positions with a reliable value there
     (AM.services.spatial). Every room-wide value reads it: the averages, the assessment, the treatment amount, the
     prediction, the summaries and the report. null without a valid take. */
  const room = p => AM.services.spatial.aggregate(positionResults(p));
  /* Every position with what happened there: valid (its result is part of the room), waiting (recorded, not processed),
     invalid or failed (the latest take there gave no value, with the reason; an earlier valid one there is kept), or
     not measured. next: where the next take is needed; required: valid positions still needed (at least
     AM.services.spatial.MIN_POSITIONS). */
  function positions(p) {
    const valid = new Map(positionResults(p).map(e => [e.id, e.result]));
    const att = p.processing.attempt, fail = p.measurement.failed, rec = p.measurement.recording;
    const done = new Set([...valid.values()].map(r => r.recordingId));
    const waiting = rec && rec.status === 'captured' && !done.has(rec.id) && !(att && att.recordingId === rec.id) ? posOf(rec) : null;
    const rows = AM.demo.POSITIONS.map((x, i) => {
      const r = valid.get(x.id) || null, after = at => !r || String(at) > String(r.takenAt);
      const issues = [
        att && posOf(att.result || att) === x.id && after(att.takenAt) ? { kind: 'invalid', takenAt: att.takenAt, reason: att.reason || null } : null,
        fail && (fail.position || null) === x.id && after(fail.takenAt) ? { kind: 'failed', takenAt: fail.takenAt, reason: fail.reason || null } : null,
      ].filter(Boolean).sort((a, b) => (String(a.takenAt) < String(b.takenAt) ? 1 : -1));
      return { id: x.id, name: x.name, detail: x.detail, no: i + 1, result: r, issue: issues[0] || null, waiting: waiting === x.id,
        status: r ? 'valid' : waiting === x.id ? 'waiting' : issues[0] ? issues[0].kind : 'not-measured', current: p.setup.position === x.id };
    });
    const count = valid.size, need = Math.max(0, AM.services.spatial.MIN_POSITIONS - count);
    const next = rows.find(x => x.status !== 'valid') || null;
    return { rows, count, required: AM.services.spatial.MIN_POSITIONS, need, complete: need === 0, next: next ? next.id : null };
  }

  // The reference band's own RT60 (1000 Hz, where a take's validity is decided), over the positions: band data, not the
  // room's overall RT60.
  const headlineMeasured = p => { const r = room(p); return r ? r.headline.rt60 : null; };
  /* Averages over the room's bands (AM.services.rt60Average: a band no position could measure is left out and named; at
     least half are needed). averageRT60: all bands, 125–4000 Hz, shown and stored as the room's overall figure.
     midAverageRT60: 500–2000 Hz by the same rule (kept for the record and the takes). The value the target is judged by
     is the evaluation summary (summaryRT60): the average over the bands the room's criterion sets (evaluation.js). */
  const averageRT60 = p => AM.services.rt60Average.of(room(p));
  const midAverageRT60 = p => AM.services.rt60Average.mid(room(p));
  // How the room is judged: the bands its criterion sets (AM.services.evaluation.policyFor).
  const policy = p => AM.services.evaluation.policyFor(p ? p.room : null, target(p));
  // The average over those bands: the summary figure beside the verdict, and what the treatment amount and the
  // prediction aim at.
  const summaryRT60 = p => AM.services.rt60Average.ofBands(room(p), policy(p).primary);
  // The bands the summary is taken over (the policy's bands when it has none: what a plan is checked against).
  const summaryBands = p => { const a = summaryRT60(p); return a.available ? a.included.map(b => b.f) : policy(p).primary.slice(); };
  const bandList = fs => (fs.length < 2 ? fs.join('') : `${fs.slice(0, -1).join(', ')} and ${fs[fs.length - 1]}`);

  /* The background noise has changed since the current measurement was taken: a newer valid noise measurement differs
     from the one in force at the time by more than 6 dB. Returns the difference in dB, or null. */
  function noiseChange(p) {
    const m = measured(p), n = p && p.setup.noise, ref = m && m.meta && m.meta.noiseCheck;
    if (!m || !n || !ref || ref.takenAt === n.takenAt) return null;
    // The background at another position is no change at this one (each position is checked on its own).
    if (n.position && n.position !== posOf(m)) return null;
    // In the RT60 bands where both measurements have that level (a DC offset or rumble is no change in the room);
    // otherwise the unfiltered levels, as measurements from before the in-band level were compared.
    const both = ref.bandLeqDbfs != null && n.inBand && n.inBand.leqDbfs != null;
    const now = both ? n.inBand.leqDbfs : n.leqDbfs, then = both ? ref.bandLeqDbfs : ref.leqDbfs;
    if (now == null || then == null) return null;
    const d = now - then;
    return Math.abs(d) > 6 ? Math.round(d * 10) / 10 : null;
  }

  /* One treatment item resolved against the catalog:
       product + tested configuration (from the database)
       size, quantity or area, placement (from the project)
       α at the measurement's octave bands, from that configuration's one-third-octave data: the mean of the three
       values in each octave, at most 1.00 (catalog.getOctaveAbsorption), because the RT60 it is combined with is an
       octave-band value
     Every item keeps its own data. Items are only combined in the prediction. */
  function resolveItem(t, index) {
    const cat = AM.services.catalog;
    const product = t && t.productId ? cat.getProduct(t.productId) : null;
    if (!product) return null;
    const found = t.configurationId ? cat.getAcousticConfiguration(t.configurationId) : null;
    const configuration = found && found.productId === product.id ? found : null;
    const sizes = product.size.options.map((o, i) => Object.assign({ index: i }, o)).filter(o => isNum(o.areaM2) && o.areaM2 > 0);
    const mode = t.size === 'area' || !sizes.length ? 'area' : 'units';
    const size = mode === 'units' ? (sizes.find(o => String(o.index) === String(t.size)) || sizes[0]) : null;
    const qty = Math.max(0, t.quantity || 0);
    const areaM2 = mode === 'units' ? qty * size.areaM2 : Math.max(0, isNum(t.areaM2) ? t.areaM2 : 0);
    const bandsAlpha = configuration ? cat.getOctaveAbsorption(configuration.id, AM.demo.BANDS) : { values: {}, missing: AM.demo.BANDS.slice(), thirds: {}, capped: [] };
    return {
      id: t.id, index, no: index + 1, path: `treatment.items.${index}`, placement: t.placement || 'Walls', rawAreaM2: t.areaM2,
      product, configuration, complete: !!configuration, mode, sizes, size, quantity: qty, areaM2, alpha: bandsAlpha.values, missingBands: bandsAlpha.missing,
      alphaThirds: bandsAlpha.thirds, alphaCapped: bandsAlpha.capped,
    };
  }
  const treatmentItems = p => ((p && p.treatment && p.treatment.items) || []).map(resolveItem).filter(Boolean);

  // The item being edited on the Treatment step: the active one, else the last one added.
  function treatmentSelection(p) {
    const items = treatmentItems(p);
    return items.find(i => i.id === p.treatment.active) || items[items.length - 1] || null;
  }

  // The whole plan. Only items with a tested configuration take part in the prediction.
  function treatmentPlan(p) {
    const items = treatmentItems(p), complete = items.filter(i => i.complete);
    return { items, complete, incomplete: items.filter(i => !i.complete), areaM2: complete.reduce((s, i) => s + i.areaM2, 0) };
  }

  /* The first thing that keeps the plan from being used, as a sentence for the user; null when every product has a
     tested configuration, an amount, and α in every band the prediction is judged in (the bands of the room's summary,
     summaryBands). Checked on Treatment, Predicted Result and Final Result. */
  function planProblem(p) {
    const plan = treatmentPlan(p);
    const open = plan.incomplete[0];
    if (open) return `Choose a tested configuration for #${open.no} ${open.product.name}, or remove it.`;
    const empty = plan.complete.find(i => !(i.areaM2 > 0));
    if (empty) return `Set ${empty.mode === 'units' ? 'how many panels of' : 'the area of'} #${empty.no} ${empty.product.name}, or remove it.`;
    const used = summaryBands(p);
    const gap = plan.items.find(i => used.some(f => i.missingBands.includes(f)));
    if (gap) return `#${gap.no} ${gap.product.name}: this configuration has no usable α at ${bandList(used.filter(f => gap.missingBands.includes(f)))} Hz in the source, and the prediction needs every band the room is judged in (${policy(p).short}).`;
    // The covered finishes' library absorption does not fit the measured room in a band the average needs (prediction.js).
    const raw = predictionRaw(p), clash = raw && raw.checks.find(c => c.id === 'covered-exceeds-measured' && c.bands.some(f => used.includes(f)));
    if (clash) return clash.text;
    return null;
  }

  /* The RT60 after treatment: the MEASURED room with the complete treatment plan (the room's own RT60 is never
     predicted; it is measured). Also each item on its own, so the plan can show what each product contributes and what
     they achieve together. */
  // What an item covers, from the room's surfaces: the finish's α per band where the surfaces say what it is (no surface
  // counted twice), else null (the prediction then says the covered finish is not known).
  const covered = (p, item) => { const c = AM.services.surfaces.coveredBy(p.room, item.placement); return c.known ? c : null; };

  const runPrediction = (p, m, g, list) => AM.services.prediction.predict({ V: g.V, S: g.total, bands: m.bands, treatment: { items: list.map(i => { const c = covered(p, i); return { areaM2: i.areaM2, alpha: i.alpha, coveredAlpha: c ? c.alpha : null }; }) }, referenceBand: m.referenceBand });
  // The prediction as computed, even when it gives no predicted average (planProblem says why).
  function predictionRaw(p) {
    const r = room(p), g = geometry(p), plan = treatmentPlan(p);
    return r && g && plan.complete.length ? runPrediction(p, r, g, plan.complete) : null;
  }
  /* The prediction, from the room as measured at every position (room), with its room-wide values: measured, the
     room's summary (summaryRT60: the average over the bands its criterion sets); predicted, the predicted average over
     exactly those bands (AM.services.rt60Average.ofPrediction), so the two compare like with like. null without both:
     a band without a value never gives a partial predicted average, and the 1000 Hz row (headline, kept as that band's
     own data) never stands in for it. verdict: the predicted bands judged by the same rule as the measured room
     (AM.services.evaluation), predictedStatus its status. allBands: the predicted average over the bands the measured
     all-band average used (stored with the report form), or null. Each item: its added absorption at the reference
     band, and alonePredicted, the predicted summary with that item alone. */
  function prediction(p) {
    const r = room(p), g = geometry(p), plan = treatmentPlan(p), RA = AM.services.rt60Average, EV = AM.services.evaluation;
    if (!r || !g || !plan.complete.length) return null;
    const pol = policy(p), measuredAverage = RA.ofBands(r, pol.primary);
    if (!measuredAverage.available) return null;
    const run = list => runPrediction(p, r, g, list);
    const out = run(plan.complete), used = measuredAverage.included.map(b => b.f);
    out.average = RA.ofPrediction(out.bands, used);
    if (!out.average.available) return null;
    const all = RA.of(r), allBands = all.available ? RA.ofPrediction(out.bands, all.included.map(b => b.f)) : null;
    Object.assign(out, { policy: pol, measuredAverage, measured: measuredAverage.value, predicted: out.average.value, plan, allBands: allBands && allBands.available ? allBands : null });
    const t = target(p);
    if (t) {
      out.verdictRows = EV.bandRows(Object.fromEntries(out.bands.map(b => [b.f, b.predicted])), t, pol);
      out.verdict = EV.verdict(out.verdictRows, out.average, t, pol);
      out.predictedStatus = out.verdict.status;
    }
    out.items = plan.complete.map((it, k) => {
      const alone = RA.ofPrediction(run([it]).bands, used);
      return Object.assign({}, it, { addedA: out.headline ? out.headline.items[k].addedA : null, alonePredicted: alone.available ? alone.value : null });
    });
    return out;
  }
  // A prediction exists once the user has reached Treatment.
  const predictionStarted = (p, current) => !!p && (W.isDone(p, 'treatment') || current === 'treatment');

  /* The room against its target (AM.services.evaluation), from the room as measured at every position (room):
       policy     the bands the room's criterion sets (e.g. 250–2000 Hz for DIN 18041 group A) and the limits elsewhere
       summary    the average over those bands, the summary figure (rt, diff; summaryStatus its own place in the range)
       bands      every band against its own limits, role primary | secondary | info, with how many positions it rests on
       verdict    every primary band within the target range, or not: status above | within | below. A primary band
                  outside the range decides it even when the summary is inside (verdict.masked); a band that could not
                  be measured leaves it incomplete (verdict.missing), never passed
       warnings   secondary bands outside their own, wider limits: said, not part of the verdict
       explanation  the verdict in plain words
       average    the all-band average (125–4000 Hz), shown as the room's overall figure; mid, midStatus: 500–2000 Hz
       positions  how many valid positions the room rests on; provisional while fewer than the session needs
       ref        the reference band's own result over the positions (1000 Hz, where a take's validity is decided)
     Without the summary (too few of the policy's bands measured): available false, no status, and the reason; the bands
     are still compared one by one. null without a valid measurement or a target. */
  function assessment(p) {
    const r = room(p), t = target(p);
    if (!r || !t) return null;
    const EV = AM.services.evaluation, RA = AM.services.rt60Average, pol = policy(p);
    const summary = RA.ofBands(r, pol.primary), avg = RA.of(r), mid = RA.mid(r);
    const bands = EV.bandRows(Object.fromEntries(r.bands.map(b => [b.f, RA.eligible(b) ? b.rt60 : null])), t, pol)
      .map(row => { const b = r.bands.find(x => x.f === row.f); return Object.assign(row, { n: b ? b.n : 0, of: b ? b.of : r.count }); });
    const verdict = EV.verdict(bands, summary, t, pol);
    const out = {
      target: t, policy: pol, summary, average: avg, available: summary.available, reason: summary.available ? null : summary.reason, bands,
      verdict, warnings: verdict.warnings, explanation: EV.explain(verdict, bands, t, pol),
      mid, midStatus: mid.available ? A.classify(mid.value, t) : null,
      above: bands.filter(b => b.status === 'above').length,
      ref: { f: r.referenceBand, rt: r.headline.rt60, method: r.headline.method, confidence: r.headline.confidence },
      positions: { valid: r.count, required: r.minimum, complete: r.complete }, provisional: !r.complete,
    };
    // blocked: a short sentence for the step's action bar (which bands are missing).
    if (!summary.available) return Object.assign(out, { rt: null, diff: null, status: null, summaryStatus: null, blocked: `No result for the ${pol.label.toLowerCase()}: only ${summary.total - summary.missing.length} of ${summary.total} of its bands were measured reliably. Measure again.` });
    return Object.assign(out, { rt: summary.value, diff: summary.value - t.preferred, status: verdict.status, summaryStatus: verdict.summaryStatus });
  }

  /* The six bands in three groups anyone recognises, for Results and Assessment: low sounds (125 and 250 Hz), voices
     (500, 1000 and 2000 Hz) and high sounds (4000 Hz). Each group's RT60 is the mean of its bands that have a value
     (AM.services.rt60Average.eligible); `missing` lists the bands that have none. A plain-language summary only: the
     room's RT60 compared with the target stays the average over the bands. With a target, each group's status against the
     range. null without a valid measurement. */
  const GROUPS = [
    { id: 'low', label: 'Low sounds', example: 'Footsteps, AC hum', icon: 'wave', bands: [125, 250] },
    { id: 'voices', label: 'Voices', example: 'People talking', icon: 'users', bands: [500, 1000, 2000] },
    { id: 'high', label: 'High sounds', example: 'Keyboard clicks, clinking cups', icon: 'sparkles', bands: [4000] },
  ];
  /* Each group's status comes from its bands' own verdicts (assessment().bands, the room's criterion): too echoey when
     any of its bands is above its limit, too dull when any is below and none above, just right when the bands with a
     limit are within; 'none' when the criterion sets no limit for any of its bands (shown without a judgement). So the
     plain view never says "just right" for a group with a band outside its limit. */
  function soundGroups(p) {
    const r = room(p), t = target(p), RA = AM.services.rt60Average;
    if (!r) return null;
    const rows = t ? AM.services.evaluation.bandRows(Object.fromEntries(r.bands.map(b => [b.f, RA.eligible(b) ? b.rt60 : null])), t, policy(p)) : null;
    return GROUPS.map(g => {
      const have = g.bands.map(f => r.bands.find(b => b.f === f)).filter(b => RA.eligible(b));
      const value = have.length ? have.reduce((s, b) => s + b.rt60, 0) / have.length : null;
      let status = null;
      if (rows && value != null) {
        const st = rows.filter(x => g.bands.includes(x.f) && x.rt != null).map(x => x.status);
        status = st.includes('above') ? 'above' : st.includes('below') ? 'below' : st.includes('within') ? 'within' : 'none';
      }
      return Object.assign({}, g, { value, missing: g.bands.filter(f => !have.some(b => b.f === f)), status });
    });
  }

  // Sabine's equivalent absorption that would bring the room's summary RT60 to the preferred target. null without it.
  function absorptionGap(p) {
    const a = assessment(p), g = geometry(p);
    return a && a.available && g ? AM.services.prediction.absorptionNeeded(g.V, a.rt, a.target.preferred) : null;
  }

  /* Amount of one item (default: the one being edited) at which the predicted summary RT60 (the average over the bands
     the room is judged in) reaches the preferred target, with the other items of the plan as they are
     (prediction.areaForAverage: the same model and bands as the prediction). null when there is no summary or no amount
     reaches the target. The predicted verdict (prediction().verdict) still judges every band on its own. */
  function treatmentForTarget(p, item) {
    const r = room(p), t = target(p), g = geometry(p), sel = item || treatmentSelection(p);
    if (!r || !t || !g || !sel || !sel.complete) return null;
    const input = i => { const c = covered(p, i); return { areaM2: i.areaM2, alpha: i.alpha, coveredAlpha: c ? c.alpha : null }; };
    const others = treatmentPlan(p).complete.filter(i => i.id !== sel.id);
    if (!summaryRT60(p).available) return null;
    const area = AM.services.prediction.areaForAverage({ V: g.V, S: g.total, bands: r.bands, item: input(sel), others: others.map(input), targetRT: t.preferred, over: summaryBands(p) });
    if (area == null) return null;
    return { areaM2: area, units: sel.size ? Math.ceil(area / sel.size.areaM2 - 1e-9) : null, itemId: sel.id, withOthers: others.some(i => i.areaM2 > 0) };
  }

  // Treatment is needed when the verdict is "above": a band the room is judged in rings longer than the target allows
  // (product flow: "room meets target"). Without an assessment, or without its summary, it is not known to be unnecessary.
  const treatmentRequired = p => { const a = assessment(p); return !a || !a.available || a.status === 'above'; };
  // The room does not need treatment and none was chosen: Predicted Result and Final Result show the measured room.
  const noTreatment = p => !treatmentRequired(p) && !treatmentItems(p).length;

  /* Treatment area against the surface it is placed on, per placement, summed over every item placed there.
     placement: only that group. The surface is its free finish (AM.services.surfaces.coveredBy): the area less doors,
     windows, an existing covering and the equipment on the walls, so the plan never covers the same m² twice. Returns
     [{ placement, label, surfaceM2, areaM2, fraction, count }]. */
  function coverage(p, placement) {
    const g = geometry(p);
    if (!g) return [];
    const items = treatmentItems(p), SF = AM.services.surfaces;
    return SF.placementsFor(p.room).filter(pl => !placement || pl.value === placement).map(pl => {
      const here = items.filter(i => i.placement === pl.value);
      if (!here.length) return null;
      const surfaceM2 = SF.coveredBy(p.room, pl.value).freeM2, areaM2 = here.reduce((s, i) => s + i.areaM2, 0);
      return { placement: pl.value, label: pl.value, surfaceM2, areaM2, fraction: surfaceM2 ? areaM2 / surfaceM2 : 0, count: here.length };
    }).filter(Boolean);
  }

  /* Takes newer than the current measurement that it does not include, newest kinds first: [{ kind, takenAt, reason }],
     kind 'unprocessed' (recorded, not processed yet), 'invalid' (processed, no valid result) or 'failed' (could not be
     analysed). The current measurement stays what Results, the top bar and the report show; these say why a newer
     take is not it. Empty without a current measurement (the screens then say what is missing instead). */
  function laterTakes(p) {
    const m = measured(p), out = [];
    if (!m) return out;
    const att = p.processing.attempt, fail = p.measurement.failed, rec = p.measurement.recording;
    if (rec && rec.status === 'captured' && rec.id !== m.recordingId && rec.takenAt > m.takenAt && !(att && att.recordingId === rec.id)) out.push({ kind: 'unprocessed', takenAt: rec.takenAt, reason: null });
    if (att && att.takenAt > m.takenAt) out.push({ kind: 'invalid', takenAt: att.takenAt, reason: att.reason || null });
    if (fail && fail.takenAt > m.takenAt) out.push({ kind: 'failed', takenAt: fail.takenAt, reason: fail.reason || null });
    return out.sort((a, b) => (a.takenAt < b.takenAt ? 1 : a.takenAt > b.takenAt ? -1 : 0));
  }

  /* The current measurement's technical record, to send when a device measures oddly: how the browser and device were
     configured and what each check found, band by band. No audio, and nothing that names a person, a place or a
     device: no project or room name, no position, no microphone or output label or id. null without a measurement. */
  function diagnostics(p) {
    const m = measured(p);
    if (!m) return null;
    const meta = m.meta || {}, cfg = meta.config || {}, plan = meta.plan || {}, out = cfg.output || {}, nc = p.setup && p.setup.noise;
    const pick = (o, keys) => (o ? Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]])) : null);
    return {
      kind: 'acoustic-measurement-diagnostics', version: 2, app: (AM.reportForm && AM.reportForm.appVersion) || null,
      takenAt: m.takenAt, processedAt: m.processedAt, status: m.status, valid: m.valid,
      device: {
        profile: cfg.profile || meta.deviceKind || null, profileChosen: cfg.profileChosen != null ? cfg.profileChosen : null, detected: cfg.detected || null,
        browser: cfg.browser || null, sampleRate: meta.sampleRate || cfg.sampleRate || null, channelCount: cfg.channelCount != null ? cfg.channelCount : null, tap: cfg.tap || meta.tap || null,
        processing: (cfg.processing || []).map(s => ({ feature: s.key, requested: s.requested, reported: s.reported, state: s.state, capable: s.capable })),
        settingsReported: pick(meta.settings, ['echoCancellation', 'noiseSuppression', 'autoGainControl', 'channelCount', 'sampleRate', 'latency']),
        supported: cfg.supported || null,
        output: { selectable: out.selectable != null ? out.selectable : null, systemDefault: out.requested ? out.requested === 'default' : null, confirmed: out.verified != null ? out.verified : null, error: out.error ? 'the selected output could not be used' : null },
      },
      signal: pick(plan, ['f1', 'f2', 'seconds', 'preRoll', 'tail', 'levelDb', 'playedPeakDbfs']),
      recording: {
        levels: meta.levels || null, latencySec: meta.latencySec != null ? meta.latencySec : null, arrivalClarityDb: meta.arrivalClarityDb != null ? meta.arrivalClarityDb : null,
        irSeconds: meta.irSeconds != null ? meta.irSeconds : null, distortion: meta.distortion || null,
        timing: meta.timing || null, clicks: meta.clicks || null, inputLevelDuringSweepDb: meta.sweepGainDb != null ? meta.sweepGainDb : null,
        backgroundChangeAfterSweepDb: meta.levelChangeDb != null ? meta.levelChangeDb : null, browserCounts: meta.integrity || null,
      },
      backgroundCheck: nc ? { status: nc.status, takenAt: nc.takenAt, leqDbfs: nc.leqDbfs, inBandLeqDbfs: nc.inBand ? nc.inBand.leqDbfs : null, dcDbfs: nc.dcDbfs != null ? nc.dcDbfs : null, driftDb: nc.inBand ? nc.inBand.driftDb : null } : null,
      bands: m.bands.map(b => ({ f: b.f, rt60: b.rt60, path: b.path, t20: b.t20, t30: b.t30, decayRangeDb: b.decayRangeDb, headDb: b.headDb, xi: b.xi, curvature: b.curvature, quality: b.quality, confidence: b.confidence, reason: b.reason || null })),
      averageRT60: (a => ({ bands: a.included.map(b => b.f), leftOut: a.missing.map(b => b.f), available: a.available, value: a.available ? a.value : null, reason: a.available ? null : a.reason }))(averageRT60(p)),
      midAverageRT60: (a => ({ bands: a.included.map(b => b.f), leftOut: a.missing.map(b => b.f), available: a.available, value: a.available ? a.value : null, reason: a.available ? null : a.reason }))(midAverageRT60(p)),
      // The room over its valid takes, one per measuring spot (counted, never named): how many, and each band per take
      // and averaged.
      spatial: (r => (r ? { method: 'arithmetic mean per band over the valid takes', takes: r.count, required: r.minimum,
        bands: r.bands.map(b => ({ f: b.f, rt60: b.rt60, n: b.n, of: b.of, perTake: b.values.map(v => v.rt60), spread: b.spread })) } : null))(room(p)),
      warnings: m.warnings || [],
    };
  }

  /* One processed take in brief, for comparing takes made at different sweep levels: its level; at the reference band
     the usable decay, T20, T30, r² and quality; how many bands have a value; the distortion products. */
  function takeSummary(r) {
    const ref = r.bands.find(b => b.f === r.referenceBand) || {}, meta = r.meta || {}, plan = meta.plan || {};
    return {
      position: posOf(r),
      levelDb: plan.levelDb == null ? 0 : plan.levelDb, decayDb: ref.decayRangeDb == null ? null : ref.decayRangeDb,
      t20: ref.t20 == null ? null : ref.t20, t30: ref.t30 == null ? null : ref.t30, r2: ref.r2 == null ? null : ref.r2,
      quality: ref.rt60 != null ? ref.quality : null, bandsValid: r.bands.filter(b => b.rt60 != null).length, bandsTotal: r.bands.length,
      distortion: meta.distortion || null,
      // The average of this take, as the headline would have shown it (null when one of its bands failed or the take
      // was not valid), and the bands it is taken over. Kept with superseded takes, whose bands are not stored; takes
      // stored before the six-band average carry no averageBands and are not shown as one.
      average: (a => (a.available ? a.value : null))(AM.services.rt60Average.of(r)),
      averageBands: AM.services.rt60Average.SHORT,
    };
  }

  /* The project's takes that can be compared, newest first: the current measurement (the latest valid take), the
     latest valid take at each other position (in use: part of the room), those they replaced, the latest take processed
     but not valid, the latest take that could not be used; each with its position. Nothing is overwritten to build it.
     spread: how far RT60 at the reference band differs between valid takes made at the SAME position at different
     levels (a fraction; the largest over the positions), else null: positions differ for real, so they are not compared
     here. Takes from before the sweep level existed were made at the default level. */
  function takeComparison(p) {
    const rows = [], cur = measured(p), att = p.processing.attempt, fail = p.measurement.failed;
    positionResults(p).forEach(e => rows.push(Object.assign({ status: cur && e.result.recordingId === cur.recordingId ? 'current' : 'in-use', takenAt: e.result.takenAt, rt60: e.result.headline.rt60, method: e.result.headline.method }, takeSummary(e.result))));
    (p.processing.history || []).forEach(h => rows.push(Object.assign({ levelDb: 0, position: 'P1' }, h, { status: 'superseded' })));
    if (att && att.result) rows.push(Object.assign({ status: 'invalid', takenAt: att.takenAt, rt60: null, method: null, reason: att.reason }, takeSummary(att.result)));
    if (fail && !rows.some(r => r.takenAt === fail.takenAt)) rows.push({ status: 'failed', takenAt: fail.takenAt, position: fail.position || null, levelDb: fail.levelDb == null ? 0 : fail.levelDb, rt60: null, method: null, reason: fail.reason });
    rows.sort((a, b) => (a.takenAt < b.takenAt ? 1 : a.takenAt > b.takenAt ? -1 : 0));
    const spreads = AM.demo.POSITIONS.map(x => {
      const valid = rows.filter(r => r.rt60 != null && r.position === x.id);
      return valid.length > 1 && new Set(valid.map(r => r.levelDb)).size > 1 ? Math.max(...valid.map(r => r.rt60)) / Math.min(...valid.map(r => r.rt60)) - 1 : null;
    }).filter(s => s != null);
    return { rows, spread: spreads.length ? Math.max(...spreads) : null };
  }

  // One saved project in brief, for Measurement History and the Home page. Everything comes from the project itself.
  function summary(p) {
    const m = measured(p), next = W.STAGES.find(s => s.id !== 'home' && !p.completed.includes(s.id));
    const rev = W.STAGES.find(s => p.review.includes(s.id)); // first finished step flagged after an earlier change
    const t = target(p), a = assessment(p), plan = treatmentPlan(p), pred = prediction(p), avg = averageRT60(p), r = room(p), sm = summaryRT60(p), pol = policy(p);
    return {
      id: p.id, kind: p.kind, name: p.room.name || 'Untitled room', industry: p.room.industry, type: p.room.type,
      geometry: geometry(p), measured: r ? r.headline.rt60 : null, band: r ? r.referenceBand : null,
      average: avg.available ? avg.value : null, averageBands: avg.n, bandsTotal: avg.total,
      // The figure the room is judged by (its criterion's bands) and how many positions it rests on.
      summary: sm.available ? sm.value : null, summaryLabel: pol.label, summaryName: pol.name, summaryShort: pol.short, positions: r ? r.count : 0, positionsRequired: AM.services.spatial.MIN_POSITIONS,
      measuredAt: m ? m.takenAt : null,
      target: t ? t.preferred : null,
      status: a ? a.status : null, // the verdict: above, within or below (null without the summary)
      treatment: { items: plan.items.length, predicted: pred ? pred.predicted : null, predictedStatus: pred && t ? pred.predictedStatus : null, required: treatmentRequired(p) },
      done: p.completed.filter(id => id !== 'home').length, total: W.NUMBERED, next: next ? next.title : null,
      review: p.review.length, reviewNext: rev ? rev.title : null,
      pinned: !!p.pinned, updatedAt: p.updatedAt, createdAt: p.createdAt,
    };
  }

  AM.derive = { geometry, target, measured, room, positions, positionResults, positionOf: posOf, policy, summaryRT60, summaryBands, headlineMeasured, averageRT60, midAverageRT60, noiseChange, treatmentItems, treatmentSelection, treatmentPlan, planProblem, prediction, predictionStarted, assessment, soundGroups, absorptionGap, treatmentForTarget, treatmentRequired, noTreatment, coverage, summary, takeSummary, takeComparison, coveredBy: covered, laterTakes, diagnostics };
})(window.AM);
