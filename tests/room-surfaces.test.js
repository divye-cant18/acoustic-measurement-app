/* Tests of the room surfaces, the absence of any untreated-room RT60 prediction, and the treatment prediction from the
   measured room, in the whole application (tests/room-surfaces.html). Development only. Results on the page and in
   window.ROOM_SURFACES_TEST (window.ROOM_SURFACES_DONE resolves).

   Expected values are worked out by hand in the comments, with fixture materials of round α added for the run (ids
   'test-…', removed after it), so they come neither from the code under test nor from the library's numbers.

    1 material library: every entry sourced, classified, six bands, nothing 0 in place of missing
    2 no untreated-room prediction: no such function, field, screen, report row or script text; no RT60 without a
      measurement, however completely the surfaces are described
    3 geometry: the six areas for several rooms, openings and partial coverings, nothing negative, every m² once
    4 what a treatment covers: the finish's α, free area, missing data named, never 0
    5 the six surfaces are independent (through the Room step's own actions)
    6 saved and restored
    7 the screen updates without a reload (DOM events, as a user's), and shows no predicted RT60
    8 treatment: from the measured room, nothing counted twice, the surfaces used only for what is covered, the model's
      assumptions checked
    9 the target does not follow the surfaces
   10 the measurement is isolated: same recording, same result; stored measurement untouched; no review flags on
      target or measurement steps; the measurement code does not reference the surfaces
   11 a project saved before the surfaces, migrated by the app's own load
   12 the report: surfaces described, measured value unchanged, prediction after treatment with its assumptions, no
      untreated-room prediction
   13 how a product is mounted: every tested way shown on the product page; one picked before adding is kept, the
      app's best stays marked and can be chosen again */
