/* Average RT60: the room's overall RT60, and the 500–2000 Hz average beside it. The one place they are calculated:
   Measurement, Processing, Results, the top bar, Home, Measurement History, the assessment against the target, the
   treatment amount, the prediction, Final Result, the PDF report and the report form's database row all read them from
   here (through AM.derive for the current measurement), so they use the same numbers by the same rule.

   Contract:
     of(result)  -> Average over the six bands, 125–4000 Hz: the room's RT60, the value compared with the target (pure)
     mid(result) -> Average over the middle bands, 500, 1000 and 2000 Hz: shown beside it as a check (pure)
       { available, value, n, total, required, included: [{ f, rt60, path, quality }], missing: [{ f, reason }],
         excluded: [], partial, reason, recordingId, takenAt }
     ofPrediction(rows, over) -> the predicted average over the bands `over` (the bands the measured average used),
       every one of them required, so measured and predicted are taken over the same bands (pure)
     describe(average) -> "all 6 bands" | "5 of 6 bands (125 Hz not measured)" | "not available"
     REQUIRED, LABEL, SHORT, MID, MID_LABEL, MID_SHORT, METHOD, MIN_SHARE, eligible(band)

   Method: the arithmetic mean of the RT60 of the bands of the set that have a reliable value:
     average = (sum of RT60 over the bands with a value) ÷ (how many there are)
   A band the device could not measure is left out, and named wherever the average is shown ("5 of 6 bands, 125 Hz not
   measured"); nothing is put in its place. At least half of the set must have a value (3 of the 6 bands, 2 of the 3
   middle bands); below that there is no average, the reason says which bands are missing, and nothing that depends on
   it is calculated (no single band, 1000 Hz included, is used instead).
   The same room can therefore read a little differently on a device that loses a band (a phone that loses 125 Hz
   leaves out the band that rings longest); the 500–2000 Hz average, which every device measures most reliably, is
   shown beside it so the two can be compared. (Until 2026-10-15 the headline was 500–2000 Hz only; on that day it was
   all six bands with every band required, then, the same day, the bands that have a value, as described here.)
   A band counts when the processing engine (services/processing.js, decideBand) gave it a value: a finite RT60 above 0,
   with the calculation path the engine chose for it (T30 or T20), and a quality that is not "Insufficient" or "Not
   measured". Its own RT60 is used: its T20 or T30 is never taken in its place. A predicted band counts when the model
   gave it a finite value above 0. Values are used as stored (measured to the millisecond, predicted unrounded); an
   average is rounded only where it is shown. Only a valid result has an average: a take that is not valid, an earlier
   (superseded) measurement and another session are never mixed in.
   It is a summary across the bands, not a standardised single-number rating, and every band keeps its own value on
   screen and in the report. */
