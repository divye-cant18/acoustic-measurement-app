/* Step 1 · Room Setup — what the room is, its size and what it is made of.
   Six surfaces (four walls, floor, ceiling), each with its own finish, an optional partial covering and, on walls,
   doors, windows and openings (AM.services.surfaces). The surfaces describe the room and tell the treatment prediction
   what each product covers. The room's RT60 is not estimated from them: it is measured (Measure), and the only RT60
   predicted is the one after treatment, from the measured room.
   The screen is drawn by the interface (src/screens/Room.tsx); this file keeps the step's limits, checks and actions. */
(function (AM) {
  'use strict';
  const { fmt, isNum } = AM.util;
  const W = AM.workflow, S = AM.store, D = AM.demo, TS = AM.services.target;
  const RM = () => AM.services.surfaces;

  // Keep the room use if the room type offers it, otherwise take the type's most common use.
  const fitUse = (type, use) => { const uses = TS.usesFor(type); return uses.includes(use) ? use : uses[0] || ''; };

  const LIMITS = { L: [1, 100], W: [1, 100], H: [1.8, 30] };
  const DIMS = [['L', 'Length', 'length'], ['W', 'Width', 'width'], ['H', 'Height', 'height']];

  function dimError(k, v) {
    if (!isNum(v)) return null;
    const [a, b] = LIMITS[k];
    return v < a || v > b ? `Enter ${a}–${b} m` : null;
  }

  // Occupancy is optional. When given it must be 0 or more and no denser than 2 people per m² of floor.
  const MAX_DENSITY = 2;
  function occError(r) {
    const n = r.occupancy;
    if (!isNum(n)) return null;
    if (n < 0) return 'Enter 0 or more people';
    const g = AM.acoustics.geometry(r), ok = g && !DIMS.some(([k]) => dimError(k, r[k]));
    const cap = ok ? Math.floor(g.floor * MAX_DENSITY) : 10000;
    if (n > cap) return ok ? `That is more than ${MAX_DENSITY} people per m² of floor. At most ${cap} for ${fmt.m2(g.floor, 0)}.` : 'Enter at most 10000 people';
    return null;
  }

  // A copy of one surface, changed by fn, written back as that surface alone.
  function editSurface(ctx, key, fn) {
    if (!RM().surfaceDef(key)) return;
    const cur = (ctx.project.room.surfaces || {})[key] || RM().blankSurface(), s = JSON.parse(JSON.stringify(cur));
    fn(s);
    S.set(`room.surfaces.${key}`, s);
  }

  function canContinue(p) {
    const r = p.room;
    if (!r.name || !r.name.trim()) return { ok: false, reason: 'Enter a room name.' };
    if (!r.industry) return { ok: false, reason: 'Choose an industry type.' };
    if (!r.type || !D.roomTypesFor(r.industry).includes(r.type)) return { ok: false, reason: `Choose a room type for ${r.industry}.` };
    if (!TS.usesFor(r.type).includes(r.use)) return { ok: false, reason: 'Choose how the room is used.' };
    for (const [k, , word] of DIMS) {
      if (!isNum(r[k])) return { ok: false, reason: `Enter the room ${word}.` };
      const e = dimError(k, r[k]);
      if (e) return { ok: false, reason: `Room ${word}: ${e.toLowerCase()}.` };
    }
    const occ = occError(r);
    if (occ) return { ok: false, reason: `Typical occupancy: ${occ.charAt(0).toLowerCase()}${occ.slice(1).replace(/\.$/, '')}.` };
    return { ok: true };
  }

  W.define('room', {
    canContinue,
    model: { DIMS, dimError, occError }, // read by the screen
    continueLabel: 'Continue to Target',
    actions: {
      // Industry, room type and use change together, so an incompatible type or use never stays selected.
      setIndustry: (ctx, industry) => {
        const r = ctx.project.room, types = D.roomTypesFor(industry);
        const type = types.includes(r.type) ? r.type : types.length === 1 ? types[0] : '';
        S.set('room', Object.assign({}, r, { industry, type, use: fitUse(type, r.use) }));
      },
      // After the room-measuring video, continue at the first size still to enter.
      closeGuide: ctx => {
        S.ui({ sheet: null });
        const k = DIMS.map(([key]) => key).find(key => !isNum(ctx.project.room[key])) || 'L';
        const el = document.getElementById(`room-${k}`);
        if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.focus({ preventScroll: true }); }
      },
      setType: (ctx, type) => {
        const r = ctx.project.room;
        S.set('room', Object.assign({}, r, { type, use: fitUse(type, r.use) }));
      },
      // Surfaces: each change writes that one surface only (room.surfaces.<key>), so no other surface can change with it.
      surfaceMaterial: (ctx, value, el) => editSurface(ctx, el.dataset.key, s => {
        const part = el.dataset.part;
        if (part === 'finish') { s.material = value; s.origin = 'user'; }
        else if (part === 'cover') s.cover = { material: value, pct: isNum(s.cover && s.cover.pct) ? s.cover.pct : null };
        else { const o = (s.openings || []).find(x => x.id === part); if (o) o.material = value; }
      }),
      addCover: (ctx, key) => editSurface(ctx, key, s => { s.cover = { material: '', pct: 50 }; }),
      removeCover: (ctx, key) => editSurface(ctx, key, s => { s.cover = { material: '', pct: null }; }),
      addOpening: (ctx, v) => {
        const [key, kind] = String(v).split('|');
        // A door or window is left to choose (they differ a lot); an open doorway absorbs everything by definition, so its
        // one material is set.
        const only = RM().materialsFor('opening', kind).flatMap(g => g.items), def = only.length === 1 && only[0].quality === 'definition' ? only[0].id : '';
        editSurface(ctx, key, s => {
          const ops = s.openings || (s.openings = []), n = 1 + Math.max(0, ...ops.map(o => parseInt(String(o.id).slice(1), 10) || 0));
          ops.push({ id: `o${n}`, kind, material: def, widthM: null, heightM: null, count: 1 });
        });
      },
      removeOpening: (ctx, v) => {
        const [key, id] = String(v).split('|');
        editSurface(ctx, key, s => { s.openings = (s.openings || []).filter(o => o.id !== id); });
      },
    },
    demoFill(p) { if (!canContinue(p).ok) p.room = D.demoRoom(); },
  });
})(window.AM);
