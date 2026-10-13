/* Surfaces — what the room's six surfaces are made of, their areas, and what a treatment placed on them covers.
   It does NOT estimate the room's RT60. The room's RT60 comes only from the measurement (js/measurement,
   services/processing.js); the RT60 after treatment comes from the measured room (services/prediction.js). This file is
   used for two things only:
     - describing the room (Room Setup, the report);
     - the treatment prediction: the absorption of the finish a product covers, so that finish is not counted twice
       (coveredBy), and the free area there (coverage warnings).
   Nothing in the measurement code calls this file.

   Surfaces of a rectangular room, going round it (the same assignment everywhere in the app):
     Wall 1, Wall 3   the long walls, length × height (Wall 3 faces Wall 1)
     Wall 2, Wall 4   the end walls, width × height (Wall 4 faces Wall 2)
     Floor, Ceiling   length × width
   Each surface in the project, room.surfaces[key]:
     material   the finish: a material id (js/data/materials.js), '' while not chosen
     cover      { material, pct }: another material over pct % of the surface's solid area (panels on part of a wall,
                a rug on part of a floor); the finish keeps the rest
     openings   walls only: [{ id, kind: 'door' | 'window' | 'opening', material, widthM, heightM, count }]
     origin     'user', or 'migrated' when filled from an earlier version's single choice (to be checked); legacy: that
                earlier choice, kept for reference
   Areas: gross = the surface's two dimensions; openings come off the gross (never more than all of it); the cover takes
   pct % of what is left; the finish keeps the remainder. Every m² is counted once. Material α are limited to 1.00, as
   product data is; a band a source does not give is missing, never 0. */
