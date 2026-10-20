/* Evaluation policy — how a room is judged against its target, by the criterion its target comes from.

   Contract:
     policyFor(room, target) -> Policy   which bands the verdict uses and their limits
       { id, name, label, short, span (the summary bands), judged: [f], judgedShort, judgedSpan, primary: [f],
         edge: { [f]: { min(t), max(t) } }, secondary: { [f]: { lo, hi } }, basis, brief, interpretation, criterion, custom }
     bandRows(values, target, policy) -> [{ f, rt, role, min, max, status, diff }] for the six octave bands
       values: { [f]: RT60 | null }; role 'primary' (judged against the target range, and averaged for the summary),
       'edge' (judged against the criterion's own limits for that band), 'secondary' (its own limit, a band warning
       only; no verified criterion uses it now) or 'info' (the criterion sets nothing there: shown, not judged);
       status above | within | below, 'insufficient' without a value, null for an info band
     verdict(rows, summary, target, policy) -> Verdict
       { available, status, summaryStatus, complete, missing: [f], failing: [row], above: [row], below: [row],
         warnings: [row], masked, reason }
       summary: the average over the primary bands (AM.services.rt60Average.ofBands, or .ofPrediction for a prediction)
     explain(verdict, rows, target, policy) -> { headline, tone, lines: [text], warnings: [text] } in plain words
     POLICIES

   The verdict is the criterion's own band rule: EVERY judged band (primary and edge) has to lie within its limits. The
   average over the primary bands is the summary figure shown beside it; it never decides on its own, so a band outside
   its limits is never hidden by an average inside the range ("masked"). An upper-limit target (form 'max') has no lower
   limit: a band can be within or above it, never below.

   Policy by the criterion's band rule (js/data/targets.js; the criteria and their sources: docs/TARGET-CRITERIA.md):
     din-a      DIN 18041:2016 A1–A4: 0.8–1.2 × T_soll in each octave band from 250 Hz to 2 kHz (the target range),
                0.65–1.45 × T_soll at 125 Hz and 0.65–1.2 × T_soll at 4 kHz. All six bands are judged. For the
                recommended target the edge limits are worked out from T_soll itself (target.tsoll, unrounded), so they
                are the standard's to 0.01 s; for a target set by hand, factors 0.65/0.8 and 1.45/1.2 (125 Hz), 0.65/0.8
                and 1.2/1.2 (4 kHz) on its lower and upper limits.
     din-a5     DIN 18041:2016 A5 (sport): 0.8–1.2 × T_soll from 250 Hz to 2 kHz; nothing at 125 Hz or 4 kHz.
     ebu        EBU Tech 3276 §2.3: Tm is the room's own MEASURED mean reverberation time (here the octave bands 250 Hz–
                4 kHz) and has to lie between 0.2 and 0.4 s (strictly; the target's min and max); every band is judged
                against the tolerance mask around that measured Tm (Fig. 1 is drawn as T − Tm): ±0.05 s from 250 Hz to
                4 kHz, and at 125 Hz −0.05 s to +0.15 s (the mask's line from +0.30 s at 63 Hz to +0.05 s at 200 Hz, log
                frequency). The volume formula is only the guide (the preferred value and the treatment aim). The
                criterion uses third-octave bands; the app's octave bands are compared with the mask at their centre
                frequency (said wherever it is shown).
     nbc-500    NBC 2016 offices and canteens: an upper limit at 500 Hz only; the other bands are shown without a limit.
     default    No verified criterion (the project's own target, entered by the user): 500 Hz–2 kHz, the app's
                convention, not part of any reference, and said so wherever it is shown. */