(function () {
  'use strict';
  const results = window.ROOM_SURFACES_TEST = [];
  const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) }); show(); };
  const status = t => { const el = document.getElementById('rm-status'); if (el) el.textContent = t; };
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  function show() {
    const el = document.getElementById('rm-out');
    if (el) el.innerHTML = results.map(t => `<li class="${t.ok ? 'ok' : 'bad'}"><b>${t.ok ? 'PASS' : 'FAIL'}</b> ${esc(t.name)}<br><small>${esc(t.detail)}</small></li>`).join('');
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function until(fn, what, ms = 20000) {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(50); }
    throw new Error(`Timed out waiting for ${what}`);
  }
  const close = (a, b, tol = 1e-9) => a != null && Math.abs(a - b) <= tol;
  const json = o => JSON.stringify(o);
  const copy = o => JSON.parse(JSON.stringify(o));
  const textOf = h => { const d = document.createElement('div'); d.innerHTML = h; return d.textContent.replace(/\s+/g, ' '); };

  /* ---------- before the app loads: a clean store, and projects saved by a version before the surfaces ---------- */
  const IKEY = 'acoustic-measurement-prototype', PKEY = id => `${IKEY}:p:${id}`;
  const LEGACY = [
    { id: 'legacy-a', walls: 'Concrete', floor: 'Carpet', ceiling: 'Plasterboard', existing: 'Some soft furnishings' },
    { id: 'legacy-b', walls: 'Plasterboard + glass', floor: 'Hardwood', ceiling: 'Acoustic tile', existing: 'None' },
  ];
  (function seed() {
    // The page stores under its own prefix (tests/room-surfaces.html); clear what an earlier run left there.
    const P = 'room-surfaces-test:';
    [localStorage, sessionStorage].forEach(st => {
      const keys = [];
      for (let i = 0; i < st.length; i++) { const k = st.key(i); if (k && k.startsWith(P)) keys.push(k.slice(P.length)); }
      keys.forEach(k => st.removeItem(k));
    });
    const now = new Date().toISOString();
    LEGACY.forEach(l => {
      localStorage.setItem(PKEY(l.id), JSON.stringify({
        id: l.id, kind: 'new', createdAt: now, updatedAt: now, lastStage: 'target',
        room: { name: `Saved before surfaces (${l.walls})`, industry: 'Corporate / Office', type: 'Conference room', use: 'Video calls and hybrid meetings', L: 8, W: 5, H: 3, occupancy: 6, furnishing: 'Furnished', floor: l.floor, walls: l.walls, ceiling: l.ceiling, existing: l.existing },
        target: { preferred: 0.6, min: 0.48, max: 0.72, source: 'custom', basis: 'Set in an earlier version of the app' },
        setup: { deviceKind: null, deviceId: 'default', deviceLabel: '', permission: 'not-requested', input: null, position: 'P1', signal: 'sweep', sweepLevelDb: 0, noise: null, noiseAttempt: null, prep: {} },
        measurement: { recording: null, failed: null, retry: null }, processing: { result: null, attempt: null, history: [] },
        treatment: { items: [], active: null }, completed: ['home', 'room', 'target'], review: [],
      }));
    });
    localStorage.setItem(IKEY, JSON.stringify({ v: 2, activeId: null, ids: LEGACY.map(l => l.id) }));
  })();

  // Fixture materials: round α, so every sum below can be done by hand. 'test-soft' has 1.10 at 4000 Hz (limited to 1.00).
  const FIXTURES = [
    { id: 'test-hard', family: 'Test hard', variant: '', surfaces: ['wall', 'floor', 'ceiling'], category: 'Test fixtures', alpha: [0.10, 0.10, 0.10, 0.10, 0.10, 0.10], source: 'test', quality: 'compilation', conditions: 'test fixture' },
    { id: 'test-soft', family: 'Test soft', variant: '', surfaces: ['wall', 'floor', 'ceiling'], category: 'Test fixtures', alpha: [0.20, 0.40, 0.60, 0.80, 0.90, 1.10], source: 'test', quality: 'manufacturer', conditions: 'test fixture' },
    { id: 'test-gap', family: 'Test gap', variant: '', surfaces: ['wall', 'floor', 'ceiling'], category: 'Test fixtures', alpha: [null, 0.30, 0.30, 0.30, 0.30, 0.30], source: 'test', quality: 'published', conditions: 'test fixture' },
    { id: 'test-mid', family: 'Test mid', variant: '', surfaces: ['wall', 'floor', 'ceiling'], category: 'Test fixtures', alpha: [0.05, 0.05, 0.05, 0.05, 0.05, 0.05], source: 'test', quality: 'published', conditions: 'test fixture' },
    { id: 'test-door', family: 'Test door', variant: '', surfaces: ['opening'], opening: 'door', category: 'Test fixtures', alpha: [0.15, 0.15, 0.15, 0.15, 0.15, 0.15], source: 'test', quality: 'compilation', conditions: 'test fixture' },
    { id: 'test-window', family: 'Test window', variant: '', surfaces: ['opening'], opening: 'window', category: 'Test fixtures', alpha: [0.35, 0.25, 0.18, 0.12, 0.07, 0.04], source: 'test', quality: 'compilation', conditions: 'test fixture' },
  ];
  const surfacesAll = id => Object.fromEntries(AM.demo.SURFACE_KEYS.map(k => [k, Object.assign(AM.demo.blankSurface(), { material: id })]));
  const box = (L, W, H, surfaces) => Object.assign(AM.demo.demoRoom(), { L, W, H, surfaces: surfaces || AM.demo.blankSurfaces() });

  async function run() {
    await window.APP_READY;
    await until(() => AM.store && AM.store.state && AM.services.surfaces && AM.app, 'the app');
    const S = AM.store, W = AM.workflow, SF = AM.services.surfaces, D = AM.derive, A = AM.acoustics, B = AM.demo.BANDS, P = AM.services.prediction;
    const DATA = AM.materialData, CAT = AM.services.catalog, TGT = AM.services.target;
    // A catalogue product with a complete tested configuration, for the treatment checks.
    const product = CAT.getProducts().find(q => q.size.options.some(o => o.areaM2 > 0) && CAT.getAcousticConfigurations(q.id).some(c => !CAT.getOctaveAbsorption(c.id, B).missing.length));
    const cfg = CAT.getAcousticConfigurations(product.id).find(c => !CAT.getOctaveAbsorption(c.id, B).missing.length);
    const sizeIndex = product.size.options.findIndex(o => o.areaM2 > 0), size = product.size.options[sizeIndex];
    const item = (placement, quantity = 5) => ({ id: 'i1', productId: product.id, configurationId: cfg.id, size: String(sizeIndex), quantity, placement });

    /* ===== 1. the material library ===== */
    status('Library…');
    {
      const M = DATA.MATERIALS, ids = M.map(m => m.id), kinds = ['wall', 'floor', 'ceiling', 'opening'];
      const bad = M.filter(m => !m.id || !m.family || !m.category || !Array.isArray(m.surfaces) || !m.surfaces.length || m.surfaces.some(s => !kinds.includes(s))
        || !Array.isArray(m.alpha) || m.alpha.length !== B.length || m.alpha.some(v => v !== null && !(typeof v === 'number' && v >= 0)) || !DATA.CLASSES[m.quality] || !m.conditions);
      check('Library: every material has an id, family, category, surfaces, a class, its conditions and α at all six bands (a number, or null where the source has none)',
        M.length > 0 && !bad.length && new Set(ids).size === ids.length, `${M.length} materials, ${new Set(ids).size} distinct ids${bad.length ? `; incomplete: ${bad.map(m => m.id).join(', ')}` : ''}`);
      const unsourced = M.filter(m => { const s = DATA.SOURCES[m.source]; return !s || !s.title || !s.short || !/^https?:\/\//.test(s.url || ''); });
      check('Library: every material names a source with a title and a link', !unsourced.length, unsourced.length ? unsourced.map(m => m.id).join(', ') : `${Object.keys(DATA.SOURCES).length} sources`);
      // A 0 is allowed only as a manufacturer's practical coefficient αp, which rounds a small measured value to 0.00.
      const zero = M.filter(m => m.quality !== 'manufacturer' && m.alpha.some(v => v === 0));
      const mz = M.filter(m => m.quality === 'manufacturer' && m.alpha.some(v => v === 0));
      check('Library: no α is 0 in place of a missing value (a band a source does not give is null); only a tested αp can be 0.00',
        !zero.length && mz.every(m => /αp|αS|alpha = αp/.test(m.notes || '')), zero.length ? `0 in: ${zero.map(m => m.id).join(', ')}` : `none; tested αp 0.00 in ${mz.length}`);
      const per = Object.fromEntries(kinds.map(k => [k, M.filter(m => m.surfaces.includes(k)).length]));
      const cats = Object.fromEntries(kinds.map(k => [k, SF.materialsFor(k).map(g => g.category)]));
      check('Library: materials for walls, floors, ceilings and openings, in categories', kinds.every(k => per[k] > 0) && ['wall', 'floor', 'ceiling'].every(k => cats[k].length >= 2),
        kinds.map(k => `${k}: ${per[k]} in ${cats[k].length} categories`).join(' · '));
      const op = k => M.filter(m => m.surfaces.includes('opening') && m.opening === k);
      const open = op('opening')[0];
      check('Library: doors, windows and an open doorway; the open doorway absorbs everything by definition (α 1.00, class "definition")',
        op('door').length && op('window').length && open && open.quality === 'definition' && open.alpha.every(v => v === 1),
        `doors ${op('door').length}, windows ${op('window').length}, open: ${open ? open.alpha.join('/') : 'none'}`);
      const demo = AM.demo.demoRoom(), demoIds = SF.SURFACES.flatMap(d => [demo.surfaces[d.key].material, ...demo.surfaces[d.key].openings.map(o => o.material)]);
      check('The sample room (Developer tools) uses library materials only, on all six surfaces', demoIds.every(id => SF.material(id)) && SF.finishes(demo).chosen === 6,
        demoIds.filter(id => !SF.material(id)).join(', ') || 'all found');
      const legacyBad = Object.entries(DATA.LEGACY).flatMap(([field, map]) => Object.entries(map).filter(([, id]) => { const m = SF.material(id); return !m || !m.surfaces.includes(field === 'walls' ? 'wall' : field); }).map(([v, id]) => `${field} ${v} → ${id}`));
      const ambiguous = [['walls', 'Plasterboard + glass'], ['floor', 'Carpet'], ['ceiling', 'Acoustic tile'], ['ceiling', 'Exposed structure']].filter(([f, v]) => DATA.LEGACY[f] && DATA.LEGACY[f][v]);
      check('Earlier single choices map only to a library material for that surface, and choices that do not name one material are not mapped',
        !legacyBad.length && !ambiguous.length, `mapped: ${Object.entries(DATA.LEGACY).map(([f, m]) => `${f} ${Object.keys(m).join('/') || '—'}`).join(' · ')}`);
    }

    // The fixtures, for the hand calculations.
    DATA.SOURCES.test = { title: 'Test fixture', short: 'Test', url: 'https://example.invalid/test', type: 'test' };
    FIXTURES.forEach(m => DATA.MATERIALS.push(m));
    try {
      /* ===== 2. no untreated-room prediction ===== */
      status('No untreated-room prediction…');
      {
        check('No untreated-room prediction in the code: no room model service, no RT60 or absorption-total function on the surfaces, no room prediction in derive',
          AM.services.roomModel === undefined && !['predict', 'withTreatment'].some(k => k in SF) && !['roomPrediction', 'roomTreatment'].some(k => k in D),
          `services: ${Object.keys(AM.services).join(', ')} · surfaces: ${Object.keys(SF).join(', ')}`);
        const m = SF.surfaceModel(box(10, 6, 3, surfacesAll('test-hard')), 'wall1');
        check('A surface is described by its areas, parts and materials only: no absorption total, no RT60',
          !['A', 'missing', 'rt60', 'bands', 'headline', 'V'].some(k => k in m) && m.grossM2 === 30, Object.keys(m).join(', '));
        // Every script the app loads: nothing that calculates, shows or reports an untreated-room RT60.
        const html = await (await fetch('index.html', { cache: 'no-store' })).text();
        const srcs = [...html.matchAll(/<script src="([^"]+)"/g)].map(x => x[1]);
        const words = [/roomPrediction/, /roomTreatment/, /withTreatment/, /roomModel/, /room-model\.js/, /predicted existing/i, /room model/i, /RT60 of the room as built/i];
        const hits = [];
        for (const f of srcs) { const t = await (await fetch(f, { cache: 'no-store' })).text(); words.forEach(rx => { if (rx.test(t)) hits.push(`${f}: ${rx}`); }); }
        check(`None of the app's ${srcs.length} scripts calculates, shows or reports a predicted untreated-room RT60 ("room model", "predicted existing", "as built", room prediction)`,
          srcs.length > 30 && !hits.length, hits.length ? hits.join(', ') : `${srcs.length} scripts scanned`);
        // A room described completely, a target and a treatment chosen, but no measurement: no RT60 at all.
        const proj0 = { id: 'nm', room: Object.assign(AM.demo.demoRoom(), { L: 10, W: 6, H: 3 }), target: { preferred: 0.45, min: 0.36, max: 0.54, source: 'recommended' },
          completed: [], review: [], processing: { result: null, attempt: null, history: [] }, measurement: { recording: null }, treatment: { items: [item('Walls', 10)], active: 'i1' } };
        check('Every surface described, a target and a treatment chosen, but no measurement: no RT60 is predicted, measured or assessed',
          SF.finishes(proj0.room).chosen === 6 && D.measured(proj0) === null && D.prediction(proj0) === null && D.assessment(proj0) === null,
          `surfaces ${SF.finishes(proj0.room).chosen}/6; prediction ${D.prediction(proj0)}, assessment ${D.assessment(proj0)}`);
      }

      /* ===== 3. geometry ===== */
      status('Geometry…');
      {
        // Wall 1 = Wall 3 = L × H, Wall 2 = Wall 4 = W × H, floor = ceiling = L × W; total 2 (LW + LH + WH).
        //   10 × 6 × 3:      30, 18, 30, 18, 60, 60;          total 2 (60 + 30 + 18) = 216
        //   4.2 × 3.5 × 2.7: 11.34, 9.45, 11.34, 9.45, 14.7, 14.7; total 2 (14.7 + 11.34 + 9.45) = 70.98
        //   25 × 18 × 8:     200, 144, 200, 144, 450, 450;    total 2 (450 + 200 + 144) = 1588
        const cases = [[[10, 6, 3], [30, 18, 30, 18, 60, 60], 216], [[4.2, 3.5, 2.7], [11.34, 9.45, 11.34, 9.45, 14.7, 14.7], 70.98], [[25, 18, 8], [200, 144, 200, 144, 450, 450], 1588]];
        const got = cases.map(([dd, exp, tot]) => {
          const r = box(...dd), areas = SF.SURFACES.map(s => SF.surfaceModel(r, s.key).grossM2), sum = areas.reduce((s, x) => s + x, 0);
          return { dd, ok: areas.every((a, i) => close(a, exp[i], 1e-9)) && close(sum, tot, 1e-9) && close(sum, A.geometry(r).total, 1e-9), areas, sum };
        });
        check('Six areas: walls 1 and 3 length × height, walls 2 and 4 width × height, floor and ceiling length × width; they add up to the room\'s surface',
          got.every(x => x.ok), got.map(x => `${x.dd.join(' × ')}: ${x.areas.map(a => +a.toFixed(4)).join(', ')} = ${+x.sum.toFixed(4)} m²`).join(' · '));

        // Wall 1 of 10 × 6 × 3 (30 m²): two doors 0.9 × 2.1 = 3.78 m², one window 2.0 × 1.2 = 2.4 m² → openings 6.18 m²,
        // solid 23.82 m²; 25 % covered → 5.955 m², finish 17.865 m². Parts add up to 30 m².
        const r = box(10, 6, 3, surfacesAll('test-hard'));
        Object.assign(r.surfaces.wall1, { cover: { material: 'test-soft', pct: 25 }, openings: [
          { id: 'o1', kind: 'door', material: 'test-door', widthM: 0.9, heightM: 2.1, count: 2 },
          { id: 'o2', kind: 'window', material: 'test-window', widthM: 2.0, heightM: 1.2, count: 1 }] });
        const w1 = SF.surfaceModel(r, 'wall1'), parts = w1.parts.reduce((s, p) => s + p.areaM2, 0);
        check('Wall 1 with two doors, a window and 25 % covered: openings 6.18 m², solid 23.82 m², covered 5.955 m², finish 17.865 m², parts = 30 m²',
          close(w1.openingsM2, 6.18) && close(w1.solidM2, 23.82) && close(w1.coverM2, 5.955) && close(w1.finishM2, 17.865) && close(parts, 30) && !w1.problems.length,
          `parts ${w1.parts.map(p => `${p.role} ${+p.areaM2.toFixed(4)}`).join(' + ')} = ${+parts.toFixed(6)}`);
        r.surfaces.wall2.openings = [{ id: 'o1', kind: 'opening', material: 'test-door', widthM: 5, heightM: 4, count: 1 }];
        r.surfaces.wall2.cover = { material: 'test-soft', pct: 40 };
        const w2 = SF.surfaceModel(r, 'wall2'), neg = w2.parts.some(p => p.areaM2 < 0) || [w2.solidM2, w2.coverM2, w2.finishM2].some(x => x < 0);
        check('Openings larger than the wall: counted up to the wall (18 of 20 m²), nothing negative, and reported',
          close(w2.openingsM2, 18) && w2.solidM2 === 0 && w2.coverM2 === 0 && w2.finishM2 === 0 && !neg && w2.problems.some(x => /more than the wall/.test(x)), w2.problems.join(' '));
        r.surfaces.wall3.openings = [{ id: 'o1', kind: 'door', material: 'test-door', widthM: null, heightM: 2.1, count: 1 }];
        r.surfaces.wall3.cover = { material: 'test-soft', pct: 150 };
        r.surfaces.wall4.cover = { material: 'test-soft', pct: -10 };
        const w3 = SF.surfaceModel(r, 'wall3'), w4 = SF.surfaceModel(r, 'wall4');
        check('Invalid entries: an opening without a width is not counted; a covering of 150 % counts as 100 %, of −10 % as 0 %; each is reported',
          w3.openingsM2 === 0 && close(w3.coverM2, 30) && w3.finishM2 === 0 && w3.problems.length === 2 && w4.coverM2 === 0 && close(w4.finishM2, 18) && w4.problems.length === 1,
          `${w3.problems.join(' ')} · ${w4.problems.join(' ')}`);
        r.surfaces.floor.openings = [{ id: 'o1', kind: 'door', material: 'test-door', widthM: 1, heightM: 1, count: 1 }];
        const fl = SF.surfaceModel(r, 'floor');
        check('Floor and ceiling have no openings: one stored there is not counted', fl.openingsM2 === 0 && close(fl.finishM2, 60), `floor openings ${fl.openingsM2}, finish ${fl.finishM2}`);
        const nos = [box(null, 6, 3, surfacesAll('test-hard')), box(10, 0, 3, surfacesAll('test-hard')), box(10, 6, -3, surfacesAll('test-hard'))];
        check('Missing or invalid room size: no areas and no parts', nos.every(x => SF.SURFACES.every(s => { const m = SF.surfaceModel(x, s.key); return m.grossM2 == null && !m.parts.length; })), 'all six surfaces, three rooms');
      }

      /* ===== 4. what a treatment covers ===== */
      status('What a treatment covers…');
      {
        // 10 × 6 × 3, every finish α 0.10: the four walls are 96 m² of free finish at α 0.10.
        const r = box(10, 6, 3, surfacesAll('test-hard'));
        const walls = SF.coveredBy(r, 'Walls');
        check('A product on the walls covers 96 m² of finish at α 0.10 (area-weighted over the four walls)',
          walls.known && close(walls.freeM2, 96) && B.every(f => close(walls.alpha[f], 0.1, 1e-12)), `free ${walls.freeM2} m², α ${B.map(f => walls.alpha[f]).join('/')}`);
        // Wall 1 with a door 1.89 m² and half of the remaining 28.11 m² covered: free finish 14.055 m², α 0.10.
        Object.assign(r.surfaces.wall1, { cover: { material: 'test-soft', pct: 50 }, openings: [{ id: 'o1', kind: 'door', material: 'test-door', widthM: 0.9, heightM: 2.1, count: 1 }] });
        const cb = SF.coveredBy(r, 'Wall 1');
        check('Only the free finish can be covered: Wall 1 with a door and half covered has 14.055 m² free, at the finish\'s α 0.10 (not the door\'s, not the covering\'s)',
          close(cb.freeM2, 14.055) && close(cb.alpha[1000], 0.1, 1e-12) && cb.known, `free ${cb.freeM2} m², α ${cb.alpha[1000]}`);
        // Mixed walls: Wall 1 and Wall 3 (30 m² each) α 0.10, Wall 2 and Wall 4 (18 m² each) α 0.05 → (60 × 0.10 + 36 × 0.05) / 96 = 7.8 / 96 = 0.08125.
        const r2 = box(10, 6, 3, surfacesAll('test-hard'));
        r2.surfaces.wall2.material = r2.surfaces.wall4.material = 'test-mid';
        const mix = SF.coveredBy(r2, 'Walls');
        check('Several surfaces covered together: their finish α weighted by area, (60 × 0.10 + 36 × 0.05) / 96 = 0.08125', close(mix.alpha[1000], 7.8 / 96, 1e-12), `α ${mix.alpha[1000]}`);
        const r3 = box(10, 6, 3, surfacesAll('test-hard'));
        r3.surfaces.ceiling.material = 'test-gap';
        r3.surfaces.wall2.material = '';
        r3.surfaces.wall4.material = 'no-such-material';
        const g = SF.coveredBy(r3, 'Ceiling'), w = SF.coveredBy(r3, 'Wall 2'), u = SF.coveredBy(r3, 'Wall 4');
        check('Missing data is named, never 0: a finish without a value at 125 Hz, a wall without a material, a material not in the library',
          !g.known && g.alpha[125] === null && close(g.alpha[250], 0.3) && /Ceiling: no value at 125 Hz/.test(g.why) && !w.known && /Wall 2: no material chosen/.test(w.why) && !u.known && /Wall 4: the material is not in the library/.test(u.why),
          `${g.why} · ${w.why} · ${u.why}`);
        const r4 = box(10, 6, 3, surfacesAll('test-hard'));
        r4.surfaces.wall1.cover = { material: '', pct: 50 };
        r4.surfaces.wall3.cover = { material: 'test-soft', pct: null };
        check('A covering without a material, or without its share, is reported on its surface',
          SF.surfaceModel(r4, 'wall3').problems.some(x => /Enter how much of Wall 3 is covered/.test(x)) && SF.surfaceModel(r4, 'wall1').parts.some(p => p.role === 'cover' && p.materialId === ''),
          SF.surfaceModel(r4, 'wall3').problems.join(' '));
        let nosize = null, err = '';
        try { nosize = SF.coveredBy(box(null, null, null, surfacesAll('test-hard')), 'Walls'); } catch (e) { err = e.message; }
        check('Before the room size is entered: not known, with the reason (no error)', nosize && !nosize.known && nosize.freeM2 === 0 && /no free surface/.test(nosize.why), nosize ? nosize.why : err);
      }

      /* ===== 4b. a wall in sections (26 October 2026) ===== */
      status('A wall in sections…');
      {
        // 10 × 6 × 3, every finish α 0.10. Wall 1 (10 × 3 m) from its left end: 2.5 m of glass (test-mid, α 0.05), 3 m of
        // acoustic panels already fitted (test-soft), and its own finish in the 4.5 m left. A door 0.9 × 2.1 = 1.89 m²;
        // the solid 28.11 m² is shared by width: glass × 0.25 = 7.0275, panels × 0.3 = 8.433, the rest × 0.45 = 12.6495 m².
        // Free for treatment: 7.0275 + 12.6495 = 19.677 m² (not the fitted panels), at (12.6495 × 0.10 + 7.0275 × 0.05) /
        // 19.677 = 1.616325 / 19.677 = (0.45 × 0.10 + 0.25 × 0.05) / 0.7 = 0.0575 / 0.7 = 0.0821428…
        const r = box(10, 6, 3, surfacesAll('test-hard'));
        Object.assign(r.surfaces.wall1, { openings: [{ id: 'o1', kind: 'door', material: 'test-door', widthM: 0.9, heightM: 2.1, count: 1 }],
          sections: [{ id: 's1', type: 'glass', material: 'test-mid', widthM: 2.5 }, { id: 's2', type: 'acoustic-panels', material: 'test-soft', widthM: 3 }] });
        const m = SF.surfaceModel(r, 'wall1'), secs = m.parts.filter(x => x.role === 'section'), fin = m.parts.find(x => x.role === 'finish'), sum = m.parts.reduce((s, x) => s + x.areaM2, 0);
        check('Wall 1 in three parts: 2.5 m of glass 7.0275 m², 3 m of fitted panels 8.433 m², the 4.5 m left 12.6495 m², the door 1.89 m²; together 30 m²; free for treatment 19.677 m² (not the fitted panels)',
          secs.length === 2 && close(secs[0].areaM2, 7.0275) && close(secs[1].areaM2, 8.433) && close(fin.areaM2, 12.6495) && close(sum, 30) && close(m.availableM2, 19.677) && secs[0].free && !secs[1].free && !m.problems.length,
          m.parts.map(x => `${x.role} ${+x.areaM2.toFixed(4)}`).join(' + '));
        const cb = SF.coveredBy(r, 'Wall 1');
        check('A product on Wall 1 covers its free parts, area-weighted: 19.677 m² at 0.0575 / 0.7 = 0.0821428… in every band',
          cb.known && close(cb.freeM2, 19.677) && B.every(f => close(cb.alpha[f], 0.0575 / 0.7, 1e-12)), `free ${cb.freeM2} m², α ${cb.alpha[1000]}`);
        check('The room\'s free wall area counts the free parts only: 19.677 + 18 + 30 + 18 = 85.677 m²', close(SF.totals(r).wallAvailableM2, 85.677), SF.totals(r).wallAvailableM2);
        const line = SF.describe(r).find(x => x.key === 'wall1');
        check('Wall 1 described with its sections: "Test hard, 2.5 m glass wall or glass partition, 3 m acoustic panels (already fitted), 1 opening"',
          line.text === 'Test hard, 2.5 m glass wall or glass partition, 3 m acoustic panels (already fitted), 1 opening', line.text);
        r.surfaces.wall1.sections[0].material = 'test-gap';
        const gap = SF.coveredBy(r, 'Wall 1');
        check('A free section without a value is named, never 0: "Wall 1, section 1: no value at 125 Hz"; 250 Hz (0.45 × 0.10 + 0.25 × 0.30) / 0.7 = 0.1714…',
          !gap.known && gap.alpha[125] === null && /Wall 1, section 1: no value at 125 Hz/.test(gap.why) && close(gap.alpha[250], 0.12 / 0.7, 1e-12), `${gap.why}; α250 ${gap.alpha[250]}`);
        // Sections wider than the wall: 6 m + 6 m on 10 m → 6 m and the 4 m left (18 + 12 m²), none for the wall's own type.
        const r2 = box(10, 6, 3, surfacesAll('test-hard'));
        r2.surfaces.wall1.sections = [{ id: 's1', type: 'glass', material: 'test-mid', widthM: 6 }, { id: 's2', type: 'glass', material: 'test-mid', widthM: 6 }];
        const m2 = SF.surfaceModel(r2, 'wall1'), s2 = m2.parts.filter(x => x.role === 'section');
        check('Sections wider than the wall: counted up to it (6 m and the 4 m left, 18 + 12 m², nothing for the wall\'s own type), nothing negative, and reported',
          close(s2[0].areaM2, 18) && close(s2[1].areaM2, 12) && close(s2[1].widthM, 4) && close(m2.parts.find(x => x.role === 'finish').areaM2, 0) && m2.parts.every(x => x.areaM2 >= 0)
            && m2.problems.some(x => /add up to more than the wall \(12\.00 of 10\.00 m\)/.test(x)), m2.problems.join(' '));
        r2.surfaces.wall1.sections = [{ id: 's1', type: 'glass', material: 'test-mid', widthM: null }];
        const m3 = SF.surfaceModel(r2, 'wall1');
        check('A section without its width is not counted and is asked for; the wall\'s own type keeps all 30 m²',
          close(m3.parts.find(x => x.role === 'finish').areaM2, 30) && !m3.parts.some(x => x.role === 'section') && m3.problems.some(x => /section 1: enter its width/.test(x)), m3.problems.join(' '));
        r2.surfaces.wall1.sections = [{ id: 's1', type: 'glass', material: 'test-mid', widthM: 0 }];
        check('A section 0 m wide stops the step, with its reason', W.get('room').model.surfaceErrors(r2).some(x => /Wall 1: a section must be more than 0 m wide/.test(x)), W.get('room').model.surfaceErrors(r2).join(' '));
        // A wall saved before sections existed, or with none left, has one finish part of the whole solid area.
        const r3 = box(10, 6, 3, surfacesAll('test-hard')), r4 = box(10, 6, 3, surfacesAll('test-hard'));
        r4.surfaces.wall1.sections = [];
        const old = SF.surfaceModel(r3, 'wall1');
        check('A wall without sections: one finish part of all 30 m², free 30 m², the same with an empty list',
          old.parts.length === 1 && old.parts[0].role === 'finish' && close(old.availableM2, 30) && json(old) === json(SF.surfaceModel(r4, 'wall1')), old.parts.map(x => `${x.role} ${x.areaM2}`).join(', '));
      }

      /* ===== 5. the six surfaces are independent ===== */
      status('Independent surfaces…');
      S.startProject('new');
      S.autofillTo('room');
      const p = S.state.project;
      S.set('room', Object.assign(copy(p.room), { L: 10, W: 6, H: 3, surfaces: AM.demo.blankSurfaces() }));
      const act = W.get('room').actions, ctx = () => ({ project: S.state.project, state: S.state });
      const choose = (key, id, part = 'finish') => act.surfaceMaterial(ctx(), id, { dataset: { key, part } });
      const real = kind => SF.materialsFor(kind).flatMap(g => g.items).filter(m => !m.id.startsWith('test-'));
      {
        const four = { wall1: 'test-hard', wall2: 'test-soft', wall3: 'test-mid', wall4: real('wall')[0].id };
        Object.entries(four).forEach(([k, id]) => choose(k, id));
        choose('floor', real('floor')[0].id);
        choose('ceiling', real('ceiling')[0].id);
        const s = p.room.surfaces;
        check('Four walls with four different materials, floor and ceiling their own, all kept',
          Object.entries(four).every(([k, id]) => s[k].material === id) && new Set(['wall1', 'wall2', 'wall3', 'wall4'].map(k => s[k].material)).size === 4 && s.floor.material === real('floor')[0].id && s.ceiling.material === real('ceiling')[0].id,
          SF.SURFACES.map(dd => `${dd.name}: ${s[dd.key].material}`).join(' · '));
        const alt = { wall1: 'test-soft', wall2: 'test-hard', wall3: 'test-soft', wall4: 'test-hard', floor: 'test-mid', ceiling: 'test-soft' };
        const leaks = [];
        AM.demo.SURFACE_KEYS.forEach(k => {
          const before = copy(p.room.surfaces);
          choose(k, alt[k]);
          AM.demo.SURFACE_KEYS.forEach(o => { if (o !== k && json(p.room.surfaces[o]) !== json(before[o])) leaks.push(`${k} → ${o}`); });
          if (p.room.surfaces[k].material !== alt[k]) leaks.push(`${k} not set`);
        });
        check('Changing one surface changes that surface only (each of the six in turn, through the Room step\'s action)', !leaks.length, leaks.length ? leaks.join(', ') : 'no other surface changed');
        const before = copy(p.room.surfaces);
        act.addCover(ctx(), 'wall1');
        choose('wall1', 'test-soft', 'cover');
        act.addOpening(ctx(), 'wall2|door');
        act.addOpening(ctx(), 'wall2|window');
        act.addOpening(ctx(), 'wall2|opening');
        const added = copy(p.room.surfaces.wall2.openings);
        const door = real('opening').find(m => m.opening === 'door');
        choose('wall2', door.id, added[0].id);
        S.set('room.surfaces.wall2.openings.0.widthM', 0.9);
        S.set('room.surfaces.wall2.openings.0.heightM', 2.1);
        const w2o = p.room.surfaces.wall2.openings, open = SF.material(added[2].material);
        const others = ['wall3', 'wall4', 'floor', 'ceiling'].every(k => json(p.room.surfaces[k]) === json(before[k]));
        // Changed 2026-10-20 (everyday types): a new door or window starts as its most common type, shown and changeable on
        // the wall (a wooden door, an ordinary window), with that type's typical data; an opening's data is descriptive only.
        check('Covering and openings through the actions: Wall 1 50 % covered; on Wall 2 a door and a window start as a wooden door and an ordinary window (shown, changeable), an open doorway set by definition; the door sized 0.9 × 2.1 m; other surfaces unchanged',
          p.room.surfaces.wall1.cover.material === 'test-soft' && p.room.surfaces.wall1.cover.pct === 50 && added[0].type === 'wood-door' && added[0].material === 'pra-solid-wooden-door' && added[1].type === 'window' && added[1].material === 'hall-ordinary-window-glass' && open && open.quality === 'definition'
            && w2o.length === 3 && w2o[0].material === door.id && w2o[0].widthM === 0.9 && w2o[0].heightM === 2.1 && others,
          `added ${added.map(o => `${o.kind}: "${o.material}"`).join(', ')}`);
        act.removeOpening(ctx(), `wall2|${w2o[2].id}`);
        act.removeOpening(ctx(), `wall2|${w2o[1].id}`);
        check('Openings removed: the other stays', p.room.surfaces.wall2.openings.length === 1 && p.room.surfaces.wall2.openings[0].kind === 'door', json(p.room.surfaces.wall2.openings));
      }

      /* ===== 6. saved and restored ===== */
      status('Save and restore…');
      {
        const saved = JSON.parse(localStorage.getItem(PKEY(p.id)) || 'null');
        check('The surfaces are saved with the project, exactly as entered', saved && json(saved.room.surfaces) === json(p.room.surfaces) && Object.keys(saved.room.surfaces).length === 6, 'saved');
        const id = p.id, snap = json(p.room.surfaces);
        S.closeProject();
        S.openProject(id);
        check('Closed and reopened from history: the same surfaces', S.state.project && S.state.project.id === id && json(S.state.project.room.surfaces) === snap, 'reopened');
      }

      /* ===== 7. the screen ===== */
      status('Screen…');
      {
        S.set('room.surfaces.ceiling.material', '');
        S.go('room');
        await sleep(100);
        const app = document.getElementById('app');
        const cards = [...app.querySelectorAll('.surf')];
        check('The Room step shows six surface cards, each with its name, area and material select',
          cards.length === 6 && SF.SURFACES.every(dd => { const c = app.querySelector(`#surf-card-${dd.key}`); return c && c.textContent.includes(dd.name) && c.querySelector(`#surf-${dd.key}`) && /m²/.test(c.querySelector('.surf-area').textContent); }),
          cards.map(c => `${c.querySelector('b').textContent} ${c.querySelector('.surf-area').textContent.trim()}`).join(' · '));
        const described = () => (app.textContent.match(/Surfaces described\s*(\d) of 6/) || [])[1];
        // The step's own content (the app's rail and top bar name the later "Predicted Result" step and its value).
        const roomText = () => { const body = app.querySelector('#surf-card-wall1').closest('.grid.split'); return body ? body.textContent.replace(/\s+/g, ' ') : ''; };
        check('The Room step shows no predicted RT60: no "predicted", no "room model", no "as built", and no data-watch for one',
          roomText().length > 500 && !/predicted|room model|as built/i.test(roomText()) && !app.querySelector('[data-watch="room-model"]'), `surfaces described: ${described()} of 6`);
        const d0 = described();
        const sel = app.querySelector('#surf-ceiling'), opt = [...sel.options].find(o => o.value && !o.value.startsWith('test-'));
        sel.value = opt.value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(60);
        const card = app.querySelector('#surf-card-ceiling').textContent;
        const src = SF.sourceOf(SF.material(opt.value));
        check('Choosing a ceiling material in the select updates the screen at once: its data and source on the card, "Surfaces described" 5 → 6; still no predicted RT60',
          S.state.project.room.surfaces.ceiling.material === opt.value && d0 === '5' && described() === '6' && src && card.includes(src.short) && !/predicted|room model/i.test(roomText()),
          `select → ${opt.value}; described ${d0} → ${described()}`);
        const L = app.querySelector('#room-L');
        L.value = '12';
        L.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(60);
        const area = k => app.querySelector(`#surf-card-${k} .surf-area`).textContent;
        const fmt = AM.util.fmt;
        check('Typing a new length (12 m) updates Wall 1 to 36 m² and the floor to 72 m²; Wall 2 stays 18 m²',
          area('wall1').startsWith(fmt.m2(36)) && area('floor').startsWith(fmt.m2(72)) && area('wall2').startsWith(fmt.m2(18)), `Wall 1 ${area('wall1')} · floor ${area('floor')} · Wall 2 ${area('wall2')}`);
        app.querySelector('#surf-card-wall3 [data-action="addOpening"][data-value="wall3|window"]').click();
        await sleep(60);
        const w3 = S.state.project.room.surfaces.wall3.openings;
        check('The "Window" button on Wall 3 adds a window there, with its size fields, and asks for its size', w3.length === 1 && w3[0].kind === 'window' && !!app.querySelector(`#surf-wall3-o${w3[0].id}-w`)
          && /Window on Wall 3 needs a width and a height/.test(app.querySelector('#surf-card-wall3').textContent), json(w3));
        const L2 = app.querySelector('#room-L'); // the step has been drawn again since
        L2.value = '10';
        L2.dispatchEvent(new Event('input', { bubbles: true }));
        act.removeOpening(ctx(), `wall3|${w3[0].id}`);
        check('Length back to 10 m: Wall 1 30 m² again', S.state.project.room.L === 10 && SF.surfaceModel(S.state.project.room, 'wall1').grossM2 === 30, `L ${S.state.project.room.L} m`);

        // A wall in sections, and its doors and windows, on the screen (26 October 2026). Wall 1 is put back afterwards.
        const keep = copy(S.state.project.room.surfaces.wall1), w1 = () => S.state.project.room.surfaces.wall1, q = sel => app.querySelector(sel);
        const pick = (sel, v) => { const el = q(sel); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
        pick('#surf-wall1-part-main', 'gypsum-partition');
        await sleep(60);
        q('#surf-card-wall1 [data-action="addSection"]').click();
        await sleep(60);
        const sid = w1().sections && w1().sections[0] && w1().sections[0].id;
        check('Wall 1 chosen as a gypsum board partition in its row, then "Split the wall": a section of the same type, half of the 10 m (5 m), with its own row',
          w1().type === 'gypsum-partition' && w1().sections.length === 1 && w1().sections[0].type === 'gypsum-partition' && w1().sections[0].material === w1().material && w1().sections[0].widthM === 5 && !!q(`#surf-wall1-part-${sid}`),
          json(w1().sections));
        pick(`#surf-wall1-part-${sid}`, 'glass');
        await sleep(60);
        const wIn = q(`#surf-wall1-sec-${sid}-w`);
        wIn.value = '2.4';
        wIn.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(60);
        q('#surf-wall1-door-more').click(); await sleep(40);
        q('#surf-wall1-door-more').click(); await sleep(40);
        q('#surf-wall1-door-less').click(); await sleep(40);
        q('#surf-wall1-window-more').click(); await sleep(60);
        // 30 m² less a door 0.9 × 2.1 = 1.89 m² and a window 1.2 × 1.2 = 1.44 m²: solid 26.67 m²; Wall 1 is still 50 %
        // covered (5 above): 13.335 m² covered, 13.335 m² left, shared by width: the glass 2.4 m of 10 m 13.335 × 0.24 =
        // 3.2004 m². Glass is not fitted treatment, so all 13.335 m² left stay free.
        const mm = SF.surfaceModel(S.state.project.room, 'wall1'), glass = mm.parts.find(x => x.role === 'section'), ops = w1().openings || [];
        const strip = q('#surf-card-wall1 svg.wstrip');
        check('Section 1 made glass and 2.4 m wide; doors +, +, − and windows +: one door 0.9 × 2.1 m and one window 1.2 × 1.2 m (standard sizes); glass 3.2004 m², all 13.335 m² left free; the strip shows both parts, the door and the window',
          w1().sections[0].type === 'glass' && w1().sections[0].material === 'hall-heavy-plate-glass' && w1().sections[0].widthM === 2.4 && ops.length === 2
            && ops.some(o => o.kind === 'door' && o.widthM === 0.9 && o.heightM === 2.1 && o.type === 'wood-door') && ops.some(o => o.kind === 'window' && o.widthM === 1.2 && o.heightM === 1.2)
            && close(glass.areaM2, 3.2004) && close(mm.availableM2, 13.335) && close(mm.coverM2, 13.335) && strip && strip.querySelectorAll('.wstrip-part').length === 2 && strip.querySelectorAll('.wstrip-door').length === 1 && strip.querySelectorAll('.wstrip-window').length === 1
            && q('#surf-card-wall1 output[aria-label="Doors on Wall 1"]').textContent === '1',
          `${json(w1().sections)} · ${ops.map(o => `${o.kind} ${o.widthM}×${o.heightM}`).join(', ')} · free ${mm.availableM2}`);
        q(`#surf-card-wall1 [data-action="removeSection"][data-value="wall1|${sid}"]`).click();
        await sleep(60);
        check('Section removed: Wall 1 is one gypsum board partition again, its doors and windows kept', !w1().sections.length && w1().type === 'gypsum-partition' && w1().openings.length === 2, json(w1().sections));
        S.set('room.surfaces.wall1', keep);
        await sleep(40);
      }

      /* ===== 8. treatment from the measured room ===== */
      status('Treatment…');
      {
        // V 189 m³, measured 0.7 s at 1 kHz → A0 = 30.429 / 0.7 = 43.47 m². 10 m² of α 0.80 over a finish of α 0.10:
        // ΔA = 10 × (0.80 − 0.10) = 7 m² (the 10 m² of finish it covers was already in A0); RT60 = 30.429 / 50.47 = 0.60292 s.
        const bands = [{ f: 1000, rt60: 0.7 }];
        const net = P.predict({ V: 189, bands, treatment: { items: [{ areaM2: 10, alpha: { 1000: 0.8 }, coveredAlpha: { 1000: 0.1 } }] }, referenceBand: 1000 }).headline;
        const raw = P.predict({ V: 189, bands, treatment: { items: [{ areaM2: 10, alpha: { 1000: 0.8 } }] }, referenceBand: 1000 }).headline;
        check('From the measured room, a product over a known finish: A0 = 43.47 m², ΔA = 10 × (0.80 − 0.10) = 7 m², RT60 0.6029 s; without a known finish ΔA = 8 m², marked as such',
          close(net.existingA, 43.47) && close(net.addedA, 7) && close(net.predicted, 30.429 / 50.47, 1e-9) && net.items[0].coveredKnown === true && close(raw.addedA, 8) && raw.items[0].coveredKnown === false,
          `known: ΔA ${net.addedA}, RT60 ${net.predicted.toFixed(5)} s · unknown: ΔA ${raw.addedA}`);

        // Through the app: 9 × 7 × 3 m, all surfaces α 0.10; 5 panels on the walls. ΔA = area × (α − 0.10).
        const rts = { 125: 0.9, 250: 0.8, 500: 0.75, 1000: 0.7, 2000: 0.65, 4000: 0.6 };
        const proj = (room, placement = 'Walls') => ({ id: 'calc', room, completed: [], review: [],
          processing: { result: { valid: true, referenceBand: 1000, headline: { f: 1000, rt60: 0.7 }, bands: B.map(f => ({ f, rt60: rts[f], path: 'T30', quality: 'Good' })) } }, // as a processed band (path, quality)
          treatment: { items: [item(placement)], active: 'i1' } });
        const alpha = CAT.getOctaveAbsorption(cfg.id, [1000]).values[1000], area = 5 * size.areaM2;
        const known = D.prediction(proj(box(9, 7, 3, surfacesAll('test-hard')))), unknown = D.prediction(proj(box(9, 7, 3)));
        check('The app\'s prediction with the walls described: 0.161 V / (A0 + area × (α − α of the walls)); with the walls not described, area × α and marked',
          known && close(known.headline.predicted, 30.429 / (43.47 + area * (alpha - 0.10)), 1e-9) && close(known.headline.items[0].coveredAlpha, 0.1, 1e-12)
            && unknown && close(unknown.headline.predicted, 30.429 / (43.47 + area * alpha), 1e-9) && unknown.headline.items[0].coveredKnown === false,
          `${product.name}: ${area} m², α ${alpha}; known → ${known && known.headline.predicted.toFixed(4)} s, unknown → ${unknown && unknown.headline.predicted.toFixed(4)} s`);
        // The surfaces enter only through what is covered: a product on the ceiling gives the same prediction whatever the walls are.
        const hardWalls = box(9, 7, 3, surfacesAll('test-hard')), softWalls = box(9, 7, 3, surfacesAll('test-soft'));
        softWalls.surfaces.ceiling.material = 'test-hard';
        const pa = D.prediction(proj(hardWalls, 'Ceiling')), pb = D.prediction(proj(softWalls, 'Ceiling'));
        check('The surfaces are used only for what a product covers: a product on the ceiling predicts the same RT60 in every band whether the walls are hard or soft',
          pa && pb && pa.bands.every((b, i) => b.predicted === pb.bands[i].predicted), pa && pb ? pa.bands.map((b, i) => `${b.f}: ${b.predicted && b.predicted.toFixed(4)} / ${pb.bands[i].predicted && pb.bands[i].predicted.toFixed(4)}`).join(' · ') : 'none');

        // The model's assumptions, checked. 10 × 6 × 3 m: V 180 m³, S 216 m²; measured 0.7 s → A0 = 28.98 / 0.7 = 41.4 m² (mean α 0.1917).
        //   40 m² of α 0.90 over α 0.10: ΔA = 32 m² → A = 73.4 m², mean α 73.4 / 216 = 0.3398 > 0.3 → flagged
        //   10 m²: ΔA = 8 m² → A = 49.4 m², mean α 0.2287 → not flagged
        const all = v => Object.fromEntries(B.map(f => [f, v]));
        const b7 = B.map(f => ({ f, rt60: 0.7 }));
        const big = P.predict({ V: 180, S: 216, bands: b7, treatment: { items: [{ areaM2: 40, alpha: all(0.9), coveredAlpha: all(0.1) }] }, referenceBand: 1000 });
        const small = P.predict({ V: 180, S: 216, bands: b7, treatment: { items: [{ areaM2: 10, alpha: all(0.9), coveredAlpha: all(0.1) }] }, referenceBand: 1000 });
        const hi = big.checks.find(c => c.id === 'high-absorption');
        check('The model\'s assumption is checked: 40 m² of α 0.90 raises the average absorption coefficient to 0.34 (above 0.3), and the prediction says Sabine reads long; with 10 m² (0.23) nothing is flagged',
          close(big.headline.meanAlphaBefore, 41.4 / 216, 1e-9) && close(big.headline.meanAlphaAfter, 73.4 / 216, 1e-9) && hi && /0\.34 at 1000 Hz/.test(hi.text) && close(small.headline.meanAlphaAfter, 49.4 / 216, 1e-9) && !small.checks.length,
          hi ? hi.text : 'not flagged');
        // 0.1 s in 180 m³: A0 = 28.98 / 0.1 = 289.8 m², more than the 216 m² of surface → the dimensions or the measurement are wrong.
        const imp = P.predict({ V: 180, S: 216, bands: [{ f: 1000, rt60: 0.1 }], treatment: { items: [{ areaM2: 10, alpha: { 1000: 0.9 } }] }, referenceBand: 1000 });
        const ic = imp.checks.find(c => c.id === 'absorption-exceeds-surface');
        check('A measured RT60 that implies more absorption than the room has surface (0.1 s in 10 × 6 × 3 m: 289.8 m² > 216 m²) is flagged: check the dimensions', !!ic, ic ? ic.text : 'not flagged');
        check('The checks are reported through the app (AM.derive.prediction passes the room\'s surface)', known && Array.isArray(known.checks) && close(known.headline.meanAlphaBefore, 43.47 / 222, 1e-9),
          known ? `mean α before ${known.headline.meanAlphaBefore.toFixed(4)} (S = 222 m²), after ${known.headline.meanAlphaAfter.toFixed(4)}; checks: ${known.checks.length}` : 'none');
      }

      /* ===== 9. the target does not follow the surfaces ===== */
      status('Target…');
      {
        const a = TGT.recommend(box(10, 6, 3, surfacesAll('test-hard'))), b = TGT.recommend(box(10, 6, 3, surfacesAll('test-soft'))), c = TGT.recommend(box(10, 6, 3));
        const t = x => [x.preferred, x.min, x.max, x.criterion && x.criterion.name].join('/');
        check('The recommended target is the same whatever the surfaces are made of', t(a) === t(b) && t(b) === t(c), `${t(a)} · ${t(b)} · ${t(c)}`);
      }

      /* ===== 10. the measurement is isolated ===== */
      status('Measurement isolation…');
      {
        const AN = AM.analysis, PROC = AM.services.processing, FIX = window.FIX;
        const plan = AN.sweepPlan(48000), sweep = AN.makeSweep(plan);
        const ir = FIX.roomIR({ fs: 48000, seconds: 2, rt: [0.62, 0.55, 0.5, 0.45, 0.42, 0.38], seed: 21, directDb: 28 });
        const rec = FIX.recordSweep({ plan, sweep, ir, peakDbfs: -12, noiseDbfs: -65, noiseKind: 'pink', latency: 0.07 });
        const an = AN.analyseTake(rec, plan, sweep);
        const take = { id: 'iso', takenAt: '2026-10-12T09:00:00.000Z', status: 'captured', reason: an.reason || null, deviceLabel: 'Test fixture recording', outputLabel: '', deviceKind: 'computer', position: 'P1',
          sampleRate: plan.fs, settings: {}, plan: Object.assign({}, plan, { levelDb: 0 }), levels: an.levels, waveform: [], analysis: an, warnings: [] };
        const evaluate = () => PROC.evaluate(take, {});
        const p2 = S.state.project;
        const r1 = evaluate();
        S.set('room.surfaces', surfacesAll('test-soft'));
        const r2 = evaluate();
        const same = (a, b) => json(Object.assign({}, a, { processedAt: null })) === json(Object.assign({}, b, { processedAt: null }));
        check('The same recording gives exactly the same result whatever the surfaces are (every band, T20/T30, quality, noise floor; only the processing time differs)',
          r1.valid && same(r1, r2), `RT60 ${r1.headline && r1.headline.rt60} s (${r1.headline && r1.headline.method}); ${r1.bands.map(b => `${b.f}: ${b.rt60}`).join(', ')}`);
        p2.measurement.recording = copy(take);
        p2.processing.result = r1;
        p2.setup.noise = { status: 'valid', takenAt: '2026-10-12T08:59:00.000Z', leqDbfs: -64.8, verdict: 'Suitable' };
        p2.target = { preferred: 0.6, min: 0.48, max: 0.72, source: 'custom', basis: 'Test' };
        p2.completed = W.STAGES.map(s => s.id);
        p2.review = [];
        S.state.current = 'room';
        S.emit();
        const keep = () => json({ setup: p2.setup, measurement: p2.measurement, processing: p2.processing, target: p2.target, measured: D.measured(p2), assessment: D.assessment(p2) });
        const before = keep();
        const ids = { wall1: 'test-hard', wall2: 'test-mid', wall3: 'test-hard', wall4: 'test-mid', floor: 'test-hard', ceiling: 'test-mid' };
        Object.entries(ids).forEach(([k, id]) => choose(k, id));
        act.addCover(ctx(), 'wall2');
        choose('wall2', 'test-soft', 'cover');
        act.addOpening(ctx(), 'wall4|door');
        check('After all six surfaces are changed: the stored measurement, its processing, the noise check, the target and the assessment are exactly as before',
          keep() === before, `measured ${D.measured(p2).headline.rt60} s; assessment ${D.assessment(p2).status}`);
        const flagged = p2.review.slice(), notAllowed = flagged.filter(id => !['treatment', 'prediction', 'final'].includes(id));
        check('Surface changes mark only Treatment, Predicted Result and Final Result for review; never the target, measurement or assessment steps',
          !notAllowed.length && ['treatment', 'prediction', 'final'].every(id => flagged.includes(id)), `marked: ${flagged.join(', ') || 'none'}`);
        const files = ['js/measurement/dsp.js', 'js/measurement/analysis.js', 'js/measurement/audio-io.js', 'js/measurement/live.js', 'js/services/measurement.js', 'js/services/processing.js',
          'js/ui/live-ui.js', 'js/stages/setup.js', 'js/stages/measure.js', 'js/stages/processing.js', 'js/stages/results.js', 'js/stages/assessment.js'];
        const hits = [];
        for (const f of files) { const t = await (await fetch(f, { cache: 'no-store' })).text(); ['services.surfaces', 'materialData', 'room.surfaces', 'roomModel'].forEach(w => { if (t.includes(w)) hits.push(`${f}: ${w}`); }); }
        check('The measurement code (12 files: DSP, analysis, audio, live take, processing, Setup/Measure/Processing/Results/Assessment) does not reference the surfaces or the materials',
          !hits.length, hits.length ? hits.join(', ') : '12 files');
      }
    } finally {
      FIXTURES.forEach(m => { const i = DATA.MATERIALS.indexOf(m); if (i >= 0) DATA.MATERIALS.splice(i, 1); });
      delete DATA.SOURCES.test;
    }

    /* ===== 11. projects saved before the surfaces ===== */
    status('Migration…');
    {
      const L = DATA.LEGACY;
      LEGACY.forEach(l => {
        const pp = S.state.projects.find(x => x.id === l.id), s = pp && pp.room.surfaces;
        const want = (field, keys) => keys.every(k => {
          const id = (L[field] || {})[l[field]];
          return s[k].legacy === l[field] && (id ? s[k].material === id && s[k].origin === 'migrated' : s[k].material === '' && s[k].origin === 'user');
        });
        const ok = pp && s && Object.keys(s).length === 6 && want('walls', ['wall1', 'wall2', 'wall3', 'wall4']) && want('floor', ['floor']) && want('ceiling', ['ceiling'])
          && pp.room.walls === l.walls && pp.room.floor === l.floor && pp.room.ceiling === l.ceiling && pp.room.existing === l.existing
          && pp.target.preferred === 0.6 && pp.target.source === 'custom' && json(pp.completed) === json(['home', 'room', 'target']) && !pp.review.length;
        check(`Project saved before the surfaces (walls "${l.walls}", floor "${l.floor}", ceiling "${l.ceiling}"): six surfaces, a choice naming one material filled in and marked to check, the others left to choose; earlier fields, target and progress kept`,
          ok, s ? SF.SURFACES.map(dd => `${dd.name}: ${s[dd.key].material || '—'} (${s[dd.key].origin})`).join(' · ') : 'not loaded');
      });
      const pa = S.state.projects.find(x => x.id === 'legacy-a');
      S.openProject('legacy-a');
      S.go('room');
      await sleep(80);
      const t = document.getElementById('app').textContent;
      const mappedWalls = !!(L.walls || {})[pa.room.walls];
      check('Its Room step says where each surface came from: filled from the earlier choice (to check), or the earlier entry to choose from',
        (mappedWalls ? /Filled from the earlier single choice “Concrete”/.test(t) : /Earlier entry: “Concrete”/.test(t)) && /Earlier entry: “Carpet”/.test(t) && /Earlier entry for existing treatment: “Some soft furnishings”/.test(t),
        `walls ${mappedWalls ? 'filled' : 'left to choose'}; floor left to choose`);
    }

    /* ===== 12. the report ===== */
    status('Report…');
    {
      const pp = S.state.projects.find(x => x.measurement.recording && x.measurement.recording.id === 'iso');
      S.openProject(pp.id);
      const pick = kind => SF.materialsFor(kind).flatMap(g => g.items)[0].id;
      S.set('room.surfaces', Object.fromEntries(SF.SURFACES.map(dd => [dd.key, Object.assign(SF.blankSurface(), { material: pick(dd.kind) })])));
      S.set('treatment', { items: [Object.assign(item('Walls', 10), { id: 't1' })], active: 't1' });
      const M = AM.report.model(pp), r = pp.processing.result, pred = D.prediction(pp);
      check('Report model: six surfaces described, no untreated-room prediction, the measured RT60 the stored one, the prediction after treatment from the measured room',
        M.surfaces.length === 6 && M.surfaces.every(s => s.chosen) && !('roomModel' in M) && M.measurement && M.measurement.headline.rt60 === r.headline.rt60
          && pred && M.prediction && close(M.prediction.headline.predicted, pred.headline.predicted) && close(pred.headline.existingA, A.absorptionFromRT(A.geometry(pp.room).V, r.headline.rt60)),
        `measured ${M.measurement && M.measurement.headline.rt60} s → predicted after treatment ${pred && pred.headline.predicted.toFixed(3)} s; keys: ${Object.keys(M).join(', ')}`);
      const predText = textOf(W.get('prediction').view({ project: pp, state: S.state }).body);
      check('Predicted Result: the prediction from the measured room with its assumptions, and no room-model comparison',
        /A₀ is the room's equivalent absorption from the measured RT60/.test(predText) && /diffuse/.test(predText) && !/room model|as built|predicted existing/i.test(predText), predText.slice(0, 160));
      let pdf = null, err = '';
      try { pdf = await AM.report.build(pp); } catch (e) { err = e.message; }
      const raw = pdf && pdf.bytes ? Array.from(pdf.bytes, c => String.fromCharCode(c)).join('') : '';
      const txt = [...raw.matchAll(/<([0-9A-F]+)> Tj/g)].map(m => m[1].replace(/../g, h => String.fromCharCode(parseInt(h, 16)))).join(' ').replace(/\s+/g, ' ');
      const has = s => txt.includes(s);
      check('The PDF builds: walls listed in pairs, the prediction after treatment "starting from the measured room", and no room model or predicted existing RT60',
        raw.length > 1000 && has('Walls 1 · 2') && has('Walls 3 · 4') && has('Prediction after treatment') && has('starting from the measured room') && !/room model|predicted existing|as built/i.test(txt) && ![...(pdf.doc.unsupported || [])].length,
        pdf ? `${pdf.bytes.length} bytes, ${pdf.doc.pages.length} pages; unsupported characters: ${[...(pdf.doc.unsupported || [])].join(' ') || 'none'}` : err);
    }

    /* ===== 13. how a product is mounted (Treatment, through its own actions and the screen) ===== */
    status('Mounting…');
    {
      const T = W.get('treatment').actions, tc = () => ({ project: S.state.project, state: S.state });
      const ok = c => !CAT.getOctaveAbsorption(c.id, B).missing.length;
      const multi = CAT.getProducts().find(q => q.size.options.some(o => o.areaM2 > 0) && CAT.getAcousticConfigurations(q.id).filter(ok).length >= 3);
      const cfgs = CAT.getAcousticConfigurations(multi.id), good = cfgs.filter(ok), sol = AM.services.solutions.ofProduct(multi.id);
      S.set('treatment', { items: [], active: null });
      S.go('treatment');
      T.solOpen(tc(), sol.key); T.solVariant(tc(), multi.id);
      await sleep(400);
      const shownBefore = document.querySelectorAll('#app #mounting .mt').length;
      const it = () => D.treatmentItems(S.state.project).find(x => x.product.id === multi.id);
      // Added without a pick: the app's best mounting for this room.
      T.solAdd(tc(), multi.id);
      await sleep(300);
      const rec = it().recommendedConfig;
      check('Added without a pick: the app\'s best mounting is used', rec && it().configuration.id === rec, it().configuration.label);
      // Picked before adding: another complete mounting, which is kept when the product is added.
      T.removeItem(tc(), it().id);
      const want = good.find(c => c.id !== rec);
      T.solMount(tc(), want.id);
      T.solAdd(tc(), multi.id);
      await sleep(400);
      const pressed = [...document.querySelectorAll('#app #mounting .mt[aria-pressed="true"] .mt-src')].map(e => e.textContent);
      const marked = [...document.querySelectorAll('#app #mounting .mt')].filter(b => b.querySelector('.mt-rec')).map(b => b.querySelector('.mt-src').textContent);
      check('How it is mounted: every tested way of the version shown is on the product page, with "Let the app choose" before it is added',
        shownBefore === cfgs.length + 1 && document.querySelectorAll('#app #mounting .mt').length === cfgs.length, `${multi.name}: ${cfgs.length} tested ways; cards before adding ${shownBefore}, after ${document.querySelectorAll('#app #mounting .mt').length}`);
      check('A mounting picked before adding is the one used and ticked; the app\'s best is still recorded and marked, with "Use the app\'s choice"; the pick is cleared',
        it().configuration.id === want.id && it().recommendedConfig === rec && pressed.length === 1 && pressed[0].includes(want.label)
          && marked.length === 1 && marked[0].includes(cfgs.find(c => c.id === rec).label) && !!document.querySelector('#app #mounting .card-hr button') && S.state.ui.catalog.config == null,
        `used ${it().configuration.label}; app's best ${cfgs.find(c => c.id === rec).label}; ticked ${pressed.join(', ')}; marked ${marked.join(', ')}`);
      T.pickConfig(tc(), rec);
      await sleep(300);
      const back = it();
      check('Choosing the app\'s mounting again: it is used, its amount worked out by the app, and the "Use the app\'s choice" button goes',
        back.configuration.id === rec && back.amountBy === 'app' && back.quantity >= 0 && !document.querySelector('#app #mounting .card-hr button'),
        `${back.configuration.label}, ${back.quantity} panels`);      S.set('treatment', { items: [], active: null });
    }
    status('Done');
    document.title = `${results.filter(t => t.ok).length}/${results.length} passed`;
    return results;
  }

  window.ROOM_SURFACES_DONE = run().catch(e => { check('The test ran to the end', false, `${e.message}\n${e.stack || ''}`); status('Error'); document.title = 'error'; return results; });
})();
