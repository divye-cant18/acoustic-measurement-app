/* A 3D sound field behind the Home page's title: a surface seen in perspective, with sound radiating from one source and,
   every few seconds, an impulse that spreads out and dies away, the way a room's reverberation decays. Decorative only:
   no value on it is a measurement. Drawn on a canvas (no library); it pauses when off screen, in a hidden tab or while the
   page scrolls (so scrolling stays smooth on phones), follows the pointer a little, and stands still for people who prefer
   reduced motion. */
import { useEffect, useRef } from 'react';

const NX = 72, NZ = 44;                 // grid lines across and in depth
const X0 = -2.3, X1 = 2.3, Z0 = -1.45, Z1 = 1.45;
const SRC = { x: 0.55, z: 0.05 };       // the sound source
const PULSE_EVERY = 4.8, PULSE_SPEED = 1.15, PULSE_DECAY = 1.05; // seconds, units per second, seconds (amplitude time constant)

function height(x: number, z: number, t: number): number {
  const r = Math.hypot(x - SRC.x, z - SRC.z);
  const ripple = 0.12 * Math.sin(6.2 * r - 2.4 * t) * Math.exp(-0.55 * r);
  const age = t % PULSE_EVERY, front = PULSE_SPEED * age;
  const pulse = 0.34 * Math.exp(-age / PULSE_DECAY) * Math.exp(-((r - front) ** 2) / 0.024);
  return ripple + pulse;
}