(function (AM) {
  'use strict';
  const A = AM.acoustics, BANDS = AM.demo.BANDS;
  const { fmt, isNum } = AM.util;
  const one = f => (f >= 1000 ? `${f / 1000} kHz` : `${f} Hz`);
  const hz = fs => (fs.length === 1 ? one(fs[0]) : `${one(fs[0])}–${one(fs[fs.length - 1])}`);
  const r2 = x => Math.round(x * 100) / 100;
  // EBU Tech 3276 Fig. 1: the upper limit falls from +0.30 s at 63 Hz to +0.05 s at 200 Hz on a log-frequency axis.
  const ebuUpper = f => 0.30 - 0.25 * Math.log10(f / 63) / Math.log10(200 / 63);
  // DIN 18041: T_soll of a recommended target (unrounded), so the edge limits are the standard's own; null for a target
  // set by hand (its edges follow its range).
  const tsollOf = t => (t && t.source !== 'custom' && isNum(t.tsoll) ? t.tsoll : null);
  const dinEdge = (lo, hi) => ({ min: t => (tsollOf(t) != null ? tsollOf(t) * lo : t.min * lo / 0.8), max: t => (tsollOf(t) != null ? tsollOf(t) * hi : t.max * hi / 1.2) });

  const POLICIES = {
    'din-a': {
      id: 'din-a', name: 'Speech range', primary: [250, 500, 1000, 2000],
      edge: { 125: dinEdge(0.65, 1.45), 4000: dinEdge(0.65, 1.2) },
      secondary: {},
      brief: 'DIN 18041 A1–A4: every band 125 Hz–4 kHz within its limits',
      basis: 'DIN 18041:2016, use types A1–A4: the reverberation time has to lie within the tolerance band in every octave band from 125 Hz to 4 kHz: 0.8–1.2 × T_soll from 250 Hz to 2 kHz (the target range), 0.65–1.45 × T_soll at 125 Hz and 0.65–1.2 × T_soll at 4 kHz. T_soll is for the room in use, 80 % occupied; the room was measured as it is, and no conversion is applied, so an empty room is judged on the strict side.',
    },
    'din-a5': {
      id: 'din-a5', name: 'Speech range', primary: [250, 500, 1000, 2000], edge: {}, secondary: {},
      brief: 'DIN 18041 A5: every band 250 Hz–2 kHz in range',
      basis: 'DIN 18041:2016, use type A5 (sport): the reverberation time has to lie within 0.8–1.2 × T_soll in every octave band from 250 Hz to 2 kHz. The standard sets nothing for sports halls at 125 Hz or 4 kHz, so those bands are shown without a limit. T_soll is for the room in use, 80 % occupied; the room was measured as it is, and no conversion is applied.',
    },
    ebu: {
      id: 'ebu', name: 'Listening range', primary: [250, 500, 1000, 2000, 4000], relative: true,
      // Offsets from the room's measured Tm (EBU Tech 3276 Fig. 1).
      mask: { primary: [-0.05, 0.05], edge: { 125: [-0.05, ebuUpper(125)] } },
      edge: { 125: { min: () => null, max: () => null } }, secondary: {},
      brief: 'EBU Tech 3276: Tm 0.2–0.4 s, every band 125 Hz–4 kHz within the mask around it',
      basis: 'EBU Tech 3276 §2.3: Tm, the room\'s own measured mean reverberation time (here 250 Hz–4 kHz), has to lie between 0.2 and 0.4 s, and every band within the tolerance mask around that Tm: ±0.05 s from 250 Hz to 4 kHz, and at 125 Hz from 0.05 s below to 0.15 s above. The volume formula gives only a guide value for Tm. The criterion is set in third-octave bands; the app\'s octave bands are compared with the mask at their centre frequency.',
    },
    'nbc-500': {
      id: 'nbc-500', name: '500 Hz band', primary: [500], edge: {}, secondary: {},
      brief: 'NBC 2016: at most the limit at 500 Hz',
      basis: 'NBC 2016 Part 8 Section 4, clause 8.3.2.1: the maximum reverberation time is specified at 500 Hz, so that band is judged against it. The other bands are shown without a limit.',
    },
    default: {
      id: 'default', name: 'Middle range', primary: [500, 1000, 2000], edge: {}, secondary: {}, interpretation: true,
      brief: 'Each band 500 Hz–2 kHz in range (the app\'s convention)',
      basis: 'No verified criterion applies to this room, so no reference sets the bands. The project\'s own target is checked in the middle octave bands, 500 Hz to 2 kHz: the app\'s convention, not part of any reference.',
    },
  };
  Object.values(POLICIES).forEach(p => {
    p.judged = [...p.primary, ...Object.keys(p.edge).map(Number)].sort((a, b) => a - b);
    p.label = `${p.name}, ${hz(p.primary)}`; p.short = hz(p.primary); p.span = p.primary.length === 1 ? one(p.primary[0]) : `${one(p.primary[0])} to ${one(p.primary[p.primary.length - 1])}`;
    p.judgedShort = hz(p.judged); p.judgedSpan = p.judged.length === 1 ? one(p.judged[0]) : `${one(p.judged[0])} to ${one(p.judged[p.judged.length - 1])}`;
  });

  function policyFor(room, target) {
    const rec = room && AM.services.target ? AM.services.target.recommend(room) : null;
    const base = POLICIES[rec ? rec.criterion.bands : 'default'] || POLICIES.default;
    return Object.assign({}, base, {
      criterion: rec ? `${rec.reference.short}, ${rec.criterion.name}` : null,
      custom: !!(target && target.source === 'custom'),
      interpretation: !!base.interpretation,
    });
  }

  // The limits of one band: the target range in a primary band, the criterion's own limits in an edge band (judged), a
  // wider limit in a secondary band (a warning), none in an info band. Rounded to 0.01 s, the precision values are
  // compared at (AM.acoustics.classify). An upper-limit target has no lower limit (min null). A criterion judged around
  // the room's own measured mean (EBU, pol.relative) takes it as tm: without it its bands have no limits.
  function limits(f, t, pol, tm) {
    if (pol.relative) {
      const off = pol.primary.includes(f) ? pol.mask.primary : (pol.mask.edge || {})[f];
      if (!off) return { role: 'info', min: null, max: null };
      const role = pol.primary.includes(f) ? 'primary' : 'edge';
      return isNum(tm) ? { role, min: r2(tm + off[0]), max: r2(tm + off[1]) } : { role, min: null, max: null };
    }
    if (pol.primary.includes(f)) return { role: 'primary', min: isNum(t.min) ? t.min : null, max: t.max };
    const e = pol.edge && pol.edge[f];
    if (e && isNum(t.min) && isNum(t.max)) return { role: 'edge', min: r2(e.min(t)), max: r2(e.max(t)) };
    const w = pol.secondary && pol.secondary[f];
    if (w && isNum(t.min) && isNum(t.max)) return { role: 'secondary', min: r2(t.min * w.lo), max: r2(t.max * w.hi) };
    return { role: 'info', min: null, max: null };
  }
  const aimOf = t => (isNum(t.preferred) ? t.preferred : t.max);
  // The room's own mean over the primary bands (EBU Tm), when at least half of them have a value; null otherwise.
  function relativeMean(values, pol) {
    const vs = pol.primary.map(f => values[f]).filter(v => typeof v === 'number' && Number.isFinite(v) && v > 0);
    return vs.length && vs.length * 2 >= pol.primary.length ? vs.reduce((s, v) => s + v, 0) / vs.length : null;
  }

  function bandRows(values, t, pol) {
    const tm = pol.relative ? relativeMean(values, pol) : null;
    return BANDS.map(f => {
      const v = typeof values[f] === 'number' && Number.isFinite(values[f]) && values[f] > 0 ? values[f] : null, L = limits(f, t, pol, tm);
      return { f, rt: v, role: L.role, min: L.min, max: L.max,
        status: v == null ? 'insufficient' : L.role === 'info' ? null : A.classify(v, { min: L.min, max: L.max }),
        diff: v == null ? null : v - aimOf(t) };
    });
  }

  const judgedRow = r => r.role === 'primary' || r.role === 'edge';
  function verdict(rows, summary, t, pol) {
    const judged = rows.filter(judgedRow);
    const missing = judged.filter(r => r.rt == null).map(r => r.f);
    const warnings = rows.filter(r => r.role === 'secondary' && (r.status === 'above' || r.status === 'below'));
    if (!summary || !summary.available) {
      return { available: false, status: null, summaryStatus: null, complete: false, missing, failing: [], above: [], below: [], warnings, masked: false,
        reason: summary && summary.reason ? summary.reason : `No value in the ${pol.label}.` };
    }
    const above = judged.filter(r => r.status === 'above'), below = judged.filter(r => r.status === 'below');
    // EBU: the measured Tm itself has to lie strictly between the target's limits (0.2 s < Tm < 0.4 s), compared at the
    // digits shown; the bands are judged around it.
    const shown = x => Math.round(Number(x.toFixed(2)) * 100);
    const summaryStatus = pol.relative
      ? (shown(summary.value) >= shown(t.max) ? 'above' : shown(summary.value) <= shown(t.min) ? 'below' : 'within')
      : A.classify(summary.value, t);
    const tmFails = pol.relative && summaryStatus !== 'within';
    const status = above.length || (tmFails && summaryStatus === 'above') ? 'above' : below.length || tmFails ? 'below' : 'within';
    return { available: true, status, summaryStatus, complete: !missing.length, missing, failing: [...above, ...below], above, below, warnings,
      masked: !pol.relative && summaryStatus === 'within' && status !== 'within', tm: pol.relative ? summary.value : null, tmFails, reason: null };
  }

  const list = xs => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  const bandsText = rows => list(rows.map(r => `${fmt.hz(r.f)} (${fmt.s(r.rt)})`));
  // A band's limits in words: "0.48–0.72 s" or "at most 0.75 s".
  const limitText = r => (isNum(r.min) ? `${r.min.toFixed(2)}–${fmt.s(r.max)}` : `at most ${fmt.s(r.max)}`);

  // In plain words, for the person showing the result: what the verdict is, why, and what the band warnings mean.
  function explain(v, rows, t, pol) {
    const range = isNum(t.min) ? `between ${t.min.toFixed(2)} and ${fmt.s(t.max)}` : `at most ${fmt.s(t.max)}`;
    const edges = rows.filter(r => r.role === 'edge');
    const edgeText = edges.length ? `, and ${list(edges.map(r => `${fmt.hz(r.f)} within its own limits, ${limitText(r)}`))}` : '';
    const lines = [], warnings = [];
    v.warnings.forEach(r => warnings.push(`${fmt.hz(r.f)} rings ${r.status === 'above' ? 'longer' : 'shorter'} than its own limit: ${fmt.s(r.rt)}, against ${limitText(r)} at that band. It does not change the verdict.`));
    if (!v.available) return { headline: 'Not assessed', tone: 'warn', lines: [v.reason], warnings };
    if (pol.relative) {
      // EBU: the measured Tm and the bands around it.
      const tmText = `The room's measured Tm (the mean from ${pol.span}) is ${fmt.s(v.tm)}`;
      if (v.status === 'within') {
        lines.push(`${tmText}, between ${t.min.toFixed(2)} and ${fmt.s(t.max)}, and ${v.complete ? 'every band is' : 'the bands that could be measured are'} within the tolerance around it.${v.complete ? '' : ` ${list(v.missing.map(f => fmt.hz(f)))} could not be measured.`}`);
        return { headline: v.complete ? 'Meets the target' : 'Meets the target where measured', tone: v.complete ? 'good' : 'warn', lines, warnings };
      }
      if (v.tmFails) lines.push(`${tmText}: it has to lie between ${t.min.toFixed(2)} and ${fmt.s(t.max)}.`);
      if (v.above.length) lines.push(`Longer than the tolerance around Tm at ${list(v.above.map(r => `${fmt.hz(r.f)} (${fmt.s(r.rt)}, limit ${limitText(r)})`))}.`);
      if (v.below.length) lines.push(`Shorter than the tolerance around Tm at ${list(v.below.map(r => `${fmt.hz(r.f)} (${fmt.s(r.rt)}, limit ${limitText(r)})`))}.`);
      if (v.missing.length) lines.push(`${list(v.missing.map(f => fmt.hz(f)))} could not be measured.`);
      return { headline: v.status === 'above' ? 'Does not meet the target' : 'Drier than the target', tone: 'warn', lines, warnings };
    }
    if (v.status === 'within') {
      const where = pol.primary.length === 1 ? `The ${fmt.hz(pol.primary[0])} band rings for ${range}` : `Every band from ${pol.span} rings for ${range}`;
      lines.push(v.complete
        ? `${where}, the range this room should have${edgeText}.`
        : `The bands that could be measured are within their limits. ${list(v.missing.map(f => fmt.hz(f)))} could not be measured, so the room is not confirmed there.`);
      return { headline: v.complete ? 'Meets the target' : 'Meets the target where measured', tone: v.complete ? 'good' : 'warn', lines, warnings };
    }
    const own = rs => rs.some(r => r.role === 'edge');
    if (v.above.length) lines.push(own(v.above)
      ? `Too much echo at ${list(v.above.map(r => `${fmt.hz(r.f)} (${fmt.s(r.rt)}, limit ${limitText(r)})`))}.`
      : `Too much echo at ${bandsText(v.above)}: longer than the ${fmt.s(t.max)} the target allows.`);
    if (v.below.length) lines.push(`${v.above.length ? 'Also drier than the target at' : 'Drier than the target at'} ${own(v.below)
      ? list(v.below.map(r => `${fmt.hz(r.f)} (${fmt.s(r.rt)}, limit ${limitText(r)})`))
      : `${bandsText(v.below)}: shorter than ${fmt.s(t.min)}`}.`);
    if (v.masked) lines.push(`The average from ${pol.span} is inside the range, but every judged band has to be, so the average alone does not pass the room.`);
    if (v.missing.length) lines.push(`${list(v.missing.map(f => fmt.hz(f)))} could not be measured.`);
    return { headline: v.status === 'above' ? 'Does not meet the target' : 'Drier than the target', tone: 'warn', lines, warnings };
  }

  AM.services.evaluation = { POLICIES, policyFor, limits, bandRows, verdict, explain };
})(window.AM);
