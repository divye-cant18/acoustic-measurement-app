/* Surfaces — what the room's walls, floor and ceiling are made of, their areas, what is mounted on the walls, and what
   a treatment placed on them covers. It does NOT estimate the room's RT60. The room's RT60 comes only from the
   measurement (js/measurement, services/processing.js); the RT60 after treatment comes from the measured room
   (services/prediction.js). This file is used for two things only:
     - describing the room (Room Setup, the report, the target's notes);
     - the treatment prediction: the absorption of the finish a product covers, so that finish is not counted twice
       (coveredBy), and the area free for it there (coverage warnings).
   Nothing in the measurement code calls this file.

   The room's surfaces, in order (the same everywhere in the app):
     Walls        room.wallKeys, by default Wall 1 to Wall 4 going round the room: 1 and 3 the long walls (length ×
                  height, 3 faces 1), 2 and 4 the end walls (width × height). More can be added (Wall 5, …); a wall
                  keeps its number when another is removed, so what was recorded on it stays with it.
     Floor        length × width
     Ceiling      room.ceilingKeys: the ceiling, and any further sections (a raft, a bulkhead, a different finish), each
                  with its own area; the ceiling keeps what the sections leave of length × width.
   Each surface in the project, room.surfaces[key]:
     type         what it is in everyday words (js/data/room-form.js SURFACE_TYPES, e.g. 'painted-plaster'), '' while
                  not chosen; choosing one sets the construction, the finish and its typical library entry. A surface
                  saved before types existed has none: its type is recognised from its construction and finish
     material     the acoustic data: a library entry (js/data/materials.js), '' while not chosen
     construction what it is built from (js/data/room-form.js CONSTRUCTIONS), '' while not chosen; 'other' with
                  constructionOther { name, notes } typed by the user
     finish       its visible finish (FINISHES), '' while not chosen; 'other' with finishOther { name, notes }
     label        the user's name for it (e.g. "Window wall"); the number stays its identifier
     lengthM, heightM   walls: the wall's own size; where not given, walls 1–4 take the room's length or width and its
                  height, an added wall the room's height (its length must be given)
     areaM2       a ceiling section: its area
     cover        { material, pct }: another material, or existing acoustic treatment, over pct % of the solid area;
                  the finish keeps the rest
     openings     walls only: [{ id, kind: 'door' | 'window' | 'opening', material, widthM, heightM, count }]
     equipment    walls only: the kinds of equipment on it, ticked (EQUIPMENT ids, e.g. ['ac', 'speaker']);
                  equipmentOther: what "other" is, when given. No sizes: recorded for the recommendations only
     origin       'user', or 'migrated' when filled from an earlier version's single choice (to be checked); legacy: that
                  earlier choice, kept for reference
   Areas: gross = the surface's size; openings come off the gross (never more than all of it); the cover takes pct %
   of what is left; the finish keeps the remainder, which is the area free for treatment. Every m² is counted once.
   Material α are limited to 1.00, as product data is; a band a source does not give is missing, never 0. */
