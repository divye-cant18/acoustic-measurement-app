/* Placement — where the products of a treatment plan go on the room's walls and ceiling, as whole pieces at their real
   size, for the drawing of the room on the Treatment step (src/ui/room3d.ts). It never changes an amount: the plan's
   amounts come from the acoustic calculation (AM.derive); this only says where those pieces would go and how many of
   them fit there as whole pieces.

   Contract:
     layout(room, items, opts) -> { items: { [id]: { wanted, placed, fits, over, on: { [key]: n } } }, pieces: [...] }
       room   { L, W, H, walls: [{ key, len, blocks: [[u0, u1]] }] }   blocks: doors, windows and glass along the wall
       items  in plan order: { id, keys: [surface keys], hung, w, h, n }
                keys  'wall1' … or 'ceiling'; hung: a cloud, hung below the ceiling (else flat on the surface)
                w × h the piece in m (on a wall its width and height; on the ceiling its footprint); n whole pieces wanted
       opts   { ghostsFor: an item id }: the free spots where more of that item would go are returned too (ghost)
       fits   how many of the item fit there with the other products as they are; over: wanted − placed
     pieces   on a wall: { item, key, ghost, u0, u1, z0, z1 } (u along the wall from its left end, z up from the floor)
              on the ceiling: { item, key: 'ceiling', ghost, hung, x, z, w, h } (x along L, z along W, from the centre)
   Rules (simple: the spacing is not a finished design):
     walls    whole pieces in rows inside a band 0.26 m from the floor and the ceiling (one taller piece sits in the
              middle), 0.15 m clear of the corners, 0.01 m between pieces, 0.3 m between products; a door, a window or
              glass blocks its width over the full height. The products on a wall go side by side in plan order, the
              group centred in the free stretch; a product that fits keeps its place, one asking for more than is left
              gets what remains.
     several  (Walls; Walls and ceiling) the pieces are shared out in proportion to what fits on each surface.
     ceiling  a grid over the room, 0.5 m clear of the walls, spaced by the largest piece (+ 0.6 m when any is hung),
              filled from the centre in plan order. */
