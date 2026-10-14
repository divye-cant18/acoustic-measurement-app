/* Prototype acoustics: room geometry and plain Sabine relations only.
   Callers use these functions rather than formulas inline, so a fuller model can replace them in one place. */
(function (AM) {
  'use strict';
  const { isNum } = AM.util;

  const SABINE = 0.161; // s/m, metric Sabine constant

  function geometry(room) {
    const { L, W, H } = room || {};
    if (![L, W, H].every(x => isNum(x) && x > 0)) return null;
    const floor = L * W, ceiling = L * W, walls = 2 * H * (L + W);
    return { L, W, H, V: L * W * H, floor, ceiling, walls, total: floor + ceiling + walls };
  }

  const absorptionFromRT = (V, rt) => SABINE * V / rt;   // equivalent absorption area A, m² Sabine
  const rtFromAbsorption = (V, A) => SABINE * V / A;

  // Compare at the precision we display (0.01 s) so 0.70 is "within" a 0.60–0.70 range. Each value is rounded exactly as
  // the screen and the report show it (toFixed(2)): rounding x·100 instead can differ from the shown digits (0.245 is
  // shown "0.24" but x·100 rounds to 25; 202 of the values 0.100–5.000 s differ), and the verdict would contradict the
  // number beside it.
  const shown = x => Math.round(Number(x.toFixed(2)) * 100);
  function classify(rt, t) {
    if (!isNum(rt) || !t || !isNum(t.min) || !isNum(t.max)) return null;
    const r = shown(rt), lo = shown(t.min), hi = shown(t.max);
    if (r > hi) return 'above';
    if (r < lo) return 'below';
    return 'within';
  }

  AM.acoustics = { SABINE, geometry, absorptionFromRT, rtFromAbsorption, classify };
})(window.AM);
