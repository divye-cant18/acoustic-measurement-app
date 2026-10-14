/* Average RT60, 500–2000 Hz: the headline measured value. The one place it is calculated: Measurement, Processing,
   Results, the top bar, Home, Measurement History, Assessment, Final Result and the PDF report all read it from here
   (through AM.derive.averageRT60 for the current measurement), so they show the same number by the same rule.

   Contract:
     of(result) -> Average   (pure)
       { available, value, n, total, required, included: [{ f, rt60, path, quality }], excluded: [{ f, reason }],
         missing: [{ f, reason }], reason, recordingId, takenAt }
     REQUIRED, LABEL, SHORT, METHOD, eligible(band)

   Method: the arithmetic mean of the RT60 of a FIXED set of octave bands, REQUIRED = 500, 1000 and 2000 Hz:
     average = (RT60(500) + RT60(1000) + RT60(2000)) ÷ 3
   Every required band must have a value; if any is missing the headline is unavailable and says which band failed and
   why. It is never an average of whichever bands happened to pass: such an average changed with a device's band
   coverage, not with the room (tests/mobile-study.html: a phone-like speaker that loses 125 Hz read 6.7 % lower, and a
   band dropping in and out made it jump between takes).
   Why these bands: they are the mid-frequency octave bands ANSI/ASA S12.60 states classroom reverberation limits in, and
   the bands one device, phones included, measures most reliably (its small speaker loses 125 and 250 Hz first).
   A band counts when the processing engine (services/processing.js, decideBand) gave it a value: a finite RT60 above 0,
   with the calculation path the engine chose for it (T30 or T20), and a quality that is not "Insufficient" or "Not
   measured". Its own RT60 is used: its T20 or T30 is never taken in its place. Band values are used as the engine stores
   them (to the millisecond); the average is rounded only where it is shown. Only a valid result has an average: a take
   that is not valid, an earlier (superseded) measurement and another session are never mixed in.
   It is a summary of the mid frequencies, not a standardised single-number rating, and every band keeps its own value
   on screen and in the report. The target comparison, treatment and prediction keep working band by band (the target
   at the reference band, 1000 Hz). */
(function (AM) {
  'use strict';
  const REQUIRED = [500, 1000, 2000];
  const SHORT = '500–2000 Hz';
  const LABEL = `Average RT60, ${SHORT}`;
  const METHOD = `The arithmetic mean of the RT60 at 500, 1000 and 2000 Hz. All three are required: if one has no reliable value there is no average. The other bands are shown on their own and are not part of it. A summary of the mid frequencies, not a standardised single-number rating.`;
  const NO_VALUE = ['Insufficient', 'Not measured'];

  const eligible = b => !!b && typeof b.rt60 === 'number' && Number.isFinite(b.rt60) && b.rt60 > 0 && !!b.path && !NO_VALUE.includes(b.quality);
  const why = b => (!b ? 'Not measured' : b.quality === 'Not measured' ? 'Not measured' : `Not reliable${b.reason ? `: ${b.reason}` : ''}`);

  function of(result) {
    const bands = (result && Array.isArray(result.bands)) ? result.bands : [];
    const out = { available: false, value: null, n: 0, total: REQUIRED.length, required: REQUIRED.slice(), included: [], excluded: [], missing: [], reason: null, recordingId: result ? result.recordingId : null, takenAt: result ? result.takenAt : null };
    if (!result) return Object.assign(out, { reason: 'There is no valid measurement yet.' });
    // Bands outside the required set are reported as not part of the average, whatever their state.
    out.excluded = bands.filter(b => !REQUIRED.includes(b.f)).map(b => ({ f: b.f, reason: 'Not part of the average' }));
    if (!result.valid) return Object.assign(out, { missing: REQUIRED.map(f => ({ f, reason: 'Take not valid' })), reason: 'This take is not a valid measurement, so no average is given.' });
    REQUIRED.forEach(f => {
      const b = bands.find(x => x.f === f);
      if (eligible(b)) out.included.push({ f: b.f, rt60: b.rt60, path: b.path, quality: b.quality });
      else out.missing.push({ f, reason: why(b) });
    });
    if (out.missing.length) {
      const names = out.missing.map(m => `${m.f} Hz`).join(' and ');
      return Object.assign(out, { included: [], reason: `No average: ${names} ${out.missing.length > 1 ? 'have' : 'has'} no reliable value, and the average needs all of 500, 1000 and 2000 Hz. ${out.missing[0].reason.split(': ').slice(1).join(': ') || ''}`.trim() });
    }
    out.n = out.included.length;
    out.value = out.included.reduce((s, b) => s + b.rt60, 0) / out.n;
    out.available = true;
    return out;
  }

  AM.services.rt60Average = { REQUIRED, SHORT, LABEL, METHOD, of, eligible };
})(window.AM);
