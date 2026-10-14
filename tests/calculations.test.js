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
      processing: { result: { valid: true, referenceBand: 1000, headline: { f: 1000, rt60: 0.7 }, bands: B.map(f => ({ f, rt60: rts[f] })) } },
      treatment: { items: [{ id: 'i1', productId: product.id, configurationId: cfg.id, size: String(sizeIndex), quantity: 5, placement: 'Walls' }], active: 'i1' },
    };
    const pred = AM.derive.prediction(p), alpha = CAT.getOctaveAbsorption(cfg.id, [1000]).values[1000], area = 5 * size.areaM2;
    // RT60 = 0.161 × 189 / (0.161 × 189 / 0.7 + 5 panels × panel area × octave α at 1 kHz)
    const expected = 30.429 / (43.47 + area * alpha);
    check('App prediction: 5 panels × panel area × octave-band α(1 kHz), then 0.161 · V / (A0 + ΔA)', pred && close(pred.headline.predicted, expected, 1e-9) && pred.items[0].alpha[1000] === alpha,
      pred ? `${product.name}, ${cfg.label}: 5 × ${size.areaM2} m² × ${alpha} = ${(area * alpha).toFixed(4)} m² → ${pred.headline.predicted.toFixed(4)} s (expected ${expected.toFixed(4)} s)` : 'no prediction');
  }

  // ---------- RT60 targets (DIN 18041:2016 group A and B, ANSI/ASA S12.60) ----------
  {
    const room = (type, use, L, W, H, extra) => Object.assign({ type, use, L, W, H }, extra || {});
    const rec = r => TGT.recommend(r);
    // A1 music, 200 m³: 0.45 × lg 200 + 0.07 = 0.45 × 2.30103 + 0.07 = 1.10546 s; 0.8–1.2 × → 0.88–1.33
    const a1 = rec(room('Music room', 'Music rehearsal and performance', 10, 5, 4));
    check('DIN 18041 A1 (music), 200 m³: 0.45·lg V + 0.07 = 1.11 s, range 0.88–1.33 s', a1.preferred === 1.11 && a1.min === 0.88 && a1.max === 1.33, `${a1.preferred} (${a1.min}–${a1.max})`);
    // A2 speech, 600 m³: 0.37 × lg 600 − 0.14 = 0.37 × 2.77815 − 0.14 = 0.88792 s (no school limit above 566 m³)
    const a2 = rec(room('Lecture hall', 'Lectures and presentations', 12, 10, 5));
    check('DIN 18041 A2 (speech), 600 m³: 0.37·lg V − 0.14 = 0.89 s', a2.preferred === 0.89 && a2.min === 0.71 && a2.max === 1.07, `${a2.preferred} (${a2.min}–${a2.max})`);
    // A3 teaching, 189 m³: 0.32 × lg 189 − 0.17 = 0.32 × 2.27646 − 0.17 = 0.55847 s; 0.8 × = 0.45; 1.2 × = 0.67 → ANSI limit 0.60 s
    const a3 = rec(room('Classroom', 'Teaching', 9, 7, 3));
    check('DIN 18041 A3 (teaching), 189 m³: 0.32·lg V − 0.17 = 0.56 s; upper limit 0.60 s from ANSI S12.60 (≤ 283 m³)', a3.preferred === 0.56 && a3.min === 0.45 && a3.max === 0.6, `${a3.preferred} (${a3.min}–${a3.max})`);
    // A4 inclusive, 180 m³ in use: 0.26 × lg 180 − 0.14 = 0.26 × 2.25527 − 0.14 = 0.44637 s
    // empty with 12 people expected (80 % present = 9.6 × 0.5 m² = 4.8 m²): A = 0.163 × 180 / 0.44637 = 65.730 m²,
    // without them 60.930 m² → 0.163 × 180 / 60.930 = 0.48154 s
    const a4 = rec(room('Conference room', 'Video calls and hybrid meetings', 10, 6, 3, { occupancy: 12 }));
    check('DIN 18041 A4, 180 m³ with 12 people: in use 0.45 s, measured empty 0.48 s', a4.inUse.preferred === 0.45 && a4.preferred === 0.48 && a4.inUse.absorption === 4.8, `in use ${a4.inUse.preferred} s, empty ${a4.preferred} s, people ${a4.inUse.absorption} m²`);
    // A5 sport, 5000 m³: 0.75 × lg 5000 − 1.00 = 0.75 × 3.69897 − 1 = 1.77423 s; above 10 000 m³: 2.0 s
    const a5 = rec(room('Sports hall', 'Sport and exercise', 25, 20, 10)), a5b = rec(room('Sports hall', 'Sport and exercise', 50, 30, 12));
    check('DIN 18041 A5 (sport): 5000 m³ → 1.77 s; 18 000 m³ → 2.0 s', a5.preferred === 1.77 && a5b.preferred === 2, `${a5.preferred} s, ${a5b.preferred} s`);
    // B4 workrooms, h = 3 m: A/V ≥ 1 / (2.13 + 4.69 × lg 3) = 1 / 4.36770 = 0.22895 → RT60 ≤ 0.163 / 0.22895 = 0.71194 s
    const b4 = rec(room('Private office', 'Focused desk work', 5, 4, 3));
    check('DIN 18041 B4, 3 m high: A/V ≥ 1/(2.13 + 4.69·lg h) → RT60 at most 0.71 s', b4.max === 0.71 && b4.preferred === 0.59, `max ${b4.max} s, design ${b4.preferred} s`);
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

  const el = document.getElementById('out');
  if (el) el.innerHTML = results.map(t => `<li class="${t.ok ? 'ok' : 'bad'}"><b>${t.ok ? 'PASS' : 'FAIL'}</b> ${t.name}<br><small>${t.detail == null ? '' : t.detail}</small></li>`).join('');
  document.title = `${results.filter(t => t.ok).length}/${results.length} passed`;
  window.TEST_DONE = Promise.resolve(results);
})();