(function (AM) {
  'use strict';
  const REQUIRED = AM.demo.BANDS.slice();
  const MID = [500, 1000, 2000];
  const range = set => `${set[0]}–${set[set.length - 1]} Hz`;
  const SHORT = range(REQUIRED), MID_SHORT = range(MID);
  const LABEL = `Average RT60, ${SHORT}`, MID_LABEL = `Average RT60, ${MID_SHORT}`;
  const MIN_SHARE = 0.5;
  const METHOD = `The arithmetic mean of the RT60 in the octave bands from ${SHORT} that were measured reliably. A band the device could not measure is left out and named; at least half of the bands are needed. The ${MID_SHORT} average, the middle bands where speech is, is shown beside it as a check. Every band is also shown on its own. A summary across the bands, not a standardised single-number rating.`;
  const NO_VALUE = ['Insufficient', 'Not measured'];

  const positive = x => typeof x === 'number' && Number.isFinite(x) && x > 0;
  const eligible = b => !!b && positive(b.rt60) && !!b.path && !NO_VALUE.includes(b.quality);
  const why = b => (!b ? 'Not measured' : b.quality === 'Not measured' ? 'Not measured' : `Not reliable${b.reason ? `: ${b.reason}` : ''}`);
  const whyPredicted = r => (!r || !positive(r.measured) ? 'Not measured reliably' : r.missingAlpha ? 'No tested α for every product at this band'
    : r.coveredExceedsMeasured ? 'The covered finishes do not fit the measured room at this band' : 'No predicted value');
  const names = list => { const n = list.map(m => `${m.f} Hz`); return n.length < 2 ? n.join('') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`; };
  const blank = set => ({ available: false, value: null, n: 0, total: set.length, required: set.slice(), included: [], excluded: [], missing: [], partial: false, reason: null });

  // The mean of the entries that have a value, when at least `min` do; else why not. entries: one per band of the set,
  // { item } when it counts, else { f, reason }. The one place the averaging is done, for measured and predicted values.
  function combine(out, entries, min, noun, lacks = 'no reliable value') {
    entries.forEach(e => (e.item ? out.included.push(e.item) : out.missing.push({ f: e.f, reason: e.reason })));
    if (out.included.length < min) {
      const detail = out.missing.length ? out.missing[0].reason.split(': ').slice(1).join(': ') : '';
      const have = out.included.length;
      return Object.assign(out, { included: [], reason: `No ${noun}: ${names(out.missing)} ${out.missing.length > 1 ? 'have' : 'has'} ${lacks}, and ${min === out.total ? `the average needs all ${out.total} bands` : `the average needs at least ${min} of the ${out.total} bands (${have === 0 ? 'none has one' : `only ${have} ${have === 1 ? 'has' : 'have'} one`})`}.${detail ? ` ${detail}` : ''}` });
    }
    out.n = out.included.length;
    out.value = out.included.reduce((s, b) => s + b.rt60, 0) / out.n;
    out.available = true;
    out.partial = out.missing.length > 0;
    return out;
  }

  function over(result, set) {
    const bands = (result && Array.isArray(result.bands)) ? result.bands : [];
    const out = Object.assign(blank(set), { recordingId: result ? result.recordingId : null, takenAt: result ? result.takenAt : null });
    if (!result) return Object.assign(out, { reason: 'There is no valid measurement yet.' });
    if (!result.valid) return Object.assign(out, { missing: set.map(f => ({ f, reason: 'Take not valid' })), reason: 'This take is not a valid measurement, so no average is given.' });
    return combine(out, set.map(f => {
      const b = bands.find(x => x.f === f);
      return eligible(b) ? { item: { f: b.f, rt60: b.rt60, path: b.path, quality: b.quality } } : { f, reason: why(b) };
    }), Math.ceil(set.length * MIN_SHARE), 'average');
  }
  const of = result => over(result, REQUIRED);
  const mid = result => over(result, MID);
  // The same average over any set of bands (the bands an evaluation policy judges: AM.services.evaluation).
  const ofBands = (result, set) => over(result, set.slice());

  // Predicted, over exactly the bands the measured average used: each must have a prediction.
  function ofPrediction(rows, bands = REQUIRED) {
    const list = Array.isArray(rows) ? rows : [], set = bands.slice();
    return combine(blank(set), set.map(f => {
      const r = list.find(x => x.f === f);
      return r && positive(r.measured) && positive(r.predicted) ? { item: { f, rt60: r.predicted } } : { f, reason: `Not available: ${whyPredicted(r)}` };
    }), set.length, 'predicted average', 'no predicted value');
  }

  const describe = a => (!a || !a.available ? 'not available' : a.partial ? `${a.n} of ${a.total} bands (${names(a.missing)} not measured)` : `all ${a.total} bands`);

  AM.services.rt60Average = { REQUIRED, SHORT, LABEL, MID, MID_SHORT, MID_LABEL, METHOD, MIN_SHARE, of, mid, ofBands, ofPrediction, describe, eligible };
})(window.AM);
