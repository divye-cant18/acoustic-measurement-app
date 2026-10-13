/* TEST FIXTURES — synthetic signals with known properties, used only to check the analysis algorithms.
   Never loaded by the application (index.html). Nothing here is ever shown as a measurement.

   The pseudo-random generator below is seeded so every test run uses the same signals. */
(function () {
  'use strict';
  const DSP = AM.dsp;

  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function gaussian(r) { let u = 0, v = 0; while (u === 0) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function noise(n, seed) { const r = rng(seed), x = new Float64Array(n); for (let i = 0; i < n; i++) x[i] = gaussian(r); return x; }
  // Pink noise (−3 dB per octave, like most room backgrounds): white noise through Paul Kellet's pinking filter.
  function pink(n, seed) {
    const w = noise(n, seed), y = new Float64Array(n);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const x = w[i];
      b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759; b2 = 0.96900 * b2 + x * 0.1538520;
      b3 = 0.86650 * b3 + x * 0.3104856; b4 = 0.55000 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.0168980;
      y[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362; b6 = x * 0.115926;
    }
    return y;
  }

  /* Room impulse response: band-limited noise in 1/6-octave slices from 62.5 Hz to 8 kHz, each decaying exponentially
     (amplitude falls 60 dB in RT seconds). rt is one value for every frequency, or one per octave band (125…4000 Hz),
     interpolated smoothly over log-frequency as in a real room. gainsDb (optional, per octave band) shapes the level.
     directDb (optional) adds the direct sound of a speaker and microphone on one device: an impulse carrying directDb
     more energy than the whole reverberation, which then starts directGap seconds later. reflections (optional, with
     directDb): early reflections [[seconds, dB relative to the direct sound, ±1], …], e.g. the desk under a laptop. */
  function roomIR({ fs, seconds, rt, gainsDb, seed = 1, directDb = null, directGap = 0.002, reflections = [] }) {
    if (directDb != null) {
      const rev = roomIR({ fs, seconds, rt, gainsDb, seed });
      let e = 0; for (let i = 0; i < rev.length; i++) e += rev[i] * rev[i];
      const gap = Math.round(directGap * fs), ir = new Float64Array(rev.length + gap);
      ir[0] = Math.sqrt(e * Math.pow(10, directDb / 10));
      for (const [t, db, sign] of reflections) ir[Math.round(t * fs)] += sign * ir[0] * Math.pow(10, db / 20);
      for (let i = 0; i < rev.length; i++) ir[gap + i] += rev[i];
      const pk = Math.abs(ir[0]) > 1 ? Math.abs(ir[0]) : 1;
      for (let i = 0; i < ir.length; i++) ir[i] /= pk;
      return ir;
    }
    const n = Math.round(seconds * fs), out = new Float64Array(n), B = AM.demo.BANDS;
    const interp = (vals, f) => {
      const x = Math.log2(f / B[0]);
      if (x <= 0) return vals[0];
      if (x >= vals.length - 1) return vals[vals.length - 1];
      const k = Math.floor(x); return vals[k] + (vals[k + 1] - vals[k]) * (x - k);
    };
    for (let k = 0; k <= 42; k++) {
      const fc = 62.5 * Math.pow(2, k / 6), lo = fc / Math.pow(2, 1 / 12), hi = fc * Math.pow(2, 1 / 12);
      if (hi >= 0.45 * fs) break;
      const T = Array.isArray(rt) ? interp(rt, fc) : rt, g = gainsDb ? Math.pow(10, interp(gainsDb, fc) / 20) : 1;
      const q = DSP.butterworthQ(6), sections = [...q.map(Q => DSP.rbj('highpass', lo, fs, Q)), ...q.map(Q => DSP.rbj('lowpass', hi, fs, Q))];
      const b = DSP.filter(noise(n, seed + k * 101), sections);
      for (let i = 0; i < n; i++) out[i] += g * b[i] * Math.pow(10, -3 * (i / fs) / T);
    }
    let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(out[i]));
    for (let i = 0; i < n; i++) out[i] /= pk;
    return out;
  }

  // Background noise at a given level (dBFS, mean square): white, or pink (kind 'pink').
  function background(n, levelDbfs, seed, kind = 'white') {
    const x = kind === 'pink' ? pink(n, seed) : noise(n, seed);
    let ms = 0; for (let i = 0; i < n; i++) ms += x[i] * x[i];
    const g = Math.pow(10, levelDbfs / 20) / (kind === 'pink' ? Math.sqrt(ms / n) : 1);
    for (let i = 0; i < n; i++) x[i] *= g;
    return x;
  }

  /* What a microphone would record when the sweep is played into a room:
     preRoll of background, then sweep ∗ IR arriving after `latency` s, then the tail; plus background throughout.
     peakDbfs sets the level of the room response; noiseDbfs the background (noiseKind 'white' or 'pink'). */
  function recordSweep({ plan, sweep, ir, latency = 0.03, peakDbfs = -12, noiseDbfs = -70, noiseKind = 'white', seed = 7, clip = false }) {
    const fs = plan.fs, total = Math.round(plan.total * fs);
    const resp = DSP.convolve(sweep.signal, ir);
    let pk = 0; for (let i = 0; i < resp.length; i++) pk = Math.max(pk, Math.abs(resp[i]));
    const g = Math.pow(10, peakDbfs / 20) / pk, start = Math.round((plan.preRoll + latency) * fs);
    const x = background(total, noiseDbfs, seed, noiseKind);
    for (let i = 0; i < resp.length && start + i < total; i++) x[start + i] += resp[i] * g;
    const out = new Float32Array(total);
    for (let i = 0; i < total; i++) out[i] = clip ? Math.max(-1, Math.min(1, x[i] * 4)) : x[i];
    return out;
  }

  window.FIX = { rng, noise, pink, roomIR, background, recordSweep };
})();