(function (AM) {
  'use strict';
  const isNum = AM.util.isNum;
  const BANDS = AM.demo.BANDS;
  const DATA = AM.materialData || { MATERIALS: [], SOURCES: {}, CLASSES: {} };

  const SURFACES = [
    { key: 'wall1', name: 'Wall 1', kind: 'wall', a: 'L', b: 'H', where: 'long wall, length × height' },
    { key: 'wall2', name: 'Wall 2', kind: 'wall', a: 'W', b: 'H', where: 'end wall, width × height' },
    { key: 'wall3', name: 'Wall 3', kind: 'wall', a: 'L', b: 'H', where: 'long wall opposite Wall 1' },
    { key: 'wall4', name: 'Wall 4', kind: 'wall', a: 'W', b: 'H', where: 'end wall opposite Wall 2' },
    { key: 'floor', name: 'Floor', kind: 'floor', a: 'L', b: 'W', where: 'length × width' },
    { key: 'ceiling', name: 'Ceiling', kind: 'ceiling', a: 'L', b: 'W', where: 'length × width' },
  ];
  const surfaceDef = key => SURFACES.find(s => s.key === key) || null;
  const blankSurface = AM.demo.blankSurface, blankSurfaces = AM.demo.blankSurfaces;
  const OPENINGS = { door: 'Door', window: 'Window', opening: 'Open doorway or gap' };

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
  /* Materials offered for a kind of surface ('wall', 'floor', 'ceiling', 'opening'; for an opening, which: 'door',
     'window', 'opening'), in their categories, in data order. */
  function materialsFor(kind, opening) {
    const out = new Map(), fits = opening ? OPENING_FITS[opening] || [opening] : null;
    const list = DATA.MATERIALS.filter(m => m.surfaces.includes(kind) && (!fits || fits.includes(m.opening)));
    // The opening's own kind first (doors before glazing for a door); otherwise data order.
    if (fits) list.sort((a, b) => fits.indexOf(a.opening) - fits.indexOf(b.opening));
    list.forEach(m => {
      const c = categoryOf(m, kind);
      if (!out.has(c)) out.set(c, []);
      out.get(c).push(m);
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

  /* ---------- one surface ---------- */
  const surfaceOf = (room, key) => (room && room.surfaces && room.surfaces[key]) || blankSurface();
  const openingArea = o => (isNum(o.widthM) && isNum(o.heightM) && o.widthM > 0 && o.heightM > 0 ? o.widthM * o.heightM * (isNum(o.count) && o.count >= 1 ? Math.floor(o.count) : 1) : null);
  const sizeOk = room => !!room && ['L', 'W', 'H'].every(k => isNum(room[k]) && room[k] > 0);

  /* The surface's areas and the parts it is made of: { key, name, kind, grossM2, openingsM2, solidM2, coverM2, finishM2,
     parts: [{ role: 'finish' | 'cover' | 'door' | 'window' | 'opening', label, materialId, material, areaM2, alpha }],
     problems: [...] }. Areas are null while the room size is not complete. */
  function surfaceModel(room, key) {
    const def = surfaceDef(key), cfg = surfaceOf(room, key);
    const out = { key, name: def.name, kind: def.kind, where: def.where, origin: cfg.origin || 'user', legacy: cfg.legacy || null, grossM2: null, openingsM2: 0, solidM2: null, coverM2: 0, finishM2: null, parts: [], problems: [] };
    if (!sizeOk(room)) return out;
    const gross = room[def.a] * room[def.b];
    out.grossM2 = gross;
    // Openings (walls only), each counted once, all of them together never more than the wall.
    const ops = def.kind === 'wall' ? (cfg.openings || []) : [];
    let open = 0;
    ops.forEach(o => {
      const a = openingArea(o);
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
    return out;
  }

  /* ---------- treatment on the surfaces ---------- */
  // Where a treatment item can be placed, and the surfaces each placement covers.
  const PLACEMENTS = [
    { value: 'Walls', label: 'Walls, spread over all four', keys: ['wall1', 'wall2', 'wall3', 'wall4'] },
    ...SURFACES.filter(s => s.kind === 'wall').map(s => ({ value: s.name, label: s.name, keys: [s.key] })),
    { value: 'Ceiling', label: 'Ceiling', keys: ['ceiling'] },
    { value: 'Walls and ceiling', label: 'Walls and ceiling', keys: ['wall1', 'wall2', 'wall3', 'wall4', 'ceiling'] },
  ];
  const placementKeys = placement => (PLACEMENTS.find(p => p.value === placement) || PLACEMENTS[0]).keys;

  /* What a treatment placed there covers: the finish of those surfaces (not their openings, not an existing covering),
     area-weighted. { keys, names, freeM2: finish area available, alpha: { [f]: α | null }, known: every band known,
     why: the reason when not known }. Used by the treatment prediction, which starts from the measured room. */
  function coveredBy(room, placement) {
    const ss = placementKeys(placement).map(k => surfaceModel(room, k)), free = ss.reduce((s, x) => s + (x.finishM2 || 0), 0);
    const alpha = {}, whys = [];
    BANDS.forEach(f => {
      let w = 0, why = null;
      ss.forEach(s => {
        const p = s.parts.find(x => x.role === 'finish');
        if (why || !p || !(p.areaM2 > 0)) return; // no finish part while the room size is not complete
        if (!p.material) why = `${s.name}: ${p.materialId ? 'the material is not in the library' : 'no material chosen'}`;
        else if (p.alpha.values[f] == null) why = `${s.name}: no value at ${f} Hz`;
        else w += p.areaM2 * p.alpha.values[f];
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
  // One line per surface, for the target's notes and the report.
  function describe(room) {
    return SURFACES.map(s => {
      const m = surfaceModel(room, s.key), fin = m.parts.find(p => p.role === 'finish'), cov = m.parts.find(p => p.role === 'cover');
      const ops = m.parts.filter(p => ['door', 'window', 'opening'].includes(p.role));
      const cfg = surfaceOf(room, s.key);
      return { key: s.key, name: s.name, chosen: !!cfg.material, legacy: cfg.legacy || null, text: fin ? `${partText(fin)}${cov ? `, ${Math.round(100 * cov.areaM2 / (m.solidM2 || 1))} % ${partText(cov)}` : ''}${ops.length ? `, ${ops.length} opening${ops.length > 1 ? 's' : ''}` : ''}` : (cfg.material ? partText({ materialId: cfg.material, material: material(cfg.material) }) : 'not chosen') };
    });
  }
  // How many surfaces have a finish chosen, and whether any finish is soft (α at 500 Hz of 0.3 or more on at least 5 % of
  // all surfaces). A description for the target's notes; not an RT60 estimate.
  function finishes(room) {
    const ms = SURFACES.map(s => surfaceModel(room, s.key)), total = ms.reduce((s, x) => s + (x.grossM2 || 0), 0);
    const soft = ms.reduce((s, x) => s + x.parts.filter(p => p.alpha && p.alpha.values[500] != null && p.alpha.values[500] >= 0.3).reduce((t, p) => t + p.areaM2, 0), 0);
    const chosen = SURFACES.filter(s => !!surfaceOf(room, s.key).material).length;
    return { described: chosen > 0, chosen, soft: total > 0 && soft / total >= 0.05 };
  }

  AM.services.surfaces = {
    SURFACES, OPENINGS, PLACEMENTS, CLASSES: DATA.CLASSES || {}, blankSurface, blankSurfaces, surfaceDef, placementKeys,
    material, materialsFor, familyOf, categoryOf, alphaOf, sourceOf, openingArea, surfaceModel, coveredBy, describe, finishes, fromLegacy,
  };
})(window.AM);