(function (AM) {
  'use strict';
  const isNum = AM.util.isNum;
  const BANDS = AM.demo.BANDS;
  const DATA = AM.materialData || { MATERIALS: [], SOURCES: {}, CLASSES: {} };
  const RF = AM.roomFormData;

  // The default room: four walls, floor, ceiling.
  const SURFACES = [
    { key: 'wall1', name: 'Wall 1', kind: 'wall', a: 'L', b: 'H', where: 'long wall, length × height' },
    { key: 'wall2', name: 'Wall 2', kind: 'wall', a: 'W', b: 'H', where: 'end wall, width × height' },
    { key: 'wall3', name: 'Wall 3', kind: 'wall', a: 'L', b: 'H', where: 'long wall opposite Wall 1' },
    { key: 'wall4', name: 'Wall 4', kind: 'wall', a: 'W', b: 'H', where: 'end wall opposite Wall 2' },
    { key: 'floor', name: 'Floor', kind: 'floor', a: 'L', b: 'W', where: 'length × width' },
    { key: 'ceiling', name: 'Ceiling', kind: 'ceiling', a: 'L', b: 'W', where: 'length × width' },
  ];
  const DEFAULT_WALLS = ['wall1', 'wall2', 'wall3', 'wall4'];
  const blankSurface = AM.demo.blankSurface, blankSurfaces = AM.demo.blankSurfaces;
  const OPENINGS = { door: 'Door', window: 'Window', opening: 'Open doorway or gap' };

  /* ---------- the room's surfaces ---------- */
  const isWallKey = k => /^wall\d+$/.test(k), isCeilingKey = k => /^ceiling\d*$/.test(k);
  const keyNo = k => parseInt(String(k).replace(/^\D+/, ''), 10) || 1;
  const uniq = ks => [...new Set(ks)];
  function wallKeysOf(room) {
    const ks = room && Array.isArray(room.wallKeys) ? uniq(room.wallKeys.filter(isWallKey)) : [];
    return ks.length ? ks : DEFAULT_WALLS.slice();
  }
  function ceilingKeysOf(room) {
    const ks = room && Array.isArray(room.ceilingKeys) ? uniq(room.ceilingKeys.filter(isCeilingKey)) : [];
    return ['ceiling', ...ks.filter(k => k !== 'ceiling')];
  }
  function defOf(key) {
    const base = SURFACES.find(s => s.key === key);
    if (base) return base;
    if (isWallKey(key)) return { key, name: `Wall ${keyNo(key)}`, kind: 'wall', a: null, b: 'H', where: 'its own length × height', added: true };
    if (isCeilingKey(key)) return { key, name: `Ceiling section ${keyNo(key)}`, kind: 'ceiling', a: null, b: null, where: 'its own area', section: true };
    return null;
  }
  // The room's surfaces in order: walls, floor, ceiling and its sections. Without a room: the default six.
  const surfacesOf = room => (room ? [...wallKeysOf(room).map(defOf), defOf('floor'), ...ceilingKeysOf(room).map(defOf)] : SURFACES.slice());
  // A surface of this room (or, without a room, of the default room or by its key).
  const surfaceDef = (key, room) => (room ? surfacesOf(room).find(s => s.key === key) || null : defOf(key));
  const nextKey = (room, kind) => {
    const used = Object.keys((room && room.surfaces) || {}).concat(kind === 'wall' ? wallKeysOf(room) : ceilingKeysOf(room));
    const n = 1 + Math.max(kind === 'wall' ? 4 : 1, ...used.filter(kind === 'wall' ? isWallKey : isCeilingKey).map(keyNo));
    return `${kind}${n}`;
  };

  /* ---------- materials ---------- */
  const material = id => (id && DATA.MATERIALS.find(m => m.id === id)) || null;
  // A material's family and category can differ by surface (concrete is "Masonry and concrete" on a wall, "Hard floors"
  // on a floor): a string, or { [kind]: name }.
  const perKind = (v, kind) => (v && typeof v === 'object' ? v[kind] || Object.values(v)[0] : v || '');
  const familyOf = (m, kind) => perKind(m && m.family, kind);
  const categoryOf = (m, kind) => perKind(m && m.category, kind);
  // Openings offer what fits them: a door, its doors and glazing (a glazed door); a window, glazing; an open doorway, the
  // open area.
  const OPENING_FITS = { door: ['door', 'window'], window: ['window'], opening: ['opening'] };
  // The construction(s) and finish(es) a library entry describes on this kind of surface (js/data/room-form.js).
  const classOf = (m, kind) => (m ? RF.classify(familyOf(m, kind), m.variant, kind) : { c: [], f: [] });
  /* Materials offered for a kind of surface ('wall', 'floor', 'ceiling', 'opening'; for an opening, which: 'door',
     'window', 'opening'), in their categories, in data order. With a construction and/or finish (not for openings),
     only the entries that describe them: none at all for a finish that is not listed. */
  function materialsFor(kind, opening, fit) {
    const out = new Map(), fits = opening ? OPENING_FITS[opening] || [opening] : null;
    let list = DATA.MATERIALS.filter(m => m.surfaces.includes(kind) && (!fits || fits.includes(m.opening)));
    const c = fit && fit.construction, f = fit && fit.finish;
    if (!opening && (c || f)) {
      list = f === 'other' ? [] : list.filter(m => { const k = classOf(m, kind); return (!c || c === 'other' || k.c.includes(c)) && (!f || k.f.includes(f)); });
    }
    // The opening's own kind first (doors before glazing for a door); otherwise data order.
    if (fits) list.sort((a, b) => fits.indexOf(a.opening) - fits.indexOf(b.opening));
    list.forEach(m => {
      const cat = categoryOf(m, kind);
      if (!out.has(cat)) out.set(cat, []);
      out.get(cat).push(m);
    });
    return [...out].map(([category, items]) => ({ category, items }));
  }
  // A material's α per octave band. Values above 1.00 (edge effects of a laboratory specimen) are limited to 1.00, as for
  // products; a band the source does not give, or a value that is not a number from 0 up, is missing, never 0.
  function alphaOf(id) {
    const m = material(id), values = {}, missing = [], capped = [];
    BANDS.forEach((f, k) => {
      const v = m ? m.alpha[k] : null;
      if (!isNum(v) || v < 0) { values[f] = null; missing.push(f); return; }
      if (v > 1) capped.push(f);
      values[f] = Math.min(1, v);
    });
    return { values, missing, capped };
  }
  const sourceOf = m => (m && DATA.SOURCES[m.source]) || null;

  /* ---------- construction and finish ---------- */
  const nameFor = (x, kind) => (x ? perKind(x.name, kind) : '');
  const constructionOf = id => RF.CONSTRUCTIONS.find(c => c.id === id) || null;
  const finishOf = id => RF.FINISHES.find(f => f.id === id) || null;
  // Constructions for a kind of surface: those most common in the industry first ({ common, rest }).
  function constructionsFor(kind, industry) {
    const all = RF.CONSTRUCTIONS.filter(c => c.kinds.includes(kind)), pick = (RF.COMMON[industry] || {}).c || [];
    const common = all.filter(c => pick.includes(c.id) && c.id !== 'other');
    return { common, rest: all.filter(c => !common.includes(c)) };
  }
  // Finishes for a kind of surface on a construction (every finish of the kind while none or "Other" is chosen).
  function finishesFor(kind, construction, industry) {
    const fits = construction && construction !== 'other' ? (RF.FITS[kind] || {})[construction] : null;
    const all = RF.FINISHES.filter(f => f.kinds.includes(kind) && (!fits || fits.includes(f.id))), pick = (RF.COMMON[industry] || {}).f || [];
    const common = all.filter(f => pick.includes(f.id) && f.id !== 'other');
    return { common, rest: all.filter(f => !common.includes(f)) };
  }
  const finishFits = (kind, construction, finish) => !finish || !construction || construction === 'other' || ((RF.FITS[kind] || {})[construction] || []).includes(finish);
  // Whether a library entry fits a construction and finish (an unchosen one fits anything).
  function materialFits(id, kind, construction, finish) {
    const m = material(id);
    if (!m) return !id;
    if (finish === 'other') return false;
    const k = classOf(m, kind);
    return (!construction || construction === 'other' || k.c.includes(construction)) && (!finish || k.f.includes(finish));
  }
  // What the user named a construction or finish, or the list's name.
  function constructionText(cfg, kind) {
    if (cfg.construction === 'other') return (cfg.constructionOther && cfg.constructionOther.name) || 'Other construction';
    return nameFor(constructionOf(cfg.construction), kind);
  }
  function finishText(cfg, kind) {
    if (cfg.finish === 'other') return (cfg.finishOther && cfg.finishOther.name) || 'Other finish';
    return nameFor(finishOf(cfg.finish), kind);
  }

  /* ---------- what a surface is, in everyday words (js/data/room-form.js SURFACE_TYPES) ---------- */
  const typesOf = kind => (RF.SURFACE_TYPES || {})[kind] || [];
  const typeOf = (kind, id) => typesOf(kind).find(t => t.id === id) || null;
  // The types for a kind of surface, those most often met in the room's type (or its industry) first: { common, rest,
  // label }. "Something else" always comes last.
  function typesFor(kind, room) {
    const all = typesOf(kind), r = room || {};
    const list = ((RF.ROOM_MATERIALS || {})[r.type] || (RF.INDUSTRY_MATERIALS || {})[r.industry] || {})[kind] || [];
    const common = list.map(id => all.find(t => t.id === id)).filter(t => t && t.id !== 'other');
    const rest = all.filter(t => !common.includes(t));
    const by = (RF.ROOM_MATERIALS || {})[r.type] ? `a${/^[aeiou]/i.test(r.type) ? 'n' : ''} ${String(r.type).toLowerCase()}` : r.industry && (RF.INDUSTRY_MATERIALS || {})[r.industry] ? 'this industry' : '';
    return { common, rest, label: by ? `Common in ${by}` : '' };
  }
  // A surface's type: the one chosen, or, for a surface saved before types existed, the one with its construction and
  // finish (and its library entry, where two types share them). { type, inferred } or null.
  function typeOfSurface(cfg, kind) {
    if (!cfg) return null;
    if (cfg.type) { const t = typeOf(kind, cfg.type); return t ? { type: t, inferred: false } : null; }
    if (cfg.finish === 'other') return { type: typeOf(kind, 'other'), inferred: true };
    if (!cfg.finish) return null;
    const same = typesOf(kind).filter(t => t.id !== 'other' && (t.construction || '') === (cfg.construction || '') && t.finish === cfg.finish);
    const t = same.find(x => x.material && x.material === cfg.material) || same[0];
    return t ? { type: t, inferred: true } : null;
  }
  // What the surface is, in words: its type's name; for "Something else", what the user typed (with a construction typed
  // in an earlier version, both); '' without a type.
  function typeText(cfg, kind) {
    const x = typeOfSurface(cfg, kind);
    if (!x) return '';
    if (x.type.id !== 'other') return x.type.name;
    const named = String((cfg.finishOther && cfg.finishOther.name) || '').trim();
    return cfg.construction ? buildText(cfg, kind) : named || 'Something else';
  }
  /* How much sound a material absorbs, in plain words, from its sourced α: the mean over the octave bands 250 Hz–2 kHz
     (at least three of them given). The bands of words are the app's own convention for describing it, not a rating
     from a standard: under 0.10 hard, under 0.30 a little, under 0.60 some, from 0.60 a lot. null without data. */
  const SOUND_WORDS = ['Hard: reflects almost all sound', 'Absorbs a little sound', 'Absorbs some sound', 'Absorbs a lot of sound'];
  function soundRating(id) {
    const m = material(id);
    if (!m) return null;
    const a = alphaOf(id), vals = [250, 500, 1000, 2000].map(f => a.values[f]).filter(v => v != null);
    if (vals.length < 3) return null;
    const mean = vals.reduce((x, v) => x + v, 0) / vals.length, level = mean < 0.1 ? 0 : mean < 0.3 ? 1 : mean < 0.6 ? 2 : 3;
    return { level, word: SOUND_WORDS[level], mean };
  }
  // Doors and windows in everyday words (RF.OPENING_TYPES), and an opening's type: chosen, or recognised by its entry.
  const openingTypesFor = kind => (RF.OPENING_TYPES || {})[kind] || [];
  const openingTypeOf = o => (o ? openingTypesFor(o.kind).find(t => (o.type ? t.id === o.type : t.material && t.material === o.material)) || null : null);
  // The types that can cover part of a surface (RF.COVER_TYPES), and a cover's type: chosen, or recognised by its entry.
  const coverTypesFor = kind => ((RF.COVER_TYPES || {})[kind] || []).map(id => typeOf(kind, id)).filter(Boolean);
  const coverTypeOf = (cover, kind) => (cover ? coverTypesFor(kind).find(t => (cover.type ? t.id === cover.type : t.material && t.material === cover.material)) || null : null);

  /* ---------- equipment ---------- */
  // The kinds of equipment ticked on a wall, in the list's order: [{ type, label }] ("other" with what it is, if given).
  function equipmentOf(cfg) {
    const ticked = new Set((cfg.equipment || []).map(e => (e && typeof e === 'object' ? e.type : e)));
    return RF.EQUIPMENT.filter(t => ticked.has(t.id)).map(t => ({ type: t.id, label: t.id === 'other' ? String(cfg.equipmentOther || '').trim() || 'Other equipment' : t.name }));
  }

  /* ---------- one surface ---------- */
  const surfaceOf = (room, key) => (room && room.surfaces && room.surfaces[key]) || blankSurface();
  const openingArea = o => (isNum(o.widthM) && isNum(o.heightM) && o.widthM > 0 && o.heightM > 0 ? o.widthM * o.heightM * (isNum(o.count) && o.count >= 1 ? Math.floor(o.count) : 1) : null);
  const sizeOk = room => !!room && ['L', 'W', 'H'].every(k => isNum(room[k]) && room[k] > 0);
  // A wall's own size: entered values within these limits; others are reported and not used.
  const WALL_LIMITS = { lengthM: [0.1, 100], heightM: [0.5, 30] };
  const wallDimError = (k, v) => (isNum(v) && (v < WALL_LIMITS[k][0] || v > WALL_LIMITS[k][1]) ? `Enter ${WALL_LIMITS[k][0]}–${WALL_LIMITS[k][1]} m` : null);
  /* A wall's length and height: as entered on the wall, otherwise walls 1–4 take the room's length or width, and every
     wall the room's height. { lengthM, heightM, own: entered on the wall } */
  function wallSize(room, def, cfg) {
    const ok = k => isNum(cfg[k]) && !wallDimError(k, cfg[k]);
    const lengthM = ok('lengthM') ? cfg.lengthM : def.a && sizeOk(room) ? room[def.a] : null;
    const heightM = ok('heightM') ? cfg.heightM : sizeOk(room) ? room.H : null;
    return { lengthM, heightM, own: ok('lengthM') || ok('heightM') };
  }
  const floorArea = room => (sizeOk(room) ? room.L * room.W : null);
  // The ceiling's sections other than the main ceiling: { key, areaM2 } (null while not entered).
  const sectionAreas = room => ceilingKeysOf(room).filter(k => k !== 'ceiling').map(k => { const a = surfaceOf(room, k).areaM2; return { key: k, areaM2: isNum(a) && a > 0 ? a : null }; });

  /* The surface's areas and the parts it is made of: { key, name, kind, label, lengthM, heightM, grossM2, openingsM2,
     solidM2, coverM2, finishM2, availableM2 (free for treatment), equipment, construction, finish, parts: [{ role:
     'finish' | 'cover' | 'door' | 'window' | 'opening', label, materialId, material, areaM2, alpha }], problems: [...] }.
     Areas are null while the size is not complete. */
  function surfaceModel(room, key) {
    const def = surfaceDef(key, room) || defOf(key), cfg = surfaceOf(room, key);
    const out = { key, name: def.name, kind: def.kind, where: def.where, label: cfg.label || '', origin: cfg.origin || 'user', legacy: cfg.legacy || null,
      construction: cfg.construction || '', finish: cfg.finish || '', lengthM: null, heightM: null,
      grossM2: null, openingsM2: 0, solidM2: null, coverM2: 0, finishM2: null, availableM2: null, equipment: def.kind === 'wall' ? equipmentOf(cfg) : [], parts: [], problems: [] };
    let gross = null;
    if (def.kind === 'wall') {
      const sz = wallSize(room, def, cfg);
      out.lengthM = sz.lengthM; out.heightM = sz.heightM;
      ['lengthM', 'heightM'].forEach(k => { const e = wallDimError(k, cfg[k]); if (e) out.problems.push(`${def.name} ${k === 'lengthM' ? 'length' : 'height'}: ${e.toLowerCase()}.`); });
      if (sz.lengthM && sz.heightM) gross = sz.lengthM * sz.heightM;
      else if (def.added && sizeOk(room)) out.problems.push(`Enter the length of ${def.name}.`);
    } else if (def.kind === 'floor') {
      gross = floorArea(room);
    } else if (def.section) {
      const a = cfg.areaM2, fl = floorArea(room);
      if (isNum(a) && a <= 0) out.problems.push(`The area of ${def.name} must be more than 0 m².`);
      if (isNum(a) && a > 0) gross = fl != null ? Math.min(a, fl) : a;
      if (isNum(a) && fl != null && a > fl + 1e-9) out.problems.push(`${def.name} is larger than the floor (${a} of ${fl.toFixed(1)} m²): it is counted as ${fl.toFixed(1)} m².`);
      else if (sizeOk(room)) out.problems.push(`Enter the area of ${def.name}.`);
    } else if (def.kind === 'ceiling') {
      const fl = floorArea(room);
      if (fl != null) {
        const others = sectionAreas(room).reduce((s, x) => s + (x.areaM2 || 0), 0);
        if (others > fl + 1e-9) out.problems.push(`The ceiling sections add up to more than the floor area (${others.toFixed(1)} of ${fl.toFixed(1)} m²).`);
        gross = Math.max(0, fl - others);
      }
    }
    if (gross == null) return out;
    out.grossM2 = gross;
    // Openings (walls only), each counted once, all of them together never more than the wall.
    const ops = def.kind === 'wall' ? (cfg.openings || []) : [];
    let open = 0;
    ops.forEach(o => {
      const a = openingArea(o);
      if (isNum(o.count) && o.count < 1) out.problems.push(`${OPENINGS[o.kind] || 'An opening'} on ${def.name}: enter how many, 1 or more.`);
      if (a == null) { out.problems.push(`${OPENINGS[o.kind] || 'An opening'} on ${def.name} needs a width and a height.`); return; }
      const use = Math.min(a, gross - open);
      if (use < a) out.problems.push(`The openings on ${def.name} add up to more than the wall (${(open + a).toFixed(1)} of ${gross.toFixed(1)} m²); only the wall's area is counted.`);
      open += use;
      out.parts.push({ role: o.kind || 'opening', label: OPENINGS[o.kind] || 'Opening', materialId: o.material || '', areaM2: use, id: o.id });
    });
    out.openingsM2 = open;
    const solid = Math.max(0, gross - open);
    out.solidM2 = solid;
    // A partial covering of the solid area, then the finish on the rest.
    const cov = cfg.cover || {}, given = isNum(cov.pct), pct = given ? Math.min(100, Math.max(0, cov.pct)) : 0;
    if (given && (cov.pct < 0 || cov.pct > 100)) out.problems.push(`The covering on ${def.name} is given as ${cov.pct} %; it is counted as ${pct} %.`);
    if (cov.material && !given) out.problems.push(`Enter how much of ${def.name} is covered.`);
    out.coverM2 = solid * pct / 100;
    out.finishM2 = solid - out.coverM2;
    out.parts.unshift({ role: 'finish', label: 'Finish', materialId: cfg.material || '', areaM2: out.finishM2 });
    if (out.coverM2 > 0) out.parts.splice(1, 0, { role: 'cover', label: 'Covered part', materialId: cov.material || '', areaM2: out.coverM2 });
    out.parts.forEach(p => { p.material = material(p.materialId); p.alpha = p.material ? alphaOf(p.materialId) : null; });
    out.availableM2 = out.finishM2;
    return out;
  }

  /* ---------- treatment on the surfaces ---------- */
  const NUM_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  // Where a treatment item can be placed in this room, and the surfaces each placement covers.
  function placementsFor(room) {
    const walls = surfacesOf(room).filter(s => s.kind === 'wall'), ceil = surfacesOf(room).filter(s => s.kind === 'ceiling');
    const n = walls.length, cfg = k => surfaceOf(room, k);
    return [
      { value: 'Walls', label: n === 1 ? 'Walls (the one wall)' : `Walls, spread over all ${NUM_WORDS[n] || n}`, keys: walls.map(s => s.key) },
      ...walls.map(s => ({ value: s.name, label: cfg(s.key).label ? `${s.name} · ${cfg(s.key).label}` : s.name, keys: [s.key] })),
      { value: 'Ceiling', label: ceil.length > 1 ? `Ceiling, over its ${NUM_WORDS[ceil.length] || ceil.length} sections` : 'Ceiling', keys: ceil.map(s => s.key) },
      { value: 'Walls and ceiling', label: 'Walls and ceiling', keys: [...walls, ...ceil].map(s => s.key) },
    ];
  }
  const PLACEMENTS = placementsFor(null);
  const placementKeys = (placement, room) => { const pl = placementsFor(room || null); return (pl.find(p => p.value === placement) || pl[0]).keys; };

  /* What a treatment placed there covers: the finish of those surfaces (not their openings, not an existing covering),
     area-weighted. { keys, names, freeM2: area available, alpha: { [f]: α | null },
     known: every band known, why: the reason when not known }. Used by the treatment prediction, which starts from the
     measured room. */
  function coveredBy(room, placement) {
    const ss = placementKeys(placement, room).map(k => surfaceModel(room, k)), free = ss.reduce((s, x) => s + (x.availableM2 || 0), 0);
    const alpha = {}, whys = [];
    BANDS.forEach(f => {
      let w = 0, why = null;
      ss.forEach(s => {
        const p = s.parts.find(x => x.role === 'finish'), a = s.availableM2 || 0;
        if (why || !p || !(a > 0)) return; // no finish part while the size is not complete
        if (!p.material) why = `${s.name}: ${p.materialId ? 'the material is not in the library' : 'no material chosen'}`;
        else if (p.alpha.values[f] == null) why = `${s.name}: no value at ${f} Hz`;
        else w += a * p.alpha.values[f];
      });
      if (!why && !(free > 0)) why = 'no free surface there';
      alpha[f] = why ? null : w / free;
      if (why) whys.push(why);
    });
    return { keys: ss.map(s => s.key), names: ss.map(s => s.name), freeM2: free, alpha, known: !whys.length, why: whys[0] || null };
  }

  /* ---------- earlier projects ---------- */
  /* Surfaces for a project saved before them, from its single floor / walls / ceiling choice. A choice that names one
     material (AM.materialData.LEGACY) fills those surfaces, marked 'migrated' so the screen asks to check it; one that
     does not (e.g. "Carpet": which carpet, on what?) leaves them to choose, with the earlier entry kept beside them.
     The earlier fields themselves are kept as they were. */
  function fromLegacy(room) {
    const out = blankSurfaces(), L = DATA.LEGACY || {};
    const put = (keys, field) => {
      const old = room && room[field];
      if (!old) return;
      const id = (L[field] || {})[old];
      keys.forEach(k => { out[k].legacy = old; if (material(id)) { out[k].material = id; out[k].origin = 'migrated'; } });
    };
    put(['wall1', 'wall2', 'wall3', 'wall4'], 'walls');
    put(['floor'], 'floor');
    put(['ceiling'], 'ceiling');
    return out;
  }

  /* ---------- in words ---------- */
  function partText(p) {
    if (!p.materialId) return 'not chosen';
    if (!p.material) return 'unknown material';
    return p.material.variant || familyOf(p.material);
  }
  const listText = xs => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0] || '');
  // Is a surface described: a library material, or at least what it is built from or its finish.
  const describedCfg = cfg => !!(cfg.type || cfg.material || cfg.construction || cfg.finish);
  // "Concrete or reinforced concrete, painted" from the construction and finish chosen (or typed).
  function buildText(cfg, kind) {
    const c = cfg.construction ? constructionText(cfg, kind) : '', f = cfg.finish ? finishText(cfg, kind) : '';
    return [c, f && f.charAt(0).toLowerCase() + f.slice(1)].filter(Boolean).join(', ');
  }
  // One line per surface, for the target's notes and the report.
  function describe(room) {
    return surfacesOf(room).map(s => {
      const m = surfaceModel(room, s.key), fin = m.parts.find(p => p.role === 'finish'), cov = m.parts.find(p => p.role === 'cover');
      const ops = m.parts.filter(p => ['door', 'window', 'opening'].includes(p.role));
      const cfg = surfaceOf(room, s.key), built = buildText(cfg, s.kind), tx = typeOfSurface(cfg, s.kind), tt = typeText(cfg, s.kind);
      // Its type says what the surface is (with the exact library entry when one other than the type's typical one was
      // chosen); without a type, the library entry, or what it is built from and its finish.
      const exact = tx && cfg.material && cfg.material !== tx.type.material ? partText({ materialId: cfg.material, material: material(cfg.material) }) : '';
      const what = tt ? (exact ? `${tt} (${exact})` : tt)
        : cfg.material ? (fin ? partText(fin) : partText({ materialId: cfg.material, material: material(cfg.material) })) : built || 'not chosen';
      const extra = [
        cov ? `, ${Math.round(100 * cov.areaM2 / (m.solidM2 || 1))} % ${(t => (t && t.id !== 'other' ? t.name.toLowerCase() : partText(cov)))(coverTypeOf(cfg.cover, s.kind))}` : '',
        ops.length ? `, ${ops.length} opening${ops.length > 1 ? 's' : ''}` : '',
        m.equipment.length ? `, with ${listText(m.equipment.map(e => e.label.toLowerCase()))}` : '',
      ].join('');
      return { key: s.key, name: cfg.label ? `${s.name} (${cfg.label})` : s.name, chosen: describedCfg(cfg), legacy: cfg.legacy || null, text: `${what}${extra}` };
    });
  }
  // How many surfaces are described, and whether any finish is soft (α at 500 Hz of 0.3 or more on at least 5 % of
  // all surfaces). A description for the target's notes; not an RT60 estimate.
  function finishes(room) {
    const defs = surfacesOf(room), ms = defs.map(s => surfaceModel(room, s.key)), total = ms.reduce((s, x) => s + (x.grossM2 || 0), 0);
    const soft = ms.reduce((s, x) => s + x.parts.filter(p => p.alpha && p.alpha.values[500] != null && p.alpha.values[500] >= 0.3).reduce((t, p) => t + p.areaM2, 0), 0);
    const chosen = defs.filter(s => describedCfg(surfaceOf(room, s.key))).length;
    return { described: chosen > 0, chosen, of: defs.length, soft: total > 0 && soft / total >= 0.05 };
  }
  // The room's totals for its summary: areas by kind of surface, what is free for treatment on the walls, and counts.
  function totals(room) {
    const ms = surfacesOf(room).map(s => surfaceModel(room, s.key)), sum = (kind, k) => ms.filter(m => m.kind === kind).reduce((s, m) => (m[k] == null || s == null ? null : s + m[k]), 0);
    const walls = ms.filter(m => m.kind === 'wall');
    return {
      walls: walls.length, ceilingSections: ms.filter(m => m.kind === 'ceiling').length,
      wallM2: walls.every(m => m.grossM2 != null) ? sum('wall', 'grossM2') : null, floorM2: sum('floor', 'grossM2'), ceilingM2: sum('ceiling', 'grossM2'),
      wallAvailableM2: walls.every(m => m.availableM2 != null) ? sum('wall', 'availableM2') : null,
      equipmentItems: walls.reduce((s, m) => s + m.equipment.length, 0), wallsWithEquipment: walls.filter(m => m.equipment.length).length,
    };
  }
  // Materials the user typed in ("Other / not listed"), with the surface each is on: kept with the room, and sent with
  // the report form for review (js/services/report-gate.js). [{ kind: 'construction' | 'finish', surface, where, name, notes }]
  function customMaterials(room) {
    const out = [];
    surfacesOf(room).forEach(s => {
      const cfg = surfaceOf(room, s.key);
      [['construction', 'constructionOther'], ['finish', 'finishOther']].forEach(([kind, field]) => {
        const x = cfg[kind] === 'other' && cfg[field];
        if (x && String(x.name || '').trim()) out.push({ kind, surface: s.kind, where: s.name, name: String(x.name).trim(), notes: String(x.notes || '').trim() });
      });
    });
    return out;
  }

  AM.services.surfaces = {
    SURFACES, OPENINGS, PLACEMENTS, CLASSES: DATA.CLASSES || {}, WALL_LIMITS, blankSurface, blankSurfaces, surfaceDef, surfacesOf, wallKeysOf, ceilingKeysOf, nextKey,
    placementsFor, placementKeys, material, materialsFor, familyOf, categoryOf, alphaOf, sourceOf, classOf, openingArea, wallDimError, surfaceModel, coveredBy,
    constructionsFor, finishesFor, finishFits, materialFits, constructionOf, finishOf, constructionText, finishText, equipmentOf,
    typesOf, typeOf, typesFor, typeOfSurface, typeText, soundRating, SOUND_WORDS, openingTypesFor, openingTypeOf, coverTypesFor, coverTypeOf,
    describe, finishes, totals, customMaterials, fromLegacy,
  };
})(window.AM);
