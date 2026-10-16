/* End-to-end test of the sweep level, in the whole application with a virtual device (tests/virtual-room.js).
   Development only. Results on tests/sweep-level.html and in window.SWEEP_LEVEL_TEST (window.SWEEP_LEVEL_DONE resolves).

   1. a new project, room and target filled in, microphone allowed, background measured
   2. a take at the default level, processed by the Processing step
   3. + pressed through the Measure step's own action (twice: the second must stay at the top), a take at +3 dB, processed
   4. what is stored and shown: each take's level, the played peak, the recorded level 3 dB higher (the gain once, the
      recording not scaled), RT60 agreeing between levels, the earlier take kept and listed, the report model
   5. reset and − to the bottom through the actions */
(function () {
  'use strict';
  const results = window.SWEEP_LEVEL_TEST = [];
  const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) }); show(); };
  const status = t => { const el = document.getElementById('sl-status'); if (el) el.textContent = t; };
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  function show() {
    const el = document.getElementById('sl-out');
    if (el) el.innerHTML = results.map(t => `<li class="${t.ok ? 'ok' : 'bad'}"><b>${t.ok ? 'PASS' : 'FAIL'}</b> ${esc(t.name)}<br><small>${esc(t.detail)}</small></li>`).join('');
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function until(fn, what, ms = 40000) {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(200); }
    throw new Error(`Timed out waiting for ${what}`);
  }
  const html = (id, p) => { const S = AM.store; return AM.workflow.get(id).view({ project: p, state: S.state }).body; };
  const text = h => { const d = document.createElement('div'); d.innerHTML = h; return d.textContent.replace(/\s+/g, ' '); };

  async function take(p, label) {
    const S = AM.store, before = p.measurement.recording && p.measurement.recording.id;
    S.go('measure');
    await sleep(300);
    AM.live.measureRT60(p);
    status(`${label}: recording (10 s)…`);
    await until(() => !AM.live.state.take && p.measurement.recording && p.measurement.recording.id !== before, `the ${label} take`);
    const rec = p.measurement.recording;
    status(`${label}: processing…`);
    S.advance(); // as "Process recording" does: Measure → Processing, which processes the take
    await until(() => (p.processing.result && p.processing.result.recordingId === rec.id) || (p.processing.attempt && p.processing.attempt.recordingId === rec.id), `processing of the ${label} take`);
    await sleep(400);
    return rec;
  }

  async function run() {
    await window.HARNESS_READY;
    await until(() => AM.store && AM.store.state && AM.live, 'the app');
    const S = AM.store, W = AM.workflow, AN = AM.analysis, D = AM.derive;
    Object.assign(window.VR, { rt: [0.62, 0.50, 0.40, 0.32, 0.30, 0.28], directDb: 28, noiseDbfs: -65, speakerDbfs: -24 });
    if (window.VR.room) window.VR.rebuild();

    // 1. Project, setup, background.
    S.startProject('new');
    S.autofillTo('setup');
    const p = S.state.project;
    check('A new project starts at the default sweep level', p.setup.sweepLevelDb === 0, `setup.sweepLevelDb = ${p.setup.sweepLevelDb}`);
    W.get('setup').demoFill(p);
    status('Microphone…');
    await AM.live.requestAccess(p);
    await until(() => p.setup.permission === 'granted', 'microphone access');
    status('Background (5 s)…');
    AM.live.measureNoise(p);
    await until(() => p.setup.noise && !AM.live.state.noise, 'the background measurement');
    S.autofillTo('measure');
    const m0 = text(html('measure', p));
    check('Measure shows the control at the default: 0 dB, "Default", − and + available',
      /Sweep level/.test(m0) && /Default/.test(m0) && !/Reset to default/.test(m0) && /peak 3\.1 dB below max/.test(m0), m0.slice(m0.indexOf('Sweep level'), m0.indexOf('Sweep level') + 240));
    check('Measure says every level in plain words: no dBFS and no noise floor on the screen', !/dBFS|noise floor/i.test(m0) && /dB below max/.test(m0), (m0.match(/.{0,60}(dBFS|noise floor).{0,60}/i) || ['none'])[0]);

    // 2. A take at the default level.
    const rec0 = await take(p, '0 dB');
    const r0 = p.processing.result;
    check('Take at 0 dB: level and played peak saved with it', rec0.plan.levelDb === 0 && Math.abs(rec0.plan.playedPeakDbfs + 3.1) <= 0.1 && r0 && r0.meta.plan.levelDb === 0,
      `take.plan.levelDb ${rec0.plan.levelDb}, played peak ${rec0.plan.playedPeakDbfs} dBFS, result valid ${!!(r0 && r0.valid)}`);

    // 3. + through the Measure step's own action, twice: it stops at the top.
    const act = W.get('measure').actions;
    act.sweepLevel({ project: p, state: S.state }, '1');
    const once = p.setup.sweepLevelDb;
    act.sweepLevel({ project: p, state: S.state }, '1');
    const m3 = html('measure', p), t3 = text(m3);
    check('+ raises the level to +3 dB and stops there; + is then disabled and the limit is explained',
      once === 3 && p.setup.sweepLevelDb === 3 && /id="sweep-level-inc"[^>]*disabled/.test(m3) && /Above default/.test(t3) && /highest level/.test(t3) && /Reset to default/.test(t3),
      `after one press ${once} dB, after two ${p.setup.sweepLevelDb} dB`);
    const rec3 = await take(p, '+3 dB');
    const r3 = p.processing.result;
    const lift = rec3.levels.sweepDbfs - rec0.levels.sweepDbfs;
    check('Take at +3 dB: level and played peak saved; the recorded sweep is 3 dB louder (the gain applied once, the recording not scaled)',
      rec3.plan.levelDb === 3 && Math.abs(rec3.plan.playedPeakDbfs + 0.1) <= 0.1 && Math.abs(lift - 3) <= 0.3,
      `played peak ${rec3.plan.playedPeakDbfs} dBFS; recorded sweep ${rec0.levels.sweepDbfs} → ${rec3.levels.sweepDbfs} dBFS (${lift.toFixed(2)} dB)`);
    const ref0 = r0.bands.find(b => b.f === 1000), ref3 = r3 && r3.bands.find(b => b.f === 1000);
    check('RT60 at 1000 Hz agrees between the two levels (within 3 %); usable decay rises',
      r3 && r3.valid && Math.abs(r3.headline.rt60 / r0.headline.rt60 - 1) <= 0.03 && ref3.decayRangeDb > ref0.decayRangeDb,
      r3 ? `${r0.headline.rt60} s (${r0.headline.method}, ${ref0.decayRangeDb} dB) → ${r3.headline.rt60} s (${r3.headline.method}, ${ref3.decayRangeDb} dB)` : 'no result');

    // 4. Nothing overwritten: the 0 dB measurement is kept and listed with its level.
    const hist = p.processing.history || [], cmp = D.takeComparison(p);
    check('The earlier take is kept, with its level, usable decay and RT60 (not overwritten)',
      r3.meta.plan.levelDb === 3 && hist.length === 1 && hist[0].levelDb === 0 && hist[0].recordingId === rec0.id && hist[0].rt60 === r0.headline.rt60 && hist[0].decayDb === ref0.decayRangeDb,
      JSON.stringify(hist[0]));
    check('The comparison lists both takes, newest first, each with its level',
      cmp.rows.length === 2 && cmp.rows[0].status === 'current' && cmp.rows[0].levelDb === 3 && cmp.rows[1].status === 'superseded' && cmp.rows[1].levelDb === 0,
      cmp.rows.map(r => `${r.status} ${r.levelDb} dB ${r.rt60} s`).join(' · '));
    const res = text(html('results', p));
    check('Results show the level in the record and both takes in "Takes in this project"',
      /Sweep level\s*\+3 dB/.test(res) && /Takes in this project/.test(res) && /\+3 dB/.test(res) && /0 dB \(default\)/.test(res) && /Replaced/.test(res),
      res.slice(res.indexOf('Takes in this project'), res.indexOf('Takes in this project') + 260));
    const meas = text(html('measure', p));
    check('Measure shows the level of the latest take and of the current measurement', /Sweep level\s*\+3 dB/.test(meas) && /sweep level \+3 dB/.test(meas), meas.slice(meas.indexOf('Latest take'), meas.indexOf('Latest take') + 200));
    const M = AM.report.model(p);
    check('The report model carries the level of the measurement it reports', M.measurement && M.measurement.meta.plan.levelDb === 3, `report measurement level ${M.measurement && M.measurement.meta.plan.levelDb}`);
    let pdfOk = false, pdfErr = '';
    try { const out = await AM.report.build(p); pdfOk = out.bytes && out.bytes.length > 1000; } catch (e) { pdfErr = e.message; }
    check('The PDF report still builds', pdfOk, pdfOk ? 'built' : pdfErr);

    // 5. Reset, then − to the bottom.
    act.sweepLevelReset({ project: p, state: S.state });
    const afterReset = p.setup.sweepLevelDb;
    for (let i = 0; i < 6; i++) act.sweepLevel({ project: p, state: S.state }, '-1');
    const mb = html('measure', p);
    check('Reset returns to 0 dB; − stops at −12 dB, is then disabled and the limit is explained',
      afterReset === 0 && p.setup.sweepLevelDb === -12 && /id="sweep-level-dec"[^>]*disabled/.test(mb) && /lowest level/.test(text(mb)) && /Below default/.test(text(mb)),
      `after reset ${afterReset} dB, after six presses ${p.setup.sweepLevelDb} dB`);
    act.sweepLevelReset({ project: p, state: S.state });
    status('Done');
    document.title = `${results.filter(t => t.ok).length}/${results.length} passed`;
    return results;
  }

  window.SWEEP_LEVEL_DONE = new Promise(resolve => {
    const start = () => run().then(resolve, e => { check('The test ran to the end', false, e.message); status('Error'); document.title = 'error'; resolve(results); });
    document.getElementById('sl-run').addEventListener('click', start, { once: true });
  });
})();
