/* Sweep-duration study: 2, 3 and 5 s exponential sweeps (50 Hz–10 kHz) on identical synthetic rooms, through the
   application's own analysis (AM.analysis) and decision (AM.services.processing). Development only.
   Results on tests/sweep-study.html and in window.SWEEP_STUDY (window.SWEEP_STUDY_DONE resolves).

   The model is the app's own situation: one device on a desk (its direct sound 28 dB above the room's reverberation, desk
   and body reflections within 2 ms, room reflections at 6.5–26 ms), the sweep played at the same digital level for every
   duration (the same gain from the played signal to the microphone), pink background noise, 70 ms playback delay.
   Expected = the room's own decay in the band, from its noise-free impulse response, over the same ISO 3382-2 range. */
(function () {
  'use strict';
  const DSP = AM.dsp, AN = AM.analysis, PROC = AM.services.processing, FIX = window.FIX, BANDS = AM.demo.BANDS;
  const D = AN.CRITERIA.decay, T = AN.CRITERIA.take, esc = AM.util.esc;

  /* ---------- Acceptance criteria ----------
     Fixed on 12 October 2026 BEFORE any 2 s or 3 s sweep was run, and not to be changed after seeing results.
     (5 s results from the earlier audit were known; 2.5 s and 10 s had been run once, at one background each.) */
  const ACCEPT = {
    durations: [2, 3, 5],
    rts: [0.25, 0.30, 0.40, 0.50, 0.60, 0.70],
    repeats: 5,  // the same room measured again with independent background noise
    // Background with the room's response peaking at −12 dBFS: quiet ≈ 50 dB, typical ≈ 40 dB, noisy ≈ 32 dB of signal
    // above the background during the sweep.
    // Correction after the first run (thresholds unchanged): the first run used −66/−56/−48 dBFS, which measured 45/35/27 dB
    // of signal above the background, 5 dB short of the definition above (the direct sound sets the peak, not the RMS).
    // The levels now give the defined ratios. ?first-run repeats the first run's levels.
    conditions: location.search.includes('first-run')
      ? [{ id: 'quiet', noiseDbfs: -66 }, { id: 'typical', noiseDbfs: -56 }, { id: 'noisy', noiseDbfs: -48 }]
      : [{ id: 'quiet', noiseDbfs: -71 }, { id: 'typical', noiseDbfs: -61 }, { id: 'noisy', noiseDbfs: -53 }],
    P1: { tol: { T30: 0.05, T20: 0.08 }, bands: [250, 500, 1000, 2000, 4000], mean1k: 0.02,
      text: 'Accuracy: every value given at 250–4000 Hz within 5 % (T30) or 8 % (T20) of the room\'s own decay, in every case; mean absolute error at 1000 Hz ≤ 2 %.' },
    P2: { quiet: 1.0, belowFive: 0.10,
      text: 'Availability at 1000 Hz: a value in 100 % of quiet cases; in typical and noisy cases no more than 10 percentage points below the 5 s sweep.' },
    P3: { sd: 0.02, text: 'Repeatability: standard deviation of the 1000 Hz value over 5 repeats ≤ 2 % of its mean, for every RT, quiet and typical.' },
    P4: { rts: [1.0, 1.5, 2.0], text: 'Long decays: RT 1.0, 1.5 and 2.0 s (typical background) within the P1 tolerance at 1000 Hz.' },
    P5: { harmonicDb: [-25, -18], rts: [0.5, 2.0], text: 'Speaker distortion (3rd harmonic −25 and −18 dB), RT 0.5 and 2.0 s: at 1000 Hz either within the P1 tolerance or no value — never a wrong value.' },
    P6: { latencies: [0, 0.3, 0.9], text: 'Timing: playback delays 0, 0.3 and 0.9 s within the P1 tolerance at 1000 Hz.' },
    decision: 'Default = the shortest duration that passes P1, P3, P4, P5, P6 and the quiet part of P2. If it gives fewer values than 5 s in typical or noisy rooms, the app uses the 5 s sweep for the next take after a take fails for too little usable decay.',
  };
  const DESK = [[0.0006, -3, 1], [0.0011, -7, -1], [0.0016, -10, 1], [0.0065, -31, 1], [0.0098, -35, -1], [0.0135, -37, 1], [0.019, -40, -1], [0.026, -43, 1]];
  const FS = 48000;
  const lvl = id => ACCEPT.conditions.find(c => c.id === id).noiseDbfs;
  const S = window.SWEEP_STUDY = { accept: ACCEPT, cases: [], groups: [], long: [], distortion: [], timing: [], clock: [], tail: [], verdicts: [] };
  const tick = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });

  /* ---------- set-ups, rooms, recordings ---------- */
  const setups = new Map();
  function setup(seconds, tail = T.tail, fs = FS) {
    const key = `${fs}/${seconds}/${tail}`;
    if (!setups.has(key)) {
      const plan = Object.assign(AN.sweepPlan(fs), { seconds, tail });
      plan.total = plan.preRoll + seconds + tail;
      setups.set(key, { plan, sweep: AN.makeSweep(plan) });
    }
    return setups.get(key);
  }
  const rooms = new Map();
  function room(rt, seed) {
    const key = `${rt}/${seed}`;
    if (!rooms.has(key)) {
      const sec = rt * 3 + 0.5;
      const own = FIX.roomIR({ fs: FS, seconds: sec, rt, seed }), dev = FIX.roomIR({ fs: FS, seconds: sec, rt, seed, directDb: 28, reflections: DESK });
      // One playback level for every duration: the gain that brings the 5 s sweep's response to a −12 dBFS peak.
      const r5 = DSP.convolve(setup(5).sweep.signal, dev); let pk = 0; for (const v of r5) pk = Math.max(pk, Math.abs(v));
      rooms.set(key, { rt, own, dev, gain: Math.pow(10, -12 / 20) / pk, refs: new Map() });
    }
    return rooms.get(key);
  }
  // The room's own decay in band f over the range of `path`, from its noise-free impulse response.
  function expected(rm, f, path) {
    const k = `${f}/${path}`;
    if (!rm.refs.has(k)) {
      const [top, bottom] = D.ranges[path], b = DSP.octaveBand(f, FS), y = DSP.filterReversed(rm.own, b.sections), n = y.length;
      const edc = new Float64Array(n); let acc = 0;
      for (let i = n - 1; i >= 0; i--) { acc += y[i] * y[i]; edc[i] = acc; }
      const db = i => 10 * Math.log10(edc[i] / edc[0]);
      let i1 = -1, i2 = -1;
      for (let i = 0; i < n; i++) { if (i1 < 0 && db(i) <= -top) i1 = i; if (db(i) <= -bottom) { i2 = i; break; } }
      rm.refs.set(k, i1 < 0 || i2 <= i1 ? null : -60 / AN.regress(i => i / FS, db, i1, i2, 10).slope);
    }
    return rm.refs.get(k);
  }
  // What the microphone records: background throughout, the room's response to the (optionally distorted) sweep after
  // the playback delay, optionally with the recording clock off by `ppm`.
  function record(s, rm, { noiseDbfs = -56, seed = 1, latency = 0.07, distort = null, ppm = 0 } = {}) {
    const { plan, sweep } = s, total = Math.round(plan.total * FS);
    const sig = distort ? Float32Array.from(sweep.signal, distort) : sweep.signal;
    let resp = DSP.convolve(sig, rm.dev);
    if (ppm) {
      const r = 1 + ppm * 1e-6, out = new Float64Array(Math.floor((resp.length - 1) / r));
      for (let i = 0; i < out.length; i++) { const x = i * r, k = Math.floor(x), fr = x - k; out[i] = resp[k] * (1 - fr) + resp[k + 1] * fr; }
      resp = out;
    }
    const x = FIX.background(total, noiseDbfs, seed, 'pink'), start = Math.round((plan.preRoll + latency) * FS);
    for (let i = 0; i < resp.length && start + i < total; i++) x[start + i] += resp[i] * rm.gain;
    return Float32Array.from(x);
  }
  // 3rd-harmonic distortion of a given level (a memoryless cubic term, as an overdriven small speaker produces).
  // For a sine of the sweep's amplitude A = 0.7, v − k·v³ has a 3rd harmonic k·A²/4 relative to the fundamental.
  const cubic = db => { const k = 4 * Math.pow(10, db / 20) / (0.7 * 0.7); return v => v - k * v * v * v; };
  function measure(s, rec) {
    const a = AN.analyseTake(rec, s.plan, s.sweep);
    const r = PROC.evaluate({ id: 's', takenAt: '', status: a.status, reason: a.reason, levels: a.levels, plan: s.plan, sampleRate: FS, analysis: a, warnings: [] }, {});
    return { a, r };
  }
  // One take, scored band by band against the room's own decay.
  function scored(s, rm, opts) {
    const { a, r } = measure(s, record(s, rm, opts));
    const bands = r.bands.map(b => {
      const ref = b.rt60 != null ? expected(rm, b.f, b.path) : expected(rm, b.f, 'T30');
      const tol = ACCEPT.P1.tol[b.path] || 0.05;
      return { f: b.f, rt60: b.rt60, path: b.path, usable: b.decayRangeDb, quality: b.quality, ref, err: b.rt60 != null && ref ? b.rt60 / ref - 1 : null, ok: b.rt60 == null || (ref != null && Math.abs(b.rt60 / ref - 1) <= tol), reason: b.rt60 == null ? b.reason : null };
    });
    return { status: a.status, reason: a.reason, snr: a.levels && a.levels.snrDb, valid: r.valid, bands, b1k: bands.find(b => b.f === 1000) };
  }

  /* ---------- the study ---------- */
  async function run() {
    const status = document.getElementById('status');
    const step = t => { if (status) status.textContent = t; };
    let n = 0;
    // Main matrix: every duration × RT × background × repeat, on identical rooms and identical background noise.
    for (const rt of ACCEPT.rts) {
      const rm = room(rt, 300 + Math.round(rt * 100));
      for (const c of ACCEPT.conditions) for (let rep = 0; rep < ACCEPT.repeats; rep++) for (const dur of ACCEPT.durations) {
        const x = scored(setup(dur), rm, { noiseDbfs: c.noiseDbfs, seed: 1000 + rep * 17 + Math.round(rt * 100) });
        S.cases.push(Object.assign({ dur, rt, cond: c.id, rep }, x));
        if (++n % 6 === 0) { step(`Main matrix: ${n} of ${ACCEPT.rts.length * ACCEPT.conditions.length * ACCEPT.repeats * ACCEPT.durations.length} takes`); await tick(); }
      }
    }
    // P4: long decays.
    for (const rt of ACCEPT.P4.rts) {
      const rm = room(rt, 400 + Math.round(rt * 10));
      for (const dur of ACCEPT.durations) for (let rep = 0; rep < 2; rep++) { S.long.push(Object.assign({ dur, rt, rep }, scored(setup(dur), rm, { noiseDbfs: lvl('typical'), seed: 2000 + rep }))); step(`Long decays: RT ${rt} s, ${dur} s sweep`); await tick(); }
    }
    // P5: speaker distortion.
    for (const rt of ACCEPT.P5.rts) {
      const rm = room(rt, 500 + Math.round(rt * 10));
      for (const h of ACCEPT.P5.harmonicDb) for (const dur of ACCEPT.durations) { S.distortion.push(Object.assign({ dur, rt, h }, scored(setup(dur), rm, { noiseDbfs: lvl('quiet'), seed: 3000, distort: cubic(h) }))); step(`Distortion: RT ${rt} s, ${h} dB, ${dur} s sweep`); await tick(); }
    }
    // P6: playback delay. Also (information) a recording clock 100 ppm off the playback clock.
    {
      const rm = room(0.5, 600);
      for (const lat of ACCEPT.P6.latencies) for (const dur of ACCEPT.durations) { S.timing.push(Object.assign({ dur, lat }, scored(setup(dur), rm, { noiseDbfs: lvl('typical'), seed: 4000, latency: lat }))); await tick(); }
      for (const ppm of [-100, 100]) for (const dur of ACCEPT.durations) { S.clock.push(Object.assign({ dur, ppm }, scored(setup(dur), rm, { noiseDbfs: lvl('typical'), seed: 4100, ppm }))); await tick(); }
      step('Timing and clock');
    }
    // Information: how long the recording must continue after the sweep (tail), with the default 3 s sweep shape.
    for (const rt of [1.0, 2.0, 3.0]) {
      const rm = room(rt, 700 + Math.round(rt * 10));
      for (const tail of [2, 3, 4]) { S.tail.push(Object.assign({ rt, tail }, scored(setup(3, tail), rm, { noiseDbfs: lvl('typical'), seed: 5000 }))); step(`Tail ${tail} s, RT ${rt} s`); await tick(); }
    }
    judge();
    render();
    step('Done');
    return S;
  }

  /* ---------- judging against the predefined criteria ---------- */
  const mean = xs => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const sd = xs => Math.sqrt(mean(xs.map(x => (x - mean(xs)) ** 2)));
  const within = b => b && b.rt60 != null && b.ref != null && Math.abs(b.rt60 / b.ref - 1) <= (ACCEPT.P1.tol[b.path] || 0.05);
  function judge() {
    // Groups: duration × RT × background, over the repeats.
    for (const dur of ACCEPT.durations) for (const rt of ACCEPT.rts) for (const c of ACCEPT.conditions) {
      const cs = S.cases.filter(x => x.dur === dur && x.rt === rt && x.cond === c.id), vals = cs.map(x => x.b1k).filter(b => b.rt60 != null);
      const ref = cs[0].b1k.ref, errs = vals.map(b => b.rt60 / b.ref - 1);
      const methods = {}; vals.forEach(b => { methods[b.path] = (methods[b.path] || 0) + 1; });
      const quality = {}; cs.forEach(x => { const q = x.b1k.rt60 == null ? 'No value' : x.b1k.quality; quality[q] = (quality[q] || 0) + 1; });
      S.groups.push({
        dur, rt, cond: c.id, n: cs.length, have: vals.length, ref: vals.length ? mean(vals.map(b => b.ref)) : ref,
        meas: vals.length ? mean(vals.map(b => b.rt60)) : null, abs: vals.length ? mean(vals.map(b => b.rt60 - b.ref)) : null,
        pct: vals.length ? mean(errs) : null, maxAbsPct: vals.length ? Math.max(...errs.map(Math.abs)) : null,
        sd: vals.length >= 3 ? sd(vals.map(b => b.rt60)) / mean(vals.map(b => b.rt60)) : null,
        usable: mean(cs.map(x => x.b1k.usable).filter(u => u != null)), snr: mean(cs.map(x => x.snr).filter(v => v != null)),
        methods, quality, bandsOk: cs.every(x => x.bands.filter(b => ACCEPT.P1.bands.includes(b.f)).every(b => b.ok)),
        worstBand: Math.max(0, ...cs.flatMap(x => x.bands.filter(b => ACCEPT.P1.bands.includes(b.f) && b.err != null).map(b => Math.abs(b.err)))),
        reasons: [...new Set(cs.filter(x => x.b1k.rt60 == null).map(x => x.status !== 'captured' ? x.reason : x.b1k.reason))],
      });
    }
    const avail = (dur, cond) => { const cs = S.cases.filter(x => x.dur === dur && x.cond === cond); return cs.filter(x => x.b1k.rt60 != null).length / cs.length; };
    for (const dur of ACCEPT.durations) {
      const cs = S.cases.filter(x => x.dur === dur), v1k = cs.map(x => x.b1k).filter(b => b.rt60 != null);
      const bad = cs.flatMap(x => x.bands.filter(b => ACCEPT.P1.bands.includes(b.f) && !b.ok).map(b => `${x.rt} s ${x.cond} #${x.rep + 1} ${b.f} Hz ${(b.err * 100).toFixed(1)} % ${b.path}`));
      const meanAbs = mean(v1k.map(b => Math.abs(b.rt60 / b.ref - 1)));
      const P1 = { ok: !bad.length && meanAbs <= ACCEPT.P1.mean1k, detail: `mean |error| at 1000 Hz ${(meanAbs * 100).toFixed(2)} % over ${v1k.length} values; ${bad.length ? `outside tolerance: ${bad.slice(0, 6).join('; ')}${bad.length > 6 ? ` … (${bad.length})` : ''}` : 'every value at 250–4000 Hz within tolerance'}` };
      const av = Object.fromEntries(ACCEPT.conditions.map(c => [c.id, avail(dur, c.id)]));
      const av5 = Object.fromEntries(ACCEPT.conditions.map(c => [c.id, avail(5, c.id)]));
      const P2quiet = av.quiet >= ACCEPT.P2.quiet;
      const P2rest = ['typical', 'noisy'].every(k => av[k] >= av5[k] - ACCEPT.P2.belowFive - 1e-9);
      const P2 = { ok: P2quiet && P2rest, quietOk: P2quiet, restOk: P2rest, detail: ACCEPT.conditions.map(c => `${c.id} ${(av[c.id] * 100).toFixed(0)} % (5 s: ${(av5[c.id] * 100).toFixed(0)} %)`).join(' · ') };
      const sds = S.groups.filter(g => g.dur === dur && g.cond !== 'noisy');
      const P3bad = sds.filter(g => g.sd == null || g.sd > ACCEPT.P3.sd);
      const P3 = { ok: !P3bad.length, detail: `largest ${(Math.max(...sds.map(g => g.sd || 0)) * 100).toFixed(2)} %${P3bad.length ? `; failing: ${P3bad.map(g => `${g.rt} s ${g.cond} ${g.sd == null ? 'too few values' : (g.sd * 100).toFixed(2) + ' %'}`).join(', ')}` : ''}` };
      const lg = S.long.filter(x => x.dur === dur), P4 = { ok: lg.every(x => within(x.b1k)), detail: lg.map(x => `${x.rt} s: ${x.b1k.rt60 == null ? 'no value' : `${(x.b1k.err * 100).toFixed(1)} % ${x.b1k.path}`}`).join(' · ') };
      const ds = S.distortion.filter(x => x.dur === dur), P5 = { ok: ds.every(x => x.b1k.rt60 == null || within(x.b1k)), detail: ds.map(x => `${x.rt} s ${x.h} dB: ${x.b1k.rt60 == null ? 'no value' : `${(x.b1k.err * 100).toFixed(1)} %`}`).join(' · ') };
      const tm = S.timing.filter(x => x.dur === dur), P6 = { ok: tm.every(x => within(x.b1k)), detail: tm.map(x => `${x.lat} s: ${x.b1k.rt60 == null ? 'no value' : `${(x.b1k.err * 100).toFixed(1)} %`}`).join(' · ') };
      const plan = setup(dur).plan;
      S.verdicts.push({ dur, seconds: plan.total, P1, P2, P3, P4, P5, P6, core: P1.ok && P2quiet && P3.ok && P4.ok && P5.ok && P6.ok, fallback: !P2rest || ['typical', 'noisy'].some(k => av[k] < av5[k]) });
    }
    const pick = S.verdicts.filter(v => v.core).sort((a, b) => a.dur - b.dur)[0];
    S.decision = pick ? { dur: pick.dur, fallback: pick.dur !== 5 && pick.fallback } : null;
    // Which criteria separate the durations: those a shorter sweep fails while the current 5 s sweep passes them.
    const five = S.verdicts.find(v => v.dur === 5), keys = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
    S.separating = S.verdicts.filter(v => v.dur !== 5).map(v => ({ dur: v.dur, worse: keys.filter(k => !v[k].ok && five[k].ok) }));
    S.commonFail = keys.filter(k => S.verdicts.every(v => !v[k].ok));
  }

  /* ---------- rendering ---------- */
  const f3 = x => (x == null ? '—' : x.toFixed(3));
  const pc = (x, d = 1) => (x == null ? '—' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x * 100).toFixed(d)} %`);
  const tag = ok => `<span class="${ok ? 'ok' : 'bad'}">${ok ? 'PASS' : 'FAIL'}</span>`;
  const list = o => Object.entries(o).map(([k, v]) => `${k} ×${v}`).join(', ') || '—';
  function render() {
    const el = document.getElementById('out');
    const crit = `<h2>Acceptance criteria (fixed before the run)</h2><ol>${['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map(k => `<li><b>${k}.</b> ${esc(ACCEPT[k].text)}</li>`).join('')}</ol><p><b>Decision rule.</b> ${esc(ACCEPT.decision)}</p>`;
    const verdict = S.verdicts.length ? `<h2>Result per duration</h2><div class="wrap"><table><thead><tr><th>Sweep</th><th class="r">One take</th>${['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map(k => `<th>${k}</th>`).join('')}</tr></thead><tbody>${S.verdicts.map(v => `<tr><td><b>${v.dur} s</b></td><td class="r">${v.seconds.toFixed(0)} s</td>${['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map(k => `<td>${tag(v[k].ok)}<br><small>${esc(v[k].detail)}</small></td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <p id="decision"><b>Decision:</b> ${S.decision ? `the ${S.decision.dur} s sweep${S.decision.fallback ? ', with the 5 s sweep for the next take after a take fails for too little usable decay' : ''}.`
        : `no duration passes every criterion, so the rule selects none and the current 5 s sweep stays.${S.commonFail.length ? ` ${S.commonFail.join(' and ')} fail${S.commonFail.length > 1 ? '' : 's'} for all three durations alike, so ${S.commonFail.length > 1 ? 'they do' : 'it does'} not separate them.` : ''} ${S.separating.map(s => `The ${s.dur} s sweep additionally fails ${s.worse.join(', ') || 'nothing'} that the 5 s sweep passes.`).join(' ')}`}</p>` : '';
    const groups = ACCEPT.durations.map(dur => `<h2>${dur} s sweep: known RT60 at 1000 Hz (${ACCEPT.repeats} repeats per row)</h2><div class="wrap"><table><thead><tr><th class="r">RT</th><th>Background</th><th class="r">Signal above background</th><th class="r">Expected (s)</th><th class="r">Calculated, mean (s)</th><th class="r">Abs. error (s)</th><th class="r">Error</th><th class="r">Largest error</th><th class="r">SD</th><th class="r">Usable decay</th><th>Method</th><th>Reliability</th><th>250–4000 Hz</th></tr></thead><tbody>
      ${S.groups.filter(g => g.dur === dur).map(g => `<tr><td class="r">${g.rt.toFixed(2)}</td><td>${g.cond}</td><td class="r">${g.snr == null ? '—' : g.snr.toFixed(1) + ' dB'}</td><td class="r">${f3(g.ref)}</td><td class="r"><b>${f3(g.meas)}</b></td><td class="r">${g.abs == null ? '—' : (g.abs >= 0 ? '+' : '−') + Math.abs(g.abs).toFixed(3)}</td><td class="r">${pc(g.pct)}</td><td class="r">${g.maxAbsPct == null ? '—' : (g.maxAbsPct * 100).toFixed(1) + ' %'}</td><td class="r">${g.sd == null ? '—' : (g.sd * 100).toFixed(2) + ' %'}</td><td class="r">${g.usable == null ? '—' : g.usable.toFixed(0) + ' dB'}</td><td>${list(g.methods)}</td><td>${list(g.quality)}${g.reasons.length ? `<br><small>${esc(g.reasons[0])}</small>` : ''}</td><td>${g.bandsOk ? 'all within' : '<span class="bad">outside</span>'}, worst ${(g.worstBand * 100).toFixed(1)} %</td></tr>`).join('')}</tbody></table></div>`).join('');
    const small = (title, rows, cols) => rows.length ? `<h2>${title}</h2><div class="wrap"><table><thead><tr>${cols.map(c => `<th>${c[0]}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${cols.map(c => `<td>${c[1](r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';
    const at1k = [['Expected (s)', r => f3(r.b1k.ref)], ['Calculated (s)', r => `<b>${f3(r.b1k.rt60)}</b>`], ['Error', r => pc(r.b1k.err)], ['Usable decay', r => r.b1k.usable == null ? '—' : `${Math.round(r.b1k.usable)} dB`], ['Method', r => r.b1k.path || '—'], ['Reliability', r => r.status !== 'captured' ? `rejected: ${esc(r.reason || '')}` : r.b1k.rt60 == null ? `no value: ${esc(r.b1k.reason || '')}` : r.b1k.quality]];
    el.innerHTML = crit + verdict + groups
      + small('Long decays (typical background), 1000 Hz', S.long, [['Sweep', r => `${r.dur} s`], ['RT', r => r.rt.toFixed(1)], ['Repeat', r => r.rep + 1], ...at1k])
      + small('Speaker distortion (quiet background), 1000 Hz', S.distortion, [['Sweep', r => `${r.dur} s`], ['RT', r => r.rt.toFixed(1)], ['3rd harmonic', r => `${r.h} dB`], ...at1k])
      + small('Playback delay (RT 0.50 s), 1000 Hz', S.timing, [['Sweep', r => `${r.dur} s`], ['Delay', r => `${r.lat} s`], ...at1k])
      + small('Recording clock off the playback clock (information), 1000 Hz', S.clock, [['Sweep', r => `${r.dur} s`], ['Clock', r => `${r.ppm > 0 ? '+' : ''}${r.ppm} ppm`], ...at1k])
      + small('Recording after a 3 s sweep: how long is needed (information), 1000 Hz', S.tail, [['RT', r => `${r.rt.toFixed(1)} s`], ['Recorded after the sweep', r => `${r.tail} s`], ...at1k]);
    document.title = S.decision ? `Sweep study: ${S.decision.dur} s${S.decision.fallback ? ' + 5 s fallback' : ''}` : 'Sweep study';
  }

  window.SWEEP_STUDY_DONE = run().catch(e => { const s = document.getElementById('status'); if (s) s.textContent = 'Error: ' + e.message; document.title = 'error'; throw e; });
})();
