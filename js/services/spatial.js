/* Spatial average — the room's RT60 per octave band from the valid measurements at several positions.

   Contract:
     aggregate(entries) -> Room | null      entries: [{ id, name, result }], one VALID result per position, in position order
     MIN_POSITIONS                           2: what a completed measurement session needs (ISO 3382-2 survey method:
                                              at least two source-microphone combinations, Table 1)
   Room has the shape of a processing result, so every room-wide calculation reads it as it read a single take:
     { valid: true, aggregate: true, count, complete, positions: [{ id, name, recordingId, takenAt, status, rt60: { [f] } }],
       referenceBand, headline: { f, rt60, method, quality, confidence },
       bands: [{ f, rt60, n, of, path, quality, confidence, reason, notes, low, high, spread,
                 values: [{ position, rt60, path, quality, reason }] }],
       status, warnings, recordingId, takenAt }

   Method (ISO 3382-2 allows two: averaging the reverberation times, or ensemble-averaging the decay curves): per band,
   the arithmetic mean of the RT60 of the positions where that band has a reliable value, each position counted once.
     rt60(f) = (sum of the positions' RT60 at f) ÷ (how many positions have one)
   Arithmetic, not ensemble, averaging: each position's RT60 has already passed its own checks (usable decay, straight
   decay, B·T), which an ensemble-averaged curve would blur, and the app keeps each position's own value to show.
   Nothing is weighted, extrapolated or put in place of a missing value: a band that a position could not measure is
   averaged over the others and says so ("measured at 1 of 2 positions"); a band no position measured has no value. A
   band's quality is Good only when every position measured it with quality Good. A position whose take was not valid is
   never passed in: it is not part of the room's values (AM.derive.positions lists it with its reason).
   The signal processing of each take is untouched: this only combines finished per-band results. */
(function (AM) {
  'use strict';
  const RA = AM.services.rt60Average;
  const MIN_POSITIONS = 2;

  function band(f, entries) {
    const values = entries.map(e => {
      const b = (e.result.bands || []).find(x => x.f === f) || { f, quality: 'Not measured' };
      const ok = RA.eligible(b);
      return { position: e.id, rt60: ok ? b.rt60 : null, path: ok ? b.path : null, quality: b.quality || null, reason: ok ? null : (b.reason || (b.quality === 'Not measured' ? 'Not measured' : 'Not reliable')) };
    });
    const ok = values.filter(v => v.rt60 != null), n = ok.length, of = entries.length;
    const out = { f, rt60: null, n, of, values, path: null, quality: 'Insufficient', confidence: 'None', reason: null, notes: [], low: null, high: null, spread: null };
    if (!n) {
      const all = values.every(v => v.quality === 'Not measured');
      return Object.assign(out, {
        quality: all ? 'Not measured' : 'Insufficient',
        reason: of === 1 ? values[0].reason : values.map(v => `${v.position}: ${v.reason}`).join(' · '),
      });
    }
    const rts = ok.map(v => v.rt60);
    out.rt60 = rts.reduce((s, x) => s + x, 0) / n;
    out.low = Math.min(...rts); out.high = Math.max(...rts);
    out.spread = n > 1 ? out.high - out.low : null;
    out.path = [...new Set(ok.map(v => v.path))].join('/');
    const good = n === of && ok.every(v => v.quality === 'Good');
    out.quality = good ? 'Good' : 'Fair';
    out.confidence = good ? 'High' : 'Medium';
    if (n < of) out.notes.push(`Measured at ${n} of ${of} positions; ${values.filter(v => v.rt60 == null).map(v => `${v.position} has no reliable value`).join(', ')}.`);
    return out;
  }

  function aggregate(entries) {
    const list = (entries || []).filter(e => e && e.result && e.result.valid);
    if (!list.length) return null;
    const ref = list[0].result.referenceBand || AM.demo.REFERENCE_BAND;
    const bands = AM.demo.BANDS.map(f => band(f, list));
    const r = bands.find(b => b.f === ref) || { f: ref };
    const latest = list.reduce((a, e) => (String(e.result.takenAt) > String(a.result.takenAt) ? e : a), list[0]);
    const warnings = list.flatMap(e => (e.result.warnings || []).map(w => (list.length > 1 ? `${e.id}: ${w}` : w)));
    return {
      valid: true, aggregate: true, method: 'arithmetic', count: list.length, minimum: MIN_POSITIONS, complete: list.length >= MIN_POSITIONS,
      positions: list.map(e => ({
        id: e.id, name: e.name || e.id, recordingId: e.result.recordingId, takenAt: e.result.takenAt, status: e.result.status,
        rt60: Object.fromEntries(AM.demo.BANDS.map(f => { const b = (e.result.bands || []).find(x => x.f === f); return [f, RA.eligible(b) ? b.rt60 : null]; })),
        quality: Object.fromEntries(AM.demo.BANDS.map(f => { const b = (e.result.bands || []).find(x => x.f === f); return [f, b ? b.quality : null]; })),
        reason: Object.fromEntries(AM.demo.BANDS.map(f => { const b = (e.result.bands || []).find(x => x.f === f); return [f, b && !RA.eligible(b) ? (b.reason || null) : null]; })),
      })),
      referenceBand: ref,
      headline: { f: ref, rt60: r.rt60, method: r.path, quality: r.quality, confidence: r.confidence },
      bands, status: list.some(e => e.result.status === 'warning') ? 'warning' : 'valid', warnings,
      recordingId: list.map(e => e.result.recordingId).join('+'), takenAt: latest.result.takenAt,
    };
  }

  AM.services.spatial = { MIN_POSITIONS, aggregate };
})(window.AM);