export function SoundField() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const g0 = cv.getContext('2d');
    if (!g0) return;
    const g: CanvasRenderingContext2D = g0;
    const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, running = false, visible = true, t0 = performance.now(), pausedAt = 0, resume = 0;
    let line = '#423B3C', brand = '#EE4935';
    const colours = () => { const css = getComputedStyle(cv); line = css.getPropertyValue('--acoustic').trim() || line; brand = css.getPropertyValue('--brand').trim() || brand; };
    const look = { x: 0, y: 0, tx: 0, ty: 0 };
    const xs = new Float32Array(NX * NZ), ys = new Float32Array(NX * NZ), ds = new Float32Array(NX * NZ);

    const size = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
      if (!w || !h) return false;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      return true;
    };

    function draw(t: number) {
      if (!size()) return;
      const w = cv!.clientWidth, h = cv!.clientHeight, narrow = w < 700;
      look.x += (look.tx - look.x) * 0.05; look.y += (look.ty - look.y) * 0.05;
      const yaw = -0.42 + 0.1 * Math.sin(t * 0.11) + look.x * 0.2, pitch = 0.86 + look.y * 0.07, dist = 4.7;
      const cyaw = Math.cos(yaw), syaw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const f = narrow ? Math.min(w * 0.95, h * 1.1) : Math.min(w * 0.62, h * 1.45), cx = narrow ? w * 0.5 : w * 0.7, cy = narrow ? h * 0.72 : h * 0.54;
      let dMin = Infinity, dMax = -Infinity;
      for (let j = 0; j < NZ; j++) {
        const z = Z0 + (Z1 - Z0) * j / (NZ - 1);
        for (let i = 0; i < NX; i++) {
          const x = X0 + (X1 - X0) * i / (NX - 1), y = height(x, z, t);
          const x1 = x * cyaw - z * syaw, z1 = x * syaw + z * cyaw;
          const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp + dist;
          const k = j * NX + i;
          xs[k] = cx + (x1 / z2) * f; ys[k] = cy - (y2 / z2) * f; ds[k] = z2;
          if (z2 < dMin) dMin = z2; if (z2 > dMax) dMax = z2;
        }
      }
      g.clearRect(0, 0, w, h);
      g.lineWidth = 1;
      g.strokeStyle = line;
      const near = (d: number) => 1 - (d - dMin) / Math.max(1e-6, dMax - dMin); // 1 nearest, 0 farthest
      // Lines across, then lines in depth (fainter): a wireframe whose near side reads stronger.
      for (let j = 0; j < NZ; j++) {
        g.globalAlpha = 0.16 + 0.68 * near(ds[j * NX + (NX >> 1)]) ** 1.2;
        g.beginPath();
        for (let i = 0; i < NX; i++) { const k = j * NX + i; if (i) g.lineTo(xs[k], ys[k]); else g.moveTo(xs[k], ys[k]); }
        g.stroke();
      }
      for (let i = 0; i < NX; i += 2) {
        g.globalAlpha = 0.09 + 0.3 * near(ds[(NZ >> 1) * NX + i]);
        g.beginPath();
        for (let j = 0; j < NZ; j++) { const k = j * NX + i; if (j) g.lineTo(xs[k], ys[k]); else g.moveTo(xs[k], ys[k]); }
        g.stroke();
      }
      // The impulse front as it spreads over the surface, in the brand orange, fading as it dies away.
      const age = t % PULSE_EVERY, front = PULSE_SPEED * age, fade = Math.exp(-age / PULSE_DECAY);
      if (front > 0.05 && fade > 0.03) {
        g.strokeStyle = brand; g.lineWidth = 1.6; g.globalAlpha = 0.75 * fade;
        g.beginPath();
        for (let k = 0; k <= 96; k++) {
          const a = (k / 96) * Math.PI * 2, x = SRC.x + front * Math.cos(a), z = SRC.z + front * Math.sin(a);
          if (x < X0 || x > X1 || z < Z0 || z > Z1) { g.stroke(); g.beginPath(); continue; }
          const y = height(x, z, t), x1 = x * cyaw - z * syaw, z1 = x * syaw + z * cyaw, y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp + dist;
          g.lineTo(cx + (x1 / z2) * f, cy - (y2 / z2) * f);
        }
        g.stroke();
        g.lineWidth = 1;
      }
      // The source: a small mark in the brand orange ("now"), where the sound starts.
      const sx = SRC.x * cyaw - SRC.z * syaw, sz = SRC.x * syaw + SRC.z * cyaw, sy = height(SRC.x, SRC.z, t) + 0.05;
      const py = sy * cp - sz * sp, pz = sy * sp + sz * cp + dist, px = cx + (sx / pz) * f, pyy = cy - (py / pz) * f;
      g.globalAlpha = 0.9; g.fillStyle = brand;
      g.beginPath(); g.arc(px, pyy, 3.2, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 0.25 * Math.exp(-((t % PULSE_EVERY) / PULSE_DECAY));
      g.beginPath(); g.arc(px, pyy, 9 + 22 * ((t % PULSE_EVERY) / PULSE_EVERY), 0, Math.PI * 2); g.strokeStyle = brand; g.stroke();
      g.globalAlpha = 1;
    }

    const frame = (now: number) => {
      raf = 0;
      if (!running) return;
      draw((now - t0) / 1000);
      raf = requestAnimationFrame(frame);
    };
    // a pause holds the field where it was: on resuming it carries on from there
    const start = () => {
      if (running || still || !visible || document.hidden) return;
      if (pausedAt) { t0 += performance.now() - pausedAt; pausedAt = 0; }
      colours(); running = true; raf = requestAnimationFrame(frame);
    };
    const stop = () => { if (running) pausedAt = performance.now(); running = false; if (raf) cancelAnimationFrame(raf); raf = 0; };

    if (still) { t0 = performance.now() - 1800; colours(); draw(1.8); }
    else start();
    const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(es => { visible = es.some(e => e.isIntersecting); if (visible) start(); else stop(); }) : null;
    if (io) io.observe(cv);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { if (still) draw(1.8); }) : null;
    if (ro) ro.observe(cv);
    const onVis = () => (document.hidden ? stop() : start());
    const onMove = (e: PointerEvent) => { look.tx = (e.clientX / window.innerWidth) * 2 - 1; look.ty = (e.clientY / window.innerHeight) * 2 - 1; };
    // any scroll on the page (the page itself or its scrolling area): hold still until it has stopped for a moment
    const onScroll = () => { stop(); clearTimeout(resume); resume = window.setTimeout(start, 200); };
    document.addEventListener('visibilitychange', onVis);
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      stop();
      clearTimeout(resume);
      document.removeEventListener('scroll', onScroll, true);
      if (io) io.disconnect();
      if (ro) ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointermove', onMove);
    };
  }, []);
  return <canvas ref={ref} className="sound-field" aria-hidden="true" />;
}
