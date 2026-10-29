/* Audio configuration, noise floor and recording integrity (tests/audio-config.html). Development only.
   Results on the page and in window.AUDIO_CONFIG_TEST (window.AUDIO_CONFIG_A_DONE / _B_DONE resolve).

   Part A, on open, deterministic synthetic audio (tests/fixtures.js) through the app's own code:
     A1 noise floor: units (dBFS = 10·log10 mean square), the level in the RT60 bands, DC offset, quiet and noisy rooms,
        silence, clipping, invalid samples, a short buffer, a level change, the thresholds unchanged
     A2 takes: levels in the RT60 bands (a DC offset no longer fails a quiet room), dropped or inserted samples rejected
        (by their timing, and as a click: one 128-sample block anywhere from 0.9 to 4.5 s into the sweep), intact takes of
        several kinds never rejected and never showing a click (distortion folding back, a sound stopping abruptly
        included), no direct sound (timing check not made), gaps, invalid samples, an incomplete or clipped recording;
        the input turned down while the sweep plays (a fast compressor the background check cannot see)
     A3 processing: a gain or background change during the take, the input turned down during the sweep, the browser's
        own counts of lost audio (the output's read refresh by refresh), reported / unreported / on browser processing,
        the wording never claiming "off" for an unreported feature, threshold text rounding, a decay cut short by the
        end of the recording
     A4 the headline: the bands from 125 to 4000 Hz that have a value, a band left out named; none below half of them
     A5 device profiles and configuration: switching Laptop → Phone → Laptop through the Setup step's actions, readiness
        of the selected output, the configuration record, and the report using the take's configuration; Results naming a
        newer take it does not include (not processed, or rejected); the diagnostics record (no names or labels)
   Part B, button, the whole app with a virtual device (tests/virtual-room.js): permission denied, no device, access with
     the configuration read back, a take recorded with its configuration and the browser's own counts, a take during
     which the browser counts lost microphone frames (not valid), an output that ran dry before the sweep (not counted)
     and while it played (not valid), a phone take (three short tones, each checked, the clean ones averaged), then
     takes interrupted by a hidden page, a muted
     track and a disconnected microphone, none of which is analysed. Part B needs this tab in front: a hidden page
     interrupts every take, by design. */
