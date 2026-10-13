/* PredictionEngine — RT60 AFTER TREATMENT, from the measured room (simplified Sabine). The only RT60 the app predicts:
   the room's own RT60 is never estimated, it is measured.

   Contract the real implementation must keep:
     predict({ V, S, bands, treatment, referenceBand }) -> Prediction
         V: room volume (m³); S: the room's total surface (m², optional; used only for the checks below)
         bands: the MEASURED RT60 per octave band ({ f, rt60 | null })
         treatment = { items: [{ areaM2, alpha: { [f]: α | null }, coveredAlpha? }] }   one entry per treatment item
                     (a single { areaM2, alpha } is still accepted and treated as one item)
         coveredAlpha: { [f]: α | null } of the finish the item covers (AM.services.surfaces.coveredBy), when the
                       room's surfaces say what that is; absent or null for a band: not known
         Each band row reports every item's own contribution (items[k].addedA) and the combined total; the result
         carries `checks`: the model's assumptions that this room and plan put in doubt.
     absorptionNeeded(V, measuredRT, targetRT)                     -> m² Sabine
     areaFor({ V, bands, alpha, referenceBand, targetRT, addedA, coveredAlpha }) -> m² of one product | null
         addedA: absorption already added at the reference band by the other items of the plan (default 0)

   Model. The measured RT60 gives the room's equivalent absorption area, A0 = 0.161·V / RT (the relation ISO 354 uses to
   define it from a measured reverberation time): everything in the room as measured, furniture, people and air
   included. The products' α come from the same kind of measurement (ISO 354 / ASTM C423 in a reverberation room), so
   the two add consistently. Each item adds ΔA = area × (α − α_covered): its own absorption less that of the finish it
   covers, which is already part of A0 (where the surfaces do not say what that is, ΔA = area × α and the row says the
   covered finish is not known, which overstates the effect by area × α_covered). RT after = 0.161·V / (A0 + ΣΔA).
   A band without a measured value, or where any item has no tested α, gets no prediction; nothing is assumed.

   Assumptions, and when they are in doubt (checks):
     - a diffuse sound field: Sabine's relation holds for a modest average absorption. Above an average coefficient of
       about 0.3 (A / S) it overstates RT60 (Eyring's form fits better), so the prediction would read long;
     - the measured RT60 represents the room (one position, the conditions at the time of the take);
     - A0 cannot exceed the room's surface (A0 / S > 1): if it does, the dimensions or the measurement are wrong;
     - laboratory α on the installed product (mounting as tested; edge effects and placement are not modelled);
     - air absorption is part of the measured A0 and does not change with treatment. */
(function (AM) {
  'use strict';
  const A = AM.acoustics;

  const SABINE_LIMIT = 0.3;

  function predict({ V, S = null, bands, treatment, referenceBand }) {
    const items = (treatment.items || [treatment]).map(t => ({ areaM2: Math.max(0, t.areaM2 || 0), alpha: t.alpha || {}, covered: t.coveredAlpha || null }));
    const area = items.reduce((s, t) => s + t.areaM2, 0);
    const rows = bands.map(b => {
      const parts = items.map(t => {
        const a = t.alpha[b.f], has = typeof a === 'number', c = t.covered ? t.covered[b.f] : null, known = typeof c === 'number';
        return { areaM2: t.areaM2, alpha: has ? a : null, coveredAlpha: known ? c : null, coveredKnown: known, addedA: has ? t.areaM2 * (a - (known ? c : 0)) : null };
      });
      const missingAlpha = parts.some(x => x.alpha == null);
      const alpha = parts.length === 1 ? parts[0].alpha : null; // kept for single-item readers
      if (b.rt60 == null || missingAlpha) {
        return { f: b.f, measured: b.rt60 == null ? null : b.rt60, alpha, items: parts, existingA: null, addedA: null, totalA: null, predicted: null, missingAlpha };
      }
      const existingA = A.absorptionFromRT(V, b.rt60);
      const addedA = parts.reduce((s, x) => s + x.addedA, 0);
      const totalA = existingA + addedA;
      const meanBefore = S > 0 ? existingA / S : null, meanAfter = S > 0 ? totalA / S : null;
      return { f: b.f, measured: b.rt60, alpha, items: parts, existingA, addedA, totalA, predicted: A.rtFromAbsorption(V, totalA), missingAlpha: false, meanAlphaBefore: meanBefore, meanAlphaAfter: meanAfter };
    });
    const headline = rows.find(r => r.f === referenceBand) || null;
    return { model: 'Simplified Sabine', areaM2: area, bands: rows, headline, checks: checks(rows, headline) };
  }

  /* The assumptions this room and plan put in doubt, as { id, band, text }. They are shown with the result; they do not
     change it. */
  function checks(rows, headline) {
    const out = [], fmtA = x => x.toFixed(2);
    const impossible = rows.filter(r => r.meanAlphaBefore != null && r.meanAlphaBefore > 1);
    if (impossible.length) out.push({ id: 'absorption-exceeds-surface', bands: impossible.map(r => r.f),
      text: `The measured RT60 implies more absorption than the room has surface at ${impossible.map(r => `${r.f} Hz`).join(', ')} (equivalent absorption area larger than the total surface). Check the room's dimensions; the prediction there cannot be relied on.` });
    const high = rows.filter(r => r.meanAlphaAfter != null && r.meanAlphaAfter > SABINE_LIMIT && r.meanAlphaBefore <= 1);
    if (high.length) {
      const h = high.find(r => headline && r.f === headline.f) || high[0];
      out.push({ id: 'high-absorption', bands: high.map(r => r.f),
        text: `With the treatment the room's average absorption coefficient reaches ${fmtA(h.meanAlphaAfter)} at ${h.f} Hz. Sabine's relation overstates RT60 above about ${SABINE_LIMIT}, so the real result is likely a little shorter than predicted${high.length > 1 ? ` (also at ${high.filter(r => r !== h).map(r => `${r.f} Hz`).join(', ')})` : ''}.` });
    }
    return out;
  }

  const absorptionNeeded = (V, rt, targetRT) => Math.max(0, A.absorptionFromRT(V, targetRT) - A.absorptionFromRT(V, rt));

  // Per m², the item adds its α less what the finish it covers already absorbed (when that is known).
  function areaFor({ V, bands, alpha, referenceBand, targetRT, addedA = 0, coveredAlpha = null }) {
    const b = bands.find(x => x.f === referenceBand), c = coveredAlpha ? coveredAlpha[referenceBand] : null;
    const a = typeof alpha[referenceBand] === 'number' ? alpha[referenceBand] - (typeof c === 'number' ? c : 0) : null;
    if (!b || b.rt60 == null || a == null || a <= 0) return null;
    return Math.max(0, absorptionNeeded(V, b.rt60, targetRT) - addedA) / a;
  }

  AM.services.prediction = { kind: 'simplified-sabine', SABINE_LIMIT, predict, absorptionNeeded, areaFor };
})(window.AM);
