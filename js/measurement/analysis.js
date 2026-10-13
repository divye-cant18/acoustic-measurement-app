/* Acoustic analysis of real recordings. Pure functions: captured samples in, numbers and the evidence behind them out.
   Nothing here generates, assumes or substitutes a measured value. When the data cannot support a value, the value is
   null and a reason says why.

   Levels are relative input levels in dBFS (decibels below digital full scale). They are not sound pressure levels:
   no microphone calibration exists (see calibration in services/measurement.js).

   analyseNoise(samples, fs)          background noise: is the room suitable, and what may cost a take
     125 ms frame levels ("fast"), Leq, L10/L50/L90, spread, change between the first and last third, clipping, octave-band
     Leq. The verdict uses the bands RT60 is measured in (88 Hz–5.7 kHz): sounds (the loudest moment above the median, in
     any octave band) and a changing level give a caution; only a silent or overloaded input has to be measured again.
   sweepPlan(fs) / makeSweep(plan)    exponential sine sweep and its inverse filter (Farina 2000, ISO 18233)
   analyseTake(recording, plan, sweep)
     1. raw recording checks: complete, not silent, not clipped, sweep clearly above the pre-roll noise
     2. deconvolution: recording ∗ inverse sweep → impulse response; the arrival time (the device's playback-to-recording
        delay) is found from the response peak, never assumed, and must stand clearly above the response before it
     3. onset: first point within 10 ms before the peak whose energy is within 20 dB of the peak (ISO 3382-1)
     4. per octave band: time-reversed band filtering; squared response; noise floor and truncation point by Lundeby's
        iterative method (Lundeby et al. 1995); Schroeder backward integration of the squared response minus that
        noise floor, up to the truncation point, with the energy of the extrapolated (noise-free) tail added
        (ISO 3382-2 allows combining truncation, tail correction and noise subtraction); then the four parts of the
        response are told apart (below); least-squares fits of the room's decay over −5…−25 dB (T20), −5…−35 dB (T30)
        and −5…−65 dB (T60, for information only), each with r².
   Whether T30 or T20 is used, and whether a band is reliable, is decided in services/processing.js.
   A take is rejected before any band is analysed when the recording is incomplete, silent, clipped, too quiet, has no
   clear arrival, or has a gap (a run of identical samples, which is how a browser fills audio it failed to deliver)
   during the test signal: a gap there spreads through the whole impulse response.
   After the bands, the take's own background (before the sweep, and after every decay has ended) is read band by band
   for recurring sounds (CRITERIA.take.disturbance); processing.js counts them as noise.

   One device is both the source and the receiver: its speaker plays the sweep and its microphone, a few centimetres
   away, records the room. The direct sound therefore reaches the microphone far louder than the room's reverberation
   (typically 10–30 dB), and a standard evaluation that starts 5 dB below the total energy would start inside the direct
   sound. Each band's response is therefore read as four parts, all from the recording:
     direct sound and early reflections   the energy that arrives above the room's reverberant decay (headDb), never
                                           more than the energy of the first CRITERIA.decay.directWindow (5 ms) after
                                           the arrival: the device's direct sound and its nearest reflections arrive
                                           within that time, so a larger excess is the room's own fast early decay
                                           (a curved, double-slope decay) and stays in the evaluation, as in ISO 3382-2
     reverberant decay                     the straight part of the decay curve, found by fitting below the early part
                                           and extrapolating back to the arrival; when the direct sound adds more than
                                           CRITERIA.decay.directAllowanceDb to the curve's start, the evaluation ranges
                                           move down by the excess, so they measure the room and not the device
     background noise                      the level the decay sinks into (Lundeby), with the 10 dB margin above it
   Nothing about the device (speaker-to-microphone distance, delay) is assumed. Without a dominant direct sound headDb
   is close to 0 and the evaluation is the usual ISO 3382-2 one. */
