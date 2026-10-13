/* Tests of the average RT60 across measured frequency bands (AM.services.rt60Average) and of every place that shows it,
   in the whole application (tests/rt60-average.html). Development only. Results on the page and in
   window.RT60_AVERAGE_TEST (window.RT60_AVERAGE_DONE resolves).

   Expected values are worked out by hand in the comments from fixed band values. For real takes (synthetic recordings of
   known rooms, tests/fixtures.js, through the production analysis and processing) the expected average is summed here
   from the result's own band values, without the service.

    1 all six bands eligible
    2 bands insufficient, not reliable or not measured are left out
    3 missing, zero, negative, NaN, infinite and text values; a band without a path; a band with T20 but no RT60
    4 no eligible bands, an invalid result, no result: "Unavailable", never 0 or NaN
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
      // 0.62 + 0.55 + 0.50 + 0.48 + 0.45 + 0.40 = 3.00; 3.00 ÷ 6 = 0.500 s
      const r = result(B.map((f, i) => band(f, [0.62, 0.55, 0.50, 0.48, 0.45, 0.40][i])));
      const a = RA.of(r);
      check('1 All six bands with a value: (0.62 + 0.55 + 0.50 + 0.48 + 0.45 + 0.40) ÷ 6 = 0.500 s, six included, none left out',
        a.available && a.n === 6 && a.total === 6 && close(a.value, 0.5) && !a.excluded.length && json(a.included.map(b => b.f)) === json(B), `${a.value} s, ${a.n} of ${a.total}`);
    }

    /* ===== 2. bands without a reliable value ===== */
    {
      // As in the screenshot: 125 Hz not reliable; 250 Hz T20 0.504 (shown 0.50), 500 Hz 0.358 (0.36), 1000 Hz 0.274
      // (0.27), 2000 Hz 0.276 (0.28), 4000 Hz 0.293 (0.29). (0.504 + 0.358 + 0.274 + 0.276 + 0.293) = 1.705; ÷ 5 = 0.341 s.
      const r = result([band(125, null), band(250, 0.504, { path: 'T20', t20: 0.504, t30: null, quality: 'Fair' }), band(500, 0.358), band(1000, 0.274), band(2000, 0.276, { quality: 'Fair' }), band(4000, 0.293, { quality: 'Fair' })]);
      const a = RA.of(r);
      check('2 125 Hz "Not reliable" (Insufficient) is left out, not counted as 0: (0.504 + 0.358 + 0.274 + 0.276 + 0.293) ÷ 5 = 0.341 s, shown 0.34 s',
        a.available && a.n === 5 && a.total === 6 && close(a.value, 0.341, 1e-12) && fmt.s(a.value) === '0.34 s' && a.excluded.length === 1 && a.excluded[0].f === 125 && a.excluded[0].reason === `Not reliable: ${NR}`,
        `${a.value} s; excluded ${a.excluded.map(b => `${b.f} (${b.reason})`).join(', ')}`);
      // Two left out: 125 Hz insufficient, 4000 Hz not measured. 0.55 + 0.50 + 0.48 + 0.45 = 1.98; ÷ 4 = 0.495 s
      const r2 = result([band(125, null), band(250, 0.55), band(500, 0.50), band(1000, 0.48), band(2000, 0.45), band(4000, null, { quality: 'Not measured', reason: null })]);
      const a2 = RA.of(r2);
      check('2 Two bands without a value (125 Hz insufficient, 4000 Hz not measured): (0.55 + 0.50 + 0.48 + 0.45) ÷ 4 = 0.495 s; each left out with its reason',
        a2.n === 4 && close(a2.value, 0.495) && json(a2.excluded.map(b => [b.f, b.reason.split(':')[0]])) === json([[125, 'Not reliable'], [4000, 'Not measured']]), `${a2.value} s; ${a2.excluded.map(b => `${b.f}: ${b.reason.split(':')[0]}`).join(', ')}`);
    }

    /* ===== 3. values that are not a band RT60 ===== */
    {
      // Only 1000 Hz (0.50) is a value: missing, 0, negative, NaN and infinite are left out. Counted as 0 they would
      // give 0.5 ÷ 6 = 0.083 s.
      const r = result([band(125, null), band(250, 0), band(500, -0.3), band(1000, 0.5), band(2000, NaN), band(4000, Infinity)]);
      const a = RA.of(r);
      check('3 Missing, 0, negative, NaN and infinite values are left out, not counted as 0: only 1000 Hz (0.50 s) is averaged, 0.500 s (not 0.083 s)',
        a.n === 1 && close(a.value, 0.5) && json(a.excluded.map(b => b.f)) === json([125, 250, 500, 2000, 4000]) && Number.isFinite(a.value), `${a.value} s; excluded ${a.excluded.map(b => b.f).join(', ')}`);
      // 125 Hz a value but no path; 250 Hz the value as text; 500 Hz T20 0.41 but no RT60 (the band's own verdict);
      // 2000 Hz no rt60 at all. Averaged: 1000 Hz T20 0.45 and 4000 Hz T30 0.55 → 0.500 s, each with its own path.
      const r2 = result([band(125, 0.6, { path: null }), band(250, '0.5'), band(500, null, { t20: 0.41 }), band(1000, 0.45, { path: 'T20', t20: 0.45, t30: null, quality: 'Fair' }), { f: 2000, quality: 'Good', path: 'T30' }, band(4000, 0.55)]);
      const a2 = RA.of(r2);
      check('3 A value without a calculation path, a value as text, and a band with a T20 but no RT60 are left out: no band changes path to be counted (1000 Hz stays T20, 4000 Hz T30); (0.45 + 0.55) ÷ 2 = 0.500 s',
        a2.n === 2 && close(a2.value, 0.5) && json(a2.included.map(b => [b.f, b.path])) === json([[1000, 'T20'], [4000, 'T30']]) && a2.excluded.length === 4, `included ${a2.included.map(b => `${b.f} ${b.path} ${b.rt60}`).join(', ')}`);
    }

    /* ===== 4. nothing to average ===== */
    {
      const none = RA.of(result(B.map(f => band(f, null))));
      const invalid = RA.of(result(B.map(f => band(f, 0.5)), { valid: false, status: 'invalid' }));
      const missing = RA.of(null);
      const html = [none, invalid, missing].map(ui.averageSummary).join(''), txt = textOf(html);
      check('4 No band with a value, a take that is not valid, and no measurement: no average (value null), with the reason; nothing averaged from an invalid take',
        [none, invalid, missing].every(a => !a.available && a.value === null && a.n === 0 && a.reason) && invalid.excluded.every(b => b.reason === 'Take not valid') && !invalid.included.length,
        [none, invalid, missing].map(a => a.reason).join(' · '));
      check('4 The summary then says "Unavailable" with the reason, never 0, 0.00 or NaN',
        (txt.match(/Unavailable/g) || []).length === 3 && !/NaN|0\.00|Infinity|undefined/.test(txt), txt.slice(0, 200));
    }

    /* ===== 6. unrounded values ===== */
    {
      // 0.304 × 4 + 0.314 = 1.530; ÷ 5 = 0.306 → shown 0.31 s. Averaging the values as shown (0.30 × 4 + 0.31 = 1.51;
      // ÷ 5 = 0.302) would show 0.30 s.
      const r = result([band(125, null), band(250, 0.304), band(500, 0.304), band(1000, 0.304), band(2000, 0.304), band(4000, 0.314)]);
      const a = RA.of(r), shownMean = a.included.reduce((s, b) => s + Number(b.rt60.toFixed(2)), 0) / a.n;
      const html = ui.averageSummary(a);
      check('6 The stored band values are averaged, not the values as shown: 1.530 ÷ 5 = 0.306 s (kept unrounded) → 0.31 s on screen, where the shown values would give 0.302 → 0.30 s',
        close(a.value, 0.306) && a.value !== Number(a.value.toFixed(2)) && fmt.s(a.value) === '0.31 s' && shownMean.toFixed(2) === '0.30' && /class="avg-v">0\.31<small>/.test(html) && html.includes('÷ 5 = 0.306 s'),
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
    const manual = r => { const v = r.bands.filter(b => typeof b.rt60 === 'number' && b.rt60 > 0).map(b => b.rt60); return v.reduce((s, x) => s + x, 0) / v.length; };
    const roomA = [0.62, 0.55, 0.5, 0.45, 0.42, 0.38], roomB = [1.1, 1.0, 0.95, 0.9, 0.85, 0.8];
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
    check('Take A (room 0.62 … 0.38 s) is valid through the production analysis, with an average that differs from its 1000 Hz value',
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
      out.measure = (W.get('measure').view(ctx()).body.match(/class="stat-v">([\d.]+)<small>s<\/small><\/span><span class="muted">Average RT60 across measured bands/) || [])[1];
      S.state.current = 'results'; AM.app.render();
      const fv = document.querySelector('#app [data-watch="fact-measured"] .fact-v');
      out.topBar = fv ? fv.textContent.trim() : null;
      out.home = pairs(ui.projectCard(D.summary(pp)), '.pc-stat', '.pc-k', '.pc-v')['Avg RT60'] || null;
      out.history = (textOf(ui.historyList([D.summary(pp)], pp.id)).match(/RT60 ([\d.]+ s) average of (\d) bands/) || [])[1];
      out.assessment = (textOf(W.get('assessment').view(ctx()).body).match(/average RT60 across the measured bands is ([\d.]+ s)/) || [])[1];
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
      const row = `${vs}, mean of ${avg.n} of ${avg.total} bands`, said = AM.report.summary(M).join(' ');
      check(`7 ${label}: the PDF shows the same average: the key figure "AVERAGE RT60 · MEASURED BANDS" ${vs} (mean of ${avg.n} of ${avg.total} octave bands), the row "Average RT60 ${row}" in the measurement section, and every band value; the comparison boxes say 1000 Hz; the summary assesses at 1000 Hz`,
        raw.length > 1000 && txt.includes('AVERAGE RT60 · MEASURED BANDS') && txt.includes(`Mean of ${avg.n} of ${avg.total} octave bands`) && txt.includes('Average RT60') && txt.includes(row)
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
        fin['Average RT60'] === `${vs}across ${RA.of(resA).n} of 6 measured bands` && fin['Measured at 1000 Hz'] === `${fmt.s(r1k)} · ${resA.headline.method}`,
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
      const mixed = manual({ bands: resA.bands.concat(resB.bands) });
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
