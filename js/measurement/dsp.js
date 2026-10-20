/* Signal-processing building blocks for the live measurement.
   Pure functions on sample arrays: no audio devices, no UI, no stored state. Each one can be checked on its own
   against known signals (tests/dsp.html).

   fft        in-place iterative radix-2 FFT, complex, length a power of two, double precision
   convolve   linear convolution of two real signals through the FFT
   biquads    RBJ "Audio EQ Cookbook" low-pass and high-pass sections: bilinear transform, pre-warped at the corner
              frequency, so the corner is exact at any sample rate
   octave     IEC 61260-1:2014 octave bands, named by their nominal frequencies (125, 250, 500, 1000, 2000, 4000 Hz) and
              centred on the exact base-10 midband frequencies fm = 1000·G^k, G = 10^(3/10) (125.89, 251.19, 501.19, 1000,
              1995.3, 3981.1 Hz; the 2014 edition specifies base 10 only). Band edges fm·G^(−1/2) and fm·G^(1/2). Each band
              is a 6th-order Butterworth high-pass at the lower edge cascaded with a 6th-order Butterworth low-pass at the
              upper edge: −3 dB at both edges, about −18 dB at the neighbouring band's centre and more than 30 dB down one
              octave beyond its edges. Six second-order sections in total, run in double precision (direct form II
              transposed). The filter class of IEC 61260-1 has not been verified against its Table 1.
   reversed   time-reversed filtering: the signal is reversed, filtered and reversed back. The filter's own ringing then
              falls before the impulse onset instead of lengthening the decay, which matters for short decays at low
              frequencies (Rasmussen, Rindel & Henriksen 1991; ISO 3382-2 allows it). */
(function (AM) {
  'use strict';

  const nextPow2 = n => { let p = 1; while (p < n) p <<= 1; return p; };

  // Twiddle factors for one FFT length, kept for the next call of the same length.
  let tw = { n: 0, cos: null, sin: null };
  function twiddles(n) {
    if (tw.n !== n) {
      const h = n >> 1, cos = new Float64Array(h), sin = new Float64Array(h);
      for (let k = 0; k < h; k++) { cos[k] = Math.cos(2 * Math.PI * k / n); sin[k] = Math.sin(2 * Math.PI * k / n); }
      tw = { n, cos, sin };
    }
    return tw;
  }

  function fft(re, im, inverse = false) {
    const n = re.length;
    if (n < 2 || (n & (n - 1))) throw new Error('FFT length must be a power of two');
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    const { cos, sin } = twiddles(n), sign = inverse ? 1 : -1;
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1, step = n / len;
      for (let i = 0; i < n; i += len) {
        for (let k = 0, w = 0; k < half; k++, w += step) {
          const wr = cos[w], wi = sign * sin[w], a = i + k, b = a + half;
          const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr; im[b] = im[a] - xi;
          re[a] += xr; im[a] += xi;
        }
      }
    }
    if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }

  // Linear convolution a * b (length a + b − 1), real inputs. An empty input gives an empty result.
  function convolve(a, b) {
    if (!a.length || !b.length) return new Float64Array(0);
    const L = a.length + b.length - 1, n = Math.max(2, nextPow2(L));
    const ar = new Float64Array(n), ai = new Float64Array(n), br = new Float64Array(n), bi = new Float64Array(n);
    ar.set(a); br.set(b);
    fft(ar, ai); fft(br, bi);
    for (let k = 0; k < n; k++) {
      const r = ar[k] * br[k] - ai[k] * bi[k];
      ai[k] = ar[k] * bi[k] + ai[k] * br[k];
      ar[k] = r;
    }
    fft(ar, ai, true);
    return ar.subarray(0, L);
  }

  /* ---------- filters ---------- */
  function rbj(type, fc, fs, Q) {
    const w = 2 * Math.PI * fc / fs, c = Math.cos(w), al = Math.sin(w) / (2 * Q), a0 = 1 + al;
    const b = type === 'lowpass' ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : [(1 + c) / 2, -(1 + c), (1 + c) / 2];
    return { type, fc, Q, b0: b[0] / a0, b1: b[1] / a0, b2: b[2] / a0, a1: -2 * c / a0, a2: (1 - al) / a0 };
  }
  // Pole-pair Q values of an even-order Butterworth filter.
  const butterworthQ = order => Array.from({ length: order / 2 }, (_, k) => 1 / (2 * Math.cos((2 * k + 1) * Math.PI / (2 * order))));

  const BAND_ORDER = 6;
  // The exact base-10 midband frequency of a nominal octave band (IEC 61260-1:2014): 1000·G^k, G = 10^0.3, with k the
  // band's octave number from 1 kHz.
  const G = Math.pow(10, 0.3);
  const midband = f => 1000 * Math.pow(G, Math.round(Math.log2(f / 1000)));
  function octaveBand(fc, fs) {
    const fm = midband(fc), half = Math.sqrt(G), lo = fm / half, hi = fm * half, q = butterworthQ(BAND_ORDER);
    return {
      f: fc, fm, lo, hi, fs, order: BAND_ORDER, bandwidth: hi - lo,
      sections: [...q.map(Q => rbj('highpass', lo, fs, Q)), ...q.map(Q => rbj('lowpass', hi, fs, Q))],
    };
  }

  // Direct form II transposed, section by section. Returns a new Float64Array.
  function filter(x, sections) {
    const y = Float64Array.from(x);
    for (const s of sections) {
      let z1 = 0, z2 = 0;
      for (let i = 0; i < y.length; i++) {
        const xi = y[i], yi = s.b0 * xi + z1;
        z1 = s.b1 * xi - s.a1 * yi + z2;
        z2 = s.b2 * xi - s.a2 * yi;
        y[i] = yi;
      }
    }
    return y;
  }
  function filterReversed(x, sections) {
    const r = Float64Array.from(x).reverse();
    return filter(r, sections).reverse();
  }

  // Magnitude response of a cascade at one frequency (for checking the band filters).
  function magnitude(sections, f, fs) {
    const w = 2 * Math.PI * f / fs, c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
    return sections.reduce((m, s) => {
      const nr = s.b0 + s.b1 * c1 + s.b2 * c2, ni = -(s.b1 * s1 + s.b2 * s2);
      const dr = 1 + s.a1 * c1 + s.a2 * c2, di = -(s.a1 * s1 + s.a2 * s2);
      return m * Math.hypot(nr, ni) / Math.hypot(dr, di);
    }, 1);
  }

  /* ---------- levels ---------- */
  function meanSquare(x, a = 0, b = x.length) {
    a = Math.max(0, a); b = Math.min(x.length, b);
    let s = 0;
    for (let i = a; i < b; i++) s += x[i] * x[i];
    return b > a ? s / (b - a) : 0;
  }
  // Level of a mean-square value in dB. The floor keeps log10 finite for exact digital silence.
  const dbOf = ms => 10 * Math.log10(Math.max(ms, 1e-20));

  AM.dsp = { nextPow2, fft, convolve, rbj, butterworthQ, BAND_ORDER, midband, octaveBand, filter, filterReversed, magnitude, meanSquare, dbOf };
})(window.AM);
