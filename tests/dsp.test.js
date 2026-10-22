/* Checks of the live measurement's analysis against signals with known answers (tests/fixtures.js).
   Open tests/dsp.html; results are listed on the page and in window.TEST_RESULTS. */
(function () {
  'use strict';
  const DSP = AM.dsp, AN = AM.analysis, PROC = AM.services.processing, FIX = window.FIX, BANDS = AM.demo.BANDS;
  const results = window.TEST_RESULTS = [];
  const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail });
  const near = (a, b, tol) => a != null && Math.abs(a - b) <= tol * b;
  const fs = 48000;

  async function runAll() {
    // FFT against a direct DFT
    {
      const n = 64, r = FIX.rng(3), re = new Float64Array(n), im = new Float64Array(n), x = [];
      for (let i = 0; i < n; i++) { x[i] = r() - 0.5; re[i] = x[i]; }
      DSP.fft(re, im);
      let err = 0;
      for (let k = 0; k < n; k++) {
        let sr = 0, si = 0;
        for (let i = 0; i < n; i++) { sr += x[i] * Math.cos(2 * Math.PI * k * i / n); si -= x[i] * Math.sin(2 * Math.PI * k * i / n); }
        err = Math.max(err, Math.abs(sr - re[k]), Math.abs(si - im[k]));
      }
      check('FFT matches a direct DFT', err < 1e-10, `max error ${err.toExponential(2)}`);
    }
    // Convolution against direct convolution
    {
      const a = FIX.noise(300, 5), b = FIX.noise(170, 6), y = DSP.convolve(a, b);
      let err = 0;
      for (let k = 0; k < a.length + b.length - 1; k++) {
        let s = 0; for (let i = 0; i < a.length; i++) { const j = k - i; if (j >= 0 && j < b.length) s += a[i] * b[j]; }
        err = Math.max(err, Math.abs(s - y[k]));
      }
      check('FFT convolution matches direct convolution', err < 1e-9, `max error ${err.toExponential(2)}`);
    }
    // Octave filters: 0 dB at the centre, −3 dB at the edges, falling outside
    BANDS.forEach(f => {
      const b = DSP.octaveBand(f, fs), db = x => 20 * Math.log10(DSP.magnitude(b.sections, x, fs));
      const c = db(f), lo = db(b.lo), hi = db(b.hi), oct = Math.max(db(b.lo / 2), db(b.hi * 2));
      check(`${f} Hz band filter shape`, Math.abs(c) < 0.3 && Math.abs(lo + 3) < 0.3 && Math.abs(hi + 3) < 0.3 && oct < -30, `centre ${c.toFixed(2)} dB, edges ${lo.toFixed(2)} / ${hi.toFixed(2)} dB, one octave outside ${oct.toFixed(1)} dB`);
    });
    // IEC 61260-1:2014 specifies base-10 octaves only: midband fm = 1000·10^(0.3k), edges fm·10^(∓0.15).
    // 125 Hz: 1000·10^(−0.9) = 125.893 Hz; 4000 Hz: 1000·10^(0.6) = 3981.07 Hz; edges of 125 Hz: 89.125 and 177.828 Hz.
    {
      const b125 = DSP.octaveBand(125, fs), b4k = DSP.octaveBand(4000, fs), b1k = DSP.octaveBand(1000, fs);
      const db = (b, x) => 20 * Math.log10(DSP.magnitude(b.sections, x, fs));
      const ok = Math.abs(b125.fm - 125.8925) < 1e-3 && Math.abs(b4k.fm - 3981.072) < 1e-2 && b1k.fm === 1000
        && Math.abs(b125.lo - 89.1251) < 1e-3 && Math.abs(b125.hi - 177.8279) < 1e-3 && Math.abs(db(b125, b125.fm)) < 0.3 && b125.f === 125;
      check('Octave bands on the IEC 61260-1:2014 base-10 midband frequencies (125.89 … 3981.1 Hz), named by their nominal ones', ok,
        `125: fm ${b125.fm.toFixed(4)}, edges ${b125.lo.toFixed(4)}–${b125.hi.toFixed(4)} Hz, ${db(b125, b125.fm).toFixed(3)} dB at fm · 4000: fm ${b4k.fm.toFixed(3)} · 1000 Hz band at 2000 Hz centre ${db(b1k, DSP.midband(2000)).toFixed(1)} dB`);
    }

    const plan = AN.sweepPlan(fs), sweep = AN.makeSweep(plan);
    const evaluate = (rec, noise) => { const a = AN.analyseTake(rec, plan, sweep); const take = { id: 't', takenAt: '', status: a.status, reason: a.reason, levels: a.levels, plan, sampleRate: fs, analysis: a, warnings: [] }; return { a, r: PROC.evaluate(take, { noise }) }; };
    // The room's own decay in one band, straight from its noise-free impulse response (no sweep, no noise, no
    // microphone), over the evaluation range of `path`: what a perfect measurement of that band gives. A band that
    // mixes different reverberation times decays with a value between them, not with the one at its centre.
    const ownDecay = (ir, f, path) => {
      const [top, bottom] = AN.CRITERIA.decay.ranges[path], b = DSP.octaveBand(f, fs), y = DSP.filterReversed(ir, b.sections), n = y.length;
      const edc = new Float64Array(n); let acc = 0;
      for (let i = n - 1; i >= 0; i--) { acc += y[i] * y[i]; edc[i] = acc; }
      const db = i => 10 * Math.log10(edc[i] / edc[0]);
      let i1 = -1, i2 = -1;
      for (let i = 0; i < n; i++) { if (i1 < 0 && db(i) <= -top) i1 = i; if (db(i) <= -bottom) { i2 = i; break; } }
      return -60 / AN.regress(i => i / fs, db, i1, i2, 10).slope;
    };

    // Sweep method, one RT60 in every band
    {
      // A single short decay in one octave band is not perfectly straight (this room's 125 Hz band: T20 0.767 s,
      // T30 0.720 s, 60 dB 0.790 s), so each band is compared with the room's own decay over the same range.
      const ir = FIX.roomIR({ fs, seconds: 3, rt: 0.8, seed: 11 });
      const { a, r } = evaluate(FIX.recordSweep({ plan, sweep, ir }));
      const own = r.bands.map(b => (b.path ? ownDecay(ir, b.f, b.path) : null));
      const per = r.bands.map((b, k) => `${b.f}: ${b.rt60 == null ? '—' : b.rt60.toFixed(3)} ${b.path || b.reason} / room ${own[k] == null ? '—' : own[k].toFixed(3)}`).join(' · ');
      check('Sweep, RT60 0.80 s everywhere: take captured', a.status === 'captured', a.reason || `latency ${a.latencySec} s`);
      check('Sweep, RT60 0.80 s everywhere: every band within 2 % of the room\'s own decay', r.bands.every((b, k) => near(b.rt60, own[k], 0.02)), per);
      // Against the nominal 0.80 s, the tolerance of the range reported (T20: 8 %, as tests/validation uses): one synthetic
      // decay's own T20 strays from its nominal RT more than its T30 does (this room's 2 kHz band: T20 0.842 s).
      check('Sweep, RT60 0.80 s everywhere: 500 Hz–4 kHz within 8 % of 0.80 s (T20)', r.bands.filter(b => b.f >= 500).every(b => b.path === 'T20' && near(b.rt60, 0.8, 0.08)), per);
      const k1 = r.bands.find(b => b.f === 1000);
      check('Sweep, RT60 0.80 s everywhere: T20 at 1000 Hz, with the T30 check worked out and the decay straight (C within ±10 %), so high confidence', r.headline && r.headline.method === 'T20' && k1.t30 != null && Math.abs(k1.curvature) <= 10 && k1.confidence === 'High',
        r.headline && `${r.headline.method}, T30 ${k1.t30} s, C ${k1.curvature} %, ${k1.decayRangeDb} dB usable, ${k1.confidence}`);
    }
    // Sweep method, a different RT60 per band
    {
      const rts = [1.4, 1.1, 0.9, 0.7, 0.6, 0.5];
      const ir = FIX.roomIR({ fs, seconds: 3.5, rt: rts, seed: 21 });
      const { r } = evaluate(FIX.recordSweep({ plan, sweep, ir, latency: 0.12 }));
      const own = r.bands.map(b => (b.path ? ownDecay(ir, b.f, b.path) : null));
      const per = r.bands.map((b, k) => `${b.f}: ${b.rt60 == null ? '—' : b.rt60.toFixed(3)} ${b.path || ''} / room ${own[k] == null ? '—' : own[k].toFixed(3)} (centre ${rts[k]})`).join(' · ');
      check('Sweep, RT60 per band: each band within 5 % of the room\'s own decay', r.bands.every((b, k) => near(b.rt60, own[k], 0.05)), per);
    }
    // Short decay
    {
      const ir = FIX.roomIR({ fs, seconds: 2, rt: 0.3, seed: 31 });
      const { r } = evaluate(FIX.recordSweep({ plan, sweep, ir }));
      check('Sweep, short RT60 0.30 s: within 8 % from 250 Hz up', r.bands.filter(b => b.f >= 250).every(b => near(b.rt60, 0.3, 0.08)), r.bands.map(b => `${b.f}: ${b.rt60 == null ? b.reason : b.rt60.toFixed(3)}`).join(' · '));
    }
    // Loud background: the sweep hardly rises above it, so the take is rejected before any RT60 is calculated
    {
      const ir = FIX.roomIR({ fs, seconds: 3, rt: 0.8, seed: 41 });
      const { a, r } = evaluate(FIX.recordSweep({ plan, sweep, ir, peakDbfs: -30, noiseDbfs: -36 }));
      check('Loud background: take rejected, no RT60', a.status === 'failed' && !r.valid && !r.bands.length, a.reason);
    }
    // Speaker weak around 1 kHz: not enough usable decay in that band, so no value there and the measurement is not valid
    {
      const ir = FIX.roomIR({ fs, seconds: 3, rt: 0.8, gainsDb: [0, 0, -30, -62, -30, 0], seed: 43 });
      const { a, r } = evaluate(FIX.recordSweep({ plan, sweep, ir, noiseDbfs: -62 }));
      const ref = r.bands.find(b => b.f === 1000);
      check('Insufficient decay at 1000 Hz: no RT60 there, measurement not valid', a.status === 'captured' && ref && ref.rt60 == null && !r.valid,
        ref ? `usable ${ref.decayRangeDb} dB: ${ref.reason}` : a.reason);
      check('Insufficient decay: no band reports a value it cannot support', r.bands.every(b => b.rt60 == null || b.decayRangeDb >= 35),
        r.bands.map(b => `${b.f}: ${b.rt60 == null ? '—' : b.rt60.toFixed(2)} (${b.decayRangeDb} dB)`).join(' · '));
    }
    // Clipped input is rejected
    {
      const ir = FIX.roomIR({ fs, seconds: 3, rt: 0.8, seed: 51 });
      const { a } = evaluate(FIX.recordSweep({ plan, sweep, ir, peakDbfs: -3, clip: true }));
      check('Clipped input: take rejected', a.status === 'failed' && /overloaded/.test(a.reason), a.reason);
    }
    // Silence is rejected
    {
      const { a } = evaluate(new Float32Array(Math.round(plan.total * fs)));
      check('Silent input: take rejected', a.status === 'failed' && /No sound/.test(a.reason), a.reason);
    }
    // Speaker not heard: only background in the recording
    {
      const rec = Float32Array.from(FIX.background(Math.round(plan.total * fs), -50, 61));
      const { a } = evaluate(rec);
      check('No test signal in the recording: take rejected', a.status === 'failed', a.reason);
    }
    // Late arrival beyond the accepted latency
    {
      const ir = FIX.roomIR({ fs, seconds: 2, rt: 0.5, seed: 71 });
      const { a } = evaluate(FIX.recordSweep({ plan, sweep, ir, latency: 1.5 }));
      check('Signal arriving 1.5 s late: take rejected', a.status === 'failed', a.reason);
    }
    // A louder sound than the test signal during the sweep: the signal is found, but its arrival does not stand clearly
    // above the rest, so its timing is not trusted and no RT60 is calculated
    {
      const ir = FIX.roomIR({ fs, seconds: 2, rt: 0.5, seed: 73 });
      const rec = FIX.recordSweep({ plan, sweep, ir, peakDbfs: -36, noiseDbfs: -75 });
      const burst = FIX.background(Math.round(plan.seconds * fs), -30, 74), s0 = Math.round(plan.preRoll * fs);
      for (let i = 0; i < burst.length; i++) rec[s0 + i] += burst[i];
      const { a } = evaluate(rec);
      check('Arrival not clear: take rejected, no timing assumed', a.status === 'failed' && /identified clearly/.test(a.reason) && a.latencySec == null, a.reason);
    }
    // The same signal buried even deeper: not found at all
    {
      const ir = FIX.roomIR({ fs, seconds: 2, rt: 0.5, seed: 73 });
      const rec = FIX.recordSweep({ plan, sweep, ir, peakDbfs: -72, noiseDbfs: -70 });
      const burst = FIX.background(Math.round(plan.seconds * fs), -30, 74), s0 = Math.round(plan.preRoll * fs);
      for (let i = 0; i < burst.length; i++) rec[s0 + i] += burst[i];
      const { a } = evaluate(rec);
      check('Arrival not found: take rejected, no timing assumed', a.status === 'failed' && /could not be (found|identified)/.test(a.reason) && a.latencySec == null, a.reason);
    }

    // One device: its speaker and microphone are centimetres apart, so the direct sound arrives far above the reverberation
    {
      const room = FIX.roomIR({ fs, seconds: 3, rt: 0.7, seed: 11 });
      const ir = FIX.roomIR({ fs, seconds: 3, rt: 0.7, seed: 11, directDb: 20 });
      const { a, r } = evaluate(FIX.recordSweep({ plan, sweep, ir, latency: 0.083, peakDbfs: -10, noiseDbfs: -75 }));
      const own = r.bands.map(b => (b.path ? ownDecay(room, b.f, b.path) : null));
      const per = r.bands.map((b, k) => `${b.f}: ${b.rt60 == null ? '—' : b.rt60.toFixed(3)} ${b.path || ''} / room ${own[k] == null ? '—' : own[k].toFixed(3)} (direct ${b.headDb} dB)`).join(' · ');
      check('One device, direct sound 20 dB above the reverberation: every band within 3 % of the room\'s own decay', a.status === 'captured' && r.bands.every((b, k) => near(b.rt60, own[k], 0.03)), a.reason || per);
      check('One device: arrival delay read from the recording', a.latencySec != null && Math.abs(a.latencySec - 0.083) < 0.002, `${a.latencySec} s (played with 0.083 s delay), ${a.arrivalClarityDb} dB clear`);
      const hi = r.bands.filter(b => b.f >= 2000);
      // (headDb is reported to 0.1 dB, so the comparison allows that rounding)
      check('One device: direct sound found and the evaluation starts below it', hi.every(b => b.headDb >= 8 && b.fit && b.fit.from <= -(b.headDb - AN.CRITERIA.decay.directAllowanceDb + 5) + 0.06),
        hi.map(b => `${b.f}: direct ${b.headDb} dB, ${b.path} from ${b.fit && b.fit.from} dB`).join(' · '));
      check('One device: usable decay counts only the room\'s own decay', r.bands.every(b => b.decayRangeDb <= b.peakToNoiseDb + 3), r.bands.map(b => `${b.f}: ${b.decayRangeDb} of ${b.peakToNoiseDb} dB`).join(' · '));
    }
    // One device in a very absorbent room: a direct sound 30 dB above the reverberation must not change any band's
    // value from the room's own decay (before the gentler sweep start, 125 Hz read 0.78 s here). The room's own decay
    // is taken from its impulse response without the direct sound; a single short decay in one octave band varies
    // around the room's nominal 0.35 s (0.33–0.39 s across test rooms), which is why the comparison is with it.
    {
      const room = FIX.roomIR({ fs, seconds: 2.5, rt: 0.35, seed: 11 });
      const ir = FIX.roomIR({ fs, seconds: 2.5, rt: 0.35, seed: 11, directDb: 30 });
      const { r } = evaluate(FIX.recordSweep({ plan, sweep, ir, peakDbfs: -10, noiseDbfs: -75 }));
      const own = r.bands.map(b => (b.path ? ownDecay(room, b.f, b.path) : null));
      check('One device, absorbent room (0.35 s), direct sound 30 dB: every band within 5 % of the room\'s own decay', r.bands.every((b, k) => near(b.rt60, own[k], 0.05)),
        r.bands.map((b, k) => `${b.f}: ${b.rt60 == null ? 'not reliable' : b.rt60.toFixed(3)} ${b.path || ''} / room ${own[k] == null ? '—' : own[k].toFixed(3)}`).join(' · '));
    }

    /* RT60 audit (calculation corrections): realistic single-device conditions, the noise floor, browser processing. */
    // A laptop on a desk: the desk and the device's own body reflect within ~2 ms, room surfaces 30–45 dB below the
    // direct sound (they are metres away, the microphone centimetres from the speaker).
    const DESK = [[0.0006, -3, 1], [0.0011, -7, -1], [0.0016, -10, 1], [0.0065, -31, 1], [0.0098, -35, -1], [0.0135, -37, 1], [0.019, -40, -1], [0.026, -43, 1]];
    const runTake = rec => { const a = AN.analyseTake(rec, plan, sweep); return PROC.evaluate({ id: 't', takenAt: '', status: a.status, reason: a.reason, levels: a.levels, plan, sampleRate: fs, analysis: a, warnings: [] }, {}); };
    // The background noise in the decay must not lengthen it. Pink background, decays only 35–41 dB above it (T20).
    // Before the noise floor was subtracted in the Schroeder integration these read +3…+8 % long (mean about +5 %).
    {
      const errs = [], per = [];
      for (const noiseDbfs of [-60, -64]) for (const seed of [11, 23, 37]) {
        const room = FIX.roomIR({ fs, seconds: 2.5, rt: 0.5, seed });
        const ir = FIX.roomIR({ fs, seconds: 2.5, rt: 0.5, seed, directDb: 28, reflections: DESK });
        const r = runTake(FIX.recordSweep({ plan, sweep, ir, noiseDbfs, noiseKind: 'pink', seed: seed + 100, latency: 0.06 }));
        [500, 1000, 2000].forEach(f => { const b = r.bands.find(x => x.f === f); if (b.rt60 == null) return; const own = ownDecay(room, f, b.path), e = 100 * (b.rt60 / own - 1); errs.push(e); per.push(`${noiseDbfs}/${seed} ${f}: ${b.rt60.toFixed(3)} ${b.path} / ${own.toFixed(3)} (${e >= 0 ? '+' : ''}${e.toFixed(1)} %)`); });
      }
      const mean = errs.reduce((s, x) => s + x, 0) / errs.length;
      // The mean is the bias; single bands near the T20 limit scatter by a few per cent (as in the short-decay check).
      check('Noise floor near the T20 limit: no systematic over-read (mean within ±2.5 %, each within 8 %)', errs.length >= 12 && Math.abs(mean) <= 2.5 && errs.every(e => Math.abs(e) <= 8), `mean ${mean.toFixed(1)} % over ${errs.length} bands · ${per.join(' · ')}`);
    }
    // The same laptop with its small speaker (nothing below about 300 Hz) and a pink background, at 48 and 44.1 kHz.
    for (const rate of [48000, 44100]) {
      const pl = AN.sweepPlan(rate), sw = AN.makeSweep(pl), rts = [0.62, 0.58, 0.52, 0.48, 0.44, 0.40];
      const spk = [DSP.rbj('highpass', 300, rate, 0.54), DSP.rbj('highpass', 300, rate, 1.31), DSP.rbj('lowpass', 12000, rate, 0.707)];
      const room = FIX.roomIR({ fs: rate, seconds: 2.5, rt: rts, seed: 4 });
      const ir = DSP.filter(FIX.roomIR({ fs: rate, seconds: 2.5, rt: rts, seed: 4, directDb: 28, reflections: DESK }), spk);
      const a = AN.analyseTake(FIX.recordSweep({ plan: pl, sweep: sw, ir, peakDbfs: -14, noiseDbfs: -66, noiseKind: 'pink', seed: 13, latency: 0.07 }), pl, sw);
      const r = PROC.evaluate({ id: 't', takenAt: '', status: a.status, levels: a.levels, plan: pl, sampleRate: rate, analysis: a, warnings: [] }, {});
      const own = (f, path) => { const [top, bottom] = AN.CRITERIA.decay.ranges[path], b = DSP.octaveBand(f, rate), y = DSP.filterReversed(room, b.sections), n = y.length, edc = new Float64Array(n); let acc = 0; for (let i = n - 1; i >= 0; i--) { acc += y[i] * y[i]; edc[i] = acc; } const db = i => 10 * Math.log10(edc[i] / edc[0]); let i1 = -1, i2 = -1; for (let i = 0; i < n; i++) { if (i1 < 0 && db(i) <= -top) i1 = i; if (db(i) <= -bottom) { i2 = i; break; } } return -60 / AN.regress(i => i / rate, db, i1, i2, 10).slope; };
      const mid = r.bands.filter(b => b.f >= 250), low = r.bands.find(b => b.f === 125);
      check(`Laptop on a desk (${rate / 1000} kHz): 250 Hz–4 kHz within 5 % of the room's own decay`, mid.every(b => b.rt60 != null && near(b.rt60, own(b.f, b.path), 0.05)), r.bands.map(b => `${b.f}: ${b.rt60 == null ? '—' : b.rt60.toFixed(3)} ${b.path || ''}${b.path ? ` / ${own(b.f, b.path).toFixed(3)}` : ''}`).join(' · '));
      check(`Laptop on a desk (${rate / 1000} kHz): no value at 125 Hz, where its speaker plays nothing`, low.rt60 == null && !!low.reason, low.reason);
    }
    // T20 and T30 come from their own ranges of the decay curve and are extrapolated to 60 dB (T = −60 / slope): each
    // matches the room's own decay over the same range.
    {
      const ir = FIX.roomIR({ fs, seconds: 3, rt: 0.6, seed: 17 });
      const a = AN.analyseTake(FIX.recordSweep({ plan, sweep, ir, noiseDbfs: -80 }), plan, sweep), b = a.bands.find(x => x.f === 1000);
      const t20 = b.fits.T20, t30 = b.fits.T30, o20 = ownDecay(ir, 1000, 'T20'), o30 = ownDecay(ir, 1000, 'T30');
      check('T20 (−5…−25 dB) and T30 (−5…−35 dB) from their own ranges, extrapolated to 60 dB', t20 && t30 && t20.from === -5 && t20.to === -25 && t30.from === -5 && t30.to === -35 && near(t20.T, o20, 0.03) && near(t30.T, o30, 0.03) && Math.abs(t20.T * t20.slope + 60) < 0.2 && Math.abs(t30.T * t30.slope + 60) < 0.2,
        t20 && t30 ? `T20 ${t20.T} s over ${t20.from}…${t20.to} dB (slope ${t20.slope} dB/s; room ${o20.toFixed(3)} s), T30 ${t30.T} s over ${t30.from}…${t30.to} dB (room ${o30.toFixed(3)} s); nominal 0.6 s` : 'no fit');
    }
    // Echo cancellation, noise suppression or automatic gain that the browser reports as still on: no RT60 at all.
    {
      const ir = FIX.roomIR({ fs, seconds: 3, rt: 0.7, seed: 19 });
      const a = AN.analyseTake(FIX.recordSweep({ plan, sweep, ir }), plan, sweep);
      const take = settings => ({ id: 't', takenAt: '', status: a.status, levels: a.levels, plan, sampleRate: fs, analysis: a, warnings: [], settings });
      const off = PROC.evaluate(take({ echoCancellation: false, noiseSuppression: false, autoGainControl: false }), {});
      const on = PROC.evaluate(take({ echoCancellation: false, noiseSuppression: true, autoGainControl: false }), {});
      const aec = PROC.evaluate(take({ echoCancellation: true }), {});
      check('Browser processing reported off: the take gives an RT60', off.valid && off.headline && off.bands.filter(b => b.rt60 != null).length === 6, off.headline && `${off.headline.rt60} s at 1000 Hz`);
      check('Browser kept noise suppression or echo cancellation on: no RT60 in any band, and the reason says why', !on.valid && !aec.valid && on.bands.every(b => b.rt60 == null) && aec.bands.every(b => b.rt60 == null) && /noise suppression/.test(on.reason) && /echo cancellation/.test(aec.reason), `${on.reason} | ${aec.reason}`);
    }

    /* RT60 deep audit: a curved (double-slope) decay, independence from the background level, gaps in the recording. */
    // A room with a fast early decay and a slower late one (0.25 s, then 0.8 s 14 dB lower). The app reports T20 (ISO
    // 3382-2's preferred range, from −5 dB on the whole curve) and works out T30 as the check that flags the curvature.
    // Before the direct-sound cap, the early decay was taken for the device's direct sound and the evaluation started in
    // the late decay (+15…+37 % here).
    {
      const early = FIX.roomIR({ fs, seconds: 2.5, rt: 0.25, seed: 5 }), late = FIX.roomIR({ fs, seconds: 2.5, rt: 0.8, seed: 505 });
      const room = early.map((v, i) => v + late[i] * Math.pow(10, -14 / 20));
      let e = 0; for (const v of room) e += v * v;
      const gap = Math.round(0.002 * fs), dev = new Float64Array(room.length + gap);
      dev[0] = Math.sqrt(e * 100); for (let i = 0; i < room.length; i++) dev[gap + i] += room[i];
      const pk = dev[0]; for (let i = 0; i < dev.length; i++) dev[i] /= pk;
      // With the device's direct sound 20 dB above the decay, the evaluation starts below it: T20 then reads up to 5.2 %
      // short of the room's own T20 in this curved decay (2 kHz), inside the 8 % this suite allows T20 (the T30 it reported
      // before read within 5 % of the room's own T30).
      for (const [label, ir, tol] of [['no direct sound', room, 0.02], ['one device, direct sound 20 dB', dev, 0.08]]) {
        const r = runTake(FIX.recordSweep({ plan, sweep, ir, peakDbfs: -10, noiseDbfs: -75 }));
        const own = r.bands.map(b => (b.path ? ownDecay(room, b.f, b.path) : null));
        check(`Double-slope decay, ${label}: every band's T20 within ${tol * 100} % of the room's own (ISO 3382-2), with the T30 check worked out and the decay flagged as curved`,
          r.bands.every((b, k) => b.path === 'T20' && b.t30 != null && near(b.rt60, own[k], tol) && b.notes.some(n => /curved/.test(n)) && b.confidence !== 'High'),
          r.bands.map((b, k) => `${b.f}: ${b.rt60 == null ? '—' : b.rt60.toFixed(3)} ${b.path || ''} / room ${own[k] == null ? '—' : own[k].toFixed(3)}, C ${b.curvature} %`).join(' · '));
      }
    }
    // The same room in a noisier and a much quieter moment: the same evaluation range (T20), so the same value. A 60 dB fit
    // (the earlier T60 path, used from 75 dB usable) read this room's 125 Hz band 0.79–0.80 s instead of 0.72 s.
    {
      const ir = FIX.roomIR({ fs, seconds: 3, rt: 0.8, seed: 11 });
      const [a, b] = [-55, -95].map(noiseDbfs => runTake(FIX.recordSweep({ plan, sweep, ir, noiseDbfs })));
      check('Background −55 vs −95 dBFS: T20 in both, every band within 1 % (RT60 does not depend on how quiet the room was)',
        a.bands.every((x, k) => x.path === 'T20' && b.bands[k].path === 'T20' && near(b.bands[k].rt60, x.rt60, 0.01)),
        a.bands.map((x, k) => `${x.f}: ${x.rt60} ${x.path} (${Math.round(x.decayRangeDb)} dB) / ${b.bands[k].rt60} ${b.bands[k].path} (${Math.round(b.bands[k].decayRangeDb)} dB, 60 dB fit ${b.bands[k].t60})`).join(' · '));
    }
    // A gap in the recording during the sweep (the browser fills audio it failed to deliver with zeros, one 128-sample
    // block or more): the take is rejected with the gap's position and length. Without this check these gave wrong
    // values that passed as valid (1000 Hz 1.002 s for a 0.525 s room with 20 ms missing).
    {
      const ir = FIX.roomIR({ fs, seconds: 2.5, rt: 0.5, seed: 23, directDb: 25 });
      const base = FIX.recordSweep({ plan, sweep, ir, peakDbfs: -12, noiseDbfs: -65, noiseKind: 'pink', latency: 0.06 });
      const cut = (at, len) => { const rec = Float32Array.from(base), s = Math.round((plan.preRoll + 0.06 + at) * fs); rec.fill(0, s, s + len); return AN.analyseTake(rec, plan, sweep); };
      const g1 = cut(3.0, 128), g2 = cut(1.5, 960), ok = AN.analyseTake(base, plan, sweep);
      check('Gap of one render block (128 samples) or 20 ms during the sweep: take rejected, position and length given',
        g1.status === 'failed' && /gap/.test(g1.reason) && g1.gap.ms === 2.7 && Math.abs(g1.gap.atSec - 4.06) < 0.01 && g2.status === 'failed' && g2.gap.ms === 20 && ok.status === 'captured' && ok.gap == null,
        `${g1.reason} | ${g2.gap && `${g2.gap.ms} ms at ${g2.gap.atSec} s`} | without a gap: ${ok.status}`);
      // A quiet take quantised to 16 bits with no noise holds values near the sine's peaks; that is not a gap.
      const quiet = [-50, -70].map(pk => AN.analyseTake(FIX.recordSweep({ plan, sweep, ir, peakDbfs: pk, noiseDbfs: -200 }).map(v => Math.round(v * 32768) / 32768), plan, sweep));
      check('Quiet 16-bit take with no noise (−50 and −70 dBFS peak): no gap reported', quiet.every(a => a.gap == null && !/gap/.test(a.reason || '')), quiet.map(a => `${a.status} ${a.reason || ''}`).join(' | '));
    }

    // A decay cut off 26 dB down (a 0.7 s room whose response stops at 0.3 s, as a noise gate would): no value in any
    // band, and the reason names the cut. Before this check, 500 Hz–4 kHz read 0.57–0.59 s and passed as valid.
    {
      const r = runTake(FIX.recordSweep({ plan, sweep, ir: FIX.roomIR({ fs, seconds: 0.3, rt: 0.7, seed: 9 }) }));
      check('Decay cut off 26 dB down: no value in any band, the reason names the cut', !r.valid && r.bands.every(b => b.rt60 == null) && r.bands.filter(b => /cut off/.test(b.reason || '')).length >= 4,
        r.bands.map(b => `${b.f}: ${(b.reason || '').slice(0, 60)}`).join(' · '));
    }

    // T20 and T30 too far apart for one RT60 (CRITERIA.decay.curvatureFail): the band has no value, with the reason. Within
    // the limits the value stays, with a note and medium confidence. One band's decision, from its two straight fits.
    {
      const PR = AM.services.processing, band = (f, t20, t30) => PR.decideBand({ f, supported: true, decayRangeDb: 50, noiseFloorDb: -80, peakToNoiseDb: 60, headDb: 0, bandwidth: f / Math.SQRT2, fits: { T20: { T: t20, r2: 0.9999 }, T30: { T: t30, r2: 0.9999 } } });
      const ok = band(1000, 0.6, 0.66), bent = band(1000, 0.6, 0.87), slower = band(1000, 0.6, 0.93), faster = band(1000, 0.6, 0.4), low = band(125, 0.6, 0.4), lowFaster = band(125, 0.6, 0.33);
      check('T20 and T30 within 10 %: the value stands (T20), high confidence', ok.rt60 === 0.6 && ok.path === 'T20' && ok.confidence === 'High', `${ok.rt60} ${ok.path} C ${ok.curvature} % ${ok.confidence}`);
      check('T30 45 % longer than T20 (a curved decay): the value stands with a note and medium confidence', bent.rt60 === 0.6 && bent.notes.some(n => /curved/.test(n)) && bent.confidence === 'Medium', `${bent.rt60} C ${bent.curvature} %`);
      check('T30 55 % longer than T20: no value in the band, and the reason says the two are too far apart', slower.rt60 == null && slower.path == null && /55 % longer than T20/.test(slower.reason || '') && slower.confidence === 'None', slower.reason);
      check('T30 33 % shorter than T20 at 1000 Hz (the decay speeds up): no value, and the reason points to noise suppression', faster.rt60 == null && /shorter than T20/.test(faster.reason || '') && /noise gate|Noise suppression/.test(faster.reason || ''), faster.reason);
      check('At 125 Hz, where T20 and T30 scatter more: 33 % shorter keeps the value with a note; 45 % shorter gives none', low.rt60 === 0.6 && low.notes.length > 0 && lowFaster.rt60 == null && /shorter than T20/.test(lowFaster.reason || ''), `${low.rt60} / ${lowFaster.reason}`);
    }

    // Speech-like sounds during the take (300–3000 Hz, 15 dB above the background, every 0.8–2.5 s): read from the take's
    // own background, they are counted as noise. Before, a burst inside a decay with little margin gave 1000 Hz +12.6 %
    // and 4000 Hz +17.1 % as valid values (tests/noise-study.html). The same take without them is unaffected.
    {
      const room = FIX.roomIR({ fs, seconds: 2, rt: 0.5, seed: 950 }), ir = FIX.roomIR({ fs, seconds: 2, rt: 0.5, seed: 950, directDb: 28, reflections: DESK });
      const total = Math.round(plan.total * fs), bp = x => DSP.filter(x, [DSP.rbj('highpass', 300, fs, 0.54), DSP.rbj('highpass', 300, fs, 1.31), DSP.rbj('lowpass', 3000, fs, 0.54), DSP.rbj('lowpass', 3000, fs, 1.31)]);
      const quietRec = FIX.recordSweep({ plan, sweep, ir, noiseDbfs: -61, noiseKind: 'pink', seed: 951, latency: 0.07 });
      const voice = bp(FIX.noise(total, 952)), base = bp(FIX.background(total, -61, 951, 'pink'));
      let ev = 0, eb = 0; for (let i = 0; i < total; i++) { ev += voice[i] * voice[i]; eb += base[i] * base[i]; }
      const g = Math.sqrt(eb / ev * Math.pow(10, 1.5)), r = FIX.rng(953), noisyRec = Float32Array.from(quietRec);
      for (let t = 0.3 + r(); t < plan.total; t += 0.8 + 1.7 * r()) {
        const len = Math.round((0.15 + 0.35 * r()) * fs), a = Math.round(t * fs);
        for (let i = 0; i < len && a + i < total; i++) noisyRec[a + i] += g * voice[a + i] * Math.sin(Math.PI * i / len);
      }
      const clean = runTake(quietRec), noisy = runTake(noisyRec);
      const wrong = noisy.bands.filter(b => b.rt60 != null && b.f >= 250 && Math.abs(b.rt60 / ownDecay(room, b.f, b.path) - 1) > (b.path === 'T20' ? 0.08 : 0.05));
      check('Speech-like sounds during the take: counted as noise, no wrong value, and the reason says so', !wrong.length && noisy.bands.some(b => b.disturbanceDb >= 10) && noisy.bands.filter(b => b.rt60 == null).every(b => /Sounds during the take|Only \d+ dB/.test(b.reason)),
        noisy.bands.map(b => `${b.f}: ${b.rt60 == null ? `— (${(b.reason || '').slice(0, 40)}…)` : `${b.rt60.toFixed(3)} ${b.path}`} sounds ${b.disturbanceDb || 0} dB`).join(' · '));
      check('The same take without them: no sounds found', clean.bands.every(b => !b.disturbanceDb) && clean.valid, clean.bands.map(b => `${b.f}: ${b.rt60 == null ? '—' : b.rt60.toFixed(3)}`).join(' · '));
    }

    /* Sweep level: the playback level of the test sweep relative to the default, applied once to the played copy. */
    {
      const g = AN.levelGain, r = AN.levelRange(), lim = AN.CRITERIA.take.level.maxPeak;
      const conv = [[0, 1], [3, 1.41254], [6, 1.99526], [-3, 0.70795], [-6, 0.50119], [-12, 0.25119]];
      check('Sweep level: dB to amplitude, 10^(dB/20)', conv.every(([d, x]) => Math.abs(g(d) - x) < 1e-5), conv.map(([d]) => `${d} dB → ×${g(d).toFixed(5)}`).join(' · '));
      // The range follows the sweep's headroom: 0.7 (−3.1 dBFS) leaves room for +3 dB (peak 0.989), not +6 dB (1.397).
      check('Sweep level: range −12 … +3 dB in 3 dB steps, default 0; the top keeps the peak below full scale and one step more would clip',
        r.min === -12 && r.max === 3 && r.step === 3 && r.default === 0 && AN.CRITERIA.take.amplitude * g(r.max) <= lim && AN.CRITERIA.take.amplitude * g(r.max + r.step) > lim,
        `${JSON.stringify(r)}; peak at +3 dB ${(AN.CRITERIA.take.amplitude * g(3)).toFixed(3)}, at +6 dB ${(AN.CRITERIA.take.amplitude * g(6)).toFixed(3)}`);
      const keep = AN.CRITERIA.take.level.maxDb; AN.CRITERIA.take.level.maxDb = 12;
      const capped = AN.levelRange().max; AN.CRITERIA.take.level.maxDb = keep;
      check('Sweep level: a configured maximum above the headroom is still held to the headroom', capped === 3, `maxDb 12 configured → ${capped} dB allowed`);
      const norm = [[4, 3], [6, 3], [9, 3], [-20, -12], [-4, -3], [-3, -3], [NaN, 0], [Infinity, 0], ['3', 0], [undefined, 0], [null, 0]];
      check('Sweep level: invalid, off-step and out-of-range values become valid levels', norm.every(([x, y]) => AN.sweepLevel(x) === y), norm.map(([x]) => `${String(x)} → ${AN.sweepLevel(x)}`).join(' · '));
      // The Measure step's − / + action: the next valid level, never past the limits; reset is the default.
      const press = (x, d) => AN.sweepLevel(AN.sweepLevel(x) + Math.sign(d) * r.step);
      let up = 0; const ups = []; for (let i = 0; i < 3; i++) ups.push(up = press(up, 1));
      let dn = 0; const dns = []; for (let i = 0; i < 6; i++) dns.push(dn = press(dn, -1));
      check('Sweep level: + and − step by 3 dB and stop at the limits', ups.join() === '3,3,3' && dns.join() === '-3,-6,-9,-12,-12,-12', `+ from 0: ${ups.join(', ')} · − from 0: ${dns.join(', ')}`);
      // Exactly once, and only on the played copy: the reference sweep and its inverse filter do not change.
      const ref0 = AN.makeSweep(plan), ref3 = AN.makeSweep(Object.assign({}, plan, { levelDb: 3 })), before = Float32Array.from(ref0.signal);
      const pl = [-12, -3, 0, 3].map(d => AN.playbackSignal(ref0.signal, d));
      const exact = pl.every(x => { let e = 0; for (let i = 0; i < x.signal.length; i++) e = Math.max(e, Math.abs(x.signal[i] - ref0.signal[i] * x.gain)); return e < 1e-6 && x.peak <= lim; });
      const same = ref3.signal.every((v, i) => v === ref0.signal[i]) && ref3.inverse.every((v, i) => v === ref0.inverse[i]) && ref0.signal.every((v, i) => v === before[i]);
      check('Sweep level: the gain is applied once, to the played copy; the reference sweep and inverse filter are unchanged', exact && same, pl.map(x => `${x.levelDb} dB: ×${x.gain.toFixed(4)}, peak ${x.peak.toFixed(3)}`).join(' · '));
      let threw = false; try { AN.playbackSignal(Float32Array.from(ref0.signal, v => v * 1.3), 3); } catch (e) { threw = /clip/.test(e.message); }
      check('Sweep level: a signal that would clip at the chosen level is refused, not played', threw, threw ? 'refused' : 'played');

      // The same room measured at 0 and +3 dB: the played sweep is 3 dB louder, the recording is not scaled again, RT60 is
      // the room's. One playback-to-microphone gain for both takes, the same background noise.
      const room = FIX.roomIR({ fs, seconds: 2.2, rt: 0.6, seed: 960 }), ir = FIX.roomIR({ fs, seconds: 2.2, rt: 0.6, seed: 960, directDb: 28, reflections: DESK });
      const total = Math.round(plan.total * fs), r0 = DSP.convolve(ref0.signal, ir);
      let pk = 0; for (const v of r0) pk = Math.max(pk, Math.abs(v));
      const chain = Math.pow(10, -15 / 20) / pk;
      const take = d => {
        const resp = DSP.convolve(AN.playbackSignal(ref0.signal, d).signal, ir), x = FIX.background(total, -62, 961, 'pink'), st = Math.round((plan.preRoll + 0.07) * fs);
        for (let i = 0; i < resp.length && st + i < total; i++) x[st + i] += resp[i] * chain;
        const rec = Float32Array.from(x), copy = Float32Array.from(rec);
        const a = AN.analyseTake(rec, Object.assign({}, plan, { levelDb: d }), ref0);
        return { a, r: PROC.evaluate({ id: 't', takenAt: '', status: a.status, levels: a.levels, plan, sampleRate: fs, analysis: a, warnings: [] }, {}), untouched: rec.every((v, i) => v === copy[i]), rec };
      };
      const t0 = take(0), t3 = take(3), tm = take(-6);
      const lift = t3.a.levels.sweepDbfs - t0.a.levels.sweepDbfs, liftM = tm.a.levels.sweepDbfs - t0.a.levels.sweepDbfs;
      const b0 = t0.a.bands.find(b => b.f === 1000), b3 = t3.a.bands.find(b => b.f === 1000);
      check('Sweep level: +3 dB lifts the recorded sweep by 3 dB and −6 dB lowers it by 6 dB (the gain counted once; the recording itself is not scaled)',
        Math.abs(lift - 3) < 0.2 && Math.abs(liftM + 6) < 0.2 && t0.untouched && t3.untouched && tm.untouched,
        `recorded sweep ${t0.a.levels.sweepDbfs} / ${t3.a.levels.sweepDbfs} / ${tm.a.levels.sweepDbfs} dBFS at 0 / +3 / −6 dB: ${lift.toFixed(2)} and ${liftM.toFixed(2)} dB; usable decay at 1000 Hz ${b0.decayRangeDb} → ${b3.decayRangeDb} dB`);
      const own = b => ownDecay(room, b.f, b.path);
      const ok = res => res.bands.every(b => b.rt60 == null || b.f < 250 || Math.abs(b.rt60 / own(b) - 1) <= (b.path === 'T20' ? 0.08 : 0.05));
      const both = t0.r.bands.filter((b, k) => b.rt60 != null && t3.r.bands[k].rt60 != null && b.path === t3.r.bands[k].path);
      check('Sweep level: RT60 is the room\'s at 0 and +3 dB and agrees between them; at −6 dB, where less decay remains, no band gives a wrong value', ok(t0.r) && ok(t3.r) && ok(tm.r) && both.length >= 4 && both.every(b => Math.abs(t3.r.bands.find(x => x.f === b.f).rt60 / b.rt60 - 1) <= 0.03),
        t0.r.bands.map((b, k) => `${b.f}: ${b.rt60 == null ? '—' : b.rt60.toFixed(3)} / ${t3.r.bands[k].rt60 == null ? '—' : t3.r.bands[k].rt60.toFixed(3)} / ${tm.r.bands[k].rt60 == null ? '—' : tm.r.bands[k].rt60.toFixed(3)}`).join(' · '));
      // The level is information for the analysis (it only words the advice): the same recording gives the same RT60.
      const alt = AN.analyseTake(t3.rec, Object.assign({}, plan, { levelDb: -12 }), ref0);
      check('Sweep level: the RT60 calculation does not depend on the level setting (same recording, any level)', alt.bands.every((b, k) => JSON.stringify(b.fits) === JSON.stringify(t3.a.bands[k].fits) && b.decayRangeDb === t3.a.bands[k].decayRangeDb), 'fits and usable decay identical');
      // Advice that names the level: overloaded at +3 dB → lower it; too quiet at −12 dB → raise it.
      const clip = AN.analyseTake(Float32Array.from(t3.rec, v => Math.max(-1, Math.min(1, v * 60))), Object.assign({}, plan, { levelDb: 3 }), ref0);
      const quiet = AN.analyseTake(Float32Array.from(FIX.recordSweep({ plan, sweep: ref0, ir, peakDbfs: -60, noiseDbfs: -62 })), Object.assign({}, plan, { levelDb: -12 }), ref0);
      check('Sweep level: an overloaded or too quiet take says which way to move the level', /Lower the sweep level \(now \+3 dB\)/.test(clip.reason) && /Raise the sweep level \(now −12 dB\)/.test(quiet.reason), `${clip.reason} | ${quiet.reason}`);

      // Distortion products, read from the sweep: known 2nd and 3rd harmonics (a memoryless curve on the played sweep).
      const A = AN.CRITERIA.take.amplitude, rd = fn => AN.analyseTake((() => { const resp = DSP.convolve(Float32Array.from(ref0.signal, fn), ir), x = FIX.background(total, -66, 962, 'pink'), st = Math.round((plan.preRoll + 0.07) * fs); for (let i = 0; i < resp.length && st + i < total; i++) x[st + i] += resp[i] * chain; return Float32Array.from(x); })(), plan, ref0).distortion;
      const h2 = rd(v => v + 2 * Math.pow(10, -30 / 20) / A * v * v), h3 = rd(v => v - 4 * Math.pow(10, -30 / 20) / (A * A) * v * v * v), clean = rd(v => v);
      check('Distortion: a 2nd harmonic at −30 dB reads −30 ± 1.5 dB, a 3rd at −30 dB reads −30 ± 1.5 dB, none without distortion',
        h2.h2Db != null && Math.abs(h2.h2Db + 30) <= 1.5 && h3.h3Db != null && Math.abs(h3.h3Db + 30) <= 1.5 && clean.h2Db == null && clean.h3Db == null && clean.floorDb < -55,
        `2nd ${h2.h2Db} dB · 3rd ${h3.h3Db} dB · clean: ${clean.h2Db} / ${clean.h3Db}, below ${clean.floorDb} dB`);
    }

    // Background-noise analysis
    {
      const n = Math.round((AN.CRITERIA.noise.seconds + AN.CRITERIA.noise.settle) * fs);
      const steady = Float32Array.from(FIX.background(n, -55, 81));
      const r1 = AN.analyseNoise(steady, fs);
      check('Steady noise: valid, level as generated', r1.status === 'valid' && Math.abs(r1.leqDbfs + 55) < 0.5, `${r1.status}, Leq ${r1.leqDbfs} dBFS, spread ${r1.spreadDb} dB`);

      // Sudden sounds and a changing level are a caution, not a stop: the take checks its own background
      // (tests/noise-study.html: takes in such backgrounds gave no wrong value once the take checks it).
      const bursts = Float32Array.from(steady);
      for (let k = 1; k < 5; k++) { const s = Math.round(k * fs); for (let i = 0; i < 0.08 * fs; i++) bursts[s + i] += 0.3 * Math.sin(i * 0.2); }
      const r2 = AN.analyseNoise(bursts, fs);
      check('Noise with sudden sounds: a caution that names them', r2.status === 'warning' && /voices, knocks/.test(r2.warnings.join(' ')), `${r2.status}: ${r2.warnings.join(' ')}`);

      const step = Float32Array.from(steady);
      for (let i = Math.round(n * 0.6); i < n; i++) step[i] *= 4;
      const r3 = AN.analyseNoise(step, fs);
      check('Noise that rises part-way (ventilation): a caution that says it rose, not that sounds were heard', r3.status === 'warning' && /rose by/.test(r3.warnings.join(' ')) && !/voices, knocks/.test(r3.warnings.join(' ')), `${r3.status}: ${r3.warnings.join(' ')}`);

      // Steady room noise that is mostly ventilation rumble (15–60 Hz, 12 dB more energy than the pink noise above it),
      // −49.5 dBFS: its broadband 125 ms levels scatter by several dB at random; in the measured bands it is steady.
      const pk = FIX.pink(n, 82), rum = DSP.filter(FIX.noise(n, 83), [DSP.rbj('highpass', 15, fs, 0.54), DSP.rbj('highpass', 15, fs, 1.31), DSP.rbj('lowpass', 60, fs, 0.54), DSP.rbj('lowpass', 60, fs, 1.31)]);
      let ep = 0, er = 0; for (let i = 0; i < n; i++) { ep += pk[i] * pk[i]; er += rum[i] * rum[i]; }
      const rg = Math.sqrt(ep / er * Math.pow(10, 1.2)), mixed = pk.map((v, i) => v + rg * rum[i]);
      let em = 0; for (const v of mixed) em += v * v;
      const r6 = AN.analyseNoise(Float32Array.from(mixed, v => v * Math.pow(10, -49.5 / 20) / Math.sqrt(em / n)), fs);
      check('Steady ventilation rumble (−49.5 dBFS): suitable, judged in the measured bands', r6.status === 'valid' && r6.inBand.spreadDb < 3 && r6.inBand.soundDb < 5,
        `${r6.status}; broadband L10 − L90 ${r6.spreadDb} dB, loudest above L90 ${r6.jumpDb} dB; in band ${r6.inBand.spreadDb} dB, loudest above the median ${r6.inBand.soundDb} dB`);

      // A muted microphone and a device that silences a quiet room look the same: the room cannot be assessed, and the
      // check says so (with both causes) instead of accepting a level or blaming the room.
      const r4 = AN.analyseNoise(new Float32Array(n), fs);
      check('Silent input: background not assessed (no level accepted), with both possible causes named', r4.status === 'unassessed' && /Unable to assess/.test(r4.warnings[0]) && /muted/.test(r4.warnings[0]) && /noise suppression/.test(r4.warnings[0]), r4.warnings.join(' '));

      const loud = Float32Array.from(steady).map(v => Math.max(-1, Math.min(1, v * 900)));
      const r5 = AN.analyseNoise(loud, fs);
      check('Overloaded input: noise measurement invalid', r5.status === 'invalid' && /overloaded/.test(r5.reasons.join(' ')), r5.reasons.join(' '));

      // The cautions say their levels in plain words ("N dB below max", "recording background noise"); the levels (dBFS),
      // the limits and the statuses behind them are unchanged.
      const high = AN.analyseNoise(Float32Array.from(FIX.background(n, -16, 84)), fs);
      const hw = high.warnings.find(w => /Recording background noise is high/.test(w)) || '';
      check('Loud steady background: a caution, not a rejection, at the same limit (−30 dBFS), said as dB below max with no dBFS or noise floor',
        AN.CRITERIA.noise.highDbfs === -30 && AN.CRITERIA.noise.silenceDbfs === -110 && high.status === 'warning' && high.unit === 'dBFS' && high.inBand.l50 > -30
          && hw.includes(`usually ${AM.util.fmt.dbfs(high.inBand.l50)} in the RT60 bands`) && !/dBFS|noise floor/i.test(hw), `${high.status}, in band ${high.inBand.l50} dBFS: ${hw}`);
      const faint = AN.analyseNoise(Float32Array.from(steady, v => v * Math.pow(10, -70 / 20)), fs);
      check('Faint input below the silence limit: not assessed, and its level said as dB below max', faint.status === 'unassessed' && faint.inBand.leqDbfs < -110
        && faint.warnings[0].includes(`(${AM.util.fmt.dbfs(faint.inBand.leqDbfs)}, quieter than 110 dB below max)`) && !/dBFS/.test(faint.warnings[0]), `${faint.inBand.leqDbfs} dBFS: ${faint.warnings[0]}`);
    }
    return results;
  }

  window.TEST_DONE = runAll().then(r => {
    const el = document.getElementById('out');
    if (el) el.innerHTML = r.map(t => `<li class="${t.ok ? 'ok' : 'bad'}"><b>${t.ok ? 'PASS' : 'FAIL'}</b> ${t.name}<br><small>${t.detail || ''}</small></li>`).join('');
    document.title = `${r.filter(t => t.ok).length}/${r.length} passed`;
    return r;
  }, e => { document.title = 'error'; throw e; });
})();
