/* Guide player: plays an instructional video from AM.guides inside a sheet.

   The animated video is drawn from scenes (SVG) on a timeline, with captions, chapters and a transcript.
   A guide with `video.src` plays that file instead, with the same chapters as jump points.

     html(id)          static markup for the sheet (it never changes while playing, so app renders leave it alone)
     sync(root, sheet) mount the player when the guide sheet is shown, stop it when the sheet closes
     poster(id)        still frame for thumbnails

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
  };

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
