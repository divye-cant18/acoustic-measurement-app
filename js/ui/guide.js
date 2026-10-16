/* Guide player: plays an instructional video from AM.guides inside a sheet.

   The animated video is drawn from scenes (SVG) on a timeline, with captions, chapters and a transcript.
   A guide with `video.src` plays that file instead, with the same chapters as jump points.

     html(id)          static markup for the sheet (it never changes while playing, so app renders leave it alone)
     sync(root, sheet) mount the player when the guide sheet is shown, stop it when the sheet closes
     poster(id)        still frame for thumbnails

   Videos: How to measure (Measure), How to measure the room (Room Setup), What is RT60? (Target) and the app
   walkthrough (Home), all in js/data/guides.js.

   The player only plays a video. It never touches the project or the measurement. */
(function (AM) {
  'use strict';
  const { esc, icon } = AM.util;

  /* ---------- drawing helpers (fixed video palette, the same in light and dark mode) ---------- */
  const P = { bg: '#121718', panel: '#232A2B', line: '#3E4648', ink: '#ECF1F0', dim: 'rgba(242,239,236,.6)', faint: 'rgba(242,239,236,.16)', accent: '#FF5A45', good: '#4CC94C', bad: '#FF6B5B', blue: '#5AA2F0', warn: '#FAB219' };
  const c01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
  const seg = (u, a, b) => c01((u - a) / (b - a));
  const ease = x => { x = c01(x); return x * x * (3 - 2 * x); };
  const lerp = (a, b, k) => a + (b - a) * k;
  const n = v => Math.round(v * 10) / 10;
  const op = v => c01(v).toFixed(2);
  const T = (x, y, s, o = {}) => `<text x="${n(x)}" y="${n(y)}" fill="${o.fill || P.ink}" font-size="${o.size || 13}" font-weight="${o.weight || 400}" text-anchor="${o.anchor || 'start'}" opacity="${op(o.op == null ? 1 : o.op)}">${s}</text>`;
  const L = (x1, y1, x2, y2, stroke, w = 2, extra = '') => `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" ${extra}/>`;

  const tripod = (x, top, floor) => `<g stroke="${P.dim}" stroke-width="2" stroke-linecap="round">${L(x, top, x, floor - 14, P.dim)}${L(x, floor - 14, x - 14, floor, P.dim)}${L(x, floor - 14, x + 14, floor, P.dim)}${L(x, floor - 14, x, floor, P.dim)}</g>`;
  // The measuring device, side view: a laptop standing on a surface at y (microphone dot at the top of the screen),
  // or a phone standing upright, centred on y. One device both plays the test signal and records.
  const laptop = (x, y) => `<rect x="${n(x - 34)}" y="${n(y - 6)}" width="64" height="6" rx="2" fill="${P.ink}"/>${L(x + 28, y - 5, x + 38, y - 50, P.ink, 5)}<circle cx="${n(x + 38)}" cy="${n(y - 50)}" r="3.4" fill="${P.accent}"/>`;
  const phone = (x, y) => `<rect x="${n(x - 8)}" y="${n(y - 16)}" width="16" height="32" rx="3.5" fill="${P.panel}" stroke="${P.ink}" stroke-width="2"/><circle cx="${n(x)}" cy="${n(y + 11)}" r="2" fill="${P.accent}"/>`;
  const table = (x, top, floor, w = 120) => `<rect x="${n(x - w / 2)}" y="${n(top)}" width="${w}" height="6" rx="2" fill="${P.panel}" stroke="${P.line}"/>${L(x - w / 2 + 10, top + 6, x - w / 2 + 10, floor, P.line, 3)}${L(x + w / 2 - 10, top + 6, x + w / 2 - 10, floor, P.line, 3)}`;
  const dimV = (x, y1, y2, label, o = 1, side = 1) => o <= 0 ? '' : `<g opacity="${op(o)}">${L(x, y1, x, y2, P.accent, 1.6)}${L(x - 6, y1, x + 6, y1, P.accent, 1.6)}${L(x - 6, y2, x + 6, y2, P.accent, 1.6)}</g>${T(x + 10 * side, (y1 + y2) / 2 + 5, label, { fill: P.accent, size: 14, weight: 650, anchor: side > 0 ? 'start' : 'end', op: o })}`;
  const dimH = (x1, x2, y, label, o = 1) => o <= 0 ? '' : `<g opacity="${op(o)}">${L(x1, y, x2, y, P.accent, 1.6)}${L(x1, y - 6, x1, y + 6, P.accent, 1.6)}${L(x2, y - 6, x2, y + 6, P.accent, 1.6)}</g>${T((x1 + x2) / 2, y - 9, label, { fill: P.accent, size: 14, weight: 650, anchor: 'middle', op: o })}`;
  const tick = (x, y, on) => `<circle cx="${n(x)}" cy="${n(y)}" r="10" fill="${on ? P.good : 'none'}" stroke="${on ? P.good : P.dim}" stroke-width="2"/>${on ? `<path d="M${n(x - 4.5)},${n(y)} l3.2,3.4 l6,-6.6" fill="none" stroke="${P.bg}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>` : ''}`;
  const cross = (x, y) => `<circle cx="${n(x)}" cy="${n(y)}" r="11" fill="${P.bad}"/>${L(x - 4.5, y - 4.5, x + 4.5, y + 4.5, '#fff', 2.4)}${L(x + 4.5, y - 4.5, x - 4.5, y + 4.5, '#fff', 2.4)}`;

  // Sound spreading from the device into the room, kept inside the room box (x0, y0)–(x1, y1).
  function rings(x, y, t, o, reach, [x0, y0, x1, y1]) {
    if (o <= 0) return '';
    let s = '';
    for (let k = 0; k < 3; k++) {
      const f = (t * 0.8 + k / 3) % 1, r = 12 + f * reach;
      s += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="none" stroke="${P.accent}" stroke-width="2.2" opacity="${op(o * (1 - f) * 0.9)}"/>`;
    }
    return `<svg x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}" overflow="hidden">${s}</svg>`;
  }
  // A take on a timeline: the test signal, then the room's decay, drawn up to `prog`.
  function take(x0, x1, mid, h, prog, split = 0.45) {
    let s = L(x0, mid, x1, mid, P.faint, 1);
    const end = x0 + (x1 - x0) * prog, xs = x0 + (x1 - x0) * split;
    for (let x = x0; x <= end; x += 4) {
      const v = 0.75 + 0.25 * Math.abs(Math.sin(x * 0.37));
      const a = Math.max(0.8, (x < xs ? v : v * Math.exp(-(x - xs) / ((x1 - xs) * 0.28))) * h);
      s += `<rect x="${n(x)}" y="${n(mid - a)}" width="2.4" height="${n(a * 2)}" fill="${x < xs ? P.ink : P.accent}"/>`;
    }
    return s;
  }
  // Side view of the room: 80 px per metre, floor at y = 300.
  const FL = 300, M = 80;
  const section = () => `${L(60, 60, 600, 60, P.faint, 2)}${L(60, 60, 60, FL, P.line, 3)}${L(600, 60, 600, FL, P.faint, 2)}${L(40, FL, 620, FL, P.line, 3)}`;

  /* ---------- scenes: (u = 0…1 through the chapter, t = seconds) -> SVG ---------- */
  const SCENES = {
    intro(u, t) {
      const fy = 210, tx = 320, top = fy - 42;
      let s = T(320, 66, 'How to measure RT60', { size: 26, weight: 700, anchor: 'middle', op: ease(seg(u, 0, 0.12)) });
      s += L(70, fy, 570, fy, P.line, 2) + L(70, 92, 70, fy, P.line, 2) + L(570, 92, 570, fy, P.line, 2);
      s += table(tx, top, fy, 96) + laptop(tx, top);
      s += T(tx, fy + 22, 'One device: its speaker plays, its microphone records', { size: 12, fill: P.dim, anchor: 'middle' });
      const prog = seg(u, 0.12, 0.92);
      s += rings(tx + 38, top - 50, t, prog > 0 && prog < 0.45 ? 1 : 0, 260, [71, 86, 569, fy - 1]);
      s += take(110, 530, 285, 22, prog);
      s += T(110, 254, 'Test signal', { size: 12, fill: P.dim, op: ease(seg(prog, 0.05, 0.15)) });
      s += T(110 + 420 * 0.45 + 6, 254, 'Room rings down', { size: 12, fill: P.accent, op: ease(seg(prog, 0.5, 0.6)) });
      const xs = 110 + 420 * 0.45, ro = ease(seg(u, 0.86, 0.94));
      if (u > 0.86) s += `<g opacity="${op(ro)}">${L(xs, 318, 530, 318, P.accent, 1.6)}${L(xs, 312, xs, 324, P.accent, 1.6)}${L(530, 312, 530, 324, P.accent, 1.6)}</g>${T((xs + 530) / 2, 342, 'RT60: time to fall by 60 dB', { size: 13, weight: 650, fill: P.accent, anchor: 'middle', op: ro })}`;
      return s;
    },

    prepare(u) {
      let s = `<rect x="40" y="70" width="340" height="230" rx="4" fill="none" stroke="${P.faint}" stroke-width="1"/>`;
      // walls with a door (bottom) and a window (top)
      s += L(40, 300, 90, 300, P.ink, 3) + L(140, 300, 380, 300, P.ink, 3) + L(40, 70, 240, 70, P.ink, 3) + L(320, 70, 380, 70, P.ink, 3) + L(40, 70, 40, 300, P.ink, 3) + L(380, 70, 380, 300, P.ink, 3);
      const a = lerp(-Math.PI / 2, 0, ease(seg(u, 0.03, 0.22)));
      s += `<path d="M90,250 A50,50 0 0 1 140,300" fill="none" stroke="${P.faint}" stroke-dasharray="4 4"/>` + L(90, 300, 90 + 50 * Math.cos(a), 300 + 50 * Math.sin(a), P.accent, 3.4);
      s += `<rect x="240" y="67" width="${n(lerp(38, 80, ease(seg(u, 0.12, 0.3))))}" height="6" fill="${P.blue}"/>`;
      s += T(115, 322, 'Door', { size: 11, fill: P.dim, anchor: 'middle' }) + T(280, 60, 'Window', { size: 11, fill: P.dim, anchor: 'middle' });
      // air conditioning, slowing to a stop
      const deg = u < 0.5 ? 4320 * (u - u * u) : 1080;
      s += `<rect x="354" y="118" width="18" height="64" rx="3" fill="${P.panel}" stroke="${P.line}"/><circle cx="326" cy="150" r="18" fill="none" stroke="${P.dim}" stroke-width="2"/><g transform="rotate(${n(deg)} 326 150)">${[0, 120, 240].map(d => `<line x1="326" y1="150" x2="${n(326 + 15 * Math.cos(d * Math.PI / 180))}" y2="${n(150 + 15 * Math.sin(d * Math.PI / 180))}" stroke="${P.ink}" stroke-width="3" stroke-linecap="round"/>`).join('')}</g>`;
      s += T(326, 186, u > 0.48 ? 'Air con off' : 'Air con', { size: 11, fill: u > 0.48 ? P.good : P.dim, anchor: 'middle' });
      // table and a phone switched to silent
      s += `<rect x="120" y="150" width="150" height="80" rx="8" fill="${P.panel}" stroke="${P.line}"/><rect x="186" y="176" width="18" height="30" rx="4" fill="${P.ink}"/>`;
      const so = ease(seg(u, 0.58, 0.68));
      s += `<g opacity="${op(so)}"><circle cx="230" cy="168" r="10" fill="none" stroke="${P.good}" stroke-width="2"/>${L(223, 175, 237, 161, P.good, 2)}</g>${T(246, 172, 'Silent', { size: 11, fill: P.good, op: so })}`;
      // checklist
      s += T(410, 104, 'Before you measure', { size: 12, fill: P.dim });
      [['Doors and windows closed', 0.22], ['Ventilation off', 0.48], ['Phones on silent', 0.66], ['Furniture as normally used', 0.84]].forEach(([label, at], i) => {
        const y = 140 + i * 40, on = u >= at;
        s += tick(422, y - 5, on) + T(442, y, label, { size: 14, fill: on ? P.ink : P.dim });
      });
      return s;
    },

    // Side view: the device at the measuring position. A laptop on a firm table, or a phone on a stand.
    place(u, t) {
      const tx = 290, top = FL - 0.75 * M, micY = top - 50;
      let s = section() + table(tx, top, FL) + laptop(tx, top);
      s += dimV(tx - 76, FL, micY, 'about seated ear height', ease(seg(u, 0.05, 0.18)), -1);
      s += dimH(60, tx - 60, 104, '≥ 1 m from walls', ease(seg(u, 0.22, 0.34)));
      s += T(tx, FL + 26, 'Laptop on a firm table', { size: 12, fill: P.dim, anchor: 'middle', op: ease(seg(u, 0.28, 0.38)) });
      s += rings(tx + 38, micY, t, ease(seg(u, 0.36, 0.44)) * (1 - ease(seg(u, 0.58, 0.64))), 170, [61, 61, 599, FL - 1]);
      const px = 500, py = FL - 1.2 * M, po = ease(seg(u, 0.6, 0.72));
      s += `<g opacity="${op(po)}">${tripod(px, py + 16, FL)}${phone(px, py)}</g>` + T(px, FL + 26, 'or a phone on a stand', { size: 12, fill: P.dim, anchor: 'middle', op: po });
      s += T(330, 140, 'Not held · not against anything', { size: 15, weight: 650, fill: P.good, anchor: 'middle', op: ease(seg(u, 0.8, 0.9)) });
      return s;
    },

    // The device close up: where its microphone and speaker are, and what to check before the take.
    device(u) {
      const lo = ease(seg(u, 0.03, 0.14));
      let s = `<rect x="70" y="92" width="210" height="128" rx="8" fill="${P.panel}" stroke="${P.ink}" stroke-width="2"/><rect x="82" y="104" width="186" height="104" rx="3" fill="#0E1414"/>`;
      s += `<path d="M48,236 L302,236 L288,222 L62,222 Z" fill="${P.panel}" stroke="${P.ink}" stroke-width="2" stroke-linejoin="round"/>`;
      s += `<circle cx="175" cy="98" r="2.8" fill="${P.accent}"/>` + T(175, 84, 'microphone', { size: 11, fill: P.accent, anchor: 'middle', op: lo });
      for (let i = 0; i < 6; i++) s += `<circle cx="${n(84 + i * 6)}" cy="229" r="1.4" fill="${P.dim}"/><circle cx="${n(236 + i * 6)}" cy="229" r="1.4" fill="${P.dim}"/>`;
      s += T(175, 258, 'speakers', { size: 11, fill: P.accent, anchor: 'middle', op: lo });
      s += T(340, 104, 'Before the take', { size: 12, fill: P.dim });
      [['Headphones disconnected', 0.16], ['Speaker and mic uncovered', 0.36], ['Volume high, not distorting', 0.56], ['Hands off: step back', 0.76]].forEach(([label, at], i) => {
        const y = 140 + i * 40, on = u >= at;
        s += tick(352, y - 5, on) + T(372, y, label, { size: 14, fill: on ? P.ink : P.dim });
      });
      return s;
    },

    run(u, t) {
      const prog = seg(u, 0.12, 0.92), pressed = u >= 0.1, done = u >= 0.93;
      const status = !pressed ? 'Ready to measure' : prog < 0.45 ? 'Playing sine sweep' : !done ? 'Recording the decay' : 'Recording complete';
      let s = `<rect x="60" y="40" width="160" height="280" rx="22" fill="#121110" stroke="${P.line}" stroke-width="2"/>`;
      s += T(140, 76, 'Acoustic Measurement', { size: 11, fill: P.dim, anchor: 'middle' }) + T(140, 110, status, { size: 13, weight: 650, anchor: 'middle' });
      const level = !pressed ? 0.04 : prog < 0.45 ? 0.62 + 0.08 * Math.sin(t * 14) : 0.62 * Math.exp(-(prog - 0.45) * 7);
      s += T(78, 148, 'Input level', { size: 10, fill: P.dim }) + `<rect x="78" y="156" width="124" height="8" rx="4" fill="${P.line}"/><rect x="${78 + 124 * 0.9}" y="156" width="${124 * 0.1}" height="8" rx="2" fill="${P.bad}" opacity=".45"/><rect x="78" y="156" width="${n(124 * c01(level))}" height="8" rx="4" fill="${P.good}"/>`;
      s += T(78, 190, 'Progress', { size: 10, fill: P.dim }) + `<rect x="78" y="198" width="124" height="8" rx="4" fill="${P.line}"/><rect x="78" y="198" width="${n(124 * prog)}" height="8" rx="4" fill="${P.accent}"/>`;
      s += `<rect x="78" y="250" width="124" height="40" rx="10" fill="${pressed && !done ? '#3A3633' : P.accent}"/>` + T(140, 275, !pressed ? 'Start measurement' : done ? 'Measure again' : 'Measuring…', { size: 12, weight: 650, fill: '#fff', anchor: 'middle' });
      const tap = seg(u, 0.05, 0.16);
      if (tap > 0 && tap < 1) s += `<circle cx="140" cy="270" r="${n(6 + 40 * tap)}" fill="none" stroke="${P.ink}" stroke-width="2" opacity="${op(1 - tap)}"/>`;
      // banner
      const quiet = ease(seg(u, 0.1, 0.16)) * (1 - ease(seg(u, 0.9, 0.94)));
      s += `<g opacity="${op(Math.max(quiet, done ? 1 : 0))}"><rect x="270" y="50" width="330" height="56" rx="12" fill="${P.panel}"/></g>`;
      if (!done) s += `<g opacity="${op(quiet)}"><circle cx="300" cy="78" r="12" fill="none" stroke="${P.accent}" stroke-width="2"/>${L(292, 86, 308, 70, P.accent, 2)}</g>${T(324, 84, 'Stay still and silent', { size: 18, weight: 700, op: quiet })}`;
      else s += tick(300, 78, true) + T(324, 84, 'Take complete', { size: 18, weight: 700 });
      s += take(280, 600, 200, 34, prog);
      s += T(280, 262, 'Signal plays', { size: 12, fill: P.dim, op: ease(seg(prog, 0.05, 0.12)) }) + T(280 + 320 * 0.45 + 6, 262, 'Room rings down', { size: 12, fill: P.accent, op: ease(seg(prog, 0.5, 0.58)) });
      s += T(600, 300, `${(prog * 10).toFixed(1)} s`, { size: 12, fill: P.dim, anchor: 'end' });
      return s;
    },

    avoid(u) {
      const items = [
        ['Corners and walls', (x, y) => `<path d="M${x - 30},${y - 26} L${x - 30},${y + 22} L${x + 30},${y + 22}" fill="none" stroke="${P.dim}" stroke-width="3"/><circle cx="${x - 21}" cy="${y + 13}" r="5" fill="${P.accent}"/>`],
        ['Talking and footsteps', (x, y) => `<rect x="${x - 30}" y="${y - 26}" width="60" height="38" rx="12" fill="none" stroke="${P.dim}" stroke-width="3"/><path d="M${x - 12},${y + 12} l-6,12 l16,-12" fill="none" stroke="${P.dim}" stroke-width="3" stroke-linejoin="round"/>${[-12, 0, 12].map(d => `<circle cx="${x + d}" cy="${y - 7}" r="3" fill="${P.ink}"/>`).join('')}`],
        ['Fans and open windows', (x, y) => `<circle cx="${x}" cy="${y}" r="24" fill="none" stroke="${P.dim}" stroke-width="3"/>${[0, 120, 240].map(d => L(x, y, x + 19 * Math.cos(d * Math.PI / 180), y + 19 * Math.sin(d * Math.PI / 180), P.ink, 4)).join('')}`],
        ['Holding the device', (x, y) => `<rect x="${x - 9}" y="${y - 30}" width="18" height="34" rx="4" fill="${P.panel}" stroke="${P.ink}" stroke-width="2"/><path d="M${x - 17},${y - 6} q-2,22 17,24 q19,-2 17,-24" fill="none" stroke="${P.dim}" stroke-width="3" stroke-linecap="round"/>`],
        ['Volume so high it distorts', (x, y) => { let pts = ''; for (let i = 0; i <= 60; i++) { const xx = x - 30 + i; pts += `${xx},${n(y - Math.max(-14, Math.min(14, 26 * Math.sin(i / 60 * Math.PI * 4))))} `; } return `<polyline points="${pts}" fill="none" stroke="${P.ink}" stroke-width="2.4"/>${L(x - 34, y - 14, x + 34, y - 14, P.bad, 1.4, 'stroke-dasharray="3 3"')}${L(x - 34, y + 14, x + 34, y + 14, P.bad, 1.4, 'stroke-dasharray="3 3"')}`; }],
        ['Ringtones and alerts', (x, y) => `<path d="M${x - 18},${y + 12} Q${x - 18},${y - 24} ${x},${y - 24} Q${x + 18},${y - 24} ${x + 18},${y + 12} Z" fill="none" stroke="${P.dim}" stroke-width="3" stroke-linejoin="round"/><circle cx="${x}" cy="${y + 18}" r="4" fill="${P.ink}"/><path d="M${x + 26},${y - 20} q8,10 0,20 M${x - 26},${y - 20} q-8,10 0,20" fill="none" stroke="${P.accent}" stroke-width="2.4" stroke-linecap="round"/>`],
      ];
      let s = T(320, 40, 'Avoid during the take', { size: 16, weight: 700, anchor: 'middle' });
      items.forEach(([label, draw], i) => {
        const x = 40 + (i % 3) * 195, y = 62 + Math.floor(i / 3) * 140, o = ease(seg(u, i * 0.1, i * 0.1 + 0.08));
        if (o <= 0) return;
        s += `<g opacity="${op(o)}"><rect x="${x}" y="${y}" width="175" height="124" rx="14" fill="${P.panel}"/>${draw(x + 87, y + 50)}${cross(x + 152, y + 22)}</g>${T(x + 87, y + 108, label, { size: 13, anchor: 'middle', op: o })}`;
      });
      return s;
    },

    ready(u) {
      const c = ease(seg(u, 0, 0.35)), k = ease(seg(u, 0.25, 0.45)), o = ease(seg(u, 0.3, 0.5));
      let s = `<circle cx="320" cy="140" r="46" fill="none" stroke="${P.good}" stroke-width="5" stroke-dasharray="289" stroke-dashoffset="${n(289 * (1 - c))}" transform="rotate(-90 320 140)"/>`;
      s += `<path d="M298,141 L314,157 L345,124" fill="none" stroke="${P.good}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="70" stroke-dashoffset="${n(70 * (1 - k))}"/>`;
      s += T(320, 228, 'You are ready', { size: 24, weight: 700, anchor: 'middle', op: o });
      s += T(320, 258, 'Close this video and press Start measurement.', { size: 15, fill: P.dim, anchor: 'middle', op: o });
      s += T(320, 300, 'Device on a firm support · 1 m from walls · uncovered · hands off · stay silent', { size: 12, fill: P.accent, anchor: 'middle', op: ease(seg(u, 0.5, 0.65)) });
      return s;
    },

    /* ----- How to measure the room (length, width, height) ----- */
    dimIntro(u) {
      const { P: Q, pts } = isoBox(10, 6, 3, 22, 282, 128);
      let s = box3d(pts, 10, 6, 3);
      s += isoDim(Q(0, 6.9, 0), Q(10, 6.9, 0), 'Length 10 m', ease(seg(u, 0.1, 0.25)), 0, 22);
      s += isoDim(Q(10.9, 0, 0), Q(10.9, 6, 0), 'Width 6 m', ease(seg(u, 0.3, 0.45)), 34, 20);
      const hx = 18, h0 = Q(10, 6, 0), h1 = Q(10, 6, 3);
      s += isoDim([h0[0] + hx, h0[1]], [h1[0] + hx, h1[1]], 'Height 3 m', ease(seg(u, 0.5, 0.65)), 10, -31, 'start');
      s += T(320, 344, 'Volume = 10 × 6 × 3 = 180 m³', { size: 17, weight: 700, anchor: 'middle', fill: P.accent, op: ease(seg(u, 0.75, 0.88)) });
      return s;
    },

    dimTools(u) {
      let s = L(146, 118, 146, 262, P.line, 5);
      s += `<rect x="150" y="140" width="80" height="110" rx="12" fill="${P.panel}" stroke="${P.ink}" stroke-width="2"/><rect x="162" y="152" width="56" height="34" rx="4" fill="#0E1A12"/>`;
      const b = ease(seg(u, 0.08, 0.4));
      s += T(190, 175, `${(10 * b).toFixed(2)} m`, { size: 13, weight: 650, fill: P.good, anchor: 'middle' }) + `<circle cx="190" cy="222" r="10" fill="none" stroke="${P.dim}" stroke-width="2"/>`;
      if (b > 0) s += L(230, 165, 230 + 120 * b, 165, P.bad, 2) + `<circle cx="${n(230 + 120 * b)}" cy="165" r="4" fill="${P.bad}"/>`;
      s += T(150, 108, 'Back edge on the wall', { size: 12, fill: P.dim, op: ease(seg(u, 0.25, 0.35)) });
      s += T(190, 284, 'Laser distance meter', { size: 14, weight: 650, anchor: 'middle' }) + T(190, 304, 'quickest', { size: 12, fill: P.accent, anchor: 'middle' });
      s += T(372, 200, 'or', { size: 14, fill: P.dim, anchor: 'middle', op: ease(seg(u, 0.45, 0.52)) });
      const t2 = ease(seg(u, 0.5, 0.8)), o2 = ease(seg(u, 0.45, 0.52));
      s += `<g opacity="${op(o2)}"><circle cx="470" cy="190" r="40" fill="${P.panel}" stroke="${P.ink}" stroke-width="2"/><circle cx="470" cy="190" r="12" fill="none" stroke="${P.dim}" stroke-width="2"/>`;
      if (t2 > 0) { s += `<rect x="508" y="208" width="${n(100 * t2)}" height="10" fill="${P.warn}"/>`; for (let x = 516; x < 508 + 100 * t2; x += 10) s += L(x, 208, x, 213, P.bg, 1); }
      s += `</g>${T(470, 284, 'Tape measure', { size: 14, weight: 650, anchor: 'middle', op: o2 })}${T(470, 304, 'with a helper', { size: 12, fill: P.dim, anchor: 'middle', op: o2 })}`;
      return s;
    },

    dimLength(u) {
      const ox = 100, oy = 70, s44 = 44, W = 10 * s44, H = 6 * s44;
      let s = plan(ox, oy, W, H);
      const b = ease(seg(u, 0.1, 0.45)), y1 = oy + H / 2 + 8;
      s += `<rect x="${ox + 4}" y="${y1 - 8}" width="20" height="16" rx="3" fill="${P.ink}"/>`;
      if (b > 0) s += L(ox + 24, y1, ox + 24 + (W - 28) * b, y1, P.bad, 2) + `<circle cx="${n(ox + 24 + (W - 28) * b)}" cy="${y1}" r="4" fill="${P.bad}"/>`;
      s += reading(ox + 30, y1 + 12, `${(10 * b).toFixed(1)} m`);
      s += dimH(ox, ox + W, oy - 14, 'Length · 10.0 m', ease(seg(u, 0.45, 0.55)));
      const b2 = ease(seg(u, 0.7, 0.88)), y2 = oy + 46;
      if (u > 0.68) {
        s += `<rect x="${ox + 4}" y="${y2 - 8}" width="20" height="16" rx="3" fill="${P.ink}"/>`;
        if (b2 > 0) s += L(ox + 24, y2, ox + 24 + (W - 28) * b2, y2, P.bad, 2) + `<circle cx="${n(ox + 24 + (W - 28) * b2)}" cy="${y2}" r="4" fill="${P.bad}"/>`;
        s += reading(ox + 30, y2 + 12, `${(10 * b2).toFixed(1)} m`);
      }
      s += T(ox + W - 12, oy + H - 16, 'Check at the other end', { size: 13, fill: P.dim, anchor: 'end', op: ease(seg(u, 0.72, 0.8)) });
      return s;
    },

    dimWidth(u) {
      const ox = 60, oy = 70, s44 = 44, W = 10 * s44, H = 6 * s44;
      let s = plan(ox, oy, W, H);
      const b = ease(seg(u, 0.1, 0.45)), x1 = ox + W - 70;
      s += `<rect x="${x1 - 8}" y="${oy + 4}" width="16" height="20" rx="3" fill="${P.ink}"/>`;
      if (b > 0) s += L(x1, oy + 24, x1, oy + 24 + (H - 28) * b, P.bad, 2) + `<circle cx="${x1}" cy="${n(oy + 24 + (H - 28) * b)}" r="4" fill="${P.bad}"/>`;
      s += reading(x1 + 10, oy + 36, `${(6 * b).toFixed(1)} m`);
      s += dimV(ox + W + 16, oy, oy + H, 'Width · 6.0 m', ease(seg(u, 0.45, 0.55)));
      const b2 = ease(seg(u, 0.62, 0.82)), x2 = ox + 70;
      if (u > 0.6) {
        s += `<rect x="${x2 - 8}" y="${oy + 4}" width="16" height="20" rx="3" fill="${P.ink}"/>`;
        if (b2 > 0) s += L(x2, oy + 24, x2, oy + 24 + (H - 28) * b2, P.bad, 2) + `<circle cx="${x2}" cy="${n(oy + 24 + (H - 28) * b2)}" r="4" fill="${P.bad}"/>`;
        s += reading(x2 + 10, oy + 36, `${(6 * b2).toFixed(1)} m`);
      }
      s += T(ox + W / 2, oy + H - 16, 'Use the average if they differ', { size: 13, fill: P.dim, anchor: 'middle', op: ease(seg(u, 0.82, 0.9)) });
      return s;
    },

    dimHeight(u) {
      const fl = 310, ceil = fl - 3 * 72, slab = ceil - 30;
      let s = L(80, slab, 560, slab, P.dim, 6, 'stroke-dasharray="10 6"');
      for (let x = 130; x < 560; x += 90) s += L(x, slab, x, ceil, P.faint, 1.4);
      s += L(80, ceil, 560, ceil, P.ink, 3) + L(80, slab - 6, 80, fl, P.line, 3) + L(560, slab - 6, 560, fl, P.line, 3) + L(60, fl, 580, fl, P.line, 3);
      const b = ease(seg(u, 0.1, 0.4));
      s += `<rect x="310" y="${fl - 18}" width="20" height="18" rx="3" fill="${P.ink}"/>`;
      if (b > 0) s += L(320, fl - 18, 320, fl - 18 - (fl - 18 - ceil) * b, P.bad, 2) + `<circle cx="320" cy="${n(fl - 18 - (fl - 18 - ceil) * b)}" r="4" fill="${P.bad}"/>`;
      s += reading(338, fl - 30, `${(3 * b).toFixed(1)} m`);
      s += dimV(130, fl, ceil, 'Height · 3.0 m', ease(seg(u, 0.4, 0.5)));
      s += T(420, ceil + 22, 'Visible ceiling: measure to here', { size: 13, weight: 650, fill: P.good, anchor: 'middle', op: ease(seg(u, 0.45, 0.55)) });
      s += T(420, slab - 12, 'Slab above: only for an open grid or baffles', { size: 12, fill: P.dim, anchor: 'middle', op: ease(seg(u, 0.7, 0.8)) });
      return s;
    },

    dimIrregular(u) {
      const k = 30, x0 = 70, y0 = 70;
      let s = `<path d="M${x0},${y0} H${x0 + 10 * k} V${y0 + 4 * k} H${x0 + 3 * k} V${y0 + 8 * k} H${x0} Z" fill="${P.panel}" stroke="${P.ink}" stroke-width="3" stroke-linejoin="round"/>`;
      s += `<rect x="${x0 + 7.4 * k}" y="${y0 + 1.6 * k}" width="12" height="12" fill="${P.dim}"/>` + T(x0 + 7.4 * k + 6, y0 + 1.6 * k + 30, 'ignore', { size: 11, fill: P.dim, anchor: 'middle', op: ease(seg(u, 0.03, 0.12)) });
      s += L(x0, y0 + 4 * k, x0 + 3 * k, y0 + 4 * k, P.accent, 2, `stroke-dasharray="5 4" opacity="${op(ease(seg(u, 0.15, 0.22)))}"`);
      s += T(x0 + 4 * k, y0 + 2.2 * k, 'A', { size: 20, weight: 700, anchor: 'middle', op: ease(seg(u, 0.2, 0.28)) }) + T(x0 + 1.5 * k, y0 + 6.2 * k, 'B', { size: 20, weight: 700, anchor: 'middle', op: ease(seg(u, 0.28, 0.35)) });
      [['A: 10 × 4 = 40 m²', 0.3], ['B: 3 × 4 = 12 m²', 0.38], ['Floor area: 52 m²', 0.46], ['Length: 10 m', 0.54], ['Width: 52 ÷ 10 = 5.2 m', 0.62]].forEach(([txt, at], i) => {
        s += T(410, 92 + i * 30, txt, { size: 15, weight: i >= 2 ? 650 : 400, fill: i === 4 ? P.accent : P.ink, op: ease(seg(u, at, at + 0.06)) });
      });
      const so = ease(seg(u, 0.7, 0.8));
      s += `<g opacity="${op(so)}"><path d="M420,320 V274 L600,252 V320 Z" fill="${P.panel}" stroke="${P.ink}" stroke-width="2"/></g>`;
      s += T(426, 268, '2.6 m', { size: 12, fill: P.dim, op: so }) + T(596, 246, '3.4 m', { size: 12, fill: P.dim, anchor: 'end', op: so }) + T(510, 306, 'average 3.0 m', { size: 13, weight: 650, fill: P.accent, anchor: 'middle', op: ease(seg(u, 0.82, 0.9)) });
      return s;
    },

    dimEnter(u) {
      let s = `<rect x="140" y="56" width="360" height="262" rx="16" fill="${P.panel}"/>` + T(166, 90, 'Dimensions', { size: 16, weight: 700 });
      [['Length', '10.0', 0.05, 0.22], ['Width', '6.0', 0.24, 0.36], ['Height', '3.0', 0.38, 0.5]].forEach(([label, v, a, b], i) => {
        const x = 166 + i * 110, typed = v.slice(0, Math.ceil(v.length * seg(u, a, b)));
        const on = u >= a && u < b + 0.04;
        s += T(x, 120, label, { size: 12, fill: P.dim }) + `<rect x="${x}" y="128" width="96" height="38" rx="8" fill="${P.bg}" stroke="${on ? P.accent : P.line}" stroke-width="${on ? 2 : 1.4}"/>` + T(x + 12, 153, typed, { size: 16, weight: 650 }) + T(x + 84, 153, 'm', { size: 13, fill: P.dim, anchor: 'end' });
      });
      const vo = ease(seg(u, 0.56, 0.66));
      s += T(166, 200, 'Volume', { size: 12, fill: P.dim, op: vo }) + T(166, 250, '180', { size: 36, weight: 700, op: vo }) + T(238, 250, 'm³', { size: 16, fill: P.dim, op: vo });
      const { pts } = isoBox(10, 6, 3, 8, 392, 204);
      s += `<g opacity="${op(vo)}">${box3d(pts, 10, 6, 3)}</g>`;
      const co = ease(seg(u, 0.76, 0.86));
      s += `<g opacity="${op(co)}">${tick(176, 286, true)}</g>` + T(196, 291, 'Check the sketch looks like your room', { size: 14, op: co });
      return s;
    },

    /* ----- What is RT60? (Target step): what reverberation is, what too long and too short do, what changes it ----- */
    // A clap in a room. The direct sound and its reflections off the walls, floor and ceiling (drawn as mirror-image
    // sources, which is how reflections behave) spread out and fade as the surfaces absorb them.
    rtWhat(u) {
      const x0 = 60, y0 = 84, x1 = 580, y1 = 296, sx = 176, sy = 230, sec = u * 10;
      let s = T(320, 54, 'Sound lingers after it stops', { size: 20, weight: 700, anchor: 'middle', op: ease(seg(u, 0, 0.1)) });
      s += `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="none" stroke="${P.line}" stroke-width="3"/>`;
      const srcs = [[sx, sy, 1], [2 * x0 - sx, sy, 0.62], [2 * x1 - sx, sy, 0.62], [sx, 2 * y1 - sy, 0.62], [sx, 2 * y0 - sy, 0.62],
        [2 * x1 - sx, 2 * y0 - sy, 0.4], [2 * x0 - sx, 2 * y0 - sy, 0.4], [2 * x1 - sx, 2 * y1 - sy, 0.4]];
      let level = 0, fronts = '';
      [0.5, 5.2].forEach(at => {
        const age = sec - at;
        if (age <= 0) return;
        const fade = Math.exp(-age / 1.7), r = 8 + age * 125;
        level = Math.max(level, fade);
        srcs.forEach(([x, y, k]) => { if (fade * k > 0.02) fronts += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="none" stroke="${P.accent}" stroke-width="2" opacity="${op(fade * k)}"/>`; });
      });
      s += `<svg x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}" overflow="hidden">${fronts}</svg>`;
      // the clap
      const flash = Math.max(c01(1 - Math.abs(sec - 0.6) / 0.35), c01(1 - Math.abs(sec - 5.3) / 0.35));
      s += `<circle cx="${sx}" cy="${sy}" r="7" fill="${P.ink}"/><circle cx="${sx}" cy="${sy}" r="${n(10 + 10 * flash)}" fill="none" stroke="${P.ink}" stroke-width="2" opacity="${op(flash)}"/>`;
      s += T(sx, sy + 30, 'Clap', { size: 12, fill: P.dim, anchor: 'middle' });
      s += T(420, 130, 'Reflections off walls, floor and ceiling', { size: 13, fill: P.ink, anchor: 'middle', op: ease(seg(u, 0.14, 0.24)) * (1 - ease(seg(u, 0.5, 0.55))) });
      s += T(420, 150, 'keep the sound going', { size: 13, fill: P.ink, anchor: 'middle', op: ease(seg(u, 0.14, 0.24)) * (1 - ease(seg(u, 0.5, 0.55))) });
      // how loud the room still is
      s += T(x0, 326, 'Sound in the room', { size: 11, fill: P.dim }) + `<rect x="${x0 + 110}" y="317" width="190" height="8" rx="4" fill="${P.line}"/><rect x="${x0 + 110}" y="317" width="${n(190 * level)}" height="8" rx="4" fill="${P.accent}"/>`;
      s += T(x1, 326, 'This lingering is reverberation', { size: 12, weight: 650, fill: P.accent, anchor: 'end', op: ease(seg(u, 0.3, 0.4)) });
      return s;
    },

    // RT60 defined on a level-against-time graph: the sound stops, its level falls in a straight line in decibels, and the
    // time it takes to fall by 60 dB is the RT60.
    rtDefine(u) {
      const gx0 = 116, gx1 = 576, gy0 = 96, gy1 = 280, dbY = db => gy0 + (gy1 - gy0) * (-db / 60);
      let s = T(320, 50, 'RT60: the time for sound to fade by 60 dB', { size: 18, weight: 700, anchor: 'middle', op: ease(seg(u, 0, 0.1)) });
      s += L(gx0, gy0 - 10, gx0, gy1 + 18, P.line, 2) + L(gx0, gy1 + 18, gx1, gy1 + 18, P.line, 2);
      [0, -20, -40, -60].forEach(db => {
        s += L(gx0, dbY(db), gx1, dbY(db), P.faint, 1, 'stroke-dasharray="2 5"') + T(gx0 - 10, dbY(db) + 4, db === 0 ? '0 dB' : `−${-db} dB`, { size: 11, fill: P.dim, anchor: 'end' });
      });
      s += T(gx1, gy1 + 36, 'time', { size: 11, fill: P.dim, anchor: 'end' }) + T(gx0 - 10, gy0 - 18, 'level', { size: 11, fill: P.dim, anchor: 'end' });
      const xOn = gx0 + 16, xStop = gx0 + 120, xEnd = xStop + 300;
      const reveal = xOn + (gx1 - xOn) * ease(seg(u, 0.06, 0.66));
      let d = '';
      for (let x = xOn; x <= reveal; x += 3) {
        const db = x < xOn + 6 ? -60 + 60 * (x - xOn) / 6 : x < xStop ? -2.2 * Math.abs(Math.sin(x * 0.37)) : Math.max(-63, -60 * (x - xStop) / (xEnd - xStop) + 1.4 * Math.sin(x * 0.9));
        d += `${d ? 'L' : 'M'}${n(x)},${n(dbY(db))} `;
      }
      if (d) s += `<path d="${d}" fill="none" stroke="${P.accent}" stroke-width="2.6" stroke-linejoin="round"/>`;
      const so = ease(seg(u, 0.24, 0.32));
      s += L(xStop, gy0 - 6, xStop, gy1 + 18, P.dim, 1.4, `stroke-dasharray="4 4" opacity="${op(so)}"`) + T(xStop + 6, gy0 - 14, 'Sound stops', { size: 12, fill: P.dim, op: so });
      const ro = ease(seg(u, 0.68, 0.78));
      s += `<g opacity="${op(ro)}">${L(xStop, gy1 + 4, xEnd, gy1 + 4, P.ink, 2)}${L(xStop, gy1 - 2, xStop, gy1 + 10, P.ink, 2)}${L(xEnd, gy1 - 2, xEnd, gy1 + 10, P.ink, 2)}<circle cx="${xEnd}" cy="${dbY(-60)}" r="5" fill="${P.ink}"/></g>`;
      s += T((xStop + xEnd) / 2, gy1 - 8, 'RT60', { size: 18, weight: 700, anchor: 'middle', op: ro });
      s += T(320, 344, 'Measured in seconds. The longer it is, the more the room rings.', { size: 13, fill: P.ink, anchor: 'middle', op: ease(seg(u, 0.82, 0.92)) });
      return s;
    },

    // The same four words in two rooms: a long RT60 (their tails overlap) …
    rtLong(u) {
      let s = T(320, 50, 'Too long: words blur into each other', { size: 18, weight: 700, anchor: 'middle', op: ease(seg(u, 0, 0.1)) });
      s += speech(u, 0.2, P.warn);
      const oo = ease(seg(u, 0.55, 0.65));
      s += `<g opacity="${op(oo)}">${L(160, 140, 222, 140, P.bad, 2)}${L(160, 134, 160, 146, P.bad, 2)}${L(222, 134, 222, 146, P.bad, 2)}</g>` + T(191, 128, 'still ringing', { size: 12, weight: 650, fill: P.bad, anchor: 'middle', op: oo });
      s += T(320, 336, 'Harder to understand · people talk louder · the room gets noisy and tiring', { size: 13, fill: P.warn, anchor: 'middle', op: ease(seg(u, 0.72, 0.82)) });
      return s;
    },
    // … and a short one (each word ends before the next).
    rtShort(u) {
      let s = T(320, 50, 'Short: every word stays clear', { size: 18, weight: 700, anchor: 'middle', op: ease(seg(u, 0, 0.1)) });
      s += speech(u, 0.03, P.good);
      s += T(320, 322, 'Right for meetings, classrooms and offices.', { size: 13, fill: P.good, anchor: 'middle', op: ease(seg(u, 0.62, 0.72)) });
      s += T(320, 344, 'Far too short can sound dead: rooms for music need more.', { size: 12, fill: P.dim, anchor: 'middle', op: ease(seg(u, 0.78, 0.88)) });
      return s;
    },

    // Where rooms sit between short and long (their order, not values): speech rooms short, music rooms long.
    rtDepends(u) {
      const ax0 = 84, ax1 = 556, ay = 206, at = f => ax0 + (ax1 - ax0) * f;
      let s = T(320, 50, 'The right RT60 depends on how the room is used', { size: 18, weight: 700, anchor: 'middle', op: ease(seg(u, 0, 0.1)) });
      s += L(ax0, ay, ax1, ay, P.ink, 3) + `<path d="M${ax1 + 2},${ay} l-10,-6 v12 Z" fill="${P.ink}"/>`;
      s += T(ax0, ay + 76, '← shorter', { size: 12, fill: P.dim }) + T(ax1, ay + 76, 'longer →', { size: 12, fill: P.dim, anchor: 'end' }) + T(320, ay + 76, 'RT60', { size: 13, weight: 650, anchor: 'middle' });
      [['Meeting room', 0.12, -1, 0.1], ['Classroom', 0.24, 1, 0.18], ['Restaurant', 0.42, -1, 0.26], ['Theatre', 0.6, 1, 0.34], ['Concert hall', 0.8, -1, 0.42], ['Church', 0.94, 1, 0.5]].forEach(([label, f, side, a]) => {
        const o = ease(seg(u, a, a + 0.07)), x = at(f);
        s += `<g opacity="${op(o)}"><circle cx="${n(x)}" cy="${ay}" r="6" fill="${f < 0.3 ? P.good : f > 0.55 ? P.blue : P.dim}"/>${L(x, ay + side * 10, x, ay + side * 26, P.faint, 1.4)}</g>`;
        s += T(x, ay + side * 36 + (side > 0 ? 4 : 0), label, { size: 12, anchor: 'middle', op: o });
      });
      const bo = ease(seg(u, 0.58, 0.68));
      s += `<g opacity="${op(bo)}">${L(at(0.06), 118, at(0.3), 118, P.good, 2)}${L(at(0.56), 118, at(0.98), 118, P.blue, 2)}</g>`;
      s += T(at(0.18), 108, 'Speech: clarity', { size: 13, weight: 650, fill: P.good, anchor: 'middle', op: bo }) + T(at(0.77), 108, 'Music: fullness', { size: 13, weight: 650, fill: P.blue, anchor: 'middle', op: bo });
      s += T(320, 336, 'This step sets the target from standards for the room’s use and size.', { size: 13, fill: P.accent, anchor: 'middle', op: ease(seg(u, 0.78, 0.88)) });
      return s;
    },

    // What changes it: hard, bare surfaces and size make it longer; absorbing panels make it shorter.
    rtTreat(u, t) {
      const x0 = 50, y0 = 88, x1 = 290, y1 = 268, pi = ease(seg(u, 0.38, 0.52));
      let s = T(320, 50, 'What changes RT60', { size: 18, weight: 700, anchor: 'middle', op: ease(seg(u, 0, 0.1)) });
      s += `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="none" stroke="${P.ink}" stroke-width="3"/>`;
      // panels arrive on the walls and under the ceiling
      if (pi > 0) {
        s += `<g opacity="${op(pi)}">`;
        [130, 190].forEach(y => { s += `<rect x="${x0 + 3}" y="${y}" width="8" height="46" rx="2" fill="${P.good}"/><rect x="${x1 - 11}" y="${y}" width="8" height="46" rx="2" fill="${P.good}"/>`; });
        [90, 150, 210].forEach(x => { s += `<rect x="${x0 + x - 30}" y="${y0 + 8}" width="46" height="7" rx="2" fill="${P.good}"/>`; });
        s += '</g>';
      }
      // the sound in the room: it reaches the walls and comes back while the room is bare, and dies away soon with panels
      s += rings(170, 200, t, 1, lerp(230, 70, pi), [x0 + 1, y0 + 1, x1 - 1, y1 - 1]);
      s += T(170, y1 + 20, pi > 0.5 ? 'With panels' : 'Bare, hard surfaces', { size: 12, fill: pi > 0.5 ? P.good : P.dim, anchor: 'middle' });
      // the decay before and after
      const gx0 = 340, gx1 = 600, gy0 = 96, gy1 = 262;
      s += L(gx0, gy0 - 6, gx0, gy1, P.line, 2) + L(gx0, gy1, gx1, gy1, P.line, 2) + T(gx1, gy1 + 18, 'time', { size: 11, fill: P.dim, anchor: 'end' });
      const b = ease(seg(u, 0.06, 0.3));
      s += L(gx0 + 4, gy0, gx0 + 4 + (gx1 - gx0 - 10) * b, gy0 + (gy1 - gy0 - 8) * b, P.warn, 2.6) + T(gx1 - 2, gy1 - 34, 'Before', { size: 12, fill: P.warn, anchor: 'end', op: ease(seg(u, 0.26, 0.32)) });
      const a = ease(seg(u, 0.52, 0.7));
      if (a > 0) s += L(gx0 + 4, gy0, gx0 + 4 + 110 * a, gy0 + (gy1 - gy0 - 8) * a, P.good, 2.6);
      s += T(gx0 + 122, gy1 - 6, 'After', { size: 12, weight: 650, fill: P.good, anchor: 'start', op: ease(seg(u, 0.68, 0.74)) });
      s += T(320, 322, 'Hard surfaces and bigger rooms make it longer.', { size: 13, fill: P.ink, anchor: 'middle', op: ease(seg(u, 0.12, 0.22)) });
      s += T(320, 344, 'Absorbing panels make it shorter. That is what the treatment steps plan.', { size: 13, fill: P.good, anchor: 'middle', op: ease(seg(u, 0.74, 0.84)) });
      return s;
    },

    // How the app uses it: target, measure, compare and treat.
    rtInApp(u) {
      let s = T(320, 50, 'How this app uses RT60', { size: 18, weight: 700, anchor: 'middle', op: ease(seg(u, 0, 0.1)) });
      const cards = [
        ['Set the target', 'Step 2 · this step', (x, y) => `<circle cx="${x}" cy="${y}" r="17" fill="none" stroke="${P.accent}" stroke-width="3"/><circle cx="${x}" cy="${y}" r="9" fill="none" stroke="${P.accent}" stroke-width="3"/><circle cx="${x}" cy="${y}" r="2.6" fill="${P.accent}"/>`],
        ['Measure the room', 'Steps 3 to 6', (x, y) => `<rect x="${x - 7}" y="${y - 18}" width="14" height="24" rx="7" fill="none" stroke="${P.ink}" stroke-width="3"/><path d="M${x - 13},${y} a13,13 0 0 0 26,0 M${x},${y + 13} v8" fill="none" stroke="${P.ink}" stroke-width="3" stroke-linecap="round"/>`],
        ['Compare and treat', 'Steps 7 to 9', (x, y) => [[-16, -16], [2, -16], [-16, 2], [2, 2]].map(([dx, dy]) => `<rect x="${x + dx}" y="${y + dy}" width="14" height="14" rx="2" fill="none" stroke="${P.good}" stroke-width="3"/>`).join('')],
      ];
      cards.forEach(([title, sub, icon], i) => {
        const x = 46 + i * 196, y = 104, o = ease(seg(u, 0.08 + i * 0.18, 0.2 + i * 0.18));
        s += `<g opacity="${op(o)}"><rect x="${x}" y="${y}" width="164" height="160" rx="14" fill="${P.panel}" stroke="${i === 0 ? P.accent : P.panel}" stroke-width="2"/>${icon(x + 82, y + 50)}</g>`;
        s += T(x + 82, y + 106, title, { size: 15, weight: 700, anchor: 'middle', op: o }) + T(x + 82, y + 128, sub, { size: 12, fill: i === 0 ? P.accent : P.dim, anchor: 'middle', op: o });
        if (i < 2) s += `<path d="M${x + 172},${y + 80} h16 m-6,-6 l6,6 l-6,6" fill="none" stroke="${P.dim}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="${op(ease(seg(u, 0.2 + i * 0.18, 0.26 + i * 0.18)))}"/>`;
      });
      s += T(320, 318, 'The target, the measured value and the predicted value always stay separate.', { size: 13, fill: P.dim, anchor: 'middle', op: ease(seg(u, 0.7, 0.8)) });
      return s;
    },

    /* ----- App walkthrough (Home): the ten steps, one chapter each, on a sketch of the app. Example room, not data. ----- */
    tourIntro(u) {
      let s = T(320, 92, 'How the app works', { size: 26, weight: 700, anchor: 'middle', op: ease(seg(u, 0, 0.14)) });
      s += T(320, 122, 'Ten steps, from the room to the report', { size: 14, fill: P.dim, anchor: 'middle', op: ease(seg(u, 0.08, 0.22)) });
      [['Define', 'Steps 1–2'], ['Measure', 'Steps 3–5'], ['Analyse', 'Steps 6–7'], ['Improve', 'Steps 8–9'], ['Summary', 'Step 10']].forEach(([name, steps], i) => {
        const x = 52 + i * 112, o = ease(seg(u, 0.2 + i * 0.1, 0.3 + i * 0.1));
        s += `<g opacity="${op(o)}"><rect x="${x}" y="158" width="96" height="108" rx="12" fill="${P.panel}"/>${PHASE_GLYPH[i](x + 48, 196)}</g>`;
        s += T(x + 48, 240, name, { size: 14, weight: 700, anchor: 'middle', op: o }) + T(x + 48, 257, steps, { size: 11, fill: P.dim, anchor: 'middle', op: o });
        if (i < 4) s += `<path d="M${x + 100},212 h8 m-4,-4 l4,4 l-4,4" fill="none" stroke="${P.dim}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity="${op(o)}"/>`;
      });
      s += T(320, 314, 'The rail on the left always shows where you are.', { size: 14, fill: P.accent, anchor: 'middle', op: ease(seg(u, 0.75, 0.88)) });
      return s;
    },

    tourRoom(u) {
      let s = appFrame(0, 'Describe the room');
      s += field(160, 116, 210, 'Room name', 'Conference Room A', seg(u, 0.04, 0.2));
      s += field(160, 160, 210, 'Room type and use', 'Meeting room', seg(u, 0.22, 0.32));
      [['Length', '10'], ['Width', '6'], ['Height', '3']].forEach(([label, v], i) => { s += field(160 + i * 72, 204, 62, label, `${v} m`, seg(u, 0.36 + i * 0.08, 0.42 + i * 0.08)); });
      const vo = ease(seg(u, 0.64, 0.74));
      s += T(160, 270, 'Volume', { size: 10, fill: P.dim, op: vo }) + T(160, 302, '180 m³', { size: 24, weight: 700, op: vo });
      const { pts } = isoBox(10, 6, 3, 13, 486, 206);
      s += `<g opacity="${op(vo)}">${box3d(pts, 10, 6, 3)}</g>`;
      return s;
    },

    tourTarget(u) {
      let s = appFrame(1, 'Confirm the target');
      s += T(160, 128, 'Recommended for a meeting room of this size', { size: 11, fill: P.dim });
      s += T(160, 166, '0.48 s', { size: 30, weight: 700, op: ease(seg(u, 0.05, 0.18)) }) + T(268, 166, 'acceptable 0.38–0.59 s', { size: 12, fill: P.dim, op: ease(seg(u, 0.1, 0.22)) });
      s += scale(196, null, null, ease(seg(u, 0.2, 0.35)));
      const tap = seg(u, 0.62, 0.74), done = u > 0.7;
      s += button(472, 270, 136, done ? 'Target confirmed' : 'Confirm target', done ? P.good : P.accent, tap);
      return s;
    },

    tourSetup(u) {
      let s = appFrame(2, 'Prepare to measure');
      [['Allow the microphone', 0.14], ['Prepare the room: doors closed, quiet', 0.34], ['Measure the background noise', 0.68]].forEach(([label, at], i) => {
        const y = 140 + i * 42;
        s += tick(172, y - 4, u >= at) + T(190, y + 1, label, { size: 13, fill: u >= at ? P.ink : P.dim });
      });
      const lv = seg(u, 0.44, 0.66);
      if (lv > 0) s += `<rect x="190" y="236" width="150" height="7" rx="3.5" fill="${P.line}"/><rect x="190" y="236" width="${n(150 * lv)}" height="7" rx="3.5" fill="${TEAL}"/>`;
      s += pill(190, 254, 'Suitable for measuring', P.good, ease(seg(u, 0.68, 0.76)));
      s += table(528, 244, 320, 104) + laptop(528, 244);
      s += T(528, 334, 'One device plays and records', { size: 11, fill: P.dim, anchor: 'middle' });
      return s;
    },

    tourMeasure(u, t) {
      let s = appFrame(3, 'Measure at two positions');
      const rx0 = 160, ry0 = 116, rw = 196, rh = 132, p1 = [205, 200], p2 = [315, 150];
      s += `<rect x="${rx0}" y="${ry0}" width="${rw}" height="${rh}" rx="3" fill="${P.bg}" stroke="${P.ink}" stroke-width="2"/>`;
      const mv = ease(seg(u, 0.48, 0.58)), dx = lerp(p1[0], p2[0], mv), dy = lerp(p1[1], p2[1], mv);
      [['P1', p1, 0.44], ['P2', p2, 0.92]].forEach(([id, [x, y], at]) => { s += `<circle cx="${x}" cy="${y}" r="5" fill="none" stroke="${P.dim}" stroke-width="1.6"/>` + T(x, y - 12, id, { size: 11, weight: 650, anchor: 'middle' }) + (u >= at ? tick(x - 22, y + 12, true) : ''); });
      s += `<rect x="${n(dx - 7)}" y="${n(dy - 5)}" width="14" height="10" rx="2" fill="${TEAL}"/>`;
      const first = u < 0.5, prog = first ? seg(u, 0.1, 0.42) : seg(u, 0.6, 0.9);
      s += T(380, 128, first ? 'Take at P1' : 'Take at P2', { size: 12, weight: 650 }) + take(380, 606, 184, 24, prog);
      const tap = first ? seg(u, 0.06, 0.16) : seg(u, 0.56, 0.66);
      s += button(380, 228, 150, 'Start measurement', P.accent, tap);
      s += T(160, 300, 'Each position: a background check, then a 10 s take.', { size: 12, fill: P.dim });
      s += T(160, 322, 'The room’s values are the average of the positions.', { size: 12, fill: TEAL, op: ease(seg(u, 0.9, 0.98)) });
      return s;
    },

    tourProcessing(u) {
      let s = appFrame(4, 'Processing checks each take');
      ['Separate the room’s decay', 'Check it against the background', 'Choose T30 or T20', 'Calculate RT60, band by band'].forEach((label, i) => {
        const y = 138 + i * 36, a = 0.1 + i * 0.18, done = u >= a + 0.12, on = u >= a && !done;
        s += (done ? tick(172, y - 4, true) : on ? `<circle cx="172" cy="${y - 4}" r="9" fill="none" stroke="${P.line}" stroke-width="2.4"/><path d="M172,${y - 13} a9,9 0 0 1 9,9" fill="none" stroke="${TEAL}" stroke-width="2.4" transform="rotate(${n((u * 2400) % 360)} 172 ${y - 4})"/>` : `<circle cx="172" cy="${y - 4}" r="9" fill="none" stroke="${P.line}" stroke-width="2"/>`);
        s += T(190, y + 1, label, { size: 13, fill: done || on ? P.ink : P.dim });
      });
      s += T(160, 318, 'A take that cannot be trusted is rejected with its reason, never guessed.', { size: 12, fill: P.good, op: ease(seg(u, 0.84, 0.92)) });
      return s;
    },

    tourResults(u) {
      let s = appFrame(5, 'Read the results');
      s += T(160, 128, 'Measured RT60 · average over 2 positions', { size: 11, fill: P.dim });
      s += T(160, 170, '0.72 s', { size: 32, weight: 700, fill: TEAL, op: ease(seg(u, 0.06, 0.18)) });
      const vals = [0.95, 0.8, 0.76, 0.7, 0.62, 0.52], labels = ['125', '250', '500', '1k', '2k', '4k'];
      vals.forEach((v, i) => {
        const g = ease(seg(u, 0.2 + i * 0.06, 0.32 + i * 0.06)), h = v * 110 * g, x = 380 + i * 38;
        s += `<rect x="${x}" y="${n(286 - h)}" width="22" height="${n(h)}" rx="3" fill="${TEAL}"/>` + T(x + 11, 302, labels[i], { size: 10, fill: P.dim, anchor: 'middle' });
      });
      s += L(372, 286, 610, 286, P.line, 1.4);
      s += T(160, 212, 'Low sounds 0.95 s', { size: 12, op: ease(seg(u, 0.5, 0.58)) }) + T(160, 234, 'Voices 0.72 s', { size: 12, weight: 650, op: ease(seg(u, 0.56, 0.64)) }) + T(160, 256, 'High sounds 0.57 s', { size: 12, op: ease(seg(u, 0.62, 0.7)) });
      s += T(160, 322, 'Plain words first; the technical detail is one click away.', { size: 12, fill: P.dim, op: ease(seg(u, 0.78, 0.88)) });
      return s;
    },

    tourAssessment(u) {
      let s = appFrame(6, 'Compare with the target');
      s += T(160, 128, 'Target 0.48 s (0.38–0.59)  ·  measured 0.72 s', { size: 12, fill: P.dim });
      s += scale(180, ease(seg(u, 0.12, 0.3)) > 0 ? 0.72 : null, null, 1);
      s += pill(160, 252, 'Does not meet the target', P.bad, ease(seg(u, 0.4, 0.5)));
      s += T(160, 300, 'Every band from 250 Hz to 2 kHz is checked against the range.', { size: 12, fill: P.ink, op: ease(seg(u, 0.55, 0.65)) });
      s += T(160, 322, 'Here it is too long: treatment is needed.', { size: 12, fill: P.accent, op: ease(seg(u, 0.72, 0.82)) });
      return s;
    },

    tourTreatment(u) {
      let s = appFrame(7, 'Choose treatment');
      ['Acoustic wall panel', 'Ceiling panel', 'Fabric wall panel'].forEach((name, i) => {
        const y = 118 + i * 38, sel = i === 0 && u > 0.18;
        s += `<rect x="160" y="${y}" width="206" height="30" rx="6" fill="${sel ? '#2A1E1B' : P.panel}" stroke="${sel ? P.accent : P.panel}" stroke-width="1.6"/>` + T(172, y + 19, name, { size: 12, weight: sel ? 650 : 400 }) + T(356, y + 19, 'tested', { size: 10, fill: P.dim, anchor: 'end' });
      });
      const q = Math.round(10 * ease(seg(u, 0.34, 0.66)));
      s += T(392, 128, 'How many', { size: 11, fill: P.dim }) + `<rect x="392" y="136" width="120" height="32" rx="7" fill="${P.bg}" stroke="${P.line}"/>` + T(408, 157, '−', { size: 15, fill: P.dim }) + T(452, 157, String(q), { size: 15, weight: 700, anchor: 'middle' }) + T(496, 157, '+', { size: 15, fill: P.dim, anchor: 'end' });
      s += T(392, 196, 'Absorption needed', { size: 11, fill: P.dim }) + `<rect x="392" y="204" width="214" height="8" rx="4" fill="${P.line}"/><rect x="392" y="204" width="${n(214 * c01(q / 10))}" height="8" rx="4" fill="${VIO}"/>`;
      s += T(392, 232, `This plan adds ${q * 10}% of it`, { size: 12, op: c01(q) });
      s += T(160, 318, 'Each product keeps its own tested absorption data.', { size: 12, fill: P.dim, op: ease(seg(u, 0.72, 0.82)) });
      return s;
    },

    tourPrediction(u) {
      let s = appFrame(8, 'See the predicted result');
      [['Measured', '0.72 s', TEAL], ['Predicted', '0.50 s', VIO], ['Target', '0.48 s', P.ink]].forEach(([k, v, col], i) => {
        const x = 160 + i * 150, o = ease(seg(u, 0.05 + i * 0.12, 0.15 + i * 0.12));
        s += `<g opacity="${op(o)}"><rect x="${x}" y="114" width="134" height="64" rx="10" fill="${P.panel}" stroke="${i === 1 ? VIO : P.panel}" stroke-width="1.6" ${i === 1 ? 'stroke-dasharray="5 4"' : ''}/></g>` + T(x + 12, 134, k, { size: 11, fill: P.dim, op: o }) + T(x + 12, 164, v, { size: 22, weight: 700, fill: col, op: o });
      });
      s += scale(226, 0.72, ease(seg(u, 0.45, 0.6)) > 0 ? lerp(0.72, 0.5, ease(seg(u, 0.45, 0.6))) : null, 1);
      s += pill(160, 280, 'Within target', P.good, ease(seg(u, 0.64, 0.72)));
      s += T(160, 326, 'Change the amounts and the prediction updates.', { size: 12, fill: P.dim, op: ease(seg(u, 0.76, 0.86)) });
      return s;
    },

    tourFinal(u) {
      let s = appFrame(9, 'Get the report');
      [['Before', '0.72 s', TEAL], ['Predicted', '0.50 s', VIO], ['Target', '0.48 s', P.ink]].forEach(([k, v, col], i) => {
        s += T(160 + i * 120, 128, k, { size: 10, fill: P.dim }) + T(160 + i * 120, 150, v, { size: 16, weight: 700, fill: col });
      });
      s += field(160, 172, 180, 'Your name', 'A. Sales', seg(u, 0.12, 0.24)) + field(352, 172, 210, 'Email', 'name@company.com', seg(u, 0.26, 0.4));
      s += tick(170, 234, u > 0.44) + T(186, 238, 'I agree the details are sent with this report', { size: 11, fill: u > 0.44 ? P.ink : P.dim });
      s += button(160, 256, 108, 'Submit', P.accent, seg(u, 0.5, 0.6));
      const un = u > 0.66;
      s += button(282, 256, 170, un ? 'Download PDF report' : 'PDF locked', un ? P.good : P.line, seg(u, 0.84, 0.94));
      s += T(160, 322, 'A one- or two-page PDF for your client.', { size: 12, fill: P.dim, op: ease(seg(u, 0.7, 0.8)) });
      return s;
    },

    tourOutro(u) {
      let s = T(320, 110, 'That is the whole workflow', { size: 24, weight: 700, anchor: 'middle', op: ease(seg(u, 0, 0.15)) });
      [['Explain this step', 'on every step, with your own numbers'], ['Short videos', 'where a step needs one'], ['Saved on this device', 'reopen any project from Home']].forEach(([a, b], i) => {
        const y = 168 + i * 44, o = ease(seg(u, 0.15 + i * 0.15, 0.27 + i * 0.15));
        s += `<g opacity="${op(o)}">${tick(178, y - 4, true)}</g>` + T(198, y + 1, a, { size: 15, weight: 700, op: o }) + T(390, y + 1, b, { size: 13, fill: P.dim, op: o });
      });
      s += T(320, 318, 'Press New Measurement to start.', { size: 15, fill: P.accent, weight: 650, anchor: 'middle', op: ease(seg(u, 0.65, 0.78)) });
      return s;
    },
  };

  /* helpers for the walkthrough: a sketch of the app (the workflow rail with the step on show) and its controls */
  const TEAL = '#3BC2B6', VIO = '#A48EFF';
  const TOUR = ['Room Setup', 'Target', 'Setup', 'Measure', 'Processing', 'Results', 'Assessment', 'Treatment', 'Prediction', 'Final Result'];
  function appFrame(cur, title) {
    let s = `<rect x="16" y="48" width="608" height="298" rx="10" fill="#0D1112" stroke="${P.line}"/><path d="M26,48 h118 v298 h-118 a10,10 0 0 1 -10,-10 v-278 a10,10 0 0 1 10,-10 z" fill="#080B0C"/>`;
    TOUR.forEach((name, i) => {
      const y = 72 + i * 27, done = i < cur, on = i === cur;
      if (on) s += `<rect x="21" y="${y - 11}" width="118" height="22" rx="5" fill="#1C2427"/>`;
      s += `<circle cx="35" cy="${y}" r="6.5" fill="${done ? TEAL : on ? '#fff' : 'none'}" stroke="${done ? TEAL : on ? P.accent : P.line}" stroke-width="1.6"/>`;
      s += T(48, y + 4, name, { size: 11, weight: on ? 650 : 400, fill: on ? '#fff' : done ? P.ink : P.dim });
      if (on) s += `<path d="M129,${y - 6} l-3,12 M134,${y - 6} l-3,12" stroke="${P.accent}" stroke-width="2.2" stroke-linecap="round"/>`;
    });
    return s + T(160, 74, `Step ${cur + 1} of 10`, { size: 11, weight: 650, fill: P.accent }) + T(160, 98, title, { size: 18, weight: 700 });
  }
  // A form field being typed in (prog 0…1 of the text shown).
  function field(x, y, w, label, val, prog) {
    const on = prog > 0 && prog < 1;
    return T(x, y, label, { size: 10, fill: P.dim }) + `<rect x="${x}" y="${y + 5}" width="${w}" height="26" rx="5" fill="${P.bg}" stroke="${on ? P.accent : P.line}" stroke-width="${on ? 1.6 : 1}"/>`
      + T(x + 8, y + 22, val.slice(0, Math.ceil(val.length * c01(prog))), { size: 12, weight: 600 });
  }
  function button(x, y, w, label, col, tap = 0) {
    return `<rect x="${x}" y="${y}" width="${w}" height="30" rx="7" fill="${col}"/>` + T(x + w / 2, y + 20, label, { size: 12, weight: 650, fill: '#fff', anchor: 'middle' })
      + (tap > 0 && tap < 1 ? `<circle cx="${n(x + w / 2)}" cy="${y + 15}" r="${n(6 + 30 * tap)}" fill="none" stroke="#fff" stroke-width="2" opacity="${op(1 - tap)}"/>` : '');
  }
  function pill(x, y, text, col, o = 1) {
    if (o <= 0) return '';
    return `<rect x="${x}" y="${y}" width="${n(text.length * 7 + 24)}" height="24" rx="12" fill="none" stroke="${col}" stroke-width="1.6" opacity="${op(o)}"/>` + T(x + 12, y + 16, text, { size: 12, weight: 650, fill: col, op: o });
  }
  // The RT60 scale (0 to 1.5 s): the target range and preferred value, a measured and a predicted value.
  function scale(y, m, pr, o = 1) {
    if (o <= 0) return '';
    const X = v => 160 + (v / 1.5) * 446;
    let s = `<g opacity="${op(o)}"><rect x="160" y="${y - 3}" width="446" height="6" rx="3" fill="${P.line}"/><rect x="${n(X(0.38))}" y="${y - 12}" width="${n(X(0.59) - X(0.38))}" height="24" fill="rgba(242,239,236,.08)" stroke="${P.dim}" stroke-dasharray="3 3"/>${L(X(0.48), y - 15, X(0.48), y + 15, P.dim, 2)}`;
    [0, 0.5, 1, 1.5].forEach(v => { s += T(X(v), y + 32, `${v.toFixed(1)} s`, { size: 10, fill: P.dim, anchor: 'middle' }); });
    if (m != null) s += `<circle cx="${n(X(m))}" cy="${y}" r="7" fill="${TEAL}"/>` + T(X(m), y - 20, `${m.toFixed(2)} s`, { size: 11, weight: 650, fill: TEAL, anchor: 'middle' });
    if (pr != null) s += `<circle cx="${n(X(pr))}" cy="${y}" r="7" fill="${VIO}"/>` + T(X(pr), y - 20, `${pr.toFixed(2)} s`, { size: 11, weight: 650, fill: VIO, anchor: 'middle' });
    return `${s}</g>`;
  }
  const PHASE_GLYPH = [
    (x, y) => { const { pts } = isoBox(3, 2, 1.4, 9, x - 4, y - 8); return box3d(pts, 3, 2, 1.4); },
    (x, y) => `<rect x="${x - 7}" y="${y - 18}" width="14" height="24" rx="7" fill="none" stroke="${P.ink}" stroke-width="3"/><path d="M${x - 13},${y} a13,13 0 0 0 26,0 M${x},${y + 13} v7" fill="none" stroke="${P.ink}" stroke-width="3" stroke-linecap="round"/>`,
    (x, y) => [[-14, 12], [-3, 22], [8, 8]].map(([dx, h]) => `<rect x="${x + dx}" y="${y + 12 - h}" width="8" height="${h}" rx="2" fill="${TEAL}"/>`).join(''),
    (x, y) => [[-15, -15], [2, -15], [-15, 2], [2, 2]].map(([dx, dy]) => `<rect x="${x + dx}" y="${y + dy}" width="13" height="13" rx="2" fill="none" stroke="${P.good}" stroke-width="2.6"/>`).join(''),
    (x, y) => `<path d="M${x - 11},${y - 16} h15 l8,8 v24 h-23 z" fill="none" stroke="${P.accent}" stroke-width="2.6" stroke-linejoin="round"/>${L(x - 6, y, x + 6, y, P.accent, 2)}${L(x - 6, y + 6, x + 6, y + 6, P.accent, 2)}`,
  ];
  /* helpers for the room scenes */
  function isoBox(Lm, Wm, Hm, s, ox, oy) {
    const c = 0.866, P = (x, y, z) => [ox + (x - y) * c * s, oy + (x + y) * 0.5 * s - z * s];
    return { P, pts: arr => arr.map(q => P(...q).map(n).join(',')).join(' ') };
  }
  function box3d(pts, Lm, Wm, Hm) {
    return `<polygon points="${pts([[0, 0, Hm], [Lm, 0, Hm], [Lm, Wm, Hm], [0, Wm, Hm]])}" fill="#34302D" stroke="${P.dim}" stroke-width="1.4"/>`
      + `<polygon points="${pts([[0, Wm, 0], [Lm, Wm, 0], [Lm, Wm, Hm], [0, Wm, Hm]])}" fill="${P.panel}" stroke="${P.dim}" stroke-width="1.4"/>`
      + `<polygon points="${pts([[Lm, 0, 0], [Lm, Wm, 0], [Lm, Wm, Hm], [Lm, 0, Hm]])}" fill="#221F1D" stroke="${P.dim}" stroke-width="1.4"/>`;
  }
  // A dimension along any direction, with end dots and a label offset from the middle.
  function isoDim(a, b, label, o, dx = 0, dy = 0, anchor = 'middle') {
    if (o <= 0) return '';
    const mx = (a[0] + b[0]) / 2 + dx, my = (a[1] + b[1]) / 2 + dy;
    return `<g opacity="${op(o)}">${L(a[0], a[1], b[0], b[1], P.accent, 2)}<circle cx="${n(a[0])}" cy="${n(a[1])}" r="3.5" fill="${P.accent}"/><circle cx="${n(b[0])}" cy="${n(b[1])}" r="3.5" fill="${P.accent}"/></g>${T(mx, my + 5, label, { size: 15, weight: 700, fill: P.accent, anchor, op: o })}`;
  }
  // Plan view of a room with a table, walls drawn thick.
  function plan(ox, oy, W, H) {
    return `<rect x="${ox}" y="${oy}" width="${W}" height="${H}" fill="#211E1C" stroke="${P.ink}" stroke-width="5"/>`
      + `<rect x="${ox + W * 0.34}" y="${oy + H * 0.34}" width="${W * 0.32}" height="${H * 0.32}" rx="6" fill="${P.panel}" stroke="${P.line}"/>`;
  }
  // Speech on a timeline: four words, each a burst of sound followed by the room's reverberant tail, which falls with the
  // time constant tau (a fraction of the timeline). With a long tail each word is still sounding when the next starts.
  function speech(u, tau, col) {
    const x0 = 80, x1 = 580, base = 268, h = 120, W = x1 - x0, words = ['Please', 'join', 'the', 'call'], starts = [0.04, 0.29, 0.53, 0.76], len = 0.11;
    const reveal = x0 + W * ease(seg(u, 0.06, 0.72));
    let s = L(x0, base, x1, base, P.line, 2) + T(x1, base + 44, 'time', { size: 11, fill: P.dim, anchor: 'end' });
    starts.forEach((a, i) => {
      const xa = x0 + W * a, xb = xa + W * len;
      if (xa >= reveal) return;
      let d = `M${n(xa)},${base} `, last = xa;
      for (let x = xa; x <= Math.min(reveal, x1); x += 3) {
        const y = x <= xb ? h * Math.min(1, (x - xa) / 8) * (0.78 + 0.22 * Math.abs(Math.sin((x - xa) * 0.16))) : h * Math.exp(-(x - xb) / (W * tau));
        if (x > xb && y < 0.6) break;
        d += `L${n(x)},${n(base - y)} `;
        last = x;
      }
      d += `L${n(last)},${base} Z`;
      s += `<path d="${d}" fill="${col}" fill-opacity=".26" stroke="${col}" stroke-width="2" stroke-linejoin="round"/>`;
      s += T((xa + xb) / 2, base + 24, words[i], { size: 15, weight: 650, anchor: 'middle' });
    });
    return s;
  }
  const reading = (x, y, txt) => `<rect x="${x}" y="${y}" width="64" height="24" rx="5" fill="#0E1A12"/>` + T(x + 32, y + 17, txt, { size: 13, weight: 650, fill: P.good, anchor: 'middle' });

  /* ---------- player ---------- */
  const PAUSE = '<svg class="i" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
  const length = g => g.chapters[g.chapters.length - 1].to;
  const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const memory = {};  // where each guide was left, so reopening resumes
  let st = { el: null };

  function chaptersHTML(g) {
    return `<ol class="gv-chapters" aria-label="Chapters">${g.chapters.map((c, i) => `<li><button type="button" data-gv="seek" data-t="${c.from}"><span class="gv-cn">${i + 1}</span><span class="gv-ct">${esc(c.title)}</span><span class="gv-cs">${mmss(c.from)}</span></button></li>`).join('')}</ol>
      <details class="gv-transcript"><summary>Read the steps instead</summary><ol>${g.chapters.map(c => `<li><b>${esc(c.title)}.</b> ${esc(c.captions.join(' '))}</li>`).join('')}</ol></details>`;
  }

  function html(id) {
    const g = AM.guides[id], D = length(g);
    const screen = g.video.src
      ? `<div class="gv-screen"><video class="gv-video" src="${esc(g.video.src)}" controls playsinline preload="metadata"></video></div>`
      : `<div class="gv-screen">
          <svg class="gv-svg" viewBox="0 0 640 360" role="img" aria-label="${esc(g.title)}, animated video"><rect width="640" height="360" fill="${P.bg}"/><g class="gv-g"></g></svg>
          <button type="button" class="gv-big" data-gv="toggle" aria-label="Play video">${icon('play', 30, 2.2)}</button>
          <div class="gv-end" hidden><button type="button" class="btn btn-secondary btn-sm" data-gv="restart">${icon('refresh', 15, 2)} Watch again</button><button type="button" class="btn btn-primary btn-sm" data-action="closeGuide">${esc(g.closeLabel || 'Close')}</button></div>
        </div>
        <p class="gv-cap" aria-live="polite"></p>
        <div class="gv-bar">
          <button type="button" class="iconbtn gv-play" data-gv="toggle" aria-label="Play">${icon('play', 18, 2)}</button>
          <span class="gv-time">0:00 / ${mmss(D)}</span>
          <div class="gv-track" data-gv="track" role="slider" tabindex="0" aria-label="Video position" aria-valuemin="0" aria-valuemax="${D}" aria-valuenow="0" aria-valuetext="0:00"><i class="gv-fill"></i>${g.chapters.slice(1).map(c => `<i class="gv-mark" style="left:${(c.from / D * 100).toFixed(2)}%"></i>`).join('')}</div>
        </div>`;
    return `<div class="gv" data-guide="${esc(id)}">${screen}${chaptersHTML(g)}</div>`;
  }

  function poster(id) {
    const pp = (AM.guides[id] || {}).poster, scene = pp && SCENES[pp.scene] ? SCENES[pp.scene](pp.u, 0) : '';
    return `<svg class="gv-poster" viewBox="0 0 640 360" aria-hidden="true"><rect width="640" height="360" fill="${P.bg}"/>${scene}</svg>`;
  }

  function frame(force) {
    const { g, el } = st;
    if (!el) return;
    const D = length(g), t = st.t;
    let ci = g.chapters.findIndex(c => t < c.to);
    if (ci < 0) ci = g.chapters.length - 1; // the very end belongs to the last chapter
    const ch = g.chapters[ci], u = c01((t - ch.from) / (ch.to - ch.from));
    const chip = `<rect x="14" y="12" width="${n(34 + ch.title.length * 7.2)}" height="26" rx="13" fill="rgba(0,0,0,.45)"/>` + T(28, 30, `${ci + 1}/${g.chapters.length}  ${esc(ch.title)}`, { size: 12, weight: 650 });
    el.querySelector('.gv-g').innerHTML = SCENES[ch.scene](u, t) + chip;
    const cap = ch.captions[Math.min(ch.captions.length - 1, Math.floor(u * ch.captions.length))];
    if (cap !== st.cap) { el.querySelector('.gv-cap').textContent = cap; st.cap = cap; }
    el.querySelector('.gv-fill').style.width = (t / D * 100).toFixed(2) + '%';
    el.querySelector('.gv-time').textContent = `${mmss(t)} / ${mmss(D)}`;
    const tr = el.querySelector('.gv-track');
    tr.setAttribute('aria-valuenow', t.toFixed(0)); tr.setAttribute('aria-valuetext', mmss(t));
    if (ci !== st.chap || force) {
      st.chap = ci;
      el.querySelectorAll('.gv-chapters button').forEach((b, i) => b.classList.toggle('is-on', i === ci));
    }
    if (force) {
      const ended = t >= D && !st.playing;
      const pb = el.querySelector('.gv-play');
      pb.innerHTML = st.playing ? PAUSE : icon('play', 18, 2);
      pb.setAttribute('aria-label', st.playing ? 'Pause' : ended ? 'Replay' : 'Play');
      el.querySelector('.gv-big').hidden = st.playing || ended;
      el.querySelector('.gv-end').hidden = !ended;
    }
  }

  function loop(now) {
    if (!st.el || !st.playing) return;
    st.raf = requestAnimationFrame(loop);
    const dt = st.last ? Math.min(0.25, (now - st.last) / 1000) : 0;
    st.last = now;
    st.t = Math.min(length(st.g), st.t + dt);
    if (st.t >= length(st.g)) { pause(); return; }
    if (now - st.drawn > 33) { st.drawn = now; frame(); }
  }
  function play() {
    if (st.t >= length(st.g)) st.t = 0;
    st.playing = true; st.last = 0;
    cancelAnimationFrame(st.raf); st.raf = requestAnimationFrame(loop);
    frame(true);
  }
  function pause() { st.playing = false; cancelAnimationFrame(st.raf); st.raf = 0; frame(true); }
  function seek(t) {
    st.t = c01(t / length(st.g)) * length(st.g); st.last = 0;
    if (st.t >= length(st.g) && st.playing) { pause(); return; } // jumping to the end finishes the video
    frame(true);
  }

  function onClick(e) {
    const b = e.target.closest('[data-gv]');
    if (!b || !st.el) return;
    const kind = b.dataset.gv;
    if (st.video) { if (kind === 'seek') { st.video.currentTime = Number(b.dataset.t); st.video.play().catch(() => {}); } return; }
    if (kind === 'toggle') (st.playing ? pause : play)();
    else if (kind === 'restart') { st.t = 0; play(); }
    else if (kind === 'seek') { seek(Number(b.dataset.t)); play(); }
  }
  function trackAt(e) { const r = st.el.querySelector('.gv-track').getBoundingClientRect(); seek((e.clientX - r.left) / r.width * length(st.g)); }

  function mount(root, id) {
    unmount();
    const el = root.querySelector('.gv'), g = AM.guides[id];
    if (!el || !g) return;
    st = { id, g, el, t: memory[id] && memory[id] < length(g) ? memory[id] : 0, playing: false, raf: 0, last: 0, drawn: 0, cap: null, chap: -1, video: null };
    el.addEventListener('click', onClick);
    if (g.video.src) { st.video = el.querySelector('video'); return; }
    const tr = el.querySelector('.gv-track');
    tr.addEventListener('pointerdown', e => { tr.setPointerCapture(e.pointerId); trackAt(e); });
    tr.addEventListener('pointermove', e => { if (tr.hasPointerCapture(e.pointerId)) trackAt(e); });
    tr.addEventListener('keydown', e => {
      const step = { ArrowRight: 5, ArrowLeft: -5, Home: -Infinity, End: Infinity }[e.key];
      if (step === undefined) return;
      e.preventDefault();
      seek(Math.max(0, Math.min(length(g), st.t + step)));
    });
    frame(true);
    const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!still) play();
  }
  function unmount() {
    if (!st.el) return;
    cancelAnimationFrame(st.raf);
    if (st.video) st.video.pause();
    memory[st.id] = st.t;
    st = { el: null };
  }
  const sync = (root, sheet) => (sheet && sheet.kind === 'guide' ? mount(root, sheet.id) : unmount());

  AM.guide = { html, poster, sync, SCENES };
})(window.AM);