(function () {
  'use strict';
  const results = window.AUDIO_CONFIG_TEST = [];
  const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) }); show(); };
  const status = t => { const el = document.getElementById('ac-status'); if (el) el.textContent = t; };
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  function show() {
    const el = document.getElementById('ac-out');
    if (el) el.innerHTML = results.map(t => `<li class="${t.ok ? 'ok' : 'bad'}"><b>${t.ok ? 'PASS' : 'FAIL'}</b> ${esc(t.name)}<br><small>${esc(t.detail)}</small></li>`).join('');
    document.title = `${results.filter(t => t.ok).length}/${results.length} passed`;
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function until(fn, what, ms = 30000) { const t0 = performance.now(); while (performance.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(50); } throw new Error(`Timed out waiting for ${what}`); }
  const near = (a, b, tol) => typeof a === 'number' && Math.abs(a - b) <= tol;
  const textOf = h => { const d = document.createElement('div'); d.innerHTML = h; return d.textContent.replace(/\s+/g, ' '); };
  const copy = o => JSON.parse(JSON.stringify(o));

  // Clear what an earlier run left under the harness's storage prefix.
  (function clean() {
    const P = 'vr-harness:';
    [localStorage, sessionStorage].forEach(st => { const keys = []; for (let i = 0; i < st.length; i++) { const k = st.key(i); if (k && k.startsWith(P)) keys.push(k.slice(P.length)); } keys.forEach(k => st.removeItem(k)); });
  })();

  /* ================================= Part A ================================= */
  async function partA() {
    await window.APP_READY;
    await until(() => AM.store && AM.store.state && AM.app && AM.services.rt60Average, 'the app');
    const AN = AM.analysis, DSP = AM.dsp, FIX = window.FIX, PROC = AM.services.processing, RA = AM.services.rt60Average, MEAS = AM.services.measurement;
    const S = AM.store, W = AM.workflow, D = AM.derive, ui = AM.ui, fs = 48000;

    /* ---------- A1 noise floor ---------- */
    status('A1 noise floor…');
    const n = Math.round(5.3 * fs), sum = (...xs) => { const y = new Float32Array(n); xs.forEach(x => { for (let i = 0; i < n; i++) y[i] += x[i]; }); return y; };
    const pink = (db, seed) => FIX.background(n, db, seed, 'pink'), white = (db, seed) => FIX.background(n, db, seed, 'white');
    // A gain that rises towards a −20 dBFS target at `rate` dB/s, up to +40 dB, and falls fast (an AGC on a quiet room).
    const agc = (x, rate) => { const fr = 480, y = new Float32Array(x.length); let g = 0; for (let a = 0; a < x.length; a += fr) { const b = Math.min(x.length, a + fr), lvl = DSP.dbOf(DSP.meanSquare(x, a, b)), want = Math.min(40, -20 - lvl); g = want < g ? Math.max(want, g - 2) : Math.min(want, g + rate * 0.01); const k = Math.pow(10, g / 20); for (let i = a; i < b; i++) y[i] = x[i] * k; } return y; };
    {
      // Units: white noise of RMS 0.01 is 10·log10(0.0001) = −40.0 dBFS unfiltered; a 1 kHz sine of amplitude 0.1 has a
      // mean square of 0.005: −23.0 dBFS, all of it inside the RT60 bands.
      const w = AN.analyseNoise(white(-40, 5), fs), sine = new Float32Array(n);
      for (let i = 0; i < n; i++) sine[i] = 0.1 * Math.sin(2 * Math.PI * 1000 * i / fs);
      const s = AN.analyseNoise(sine, fs);
      check('A1 Units: levels are dBFS = 10·log10(mean square): white noise of RMS 0.01 reads −40.0 dBFS; a 1 kHz sine of amplitude 0.1 reads −23.0 dBFS in the RT60 bands',
        w.unit === 'dBFS' && near(w.leqDbfs, -40, 0.2) && near(s.inBand.leqDbfs, -23, 0.2), `white ${w.leqDbfs} dBFS; sine in band ${s.inBand.leqDbfs} dBFS`);
      check('A1 The thresholds are unchanged (caution above −30 dBFS usual level, sounds 10 dB, change 6 dB, silence −110 dBFS)',
        AN.CRITERIA.noise.highDbfs === -30 && AN.CRITERIA.noise.soundDb === 10 && AN.CRITERIA.noise.changeDb === 6 && AN.CRITERIA.noise.silenceDbfs === -110, JSON.stringify(AN.CRITERIA.noise));
    }
    const quiet = sum(pink(-85, 1), white(-92, 2)); // a very quiet room and the microphone's own noise
    {
      const q = AN.analyseNoise(quiet, fs);
      const dcx = sum(quiet, new Float32Array(n).fill(0.01)), dc = AN.analyseNoise(dcx, fs);
      check('A1 A very quiet room is suitable, at about −87 dBFS in the RT60 bands', q.status === 'valid' && q.inBand.leqDbfs < -80, `${q.status}, ${q.inBand.leqDbfs} dBFS in band`);
      check('A1 The same quiet room with a DC offset of 0.01 (−40 dBFS): still suitable, the levels unchanged (the offset is removed, not counted as noise), and the offset reported',
        dc.status === 'valid' && near(dc.leqDbfs, q.leqDbfs, 0.5) && near(dc.inBand.leqDbfs, q.inBand.leqDbfs, 0.2) && near(dc.dcDbfs, -40, 0.2),
        `unfiltered ${dc.leqDbfs} dBFS (without offset ${q.leqDbfs}); in band ${dc.inBand.leqDbfs}; DC ${dc.dcDbfs} dBFS. Before this change the screen showed −40 dBFS for this room`);
      const proj = { setup: { noise: Object.assign({ takenAt: new Date().toISOString() }, dc), noiseAttempt: null, permission: 'granted' } };
      const card = textOf(ui.noiseBody(proj, { bands: false }));
      check('A1 The background card leads with the level in the RT60 bands, says it is relative and cannot tell the room from the microphone or its processing, and shows the DC offset',
        card.includes(`Recording noise level ${ui.dbfs(dc.inBand.leqDbfs)} in the RT60 bands`) && /cannot tell the room's noise from the microphone's own noise/.test(card) && /DC offset of the input/.test(card), card.slice(0, 220));
      // The same card in plain words: the levels as "dB below max", never as dBFS, sound pressure or a noise floor.
      const full = textOf(ui.noiseBody(proj));
      check('A1 The background card says its levels plainly (dB below max, not the room\'s real loudness), with no dBFS or noise floor, the band table included',
        full.includes(`${ui.dbfs(dc.inBand.leqDbfs)} in the RT60 bands`) && ui.dbfs(dc.inBand.leqDbfs) === `${Math.abs(dc.inBand.leqDbfs).toFixed(1)} dB below max` && /not the room's real loudness/.test(full)
          && /relative to max/.test(full) && !/dBFS|noise floor|SPL/i.test(full), full.slice(0, 220));
    }
    {
      const noisy = AN.analyseNoise(pink(-18, 4), fs);
      const wn = noisy.warnings.join(' ');
      check('A1 A genuinely noisy input (usual level above −30 dBFS in the RT60 bands): a caution, not a stop, that names both possible causes and what to do',
        noisy.status === 'warning' && /high/.test(wn) && /room noise, or a quiet room raised by a high input level or automatic gain/.test(wn) && /If the room is noisy, reduce the noise; if it is quiet, lower the input level/.test(wn), wn.slice(0, 240));
      const rising = AN.analyseNoise(agc(quiet, 6), fs), rw = rising.warnings.join(' ');
      check('A1 A quiet room under a rising automatic gain: a change caution that names the device as a possible cause, not only the room',
        rising.status === 'warning' && /automatic gain/.test(rw) && /ventilation/.test(rw), rw.slice(0, 240));
      const step = Float32Array.from(quiet); for (let i = Math.round(2.6 * fs); i < n; i++) step[i] *= 3.2;
      const st = AN.analyseNoise(step, fs);
      check('A1 An abrupt level change of +10 dB: a change caution', st.status === 'warning' && Math.abs(st.inBand.driftDb) > 6, `change ${st.inBand.driftDb} dB`);
    }
    {
      const silent = AN.analyseNoise(new Float32Array(n), fs);
      const gate = Float32Array.from(quiet).map(v => v * 1e-3); // a device that silences a quiet room
      const gated = AN.analyseNoise(gate, fs);
      check('A1 Digital silence (a muted microphone, or noise suppression silencing a quiet room): "unable to assess", both causes named, never a level or "the room is noisy"',
        silent.status === 'unassessed' && gated.status === 'unassessed' && /muted/.test(silent.warnings[0]) && /noise suppression silences a quiet room/.test(silent.warnings[0]), silent.warnings[0].slice(0, 200));
      const clip = Float32Array.from(quiet); for (let i = 50000; i < 50100; i++) clip[i] = 1;
      const nan = Float32Array.from(quiet); nan[100000] = NaN;
      const inf = Float32Array.from(quiet); inf[90000] = Infinity;
      const c = AN.analyseNoise(clip, fs), b = AN.analyseNoise(nan, fs), i2 = AN.analyseNoise(inf, fs), s = AN.analyseNoise(quiet.subarray(0, Math.round(0.9 * fs)), fs);
      check('A1 Clipping, NaN or Infinity in the buffer, and a buffer too short: each "measure again" with its reason; no NaN level is ever accepted',
        c.status === 'invalid' && /overloaded/.test(c.reasons[0]) && b.status === 'invalid' && /corrupted/.test(b.reasons[0]) && i2.status === 'invalid' && s.status === 'invalid' && /too short/.test(s.reasons[0]) && b.leqDbfs === null,
        [c.reasons[0], b.reasons[0], s.reasons[0]].map(t => t.slice(0, 60)).join(' | '));
    }

    /* ---------- A2 takes: levels and integrity ---------- */
    status('A2 takes…');
    const RT = [0.62, 0.55, 0.5, 0.45, 0.42, 0.38], DESK = [[0.0012, -3, 1], [0.0035, -9, -1]];
    const plans = {};
    const planFor = rate => plans[rate] || (plans[rate] = (() => { const plan = AN.sweepPlan(rate); return { plan, sweep: AN.makeSweep(plan) }; })());
    const irs = {};
    function recording(o = {}) {
      const rate = o.fs || fs, { plan, sweep } = planFor(rate), key = JSON.stringify([rate, o.direct, o.refl, o.hp, o.order, o.resonant]);
      let ir = irs[key];
      if (!ir) {
        ir = FIX.roomIR({ fs: rate, seconds: 2.5, rt: RT, seed: 21, directDb: o.direct === undefined ? 18 : o.direct, reflections: o.refl || [] });
        const secs = o.resonant ? [DSP.rbj('highpass', o.hp, rate, o.resonant)] : DSP.butterworthQ(o.order || 4).map(Q => DSP.rbj('highpass', o.hp || 250, rate, Q));
        ir = irs[key] = DSP.filter(ir, secs);
      }
      const played = o.play ? { signal: Float32Array.from(sweep.signal, o.play) } : sweep; // a nonlinearity before the converter
      let rec = FIX.recordSweep({ plan, sweep: played, ir, latency: 0.07, peakDbfs: o.level || -12, noiseDbfs: o.noise || -70, noiseKind: 'pink', seed: o.seed || 3 });
      if (o.dc) rec = rec.map(v => v + o.dc);
      if (o.splice != null) { // samples removed (n > 0) or repeated (n < 0) at `splice` s into the sweep, no zero fill
        const at = Math.round((plan.preRoll + 0.07 + o.splice) * rate), k = o.n || 128, y = new Float32Array(rec.length);
        if (k > 0) { y.set(rec.subarray(0, at)); y.set(rec.subarray(at + k), at); } else { y.set(rec.subarray(0, at)); y.set(rec.subarray(at + k, at), at); y.set(rec.subarray(at, rec.length + k), at - k); }
        rec = y;
      }
      if (o.post) rec = o.post(rec, rate, plan);
      return { rec, plan, sweep };
    }
    const analyse = o => { const { rec, plan, sweep } = recording(o); return AN.analyseTake(rec, plan, sweep); };
    const take = (o = {}, settings = {}, extra = {}) => {
      const { rec, plan, sweep } = recording(o), a = AN.analyseTake(rec, plan, sweep);
      return Object.assign({ id: `t${Math.random().toString(36).slice(2, 7)}`, takenAt: new Date().toISOString(), status: a.status === 'failed' ? 'failed' : 'captured', reason: a.reason, settings, sampleRate: plan.fs,
        plan: Object.assign({}, plan, { levelDb: 0 }), levels: a.levels, analysis: a, warnings: MEAS.processingWarnings(settings) }, extra);
    };
    {
      // A phone-like take (quiet sweep, −30 dBFS peak) in a quiet room through an input with a DC offset of 0.05.
      const o = { dc: 0.05, level: -30, noise: -80, hp: 700, direct: 30, refl: DESK };
      const { rec, plan } = recording(o), a = analyse(o);
      const old = DSP.dbOf(DSP.meanSquare(rec, Math.round((plan.preRoll + 0.07) * fs), Math.round((plan.preRoll + plan.seconds) * fs))) - DSP.dbOf(DSP.meanSquare(rec, Math.round(0.1 * fs), Math.round((plan.preRoll - 0.05) * fs)));
      check('A2 A DC offset no longer fails a quiet room: the sweep\'s level above the background is read in the RT60 bands (the old unfiltered reading would have rejected this take as "test signal only N dB above the background")',
        a.status === 'captured' && a.levels.inBand === true && a.levels.snrDb >= AN.CRITERIA.take.minSweepSnrDb && old < AN.CRITERIA.take.minSweepSnrDb && near(a.levels.dcDbfs, -26, 0.3),
        `in band ${a.levels.snrDb} dB (old unfiltered ${old.toFixed(1)} dB); DC ${a.levels.dcDbfs} dBFS; ${a.status}`);
    }
    {
      const drops = [['256 samples removed at 2.6 s', { splice: 2.6, n: 256, refl: DESK }], ['480 samples removed at 3.1 s', { splice: 3.1, n: 480, refl: DESK }], ['256 samples repeated at 3.7 s', { splice: 3.7, n: -256, refl: DESK }],
        ['256 samples removed, phone-like', { splice: 2.2, n: 256, hp: 700, direct: 30, level: -24, refl: DESK }], ['256 samples removed at 44.1 kHz', { fs: 44100, splice: 3.0, n: 256, refl: DESK }]];
      // Rejected by whichever check sees it first: the click the loss leaves (above the sweep), or the step in the
      // sweep's timing.
      const got = drops.map(([k, o]) => { const a = analyse(o); return { k, ok: a.status === 'failed' && /not continuous|has a click/.test(a.reason || ''), t: a.timing, r: a.reason }; });
      check('A2 Samples dropped or repeated during the sweep, with no gap to see (256 or 480 samples, from about 1.8 s into the sweep): the take is rejected (for the click or the timing step), with the reason',
        got.every(g => g.ok), got.map(g => `${g.k}: ${g.ok ? `rejected (${/click/.test(g.r) ? 'click' : 'timing'})` : `NOT rejected (${(g.r || '').slice(0, 40)})`}`).join(' · '));
      const intact = [['laptop on a desk', { refl: DESK }], ['phone-like on a desk', { hp: 700, direct: 30, level: -24, refl: DESK }], ['steep 8th-order speaker high-pass at 400 Hz', { hp: 400, order: 8, refl: DESK }],
        ['resonant speaker (Q 3 at 900 Hz)', { hp: 900, resonant: 3, direct: 30, refl: DESK }], ['44.1 kHz', { fs: 44100, refl: DESK }], ['noisy background −55 dBFS', { noise: -55, refl: DESK }], ['another noise seed', { seed: 9, refl: DESK }]];
      const ok = intact.map(([k, o]) => { const a = analyse(o); return { k, ok: a.status === 'captured' && a.timing && a.timing.checked && a.timing.maxStepMs <= AN.CRITERIA.take.timing.maxStepMs && a.clicks && a.clicks.checked && !a.clicks.found.length, step: a.timing && a.timing.maxStepMs, w: a.clicks && a.clicks.worstDb }; });
      check(`A2 Intact takes of seven kinds are never rejected by the continuity checks (largest step ≤ ${AN.CRITERIA.take.timing.maxStepMs} ms; no click, every frame below the ${AN.CRITERIA.take.clicks.db} dB click level)`, ok.every(g => g.ok), ok.map(g => `${g.k}: ${g.step} ms, ${g.w} dB`).join(' · '));
      // Harmonics a digital limiter makes before the converter fold back below half the sample rate; a loud noise that
      // stops abruptly stands above one side only. Neither is a click.
      const A_ = AN.CRITERIA.take.amplitude, cubic = analyse({ refl: DESK, play: v => v - 4 * Math.pow(10, -30 / 20) / (A_ * A_) * v * v * v });
      const quad = analyse({ refl: DESK, play: v => v + 2 * Math.pow(10, -25 / 20) / A_ * v * v });
      const burst = (() => { const { rec, plan } = recording({ refl: DESK }), x = Float32Array.from(rec), nb = FIX.background(Math.round(plan.seconds * fs), -30, 74), s0 = Math.round(plan.preRoll * fs); for (let i = 0; i < nb.length; i++) x[s0 + i] += nb[i]; return AN.aboveSweep(x, plan, Math.round((plan.preRoll + 0.07) * fs)); })();
      check('A2 No click is read in a take with a 3rd harmonic at −30 dB or a 2nd at −25 dB made before the converter (folding back near the sweep\'s end), nor where a loud noise stops abruptly',
        cubic.status === 'captured' && !cubic.clicks.found.length && quad.status === 'captured' && !quad.clicks.found.length && !burst.clicks.found.length,
        `3rd: ${cubic.status} (${cubic.clicks.worstDb} dB) · 2nd: ${quad.status} (${quad.clicks.worstDb} dB) · noise stopping: ${burst.clicks.found.length} clicks`);
      // A playback chain that clips the sweep 3 dB (a digital clipper): harmonics fill the band above the sweep. No
      // false click, but a gap could hide among them, so the take says so and no band is High confidence.
      const OFF2 = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
      const clipped = take({ refl: DESK, play: v => Math.max(-0.5, Math.min(0.5, v)) }, OFF2), clipRes = PROC.evaluate(clipped, {});
      check('A2 A sweep clipped 3 dB in the playback chain: no false click, the band above the sweep reads as full of harmonics, and the result warns that a small gap could have passed unseen (no band High)',
        clipped.status === 'captured' && !clipped.analysis.clicks.found.length && clipped.analysis.clicks.fillDb >= AN.CRITERIA.take.clicks.coarseDb && clipRes.warnings.some(w => /heavily distorted/.test(w)) && clipRes.bands.every(b => b.confidence !== 'High'),
        `${clipped.status}; fill ${clipped.analysis.clicks.fillDb} dB; ${clipRes.warnings.join(' ').slice(0, 140)}`);
      const far = analyse({ direct: null });
      check('A2 A room without a dominant direct sound (a microphone far from the source): the continuity check is not made, and says so; the take is not rejected for it',
        far.status === 'captured' && far.timing && far.timing.checked === false && /direct sound/.test(far.timing.reason), far.timing && far.timing.reason);
      // One render block (128 samples, 2.7 ms) lost or repeated: too small a step for the timing check, but the waveform
      // jumps, and the click shows above the sweep (aboveSweep). Where it is not caught it does real damage: with the click
      // check switched off, the take at 2.7 s (repeated) read the 500–2000 Hz mean 76 % long and the six-band average (the
      // room's RT60 now) 36 % long; the bands it hits most read more than 50 % long.
      const at = [0.9, 2.3, 2.7, 3.9, 4.5], block = [];
      at.forEach(t => [128, -128].forEach(k => block.push([`${t} s ${k > 0 ? 'lost' : 'repeated'}`, { splice: t, n: k, refl: DESK }])));
      block.push(['4.5 s lost, quiet room', { splice: 4.5, n: 128, refl: DESK, noise: -85 }], ['2.5 s lost, phone-like', { splice: 2.5, n: 128, hp: 700, direct: 30, level: -24, refl: DESK }]);
      const caught = block.map(([k, o]) => { const a = analyse(o); return { k, ok: a.status === 'failed' && /has a click/.test(a.reason || ''), r: a.reason, db: a.clicks && a.clicks.found.length ? a.clicks.found[0].db : null }; });
      const saved = AN.CRITERIA.take.clicks.db;
      AN.CRITERIA.take.clicks.db = 999; // what the result would have been without the check
      let harm = null;
      try {
        const OFF = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
        const ref = PROC.evaluate(take({ refl: DESK }, OFF), {}), bad = PROC.evaluate(take({ splice: 2.7, n: -128, refl: DESK }, OFF), {});
        const av = r => RA.of(r).value;
        const worst = Math.max(...ref.bands.map(b => { const x = bad.bands.find(y => y.f === b.f); return b.rt60 && x && x.rt60 ? 100 * (x.rt60 / b.rt60 - 1) : -Infinity; }));
        harm = av(ref) && av(bad) ? { avg: 100 * (av(bad) / av(ref) - 1), worst } : null;
      } finally { AN.CRITERIA.take.clicks.db = saved; }
      check('A2 One render block (128 samples) lost or repeated at 0.9–4.5 s into the sweep, in a typical room, a quiet room and a phone-like take: each take rejected for the click it leaves, with the reason; uncaught, one of them read a band more than 50 % long and the six-band average more than 15 % long (T20: about 18 %; with T30 first it was about 36 %)',
        caught.every(g => g.ok) && harm != null && harm.worst > 50 && harm.avg > 15, `${caught.map(g => `${g.k}: ${g.ok ? `click ${g.db} dB` : `NOT rejected (${(g.r || 'captured').slice(0, 40)})`}`).join(' · ')} · uncaught at 2.7 s: ${harm == null ? 'no average' : `average +${harm.avg.toFixed(0)} %, worst band +${harm.worst.toFixed(0)} %`}`);
    }
    {
      const zero = analyse({ post: (x, rate, plan) => { const y = Float32Array.from(x); const at = Math.round((plan.preRoll + 2.5) * rate); y.fill(0, at, at + 256); return y; } });
      const nan = analyse({ post: x => { const y = Float32Array.from(x); y[200000] = NaN; return y; } });
      const short = analyse({ post: x => x.subarray(0, Math.round(x.length * 0.6)) });
      const clip = analyse({ level: 6 });
      check('A2 A zero-filled gap, an invalid sample, an incomplete recording and a clipped recording: each take rejected with its own reason',
        /gap/.test(zero.reason) && /corrupted/.test(nan.reason) && /incomplete/.test(short.reason) && /overloaded/.test(clip.reason), [zero.reason, nan.reason, short.reason, clip.reason].map(r => (r || '').slice(0, 45)).join(' | '));
    }
    {
      // A Bluetooth headset's low sample rate (8 and 11.025 kHz): the RT60 bands' upper edge lies above what the recording
      // holds. The levels must still be read: they came out NaN, and a test signal too quiet for the background then
      // passed its check unseen.
      const rows = [8000, 11025].map(fs => ({ fs, n: AN.analyseNoise(FIX.background(Math.round(5.5 * fs), -60, 5, 'pink'), fs), ok: analyse({ fs, refl: DESK }), quiet: analyse({ fs, refl: DESK, level: -62, noise: -65 }) }));
      check('A2 At 8 and 11.025 kHz (a Bluetooth headset): the background and the take\'s levels are numbers, a normal take is captured, and a test signal too quiet for the background is rejected with that reason',
        rows.every(r => Number.isFinite(r.n.inBand.leqDbfs) && Number.isFinite(r.ok.levels.preRollDbfs) && Number.isFinite(r.ok.levels.snrDb) && r.ok.status === 'captured' && r.quiet.status === 'failed' && /above the background at the microphone/.test(r.quiet.reason || '')),
        rows.map(r => `${r.fs / 1000} kHz: background ${r.n.inBand.leqDbfs} dBFS · take ${r.ok.status}, signal ${r.ok.levels.snrDb} dB above · quiet take: ${(r.quiet.reason || r.quiet.status).slice(0, 60)}`).join(' | '));
      // A click's reason names what was found in the field (sound effects or speaker protection) and what to do.
      const ck = analyse({ splice: 2.7, n: -128, refl: DESK });
      check('A2 A take rejected for a click says where such jumps come from (the device\'s sound effects or speaker protection, a dropped moment of audio, a tap) and what to do (sound effects off, the sweep level lower)',
        ck.status === 'failed' && /has a click/.test(ck.reason || '') && /sound effects or speaker protection/.test(ck.reason) && /lower the sweep level/.test(ck.reason), (ck.reason || '').slice(0, 160));
    }

    /* ---------- A3 processing decisions ---------- */
    status('A3 processing…');
    const allOff = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
    {
      // The gain moves smoothly within each 10 ms frame, as a real AGC's does: a gain that jumps at frame boundaries
      // puts a click in the recording at each jump, which the click check (rightly) rejects first.
      const post = rate => (x, r) => { const fr = 480, y = new Float32Array(x.length); let g = 0; for (let a = 0; a < x.length; a += fr) { const b = Math.min(x.length, a + fr), lvl = DSP.dbOf(DSP.meanSquare(x, a, b)), want = Math.min(25, -20 - lvl), g0 = g; g = want < g ? Math.max(want, g - 2) : Math.min(want, g + rate * 0.01); for (let i = a; i < b; i++) y[i] = x[i] * Math.pow(10, (g0 + (g - g0) * (i - a + 1) / (b - a)) / 20); } return y; };
      const unreported = PROC.evaluate(take({ post: post(6) }, {}), {}), reportedOff = PROC.evaluate(take({ post: post(6) }, allOff), {});
      check('A3 A gain that rises during the take (modelled AGC, 6 dB/s): not valid, no band value, and the reason names both causes and what the browser reported',
        !unreported.valid && unreported.bands.every(b => b.rt60 == null) && /louder after the test signal than before it, in every band/.test(unreported.reason) && /which this browser does not report/.test(unreported.reason) && /which this browser reports as off/.test(reportedOff.reason),
        `${unreported.meta.levelChangeDb} dB · ${unreported.reason.slice(0, 160)}`);
      // A fast compressor: the input turned down 10 dB (or 4 dB) from 50 ms into the sweep until 0.1 s after it, then
      // back. The background after the decay is read later, so the before/after check sees nothing; the level above
      // the sweep does.
      const duck = db => (x, rate, plan) => {
        const y = Float32Array.from(x), a = Math.round((plan.preRoll + 0.07 + 0.05) * rate), b = Math.round((plan.preRoll + 0.07 + plan.seconds + 0.1) * rate), k = Math.pow(10, db / 20), ramp = Math.round(0.02 * rate);
        for (let i = a - ramp; i < b + ramp; i++) { const w = Math.max(0, Math.min(1, i < a ? (i - (a - ramp)) / ramp : i >= b ? 1 - (i - b) / ramp : 1)); y[i] *= 1 + (k - 1) * w; }
        return y;
      };
      const d10 = PROC.evaluate(take({ refl: DESK, post: duck(-10) }, allOff), {}), d4 = PROC.evaluate(take({ refl: DESK, post: duck(-4) }, allOff), {});
      check('A3 The input turned down 10 dB only while the sweep plays (a fast compressor; the background before and after agree): the level above the sweep reads about −10 dB and the take is not valid, naming the device; 4 dB: valid with a warning, no band High',
        !d10.valid && Math.abs(d10.meta.sweepGainDb + 10) <= 1 && Math.abs(d10.meta.levelChangeDb || 0) < 3 && /turned its microphone input down/.test(d10.reason) && /reports as off, so the system or the device itself/.test(d10.reason)
          && d4.valid && Math.abs(d4.meta.sweepGainDb + 4) <= 1 && d4.warnings.some(w => /quieter than before it/.test(w)) && d4.bands.every(b => b.confidence !== 'High'),
        `−10 dB: ${d10.meta.sweepGainDb} dB above the sweep, ${d10.meta.levelChangeDb} dB after; ${(d10.reason || '').slice(0, 110)} · −4 dB: ${d4.meta.sweepGainDb} dB, ${d4.status}`);
      // The browser's own counts over the take (Chrome: MediaStreamTrack.stats, AudioContext.playbackStats).
      const MI = MEAS.integrityOf({ input: { total: 1000, delivered: 1000 }, output: { underruns: 2, underrunSec: 0.01 } }, { input: { total: 481000, delivered: 480988 } }, { output: { underruns: 2, underrunSec: 0.01 } });
      const lostTake = PROC.evaluate(take({ refl: DESK }, allOff, { integrity: { inputLostFrames: 12, outputUnderruns: 0, outputUnderrunMs: 0 } }), {});
      const dryTake = PROC.evaluate(take({ refl: DESK }, allOff, { integrity: { inputLostFrames: 0, outputUnderruns: 1, outputUnderrunMs: 3 } }), {});
      const cleanTake = PROC.evaluate(take({ refl: DESK }, allOff, { integrity: { inputLostFrames: 0, outputUnderruns: 0, outputUnderrunMs: 0 } }), {});
      const noCount = PROC.evaluate(take({ refl: DESK }, allOff, { integrity: { inputLostFrames: null, outputUnderruns: null, outputUnderrunMs: null } }), {});
      check('A3 The browser\'s own counts: 12 frames lost from 1000 → 481 000 captured with 480 988 delivered, and no new underrun; a take with lost frames or an output that ran dry is not valid with the reason; none counted, or a browser that keeps no count: valid',
        MI.inputLostFrames === 12 && MI.outputUnderruns === 0 && !lostTake.valid && /12 audio frames from the microphone were lost/.test(lostTake.reason) && !dryTake.valid && /ran dry 1 time/.test(dryTake.reason) && cleanTake.valid && noCount.valid,
        `${JSON.stringify(MI)} · ${(lostTake.reason || '').slice(0, 90)} · ${(dryTake.reason || '').slice(0, 60)}`);
      const steady = PROC.evaluate(take({ refl: DESK }, allOff), {});
      check('A3 A steady background: no level change found (within ±1 dB, after the sweep and above it while it plays), valid, and with every setting reported off 1000 Hz can be High confidence',
        steady.valid && Math.abs(steady.meta.levelChangeDb || 0) < 1 && Math.abs(steady.meta.sweepGainDb) < 1 && steady.bands.find(b => b.f === 1000).confidence === 'High', `change ${steady.meta.levelChangeDb} dB after, ${steady.meta.sweepGainDb} dB during; 1 kHz ${steady.bands.find(b => b.f === 1000).confidence}`);
      // +4 dB of background added after the sweep only: a small change, a warning.
      const bump = PROC.evaluate(take({ refl: DESK, post: (x, rate, plan) => { const y = Float32Array.from(x), extra = FIX.background(x.length, -70 + 2.2, 99, 'pink'); for (let i = Math.round((plan.preRoll + plan.seconds + 1.6) * rate); i < x.length; i++) y[i] += extra[i]; return y; } }, allOff), {});
      // About +8 dB of background from 1.6 s after the sweep (a machine switching on): not valid, and since the input level
      // stayed steady while the sweep played, the reason names the room as the likely cause.
      const step = PROC.evaluate(take({ refl: DESK, post: (x, rate, plan) => { const y = Float32Array.from(x), extra = FIX.background(x.length, -70 + 7.3, 98, 'pink'); for (let i = Math.round((plan.preRoll + plan.seconds + 1.6) * rate); i < x.length; i++) y[i] += extra[i]; return y; } }, allOff), {});
      check('A3 The room\'s background stepping up about 8 dB after the sweep: not valid, and with the input level steady during the sweep the reason says the room\'s background most likely changed',
        !step.valid && step.meta.levelChangeDb >= 6 && Math.abs(step.meta.sweepGainDb) < 1.5 && /most likely the room's background changed/.test(step.reason), `${step.meta.levelChangeDb} dB after, ${step.meta.sweepGainDb} dB during · ${(step.reason || '').slice(0, 200)}`);
      check('A3 A smaller change of the background (about +4 dB, every band): still valid, with a warning, so no band is High confidence',
        bump.valid && bump.warnings.some(w => /louder after the test signal/.test(w)) && bump.bands.every(b => b.confidence !== 'High'), `${bump.meta.levelChangeDb} dB · ${bump.warnings.join(' ').slice(0, 120)}`);

      // The output's counts arrive with the browser's refresh (about once a second): a loss counts only when the stretch
      // since the refresh before the one that shows it reaches into the test signal (here 1–6 s of the recording).
      const O = (at, u, t) => ({ at, output: { underruns: u, underrunSec: u * 0.003, totalSec: t } }), OL = MEAS.outputLoss;
      const early = OL([O(0, 0, 0), O(0.4, 1, 0.4), O(1.4, 1, 1.4), O(2.4, 1, 2.4), O(7.4, 1, 7.4)], 1, 6);
      const during = OL([O(0, 0, 0), O(2.4, 0, 2.4), O(3.4, 1, 3.4), O(4.4, 1, 4.4)], 1, 6);
      const straddle = OL([O(0, 0, 0), O(0.7, 0, 0.7), O(1.7, 1, 1.7)], 1, 6);
      const late = OL([O(0, 0, 0), O(6.6, 0, 6.6), O(7.6, 1, 7.6)], 1, 6);
      const noTotal = OL([{ at: 0, output: { underruns: 0, underrunSec: 0 } }, { at: 3, output: { underruns: 2, underrunSec: 0.006 } }], 1, 6);
      check('A3 The output\'s counts read refresh by refresh: a loss shown before the test signal starts is not counted, one during it is, one whose refresh stretch reaches into it is, one after it is not; without totalDuration a loss still counts; no counts: none',
        early.underruns === 0 && during.underruns === 1 && straddle.underruns === 1 && late.underruns === 0 && noTotal.underruns === 2 && OL([{ at: 0, output: null }], 1, 6) === null,
        `before ${early.underruns} · during ${during.underruns} · across the start ${straddle.underruns} · after ${late.underruns} · no totalDuration ${noTotal.underruns}`);

      // A band whose decay the recording itself cut short (a room ringing 12 s, 4 s recorded after the sweep): the reason
      // names the recording, not the background.
      const plan12 = AN.sweepPlan(48000), sweep12 = AN.makeSweep(plan12), ir12 = FIX.roomIR({ fs: 48000, seconds: 5, rt: 12, seed: 41, directDb: 18 });
      const l12 = AN.analyseTake(FIX.recordSweep({ plan: plan12, sweep: sweep12, ir: ir12, latency: 0.07, peakDbfs: -12, noiseDbfs: -75, noiseKind: 'pink', seed: 42 }), plan12, sweep12);
      const b12a = l12.bands.find(b => b.f === 1000), b12 = PROC.decideBand(b12a);
      check('A3 A room ringing longer than the recording lasts (RT 12 s): no value at 1000 Hz, and the reason names the recording, not the background noise',
        b12a.reachedEnd && b12.rt60 == null && /rings longer than the recording lasts/.test(b12.reason || ''), (b12.reason || String(b12.rt60)).slice(0, 120));
    }
    {
      const partial = PROC.evaluate(take({ refl: DESK }, { echoCancellation: false }), {});
      const on = PROC.evaluate(take({ refl: DESK }, { echoCancellation: false, noiseSuppression: false, autoGainControl: true }), {});
      check('A3 Settings the browser does not report are unknown, not off: a warning names them, and no band is High confidence',
        partial.valid && partial.warnings.some(w => /does not report whether noise suppression and automatic gain are switched off/.test(w)) && partial.bands.every(b => b.confidence !== 'High'), partial.warnings.join(' ').slice(0, 160));
      check('A3 A setting the browser reports ON: the take is not valid (as before)', !on.valid && /automatic gain control/.test(on.reason), on.reason.slice(0, 100));
      const st = s => MEAS.processingState(s, null);
      const tAll = MEAS.processingText(st(allOff)), tPart = MEAS.processingText(st({ echoCancellation: false })), tOn = MEAS.processingText(st({ echoCancellation: false, noiseSuppression: true }));
      const short = [MEAS.processingShort(st(allOff)), MEAS.processingShort(st({ echoCancellation: false })), MEAS.processingShort(st({})), MEAS.processingShort(st({ autoGainControl: true }))];
      check('A3 Wording: "all reported off" only when all three are; otherwise each feature as off, ON or not reported; the short form never says "off" for an unreported one',
        /all reported off/.test(tAll) && !/all|switched off/i.test(tPart) && /noise suppression not reported/.test(tPart) && /ON/.test(tOn)
          && short[0] === 'All three reported off' && short[1] === 'Echo cancellation off; others unknown' && short[2] === 'Not reported by this browser' && short[3] === 'ON: automatic gain',
        `${tAll} | ${tPart} | ${tOn} | ${short.join(' | ')}`);
      const caps = MEAS.processingState(allOff, { echoCancellation: [true, false], noiseSuppression: [true], autoGainControl: [] });
      check('A3 Requested, reported and possible are kept apart (getCapabilities: switchable, not switchable, not said)',
        caps[0].requested === false && caps[0].reported === false && caps[0].capable.includes(false) && caps[1].capable.length === 1 && caps[2].capable.length === 0, JSON.stringify(caps));
    }
    {
      const b = PROC.decideBand({ f: 1000, supported: true, decayRangeDb: 34.6, fits: {}, headDb: 0, bandwidth: 707 });
      check('A3 Threshold text is not hidden by rounding: 34.6 dB reads "Only 34.6 dB … T20 needs 35 dB", not "Only 35 dB"', /Only 34\.6 dB/.test(b.reason) && !/Only 35 dB/.test(b.reason), b.reason);
    }
    {
      // RT60 is T20 (ISO 3382-2's preferred range); T30 is worked out from 45 dB usable, as the straightness check.
      // The measurement-chain audit's double-slope room: T20 0.677 s, T30 0.801 s. With T30 chosen from 45 dB it read
      // 0.801 s at 45.7 dB usable and 0.677 s at 44.6 dB; now both read 0.677 s, and the curvature is said where it is seen.
      const fits = (t20, r20, t30, r30) => ({ T20: { T: t20, r2: r20 }, T30: { T: t30, r2: r30 } });
      const dec = (db, f) => PROC.decideBand({ f: 1000, supported: true, decayRangeDb: db, fits: f, headDb: 0, bandwidth: 707 });
      const curved = fits(0.677, 0.9995, 0.801, 0.995), at457 = dec(45.7, curved), at446 = dec(44.6, curved);
      check('A3 T20 is the RT60 whatever the background: the double-slope room reads 0.677 s at 45.7 and at 44.6 dB usable; with 45 dB the T30 check (0.801 s, C +18.3 %) flags the curved decay and keeps the confidence medium',
        at457.path === 'T20' && at457.rt60 === 0.677 && at446.rt60 === 0.677 && at457.t30 === 0.801 && at446.t30 === null && at457.curvature === 18.3 && at457.notes.some(n => /curved/.test(n)) && at457.confidence === 'Medium',
        `${at457.rt60} ${at457.path} (T30 ${at457.t30}, C ${at457.curvature} %) / ${at446.rt60} ${at446.path} (T30 ${at446.t30})`);
      const straight = fits(0.70, 0.9990, 0.71, 0.9985), s50 = dec(50, straight), s40 = dec(40, straight);
      check('A3 Confidence: a straight decay confirmed by the T30 check (50 dB usable) is Good / High; with 40 dB there is no room for the check, so the same T20 is Fair / Medium',
        s50.rt60 === 0.7 && s50.quality === 'Good' && s50.confidence === 'High' && s40.rt60 === 0.7 && s40.t30 === null && s40.quality === 'Fair' && s40.confidence === 'Medium',
        `${s50.quality}/${s50.confidence} · ${s40.quality}/${s40.confidence}`);
    }

    /* ---------- A4 headline: fixed bands ---------- */
    status('A4 headline…');
    {
      const json1 = o => JSON.stringify(o);
      const band = (f, rt60, x) => Object.assign({ f, rt60, path: rt60 == null ? null : 'T30', quality: rt60 == null ? 'Insufficient' : 'Good', reason: rt60 == null ? 'Only 21 dB of the room\'s own decay above the recording background noise. T20 needs 35 dB.' : null }, x);
      const R = (bands, x) => Object.assign({ valid: true, referenceBand: 1000, recordingId: 'r', bands }, x);
      const all = RA.of(R([band(125, 0.62), band(250, 0.55), band(500, 0.50), band(1000, 0.48), band(2000, 0.45), band(4000, 0.40)]));
      // (0.62 + 0.55 + 0.50 + 0.48 + 0.45 + 0.40) = 3.00; ÷ 6 = 0.5000 s (the earlier 500–2000 Hz mean was 0.4767 s).
      check('A4 The headline is the mean of all six bands: (0.62 + 0.55 + 0.50 + 0.48 + 0.45 + 0.40) ÷ 6 = 0.5000 s',
        all.available && near(all.value, 3.00 / 6, 1e-12) && all.n === 6 && JSON.stringify(RA.REQUIRED) === '[125,250,500,1000,2000,4000]' && !all.excluded.length, `${all.value}`);
      // A phone-like take that loses 125, 250 and 4000 Hz: the mean of the three that are left (3 of 6, the least an
      // average may have), (0.50 + 0.48 + 0.45) ÷ 3 = 0.4767 s, with the three named as left out.
      const lowGone = RA.of(R([band(125, null), band(250, null), band(500, 0.50), band(1000, 0.48), band(2000, 0.45), band(4000, null)]));
      check('A4 A take that loses 125, 250 and 4000 Hz: the average of the other three, 1.43 ÷ 3 = 0.4767 s, with the three named as left out', lowGone.available && lowGone.partial && near(lowGone.value, 1.43 / 3, 1e-12) && RA.describe(lowGone) === '3 of 6 bands (125 Hz, 250 Hz and 4000 Hz not measured)', RA.describe(lowGone));
      const no500 = RA.of(R([band(125, 0.62), band(250, 0.55), band(500, null), band(1000, 0.48), band(2000, 0.45), band(4000, 0.40)]));
      const nan2k = RA.of(R([band(500, 0.5), band(1000, 0.48), band(2000, NaN)]));
      const invalid = RA.of(R([band(500, 0.5), band(1000, 0.48), band(2000, 0.45)], { valid: false }));
      // 500 Hz without a value: the other five, (0.62 + 0.55 + 0.48 + 0.45 + 0.40) = 2.50 ÷ 5 = 0.5 s, 500 Hz named with
      // its reason. A take with only two bands that have a value (500 and 1000 Hz), and a take that is not valid: none.
      check('A4 A band without a value is left out and named with its reason (500 Hz: 2.50 ÷ 5 = 0.50 s); with only two bands, or a take that is not valid, there is no headline',
        no500.available && near(no500.value, 2.5 / 5, 1e-12) && json1(no500.missing.map(m => m.f)) === '[500]' && /Only 21 dB/.test(no500.missing[0].reason) && !nan2k.available && /2000 Hz/.test(nan2k.reason) && !invalid.available,
        `${RA.describe(no500)} | ${nan2k.reason.slice(0, 80)} | ${invalid.reason}`);
      const html = textOf(ui.averageSummary(nan2k)), part = textOf(ui.averageSummary(no500));
      check('A4 The summary under the band table says "Unavailable" with the bands that failed, or names a band left out; never 0, 0.00 or NaN', /Unavailable/.test(html) && /2000 Hz \(not reliable\)/.test(html) && !/NaN|0\.00/.test(html) && /left out, not measured reliably: 500 Hz/.test(part), html.slice(0, 200));
      const ur = RA.of(R([band(125, 0.304), band(250, 0.304), band(500, 0.304), band(1000, 0.304), band(2000, 0.314), band(4000, 0.304)]));
      check('A4 Unrounded: (0.304 × 5 + 0.314) ÷ 6 = 1.834 ÷ 6 = 0.30567 s is kept, and shown 0.31 s', near(ur.value, 1.834 / 6, 1e-12) && AM.util.fmt.s(ur.value) === '0.31 s', `${ur.value}`);
    }

    /* ---------- A5 profiles, configuration, report ---------- */
    status('A5 profiles and configuration…');
    S.startProject('new');
    S.autofillTo('setup');
    const p = S.state.project, act = W.get('setup').actions, ctx = () => ({ project: S.state.project, state: S.state });
    const detected = MEAS.deviceKind(), other = detected === 'computer' ? 'mobile' : 'computer';
    Object.keys(p.setup.prep).length || ['doors', 'hvac', 'quiet', 'placed', 'uncovered', 'output'].forEach(k => { p.setup.prep[k] = true; });
    ['doors', 'hvac', 'quiet', 'placed', 'uncovered', 'output'].forEach(k => { p.setup.prep[k] = true; });
    S.emit();
    const setupText = () => textOf(W.get('setup').view(ctx()).body);
    {
      const before = setupText();
      act.setKind(ctx(), other);
      const after = setupText(), K = AM.demo.DEVICE_KINDS[other];
      check(`A5 Switching the profile to "${K.name}": stored as chosen, the placement items of the checklist (placed, uncovered, output) asked again and the others kept, its own checks shown, and a note that the measurement still uses this device`,
        p.setup.deviceKind === other && !p.setup.prep.placed && !p.setup.prep.uncovered && !p.setup.prep.output && p.setup.prep.doors && p.setup.prep.hvac && p.setup.prep.quiet
          && after.includes(K.checks[0]) && /changes the instructions only/.test(after) && !before.includes(K.checks[0]),
        `prep ${JSON.stringify(p.setup.prep)}`);
      act.setKind(ctx(), detected);
      const back = setupText(), Kd = AM.demo.DEVICE_KINDS[detected];
      check(`A5 Back to the detected "${Kd.name}": no longer a chosen profile, none of the other profile's checks or notes remain`,
        p.setup.deviceKind === null && back.includes(Kd.checks[0]) && !back.includes(K.checks[0]) && !/changes the instructions only/.test(back), `deviceKind ${p.setup.deviceKind}`);
    }
    {
      // The selected configuration must be the one in force before measuring.
      const fakeSession = o => Object.assign({ deviceId: 'default', label: 'Mic', sampleRate: 48000, settings: allOff, capabilities: null, supported: null, tap: { kind: 'audio-worklet' } }, o);
      const okOut = MEAS.configOf(fakeSession({ output: { requested: 'spk', selectable: true, applied: 'spk', error: null } }), { profile: 'computer' }, 'Speakers');
      const notSel = MEAS.configOf(fakeSession({ output: { requested: 'default', selectable: false, applied: null, error: null } }), { profile: 'mobile', profileChosen: true }, null);
      const failed = MEAS.configOf(fakeSession({ output: { requested: 'spk', selectable: true, applied: 'default', error: 'device not found' } }), {}, null);
      const dflt = MEAS.configOf(fakeSession({ output: { requested: 'default', selectable: true, applied: 'default', error: null } }), {}, 'Speakers');
      check('A5 Output: confirmed only when a specific output was selected and the browser applied it; the system default (which device is unknown), a browser that cannot choose, and a failed selection are never "confirmed"',
        okOut.output.verified && !dflt.output.verified && !notSel.output.verified && notSel.output.selectable === false && !failed.output.verified && failed.output.error === 'device not found'
          && okOut.requested.echoCancellation === false && notSel.profile === 'mobile' && notSel.profileChosen === true,
        `${JSON.stringify(okOut.output)} | ${JSON.stringify(notSel.output)}`);
      p.setup.permission = 'granted';
      p.setup.input = { label: 'Mic', sampleRate: 48000, settings: allOff, config: failed };
      S.emit();
      const blocked = W.get('setup').canContinue(p), problem = AM.live.configProblem(p);
      p.setup.input = { label: 'Mic', sampleRate: 48000, settings: allOff, config: Object.assign(copy(okOut), { input: { deviceId: 'default', label: 'Mic' } }) };
      p.setup.outputId = 'spk';
      const ready = AM.live.configProblem(p);
      check('A5 A selected output the browser could not apply blocks Measurement Setup (and the take, which reads the same check) with the reason; an applied one does not',
        !blocked.ok && /could not be used/.test(blocked.reason) && /device not found/.test(problem) && ready === null, `${blocked.reason} · ready: ${ready}`);
      p.setup.outputId = 'default'; p.setup.permission = 'not-requested'; p.setup.input = null;
    }
    {
      // The report describes the configuration the take was made with, not what is selected afterwards.
      const t = take({ refl: DESK }, { echoCancellation: false }, { deviceKind: other, config: MEAS.configOf({ deviceId: 'default', label: 'Mic', sampleRate: 48000, settings: { echoCancellation: false }, output: { requested: 'default', selectable: false }, tap: { kind: 'audio-worklet' } }, { profile: other, profileChosen: true }, null) });
      const res = PROC.evaluate(t, {});
      p.measurement.recording = t; p.processing.result = res;
      p.target = { preferred: 0.6, min: 0.48, max: 0.72, source: 'custom', basis: 'Test' };
      p.setup.deviceKind = null; // the dropdown now says the detected profile
      p.completed = W.STAGES.map(s => s.id); p.review = [];
      S.emit();
      const M = AM.report.model(p), pdf = await AM.report.build(p);
      const raw = Array.from(pdf.bytes, c => String.fromCharCode(c)).join('');
      const txt = [...raw.matchAll(/<([0-9A-F]+)> Tj/g)].map(m => m[1].replace(/../g, h => String.fromCharCode(parseInt(h, 16)))).join(' ');
      const results = textOf(W.get('results').view(ctx()).body);
      const K = AM.demo.DEVICE_KINDS[other];
      check(`A5 Report and Results use the take's own configuration: profile "${K.name}" (chosen at the time, not the profile selected now) and browser processing "Echo cancellation off; others unknown" (never "all off")`,
        M.measurement.deviceKind === K.name && txt.includes(K.name) && txt.includes('Echo cancellation off; others unknown') && /noise suppression not reported/.test(results) && !/Switched off/.test(results) && ![...(pdf.doc.unsupported || [])].length,
        `report: ${M.measurement.deviceKind}; results: ${(results.match(/Browser processing[^·]{0,120}/) || [''])[0]}`);
      const avgTxt = textOf(W.get('results').view(ctx()).body);
      const avg = D.averageRT60(p);
      check('A5 Results, the report and the summary agree on the 125–4000 Hz average (or say it is unavailable and why)',
        avg.available ? (avgTxt.includes(`${avg.value.toFixed(2)}s`) || avgTxt.includes(`${avg.value.toFixed(2)} s`)) && txt.includes(`${AM.util.fmt.s(avg.value)} (125`) && txt.includes('Average RT60, all bands') : /No average/.test(avgTxt),
        avg.available ? `${avg.value.toFixed(3)} s` : avg.reason);
    }
    {
      // Results names a newer take it does not include (F1, F2), and the top bar marks the value as an earlier take's.
      const cur = p.measurement.recording, later = new Date(Date.parse(cur.takenAt) + 60000).toISOString();
      p.measurement.recording = Object.assign({}, cur, { id: 'rnewer', takenAt: later });
      S.emit();
      const pend = textOf(W.get('results').view(ctx()).body), stale = document.querySelector('.fact.measured.is-stale');
      p.measurement.recording = cur;
      p.measurement.failed = { reason: 'The test signal was only 4.2 dB above the background at the microphone.', takenAt: later };
      S.emit();
      const rej = textOf(W.get('results').view(ctx()).body);
      p.measurement.failed = null;
      S.emit();
      const clear = textOf(W.get('results').view(ctx()).body);
      check('A5 Results says when a newer take is not the one shown: "has not been processed yet" (with a Process it button), or "gave no value" with its reason; nothing when the shown take is the latest',
        /A newer take, recorded .* has not been processed yet/.test(pend) && /Process it/.test(pend) && /Your latest take \(.*\) gave no value: it could not be analysed\. The test signal was only 4\.2 dB/.test(rej) && !/newer take|Your latest take/i.test(clear),
        `${(pend.match(/A newer take[^.]*\./) || [''])[0]} | ${(rej.match(/Your latest take[^.]*\./) || [''])[0]} | top bar marked: ${!!stale}`);
      p.room.name = 'Studio of Asha Rao';
      const dj = JSON.stringify(D.diagnostics(p));
      const dg = D.diagnostics(p);
      check('A5 The diagnostics record (Copy diagnostics on Results): the configuration, every check and every band, and no room or project name, position, or microphone or output label',
        dg && dg.device.processing.length === 3 && dg.bands.length === 6 && dg.recording && 'clicks' in dg.recording && 'browserCounts' in dg.recording && !dj.includes('Asha') && !dj.includes(p.measurement.recording.deviceLabel || 'Mic') && !/"label"|deviceLabel|outputLabel|position/.test(dj),
        dj.slice(0, 220));
    }
    status('Part A done.');
  }

  /* ================================= Part B ================================= */
  async function partB() {
    const S = AM.store, LIVE = AM.live, VR = window.VR;
    S.startProject('new');
    S.autofillTo('setup');
    const p = S.state.project;
    status('B permission…');
    VR.mode = 'denied';
    await LIVE.requestAccess(p);
    const denied = p.setup.permission;
    VR.mode = 'none';
    await LIVE.requestAccess(p);
    const none = p.setup.permission;
    check('B Permission denied and no microphone: each reported as such, nothing measured', denied === 'denied' && none === 'no-device' && !p.setup.input, `${denied} · ${none}`);
    VR.mode = 'ok';
    Object.assign(VR, { rt: [0.62, 0.55, 0.5, 0.45, 0.42, 0.38], directDb: 24, noiseDbfs: -66, speakerDbfs: -24 });
    if (VR.room) VR.rebuild();
    await LIVE.requestAccess(p);
    const cfg = p.setup.input && p.setup.input.config;
    check('B Access with the virtual device: granted, and the configuration read back (requested off; each feature reported or unknown; the system default output never counted as confirmed)',
      p.setup.permission === 'granted' && cfg && cfg.requested.autoGainControl === false && cfg.processing.length === 3 && cfg.output.requested === 'default' && cfg.output.verified === false,
      cfg ? `${AM.services.measurement.processingText(cfg.processing)} · output selectable ${cfg.output.selectable}, confirmed ${cfg.output.verified}` : 'no config');
    status('B background…');
    LIVE.measureNoise(p);
    await until(() => !LIVE.state.noise && (p.setup.noise || p.setup.noiseAttempt), 'the background measurement');
    check('B Background measured through the app, with its configuration', p.setup.noise && p.setup.noise.config && p.setup.noise.inBand, p.setup.noise ? `${p.setup.noise.status}, ${p.setup.noise.inBand.leqDbfs} dBFS in band` : 'none');

    async function takeWith(label, during) {
      const before = p.measurement.recording && p.measurement.recording.id, failedBefore = p.measurement.failed && p.measurement.failed.takenAt;
      status(`B ${label}…`);
      LIVE.measureRT60(p);
      if (during) { await sleep(during.after); during.act(); }
      await until(() => !LIVE.state.take, `the ${label} take`, 40000);
      const rec = p.measurement.recording && p.measurement.recording.id !== before ? p.measurement.recording : null;
      return { rec, failed: rec ? null : (p.measurement.failed && p.measurement.failed.takenAt !== failedBefore ? p.measurement.failed : null) };
    }
    const good = await takeWith('complete take');
    check('B A complete take keeps the configuration it was made with (profile, input, output, processing as reported or unknown)',
      good.rec && good.rec.config && good.rec.config.profile === AM.live.kindOf(p) && good.rec.config.processing.length === 3 && good.rec.analysis.timing,
      good.rec ? `profile ${good.rec.config.profile}; ${AM.services.measurement.processingText(good.rec.config.processing)}; continuity ${good.rec.analysis.timing.checked ? `${good.rec.analysis.timing.maxStepMs} ms` : good.rec.analysis.timing.reason}` : (good.failed && good.failed.reason));
    check('B The take carries the browser\'s own counts (none lost) and the click and level checks above the sweep',
      good.rec && good.rec.integrity && good.rec.analysis.clicks && good.rec.analysis.clicks.checked && good.rec.analysis.sweepGain,
      good.rec ? `counts ${JSON.stringify(good.rec.integrity)}; clicks: worst ${good.rec.analysis.clicks.worstDb} dB; level above the sweep ${good.rec.analysis.sweepGain.changeDb} dB` : 'no take');
    // The browser reports frames lost during the take (the track's own stats, raised by 96 while the take runs).
    const lost = await takeWith('lost frames', { after: 2500, act: () => { const t = VR.lastTrack, real = Object.getOwnPropertyDescriptor(MediaStreamTrack.prototype, 'stats'); Object.defineProperty(t, 'stats', { configurable: true, get: () => { const s = real.get.call(t); return { totalFrames: s.totalFrames + 96, deliveredFrames: s.deliveredFrames }; } }); } });
    if (VR.lastTrack) delete VR.lastTrack.stats;
    const lostRes = lost.rec ? AM.services.processing.evaluate(lost.rec, {}) : null;
    check('B The browser counts 96 microphone frames lost during a take: the take is recorded but not valid, with the reason',
      lost.rec && lost.rec.integrity && lost.rec.integrity.inputLostFrames === 96 && lostRes && !lostRes.valid && /96 audio frames from the microphone were lost/.test(lostRes.reason),
      lost.rec ? `${JSON.stringify(lost.rec.integrity)} · ${lostRes && lostRes.reason.slice(0, 100)}` : (lost.failed && lost.failed.reason));
    // The context's own playback stats (every AudioContext), refreshed the way Chrome refreshes them: about once a second
    // (here 0.4, 1.4, 2.4 … s after the take is started), each refresh moving totalDuration on and showing the underruns
    // that happened before it. lossAt: when the output runs dry once (ms after the start).
    const ps = Object.getOwnPropertyDescriptor(AudioContext.prototype, 'playbackStats');
    const refreshing = lossAt => {
      const t0 = performance.now();
      let shown = { underrunEvents: 0, underrunDuration: 0, totalDuration: 0 }, k0 = -1;
      Object.defineProperty(AudioContext.prototype, 'playbackStats', { configurable: true, get: () => {
        const t = performance.now() - t0, k = Math.floor((t - 400) / 1000);
        if (t >= 400 && k > k0) { k0 = k; const at = 400 + k * 1000, n = lossAt <= at ? 1 : 0; shown = { underrunEvents: n, underrunDuration: n * 0.003, totalDuration: at / 1000 }; }
        return shown;
      } });
    };
    const wet = () => { if (ps) Object.defineProperty(AudioContext.prototype, 'playbackStats', ps); else delete AudioContext.prototype.playbackStats; };
    let dryBefore, dryDuring;
    try { refreshing(150); dryBefore = await takeWith('output dry before the sweep'); refreshing(2500); dryDuring = await takeWith('output dry during the sweep'); } finally { wet(); }
    const dbRes = dryBefore.rec ? AM.services.processing.evaluate(dryBefore.rec, {}) : null, ddRes = dryDuring.rec ? AM.services.processing.evaluate(dryDuring.rec, {}) : null;
    check('B The sound output ran dry in the silence before the sweep (the browser shows it at its next refresh, still before the sweep): not counted, since it cannot harm the take; the take is valid',
      dryBefore.rec && dryBefore.rec.integrity.outputUnderruns === 0 && dbRes && dbRes.valid,
      dryBefore.rec ? `${JSON.stringify(dryBefore.rec.integrity)} · ${dbRes.valid ? 'valid' : (dbRes.reason || '').slice(0, 80)}` : (dryBefore.failed && dryBefore.failed.reason));
    check('B The sound output ran dry while the sweep played: counted, and the take is recorded but not valid, with the reason (measured again only when the user presses it)',
      dryDuring.rec && dryDuring.rec.integrity.outputUnderruns === 1 && ddRes && !ddRes.valid && /ran dry 1 time/.test(ddRes.reason || ''),
      dryDuring.rec ? `${JSON.stringify(dryDuring.rec.integrity)} · ${(ddRes.reason || 'valid').slice(0, 80)}` : (dryDuring.failed && dryDuring.failed.reason));
    // A phone (profile 'mobile'): three short tones from 150 Hz in one take, each checked, the clean ones averaged.
    const kindWas = p.setup.deviceKind;
    AM.store.update(pp => { pp.setup.deviceKind = 'mobile'; });
    const ph = await takeWith('a phone take', null, 60000);
    AM.store.update(pp => { pp.setup.deviceKind = kindWas; });
    const phRes = ph.rec ? AM.services.processing.evaluate(ph.rec, {}) : null, phPlan = ph.rec ? ph.rec.plan : {};
    // A tone the browser reports lost audio in (this test browser does, now and then, on its first sound) is set aside
    // with its reason; the take stands on the others.
    const tones = (ph.rec && ph.rec.analysis.tones) || [];
    check('B A phone take: three 2 s tones from 150 Hz in one 16 s take, each checked, at least two used (a tone set aside says why), the result valid, and 125 Hz (below the tones) not measured',
      ph.rec && phPlan.count === 3 && phPlan.f1 === 150 && phPlan.seconds === 2 && Math.abs(phPlan.total - 16) < 0.01 && tones.length === 3 && tones.filter(t => t.used).length >= 2 && tones.every(t => t.used || !!t.reason)
        && phRes && phRes.valid && phRes.bands.find(b => b.f === 125).quality === 'Not measured',
      ph.rec ? `${phPlan.count} × ${phPlan.seconds} s from ${phPlan.f1} Hz, ${phPlan.total} s · tones ${ph.rec.analysis.tones ? ph.rec.analysis.tones.map(t => (t.used ? 'used' : 'set aside')).join(', ') : '—'} · ${phRes.valid ? `valid, 1000 Hz ${phRes.bands.find(b => b.f === 1000).rt60} s` : (phRes.reason || '').slice(0, 80)}` : (ph.failed && ph.failed.reason));
    const keep = p.measurement.recording && p.measurement.recording.id;
    const hidden = await takeWith('hidden page', { after: 2500, act: () => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); } });
    delete document.hidden;
    check('B The page hidden during a take (screen locked, app switched): the take is aborted as interrupted, nothing from it is analysed, the earlier take stays',
      !hidden.rec && hidden.failed && /interrupted/.test(hidden.failed.reason) && /hidden/.test(hidden.failed.reason) && p.measurement.recording.id === keep, hidden.failed && hidden.failed.reason.slice(0, 160));
    const muted = await takeWith('muted track', { after: 2500, act: () => VR.lastTrack.dispatchEvent(new Event('mute')) });
    check('B The system mutes the microphone during a take: aborted as interrupted', !muted.rec && muted.failed && /muted the microphone/.test(muted.failed.reason), muted.failed && muted.failed.reason.slice(0, 120));
    const gone = await takeWith('disconnected microphone', { after: 2500, act: () => VR.stopMic() });
    check('B The microphone disconnected during a take: the take fails with the reason, nothing analysed', !gone.rec && gone.failed && /stopped/.test(gone.failed.reason + (gone.failed.code || '')), gone.failed && gone.failed.reason.slice(0, 120));
    status('Part B done.');
  }

  window.AUDIO_CONFIG_A_DONE = partA().catch(e => { check('Part A ran to the end', false, `${e.message}\n${e.stack || ''}`); status('Part A error'); });
  window.AUDIO_CONFIG_B_DONE = new Promise(resolve => {
    const btn = document.getElementById('ac-run');
    btn.addEventListener('click', () => { btn.disabled = true; window.AUDIO_CONFIG_A_DONE.then(partB).catch(e => { check('Part B ran to the end', false, `${e.message}\n${e.stack || ''}`); status('Part B error'); }).then(resolve); });
  });
})();