(function (AM) {
  'use strict';
  const BAND = 0.26, CORNER = 0.15, GAP = 0.01, APART = 0.3, EDGE = 0.5;

  // The rows of a piece of height h on a wall of height H: [z0, z1] from the floor.
  function rowsOf(h, H) {
    const b0 = BAND, b1 = H - BAND, bh = b1 - b0;
    if (!(h > 0) || h > H - 0.1) return [];
    if (h >= bh) { const z0 = Math.max(0.05, (H - h) / 2); return [[z0, z0 + h]]; }
    const n = Math.floor((bh + GAP) / (h + GAP)), used = n * h + (n - 1) * GAP, z0 = (b0 + b1) / 2 - used / 2;
    return Array.from({ length: n }, (_, i) => [z0 + i * (h + GAP), z0 + i * (h + GAP) + h]);
  }
  // The free stretches of a wall: its length less the corners and its blocks.
  function freeOf(len, blocks) {
    let free = [[CORNER, len - CORNER]];
    (blocks || []).forEach(([a, b]) => {
      free = free.flatMap(([x, y]) => (b <= x || a >= y ? [[x, y]] : [[x, Math.max(x, a)], [Math.min(y, b), y]].filter(([p, q]) => q - p > 0.05)));
    });
    return free.filter(([x, y]) => y - x > 0.05);
  }
  const colsIn = (room, w) => Math.max(0, Math.floor((room + GAP) / (w + GAP)));
  const blockW = (w, c) => (c > 0 ? c * w + (c - 1) * GAP : 0);

  // One wall: its products side by side. xs: [{ id, w, h, n }] in plan order.
  function wall(len, H, blocks, xs, ghostsFor) {
    const slots = freeOf(len, blocks).map(iv => ({ iv, len: iv[1] - iv[0], used: [], w: 0 }));
    const out = xs.map(x => Object.assign({}, x, { rows: rowsOf(x.h, H), cols: 0, ghost: 0, slot: null }));
    const roomy = () => slots.slice().sort((a, b) => (b.len - b.w) - (a.len - a.w))[0] || null;
    const lead = s => (s.used.length ? APART : 0);
    const put = (x, s, c) => { x.slot = s; x.cols = c; if (c > 0) { s.w += lead(s) + blockW(x.w, c); s.used.push(x); } };
    const later = [];
    out.forEach(x => {
      const need = x.rows.length ? Math.ceil(x.n / x.rows.length) : 0;
      if (need <= 0) { x.slot = roomy(); return; }
      const s = slots.find(q => q.w + lead(q) + blockW(x.w, need) <= q.len + 1e-9);
      if (s) put(x, s, need); else later.push(x);
    });
    later.forEach(x => { const s = roomy(); if (s) put(x, s, colsIn(s.len - s.w - lead(s), x.w)); });
    out.forEach(x => {
      const s = x.slot, room = s ? s.len - s.w - (x.cols ? 0 : lead(s)) : 0;
      x.extra = x.rows.length ? colsIn(room, x.w) : 0;
      x.fits = (x.cols + x.extra) * x.rows.length;
      x.placed = Math.min(x.n, x.cols * x.rows.length);
    });
    const g = out.find(x => x.id === ghostsFor);
    if (g && g.slot && g.extra > 0) { const s = g.slot; if (!g.cols) { s.w += lead(s) - GAP; s.used.push(g); } s.w += g.extra * (g.w + GAP); g.ghost = g.extra; }
    const pieces = [];
    slots.forEach(s => {
      s.used.sort((a, b) => out.indexOf(a) - out.indexOf(b));
      let u = s.iv[0] + (s.len - s.w) / 2;
      s.used.forEach((x, j) => {
        if (j) u += APART;
        const total = x.cols + x.ghost;
        for (let c = 0; c < total; c++) {
          x.rows.forEach((r, ri) => {
            const real = c < x.cols && c * x.rows.length + ri < x.placed;
            if (real || x.id === ghostsFor) pieces.push({ item: x.id, ghost: !real, u0: u, u1: u + x.w, z0: r[0], z1: r[1] });
          });
          u += x.w + (c < total - 1 ? GAP : 0);
        }
      });
    });
    return { out, pieces };
  }

  // The ceiling: one grid over the room, filled from the centre. xs: [{ id, w, h, n, hung }] in plan order.
  function ceiling(L, W, xs, ghostsFor) {
    const big = Math.max(0.3, ...xs.map(x => Math.max(x.w, x.h))), sp = big + (xs.some(x => x.hung) ? 0.6 : GAP);
    const nx = Math.floor((L - 2 * EDGE + sp - big) / sp), nz = Math.floor((W - 2 * EDGE + sp - big) / sp), cells = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) cells.push({ x: (i - (nx - 1) / 2) * sp, z: (j - (nz - 1) / 2) * sp });
    cells.sort((a, b) => Math.hypot(a.x, a.z * (L / W)) - Math.hypot(b.x, b.z * (L / W)) || a.x - b.x || a.z - b.z);
    let at = 0;
    const out = [], pieces = [];
    xs.forEach(x => {
      const n = Math.max(0, Math.min(x.n, cells.length - at));
      out.push(Object.assign({}, x, { placed: n }));
      for (let q = 0; q < n; q++) pieces.push(Object.assign({ item: x.id, ghost: false, hung: !!x.hung, w: x.w, h: x.h }, cells[at + q]));
      at += n;
    });
    out.forEach(x => { x.fits = x.placed + (cells.length - at); });
    const g = xs.find(x => x.id === ghostsFor);
    if (g) for (let q = at; q < cells.length; q++) pieces.push(Object.assign({ item: g.id, ghost: true, hung: !!g.hung, w: g.w, h: g.h }, cells[q]));
    return { out, pieces };
  }

  const isWall = k => /^wall\d+$/.test(k);
  // How many of an item each surface takes: in proportion to what fits there alone, after the items before it.
  function share(n, caps) {
    const total = caps.reduce((s, c) => s + c, 0);
    if (!total) return caps.map(() => 0);
    const want = Math.min(n, total), raw = caps.map(c => (want * c) / total), got = raw.map(Math.floor);
    let left = want - got.reduce((s, c) => s + c, 0);
    raw.map((r, i) => [r - got[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0 && got[i] < caps[i]) { got[i]++; left--; } });
    return got;
  }

  function layout(room, items, opts) {
    const ghostsFor = opts && opts.ghostsFor, on = {}, wallOf = k => (room.walls || []).find(w => w.key === k);
    const list = (items || []).filter(it => it && it.w > 0 && it.h > 0 && it.n >= 0);
    // Each item's pieces shared over its surfaces, in plan order (an item's share is worked out against those before it).
    list.forEach(it => {
      const keys = [...new Set((it.keys || []).map(k => (isWall(k) ? k : 'ceiling')))].filter(k => k === 'ceiling' || wallOf(k));
      const capOn = k => { const before = (on[k] || []).map(x => Object.assign({}, x)); const probe = Object.assign({}, it, { n: 1e6 }); const r = k === 'ceiling' ? ceiling(room.L, room.W, before.concat([probe]), null) : wall(wallOf(k).len, room.H, wallOf(k).blocks, before.concat([probe]), null); return r.out[r.out.length - 1].placed; };
      const caps = keys.map(capOn), n = keys.length > 1 ? share(it.n, caps) : [it.n];
      if (keys.length > 1 && it.n > caps.reduce((s, c) => s + c, 0)) n[n.length - 1] += it.n - n.reduce((s, c) => s + c, 0);
      keys.forEach((k, i) => { (on[k] = on[k] || []).push({ id: it.id, w: it.w, h: it.h, n: n[i] || 0, hung: !!it.hung }); });
    });
    const res = {}, pieces = [];
    list.forEach(it => { res[it.id] = { wanted: it.n, placed: 0, fits: 0, over: 0, on: {} }; });
    Object.keys(on).forEach(k => {
      const r = k === 'ceiling' ? ceiling(room.L, room.W, on[k], ghostsFor) : wall(wallOf(k).len, room.H, wallOf(k).blocks, on[k], ghostsFor);
      r.out.forEach(x => { const s = res[x.id]; s.placed += x.placed; s.fits += x.fits; s.on[k] = x.placed; });
      r.pieces.forEach(p => pieces.push(Object.assign({ key: k }, p)));
    });
    Object.values(res).forEach(s => { s.over = Math.max(0, s.wanted - s.placed); });
    return { items: res, pieces };
  }

  AM.services.placement = { layout, rowsOf, freeOf, BAND, CORNER, GAP, APART };
})(window.AM);
