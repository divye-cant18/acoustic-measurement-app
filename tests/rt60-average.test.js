/* Tests of the headline average RT60, 500–2000 Hz (AM.services.rt60Average) and of every place that shows it,
   in the whole application (tests/rt60-average.html). Development only. Results on the page and in
   window.RT60_AVERAGE_TEST (window.RT60_AVERAGE_DONE resolves).

   Expected values are worked out by hand in the comments from fixed band values. For real takes (synthetic recordings of
   known rooms, tests/fixtures.js, through the production analysis and processing) the expected average is summed here
   from the result's own band values, without the service.

    The headline is the mean of the fixed bands 500, 1000 and 2000 Hz (AM.services.rt60Average); without all three it is
    unavailable and names the band that failed.
    1 all six bands: only the three required bands enter it
    2 other bands without a value change nothing; a required band without one means no headline
    3 missing, zero, negative, NaN, infinite and text values at a required band; a band without a path; a band with T20
      but no RT60; a band's own T20 result used as it is
    4 no band with a value, an invalid result, no result: "Unavailable", never 0 or NaN
    5 one measurement only: superseded measurements and later invalid takes are never mixed in
    6 unrounded values averaged, rounding only for display
    7 the same average on every screen and in the PDF
    8 the band tables keep every band's own result
    9 assessment and prediction keep using the band values (the target at 1000 Hz)
   10 a new measurement replaces the summary through the Processing step; an invalid later take does not */