(function (AM) {
  'use strict';
  const DSP = AM.dsp, BANDS = AM.demo.BANDS;

  /* Measurement criteria. Thresholds and method settings, not measured values. */
  const CRITERIA = {
    noise: {
      seconds: 5,          // measurement window
      settle: 0.3,         // discarded at the start while the input settles
      frame: 0.125,        // short-term level frames ("fast" time weighting)
      silenceDbfs: -110,   // below this nothing is reaching the input (muted, switched off, blocked)
      // Steadiness is judged on the frequencies RT60 is measured in: the octave bands 125–4000 Hz, edge to edge. Below
      // them, room noise is mostly ventilation rumble, whose 125 ms levels scatter by 3–6 dB at random even when it is
      // perfectly steady, and which no RT60 band hears; judged broadband, it hid speech and flagged harmless changes.
      band: [88.4, 5657],
      highDbfs: -30,       // a usual level (median, in the bands) this loud leaves little room below full scale for the test signal
      // Caution, never a stop: the take checks its own background (CRITERIA.take.disturbance), so these only say what
      // may cost a take. The noise study (tests/noise-study.html) found a level fluctuating ±3 dB (L10 − L90 up to
      // 11 dB) or falling by 6 dB harmless, and speech-like sounds 15 dB above the background the real risk.
      soundDb: 10,         // loudest 125 ms above the median around it (±1 s), in any octave band: speech, knocks, doors
      changeDb: 6,         // last third against first third: ventilation switching, traffic building up
    },
    take: {
      preRoll: 1.0,        // s recorded before the sweep starts: the background during the take
      sweepSeconds: 5,     // sweep length
      tail: 4.0,           // s recorded after the sweep ends: room for the decay and for the noise floor after it
      f1: 50,              // sweep start frequency, Hz
      f2: 10000,           // sweep end frequency, Hz, limited to 45 % of the sample rate
      nyquistShare: 0.45,
      amplitude: 0.7,      // digital peak of the sweep at the default level (−3.1 dBFS); loudness is set with the device volume
      // Sweep level: the user's playback level relative to that default, in dB of digital amplitude (gain 10^(dB/20)),
      // applied once, to the played copy of the sweep (playbackSignal). Not sound pressure: the device and its volume
      // decide that. The highest level is the highest step whose peak stays at or below maxPeak (0.7 → +3 dB, peak 0.989,
      // −0.1 dBFS; +6 dB would clip). The lowest: each 3 dB down costs 3 dB of usable decay, and below −12 dB a take
      // rarely keeps enough of it (tests/sweep-study.html: about 41 dB usable at 1 kHz in a typical room); the device
      // volume is the control for more than that.
      level: { stepDb: 3, minDb: -12, maxDb: 3, maxPeak: 0.99 },
      // Distortion products (see distortion()) this close to the main response are mentioned: the sweep keeps them out
      // of the decay, but they cost usable decay (a 3rd harmonic read at −14 dB cost about 4 dB in tests/validation.html).
      distortionNoteDb: -20,
      // A long, gentle start: an abrupt start at f1 leaves a slowly fading artefact in the impulse response that a
      // strong direct sound (speaker and microphone on one device) lifts into the decay range of the 125 Hz band.
      fadeIn: 0.3, fadeOut: 0.01,
      clipLevel: 0.999,    // a recorded sample at or above this is treated as clipped
      minSweepSnrDb: 10,   // recording level during the sweep above the pre-roll background
      maxLatency: 1.0,     // s; a sweep arriving later than this is not accepted as the played signal
      minArrivalDb: 20,    // the response peak must stand this far above the response before it, or the arrival is unclear
      onsetDb: 20, onsetWindow: 0.01, preOnset: 0.1, guard: 0.05,
      // Gaps: a run of identical samples this long (s) during the test signal. A browser that fails to deliver audio
      // fills the missing render blocks (128 samples: 1.3–2.9 ms) with zeros; a real microphone signal never holds one
      // value for 1 ms. Checked from the end of the fade-in (plus margin) to just before the sweep ends.
      gapSeconds: 0.001, gapSkip: [0.35, 0.02],
      // Sounds during the take (voices, knocks, movement), read band by band from the take's own background: the second
      // before the sweep and the recording after every decay has reached the noise. Frames of max(frame, 8 / bandwidth)
      // seconds; a sound is a run of frames at least `db` above the median. Recurring (at least `events` of them), they
      // were most likely also there while the sweep played, where they cannot be seen, and in the decay they act as a
      // noise floor that comes and goes: processing.js then requires the usable decay above them.
      disturbance: { frame: 0.05, db: 10, events: 2, maxSeconds: 2 },
    },
    decay: {
      // Usable decay of the room's reverberation (from its start, below the direct sound, to the noise floor):
      // evaluation range + 5 dB start + 10 dB above noise.
      required: { T60: 75, T30: 45, T20: 35 },
      ranges: { T20: [5, 25], T30: [5, 35], T60: [5, 65] },
      // At the smallest source-to-microphone distance ISO 3382-2 allows (2·√(V/cT), about twice the critical distance)
      // the direct sound adds about 1 dB to the start of the decay curve. Up to that the evaluation is the standard one;
      // a stronger direct sound (one device) moves the ranges down by the excess, so they start where they would at
      // that distance.
      directAllowanceDb: 1,
      // The direct sound of one device (speaker and microphone a few centimetres apart) and the reflection from the
      // surface it lies on arrive within this time (s) of the arrival. What the decay curve loses in it caps headDb.
      directWindow: 0.005,
      envWindow: 0.01,     // 10 ms energy averaging for the peak-to-noise ratio
      // Cut-off decay: the energy of `before` 10 ms frames, at least aboveNoiseDb above the background, against the next
      // `after` frames, within nearNoiseDb of it, falls excessDb more than the room's own decay does over that time.
      // The first frame (the direct sound) is never part of `before`.
      cutoff: { before: 3, after: 5, aboveNoiseDb: 15, nearNoiseDb: 6, excessDb: 15 },
      xi: { warn: 10, fail: 50 },                  // non-linearity ξ = 1000·(1 − r²), per mille (ISO 3382-2 annex B)
      curvature: 10,       // C = 100·(T30/T20 − 1), percent (ISO 3382-2)
      minBT: 4,            // bandwidth × RT60 below this the band filter limits the result (time-reversed filtering)
    },
  };

  const r1 = x => Math.round(x * 10) / 10, r3 = x => Math.round(x * 1000) / 1000;
  const peakDb = a => 20 * Math.log10(Math.max(a, 1e-10));
  const pct = (sorted, p) => { const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); };
  const energyMeanDb = dbs => DSP.dbOf(dbs.reduce((s, d) => s + Math.pow(10, d / 10), 0) / dbs.length);

  // Least-squares line y = intercept + slope·t over indices i0…i1 (inclusive), every `step`-th point.
  function regress(tOf, yOf, i0, i1, step = 1) {
    let n = 0, st = 0, sy = 0, stt = 0, sty = 0, syy = 0;
    for (let i = i0; i <= i1; i += step) { const t = tOf(i), y = yOf(i); n++; st += t; sy += y; stt += t * t; sty += t * y; syy += y * y; }
    if (n < 3) return null;
    const vt = stt - st * st / n, vy = syy - sy * sy / n, cov = sty - st * sy / n;
    if (vt <= 0) return null;
    const slope = cov / vt;
    return { slope, intercept: (sy - slope * st) / n, r2: vy > 0 ? (cov * cov) / (vt * vy) : 1, n };
  }

  // Peak magnitude per bin, for drawing the recording.
  function waveform(x, bins = 240) {
    const out = [], step = x.length / bins;
    for (let j = 0; j < bins; j++) {
      let m = 0;
      for (let i = Math.floor(j * step), e = Math.floor((j + 1) * step); i < e; i++) { const a = Math.abs(x[i]); if (a > m) m = a; }
      out.push(Math.round(m * 10000) / 10000);
    }
    return out;
  }

  /* ---------- background noise ---------- */
  // 125 ms frame levels of x[a0…a0 + n·fr), and the steadiness figures drawn from them. `sound` is the loudest frame
  // above the median of the frames around it (±8, about ±1 s): a short sound stands out, a level that changes and stays
  // does not (that is `drift`).
  function frameStats(x, a0, fr, n) {
    const frames = [];
    for (let k = 0; k < n; k++) frames.push(DSP.dbOf(DSP.meanSquare(x, a0 + k * fr, a0 + (k + 1) * fr)));
    const sorted = frames.slice().sort((a, b) => a - b), third = Math.max(1, Math.floor(n / 3));
    let sound = -Infinity;
    for (let k = 0; k < n; k++) sound = Math.max(sound, frames[k] - pct(frames.slice(Math.max(0, k - 8), k + 9).sort((a, b) => a - b), 0.5));
    return {
      frames, leq: DSP.dbOf(DSP.meanSquare(x, a0, a0 + n * fr)), l90: pct(sorted, 0.1), l50: pct(sorted, 0.5), l10: pct(sorted, 0.9),
      spread: pct(sorted, 0.9) - pct(sorted, 0.1), jump: sorted[sorted.length - 1] - pct(sorted, 0.1), sound,
      drift: energyMeanDb(frames.slice(-third)) - energyMeanDb(frames.slice(0, third)),
    };
  }

  function analyseNoise(x, fs) {
    const c = CRITERIA.noise, a0 = Math.round(c.settle * fs), fr = Math.round(c.frame * fs);
    const res = {
      status: 'invalid', reasons: [], warnings: [], sampleRate: fs, seconds: 0,
      leqDbfs: null, l10: null, l50: null, l90: null, spreadDb: null, jumpDb: null, driftDb: null, inBand: null,
      peakDbfs: null, clippedSamples: 0, frames: [], bands: [],
    };
    const nFrames = Math.floor((x.length - a0) / fr);
    if (nFrames < 8) { res.reasons.push('The recording was too short to measure the background noise.'); return res; }
    const end = a0 + nFrames * fr;
    res.seconds = r1((end - a0) / fs);

    let peak = 0, clipped = 0;
    for (let i = a0; i < end; i++) { const a = Math.abs(x[i]); if (a > peak) peak = a; if (a >= CRITERIA.take.clipLevel) clipped++; }
    // Broadband: the level as the input receives it. In the bands: what the RT60 bands hear, which the verdict uses.
    const bb = frameStats(x, a0, fr, nFrames);
    const q = DSP.butterworthQ(6), inBand = DSP.filter(x.subarray(0, end), [...q.map(Q => DSP.rbj('highpass', c.band[0], fs, Q)), ...q.map(Q => DSP.rbj('lowpass', c.band[1], fs, Q))]);
    const ib = frameStats(inBand, a0, fr, nFrames);
    const leq = bb.leq;

    // Octave-band background, from the same samples (filters settle within the discarded start). Sounds are judged per
    // band: a voice stands 14–17 dB above the background in its own bands, while a level that only fluctuates moves
    // every band alike by 5–7 dB (tests/noise-study.html).
    res.bands = BANDS.map(f => {
      const b = DSP.octaveBand(f, fs);
      if (b.hi >= CRITERIA.take.nyquistShare * fs) return { f, leqDbfs: null, soundDb: null };
      const st = frameStats(DSP.filter(x.subarray(0, end), b.sections), a0, fr, nFrames);
      return { f, leqDbfs: r1(st.leq), soundDb: r1(st.sound) };
    });
    const loudest = res.bands.filter(b => b.soundDb != null).sort((p, q) => q.soundDb - p.soundDb)[0];
    Object.assign(res, {
      leqDbfs: r1(bb.leq), l90: r1(bb.l90), l50: r1(bb.l50), l10: r1(bb.l10), spreadDb: r1(bb.spread), jumpDb: r1(bb.jump), driftDb: r1(bb.drift),
      peakDbfs: r1(peakDb(peak)), clippedSamples: clipped, frames: bb.frames.map(r1),
      inBand: { leqDbfs: r1(ib.leq), l50: r1(ib.l50), spreadDb: r1(ib.spread), driftDb: r1(ib.drift), soundDb: loudest ? loudest.soundDb : null, soundBand: loudest ? loudest.f : null, frames: ib.frames.map(r1) },
    });

    // Verdict. invalid = measure the background again (the input itself is not usable); warning = suitable, with a
    // caution about what may cost a take; valid = suitable. Whether a take's decay is reliable is decided on the take.
    const R = res.reasons, Wn = res.warnings, I = res.inBand;
    if (peak < 1e-6 || leq < c.silenceDbfs) R.push('No sound reached the input. The microphone may be muted, switched off, covered or not connected.');
    if (clipped) R.push(`The input was overloaded (${clipped} samples at full scale). Move away from the noise source or lower the input gain in the system settings.`);
    if (!R.length) {
      if (I.soundDb > c.soundDb) Wn.push(`Sounds such as voices, knocks or a door rose ${Math.round(I.soundDb)} dB above the background (${I.soundBand} Hz band). Keep the room quiet during the take; if they happen again, the take will show it and say so.`);
      if (Math.abs(I.driftDb) > c.changeDb) Wn.push(`The background ${I.driftDb > 0 ? 'rose' : 'fell'} by ${Math.abs(I.driftDb).toFixed(1)} dB during the check, for example ventilation switching ${I.driftDb > 0 ? 'on' : 'off'}. Measure while it stays one way.`);
      // The usual level (median), so passing sounds already named above do not also make the background "loud".
      if (I.l50 > c.highDbfs) Wn.push(`The background is loud for this input (usually ${I.l50} dBFS in the measured bands). The test signal may not rise far enough above it: turn the volume up, or reduce the noise.`);
    }
    res.status = R.length ? 'invalid' : Wn.length ? 'warning' : 'valid';
    return res;
  }

  /* ---------- test signal ---------- */
  // The sweep levels a user can choose: { min, max, step, default }. The top is the highest step that keeps the played
  // peak within maxPeak, so a change to the default amplitude can never make a level clip.
  function levelRange() {
    const c = CRITERIA.take.level, head = 20 * Math.log10(c.maxPeak / CRITERIA.take.amplitude);
    return { min: c.minDb, max: Math.min(c.maxDb, Math.floor(head / c.stepDb + 1e-9) * c.stepDb), step: c.stepDb, default: 0 };
  }
  // A valid sweep level from anything stored or typed: a number, on the step, within the range; otherwise the default.
  function sweepLevel(db) {
    const r = levelRange();
    if (typeof db !== 'number' || !isFinite(db)) return r.default;
    return Math.min(r.max, Math.max(r.min, Math.round(db / r.step) * r.step));
  }
  const levelGain = db => Math.pow(10, db / 20);
  // The copy of the sweep that is played: the reference sweep times the level's gain. The reference itself, and the
  // inverse filter made from it, stay at the default, so the gain is applied exactly once and never to the recording.
  function playbackSignal(signal, db) {
    const level = sweepLevel(db), g = levelGain(level), out = new Float32Array(signal.length);
    let peak = 0;
    for (let i = 0; i < signal.length; i++) { out[i] = signal[i] * g; peak = Math.max(peak, Math.abs(out[i])); }
    if (peak > CRITERIA.take.level.maxPeak) throw new Error(`The sweep at ${level} dB would clip (peak ${peak.toFixed(3)}).`);
    return { signal: out, levelDb: level, gain: g, peak };
  }

  function sweepPlan(fs) {
    const c = CRITERIA.take, f2 = Math.min(c.f2, Math.floor(c.nyquistShare * fs));
    return { fs, f1: c.f1, f2, seconds: c.sweepSeconds, amplitude: c.amplitude, preRoll: c.preRoll, tail: c.tail, total: c.preRoll + c.sweepSeconds + c.tail };
  }

  // Exponential sine sweep x(t) = A·sin(K·(e^(t·R/T) − 1)), R = ln(f2/f1), K = 2π·f1·T/R, with short raised-cosine fades.
  // Inverse filter: the time-reversed sweep with an envelope e^(−t·R/T), which rises 6 dB per octave toward high
  // frequencies and so flattens the sweep's pink spectrum.
  function makeSweep(plan) {
    const { fs, f1, f2, seconds: T, amplitude } = plan, c = CRITERIA.take;
    const n = Math.round(T * fs), R = Math.log(f2 / f1), K = 2 * Math.PI * f1 * T / R;
    const fi = Math.round(c.fadeIn * fs), fo = Math.round(c.fadeOut * fs);
    const signal = new Float32Array(n), inverse = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const w = i < fi ? 0.5 - 0.5 * Math.cos(Math.PI * i / fi) : i > n - 1 - fo ? 0.5 - 0.5 * Math.cos(Math.PI * (n - 1 - i) / fo) : 1;
      signal[i] = amplitude * w * Math.sin(K * (Math.exp((i / fs) * R / T) - 1));
    }
    for (let i = 0; i < n; i++) inverse[i] = signal[n - 1 - i] * Math.exp(-(i / fs) * R / T);
    return { signal, inverse };
  }

  /* ---------- decay in one band ---------- */
  // Lundeby's iterative method: background noise level and the point where the decay meets it.
  function lundeby(e, fs) {
    const n = e.length;
    const meanE = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += e[i]; return s / Math.max(1, b - a); };
    const smooth = win => {
      const k = Math.floor(n / win), t = new Float64Array(k), v = new Float64Array(k);
      for (let j = 0; j < k; j++) { let s = 0; for (let i = j * win; i < (j + 1) * win; i++) s += e[i]; v[j] = DSP.dbOf(s / win); t[j] = (j + 0.5) * win / fs; }
      return { t, v };
    };
    const argmax = v => { let m = -Infinity, j = 0; for (let i = 0; i < v.length; i++) if (v[i] > m) { m = v[i]; j = i; } return j; };

    let win = Math.max(1, Math.round(0.01 * fs)), env = smooth(win);
    if (env.v.length < 10) return { ok: false, reason: 'The recorded response is too short to analyse.' };
    let noise = meanE(Math.floor(0.9 * n), n), p = argmax(env.v);
    if (env.v[p] - DSP.dbOf(noise) < 10) return { ok: false, reason: 'The response does not rise clearly above the noise in this band.' };

    let fit = null, cross = n;
    for (let it = 0; it < 8; it++) {
      // First pass: from the peak to 10 dB above the noise. Later passes (Lundeby's step 5): the late decay only, from
      // 25 dB to 5 dB above the noise, so a strong direct sound at the start does not tilt the line.
      const nDb = DSP.dbOf(noise), lim = nDb + (fit ? 5 : 10);
      let j = p; while (j < env.v.length && env.v[j] > lim) j++;
      let a = p;
      if (fit) { while (a < j && env.v[a] > nDb + 25) a++; if (j - a < 4) a = p; }
      const f = regress(i => env.t[i], i => env.v[i], a, j - 1);
      if (!f || !(f.slope < 0)) break;
      fit = f;
      const tc = (DSP.dbOf(noise) - f.intercept) / f.slope, next = Math.max(1, Math.min(n, Math.round(tc * fs)));
      // About five averaging intervals per 10 dB of decay (Lundeby: 3 to 10), between 2 and 50 ms.
      win = Math.min(Math.round(0.05 * fs), Math.max(Math.round(0.002 * fs), Math.round(fs * (10 / -f.slope) / 5)));
      env = smooth(win); p = argmax(env.v);
      // Background from the point 10 dB below the crossing to the end, and never less than the last 10 %.
      const start = Math.min(Math.floor(0.9 * n), Math.round((tc + 10 / -f.slope) * fs));
      noise = meanE(Math.max(1, start), n);
      const done = Math.abs(next - cross) < 0.001 * fs;
      cross = next;
      if (done) break;
    }
    if (!fit) return { ok: false, reason: 'No decay could be fitted above the noise in this band.' };
    // Energy that the straight-line decay would still contain after the crossing (added to the Schroeder integral).
    const k = -fit.slope * Math.LN10 / 10, eCross = Math.pow(10, (fit.intercept + fit.slope * cross / fs) / 10);
    return { ok: true, cross, noise, slope: fit.slope, tail: eCross * fs / k };
  }

  function fitDecay(edcDb, fs, top, bottom, cross) {
    let i1 = -1, i2 = -1;
    for (let i = 0; i < cross; i++) { if (i1 < 0 && edcDb[i] <= -top) i1 = i; if (edcDb[i] <= -bottom) { i2 = i; break; } }
    if (i1 < 0 || i2 <= i1) return null;
    const f = regress(i => i / fs, i => edcDb[i], i1, i2, Math.max(1, Math.floor((i2 - i1) / 3000)));
    if (!f || !(f.slope < 0)) return null;
    return {
      T: r3(-60 / f.slope), slope: r3(f.slope), intercept: r3(f.intercept), r2: Math.round(f.r2 * 1e6) / 1e6,
      from: Math.round(-top * 100) / 100, to: Math.round(-bottom * 100) / 100, t1: r3((-top - f.intercept) / f.slope), t2: r3((-bottom - f.intercept) / f.slope),
    };
  }

  /* The room's reverberant decay inside a decay curve that may start with a strong direct sound. A line is fitted to
     the lowest 20 dB of the usable curve (furthest from the direct sound) and extrapolated back to the arrival; how far
     it lies below the curve's start is the energy of the direct sound and early reflections. The estimate is then
     refined on the T20 range counted from the reverberant start. Returns that energy in dB (≥ 0), or null when the
     curve is too short to tell the parts apart. */
  function reverberantStart(edcDb, fs, cross, lowestDb) {
    const bottom = -lowestDb;
    if (bottom - 20 < 5) return null;
    let f = fitDecay(edcDb, fs, bottom - 20, bottom, cross);
    if (!f) return null;
    let head = Math.max(0, -f.intercept);
    const [top, end] = CRITERIA.decay.ranges.T20;
    for (let it = 0; it < 6 && head + end <= bottom; it++) {
      f = fitDecay(edcDb, fs, head + top, head + end, cross);
      if (!f) break;
      const next = Math.max(0, -f.intercept), done = Math.abs(next - head) < 0.05;
      head = next;
      if (done) break;
    }
    return head;
  }

  function analyseBand(seg, o, f, plan) {
    const fs = plan.fs, band = DSP.octaveBand(f, fs), D = CRITERIA.decay;
    const out = { f, lo: r1(band.lo), hi: r1(band.hi), bandwidth: r1(band.bandwidth), supported: true, reason: null, decayRangeDb: null, noiseFloorDb: null, peakToNoiseDb: null, headDb: null, crossSec: null, cutoff: null, disturbance: null, backgroundChangeDb: null, fits: {}, curve: null };
    if (band.hi >= plan.f2 || band.lo <= plan.f1) {
      return Object.assign(out, { supported: false, reason: `Outside the test signal's range (${plan.f1}–${plan.f2} Hz at a ${plan.fs / 1000} kHz sample rate).` });
    }
    const y = DSP.filterReversed(seg, band.sections), m = y.length - o, e = new Float64Array(m);
    for (let i = 0; i < m; i++) e[i] = y[o + i] * y[o + i];

    const L = lundeby(e, fs);
    if (!L.ok) return Object.assign(out, { reason: L.reason });
    const win = Math.max(1, Math.round(D.envWindow * fs));
    let maxEnv = 0;
    for (let a = 0; a + win <= m; a += win) { let s = 0; for (let i = a; i < a + win; i++) s += e[i]; if (s / win > maxEnv) maxEnv = s / win; }
    const range = DSP.dbOf(maxEnv) - DSP.dbOf(L.noise);

    // Schroeder backward integration up to the crossing point, with the extrapolated tail energy added. The background
    // noise energy (Lundeby's estimate) is subtracted from every sample first: the tail beyond the crossing is the
    // noise-free decay, so the integrated part has to be too. Left in, the noise lifts the end of the curve and the
    // decay reads long (about +3 % with 45 dB usable, +6 % near the T20 limit, in tests/dsp.html).
    const cross = Math.min(m, L.cross), edc = new Float64Array(cross);
    let acc = L.tail;
    for (let i = cross - 1; i >= 0; i--) { acc += e[i] - L.noise; edc[i] = Math.max(acc, 1e-30); }
    const edcDb = new Float64Array(cross);
    for (let i = 0; i < cross; i++) edcDb[i] = 10 * Math.log10(edc[i] / edc[0]);

    // Direct sound + early reflections, reverberant decay, background noise (see the top of this file).
    // The curve is used down to 10 dB above the point where the decay meets the noise. The direct part can hold no more
    // than the curve loses in its first directWindow; any excess found by extrapolation is the room's early decay.
    const lowest = edcDb[cross - 1] + 10, early = -edcDb[Math.min(cross - 1, Math.round(D.directWindow * fs))];
    const head0 = reverberantStart(edcDb, fs, cross, lowest), head = head0 == null ? null : Math.min(head0, Math.max(0, early));
    const shift = head == null ? 0 : Math.max(0, head - D.directAllowanceDb);
    const reverb = -edcDb[cross - 1] - shift; // usable decay of the room itself, dB
    if (head != null) for (const [name, [top, bottom]] of Object.entries(D.ranges)) out.fits[name] = fitDecay(edcDb, fs, shift + top, shift + bottom, cross);

    // A decay that drops into the background far faster than the room's own decay (its T20 slope) allows has been cut
    // off: by a noise gate or noise suppression in the device or the system, or by a gap in the recording after the test
    // signal. No room decays like that, and the fits would read the cut as a shorter reverberation time.
    if (out.fits.T20) {
      const c = D.cutoff, w = Math.max(1, Math.round(D.envWindow * fs)), k = Math.floor(m / w), lv = new Float64Array(k), nDb = DSP.dbOf(L.noise);
      for (let j = 0; j < k; j++) { let s = 0; for (let i = j * w; i < (j + 1) * w; i++) s += e[i]; lv[j] = s / w; }
      const mean = (a, b) => { let s = 0; for (let j = a; j < b; j++) s += lv[j]; return DSP.dbOf(s / (b - a)); };
      const room = -out.fits.T20.slope * (c.before + c.after) * D.envWindow / 2; // what the room's decay falls between the two windows' centres
      for (let j = c.before + 1; j + c.after <= k; j++) {
        const before = mean(j - c.before, j), after = mean(j, j + c.after);
        if (before - nDb >= c.aboveNoiseDb && after - nDb <= c.nearNoiseDb && before - after - room >= c.excessDb) { out.cutoff = { atSec: r3(j * w / fs), dropDb: r1(before - after) }; break; }
      }
    }

    // Downsampled curves for display: band energy relative to its 10 ms peak, and the decay curve.
    const span = Math.min(m, Math.round(cross * 1.25 + 0.1 * fs)), bins = 240, step = Math.max(1, Math.ceil(span / bins));
    const env = [], dc = [];
    for (let a = 0; a < span; a += step) {
      const b = Math.min(span, a + step);
      let s = 0; for (let i = a; i < b; i++) s += e[i];
      env.push(r1(DSP.dbOf(s / (b - a)) - DSP.dbOf(maxEnv)));
      const mid = Math.floor((a + b) / 2);
      dc.push(mid < cross ? r1(edcDb[mid]) : null);
    }
    return Object.assign(out, {
      decayRangeDb: r1(reverb), headDb: head == null ? null : r1(head), peakToNoiseDb: r1(range), noiseFloorDb: r1(-range),
      crossSec: r3(cross / fs), curve: { dt: step / fs, env, edc: dc },
      reason: head == null ? 'The decay is too short to separate the room\'s reverberation from the direct sound.' : null,
    });
  }

  /* Distortion of the whole playback and recording chain, read from the sweep itself (Farina 2000): an exponential sweep
     places the response of the k-th harmonic T·ln k / ln(f2/f1) before the main response (0.65 s for the 2nd, 1.04 s
     for the 3rd with a 5 s sweep), where it cannot disturb the decay. Energy in the first 50 ms of the 2nd and 3rd
     harmonic responses against the first 50 ms of the main one, after removing the noise measured where only the 7th to
     11th harmonics fall. A relative figure for comparing sweep levels, not a THD: the inverse filter weights a harmonic
     by about 1/k, and harmonics above f2 are not captured. null when a harmonic does not rise 3 dB above that noise. */
  function distortion(full, onset, fs, plan) {
    const w = Math.round(0.05 * fs), lead = Math.round(0.002 * fs), R = Math.log(plan.f2 / plan.f1);
    const at = k => onset - Math.round(plan.seconds * fs * Math.log(k) / R);
    const energy = a => { let s = 0; for (let i = a - lead; i < a - lead + w; i++) s += full[i] * full[i]; return s; };
    const n0 = at(7), n1 = at(11);
    if (n1 - lead < 0 || n0 <= n1) return null;
    let ns = 0; for (let i = n1; i < n0; i++) ns += full[i] * full[i];
    const noise = ns / (n0 - n1) * w, main = energy(onset) - noise;
    if (!(main > 0)) return null;
    const rel = k => { const e = energy(at(k)) - noise; return e > noise ? r1(10 * Math.log10(e / main)) : null; };
    return { h2Db: rel(2), h3Db: rel(3), floorDb: r1(10 * Math.log10(Math.max(noise, 1e-30) / main)) };
  }

  /* ---------- one take ---------- */
  function analyseTake(rec, plan, sweep) {
    const fs = plan.fs, C = CRITERIA.take, n = rec.length;
    const out = { status: 'failed', reason: null, levels: {}, waveform: waveform(rec), latencySec: null, arrivalClarityDb: null, onsetSec: null, irSeconds: null, gap: null, distortion: null, bands: [] };
    const fail = reason => Object.assign(out, { status: 'failed', reason });

    let peak = 0, clipped = 0;
    for (let i = 0; i < n; i++) { const a = Math.abs(rec[i]); if (a > peak) peak = a; if (a >= C.clipLevel) clipped++; }
    const sw0 = Math.round(plan.preRoll * fs), sw1 = Math.min(n, Math.round((plan.preRoll + plan.seconds) * fs));
    const pre = DSP.dbOf(DSP.meanSquare(rec, Math.round(0.1 * fs), Math.round((plan.preRoll - 0.05) * fs)));
    const during = DSP.dbOf(DSP.meanSquare(rec, sw0, sw1));
    out.levels = { peakDbfs: r1(peakDb(peak)), preRollDbfs: r1(pre), sweepDbfs: r1(during), snrDb: r1(during - pre), clippedSamples: clipped };

    if (n < Math.round(plan.total * fs * 0.98)) return fail('The recording is incomplete: the microphone stopped delivering audio during the take.');
    if (peak < 1e-6) return fail('No sound reached the microphone during the take. It may be muted, switched off or covered.');
    // What to change: the sweep level where it can still move (plan.levelDb, set by the user), else the device volume.
    const lr = levelRange(), lv = plan.levelDb == null ? 0 : plan.levelDb, signed = d => `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d)} dB`;
    if (clipped) return fail(`The microphone input was overloaded (${clipped} samples at full scale). ${lv > lr.min ? `Lower the sweep level (now ${signed(lv)}) or turn` : 'Turn'} the device's volume down a little and measure again.`);
    if (during - pre < C.minSweepSnrDb) return fail(`The test signal was only ${r1(during - pre)} dB above the background at the microphone. ${lv < lr.max ? `Raise the sweep level (now ${signed(lv)}) or turn` : 'Turn'} the device's volume up, check that the sound comes from its own speaker (disconnect headphones and Bluetooth audio) and measure again.`);

    // Deconvolution: the impulse response appears at lag (arrival + sweep length − 1).
    const full = DSP.convolve(rec, sweep.inverse), L = sweep.inverse.length;
    let pk = 0, pi = 0;
    for (let i = 0; i < full.length; i++) { const a = Math.abs(full[i]); if (a > pk) { pk = a; pi = i; } }
    const arrival = pi - (L - 1), latency = arrival - sw0;
    if (latency < -0.05 * fs || latency > C.maxLatency * fs) return fail('The test signal could not be found in the recording. Check that the sound comes from this device\'s own speaker and measure again.');

    // Gaps in the recording while the test signal was arriving: the longest run of identical samples that sits at least
    // 20 dB below the signal on either side of it (5 ms each), where that signal is at least 10 dB above the background.
    // A filled gap is a flat stretch inside a loud signal; the flat top of a very quiet, coarsely quantised sine is not.
    {
      const a = Math.max(1, arrival + Math.round(C.gapSkip[0] * fs)), b = Math.min(n, arrival + L - Math.round(C.gapSkip[1] * fs));
      const minRun = Math.round(C.gapSeconds * fs), w = Math.round(0.005 * fs), bg = Math.pow(10, pre / 10);
      const isGap = (s, len) => {
        const around = (DSP.meanSquare(rec, Math.max(0, s - w), s) + DSP.meanSquare(rec, s + len, Math.min(n, s + len + w))) / 2;
        return around > 0 && around >= 100 * rec[s] * rec[s] && around >= 10 * bg;
      };
      let run = 1, longest = 0, at = 0;
      for (let i = a; i <= b; i++) {
        if (i < b && rec[i] === rec[i - 1]) { run++; continue; }
        if (run >= minRun && run > longest && isGap(i - run, run)) { longest = run; at = i - run; }
        run = 1;
      }
      if (longest) {
        out.gap = { atSec: r3(at / fs), ms: r1(1000 * longest / fs) };
        return fail(`The recording has a gap: about ${out.gap.ms} ms of audio is missing at ${out.gap.atSec.toFixed(2)} s, while the test signal was playing. The device or browser stopped delivering audio for a moment (for example under heavy load), which distorts the whole measurement. Close other apps and tabs and measure again.`);
      }
    }

    // Onset: within 10 ms before the peak, the first point whose energy is within 20 dB of the peak (0.5 ms smoothing).
    const sm = Math.max(1, Math.round(0.0005 * fs)), floor = pk * pk * Math.pow(10, -C.onsetDb / 10);
    let onset = pi;
    for (let i = Math.max(sm, pi - Math.round(C.onsetWindow * fs)); i <= pi; i++) {
      let s = 0; for (let k = i - sm; k < i; k++) s += full[k] * full[k];
      if (s / sm >= floor) { onset = i - sm; break; }
    }
    // The delay between playing and recording (browser, system and device buffers) is read from this arrival. It is
    // only trusted when the response stands clearly above what the recording held before the sound arrived.
    {
      const a = Math.max(0, onset - Math.round(C.preOnset * fs)), b = Math.max(a + 1, onset - Math.round(0.002 * fs));
      const clarity = DSP.dbOf(pk * pk) - DSP.dbOf(DSP.meanSquare(full, a, b));
      out.arrivalClarityDb = r1(clarity);
      if (!(clarity >= C.minArrivalDb)) return fail(`The arrival of the test signal could not be identified clearly in the recording (only ${r1(clarity)} dB above the recording before it, ${C.minArrivalDb} dB needed), so its timing is not reliable. Keep the room quiet and measure again.`);
    }
    out.latencySec = r3(latency / fs);
    out.onsetSec = r3((onset - (L - 1)) / fs);
    out.distortion = distortion(full, onset, fs, plan);

    // The response is valid as long as the recording continued after the sweep had fully arrived.
    const valid = n - (arrival + L) - Math.round(C.guard * fs);
    if (valid < 0.5 * fs) return fail('The recording ended too soon after the test signal to capture the decay.');
    const start = Math.max(0, onset - Math.round(C.preOnset * fs)), seg = full.slice(start, onset + valid);
    out.irSeconds = r3(valid / fs);

    out.bands = BANDS.map(f => analyseBand(seg, onset - start, f, plan));
    backgroundSounds(rec, out.bands, fs, [
      [Math.round(0.1 * fs), Math.round((plan.preRoll - 0.05) * fs)],
      [arrival + L + Math.round((Math.max(0, ...out.bands.map(b => b.crossSec || 0)) + 0.1) * fs), n - Math.round(0.02 * fs)],
    ]);
    out.status = 'captured';
    return out;
  }

  // Sounds in the take's own background, per band (CRITERIA.take.disturbance). Each segment is judged against its own
  // median, so a background that changed between them (ventilation switching on) is a change of level, not a sound; a
  // sound is a run of frames that starts `db` above the median, continues while it stays within 3 dB of that, and lasts
  // at most maxSeconds (a longer run is a change of level too). Sets band.disturbance = { db, events } when sounds recur,
  // and band.backgroundChangeDb (after the sweep against before it).
  function backgroundSounds(rec, bands, fs, segments) {
    const c = CRITERIA.take.disturbance, segs = segments.filter(([a, e]) => e - a > 0.2 * fs);
    bands.forEach(b => {
      if (!b.supported || !segs.length) return;
      const band = DSP.octaveBand(b.f, fs), y = DSP.filter(rec, band.sections), w = Math.round(Math.max(c.frame, 8 / band.bandwidth) * fs);
      let events = 0, top = 0;
      const medians = segs.map(([a, e]) => {
        const lv = [];
        for (let k = 0; a + (k + 1) * w <= e; k++) lv.push(DSP.dbOf(DSP.meanSquare(y, a + k * w, a + (k + 1) * w)));
        if (lv.length < 4) return null;
        const med = pct(lv.slice().sort((p, q) => p - q), 0.5);
        for (let k = 0; k < lv.length; k++) {
          if (lv[k] - med < c.db) continue;
          let j = k, peak = lv[k] - med;
          while (j + 1 < lv.length && lv[j + 1] - med >= c.db - 3) { j++; peak = Math.max(peak, lv[j] - med); }
          if ((j - k + 1) * w / fs <= c.maxSeconds) { events++; top = Math.max(top, peak); }
          k = j;
        }
        return med;
      });
      if (events >= c.events) b.disturbance = { db: r1(top), events };
      if (medians.length === 2 && medians[0] != null && medians[1] != null) b.backgroundChangeDb = r1(medians[1] - medians[0]);
    });
  }

  AM.analysis = { CRITERIA, analyseNoise, sweepPlan, makeSweep, levelRange, sweepLevel, levelGain, playbackSignal, analyseTake, analyseBand, lundeby, regress, waveform };
})(window.AM);
