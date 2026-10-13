/* Average RT60 across measured frequency bands. The one place it is calculated: Measurement, Processing, Results, the
   top bar, Home, Measurement History, Assessment, Final Result and the PDF report all read it from here (through
   AM.derive.averageRT60 for the current measurement), so they show the same number.

   Contract:
     of(result) -> Average   (pure)
       { available, value, n, total, included: [{ f, rt60, path, quality }], excluded: [{ f, reason }], reason,
         recordingId, takenAt }
     LABEL, METHOD

   Method: the arithmetic mean of the band RT60 values of ONE processing result:
     average = Σ RT60(band) ÷ number of eligible bands
   A band is eligible when the processing engine (services/processing.js, decideBand) gave it a value: a finite RT60
   above 0, with the calculation path the engine chose for it (T30 or T20), and a quality that is not "Insufficient" or
   "Not measured". The band's own RT60 is used as it is: its T20 or T30 is never taken in its place, so no band changes
   path to be counted. Every other band is excluded, with its reason, and is never counted as 0. Band values are used
   exactly as the engine stores them (to the millisecond), never the values as displayed; the average is not rounded
   here, only where it is shown.
   Only a valid result has an average. A take that is not valid, an earlier (superseded) measurement and another
   session are never mixed in: the average belongs to the one result it is given.

   It is a summary across bands, not a standardised single-number rating. Each band's own RT60 stays the measured value
   at that frequency, and the target comparison, the treatment and the prediction keep working band by band (the
   target at the reference band, 1000 Hz). */
(function (AM) {
  'use strict';
  const LABEL = 'Average RT60 across measured frequency bands';
  const METHOD = 'Arithmetic mean of the RT60 of each octave band that has a reliable value; bands without one are left out, not counted as 0. A summary across bands, not a standardised single-number rating.';
  const NO_VALUE = ['Insufficient', 'Not measured'];

  const eligible = b => !!b && typeof b.rt60 === 'number' && Number.isFinite(b.rt60) && b.rt60 > 0 && !!b.path && !NO_VALUE.includes(b.quality);
  const why = b => (!b || b.quality === 'Not measured' ? 'Not measured' : `Not reliable${b.reason ? `: ${b.reason}` : ''}`);

  function of(result) {
    const bands = (result && Array.isArray(result.bands)) ? result.bands : [];
    const out = { available: false, value: null, n: 0, total: bands.length, included: [], excluded: [], reason: null, recordingId: result ? result.recordingId : null, takenAt: result ? result.takenAt : null };
    if (!result) return Object.assign(out, { reason: 'There is no valid measurement yet.' });
    if (!result.valid) return Object.assign(out, { excluded: bands.map(b => ({ f: b.f, reason: eligible(b) ? 'Take not valid' : why(b) })), reason: 'This take is not a valid measurement, so no average is given.' });
    bands.forEach(b => {
      if (eligible(b)) out.included.push({ f: b.f, rt60: b.rt60, path: b.path, quality: b.quality });
      else out.excluded.push({ f: b.f, reason: why(b) });
    });
    if (!out.included.length) return Object.assign(out, { reason: 'No frequency band has a reliable RT60, so there is nothing to average.' });
    out.n = out.included.length;
    out.value = out.included.reduce((s, b) => s + b.rt60, 0) / out.n;
    out.available = true;
    return out;
  }

  AM.services.rt60Average = { LABEL, METHOD, of, eligible };
})(window.AM);