(function () {
  'use strict';
  const results = window.RT60_AVERAGE_TEST = [];
  const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) }); show(); };
  const status = t => { const el = document.getElementById('av-status'); if (el) el.textContent = t; };
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  function show() {
    const el = document.getElementById('av-out');
    if (el) el.innerHTML = results.map(t => `<li class="${t.ok ? 'ok' : 'bad'}"><b>${t.ok ? 'PASS' : 'FAIL'}</b> ${esc(t.name)}<br><small>${esc(t.detail)}</small></li>`).join('');
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function until(fn, what, ms = 30000) {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(50); }
    throw new Error(`Timed out waiting for ${what}`);
  }
  const close = (a, b, tol = 1e-12) => typeof a === 'number' && Math.abs(a - b) <= tol;
  const json = o => JSON.stringify(o);
  const copy = o => JSON.parse(JSON.stringify(o));
  const textOf = h => { const d = document.createElement('div'); d.innerHTML = h; return d.textContent.replace(/\s+/g, ' '); };
  const dom = h => { const d = document.createElement('div'); d.innerHTML = h; return d; };
  // Label → value pairs of the key-value lists (ui.kv) and the project card's figures, as the screen shows them.
  const pairs = (h, row, k, v) => Object.fromEntries([...dom(h).querySelectorAll(row)].map(r => [r.querySelector(k).textContent.trim(), r.querySelector(v).textContent.replace(/\s+/g, ' ').trim()]));
  const NR = 'Only 21 dB of the room\'s own decay above the noise floor. T20 needs 35 dB.';

  // Clear what an earlier run left under this page's prefix (tests/rt60-average.html).
  (function clean() {
    const P = 'rt60-average-test:';
    [localStorage, sessionStorage].forEach(st => {
      const keys = [];
      for (let i = 0; i < st.length; i++) { const k = st.key(i); if (k && k.startsWith(P)) keys.push(k.slice(P.length)); }
      keys.forEach(k => st.removeItem(k));
    });
  })();

  async function run() {
    await window.APP_READY;
    await until(() => AM.store && AM.store.state && AM.app && AM.services.rt60Average, 'the app');
    const RA = AM.services.rt60Average, S = AM.store, W = AM.workflow, D = AM.derive, A = AM.acoustics, ui = AM.ui, fmt = AM.util.fmt;
    const B = AM.demo.BANDS;
    // A band as the processing engine leaves it: a value with its path and quality, or none with the reason.
    const band = (f, rt60, extra) => Object.assign({ f, rt60, t20: null, t30: rt60, path: rt60 == null ? null : 'T30', quality: rt60 == null ? 'Insufficient' : 'Good', reason: rt60 == null ? NR : null }, extra);
    const result = (bands, extra) => Object.assign({ valid: true, status: 'valid', referenceBand: 1000, recordingId: 'fixture', takenAt: '2026-10-13T08:00:00.000Z', bands }, extra);

    /* ===== 1. all six bands ===== */
    status('Service…');
    {
      // Fixed bands: (0.50 + 0.48 + 0.45) ÷ 3 = 1.43 ÷ 3 = 0.47667 s. 125, 250 and 4000 Hz are not part of it.
      const r = result(B.map((f, i) => band(f, [0.62, 0.55, 0.50, 0.48, 0.45, 0.40][i])));
      const a = RA.of(r);
      check('1 All six bands with a value: the headline is the mean of 500, 1000 and 2000 Hz only: (0.50 + 0.48 + 0.45) ÷ 3 = 0.4767 s; the other bands are listed as not part of it',
        a.available && a.n === 3 && a.total === 3 && close(a.value, 1.43 / 3) && json(a.included.map(b => b.f)) === json([500, 1000, 2000]) && json(a.excluded.map(b => b.f)) === json([125, 250, 4000]), `${a.value} s`);
    }

    /* ===== 2. bands without a reliable value ===== */
    {
      // As in the screenshot: 125 Hz not reliable; 500 Hz 0.358, 1000 Hz 0.274, 2000 Hz 0.276: (0.358 + 0.274 + 0.276) = 0.908;
      // ÷ 3 = 0.30267 s, shown 0.30 s. 125 Hz (no value) and 250 / 4000 Hz (values) change nothing.
      const r = result([band(125, null), band(250, 0.504, { path: 'T20', t20: 0.504, t30: null, quality: 'Fair' }), band(500, 0.358), band(1000, 0.274), band(2000, 0.276, { quality: 'Fair' }), band(4000, 0.293, { quality: 'Fair' })]);
      const a = RA.of(r);
      check('2 125 Hz "Not reliable" and the values at 250 and 4000 Hz do not enter the headline: (0.358 + 0.274 + 0.276) ÷ 3 = 0.3027 s, shown 0.30 s',
        a.available && a.n === 3 && close(a.value, 0.908 / 3, 1e-12) && fmt.s(a.value) === '0.30 s', `${a.value} s`);
      // A required band not reliable, another not measured: no headline, both named with their reasons.
      const r2 = result([band(125, 0.6), band(250, 0.55), band(500, null), band(1000, 0.48), band(2000, null, { quality: 'Not measured', reason: null }), band(4000, 0.4)]);
      const a2 = RA.of(r2);
      check('2 A required band not reliable (500 Hz) and one not measured (2000 Hz): no headline, both named with their reasons; never an average of what is left',
        !a2.available && a2.value === null && json(a2.missing.map(b => [b.f, b.reason.split(':')[0]])) === json([[500, 'Not reliable'], [2000, 'Not measured']]) && /500 Hz and 2000 Hz have no reliable value/.test(a2.reason),
        a2.reason);
    }

    /* ===== 3. values that are not a band RT60 ===== */
    {
      // In a required band, missing, 0, negative, NaN or infinite is no value: no headline, not 0 and not NaN.
      const bad = [null, 0, -0.3, NaN, Infinity, '0.5'];
      const got = bad.map(v => RA.of(result([band(500, 0.5), band(1000, 0.48), band(2000, v)])));
      check('3 Missing, 0, negative, NaN, infinite or text at a required band (2000 Hz): no headline each time, value null, the band named',
        got.every(a => !a.available && a.value === null && /2000 Hz/.test(a.reason)), got.map(a => `${a.available}/${a.value}`).join(' '));
      // A value without a calculation path, and a band with a T20 but no RT60: no value (no band changes path to be
      // counted); a required band that keeps its own T20 path is used as it is.
      const noPath = RA.of(result([band(500, 0.5, { path: null }), band(1000, 0.48), band(2000, 0.45)]));
      const t20only = RA.of(result([band(500, null, { t20: 0.41 }), band(1000, 0.48), band(2000, 0.45)]));
      const ownPath = RA.of(result([band(500, 0.5, { path: 'T20', t20: 0.5, t30: null, quality: 'Fair' }), band(1000, 0.48), band(2000, 0.45)]));
      check('3 A value without a calculation path, and a T20 where the band has no RT60, do not count; a band\'s own T20 result is used as it is (no path switching)',
        !noPath.available && !t20only.available && ownPath.available && ownPath.included[0].path === 'T20' && close(ownPath.value, 1.43 / 3), `${noPath.reason.slice(0, 40)} | ${t20only.reason.slice(0, 40)} | ${ownPath.value}`);
    }

    /* ===== 4. nothing to average ===== */
    {
      const none = RA.of(result(B.map(f => band(f, null))));
      const invalid = RA.of(result(B.map(f => band(f, 0.5)), { valid: false, status: 'invalid' }));
      const missing = RA.of(null);
      const html = [none, invalid, missing].map(ui.averageSummary).join(''), txt = textOf(html);
      check('4 No band with a value, a take that is not valid, and no measurement: no average (value null), with the reason; nothing averaged from an invalid take',
        [none, invalid, missing].every(a => !a.available && a.value === null && a.n === 0 && a.reason) && invalid.missing.every(b => b.reason === 'Take not valid') && !invalid.included.length,
        [none, invalid, missing].map(a => a.reason).join(' · '));
      check('4 The summary then says "Unavailable" with the reason, never 0, 0.00 or NaN',
        (txt.match(/Unavailable/g) || []).length === 3 && !/NaN|0\.00|Infinity|undefined/.test(txt), txt.slice(0, 200));
    }

    /* ===== 6. unrounded values ===== */
    {
      // (0.304 + 0.304 + 0.314) = 0.922; ÷ 3 = 0.30733 → shown 0.31 s. Averaging the values as shown (0.30 + 0.30 + 0.31 =
      // 0.91; ÷ 3 = 0.3033) would show 0.30 s.
      const r = result([band(125, null), band(250, 0.304), band(500, 0.304), band(1000, 0.304), band(2000, 0.314), band(4000, 0.304)]);
      const a = RA.of(r), shownMean = a.included.reduce((s, b) => s + Number(b.rt60.toFixed(2)), 0) / a.n;
      const html = ui.averageSummary(a);
      check('6 The stored band values are averaged, not the values as shown: 0.922 ÷ 3 = 0.3073 s (kept unrounded) → 0.31 s on screen, where the shown values would give 0.3033 → 0.30 s',
        close(a.value, 0.922 / 3) && a.value !== Number(a.value.toFixed(2)) && fmt.s(a.value) === '0.31 s' && shownMean.toFixed(2) === '0.30' && /class="avg-v">0\.31<small>/.test(html) && html.includes('÷ 3 = 0.307 s'),
        `average ${a.value}; shown ${fmt.s(a.value)}; from the shown values ${shownMean.toFixed(3)}`);
      const r0 = copy(r);
      RA.of(r);
      check('6 The calculation does not change the result it reads (every band as before)', json(r0) === json(r), 'unchanged');
    }

    /* ===== the app: synthetic takes of known rooms through the production analysis and processing ===== */
    status('Takes…');
    const AN = AM.analysis, PROC = AM.services.processing, FIX = window.FIX;
    const plan = AN.sweepPlan(48000), sweep = AN.makeSweep(plan);
    function take(id, takenAt, rt, seed, extra = {}) {
      const ir = FIX.roomIR({ fs: 48000, seconds: 3, rt, seed, directDb: 28 });
      const rec = FIX.recordSweep({ plan, sweep, ir, peakDbfs: -12, noiseDbfs: -70, noiseKind: 'pink', latency: 0.07, seed });
      const an = AN.analyseTake(rec, plan, sweep);
      return Object.assign({ id, takenAt, status: 'captured', reason: an.reason || null, deviceLabel: 'Test fixture recording', outputLabel: '', deviceKind: 'computer', position: 'P1',
        sampleRate: plan.fs, settings: {}, plan: Object.assign({}, plan, { levelDb: 0 }), levels: an.levels, waveform: [], analysis: an, warnings: [] }, extra);
    }
    // The headline summed here, without the service: the mean of 500, 1000 and 2000 Hz.
    const manual = r => { const v = [500, 1000, 2000].map(f => r.bands.find(b => b.f === f).rt60); return v.reduce((s, x) => s + x, 0) / v.length; };
    // Room A: 500 and 2000 Hz longer than 1000 Hz, so its 500–2000 Hz average differs clearly from its 1000 Hz value.
    const roomA = [0.62, 0.58, 0.60, 0.45, 0.56, 0.40], roomB = [1.1, 1.0, 0.95, 0.9, 0.85, 0.8];
    const takeA = take('avg-take-a', '2026-10-13T09:00:00.000Z', roomA, 21);
    const resA = PROC.evaluate(takeA, {});

    S.startProject('new');
    S.autofillTo('target');
    const p = S.state.project;
    S.set('room', Object.assign(copy(p.room), { name: 'Average RT60 test room', L: 9, W: 7, H: 3 }));
    const r1k = resA.headline.rt60, avgA = RA.of(resA).value;
    // A target the 1000 Hz value meets and the average does not (or the reverse): the assessment must follow 1000 Hz.
    const tgt = avgA > r1k ? { preferred: r1k, min: Math.max(0.1, r1k - 0.1), max: (r1k + avgA) / 2 } : { preferred: r1k, min: (r1k + avgA) / 2, max: r1k + 0.1 };
    p.measurement.recording = copy(takeA);
    p.processing.result = resA;
    p.setup.noise = { status: 'valid', takenAt: '2026-10-13T08:59:00.000Z', leqDbfs: -70, verdict: 'Suitable' };
    p.target = Object.assign({ source: 'custom', basis: 'Test' }, tgt);
    p.completed = W.STAGES.map(s => s.id);
    p.review = [];
    S.state.current = 'results';
    S.emit();
    const ctx = () => ({ project: S.state.project, state: S.state });
    check('Take A (room 0.62 … 0.40 s) is valid through the production analysis, with an average that differs from its 1000 Hz value',
      resA.valid && Math.abs(avgA - r1k) > 0.005, `bands ${resA.bands.map(b => `${b.f}: ${b.rt60}`).join(', ')}; 1000 Hz ${r1k} s; average ${avgA.toFixed(4)} s`);

    /* ===== 8. the band tables keep every band ===== */
    status('Band tables…');
    {
      const before = json(resA);
      const tableIn = (html, rtCol) => {
        const d = document.createElement('div'); d.innerHTML = html;
        const t = [...d.querySelectorAll('table.tbl')].find(x => { const h = [...x.querySelectorAll('thead th')].map(th => th.textContent.trim()); return h[0] === 'Band' && h[rtCol] === 'RT60'; });
        return t ? [...t.querySelectorAll('tbody tr')].map(tr => [...tr.children].map(td => td.textContent.trim())) : [];
      };
      const want = resA.bands.map(b => [fmt.hz(b.f), b.rt60 != null ? fmt.s(b.rt60) : 'Not reliable']);
      const res = tableIn(W.get('results').view(ctx()).body, 3).map(r => [r[0], r[3]]);
      const proc = tableIn(W.get('processing').view(ctx()).body, 6).map(r => [r[0], r[6]]);
      check('8 Results: the band table still lists all six bands, each with its own RT60 (1000 Hz included), next to the average',
        json(res) === json(want), res.map(r => r.join(' ')).join(' · '));
      check('8 Processing: the "Band by band" table still lists all six bands with their own RT60', json(proc) === json(want), proc.map(r => r.join(' ')).join(' · '));
      check('8 Showing the average changes nothing in the stored result', json(p.processing.result) === before, 'unchanged');
    }

    /* ===== 7. the same average everywhere ===== */
    status('Every screen…');
    async function everywhere(label, res) {
      const avg = D.averageRT60(S.state.project), v2 = avg.value.toFixed(2), vs = fmt.s(avg.value);
      const pp = S.state.project, out = {};
      const resultsHtml = W.get('results').view(ctx()).body;
      out.resultsHero = (resultsHtml.match(/class="hero-v"[^>]*>([\d.]+)<small>/) || [])[1];
      out.resultsSummary = (resultsHtml.match(/class="avg-v">([\d.]+)<small>/) || [])[1];
      out.processing = (W.get('processing').view(ctx()).body.match(/class="avg-v">([\d.]+)<small>/) || [])[1];
      out.measure = (W.get('measure').view(ctx()).body.match(/class="stat-v">([\d.]+)<small>s<\/small><\/span><span class="muted">Average RT60, 500–2000 Hz/) || [])[1];
      S.state.current = 'results'; AM.app.render();
      const fv = document.querySelector('#app [data-watch="fact-measured"] .fact-v');
      out.topBar = fv ? fv.textContent.trim() : null;
      out.home = pairs(ui.projectCard(D.summary(pp)), '.pc-stat', '.pc-k', '.pc-v')['Avg RT60'] || null;
      out.history = (textOf(ui.historyList([D.summary(pp)], pp.id)).match(/RT60 ([\d.]+ s) average 500–2000 Hz/) || [])[1];
      out.assessment = (textOf(W.get('assessment').view(ctx()).body).match(/average RT60 at 500–2000 Hz is ([\d.]+ s)/) || [])[1];
      out.explain = (AM.services.explain.forStage('results', pp).paragraphs[0].match(/the room takes ([\d.]+ s)/) || [])[1];
      const M = AM.report.model(pp);
      const shown = [out.resultsHero, out.resultsSummary, out.processing, out.measure].every(x => x === v2) && [out.topBar, out.home, out.history, out.assessment, out.explain].every(x => x === vs);
      check(`7 ${label}: Results (headline and summary), Processing, the Current measurement card, the top bar, Home, Measurement History, Assessment and the explanation all show ${vs}`,
        shown, Object.entries(out).map(([k, x]) => `${k} ${x}`).join(' · '));
      const exact = [RA.of(res).value, D.averageRT60(pp).value, M.measurement.average.value, D.summary(pp).average];
      check(`7 ${label}: before rounding, the service, AM.derive, the report model and the project summary hold exactly the same value, from the same measurement`,
        exact.every(x => x === exact[0]) && close(exact[0], manual(res)) && M.measurement.average.recordingId === res.recordingId && D.averageRT60(pp).recordingId === res.recordingId,
        `${exact.join(' / ')} (summed here: ${manual(res)})`);
      let pdf = null, err = '';
      try { pdf = await AM.report.build(pp); } catch (e) { err = e.message; }
      const raw = pdf && pdf.bytes ? Array.from(pdf.bytes, c => String.fromCharCode(c)).join('') : '';
      const txt = [...raw.matchAll(/<([0-9A-F]+)> Tj/g)].map(m => m[1].replace(/../g, h => String.fromCharCode(parseInt(h, 16)))).join(' ').replace(/\s+/g, ' ');
      const row = `${vs} (500`, said = AM.report.summary(M).join(' ');
      check(`7 ${label}: the PDF shows the same average: the key figure "AVERAGE RT60 · 500–2000 Hz" ${vs} (mean of 500, 1000, 2000 Hz), the row "Average RT60 ${vs} (500–2000 Hz)" in the measurement section, and every band value; the comparison boxes say 1000 Hz; the summary assesses at 1000 Hz`,
        raw.length > 1000 && txt.includes('AVERAGE RT60') && txt.includes('Mean of 500, 1000, 2000 Hz') && txt.includes('Average RT60') && txt.includes(row)
          && res.bands.filter(b => b.rt60 != null).every(b => txt.includes(fmt.s(b.rt60))) && txt.includes(`MEASURED VS TARGET · ${res.referenceBand} Hz`)
          && said.includes(`At ${res.referenceBand} Hz the room measures ${fmt.s(res.headline.rt60)}`) && ![...(pdf.doc.unsupported || [])].length,
        pdf ? `${pdf.bytes.length} bytes, ${pdf.doc.pages.length} page(s); unsupported characters: ${[...(pdf.doc.unsupported || [])].join(' ') || 'none'}` : err);
      return out;
    }
    await everywhere('Take A', resA);
    {
      const fin = pairs(W.get('final').view(ctx()).body, '.kv-r', 'dt', 'dd');
      const vs = fmt.s(avgA);
      check('7 Final Result (no treatment needed at 1000 Hz): the project record shows the average and, separately, the value at 1000 Hz',
        fin['Average RT60'] === `${vs}500–2000 Hz` && fin['Measured at 1000 Hz'] === `${fmt.s(r1k)} · ${resA.headline.method}`,
        `Average RT60: ${fin['Average RT60']} · Measured at 1000 Hz: ${fin['Measured at 1000 Hz']}`);
      // Final Result promises a one-page report when no treatment is needed. The average takes no extra line: with up to
      // three short notes the report stayed on one page before the average was added, and must still.
      const M0 = AM.report.model(p), note = { kind: 'warn', text: '125 Hz not reliable: Only 21 dB of the room\'s own decay above the noise floor. T20 needs 35 dB.' };
      const pages = [0, 1, 2, 3].map(n => AM.report.make(Object.assign({}, M0, { measurement: Object.assign({}, M0.measurement, { notes: Array(n).fill(note) }) }), null).pages.length);
      check('7 The report with no treatment stays on one page, as Final Result says, with 0 to 3 notes (the average adds no line)', M0.none && pages.every(n => n === 1), `pages with 0, 1, 2, 3 notes: ${pages.join(', ')}`);
    }

    /* ===== 9. assessment and prediction keep the band values ===== */
    status('Assessment and prediction…');
    {
      const a = D.assessment(p);
      check('9 The assessment compares the 1000 Hz value with the target (set at 1000 Hz), not the average: here 1000 Hz is within the range and the average is not, and the status follows 1000 Hz',
        a.f === 1000 && a.rt === r1k && a.rt !== avgA && close(a.diff, r1k - tgt.preferred) && a.status === A.classify(r1k, p.target) && A.classify(avgA, p.target) !== a.status,
        `1000 Hz ${a.rt} s → ${a.status}; the average ${avgA.toFixed(3)} s would be ${A.classify(avgA, p.target)}`);
      check('9 The assessment\'s band table compares each band\'s own RT60', json(a.bands.map(b => b.rt)) === json(resA.bands.map(b => b.rt60)), a.bands.map(b => `${b.f}: ${b.rt}`).join(', '));
      const CAT = AM.services.catalog;
      const product = CAT.getProducts().find(q => q.size.options.some(o => o.areaM2 > 0) && CAT.getAcousticConfigurations(q.id).some(c => !CAT.getOctaveAbsorption(c.id, B).missing.length));
      const cfg = CAT.getAcousticConfigurations(product.id).find(c => !CAT.getOctaveAbsorption(c.id, B).missing.length);
      const sizeIndex = product.size.options.findIndex(o => o.areaM2 > 0);
      S.set('treatment', { items: [{ id: 't1', productId: product.id, configurationId: cfg.id, size: String(sizeIndex), quantity: 6, placement: 'Walls' }], active: 't1' });
      const pred = D.prediction(p), V = A.geometry(p.room).V;
      check('9 The prediction starts from each band\'s measured RT60 (never the average): every band\'s "measured" is that band\'s value; at 1000 Hz A₀ = 0.161 V ÷ the 1000 Hz RT60',
        pred && json(pred.bands.map(b => b.measured)) === json(resA.bands.map(b => b.rt60)) && pred.headline.f === 1000 && pred.headline.measured === r1k && close(pred.headline.existingA, A.absorptionFromRT(V, r1k), 1e-9),
        pred ? `measured ${pred.bands.map(b => b.measured).join(', ')}; A₀ at 1000 Hz ${pred.headline.existingA.toFixed(3)} m²; predicted ${pred.headline.predicted.toFixed(3)} s` : 'no prediction');
      const tf = D.treatmentForTarget(p), P = AM.services.prediction, item = D.treatmentSelection(p);
      const cov = D.coveredBy(p, item) ? D.coveredBy(p, item).alpha : null;
      const direct = P.areaFor({ V, bands: resA.bands, alpha: item.alpha, referenceBand: 1000, targetRT: p.target.preferred, addedA: 0, coveredAlpha: cov });
      // The target is the 1000 Hz value itself, so nothing is needed there; the average, if it were used, would ask for some.
      const fromAvg = P.areaFor({ V, bands: [{ f: 1000, rt60: avgA }], alpha: item.alpha, referenceBand: 1000, targetRT: p.target.preferred, addedA: 0, coveredAlpha: cov });
      check('9 The amount of treatment for the target is worked out at 1000 Hz from the band value, as before (not from the average)',
        tf && close(tf.areaM2, direct, 1e-9) && (avgA <= r1k || Math.abs(fromAvg - tf.areaM2) > 0.01), tf ? `${tf.areaM2.toFixed(3)} m² at 1000 Hz; from the average it would be ${fromAvg.toFixed(3)} m²` : 'none');
      S.set('treatment', { items: [], active: null });
    }

    /* ===== 10. a new measurement replaces the summary ===== */
    status('A new measurement (Processing, about 3 s)…');
    const takeB = take('avg-take-b', '2026-10-13T10:00:00.000Z', roomB, 22);
    {
      p.measurement.recording = copy(takeB);
      S.emit();
      S.go('processing');
      await until(() => p.processing.result && p.processing.result.recordingId === takeB.id, 'take B to become current');
      await sleep(150);
      const resB = p.processing.result, avgB = D.averageRT60(p), hist = p.processing.history || [];
      const mixed = (manual(resA) + manual(resB)) / 2; // what averaging over both takes would give
      check('10 Take B (a more reverberant room) processed by the Processing step becomes current; take A is kept as superseded',
        resB.valid && hist.length === 1 && hist[0].recordingId === takeA.id && hist[0].status === 'superseded', `current ${resB.recordingId}; superseded ${hist.map(h => h.recordingId).join(', ')}`);
      check('10 The average is take B\'s alone: from take B\'s bands, longer than take A\'s, and not a mix of both takes',
        avgB.recordingId === takeB.id && close(avgB.value, manual(resB)) && avgB.value > avgA + 0.2 && Math.abs(avgB.value - mixed) > 0.05,
        `A ${avgA.toFixed(3)} s → B ${avgB.value.toFixed(3)} s; both takes together would give ${mixed.toFixed(3)} s`);
      const out = await everywhere('After take B', resB);
      check('10 Every screen moved to take B\'s average (none still shows take A\'s)', Object.values(out).every(x => x !== avgA.toFixed(2) && x !== fmt.s(avgA)), Object.values(out).join(' · '));

      /* ===== 5. superseded measurements and invalid takes are not mixed in ===== */
      status('An invalid later take…');
      // Take C: the browser kept noise suppression on, so the processing gives no band a value (the take is not valid).
      const takeC = take('avg-take-c', '2026-10-13T11:00:00.000Z', roomA, 23, { settings: { noiseSuppression: true } });
      p.measurement.recording = copy(takeC);
      S.emit();
      S.go('processing');
      await until(() => p.processing.attempt && p.processing.attempt.recordingId === takeC.id, 'take C to be processed');
      await sleep(150);
      const after = D.averageRT60(p);
      check('5 A later take that is not valid does not change the average: take B stays current and its average stands; take C is only the latest attempt',
        p.processing.result.recordingId === takeB.id && after.recordingId === takeB.id && after.value === avgB.value && p.processing.attempt.result.valid === false, `still ${after.value.toFixed(3)} s from ${after.recordingId}`);
      const procAvg = (W.get('processing').view(ctx()).body.match(/class="avg-v[^"]*">([^<]+)</) || [])[1];
      check('5 The Processing step shows take C with no average ("Unavailable"), not take B\'s', procAvg === 'Unavailable', `Processing shows: ${procAvg}`);
      check('5 Superseded measurements keep only their own summary (no bands), so they cannot enter the average; the average equals the current measurement\'s own',
        (p.processing.history || []).every(h => !h.bands) && D.averageRT60(p).value === RA.of(p.processing.result).value && D.summary(p).average === avgB.value,
        `history: ${(p.processing.history || []).map(h => `${h.recordingId} ${h.status} ${h.rt60} s at 1000 Hz`).join(', ')}`);
    }

    status('Done');
    document.title = `${results.filter(t => t.ok).length}/${results.length} passed`;
    return results;
  }

  window.RT60_AVERAGE_DONE = run().catch(e => { check('The test ran to the end', false, `${e.message}\n${e.stack || ''}`); status('Error'); document.title = 'error'; return results; });
})();
