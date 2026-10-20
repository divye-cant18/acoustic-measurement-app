/* Step 1 · Room Setup — what the room is, its size, what it is made of and what is on its walls.
   The room: name and reference, industry and room type (filtered by the industry, "Other" named by the user), its main
   activity (which the target follows) and purpose, the industry's own questions, size and shape, occupancy and
   furnishing, current problems and the outcome wanted. Its surfaces (AM.services.surfaces): the walls (four by default;
   more can be added, duplicated and removed), the floor and the ceiling (with further sections if it has them), each
   with what it is built from, its visible finish, its acoustic data from the sourced library, an existing covering
   and, on walls, doors, windows, openings and the equipment mounted on them. The surfaces describe the room and tell
   the treatment prediction what each product covers and how much wall is free for it. The room's RT60 is not
   estimated from them: it is measured (Measure), and the only RT60 predicted is the one after treatment.
   When a choice changes, what no longer fits it is cleared (a room type the industry does not have, a finish the
   construction cannot carry, acoustic data that describes something else, an answer to a question that no longer
   applies); everything else is kept.
   The screen is drawn by the interface (src/screens/Room.tsx); this file keeps the step's limits, checks and actions. */
(function (AM) {
  'use strict';
  const { fmt, isNum } = AM.util;
  const W = AM.workflow, S = AM.store, D = AM.demo, TS = AM.services.target, RF = AM.roomFormData;
  const RM = () => AM.services.surfaces;

  // Keep the room use if it is one of the room type's activities, otherwise take the type's most common activity (one with
  // a verified criterion first; none for "Other").
  const fitUse = (type, use) => { const uses = TS.usesFor(type), known = TS.knownUses(type); return known.includes(use) ? use : uses[0] || known[0] || ''; };

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

  // The industry's own questions for this room (js/data/room-form.js), and the answers that still apply.
  const questionsFor = r => RF.QUESTIONS.filter(q => q.industries.includes(r.industry) && (!q.types || q.types.includes(r.type)));
  const keepAnswers = r => { const ids = questionsFor(r).map(q => q.id), c = r.context || {}; return Object.fromEntries(Object.entries(c).filter(([k]) => ids.includes(k))); };

  // A copy of one surface, changed by fn, written back as that surface alone.
  function editSurface(ctx, key, fn) {
    if (!RM().surfaceDef(key, ctx.project.room)) return;
    const cur = (ctx.project.room.surfaces || {})[key] || RM().blankSurface(), s = JSON.parse(JSON.stringify(cur));
    fn(s);
    S.set(`room.surfaces.${key}`, s);
  }
  const kindOf = (ctx, key) => (RM().surfaceDef(key, ctx.project.room) || {}).kind;
  // The everyday type stays only while its construction and finish are the surface's.
  const dropType = (s, kind) => { const t = s.type && RM().typeOf(kind, s.type); if (t && ((t.construction || '') !== (s.construction || '') || t.finish !== s.finish)) delete s.type; };
  // Open a surface's card (the cards are folded; the shell keeps which are open).
  const openCard = key => { S.state.ui.open = Object.assign({}, S.state.ui.open, { [`surf-${key}`]: true }); };
  // Lists of choices kept on the room (checkboxes): which may be toggled.
  const LISTS = ['furnishings', 'problems', 'outcomes'];
  /* A wall or ceiling section added or removed: the surfaces and the list of keys are written as two values (each only
     reaches the steps that use the surfaces, AM.workflow NARROW). A new surface is written before its key, a removed key
     goes before its surface, so the screen never lists a surface that has no data. */
  function setSurfaceList(listKey, keys, surfaces, adding) {
    if (adding) { S.set('room.surfaces', surfaces); S.set(`room.${listKey}`, keys); }
    else { S.set(`room.${listKey}`, keys); S.set('room.surfaces', surfaces); }
  }

  // Values that make no physical sense: the step cannot be finished with them (missing optional ones are fine).
  function surfaceErrors(r) {
    const out = [];
    RM().surfacesOf(r).forEach(def => {
      const s = (r.surfaces || {})[def.key] || {};
      ['lengthM', 'heightM'].forEach(k => { const e = def.kind === 'wall' && RM().wallDimError(k, s[k]); if (e) out.push(`${def.name} ${k === 'lengthM' ? 'length' : 'height'}: ${e.toLowerCase()}.`); });
      if (def.kind === 'ceiling' && def.key !== 'ceiling' && isNum(s.areaM2) && s.areaM2 <= 0) out.push(`${def.name}: enter an area of more than 0 m².`);
      if (def.kind === 'wall' && (s.openings || []).some(o => isNum(o.count) && o.count < 1)) out.push(`${def.name}: the number of doors, windows or openings must be 1 or more.`);
    });
    return out;
  }

  function canContinue(p) {
    const r = p.room;
    if (!r.name || !r.name.trim()) return { ok: false, reason: 'Enter a room name.' };
    if (!r.industry) return { ok: false, reason: 'Choose an industry type.' };
    if (r.industry === D.OTHER_INDUSTRY && !(r.industryOther || '').trim()) return { ok: false, reason: 'Name the industry.' };
    if (!r.type || !D.roomTypesFor(r.industry).includes(r.type)) return { ok: false, reason: `Choose a room type for ${r.industry}.` };
    if (r.type === D.OTHER_TYPE && !(r.typeOther || '').trim()) return { ok: false, reason: 'Name the room type.' };
    // The main activity is asked for room types with a verified criterion (it decides which one applies). A room saved
    // with a type that has none keeps its activity as saved, and "Other" has none to choose.
    if (TS.usesFor(r.type).length && !TS.knownUses(r.type).includes(r.use)) return { ok: false, reason: 'Choose how the room is used.' };
    for (const [k, , word] of DIMS) {
      if (!isNum(r[k])) return { ok: false, reason: `Enter the room ${word}.` };
      const e = dimError(k, r[k]);
      if (e) return { ok: false, reason: `Room ${word}: ${e.toLowerCase()}.` };
    }
    const occ = occError(r);
    if (occ) return { ok: false, reason: `Typical occupancy: ${occ.charAt(0).toLowerCase()}${occ.slice(1).replace(/\.$/, '')}.` };
    const bad = surfaceErrors(r);
    if (bad.length) return { ok: false, reason: bad[0] };
    return { ok: true };
  }

  W.define('room', {
    canContinue,
    model: { DIMS, dimError, occError, questionsFor, surfaceErrors }, // read by the screen
    continueLabel: 'Continue to Target',
    actions: {
      // Industry, room type and use change together, so an incompatible type or use never stays selected; answers to
      // questions the new industry does not ask are cleared, the rest of the room is kept.
      setIndustry: (ctx, industry) => {
        const r = ctx.project.room, types = D.roomTypesFor(industry);
        const type = types.includes(r.type) ? r.type : types.length === 1 ? types[0] : '';
        const next = Object.assign({}, r, { industry, type, use: fitUse(type, r.use), industryOther: industry === D.OTHER_INDUSTRY ? r.industryOther || '' : '', typeOther: type === D.OTHER_TYPE ? r.typeOther || '' : '' });
        next.context = keepAnswers(next);
        S.set('room', next);
      },
      // After the room-measuring video, continue at the first size still to enter. Another video (the walkthrough from the
      // Help menu) just closes.
      closeGuide: ctx => {
        const own = (S.state.ui.sheet || {}).id === 'dimensions';
        S.ui({ sheet: null });
        if (!own) return;
        const k = DIMS.map(([key]) => key).find(key => !isNum(ctx.project.room[key])) || 'L';
        const el = document.getElementById(`room-${k}`);
        if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.focus({ preventScroll: true }); }
      },
      setType: (ctx, type) => {
        const r = ctx.project.room, next = Object.assign({}, r, { type, use: fitUse(type, r.use), typeOther: type === D.OTHER_TYPE ? r.typeOther || '' : '' });
        next.context = keepAnswers(next);
        S.set('room', next);
      },
      // A checkbox in one of the room's lists (furnishings, problems, outcomes) or a multiple-choice question.
      toggleItem: (ctx, value) => {
        const [path, item] = String(value).split('|'), r = ctx.project.room;
        const isQ = path.startsWith('context.') && questionsFor(r).some(q => q.kind === 'multi' && `context.${q.id}` === path);
        if (!LISTS.includes(path) && !isQ) return;
        const cur = AM.util.getPath ? AM.util.getPath(r, path) : path.split('.').reduce((o, k) => (o || {})[k], r);
        const list = Array.isArray(cur) ? cur.slice() : [];
        S.set(`room.${path}`, list.includes(item) ? list.filter(x => x !== item) : [...list, item]);
      },

      /* ---------- walls and ceiling sections ---------- */
      addWall: ctx => {
        const r = ctx.project.room, key = RM().nextKey(r, 'wall');
        openCard(key);
        setSurfaceList('wallKeys', [...RM().wallKeysOf(r), key], Object.assign({}, r.surfaces, { [key]: RM().blankSurface() }), true);
        const el = document.getElementById(`surf-${key}-len`);
        if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.focus({ preventScroll: true }); }
      },
      // A copy of a wall with everything recorded on it (construction, finish, data, openings, equipment), next to it.
      duplicateWall: (ctx, key) => {
        const r = ctx.project.room, keys = RM().wallKeysOf(r);
        if (!keys.includes(key)) return;
        const nk = RM().nextKey(r, 'wall'), copy = JSON.parse(JSON.stringify((r.surfaces || {})[key] || RM().blankSurface()));
        copy.origin = 'user';
        if (copy.label) copy.label = `${copy.label} (copy)`;
        const at = keys.indexOf(key) + 1;
        openCard(nk);
        setSurfaceList('wallKeys', [...keys.slice(0, at), nk, ...keys.slice(at)], Object.assign({}, r.surfaces, { [nk]: copy }), true);
        S.toast(`${RM().surfaceDef(nk, S.state.project.room).name} added: a copy of ${RM().surfaceDef(key, r).name}.`);
      },
      addCeilingSection: ctx => {
        const r = ctx.project.room, key = RM().nextKey(r, 'ceiling');
        openCard(key);
        setSurfaceList('ceilingKeys', [...RM().ceilingKeysOf(r), key], Object.assign({}, r.surfaces, { [key]: Object.assign(RM().blankSurface(), { areaM2: null }) }), true);
        const el = document.getElementById(`surf-${key}-area`);
        if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.focus({ preventScroll: true }); }
      },
      // Removing a wall or a ceiling section asks first: what was recorded on it goes with it.
      askRemoveSurface: (ctx, key) => S.ui({ confirm: `surface:${key}` }),
      cancelRemoveSurface: () => S.ui({ confirm: null }),
      removeSurface: (ctx, key) => {
        const r = ctx.project.room, walls = RM().wallKeysOf(r), ceil = RM().ceilingKeysOf(r), def = RM().surfaceDef(key, r);
        S.ui({ confirm: null });
        if (!def || key === 'ceiling' || key === 'floor') return;
        if (def.kind === 'wall' && walls.length <= 1) { S.toast('A room needs at least one wall.'); return; }
        const surfaces = Object.assign({}, r.surfaces);
        delete surfaces[key];
        if (def.kind === 'wall') setSurfaceList('wallKeys', walls.filter(k => k !== key), surfaces, false);
        else setSurfaceList('ceilingKeys', ceil.filter(k => k !== key), surfaces, false);
        S.toast(`${def.name} removed.`);
      },

      /* ---------- what a surface is made of ---------- */
      // What the surface is, in everyday words (value "<key>|<type>"): its construction and finish follow from the type,
      // and its sound data is the type's typical library entry (none where the library has no data for it). Choosing the
      // type it already has changes nothing, so an exact entry chosen for it is kept.
      setSurfaceType: (ctx, v) => {
        const [key, id] = String(v).split('|'), kind = kindOf(ctx, key), t = kind && RM().typeOf(kind, id);
        if (!t) return;
        editSurface(ctx, key, s => {
          if (s.type === t.id) return;
          s.type = t.id; s.construction = t.construction || ''; s.finish = t.finish; s.material = t.material || ''; s.origin = 'user';
          delete s.constructionOther;
          if (t.id === 'other') s.finishOther = s.finishOther || { name: '', notes: '' }; else delete s.finishOther;
        });
      },
      // The construction (detailed entry): a finish it cannot carry, and acoustic data for something else, are cleared; the
      // everyday type is dropped when it no longer describes the surface.
      setConstruction: (ctx, value, el) => {
        const key = el.dataset.key, kind = kindOf(ctx, key);
        editSurface(ctx, key, s => {
          s.construction = value;
          if (value === 'other') s.constructionOther = s.constructionOther || { name: '', notes: '' }; else delete s.constructionOther;
          if (!RM().finishFits(kind, value, s.finish)) { s.finish = ''; delete s.finishOther; }
          if (s.material && !RM().materialFits(s.material, kind, value, s.finish)) { s.material = ''; s.origin = 'user'; }
          dropType(s, kind);
        });
      },
      // The visible finish (detailed entry): acoustic data for another finish is cleared.
      setFinish: (ctx, value, el) => {
        const key = el.dataset.key, kind = kindOf(ctx, key);
        editSurface(ctx, key, s => {
          s.finish = value;
          if (value === 'other') s.finishOther = s.finishOther || { name: '', notes: '' }; else delete s.finishOther;
          if (s.material && !RM().materialFits(s.material, kind, s.construction, value)) { s.material = ''; s.origin = 'user'; }
          dropType(s, kind);
        });
      },
      // Surfaces: each change writes that one surface only (room.surfaces.<key>), so no other surface can change with it.
      // The exact library entry (the optional "Exact type and sound data"): the everyday type is kept when the entry is one
      // of its kind; a cover or an opening keeps its type only while the entry is that type's own.
      surfaceMaterial: (ctx, value, el) => editSurface(ctx, el.dataset.key, s => {
        const part = el.dataset.part, kind = kindOf(ctx, el.dataset.key);
        if (part === 'finish') { s.material = value; s.origin = 'user'; if (s.type && !RM().materialFits(value, kind, s.construction, s.finish)) delete s.type; }
        else if (part === 'cover') {
          const t = s.cover && s.cover.type && RM().typeOf(kind, s.cover.type);
          s.cover = Object.assign({ material: value, pct: isNum(s.cover && s.cover.pct) ? s.cover.pct : null }, t && RM().materialFits(value, kind, t.construction, t.finish) ? { type: t.id } : {});
        }
        else { const o = (s.openings || []).find(x => x.id === part); if (o) { o.material = value; const t = RM().openingTypesFor(o.kind).find(x => x.id === o.type); if (!t || t.material !== value) delete o.type; } }
      }),
      addCover: (ctx, key) => editSurface(ctx, key, s => { s.cover = { material: '', pct: 50 }; }),
      // What covers part of the surface, in everyday words (value "<key>|<type>"): its typical sound data, the share kept.
      setCoverType: (ctx, v) => {
        const [key, id] = String(v).split('|'), kind = kindOf(ctx, key), t = kind && RM().typeOf(kind, id);
        if (!t) return;
        editSurface(ctx, key, s => {
          const pct = s.cover && isNum(s.cover.pct) ? s.cover.pct : 50;
          if (s.cover && s.cover.type === t.id) return;
          s.cover = Object.assign({ type: t.id, material: t.material || '', pct }, t.id === 'other' ? { name: (s.cover && s.cover.name) || '' } : {});
        });
      },
      // A door or window in everyday words (value "<key>|<opening id>|<type>"): its typical sound data.
      setOpeningType: (ctx, v) => {
        const [key, oid, id] = String(v).split('|');
        editSurface(ctx, key, s => {
          const o = (s.openings || []).find(x => x.id === oid), t = o && RM().openingTypesFor(o.kind).find(x => x.id === id);
          if (!t || o.type === t.id) return;
          o.type = t.id; o.material = t.material || '';
        });
      },
      removeCover: (ctx, key) => editSurface(ctx, key, s => { s.cover = { material: '', pct: null }; }),
      addOpening: (ctx, v) => {
        const [key, kind] = String(v).split('|');
        // It starts as the most common type of its kind (a wooden door, an ordinary window, an open gap), with that type's
        // typical sound data; the type can be changed on the wall.
        const t = RM().openingTypesFor(kind)[0];
        editSurface(ctx, key, s => {
          const ops = s.openings || (s.openings = []), n = 1 + Math.max(0, ...ops.map(o => parseInt(String(o.id).slice(1), 10) || 0));
          ops.push({ id: `o${n}`, kind, type: t ? t.id : '', material: t && t.material ? t.material : '', widthM: null, heightM: null, count: 1 });
        });
      },
      removeOpening: (ctx, v) => {
        const [key, id] = String(v).split('|');
        editSurface(ctx, key, s => { s.openings = (s.openings || []).filter(o => o.id !== id); });
      },

      /* ---------- equipment on a wall ---------- */
      // Ticking a kind of equipment on a wall (an air conditioner, a speaker, …); unticking "Other" drops what it was.
      toggleEquipment: (ctx, v) => {
        const [key, type] = String(v).split('|');
        if (kindOf(ctx, key) !== 'wall' || !RF.EQUIPMENT.some(e => e.id === type)) return;
        editSurface(ctx, key, s => {
          const cur = (s.equipment || []).map(e => (e && typeof e === 'object' ? e.type : e));
          s.equipment = cur.includes(type) ? cur.filter(t => t !== type) : RF.EQUIPMENT.map(e => e.id).filter(t => t === type || cur.includes(t));
          if (!s.equipment.includes('other')) delete s.equipmentOther;
        });
      },
    },
    demoFill(p) { if (!canContinue(p).ok) p.room = D.demoRoom(); },
  });
})(window.AM);
