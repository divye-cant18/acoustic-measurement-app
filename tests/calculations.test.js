/* Checks of the application's acoustic calculations against values worked out by hand (tests/calculations.html).
   Results are listed on the page and in window.TEST_RESULTS. Every expected value below is written out with its
   arithmetic, so it does not come from the code under test. */
(function () {
  'use strict';
  const A = AM.acoustics, P = AM.services.prediction, CAT = AM.services.catalog, TGT = AM.services.target, B = AM.demo.BANDS;
  const results = window.TEST_RESULTS = [];
  const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail });
  const close = (a, b, tol) => a != null && Math.abs(a - b) <= tol;

  // ---------- room geometry and units ----------
  {
    const g = A.geometry({ L: 9, W: 7, H: 3 });
    // V = 9 × 7 × 3 = 189 m³; floor = ceiling = 9 × 7 = 63 m²; walls = 2 × 3 × (9 + 7) = 96 m²; total 222 m²
    check('Geometry 9 × 7 × 3 m: V 189 m³, floor and ceiling 63 m², walls 96 m², total 222 m²', g && g.V === 189 && g.floor === 63 && g.ceiling === 63 && g.walls === 96 && g.total === 222, JSON.stringify(g));
    check('Geometry needs three positive dimensions', A.geometry({ L: 9, W: 0, H: 3 }) === null && A.geometry({ L: 9, W: 7 }) === null, 'zero or missing dimension → null');
  }

  // ---------- Sabine: RT60 = 0.161 · V / A ----------
  {
    // 0.161 × 189 = 30.429 m³·s/m; A = 30.429 / 0.7 = 43.47 m² Sabine; back: 30.429 / 43.47 = 0.7 s
    const a = A.absorptionFromRT(189, 0.7), t = A.rtFromAbsorption(189, 43.47);
    check('Sabine constant 0.161 s/m (metric)', A.SABINE === 0.161, A.SABINE);
    check('Absorption from RT60: 0.161 × 189 m³ ÷ 0.70 s = 43.47 m²', close(a, 43.47, 1e-9), a);
    check('RT60 from absorption: 0.161 × 189 m³ ÷ 43.47 m² = 0.700 s', close(t, 0.7, 1e-9), t);
  }

  // ---------- treatment prediction (simplified Sabine) ----------
  {
    const bands = [{ f: 500, rt60: 0.8 }, { f: 1000, rt60: 0.7 }, { f: 2000, rt60: null }];
    // one item, 14.88 m² with α(1 kHz) 0.37: ΔA = 14.88 × 0.37 = 5.5056 m²; A = 43.47 + 5.5056 = 48.9756 m²;
    // RT60 = 30.429 / 48.9756 = 0.62130 s
    const one = P.predict({ V: 189, bands, treatment: { items: [{ areaM2: 14.88, alpha: { 500: 0.6, 1000: 0.37, 2000: 0.9 } }] }, referenceBand: 1000 });
    const h = one.headline;
    check('Prediction, one product: A0 43.47 m², ΔA 5.5056 m², A 48.9756 m², RT60 0.6213 s at 1 kHz', close(h.existingA, 43.47, 1e-9) && close(h.addedA, 5.5056, 1e-9) && close(h.totalA, 48.9756, 1e-9) && close(h.predicted, 0.621309, 1e-5),
      `A0 ${h.existingA}, ΔA ${h.addedA}, A ${h.totalA}, RT60 ${h.predicted}`);
    // two items at 1 kHz: 10 m² × 0.5 + 5 m² × 0.8 = 5 + 4 = 9 m²; A = 52.47 m²; RT60 = 30.429 / 52.47 = 0.579931 s
    const two = P.predict({ V: 189, bands, treatment: { items: [{ areaM2: 10, alpha: { 1000: 0.5 } }, { areaM2: 5, alpha: { 1000: 0.8 } }] }, referenceBand: 1000 });
    check('Prediction, two products add their own area × α: ΔA 5 + 4 = 9 m², RT60 0.5799 s', close(two.headline.addedA, 9, 1e-12) && close(two.headline.items[0].addedA, 5, 1e-12) && close(two.headline.items[1].addedA, 4, 1e-12) && close(two.headline.predicted, 0.579931, 1e-5),
      `${two.headline.items.map(x => x.addedA).join(' + ')} = ${two.headline.addedA} m², RT60 ${two.headline.predicted}`);
    const r500 = two.bands.find(b => b.f === 500), r2k = one.bands.find(b => b.f === 2000);
    check('No prediction without a tested α (any product) or without a measured value in that band', r500.predicted === null && r500.missingAlpha === true && r2k.predicted === null && r2k.missingAlpha === false,
      `500 Hz: missing α → ${r500.predicted}; 2000 Hz: not measured → ${r2k.predicted}`);
    // A target of 0.56 s needs 30.429 / 0.56 − 43.47 = 54.3375 − 43.47 = 10.8675 m² more; with α 0.75: 14.49 m²
    const need = P.absorptionNeeded(189, 0.7, 0.56), area = P.areaFor({ V: 189, bands, alpha: { 1000: 0.75 }, referenceBand: 1000, targetRT: 0.56 });
    check('Absorption needed 0.70 → 0.56 s in 189 m³: 10.8675 m²; with α 0.75: 14.49 m²', close(need, 10.8675, 1e-9) && close(area, 14.49, 1e-9), `${need} m², ${area} m²`);
    check('No absorption needed when the room is already at or below the target', P.absorptionNeeded(189, 0.5, 0.56) === 0, P.absorptionNeeded(189, 0.5, 0.56));

    // The amount for the AVERAGE (all six bands). Every band 0.70 s and α 0.75 in every band: each band, and so the
    // average, reaches 0.56 s at the same 14.49 m² as above.
    const all = v => Object.fromEntries(AM.demo.BANDS.map(f => [f, v]));
    const flat = AM.demo.BANDS.map(f => ({ f, rt60: 0.7 }));
    const even = P.areaForAverage({ V: 189, bands: flat, item: { alpha: all(0.75) }, targetRT: 0.56 });
    check('Amount for the average target, every band 0.70 s and α 0.75 everywhere: 30.429 / 0.56 − 43.47 = 10.8675 m² of absorption = 14.49 m² of product (to 0.0001 m²)', close(even, 14.49, 1e-4), `${even} m²`);
    // Bands 0.9 / 0.8 / 0.75 / 0.7 / 0.65 / 0.6 s (average 0.7333 s), α 0.75 everywhere, target 0.56 s. At the area found,
    // the six predicted values, each 30.429 / (30.429 / RT + 0.75 × area), average 0.56 s.
    const rts = [0.9, 0.8, 0.75, 0.7, 0.65, 0.6], uneven = AM.demo.BANDS.map((f, i) => ({ f, rt60: rts[i] }));
    const x = P.areaForAverage({ V: 189, bands: uneven, item: { alpha: all(0.75) }, targetRT: 0.56 });
    const byHand = rts.map(rt => 30.429 / (30.429 / rt + 0.75 * x)).reduce((s, v) => s + v, 0) / 6;
    const lessHand = rts.map(rt => 30.429 / (30.429 / rt + 0.75 * (x - 0.01))).reduce((s, v) => s + v, 0) / 6;
    check('Amount for the average target, bands 0.90 … 0.60 s: at the area found the six predicted values (worked out here) average 0.56 s, and 0.01 m² less stays above', close(byHand, 0.56, 1e-4) && lessHand > 0.56,
      `${x.toFixed(4)} m² → ${byHand.toFixed(5)} s; 0.01 m² less → ${lessHand.toFixed(5)} s`);
    const none = P.areaForAverage({ V: 189, bands: uneven, item: { alpha: all(0.75) }, targetRT: 0.8 });
    const gap = P.areaForAverage({ V: 189, bands: uneven, item: { alpha: Object.assign(all(0.75), { 125: null }) }, targetRT: 0.56 });
    check('Amount for the average: 0 when the average is already at or below the target; none (null) when a band has no tested α, so no average can be predicted',
      none === 0 && gap === null, `target above the average: ${none}; α missing at 125 Hz: ${gap}`);
    // A product that absorbs LESS than the finish it covers at 125 Hz (α 0.05 over 0.30) and more elsewhere (0.90 over
    // 0.10): 125 Hz rings longer as area is added, so the average falls to a lowest point and rises again. Every band
    // 0.70 s, A0 = 43.47 m²: average(x) = (30.429 / (43.47 − 0.25 x) + 5 × 30.429 / (43.47 + 0.8 x)) ÷ 6, defined while
    // 0.30 x ≤ 43.47. Scanned here every 0.001 m²: the first area at or below 0.50 s, and the lowest average (0.45 s).
    const cov = Object.assign(all(0.10), { 125: 0.30 }), item = { alpha: Object.assign(all(0.90), { 125: 0.05 }), coveredAlpha: cov };
    const avgX = x => (0.30 * x > 43.47 ? Infinity : (30.429 / (43.47 - 0.25 * x) + 5 * 30.429 / (43.47 + 0.8 * x)) / 6);
    let first = null, lowest = Infinity;
    for (let i = 0; i <= 144900; i++) { const v = avgX(i / 1000); if (first === null && v <= 0.5) first = i / 1000; if (v < lowest) lowest = v; }
    const dip = P.areaForAverage({ V: 189, bands: flat, item, targetRT: 0.5 }), never = P.areaForAverage({ V: 189, bands: flat, item, targetRT: 0.4 });
    check(`Amount for the average when one band rises with area: the first area reaching 0.50 s (${first} m² by a scan here); none for 0.40 s, below the lowest average there is (${lowest.toFixed(3)} s)`,
      dip != null && Math.abs(dip - first) < 0.002 && avgX(dip) <= 0.5 + 1e-9 && avgX(dip - 0.01) > 0.5 && never === null && lowest > 0.4,
      `${dip} m² (scan ${first} m²); for 0.40 s: ${never}`);
  }

  // ---------- octave-band absorption from one-third-octave product data ----------
  {
    const configs = CAT.getProducts().flatMap(p => CAT.getAcousticConfigurations(p.id));
    const c = configs.find(x => CAT.getOctaveAbsorption(x.id, B).missing.length === 0);
    const fr = Object.fromEntries(CAT.getFrequencyResponse(c.id).map(x => [x.f, x.alpha]));
    const o = CAT.getOctaveAbsorption(c.id, B);
    const expect = f => { const [a, b, d] = o.thirds[f].map(x => fr[x]); return Math.min(1, Math.round(((a + b + d) / 3) * 100 + 1e-9) / 100); };
    check('Octave bands from the source\'s one-third-octave bands: 1 kHz = 800 + 1000 + 1250 Hz, 125 Hz = 100 + 125 + 160 Hz, 4 kHz = 3150 + 4000 + 5000 Hz',
      o.thirds[1000].join() === '800,1000,1250' && o.thirds[125].join() === '100,125,160' && o.thirds[4000].join() === '3150,4000,5000', JSON.stringify(o.thirds));
    check('Octave α = mean of its three one-third-octave values (to 0.01)', B.every(f => o.values[f] === expect(f)),
      `${c.label}: ${B.map(f => `${f}: (${o.thirds[f].map(x => fr[x]).join(' + ')}) / 3 → ${o.values[f]}`).join(' · ')}`);
    // e.g. thirds 1.04, 1.12, 1.08 → mean 1.08 → used as 1.00
    const over = configs.find(x => B.some(f => { const t = CAT.getOctaveAbsorption(x.id, [f]); return t.capped.length; }));
    const allMax = Math.max(...configs.flatMap(x => Object.values(CAT.getOctaveAbsorption(x.id, B).values).filter(v => v != null)));
    const ov = over && CAT.getOctaveAbsorption(over.id, B), fo = over && Object.fromEntries(CAT.getFrequencyResponse(over.id).map(x => [x.f, x.alpha]));
    check('Octave α is never above 1.00, also where the tested one-third-octave values are', allMax <= 1 && !!over && ov.capped.every(f => ov.values[f] === 1),
      over ? `largest octave α over all ${configs.length} configurations: ${allMax}; e.g. ${over.label}: ${ov.capped.map(f => `${f} Hz (${ov.thirds[f].map(x => fo[x]).join(', ')}) → ${ov.values[f]}`).join(' · ')}` : 'no configuration above 1.00 found');
    const gap = configs.find(x => { const t = CAT.getOctaveAbsorption(x.id, B); return t.missing.length; });
    check('An octave without all three one-third-octave values gets no α (nothing is assumed)', !gap || CAT.getOctaveAbsorption(gap.id, B).missing.every(f => CAT.getOctaveAbsorption(gap.id, B).values[f] === null && o.thirds[f].some(x => CAT.getFrequencyResponse(gap.id).find(y => y.f === x).alpha == null)),
      gap ? `${gap.label}: missing ${CAT.getOctaveAbsorption(gap.id, B).missing.join(', ')} Hz` : 'every configuration complete');
  }

  // ---------- the prediction in the app uses the octave-band α ----------
  {
    const product = CAT.getProducts().find(p => p.size.options.some(o => o.areaM2 > 0) && CAT.getAcousticConfigurations(p.id).some(c => !CAT.getOctaveAbsorption(c.id, B).missing.length));
    const cfg = CAT.getAcousticConfigurations(product.id).find(c => !CAT.getOctaveAbsorption(c.id, B).missing.length);
    const sizeIndex = product.size.options.findIndex(o => o.areaM2 > 0), size = product.size.options[sizeIndex];
    const rts = { 125: 0.9, 250: 0.8, 500: 0.75, 1000: 0.7, 2000: 0.65, 4000: 0.6 };
    const p = {
      id: 'calc', room: { L: 9, W: 7, H: 3 }, completed: [], review: [],
      processing: { result: { valid: true, referenceBand: 1000, headline: { f: 1000, rt60: 0.7 }, bands: B.map(f => ({ f, rt60: rts[f], path: 'T30', quality: 'Good' })) } }, // as a processed band (path, quality)
      treatment: { items: [{ id: 'i1', productId: product.id, configurationId: cfg.id, size: String(sizeIndex), quantity: 5, placement: 'Walls' }], active: 'i1' },
    };
    const pred = AM.derive.prediction(p), alpha = CAT.getOctaveAbsorption(cfg.id, [1000]).values[1000], area = 5 * size.areaM2;
    // RT60 = 0.161 × 189 / (0.161 × 189 / 0.7 + 5 panels × panel area × octave α at 1 kHz)
    const expected = 30.429 / (43.47 + area * alpha);
    check('App prediction: 5 panels × panel area × octave-band α(1 kHz), then 0.161 · V / (A0 + ΔA)', pred && close(pred.headline.predicted, expected, 1e-9) && pred.items[0].alpha[1000] === alpha,
      pred ? `${product.name}, ${cfg.label}: 5 × ${size.areaM2} m² × ${alpha} = ${(area * alpha).toFixed(4)} m² → ${pred.headline.predicted.toFixed(4)} s (expected ${expected.toFixed(4)} s)` : 'no prediction');
    // The room-wide values. This room has no type yet, so it is judged in the middle bands, 500 Hz–2 kHz (the default
    // policy, AM.services.evaluation): measured (0.75 + 0.7 + 0.65) ÷ 3 = 0.7 s; predicted, the mean of those three bands,
    // each 30.429 / (30.429 / RT + area × α at that band), with the configuration's own α per band. Over all six bands
    // (the figure the report form stores): measured 4.4 ÷ 6 = 0.73333 s, predicted the mean of the six.
    const al = CAT.getOctaveAbsorption(cfg.id, B).values, one = f => 30.429 / (30.429 / rts[f] + area * al[f]);
    const predHand = [500, 1000, 2000].map(one).reduce((s, v) => s + v, 0) / 3, predAll = B.map(one).reduce((s, v) => s + v, 0) / 6;
    check('App prediction, room-wide: in the bands the room is judged in (500 Hz–2 kHz, no room type yet), measured 2.1 ÷ 3 = 0.7 s and the predicted average the mean of the three bands worked out here; over all six bands 4.4 ÷ 6 = 0.7333 s measured and the mean of the six predicted',
      pred && pred.policy.id === 'default' && close(pred.measured, 2.1 / 3, 1e-12) && close(pred.predicted, predHand, 1e-9) && pred.average.n === 3
        && close(AM.derive.averageRT60(p).value, 4.4 / 6, 1e-12) && pred.allBands && close(pred.allBands.value, predAll, 1e-9),
      pred ? `measured ${pred.measured.toFixed(5)} s; predicted ${pred.predicted.toFixed(5)} s (by hand ${predHand.toFixed(5)} s); all bands ${pred.allBands && pred.allBands.value.toFixed(5)} s (by hand ${predAll.toFixed(5)} s)` : 'no prediction');
  }

  // ---------- RT60 targets: only from verified criteria (js/data/targets.js, docs/TARGET-CRITERIA.md) ----------
  // Changed 2026-10-19 (standards-based targets): the ANSI/ASA S12.60-2010 classroom limit is no longer applied (that
  // edition is superseded and the current one could not be read), occupancy no longer converts the target to an empty
  // room (the absorption per person was not verified), and DIN 18041 group B gives only an absorption, so a private office
  // follows NBC 2016's upper limit instead of an RT60 derived from A/V with an invented design value.
  {
    const IND = { 'Music room': 'Education and training facilities', 'Lecture hall': 'Education and training facilities', Classroom: 'Education and training facilities',
      'Sports hall': 'Education and training facilities', 'Conference room': 'Corporate offices and meeting rooms', 'Private office': 'Corporate offices and meeting rooms',
      'Control room': 'Recording and music studios', Restaurant: 'Hospitality and restaurants', 'Living room': 'Residential spaces' };
    const room = (type, use, L, W, H, extra) => Object.assign({ industry: IND[type], type, use, L, W, H }, extra || {});
    const rec = r => TGT.recommend(r);
    // A1 music, 200 m³: 0.45 × lg 200 + 0.07 = 0.45 × 2.30103 + 0.07 = 1.10546 s; 0.8–1.2 × → 0.88–1.33
    const a1 = rec(room('Music room', 'Music rehearsal and performance', 10, 5, 4));
    check('DIN 18041 A1 (music), 200 m³: 0.45·lg V + 0.07 = 1.11 s, range 0.88–1.33 s', a1.preferred === 1.11 && a1.min === 0.88 && a1.max === 1.33, `${a1.preferred} (${a1.min}–${a1.max})`);
    // A2 speech, 600 m³: 0.37 × lg 600 − 0.14 = 0.37 × 2.77815 − 0.14 = 0.88792 s
    const a2 = rec(room('Lecture hall', 'Lectures and presentations', 12, 10, 5));
    check('DIN 18041 A2 (speech), 600 m³: 0.37·lg V − 0.14 = 0.89 s', a2.preferred === 0.89 && a2.min === 0.71 && a2.max === 1.07, `${a2.preferred} (${a2.min}–${a2.max})`);
    // A3 teaching, 189 m³: 0.32 × lg 189 − 0.17 = 0.32 × 2.27646 − 0.17 = 0.55847 s; 0.8 × = 0.44678 → 0.45; 1.2 × = 0.67016 → 0.67
    const a3 = rec(room('Classroom', 'Teaching', 9, 7, 3));
    check('DIN 18041 A3 (teaching), 189 m³: 0.32·lg V − 0.17 = 0.56 s, range 0.45–0.67 s (no limit from another standard narrows it)', a3.preferred === 0.56 && a3.min === 0.45 && a3.max === 0.67 && a3.sources.length === 1, `${a3.preferred} (${a3.min}–${a3.max}); ${a3.sources.map(x => x.short).join(', ')}`);
    // A4 inclusive / video conference, 180 m³: 0.26 × lg 180 − 0.14 = 0.26 × 2.25527 − 0.14 = 0.44637 s → 0.45 (0.36–0.54).
    // The occupancy is recorded but does not change it: the target is the standard's own, for the room in use.
    const a4 = rec(room('Conference room', 'Video calls and hybrid meetings', 10, 6, 3, { occupancy: 12 })), a4b = rec(room('Conference room', 'Video calls and hybrid meetings', 10, 6, 3));
    check('DIN 18041 A4, 180 m³: 0.26·lg V − 0.14 = 0.45 s (0.36–0.54 s), the same with 12 people entered: occupancy is never converted', a4.preferred === 0.45 && a4.min === 0.36 && a4.max === 0.54 && JSON.stringify([a4.preferred, a4.min, a4.max]) === JSON.stringify([a4b.preferred, a4b.min, a4b.max]) && /80 %/.test(a4.condition),
      `${a4.preferred} (${a4.min}–${a4.max}); without people ${a4b.preferred}; condition: ${a4.condition}`);
    // A5 sport, 5000 m³: 0.75 × lg 5000 − 1.00 = 0.75 × 3.69897 − 1 = 1.77423 s; 18 000 m³ (above 10 000): 2.0 s; 40 000 m³: outside
    const a5 = rec(room('Sports hall', 'Sport and exercise', 25, 20, 10)), a5b = rec(room('Sports hall', 'Sport and exercise', 50, 30, 12)), a5c = TGT.availability(room('Sports hall', 'Sport and exercise', 100, 40, 10));
    check('DIN 18041 A5 (sport): 5000 m³ → 1.77 s; 18 000 m³ → 2.0 s; 40 000 m³ → no target (beyond the standard\'s sports halls)', a5.preferred === 1.77 && a5b.preferred === 2 && a5c.status === 'outside', `${a5.preferred} s, ${a5b.preferred} s, ${a5c.status}`);
    // NBC 2016 clause 8.3.2.1: small private offices ≤ 0.75 s at 500 Hz: an upper limit only (no preferred value, no lower limit)
    const off = rec(room('Private office', 'Focused desk work', 5, 4, 3));
    check('Private office, desk work: NBC 2016 8.3.2.1, at most 0.75 s at 500 Hz, an upper limit only', off.form === 'max' && off.max === 0.75 && off.preferred === null && off.min === null && off.criterionId === 'nbc2016-small-office', `${off.form} ${off.max} s; preferred ${off.preferred}`);
    // EBU Tech 3276: Tm = 0.25 × (105 / 100)^(1/3) = 0.25 × 1.01640 = 0.25410 s → 0.25 (0.20–0.30); 22.5 m³: 0.152 s < 0.2 s → none
    const ebu = rec(room('Control room', 'Mixing and critical listening', 7, 5, 3)), ebuSmall = TGT.availability(room('Control room', 'Mixing and critical listening', 3, 3, 2.5));
    // Changed 2026-10-20: §2.3 requires the room's MEASURED Tm between 0.2 and 0.4 s; the formula is only the guide.
    check('EBU Tech 3276, 105 m³: guide Tm = 0.25·(V/100)^⅓ = 0.25 s; the measured Tm has to lie between 0.20 and 0.40 s; 22.5 m³ gives a guide of 0.152 s, outside 0.2–0.4 s: no target, nothing clamped', ebu.preferred === 0.25 && ebu.min === 0.2 && ebu.max === 0.4 && ebuSmall.status === 'outside' && !TGT.recommend(room('Control room', 'Mixing and critical listening', 3, 3, 2.5)),
      `${ebu.preferred} (${ebu.min}–${ebu.max}); small room ${ebuSmall.status}`);
    // Outside a formula's volume range: no target, not the value at the nearest limit. A3: 3 × 3 × 2.7 = 24.3 m³ < 30 m³.
    const tiny = TGT.availability(room('Classroom', 'Teaching', 3, 3, 2.7)), big4 = TGT.availability(room('Classroom', 'Inclusive teaching', 12, 10, 4.5));
    check('Outside the formula\'s volume range there is no target: A3 at 24.3 m³ and A4 at 540 m³ (A4 is not for rooms over 500 m³)', tiny.status === 'outside' && !tiny.target && big4.status === 'outside' && !big4.target, `${tiny.status}; ${big4.status}`);
    // No verified criterion: no target at all.
    const rest = TGT.availability(room('Restaurant', 'Dining and socialising', 15, 10, 3)), home = TGT.availability(room('Living room', 'Living and relaxing', 5, 4, 2.7));
    check('No verified criterion, no target: a restaurant (DIN 18041 B3 gives only A/V) is incomplete, a living room unsupported', rest.status === 'incomplete' && home.status === 'unsupported' && !TGT.recommend(room('Restaurant', 'Dining and socialising', 15, 10, 3)) && !TGT.recommend(room('Living room', 'Living and relaxing', 5, 4, 2.7)),
      `${rest.status}; ${home.status}`);
  }

  // ---------- measured against the target: compared at the displayed precision ----------
  {
    const t = { min: 0.6, max: 0.7 };
    check('Classification at 0.01 s: 0.704 s is within 0.60–0.70 s, 0.706 s is above, 0.594 s is below', A.classify(0.704, t) === 'within' && A.classify(0.706, t) === 'above' && A.classify(0.594, t) === 'below',
      `${A.classify(0.704, t)}, ${A.classify(0.706, t)}, ${A.classify(0.594, t)}`);
    // The verdict follows the digits shown (toFixed(2)), never x·100 rounded on its own: 0.245 s is shown "0.24 s", so it
    // is within 0.20–0.24 s; 0.105 s is shown "0.10 s", so it is below 0.11–0.20 s (x·100 rounding read 25 and 11).
    const w = A.classify(0.245, { min: 0.2, max: 0.24 }), b = A.classify(0.105, { min: 0.11, max: 0.2 });
    check('Classification uses the digits shown: 0.245 s ("0.24 s") is within 0.20–0.24 s; 0.105 s ("0.10 s") is below 0.11–0.20 s', w === 'within' && b === 'below' && (0.245).toFixed(2) === '0.24' && (0.105).toFixed(2) === '0.10', `${w}, ${b}`);
  }

  // ---------- a covered finish whose library absorption exceeds what the room measured ----------
  {
    // 6 × 5 × 3 m: V = 90 m³; measured 1.00 s at 125 Hz → A0 = 0.161 × 90 ÷ 1.00 = 14.49 m². The product (α 0.05) covers
    // walls whose library α is 0.29. 50 m²: covered absorption 50 × 0.29 = 14.5 m² > 14.49 m² → no prediction (before
    // the fix: A = 14.49 + 50 × (0.05 − 0.29) = 2.49 m² → 5.82 s; 66 m²: −1.35 m² → −10.7 s). 40 m²: 11.6 m² ≤ 14.49 m²,
    // A = 14.49 − 40 × 0.24 = 4.89 m² → 0.161 × 90 ÷ 4.89 = 2.9632 s, kept (the model's own answer).
    const run = area => P.predict({ V: 90, bands: [{ f: 125, rt60: 1.0 }, { f: 1000, rt60: 0.6 }], treatment: { items: [{ areaM2: area, alpha: { 125: 0.05, 1000: 0.9 }, coveredAlpha: { 125: 0.29, 1000: 0.05 } }] }, referenceBand: 1000 });
    const r50 = run(50), r66 = run(66), r40 = run(40), b = r => r.bands.find(x => x.f === 125);
    check('Prediction: where the covered finishes would absorb more than the room measured (50 or 66 m² at 0.29 against 14.49 m²), no value (never 5.82 s or −10.7 s), and a check says why',
      b(r50).predicted === null && b(r66).predicted === null && b(r50).coveredExceedsMeasured && r50.checks.some(c => c.id === 'covered-exceeds-measured' && /125 Hz/.test(c.text)) && r50.headline.predicted > 0,
      `50 m²: ${b(r50).predicted}; 66 m²: ${b(r66).predicted}; ${(r50.checks.find(c => c.id === 'covered-exceeds-measured') || {}).text}`);
    check('Prediction: 40 m² (11.6 m² covered of 14.49 m²) keeps its value, 0.161 × 90 ÷ 4.89 = 2.9632 s', close(b(r40).predicted, 2.963190, 1e-5) && !b(r40).coveredExceedsMeasured, b(r40).predicted);
  }

  // ---------- how a level relative to digital full scale (dBFS) is shown ----------
  {
    // −62.37 dBFS is 62.37 dB below full scale ("max"), shown to one decimal: 62.4.
    const f = AM.util.fmt.dbfs;
    check('A dBFS level is shown as dB below max, with the same value to one decimal',
      f(-62.37) === '62.4 dB below max' && f(-3.1) === '3.1 dB below max' && f(-110, 0) === '110 dB below max' && f(0) === '0.0 dB below max'
        && f(-0.04) === '0.0 dB below max' && f(0.5) === '0.5 dB above max' && f(null) === '—' && f(NaN) === '—',
      [f(-62.37), f(-3.1), f(-110, 0), f(0), f(-0.04), f(0.5), f(null)].join(' | '));
    check('A level is never shown as dBFS or as sound pressure (SPL)', !/dBFS|SPL/.test(f(-62.37) + f(-3.1)), f(-62.37));
  }

  // ---------- calculation audit, 20 October 2026 ----------
  {
    const EV = AM.services.evaluation, RA = AM.services.rt60Average, r2 = x => Math.round(x * 100) / 100;
    const proc = vals => ({ valid: true, bands: B.map((f, i) => ({ f, rt60: vals[i], t30: vals[i], path: vals[i] == null ? null : 'T30', quality: vals[i] == null ? 'Insufficient' : 'Good' })) });
    const judge = (t, pol, vals) => { const rows = EV.bandRows(Object.fromEntries(B.map((f, i) => [f, vals[i]])), t, pol); return { rows, v: EV.verdict(rows, RA.ofBands(proc(vals), pol.primary), t, pol) }; };

    // 1. EBU Tech 3276 §2.3: Tm is the room's own measured mean (here 250 Hz–4 kHz), 0.2 s < Tm < 0.4 s, and every band
    //    within the mask around THAT Tm (Fig. 1 is drawn as T − Tm): ±0.05 s, at 125 Hz −0.05 to +0.15 s
    //    (0.30 − 0.25 × lg(125/63) / lg(200/63) = 0.1517 s).
    const ctl = { industry: 'Recording and music studios', type: 'Control room', use: 'Mixing and critical listening', L: 7, W: 5, H: 3 };
    const er = TGT.recommend(ctl), et = { preferred: er.preferred, min: er.min, max: er.max, form: er.form, source: 'recommended' }, ep = EV.policyFor(ctl, et);
    const flat = x => B.map(() => x);
    const f33 = judge(et, ep, flat(0.33));
    // 250 Hz 0.40, the rest 0.33: Tm = (0.40 + 4 × 0.33) ÷ 5 = 0.344 s → 250 Hz limits 0.29–0.39 s, 0.40 is above.
    const b250 = judge(et, ep, [0.33, 0.40, 0.33, 0.33, 0.33, 0.33]), f45 = judge(et, ep, flat(0.45)), f20 = judge(et, ep, flat(0.20)), f39 = judge(et, ep, flat(0.39));
    const L = (j, f) => { const r = j.rows.find(x => x.f === f); return [r.min, r.max]; };
    check('EBU judged around the room\'s measured Tm: flat 0.33 s in a 105 m³ room (guide 0.25 s) meets it, with 250 Hz limits 0.28–0.38 s and 125 Hz 0.28–0.48 s around Tm 0.33 s',
      f33.v.status === 'within' && JSON.stringify(L(f33, 250)) === '[0.28,0.38]' && JSON.stringify(L(f33, 125)) === '[0.28,0.48]' && Math.abs(f33.v.tm - 0.33) < 1e-12,
      `${f33.v.status}; 250 Hz ${L(f33, 250)}; 125 Hz ${L(f33, 125)}`);
    check('EBU: one band off the mask (250 Hz 0.40 s, Tm 0.344 s, limits 0.29–0.39 s) does not meet it; Tm 0.45 s and Tm 0.20 s fail the 0.2 s < Tm < 0.4 s rule (strict), Tm 0.39 s passes',
      b250.v.status === 'above' && JSON.stringify(b250.v.above.map(r => r.f)) === '[250]' && JSON.stringify(L(b250, 250)) === '[0.29,0.39]'
        && f45.v.status === 'above' && f45.v.tmFails && f20.v.status === 'below' && f20.v.tmFails && f39.v.status === 'within',
      `250 Hz: ${b250.v.status}; 0.45: ${f45.v.status}; 0.20: ${f20.v.status}; 0.39: ${f39.v.status}`);

    // 2. DIN 18041: the 125 Hz and 4 kHz limits are the standard's own, from T_soll itself (0.65–1.45 × and 0.65–1.2 ×),
    //    not from the target range already rounded to 0.01 s. T_soll = k·lg V + c worked out here for every volume.
    const crit = [['Music room', 'Music rehearsal and performance', 0.45, 0.07, 30, 1000], ['Lecture hall', 'Lectures and presentations', 0.37, -0.14, 50, 5000],
      ['Classroom', 'Teaching', 0.32, -0.17, 30, 1000], ['Classroom', 'Inclusive teaching', 0.26, -0.14, 30, 500]];
    let bad = [], n = 0;
    crit.forEach(([type, use, k, c, v0, v1]) => {
      for (let V = v0; V < Math.min(v1, 1000); V += 1.5) {
        const rm = { industry: type === 'Music room' || type === 'Lecture hall' || type === 'Classroom' ? 'Education and training facilities' : '', type, use, L: V, W: 1, H: 1 };
        const rec = TGT.recommend(rm); if (!rec) { bad.push(`${type} ${V}: none`); continue; }
        const T = k * Math.log10(V) + c, tt = { preferred: rec.preferred, min: rec.min, max: rec.max, form: rec.form, source: 'recommended', tsoll: rec.tsoll }, pol = EV.policyFor(rm, tt);
        const l125 = EV.limits(125, tt, pol), l4k = EV.limits(4000, tt, pol); n++;
        if (l125.min !== r2(T * 0.65) || l125.max !== r2(T * 1.45) || l4k.min !== r2(T * 0.65) || l4k.max !== r2(T * 1.2)) bad.push(`${use} ${V} m³: ${l125.min}–${l125.max}, ${l4k.min}–${l4k.max} vs ${r2(T * 0.65)}–${r2(T * 1.45)}, ${r2(T * 0.65)}–${r2(T * 1.2)}`);
      }
    });
    // A3 at 30 m³: T_soll = 0.32 × lg 30 − 0.17 = 0.30268 s → 125 Hz 0.65 × 0.30268 = 0.1967 → 0.20 s (from the rounded range it was 0.19 s).
    check(`DIN 18041 edge limits from T_soll itself, for A1–A4 over ${n} volumes: 125 Hz 0.65–1.45 × T_soll and 4 kHz 0.65–1.2 × T_soll, each rounded once (e.g. A3, 30 m³: 125 Hz from 0.20 s, not 0.19 s)`, !bad.length && n > 1000, bad.slice(0, 3).join(' · ') || `${n} volumes`);

    // 3. Eyring next to Sabine when the treated room is very absorbent. V 180 m³, S 216 m², measured 0.9 s:
    //    A0 = 0.161 × 180 ÷ 0.9 = 32.2 m²; 40 m² of α 0.9 adds 36 m² → Sabine 28.98 ÷ 68.2 = 0.42493 s.
    //    Eyring, calibrated to the same measurement: ᾱ0 = 1 − e^(−32.2/216) = 0.138495; ᾱ = 0.138495 + 36/216 = 0.305161;
    //    RT60 = 28.98 ÷ (−216 × ln(1 − 0.305161)) = 28.98 ÷ (216 × 0.364076) = 28.98 ÷ 78.6404 = 0.368513 s.
    const ey = P.predict({ V: 180, S: 216, bands: [{ f: 1000, rt60: 0.9 }], treatment: { items: [{ areaM2: 40, alpha: { 1000: 0.9 } }] }, referenceBand: 1000 });
    const eyc = ey.checks.find(x => x.id === 'high-absorption');
    check('Very absorbent after treatment (mean α 0.316): Sabine 0.4249 s is kept, and the check gives Eyring\'s value calibrated to the same measurement, 0.3685 s (13 % shorter)',
      close(ey.headline.predicted, 0.424927, 1e-5) && close(ey.headline.eyring, 0.368513, 1e-5) && eyc && /0\.42 s/.test(eyc.text) && /0\.37 s/.test(eyc.text) && /13 % shorter/.test(eyc.text), eyc ? eyc.text : 'no check');

    // 4. The amount for the target meets the target as the verdict judges it: every band within its own limits. Meeting
    //    room 9 × 7 × 3 m (189 m³, DIN 18041 A3): T_soll = 0.32 × lg 189 − 0.17 = 0.558474 s, range 0.45–0.67 s, 125 Hz
    //    0.36–0.81 s, 4 kHz 0.36–0.67 s. Each band at area x is 30.429 ÷ (30.429 ÷ RT + x × α), with the product's octave α.
    const prod = CAT.getProducts().find(q => q.size.options.some(o => o.areaM2 > 0) && CAT.getAcousticConfigurations(q.id).some(c => !CAT.getOctaveAbsorption(c.id, B).missing.length && B.every(f => CAT.getOctaveAbsorption(c.id, B).values[f] > 0.2)));
    const cfg = CAT.getAcousticConfigurations(prod.id).find(c => !CAT.getOctaveAbsorption(c.id, B).missing.length && B.every(f => CAT.getOctaveAbsorption(c.id, B).values[f] > 0.2));
    const al = CAT.getOctaveAbsorption(cfg.id, B).values, si = prod.size.options.findIndex(o => o.areaM2 > 0);
    const meet = { industry: 'Corporate offices and meeting rooms', type: 'Meeting room', use: 'Meetings and presentations', L: 9, W: 7, H: 3 };
    const mr = TGT.recommend(meet), mt = { preferred: mr.preferred, min: mr.min, max: mr.max, form: mr.form, source: 'recommended', basis: '', tsoll: mr.tsoll };
    const proj = rts => ({ id: 'amount', room: meet, target: mt, completed: [], review: [],
      processing: { result: { valid: true, referenceBand: 1000, headline: { f: 1000, rt60: rts[3] }, bands: B.map((f, i) => ({ f, rt60: rts[i], path: 'T30', quality: 'Good' })) } },
      treatment: { items: [{ id: 'i1', productId: prod.id, configurationId: cfg.id, size: String(si), quantity: 1, placement: 'Walls', mode: 'area', areaM2: 1 }], active: 'i1' } });
    const lim = { 125: [0.36, 0.81], 250: [0.45, 0.67], 500: [0.45, 0.67], 1000: [0.45, 0.67], 2000: [0.45, 0.67], 4000: [0.36, 0.67] };
    const within = (rts, x) => B.every((f, i) => { const v = r2(30.429 / (30.429 / rts[i] + x * al[f])); return v >= lim[f][0] && v <= lim[f][1]; });
    const even = [0.95, 0.95, 0.95, 0.95, 0.9, 0.85], g1 = AM.derive.treatmentForTarget(proj(even));
    // There every band is within its limits, so the amount is the one that brings the 250 Hz–2 kHz average to the preferred
    // 0.56 s (the aim), with every band, worked out here, inside its own limits.
    const avgAt = x => [250, 500, 1000, 2000].reduce((t, f) => t + 30.429 / (30.429 / even[B.indexOf(f)] + x * al[f]), 0) / 4;
    check('Amount for the target, every band reachable: the amount brings the 250 Hz–2 kHz average to the preferred 0.56 s, and every band there is within its own DIN limits (worked out here)',
      mr.min === 0.45 && mr.max === 0.67 && g1 && g1.meetsBands && within(even, g1.areaM2) && close(avgAt(g1.areaM2), 0.56, 2e-4),
      g1 ? `${g1.areaM2.toFixed(2)} m² of ${prod.name}, ${cfg.label}: ${B.map((f, i) => (30.429 / (30.429 / even[i] + g1.areaM2 * al[f])).toFixed(3)).join(', ')} s` : 'none');
    // Automatic treatment (20 October 2026). The app sets the amounts of its products (amountBy 'app') together
    // (AM.derive.autoPlan): the fewest bands outside their limits, then the least material; never more than the free
    // surface (here the walls, 2 × (9 + 7) × 3 = 96 m², no openings recorded). Worked out here by trying every amount.
    {
      const app = rts => { const q = proj(rts); q.treatment.items[0].amountBy = 'app'; return q; };
      const pe = app(even), it = AM.derive.treatmentItems(pe)[0], per = it.size.areaM2, amt = AM.derive.autoAmount(pe, it);
      const least = Array.from({ length: Math.floor(96 / per) + 1 }, (_, q) => q).find(q => within(even, q * per));
      check('Automatic amount, one product: the least whole number of panels that meets the target in every band (tried here panel by panel), as the app\'s',
        amt && amt.needed && amt.mode === 'units' && amt.quantity === least && !amt.capped && AM.derive.isAutoAmount(pe, it) && !AM.derive.isAutoAmount(proj(even), AM.derive.treatmentItems(proj(even))[0]),
        amt ? `${amt.quantity} panels (${amt.areaM2.toFixed(2)} m²); tried here: ${least}` : 'none');
      // A very reverberant room (4 s) and only Wall 1 (9 × 3 = 27 m²) to put it on: more is better all the way, so the app
      // fills the wall (whole panels) and says so. (On all four walls it would not: there the high sounds would get too
      // dull before the wall is full, and the app stops where the fewest bands are outside their limits.)
      const loud = app([4, 4, 4, 4, 4, 4]); loud.treatment.items[0].placement = 'Wall 1';
      const al2 = AM.derive.autoAmount(loud, AM.derive.treatmentItems(loud)[0]);
      check('Automatic amount when the room needs more than fits where it goes: all of Wall 1 (27 m²) in whole panels, and said so (capped)',
        al2 && al2.capped && al2.availableM2 === 27 && al2.quantity === Math.floor(27 / per + 1e-9), al2 ? `${al2.quantity} panels, ${al2.areaM2.toFixed(2)} of ${al2.availableM2} m²` : 'none');
      // Two products set by the app together are never worse than either one alone at its own best amount.
      const second = CAT.getProducts().find(q => q.id !== prod.id && q.size.options.some(o => o.areaM2 > 0) && CAT.getAcousticConfigurations(q.id).some(c => !CAT.getOctaveAbsorption(c.id, B).missing.length));
      const cfg2 = CAT.getAcousticConfigurations(second.id).find(c => !CAT.getOctaveAbsorption(c.id, B).missing.length);
      const boom = [1.6, 1.0, 0.85, 0.8, 0.75, 0.7];
      const two = (by1, by2) => { const q = proj(boom); q.treatment.items = [Object.assign({}, q.treatment.items[0], { amountBy: by1, quantity: 0 }), { id: 'i2', productId: second.id, configurationId: cfg2.id, size: String(second.size.options.findIndex(o => o.areaM2 > 0)), quantity: 0, placement: 'Ceiling', amountBy: by2 }]; return q; };
      const better = (x, y) => (x[0] !== y[0] ? x[0] < y[0] : x[0] === 0 ? x[2] <= y[2] + 1e-9 : x[1] <= y[1] + 1e-6);
      const joint = AM.derive.autoPlan(two('app', 'app')).best, onlyA = AM.derive.autoPlan(two('app', 'user')).best, onlyB = AM.derive.autoPlan(two('user', 'app')).best;
      check('Two products set together (walls and ceiling): the mix is at least as good as either product alone at its best amount (fewest bands outside their limits, then closest to the aim)',
        joint && onlyA && onlyB && better(joint, onlyA) && better(joint, onlyB), `together ${JSON.stringify(joint)} · ${prod.name} alone ${JSON.stringify(onlyA)} · ${second.name} alone ${JSON.stringify(onlyB)}`);
      // The recommended mounting: when any of the product's tested mountings meets the target at the app's amount, the
      // recommended one does (each tried here with its own suggested amount).
      const multi = CAT.getProducts().find(q => q.size.options.some(o => o.areaM2 > 0) && CAT.getAcousticConfigurations(q.id).filter(c => !CAT.getOctaveAbsorption(c.id, B).missing.length).length >= 3);
      const base = proj(even);
      base.treatment = { items: [{ id: 'i1', productId: multi.id, configurationId: null, size: String(multi.size.options.findIndex(o => o.areaM2 > 0)), quantity: 0, placement: 'Walls', amountBy: 'app' }], active: 'i1' };
      const recId = AM.derive.recommendConfig(base, AM.derive.treatmentItems(base)[0]);
      const tried = CAT.getAcousticConfigurations(multi.id).filter(c => !CAT.getOctaveAbsorption(c.id, B).missing.length).map(c => {
        const q = JSON.parse(JSON.stringify(base)); q.treatment.items[0].configurationId = c.id;
        const a = AM.derive.autoAmount(q, AM.derive.treatmentItems(q)[0]); q.treatment.items[0].quantity = a.quantity;
        const pr = AM.derive.prediction(q);
        return { id: c.id, label: c.label, area: a.areaM2, meets: pr && pr.predictedStatus === 'within' };
      });
      check('Recommended mounting: when any of the product\'s tested mountings meets the target at the app\'s amount, the recommended one does',
        tried.some(x => x.id === recId) && (!tried.some(x => x.meets) || tried.find(x => x.id === recId).meets),
        `${multi.name}: ${tried.map(x => `${x.label} ${x.area.toFixed(1)} m² ${x.meets ? 'meets' : 'no'}${x.id === recId ? ' ← recommended' : ''}`).join(' · ')}`);
    }
    // 125 Hz rings far longer than the rest: when the middle bands reach the bottom of their range, 125 Hz is still above
    // its own limit, so no amount of this product alone meets the target in every band. Said so, with the band.
    const lowBoom = [3.0, 0.8, 0.7, 0.7, 0.7, 0.7], g2 = AM.derive.treatmentForTarget(proj(lowBoom));
    const noArea = !Array.from({ length: 2000 }, (_, k) => k * 0.25).some(x => within(lowBoom, x));
    check('Amount for the target when no amount meets every band (125 Hz at 3.0 s, the rest 0.7–0.8 s): said so (meetsBands false), naming 125 Hz, never offered as meeting the target',
      noArea && g2 && g2.meetsBands === false && g2.above.includes(125), g2 ? `average amount ${g2.areaM2.toFixed(1)} m²; above ${g2.above.join(', ')}; below ${g2.below.join(', ')}` : 'none');

    // 5. A band measured at only one of the two positions leaves the result provisional there (ISO 3382-2: two
    //    source-microphone combinations for the survey method).
    const res = (pos, v125) => ({ valid: true, referenceBand: 1000, headline: { f: 1000, rt60: 0.7 }, meta: { position: pos },
      bands: B.map(f => ({ f, rt60: f === 125 ? v125 : 0.7, t30: f === 125 ? v125 : 0.7, path: f === 125 && v125 == null ? null : 'T30', quality: f === 125 && v125 == null ? 'Insufficient' : 'Good' })) });
    const two = { id: 'thin', room: meet, target: mt, completed: [], review: [], processing: { positions: { P1: res('P1', 0.9), P2: res('P2', null) }, result: res('P2', null) }, treatment: { items: [], active: null } };
    const at = AM.derive.assessment(two);
    check('Two positions, 125 Hz measured at only one: the result is provisional and names 125 Hz', at && at.positions.complete && at.provisional && JSON.stringify(at.thinBands) === '[125]',
      at ? `complete ${at.positions.complete}; provisional ${at.provisional}; thin ${at.thinBands}` : 'none');
  }

  /* ---------- Whole-application walkthrough, 20 October 2026 (docs/QA-WALKTHROUGH-2026-10-20.md) ---------- */
  {
    const U = AM.util, TS = AM.services.target, W = AM.workflow, P = AM.services.prediction;
    // Number fields: the whole entry has to be a number (items 4–5).
    const nums = ['12abc', '2 x 3', '1,250', '2,5', ' 4.5 ', '-3', '1e2', '', '.5', '1,2.5'].map(v => U.num(v));
    check('A typed number is the whole entry: "12abc", "2 x 3", "1,250" (ambiguous) and "1,2.5" are not numbers; "2,5" is 2.5',
      JSON.stringify(nums) === JSON.stringify([null, null, null, 2.5, 4.5, -3, 100, null, 0.5, null]), JSON.stringify(nums));
    // Lists in sentences end with "and" (item 38).
    check('Band lists read "125 Hz and 250 Hz" and "125 Hz, 250 Hz and 500 Hz"',
      U.fmt.hzList([125, 250]) === '125 Hz and 250 Hz' && U.fmt.hzList([125, 250, 500]) === '125 Hz, 250 Hz and 500 Hz' && U.fmt.hzList([500]) === '500 Hz',
      `${U.fmt.hzList([125, 250])} | ${U.fmt.hzList([125, 250, 500])}`);
    // No room type list before an industry is chosen (item 1).
    const none = TS.typeGroups(''), some = TS.typeGroups(AM.demo.INDUSTRIES[0].name);
    check('Before an industry is chosen the room type list is empty; after, "Other" is the last entry',
      none.target.length === 0 && none.none.length === 0 && some.none[some.none.length - 1] === AM.demo.OTHER_TYPE, JSON.stringify(none));
    // What a change puts up for review (items 2 and 9): descriptive details nothing, a wall added the predictions only.
    const aff = ['room.purpose', 'room.occupancy', 'room.context.seats', 'room.problems', 'setup.prep.doors', 'room.wallKeys', 'room.ceilingKeys', 'room.H', 'room.use'].map(k => [k, W.affects(k)]);
    check('Review flags: purpose, occupancy, questions, problems and the checklist flag nothing; adding a wall or ceiling section flags Treatment, Predicted and Final only; size and use flag every later step',
      aff.slice(0, 5).every(([, v]) => Array.isArray(v) && !v.length) && aff.slice(5, 7).every(([, v]) => JSON.stringify(v) === '["treatment","prediction","final"]') && aff.slice(7).every(([, v]) => v === null),
      JSON.stringify(aff));
    // A product with no tested α at 1000 Hz: the calculation is written out at a band that has a prediction (item 39).
    const bands = [125, 250, 500, 1000, 2000, 4000].map(f => ({ f, rt60: 0.8 })), alpha = { 125: 0.2, 250: 0.4, 500: 0.7, 2000: 0.8, 4000: 0.8 };
    const pr = P.predict({ V: 100, S: 130, bands, treatment: { items: [{ areaM2: 10, alpha }] }, referenceBand: 1000 });
    check('No tested α at 1000 Hz: the written-out calculation moves to the first band with a prediction (125 Hz), and 1000 Hz has no value',
      pr.headline && pr.headline.f === 125 && pr.headline.predicted != null && pr.bands.find(b => b.f === 1000).predicted === null,
      pr.headline ? `headline ${pr.headline.f} Hz, ${pr.headline.predicted && pr.headline.predicted.toFixed(3)} s` : 'none');
    // A one-band average (NBC, 500 Hz) is "one band", not "all 1 bands" (item 32).
    const one = AM.services.rt60Average.ofBands({ valid: true, bands: [{ f: 500, rt60: 0.8, path: 'T30', quality: 'Good', n: 2, of: 2 }] }, [500]);
    check('A one-band average is described as "one band"', AM.services.rt60Average.describe(one) === 'one band', AM.services.rt60Average.describe(one));
  }

  /* ---------- Acoustic solutions: the catalogue grouped for choosing (js/services/solutions.js) ---------- */
  {
    const SO = AM.services.solutions, CAT = AM.services.catalog, products = CAT.getProducts(), sols = SO.all();
    const ids = sols.flatMap(s => s.products.map(p => p.id));
    check('Every product of the catalogue is in exactly one solution, and every solution in one of the categories (no product added or left out)',
      ids.length === products.length && new Set(ids).size === products.length && products.every(p => ids.includes(p.id)) && sols.every(s => SO.CATEGORIES.some(c => c.id === s.category)),
      `${products.length} products in ${sols.length} solutions: ${SO.CATEGORIES.map(c => `${c.name} ${SO.byCategory(c.id).length}`).join(', ')}`);
    check('Every category has products, and there is no floor category (the source has no floor products)',
      SO.CATEGORIES.every(c => SO.byCategory(c.id).length > 0) && !SO.CATEGORIES.some(c => /floor/i.test(c.name)) && !products.some(p => (p.application.surfaces || []).includes('Floor')),
      SO.CATEGORIES.map(c => c.id).join(', '));
    const clash = sols.filter(s => new Set(s.products.map(p => SO.variantLabel(s, p))).size !== s.products.length).map(s => s.name);
    check('The versions of a solution all have different labels (what tells them apart: thickness, weight, finish or size)', !clash.length, clash.join(', ') || `${sols.filter(s => s.products.length > 1).length} solutions with versions`);
    const u = SO.get('UNIZEN|UNIZEN ACOUSTIC PANEL');
    check('The description of a solution comes from its own data (UNIZEN panel: range, finish, thickness 9–25 mm, 4 versions; for walls and ceilings)',
      u && SO.summary(u) === 'UNIZEN range · PET Solid · 9–25 mm thick · 4 versions' && SO.whereText(u) === 'For walls and ceilings' && SO.search('unizen 25 mm').some(s => s.key === u.key),
      u ? `${SO.summary(u)} · ${SO.whereText(u)}` : 'missing');
  }

  const el = document.getElementById('out');
  if (el) el.innerHTML = results.map(t => `<li class="${t.ok ? 'ok' : 'bad'}"><b>${t.ok ? 'PASS' : 'FAIL'}</b> ${t.name}<br><small>${t.detail == null ? '' : t.detail}</small></li>`).join('');
  document.title = `${results.filter(t => t.ok).length}/${results.length} passed`;
  window.TEST_DONE = Promise.resolve(results);
})();
