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
  const measured = p => {
    const r = p && p.processing.result;
    return r && r.valid ? r : null;
  };
  const headlineMeasured = p => { const m = measured(p); return m ? m.headline.rt60 : null; };
  /* Average RT60 across the measured bands of the CURRENT measurement only (AM.services.rt60Average): the summary value
     the screens and the report show. The assessment, treatment and prediction keep using the band values. */
  const averageRT60 = p => AM.services.rt60Average.of(measured(p));

  /* The background noise has changed since the current measurement was taken: a newer valid noise measurement differs
     from the one in force at the time by more than 6 dB. Returns the difference in dB, or null. */
  function noiseChange(p) {
    const m = measured(p), n = p && p.setup.noise, ref = m && m.meta && m.meta.noiseCheck;
    if (!m || !n || !ref || ref.takenAt === n.takenAt) return null;
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
     tested configuration, an amount, and α at the reference band. Checked on Treatment, Predicted Result and Final Result. */
  function planProblem(p) {
    const plan = treatmentPlan(p), f = AM.demo.REFERENCE_BAND;
    const open = plan.incomplete[0];
    if (open) return `Choose a tested configuration for #${open.no} ${open.product.name}, or remove it.`;
    const empty = plan.complete.find(i => !(i.areaM2 > 0));
    if (empty) return `Set ${empty.mode === 'units' ? 'how many panels of' : 'the area of'} #${empty.no} ${empty.product.name}, or remove it.`;
    const gap = plan.items.find(i => i.missingBands.includes(f));
    if (gap) return `#${gap.no} ${gap.product.name}: this configuration has no usable α at ${f} Hz in the source.`;
    // The covered finishes' library absorption does not fit the measured room at the reference band (prediction.js).
    const raw = predictionRaw(p), clash = raw && raw.headline && raw.headline.coveredExceedsMeasured && raw.checks.find(c => c.id === 'covered-exceeds-measured');
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
  // The prediction as computed, even when it gives no value at the reference band (planProblem says why).
  function predictionRaw(p) {
    const m = measured(p), g = geometry(p), plan = treatmentPlan(p);
    return m && g && plan.complete.length ? runPrediction(p, m, g, plan.complete) : null;
  }
  function prediction(p) {
    const m = measured(p), g = geometry(p), plan = treatmentPlan(p);
    if (!m || !g || !plan.complete.length) return null;
    const run = list => runPrediction(p, m, g, list);
    const out = run(plan.complete);
    if (!out.headline || out.headline.predicted == null) return null;
    out.plan = plan;
    out.items = plan.complete.map((it, k) => Object.assign({}, it, { addedA: out.headline.items[k].addedA, alone: run([it]).headline }));
    return out;
  }
  // A prediction exists once the user has reached Treatment.
  const predictionStarted = (p, current) => !!p && (W.isDone(p, 'treatment') || current === 'treatment');

  function assessment(p) {
    const m = measured(p), t = target(p);
    if (!m || !t) return null;
    const rt = m.headline.rt60;
    const bands = m.bands.map(b => ({
      f: b.f, rt: b.rt60,
      status: b.rt60 == null ? 'insufficient' : A.classify(b.rt60, t),
      diff: b.rt60 == null ? null : b.rt60 - t.preferred,
    }));
    return {
      target: t, rt, f: m.referenceBand, method: m.headline.method, confidence: m.headline.confidence,
      diff: rt - t.preferred, status: A.classify(rt, t), bands,
      above: bands.filter(b => b.status === 'above').length,
    };
  }

  function absorptionGap(p) {
    const a = assessment(p), g = geometry(p);
    return a && g ? AM.services.prediction.absorptionNeeded(g.V, a.rt, a.target.preferred) : null;
  }

  /* Amount of one item (default: the one being edited) that would reach the preferred target at the reference
     band, given the absorption the other items of the plan already add. */
  function treatmentForTarget(p, item) {
    const m = measured(p), t = target(p), g = geometry(p), sel = item || treatmentSelection(p);
    if (!m || !t || !g || !sel || !sel.complete) return null;
    const f = m.referenceBand;
    const net = i => { const c = covered(p, i), cv = c ? c.alpha[f] : null; return isNum(i.alpha[f]) ? i.areaM2 * (i.alpha[f] - (isNum(cv) ? cv : 0)) : 0; };
    const others = treatmentPlan(p).complete.filter(i => i.id !== sel.id).reduce((s, i) => s + net(i), 0);
    const c = covered(p, sel);
    const area = AM.services.prediction.areaFor({ V: g.V, bands: m.bands, alpha: sel.alpha, referenceBand: f, targetRT: t.preferred, addedA: others, coveredAlpha: c ? c.alpha : null });
    if (area == null) return null;
    return { areaM2: area, units: sel.size ? Math.ceil(area / sel.size.areaM2 - 1e-9) : null, itemId: sel.id, withOthers: others > 0 };
  }

  // Treatment is needed only when the measured room is above the target range (product flow: "room meets target").
  const treatmentRequired = p => { const a = assessment(p); return !a || a.status === 'above'; };
  // The room does not need treatment and none was chosen: Predicted Result and Final Result show the measured room.
  const noTreatment = p => !treatmentRequired(p) && !treatmentItems(p).length;

  /* Treatment area against the surface it is placed on, per placement, summed over every item placed there.
     placement: only that group. The surface is its free finish (AM.services.surfaces.coveredBy): the area less doors,
     windows and an existing covering, so the plan never covers the same m² twice. Returns
     [{ placement, label, surfaceM2, areaM2, fraction, count }]. */
  function coverage(p, placement) {
    const g = geometry(p);
    if (!g) return [];
    const items = treatmentItems(p), SF = AM.services.surfaces;
    return SF.PLACEMENTS.filter(pl => !placement || pl.value === placement).map(pl => {
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
      kind: 'acoustic-measurement-diagnostics', version: 1, app: (AM.reportForm && AM.reportForm.appVersion) || null,
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
      average500to2000: (a => ({ available: a.available, value: a.available ? a.value : null, reason: a.available ? null : a.reason }))(averageRT60(p)),
      warnings: m.warnings || [],
    };
  }

  /* One processed take in brief, for comparing takes made at different sweep levels: its level; at the reference band
     the usable decay, T20, T30, r² and quality; how many bands have a value; the distortion products. */
  function takeSummary(r) {
    const ref = r.bands.find(b => b.f === r.referenceBand) || {}, meta = r.meta || {}, plan = meta.plan || {};
    return {
      levelDb: plan.levelDb == null ? 0 : plan.levelDb, decayDb: ref.decayRangeDb == null ? null : ref.decayRangeDb,
      t20: ref.t20 == null ? null : ref.t20, t30: ref.t30 == null ? null : ref.t30, r2: ref.r2 == null ? null : ref.r2,
      quality: ref.rt60 != null ? ref.quality : null, bandsValid: r.bands.filter(b => b.rt60 != null).length, bandsTotal: r.bands.length,
      distortion: meta.distortion || null,
      // The 500–2000 Hz average of this take, as the headline would have shown it (null when one of its bands failed or
      // the take was not valid). Kept with superseded takes, whose bands are not stored.
      average: (a => (a.available ? a.value : null))(AM.services.rt60Average.of(r)),
    };
  }

  /* The project's takes that can be compared, newest first: the current measurement, those it replaced, the latest take
     processed but not valid, the latest take that could not be used. Nothing is overwritten to build it. spread: how far
     RT60 at the reference band differs between valid takes made at different levels (a fraction), else null. Takes from
     before the sweep level existed were made at the default level. */
  function takeComparison(p) {
    const rows = [], cur = measured(p), att = p.processing.attempt, fail = p.measurement.failed;
    if (cur) rows.push(Object.assign({ status: 'current', takenAt: cur.takenAt, rt60: cur.headline.rt60, method: cur.headline.method }, takeSummary(cur)));
    (p.processing.history || []).forEach(h => rows.push(Object.assign({ levelDb: 0 }, h, { status: 'superseded' })));
    if (att && att.result) rows.push(Object.assign({ status: 'invalid', takenAt: att.takenAt, rt60: null, method: null, reason: att.reason }, takeSummary(att.result)));
    if (fail && !rows.some(r => r.takenAt === fail.takenAt)) rows.push({ status: 'failed', takenAt: fail.takenAt, levelDb: fail.levelDb == null ? 0 : fail.levelDb, rt60: null, method: null, reason: fail.reason });
    rows.sort((a, b) => (a.takenAt < b.takenAt ? 1 : a.takenAt > b.takenAt ? -1 : 0));
    const valid = rows.filter(r => r.rt60 != null);
    const spread = valid.length > 1 && new Set(valid.map(r => r.levelDb)).size > 1 ? Math.max(...valid.map(r => r.rt60)) / Math.min(...valid.map(r => r.rt60)) - 1 : null;
    return { rows, spread };
  }

  // One saved project in brief, for Measurement History and the Home page. Everything comes from the project itself.
  function summary(p) {
    const m = measured(p), next = W.STAGES.find(s => s.id !== 'home' && !p.completed.includes(s.id));
    const rev = W.STAGES.find(s => p.review.includes(s.id)); // first finished step flagged after an earlier change
    const t = target(p), a = assessment(p), plan = treatmentPlan(p), pred = prediction(p), avg = averageRT60(p);
    return {
      id: p.id, kind: p.kind, name: p.room.name || 'Untitled room', industry: p.room.industry, type: p.room.type,
      geometry: geometry(p), measured: m ? m.headline.rt60 : null, band: m ? m.referenceBand : null,
      average: avg.available ? avg.value : null, averageBands: avg.n, bandsTotal: avg.total,
      measuredAt: m ? m.takenAt : null,
      target: t ? t.preferred : null,
      status: a ? a.status : null, // measured against the target: above, within or below
      treatment: { items: plan.items.length, predicted: pred ? pred.headline.predicted : null, predictedStatus: pred && t ? A.classify(pred.headline.predicted, t) : null, required: treatmentRequired(p) },
      done: p.completed.filter(id => id !== 'home').length, total: W.NUMBERED, next: next ? next.title : null,
      review: p.review.length, reviewNext: rev ? rev.title : null,
      pinned: !!p.pinned, updatedAt: p.updatedAt, createdAt: p.createdAt,
    };
  }

  AM.derive = { geometry, target, measured, headlineMeasured, averageRT60, noiseChange, treatmentItems, treatmentSelection, treatmentPlan, planProblem, prediction, predictionStarted, assessment, absorptionGap, treatmentForTarget, treatmentRequired, noTreatment, coverage, summary, takeSummary, takeComparison, coveredBy: covered, laterTakes, diagnostics };
})(window.AM);
