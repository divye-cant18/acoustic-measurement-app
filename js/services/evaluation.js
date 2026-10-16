/* Evaluation policy — how a room is judged against its target, by the criterion its target comes from.

   Contract:
     policyFor(room, target) -> Policy   which bands the verdict uses, and the limits of the others
       { id, name, label, short, span, primary: [f], secondary: { [f]: { lo, hi } }, basis, brief, interpretation, criterion, custom }
     bandRows(values, target, policy) -> [{ f, rt, role, min, max, status, diff }] for the six octave bands
       values: { [f]: RT60 | null }; role 'primary' (decides the verdict), 'secondary' (its own, wider limit: a band
       warning) or 'info' (the criterion sets nothing there: shown, not judged); status above | within | below,
       'insufficient' without a value, null for an info band
     verdict(rows, summary, target, policy) -> Verdict
       { available, status, summaryStatus, complete, missing: [f], failing: [row], above: [row], below: [row],
         warnings: [row], masked, reason }
       summary: the average over the primary bands (AM.services.rt60Average.ofBands, or .ofPrediction for a prediction)
     explain(verdict, rows, target, policy) -> { headline, tone, lines: [text], warnings: [text] } in plain words
     POLICIES

   Policy by criterion (AM.services.target, AM.targetData). The verdict is the criterion's own band rule: EVERY primary
   band has to lie within the target range. The average over the primary bands is the summary figure shown beside it; it
   never decides on its own, so a band outside the range is never hidden by an average inside it ("masked").
     din-a      DIN 18041 group A (meeting and conference rooms, classrooms, lecture rooms, music, sport): 250–2000 Hz,
                0.8–1.2 × T_soll in each band. 125 Hz and 4 kHz have their own, wider limits (secondary).
     din-b      DIN 18041 group B (offices, dining, waiting areas): the recommended absorption applies 250–2000 Hz.
     listening  EBU Tech 3276 listening rooms: 200 Hz–4 kHz, the octave bands 250–4000 Hz.
     fixed      a single reference value without a frequency range (ISO 16283-1 dwelling): 500–2000 Hz, an
                interpretation, said so wherever it is shown. Also used when the room has no criterion yet (default).
   A custom target keeps the bands of the room's criterion and uses the custom range as the band limits.

   Sources and the assumption made (docs/MULTI-POSITION.md, verdict):
     DIN 18041:2016 group A: the target applies at the mid frequencies and must be kept within ±20 % from 250 Hz to
     2 kHz (C. Ruhe, "Akustik in Bildungsbauten", 5.2; InfoBauphysik 2016). At 125 Hz the RT may be a further 20 % longer
     or shorter, at 4 kHz a further 20 % shorter (Ruhe). Read here as 0.6–1.4 × T at 125 Hz and 0.6–1.2 × T at 4 kHz,
     i.e. factors 0.75 and 1.4/1.2 on the lower and upper edge of the range. The standard's own figure (Bild 2) was not
     available to check them: they only raise band warnings, never the verdict.
     So 500–2000 Hz is NOT the meeting-room summary: DIN 18041, the criterion the app uses for meeting rooms, sets its
     tolerance from 250 Hz. */
