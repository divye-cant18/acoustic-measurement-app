/* Derived values shared across stages, so every screen reads the same numbers the same way.
   Measured values come only from a valid processing result. Predicted values come only from the prediction engine.
   Product data comes only from the catalog; the project stores ids and amounts, never product data. */
(function (AM) {
  'use strict';
  const W = AM.workflow, A = AM.acoustics;
  const { isNum } = AM.util;

  // The room's geometry, once every dimension is entered and within Room Setup's limits (its dimError); null before, so
  // no screen shows a volume Room Setup does not accept.
  const geometry = p => {
    if (!p) return null;
    const m = (W.get('room') || {}).model;
    return m && ['L', 'W', 'H'].some(k => m.dimError(k, p.room[k])) ? null : A.geometry(p.room);
  };
  // The project's target when it is complete: a range (preferred, min, max) or an upper limit only (form 'max').
  const target = p => {
    const t = p && p.target;
    return t && AM.services.target.complete(t) ? t : null;
  };
  // The value a treatment aims at: the preferred value, or the upper limit of an upper-limit target.
  const aim = t => AM.services.target.aim(t);
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
      amountBy: t.amountBy === 'app' ? 'app' : 'user', // who set the amount: the app (autoPlan) or the user
      recommendedConfig: t.recommendedConfig || null, // the mounting the app recommended when the product was chosen
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
    // A product tested without a value in a band the room is judged in cannot be predicted: said before its amount.
    const used = summaryBands(p);
    const gap = plan.items.find(i => used.some(f => i.missingBands.includes(f)));
    if (gap) return `#${gap.no} ${gap.product.name}: this version's test has no absorption value at ${bandList(used.filter(f => gap.missingBands.includes(f)))} Hz, which this room is judged on (${policy(p).short}), so its effect cannot be predicted. Choose another version or mounting, or another product.`;
    // An amount of none is a problem only when the user set it: the app may find that the others are enough (autoPlan).
    const empty = plan.complete.find(i => !(i.areaM2 > 0)) && plan.complete.every(i => !(i.areaM2 > 0)) ? plan.complete[0] : plan.complete.find(i => !(i.areaM2 > 0) && i.amountBy === 'user');
    if (empty) return `Set ${empty.mode === 'units' ? 'how many panels of' : 'the area of'} #${empty.no} ${empty.product.name}, or remove it.`;
    // More treatment than the surface it goes on (overfill): the panels do not fit, so there is nothing to predict.
    const over = overfill(p);
    if (over) return over;
    // The covered finishes' library absorption does not fit the measured room in a band the average needs (prediction.js).
    const raw = predictionRaw(p), clash = raw && raw.checks.find(c => c.id === 'covered-exceeds-measured' && c.bands.some(f => used.includes(f)));
    return clash ? clash.text : null;
  }
  // More treatment than a surface holds, as a sentence for the user (null when everything fits). A product on Wall 1 also
  // takes room on the walls, and one on the walls on the walls and ceiling (coverage).
  function overfill(p) {
    const over = coverage(p).find(c => c.over);
    return over ? `The treatment on ${/^Wall \d$/.test(over.label) ? over.label : `the ${over.label.toLowerCase()}`} (${AM.util.fmt.m2(over.areaM2)}${over.count > 1 ? `, ${over.count} products` : ''}) is more than its free surface (${AM.util.fmt.m2(over.surfaceM2)}), so it cannot be predicted. Reduce the amount or change the placement.` : null;
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
     band, and alonePredicted, the predicted summary with that item alone. null too while the products do not fit on
     their surfaces (overfill): a result for panels that cannot be put up would mislead. */
  function prediction(p) {
    const r = room(p), g = geometry(p), plan = treatmentPlan(p), RA = AM.services.rt60Average, EV = AM.services.evaluation;
    if (!r || !g || !plan.complete.length || overfill(p)) return null;
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
  // Why there is no prediction, as a sentence for the user (null when there is one, or when none is needed).
  function predictionMissing(p) {
    if (prediction(p) || noTreatment(p)) return null;
    if (!room(p)) return 'The prediction needs a valid measurement. Measure the room in Acoustic Measurement.';
    if (!target(p)) return 'The prediction needs a target. Set it in Target / Ideal RT60.';
    if (!geometry(p)) return 'The prediction needs the room size. Check the length, width and height in Room Setup.';
    if (!treatmentItems(p).length) return 'Choose a product in Treatment: the room needs treatment, and the prediction is made from the products chosen there.';
    return planProblem(p) || 'The prediction needs a complete treatment plan. Check it in Treatment.';
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
      positions: { valid: r.count, required: r.minimum, complete: r.complete },
      // Provisional while fewer positions than the session needs were measured, or while a judged band rests on fewer of
      // them (ISO 3382-2's survey method needs two source-microphone combinations for every result).
      thinBands: bands.filter(b => (b.role === 'primary' || b.role === 'edge') && b.rt != null && b.n < r.minimum).map(b => b.f),
    };
    out.provisional = !r.complete || out.thinBands.length > 0;
    // blocked: a short sentence for the step's action bar (which bands are missing).
    if (!summary.available) return Object.assign(out, { rt: null, diff: null, status: null, summaryStatus: null, reliability: null, blocked: `No result for the ${pol.label.toLowerCase()}: only ${summary.total - summary.missing.length} of ${summary.total} of its bands were measured reliably. Measure again.` });
    return Object.assign(out, { rt: summary.value, diff: summary.value - aim(t), status: verdict.status, summaryStatus: verdict.summaryStatus, reliability: reliability(r, out) });
  }

  /* How far the result can be relied on, in one word and its first reason, from what the room's values rest on. It
     changes no value. Over the judged bands (primary and edge):
       limited  fewer positions than the session needs, or a judged band with no value (left out of the result)
       fair     a judged band at fewer positions than needed; positions that differ by more than SPREAD in a judged band
                (ISO 3382-2 expects the survey method to be within about 10 % in octave bands, so two positions within
                that of the room's value differ by up to 20 %); a judged band whose decay carries a note or could not be
                checked over 30 dB (quality Fair)
       good     none of these */
  const SPREAD = 0.2;
  function reliability(r, a) {
    const fmt = AM.util.fmt, hz = fmt.hzList;
    const judged = a.bands.filter(b => b.role === 'primary' || b.role === 'edge').map(b => r.bands.find(x => x.f === b.f)).filter(Boolean);
    const missing = a.verdict.missing;
    if (!r.complete) return { level: 'limited', word: 'Limited', reason: `Measured at ${r.count} position${r.count > 1 ? 's' : ''} only. Measure at least ${r.minimum} for a firm result.` };
    if (missing.length) return { level: 'limited', word: 'Limited', reason: `${hz(missing)} could not be measured, so the result leaves ${missing.length > 1 ? 'them' : 'it'} out.` };
    if (a.thinBands.length) {
      const at = fmt.list([...new Set(r.bands.filter(b => a.thinBands.includes(b.f)).flatMap(b => b.values.filter(v => v.rt60 == null).map(v => v.position)))]);
      return { level: 'fair', word: 'Fair', reason: `${hz(a.thinBands)} ${a.thinBands.length > 1 ? 'have' : 'has'} no value at ${at}. Measure ${at} again.` };
    }
    const wide = judged.filter(b => b.spread != null && b.rt60 > 0 && b.spread / b.rt60 > SPREAD).sort((x, y) => y.spread / y.rt60 - x.spread / x.rt60)[0];
    if (wide) return { level: 'fair', word: 'Fair', reason: `The positions differ by ${Math.round(100 * wide.spread / wide.rt60)} % at ${fmt.hz(wide.f)}. Measuring another position makes the average firmer.` };
    const fair = judged.filter(b => b.quality !== 'Good').map(b => b.f);
    if (fair.length) return { level: 'fair', word: 'Fair', reason: `At ${hz(fair)} the decay carries a note or could not be double-checked. Results shows why.` };
    return { level: 'good', word: 'Good', reason: `Every judged pitch was measured cleanly at ${r.count} positions, and the positions agree.` };
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

  // Sabine's equivalent absorption that would bring the room's summary RT60 to the target's aim (the preferred value, or
  // the upper limit of an upper-limit target). null without it.
  function absorptionGap(p) {
    const a = assessment(p), g = geometry(p);
    return a && a.available && g ? AM.services.prediction.absorptionNeeded(g.V, a.rt, aim(a.target)) : null;
  }

  /* Amount of one item (default: the one being edited) at which the predicted summary RT60 (the average over the bands
     the room is judged in) reaches the target's aim (preferred, or the upper limit), with the other items of the plan as they are
     (prediction.areaForAverage: the same model and bands as the prediction). null when there is no summary or no amount
     reaches the target. The predicted verdict (prediction().verdict) still judges every band on its own. */
  /* The amount must meet the target as the verdict judges it: every judged band within its own limits, not only the
     average. So: the amount that brings the average to the aim (areaForAverage), when every band is within its limits
     there; otherwise the smallest amount at which they all are (a scan up to twice the room's surface, then bisection to
     0.01 m²: each band's RT60 moves one way as the area grows, so the amounts that keep a band within its limits are one
     interval, and so is their intersection). When no amount does, the average's amount with meetsBands false and the
     bands that stay outside. { areaM2, units, meetsBands, above: [f], below: [f], itemId, withOthers } or null. */
  function treatmentForTarget(p, item) {
    const sel = item || treatmentSelection(p);
    if (!sel || !sel.complete) return null;
    return cached('goal', p, [sel.id, sel.configuration.id, sel.placement, sel.mode, sel.size && sel.size.index], () => goalFor(p, sel));
  }
  function goalFor(p, sel) {
    const r = room(p), t = target(p), g = geometry(p);
    if (!r || !t || !g) return null;
    const input = i => { const c = covered(p, i); return { areaM2: i.areaM2, alpha: i.alpha, coveredAlpha: c ? c.alpha : null }; };
    const others = treatmentPlan(p).complete.filter(i => i.id !== sel.id);
    if (!summaryRT60(p).available) return null;
    const P = AM.services.prediction, EV = AM.services.evaluation, RA = AM.services.rt60Average, pol = policy(p), over = summaryBands(p);
    const verdictAt = x => {
      const pr = P.predict({ V: g.V, S: g.total, bands: r.bands, treatment: { items: [...others.map(input), Object.assign(input(sel), { areaM2: x })] }, referenceBand: AM.demo.REFERENCE_BAND });
      return EV.verdict(EV.bandRows(Object.fromEntries(pr.bands.map(b => [b.f, b.predicted])), t, pol), RA.ofPrediction(pr.bands, over), t, pol);
    };
    const ok = x => { const v = verdictAt(x); return v.available && v.status === 'within'; };
    const avgArea = P.areaForAverage({ V: g.V, S: g.total, bands: r.bands, item: input(sel), others: others.map(input), targetRT: aim(t), over });
    let area = avgArea != null && ok(avgArea) ? avgArea : null;
    if (area == null && !ok(0)) {
      const top = Math.max(1, 2 * g.total), n = 400;
      let prev = 0;
      for (let k = 1; k <= n && area == null; k++) { const x = top * k / n; if (ok(x)) area = x; else prev = x; }
      if (area != null) { let a = prev; while (area - a > 0.01) { const m = (a + area) / 2; if (ok(m)) area = m; else a = m; } }
      // Sold in whole panels: the areas that meet every band can lie between two steps above and still hold a whole
      // number of panels, so every count is tried.
      else if (sel.size) for (let k = 1, a = sel.size.areaM2; k * a <= top && area == null; k++) if (ok(k * a)) area = k * a;
    }
    const units = x => (sel.size ? Math.ceil(x / sel.size.areaM2 - 1e-9) : null), base = { itemId: sel.id, withOthers: others.some(i => i.areaM2 > 0) };
    if (area != null && sel.size) {
      // Sold in whole panels: the whole number at or next to that area that meets every band. None may (one panel more
      // puts a band below its limit, one fewer leaves another above): then the goal says so instead of a count that
      // does not do it.
      const a = sel.size.areaM2, c = units(area), n = [c, c - 1, c + 1].find(k => k >= 1 && ok(k * a));
      if (n != null) return Object.assign({ areaM2: n * a, units: n, meetsBands: true, above: [], below: [] }, base);
      const v = verdictAt(units(area) * a);
      return Object.assign({ areaM2: units(area) * a, units: units(area), meetsBands: false, wholePanels: false, above: v.above.map(x => x.f), below: v.below.map(x => x.f) }, base);
    }
    if (area != null) return Object.assign({ areaM2: area, units: units(area), meetsBands: true, above: [], below: [] }, base);
    if (avgArea == null) return null;
    const v = verdictAt(avgArea);
    return Object.assign({ areaM2: avgArea, units: units(avgArea), meetsBands: false, above: v.above.map(x => x.f), below: v.below.map(x => x.f) }, base);
  }

  /* ---------- automatic treatment: the mounting and the amount the app suggests ----------
     The user chooses a product; the app chooses the tested mounting that does best in this room and the amount needed,
     and both can be changed. Everything uses the same prediction and verdict as above (treatmentForTarget). */
  /* The amounts the app suggests, for every product in the plan at once (so a mix of products is worked out together:
     one that absorbs the low sounds and one the high ones). Products whose amount the user set stay as set; `also` (an
     item id) is included as the app's even when the user set it (the suggestion shown beside the user's amount).
     The best amounts are, in this order: the fewest judged bands outside their limits (and the room's Tm, for EBU); when
     every band is within, the least material; otherwise the average closest to the aim. Each product stays within the
     free surface where it goes, shared with the others placed there. Search: a grid over the amounts (every pair of
     the app's products together when there are two or fewer, else one product at a time, a few rounds), then a finer
     step around the best: whole panels, or 0.1 m².
     Returns { [itemId]: { areaM2, quantity, capM2, capped } } for the app's products, and best: the score reached. */
  // Results are kept for the same inputs (room, target, measured values, plan), so a screen drawn again is instant.
  const planCache = new Map();
  function cached(kind, p, extra, fn) {
    // The measured room enters by its values, band by band (not by take ids, which a test or an import may lack).
    const r = room(p), key = JSON.stringify([kind, extra, p.room, p.target, r ? r.bands.map(b => [b.f, b.rt60, b.n]) : null, p.treatment.items]);
    if (planCache.has(key)) return planCache.get(key);
    const v = fn();
    planCache.set(key, v);
    if (planCache.size > 40) planCache.delete(planCache.keys().next().value);
    return v;
  }
  function autoPlan(p, also, quick) {
    // A product without a tested value in a band the room is judged in cannot be predicted: it is left out of the search
    // (planProblem says so), so the others are still worked out.
    const used = summaryBands(p), predictable = it => !used.some(f => it.missingBands.includes(f));
    const items = treatmentPlan(p).complete.filter(predictable), mine = also ? items.find(it => it.id === also) : null;
    // The app's amount for one product the user set (shown beside theirs): that product alone, the others as they are.
    const auto = mine && mine.amountBy === 'user' ? [mine] : items.filter(it => it.amountBy === 'app');
    const key = auto.map(it => it.id).join(',');
    return cached(quick ? 'plan-quick' : 'plan', p, key, () => searchPlan(p, items, auto, quick));
  }
  function searchPlan(p, items, auto, quick) {
    const a = assessment(p), t = target(p), r = room(p), g = geometry(p);
    if (!auto.length || !a || !a.available || !t || !r || !g) return {};
    const P = AM.services.prediction, EV = AM.services.evaluation, RA = AM.services.rt60Average, pol = policy(p), over = summaryBands(p);
    const SF = AM.services.surfaces, freeOf = pl => { const f = SF.coveredBy(p.room, pl).freeM2; return isNum(f) ? f : null; };
    const am = Object.fromEntries(items.map(it => [it.id, auto.includes(it) ? 0 : it.areaM2]));
    const inputs = () => items.map(i => { const c = covered(p, i); return { areaM2: am[i.id], alpha: i.alpha, coveredAlpha: c ? c.alpha : null }; });
    const score = () => {
      const pr = P.predict({ V: g.V, S: g.total, bands: r.bands, treatment: { items: inputs() }, referenceBand: AM.demo.REFERENCE_BAND });
      const avg = RA.ofPrediction(pr.bands, over), total = Object.values(am).reduce((s, x) => s + x, 0);
      if (!avg.available) return [99, 9, total];
      const v = EV.verdict(EV.bandRows(Object.fromEntries(pr.bands.map(b => [b.f, b.predicted])), t, pol), avg, t, pol);
      const out = v.available ? v.failing.length + (v.tmFails ? 1 : 0) : 99;
      return out === 0 ? [0, 0, total] : [out, Math.abs(avg.value - aim(t)), total];
    };
    const better = (x, y) => (x[0] !== y[0] ? x[0] < y[0] : x[0] === 0 ? x[2] < y[2] - 1e-9 : Math.abs(x[1] - y[1]) > 1e-6 ? x[1] < y[1] : x[2] < y[2] - 1e-9);
    // The most an item can take: the free surface where it goes, less what the other products there take now; and the
    // same for every larger placement it is part of (Wall 1 is part of the walls, the walls of the walls and ceiling).
    const pls = SF.placementsFor(p.room), freeAt = new Map(pls.map(q => [q.value, freeOf(q.value)]));
    const keysOf = new Map(items.map(o => [o.id, SF.placementKeys(o.placement, p.room)]));
    const capOf = it => {
      if (freeOf(it.placement) == null) return Math.max(4 * g.total, 1);
      const mine = keysOf.get(it.id), caps = pls.filter(q => inside(mine, q.keys)).map(q => (freeAt.get(q.value) || 0) - items.filter(o => o.id !== it.id && inside(keysOf.get(o.id), q.keys)).reduce((s, o) => s + am[o.id], 0));
      return Math.max(0, caps.length ? Math.min(...caps) : freeOf(it.placement));
    };
    const unit = it => (it.mode === 'units' ? it.size.areaM2 : 0.1);
    const snap = (it, x) => { const u = unit(it), cap = capOf(it); const n = Math.floor(Math.min(x, cap) / u + 1e-9); return Math.max(0, n * u); };
    const steps = (it, n) => { const cap = capOf(it), u = unit(it), k = Math.max(1, Math.ceil(cap / u / n)); const out = []; for (let x = 0; x <= cap + 1e-9; x += k * u) out.push(snap(it, x)); out.push(snap(it, cap)); return [...new Set(out)]; };
    let best = score();
    const tryAt = (it, x) => { const was = am[it.id]; am[it.id] = x; const s = score(); if (better(s, best)) { best = s; return true; } am[it.id] = was; return false; };
    if (auto.length <= 2) {
      // Every pair of amounts on a coarse grid, then each amount finely around the best.
      const [A, B] = auto, n = quick ? 12 : B ? 20 : 40, gridA = steps(A, n), gridB = B ? steps(B, n) : [0];
      let top = null;
      for (const xa of gridA) for (const xb of gridB) {
        am[A.id] = xa; if (B) am[B.id] = xb;
        if (B && (am[B.id] > capOf(B) + 1e-9 || am[A.id] > capOf(A) + 1e-9)) continue;
        const s = score();
        if (!top || better(s, top.s)) top = { s, xa, xb };
      }
      am[A.id] = top.xa; if (B) am[B.id] = top.xb; best = top.s;
    } else {
      for (let round = 0; round < 4; round++) {
        let moved = false;
        for (const it of auto) for (const x of steps(it, quick ? 12 : 30)) moved = tryAt(it, x) || moved;
        if (!moved) break;
      }
    }
    for (let round = 0; round < (quick ? 0 : 3); round++) {
      let moved = false;
      for (const it of auto) {
        const u = unit(it), coarse = Math.max(u, capOf(it) / (auto.length === 2 ? 20 : 40) + u);
        for (let x = Math.max(0, am[it.id] - coarse); x <= am[it.id] + coarse + 1e-9; x += u) moved = tryAt(it, snap(it, x)) || moved;
      }
      if (!moved) break;
    }
    const out = { best };
    auto.forEach(it => { const cap = capOf(it); out[it.id] = { areaM2: am[it.id], quantity: it.mode === 'units' ? Math.round(am[it.id] / it.size.areaM2) : null, capM2: cap, capped: best[0] > 0 && am[it.id] >= cap - unit(it) + 1e-9 }; });
    return out;
  }
  /* The amount the app suggests for one item (autoPlan, with this item as the app's), for the screens:
     { mode, quantity, areaM2, capped, availableM2, needed, meets, goal } | null for an item without a tested
     configuration. meets: with the app's amounts the plan meets the target (every judged band within its limits);
     what the screens may promise for "the app's amount". goal: the amount of this product alone that meets the target
     (treatmentForTarget), for the written-out calculation: it can be more than the free surface allows. */
  function autoAmount(p, item) {
    if (!item || !item.complete) return null;
    const a = assessment(p), plan = autoPlan(p, item.amountBy === 'app' ? null : item.id), mine = plan[item.id];
    if (!mine) return null;
    return { mode: item.mode, quantity: mine.quantity, areaM2: mine.areaM2, capped: mine.capped, availableM2: mine.capM2,
      needed: !!(a && a.available && a.status === 'above'), meets: !!(plan.best && plan.best[0] === 0),
      goal: a && a.available ? treatmentForTarget(p, item) : null };
  }
  // Whether an item's amount is the app's (it changes with the plan) rather than one the user set.
  const isAutoAmount = (p, item) => !!item && item.amountBy === 'app';

  /* The tested configuration (mounting) of an item's product that does best in this room, at the amount the app would
     suggest for it: one that meets the target in every band with the least material first; else the fewest bands
     outside their limits, then the average closest to the aim. A room that does not need treatment: the configuration
     that absorbs most over the bands it is judged in. Only configurations with α in every judged band are considered. */
  function recommendConfig(p, item) {
    return cached('config', p, item.id, () => rankConfigs(p, item));
  }
  function rankConfigs(p, item) {
    const cfgs = AM.services.catalog.getAcousticConfigurations(item.product.id), used = summaryBands(p);
    const raw = (p.treatment.items || [])[item.index] || {};
    const cands = cfgs.map(c => resolveItem(Object.assign({}, raw, { configurationId: c.id }), item.index))
      .filter(c => c && c.complete && !used.some(f => c.missingBands.includes(f)));
    if (!cands.length) return null;
    const meanA = c => used.reduce((s, f) => s + (c.alpha[f] || 0), 0) / used.length;
    const a = assessment(p), t = target(p);
    if (cands.length === 1 || !a || !a.available || a.status !== 'above' || !t) return cands.slice().sort((x, y) => meanA(y) - meanA(x))[0].configuration.id;
    // Each mounting with the amounts the app would then suggest for the whole plan (autoPlan): the plan with that mounting.
    const scored = cands.map(c => {
      const q = Object.assign({}, p, { treatment: Object.assign({}, p.treatment, { items: p.treatment.items.map((x, k) => (k === item.index ? Object.assign({}, x, { configurationId: c.configuration.id, amountBy: 'app' }) : x)) }) });
      const plan = autoPlan(q, null, true), b = plan.best || [99, 9, Infinity]; // a coarse pass is enough to rank them
      return { c, b, mean: meanA(c) };
    });
    scored.sort((x, y) => (x.b[0] !== y.b[0] ? x.b[0] - y.b[0] : x.b[0] === 0 ? x.b[2] - y.b[2] || y.mean - x.mean : x.b[1] - y.b[1] || y.mean - x.mean));
    return scored[0].c.configuration.id;
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
    // A placement holds the products put on it and on the placements inside it: the walls hold what is on each wall too.
    return SF.placementsFor(p.room).filter(pl => !placement || pl.value === placement).map(pl => {
      if (!items.some(i => i.placement === pl.value)) return null;
      const here = items.filter(i => inside(SF.placementKeys(i.placement, p.room), pl.keys));
      const surfaceM2 = SF.coveredBy(p.room, pl.value).freeM2, areaM2 = here.reduce((s, i) => s + (i.areaM2 || 0), 0);
      // over: more than the free surface (also any amount on a surface with none free).
      return { placement: pl.value, label: pl.value, surfaceM2, areaM2, fraction: surfaceM2 ? areaM2 / surfaceM2 : 0, count: here.length, over: areaM2 > surfaceM2 * (1 + 1e-9) + 1e-9 };
    }).filter(Boolean);
  }
  // Surfaces `a` all lie within `b` (surface keys).
  const inside = (a, b) => a.length > 0 && a.every(k => b.includes(k));

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
    const shownTarget = W.isDone(p, 'target') || p.lastStage === 'target', shownPred = predictionStarted(p, p.lastStage);
    return {
      id: p.id, kind: p.kind, name: p.room.name || 'Untitled room', industry: p.room.industry, type: p.room.type,
      geometry: geometry(p), measured: r ? r.headline.rt60 : null, band: r ? r.referenceBand : null,
      average: avg.available ? avg.value : null, averageBands: avg.n, bandsTotal: avg.total,
      // The figure the room is judged by (its criterion's bands) and how many positions it rests on.
      summary: sm.available ? sm.value : null, summaryLabel: pol.label, summaryName: pol.name, summaryShort: pol.short, positions: r ? r.count : 0, positionsRequired: AM.services.spatial.MIN_POSITIONS,
      measuredAt: m ? m.takenAt : null,
      // As the top bar shows them: the target once it is confirmed (step 2 finished), the prediction once Treatment is
      // reached, and a verdict only when the room rests on enough positions (a provisional result is not a verdict).
      target: t && shownTarget ? aim(t) : null, targetText: t && shownTarget ? AM.services.target.valueText(t) : null, targetForm: t ? AM.services.target.form(t) : null,
      status: a && !a.provisional ? a.status : null, provisional: !!(a && a.provisional), // the verdict: above, within or below
      treatment: { items: plan.items.length, predicted: pred && shownPred ? pred.predicted : null, predictedStatus: pred && t && shownPred ? pred.predictedStatus : null, required: treatmentRequired(p) },
      done: p.completed.filter(id => id !== 'home').length, total: W.NUMBERED, next: next ? next.title : null,
      review: p.review.length, reviewNext: rev ? rev.title : null,
      pinned: !!p.pinned, updatedAt: p.updatedAt, createdAt: p.createdAt,
    };
  }

  AM.derive = { geometry, target, aim, measured, room, positions, positionResults, positionOf: posOf, policy, summaryRT60, summaryBands, headlineMeasured, averageRT60, midAverageRT60, noiseChange, treatmentItems, treatmentSelection, treatmentPlan, planProblem, overfill, prediction, predictionMissing, predictionStarted, assessment, soundGroups, SOUND_GROUPS: GROUPS, absorptionGap, treatmentForTarget, autoPlan, autoAmount, isAutoAmount, recommendConfig, treatmentRequired, noTreatment, coverage, summary, takeSummary, takeComparison, coveredBy: covered, laterTakes, diagnostics };
})(window.AM);
