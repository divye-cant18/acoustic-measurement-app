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

  // Compare at the precision we display (0.01 s) so 0.70 is "within" a 0.60–0.70 range.
  function classify(rt, t) {
    if (!isNum(rt) || !t) return null;
    const r = Math.round(rt * 100), lo = Math.round(t.min * 100), hi = Math.round(t.max * 100);
    if (r > hi) return 'above';
    if (r < lo) return 'below';
    return 'within';
  }

  AM.acoustics = { SABINE, geometry, absorptionFromRT, rtFromAbsorption, classify };
})(window.AM);