(function (AM) {
  'use strict';
  const A = AM.acoustics, BANDS = AM.demo.BANDS;
  const { fmt } = AM.util;
  const one = f => (f >= 1000 ? `${f / 1000} kHz` : `${f} Hz`);
  const hz = fs => `${one(fs[0])}–${one(fs[fs.length - 1])}`;
  const r2 = x => Math.round(x * 100) / 100;

  const POLICIES = {
    'din-a': {
      id: 'din-a', name: 'Speech range', primary: [250, 500, 1000, 2000],
      secondary: { 125: { lo: 0.6 / 0.8, hi: 1.4 / 1.2 }, 4000: { lo: 0.6 / 0.8, hi: 1 } },
      brief: 'DIN 18041 group A: each band 250 Hz–2 kHz in range',
      basis: 'DIN 18041:2016, group A: the reverberation time has to stay within the target range (±20 %) in every octave band from 250 Hz to 2 kHz. At 125 Hz it may be up to a further 20 % longer or shorter and at 4 kHz up to a further 20 % shorter: those two bands are checked against their own, wider limits.',
    },
    'din-b': {
      id: 'din-b', name: 'Speech range', primary: [250, 500, 1000, 2000], secondary: {},
      brief: 'DIN 18041 group B: each band 250 Hz–2 kHz in range',
      basis: 'DIN 18041:2016, group B: the absorption it recommends applies to the octave bands from 250 Hz to 2 kHz, so each of them is checked against the target range. DIN 18041 sets nothing for group B rooms at 125 Hz or 4 kHz.',
    },
    listening: {
      id: 'listening', name: 'Listening range', primary: [250, 500, 1000, 2000, 4000], secondary: {},
      brief: 'EBU Tech 3276: each band 250 Hz–4 kHz in range',
      basis: 'EBU Tech 3276: the reverberation time of a listening room is set for 200 Hz to 4 kHz, which the octave bands from 250 Hz to 4 kHz cover; each is checked against the target range. 125 Hz lies below that range and is shown without a limit.',
    },
    fixed: {
      id: 'fixed', name: 'Middle range', primary: [500, 1000, 2000], secondary: {}, interpretation: true,
      brief: 'Each band 500 Hz–2 kHz in range (interpretation)',
      basis: 'The reference value names no frequency range. The app checks the middle octave bands, 500 Hz to 2 kHz, where speech and most everyday sound are, against the target range: an interpretation, not part of the reference.',
    },
  };
  POLICIES.default = Object.assign({}, POLICIES.fixed, { id: 'default', brief: 'Each band 500 Hz–2 kHz in range (interpretation)', basis: 'The room has no criterion yet (its type and use are not set), so the app checks the middle octave bands, 500 Hz to 2 kHz, against the target range: an interpretation.' });
  Object.values(POLICIES).forEach(p => { p.label = `${p.name}, ${hz(p.primary)}`; p.short = hz(p.primary); p.span = `${one(p.primary[0])} to ${one(p.primary[p.primary.length - 1])}`; });

  function policyFor(room, target) {
    const rec = room && AM.services.target ? AM.services.target.recommend(room) : null;
    const base = POLICIES[rec && rec.criterion ? rec.criterion.kind : 'default'] || POLICIES.default;
    return Object.assign({}, base, {
      criterion: rec ? `${rec.source.short}, ${rec.criterion.name}` : null,
      custom: !!(target && target.source === 'custom'),
      interpretation: !!(base.interpretation || (rec && rec.interpretation)),
    });
  }

  // The limits of one band: the target range in a primary band, the criterion's wider limit in a secondary band, none
  // in an info band. Rounded to 0.01 s, the precision values are compared at (AM.acoustics.classify).
  function limits(f, t, pol) {
    if (pol.primary.includes(f)) return { role: 'primary', min: t.min, max: t.max };
    const e = pol.secondary[f];
    if (e) return { role: 'secondary', min: r2(t.min * e.lo), max: r2(t.max * e.hi) };
    return { role: 'info', min: null, max: null };
  }

  function bandRows(values, t, pol) {
    return BANDS.map(f => {
      const v = typeof values[f] === 'number' && Number.isFinite(values[f]) && values[f] > 0 ? values[f] : null, L = limits(f, t, pol);
      return { f, rt: v, role: L.role, min: L.min, max: L.max,
        status: v == null ? 'insufficient' : L.role === 'info' ? null : A.classify(v, { min: L.min, max: L.max }),
        diff: v == null ? null : v - t.preferred };
    });
  }

  function verdict(rows, summary, t, pol) {
    const prim = rows.filter(r => r.role === 'primary');
    const missing = prim.filter(r => r.rt == null).map(r => r.f);
    const warnings = rows.filter(r => r.role === 'secondary' && (r.status === 'above' || r.status === 'below'));
    if (!summary || !summary.available) {
      return { available: false, status: null, summaryStatus: null, complete: false, missing, failing: [], above: [], below: [], warnings, masked: false,
        reason: summary && summary.reason ? summary.reason : `No value in the ${pol.label}.` };
    }
    const above = prim.filter(r => r.status === 'above'), below = prim.filter(r => r.status === 'below');
    const status = above.length ? 'above' : below.length ? 'below' : 'within';
    const summaryStatus = A.classify(summary.value, t);
    return { available: true, status, summaryStatus, complete: !missing.length, missing, failing: [...above, ...below], above, below, warnings,
      masked: summaryStatus === 'within' && status !== 'within', reason: null };
  }

  const list = xs => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  const bandsText = rows => list(rows.map(r => `${fmt.hz(r.f)} (${fmt.s(r.rt)})`));

  // In plain words, for the person showing the result: what the verdict is, why, and what the band warnings mean.
  function explain(v, rows, t, pol) {
    const range = `${t.min.toFixed(2)} and ${fmt.s(t.max)}`;
    const lines = [], warnings = [];
    v.warnings.forEach(r => warnings.push(`${fmt.hz(r.f)} rings ${r.status === 'above' ? 'longer' : 'shorter'} than its own limit: ${fmt.s(r.rt)}, against ${r.min.toFixed(2)}–${fmt.s(r.max)} at that band. It does not change the verdict, but ${r.status === 'above' ? (r.f < 500 ? 'low sounds will boom; panels that also absorb bass help' : 'high sounds will linger') : (r.f < 500 ? 'the room may sound thin in the bass' : 'the room may sound dull')}.`));
    if (!v.available) return { headline: 'Not assessed', tone: 'warn', lines: [v.reason], warnings };
    if (v.status === 'within') {
      lines.push(v.complete
        ? `Every band from ${pol.span} rings for between ${range}, the range this room should have.`
        : `The bands that could be measured, ${list(rows.filter(r => r.role === 'primary' && r.rt != null).map(r => fmt.hz(r.f)))}, ring for between ${range}. ${list(v.missing.map(f => fmt.hz(f)))} could not be measured, so the room is not confirmed there.`);
      return { headline: v.complete ? 'Meets the target' : 'Meets the target where measured', tone: v.complete ? 'good' : 'warn', lines, warnings };
    }
    if (v.above.length) lines.push(`Too much echo at ${bandsText(v.above)}: longer than the ${fmt.s(t.max)} the target allows.`);
    if (v.below.length) lines.push(`${v.above.length ? 'Also drier than the target at' : 'Drier than the target at'} ${bandsText(v.below)}: shorter than ${t.min.toFixed(2)} s.`);
    if (v.masked) lines.push(`The average from ${pol.span} is inside the range, but every band has to be, so the average alone does not pass the room.`);
    if (v.missing.length) lines.push(`${list(v.missing.map(f => fmt.hz(f)))} could not be measured.`);
    return { headline: v.status === 'above' ? 'Does not meet the target' : 'Drier than the target', tone: 'warn', lines, warnings };
  }

  AM.services.evaluation = { POLICIES, policyFor, limits, bandRows, verdict, explain };
})(window.AM);
