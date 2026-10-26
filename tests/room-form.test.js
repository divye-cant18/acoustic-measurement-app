/* Tests of the Room information form (Room Setup) in the whole application (tests/room-form.html). Development only.
   Results on the page and in window.ROOM_FORM_TEST (window.ROOM_FORM_DONE resolves).

   Expected areas are worked out by hand in the comments, so they come from the dimensions, not from the code under test.

    1 industries and room types: the list, "Other" everywhere, every activity follows a sourced criterion, earlier
      industry names moved (also in a project saved before)
    2 dependent choices: industry → room type, activity and questions; room type → activity and its name; construction →
      finish → acoustic data; equipment kind → its details; everything else kept
    3 walls and ceiling sections: add, duplicate, remove (asked first), numbers kept, own sizes, placements
    4 openings, coverings, equipment and the area free for treatment: equipment ticked per wall, no sizes, no area taken;
      what a treatment covers
    5 materials not in the library: kept with the wall, no acoustic value, listed once for the report form, in the report
    6 calculations: floor area, volume, wall and ceiling areas, sections, invalid entries refused
    7 saved, reopened and edited
    8 the screen: folded wall cards, wall sizes only where needed, add a wall, the industry's questions, dependent
      selects, equipment ticks */
(function () {
  'use strict';
  const results = window.ROOM_FORM_TEST = [];
  const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) }); show(); };
  const status = t => { const el = document.getElementById('rf-status'); if (el) el.textContent = t; };
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  function show() {
    const el = document.getElementById('rf-out');
    if (el) el.innerHTML = results.map(t => `<li class="${t.ok ? 'ok' : 'bad'}"><b>${t.ok ? 'PASS' : 'FAIL'}</b> ${esc(t.name)}<br><small>${esc(t.detail)}</small></li>`).join('');
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const close = (a, b, tol = 1e-9) => a != null && Math.abs(a - b) <= tol;
  const json = o => JSON.stringify(o);
  const copy = o => JSON.parse(JSON.stringify(o));

  /* ---------- before the app loads: a clean store, and a project saved with an earlier industry name ---------- */
  const IKEY = 'acoustic-measurement-prototype', PKEY = id => `${IKEY}:p:${id}`;
  (function seed() {
    const P = 'room-form-test:';
    [localStorage, sessionStorage].forEach(st => {
      const keys = [];
      for (let i = 0; i < st.length; i++) { const k = st.key(i); if (k && k.startsWith(P)) keys.push(k.slice(P.length)); }
      keys.forEach(k => st.removeItem(k));
    });
    const now = new Date().toISOString();
    localStorage.setItem(PKEY('legacy-cinema'), JSON.stringify({
      id: 'legacy-cinema', kind: 'new', createdAt: now, updatedAt: now, lastStage: 'room',
      room: { name: 'Screen 2', industry: 'Media & Entertainment', type: 'Cinema', use: 'Film screening', L: 14, W: 9, H: 6, occupancy: 80, furnishing: 'Furnished', floor: '', walls: '', ceiling: '', existing: 'None' },
      target: { preferred: null, min: null, max: null, source: 'recommended', basis: '' },
      setup: { deviceKind: null, deviceId: 'default', deviceLabel: '', permission: 'not-requested', input: null, position: 'P1', signal: 'sweep', sweepLevelDb: 0, noise: null, noiseAttempt: null, prep: {} },
      measurement: { recording: null, failed: null, retry: null }, processing: { result: null, attempt: null, history: [] },
      treatment: { items: [], active: null }, completed: ['home'], review: [],
    }));
    localStorage.setItem(IKEY, JSON.stringify({ v: 2, activeId: null, ids: ['legacy-cinema'] }));
  })();

  const PLASTERBOARD = 'aua-2-x-13-mm-plasterboard-on-frame-50-mm-cavity';

  async function run() {
    await window.APP_READY;
    await sleep(200);
    const A = window.AM, S = A.store, W = A.workflow, D = A.demo, SF = A.services.surfaces, TS = A.services.target, TD = A.targetData, RF = A.roomFormData;
    const act = W.get('room').actions, model = W.get('room').model, ctx = () => ({ project: S.state.project, state: S.state });
    const el = (dataset, value) => ({ dataset, value });

    /* ===== 1. industries and room types ===== */
    status('Industries…');
    {
      const names = D.INDUSTRIES.map(i => i.name);
      const want = ['Corporate offices and meeting rooms', 'Education and training facilities', 'Recording and music studios', 'Hospitality and restaurants', 'Healthcare facilities',
        'Auditoriums and performance spaces', 'Industrial and commercial facilities', 'Residential spaces', 'Government and civic', 'Transport', 'Sports and recreation', 'Other / custom industry'];
      check('The nine industries of the brief and the three added from the Vicoustic room list, in order', json(names) === json(want), names.join(' · '));
      check('Every industry offers "Other" as a room type; the custom industry offers only it',
        D.INDUSTRIES.every(i => i.types[i.types.length - 1] === 'Other') && json(D.roomTypesFor('Other / custom industry')) === json(['Other']), D.INDUSTRIES.map(i => i.types.length).join(', '));
      const studio = D.roomTypesFor('Recording and music studios');
      check('Room types follow the industry: studios offer studios, not classrooms', studio.includes('Recording studio') && studio.includes('Rehearsal room') && !studio.includes('Classroom'), studio.join(', '));
      // Standards-based targets (2026-10-19): every room type the app knows has its categories in js/data/targets.js; each
      // category follows a verified criterion in the data or says why it has none; only types with a verified category are
      // offered (with "Other"), and "Other" has no activity and no criterion.
      const types = [...new Set(D.INDUSTRIES.flatMap(i => i.types))].filter(t => t !== 'Other');
      const bad = types.filter(t => { const cs = TD.CATEGORIES[t] || []; return !cs.length || cs.some(([u, rule]) => !TD.USES[u] || (rule.criterion ? !TD.CRITERIA[rule.criterion] : !rule.reason)); });
      check('Every room type of every industry has its main activities, each with a criterion in the data or the reason it has none (none invented)', !bad.length, bad.length ? bad.join(', ') : `${types.length} room types`);
      const offered = [...new Set(D.INDUSTRIES.flatMap(i => TS.offeredTypes(i.name)))].filter(t => t !== 'Other'), notOffered = types.filter(t => !offered.includes(t));
      // Every room type is offered (2026-10-20): those with a verified criterion first, the others grouped as having no
      // verified RT60 target; "Other" last, with no activity.
      const res = TS.typeGroups('Residential spaces');
      check('Every room type is offered: those with a verified criterion first, the rest grouped as having no verified RT60 target (homes: the home studio, then living room, bedroom, home theatre, home office and "Other"); "Other" offers no activity',
        offered.every(t => TS.usesFor(t).length) && notOffered.every(t => !TS.usesFor(t).length) && !TS.usesFor('Other').length
          && json(res.target) === json(['Home studio']) && json(res.none) === json(['Living room', 'Bedroom', 'Home theatre', 'Home office', 'Other']),
        `${offered.length} with a target; without: ${notOffered.join(', ')}`);
      const moved = [['Corporate / Office', 'Conference room', 'Corporate offices and meeting rooms'], ['Media & Entertainment', 'Cinema', 'Auditoriums and performance spaces'],
        ['Media & Entertainment', 'Recording studio', 'Recording and music studios'], ['Public & Worship', 'Exhibition hall', 'Industrial and commercial facilities'],
        ['Public & Worship', 'Place of worship', 'Auditoriums and performance spaces'], ['Education', 'Classroom', 'Education and training facilities']];
      const wrong = moved.filter(([o, t, n]) => D.canonicalIndustry(o, t) !== n);
      check('Earlier industry names move to the new ones by their room type', !wrong.length, wrong.map(x => x.join(' → ')).join('; ') || 'all six');
      const legacy = S.state.projects.find(p => p.id === 'legacy-cinema');
      check('A project saved with "Media & Entertainment" / Cinema loads as "Auditoriums and performance spaces" and its room checks out',
        legacy && legacy.room.industry === 'Auditoriums and performance spaces' && W.get('room').canContinue(legacy).ok, legacy ? `${legacy.room.industry}; ${json(W.get('room').canContinue(legacy))}` : 'not loaded');
    }

    /* ===== 2. dependent choices ===== */
    status('Dependent choices…');
    S.startProject('new');
    S.autofillTo('room');
    const p = () => S.state.project;
    S.set('room', Object.assign(copy(D.demoRoom()), { surfaces: copy(D.demoRoom().surfaces) }));
    {
      const r0 = copy(p().room);
      check('The sample room: corporate, with its questions answered (video calls, seats)', r0.industry === 'Corporate offices and meeting rooms' && r0.context.calls === 'Often' && r0.context.seats === 12, json(r0.context));
      act.setIndustry(ctx(), 'Recording and music studios');
      const r1 = p().room;
      check('Industry changed to studios: the conference room type and its activity are cleared, the corporate answers too; name, size, surfaces kept',
        r1.type === '' && r1.use === '' && json(r1.context) === '{}' && r1.name === r0.name && r1.L === r0.L && json(r1.surfaces) === json(r0.surfaces), `type "${r1.type}", use "${r1.use}", context ${json(r1.context)}`);
      act.setType(ctx(), 'Recording studio');
      check('Room type chosen: its most common activity is set', p().room.use === TS.usesFor('Recording studio')[0], p().room.use);
      check('The studio questions apply now (role in the studio, how sound is listened to)', json(model.questionsFor(p().room).map(q => q.id)) === json(['studioRole', 'monitoring']), model.questionsFor(p().room).map(q => q.id).join(', '));
      S.set('room.context.studioRole', 'Control or mixing room');
      act.setType(ctx(), 'Other');
      check('Room type "Other": no main activity is asked (it has no criterion), the studio answer kept (same industry)',
        p().room.type === 'Other' && p().room.use === '' && p().room.context.studioRole === 'Control or mixing room', `"${p().room.use}"; ${json(p().room.context)}`);
      check('"Other" needs its name before the step can be finished', !W.get('room').canContinue(p()).ok && /Name the room type/.test(W.get('room').canContinue(p()).reason), W.get('room').canContinue(p()).reason);
      S.set('room.typeOther', 'Podcast booth');
      check('Named: the step can be finished', W.get('room').canContinue(p()).ok, json(W.get('room').canContinue(p())));
      act.setType(ctx(), 'Control room');
      check('Away from "Other": its typed name is cleared', p().room.typeOther === '', `"${p().room.typeOther}"`);
      act.setIndustry(ctx(), 'Other / custom industry');
      check('The custom industry: room type "Other" set at once; the industry and the room type must be named',
        p().room.type === 'Other' && /Name the industry/.test(W.get('room').canContinue(p()).reason), W.get('room').canContinue(p()).reason);
      act.setIndustry(ctx(), 'Corporate offices and meeting rooms');
      act.setType(ctx(), 'Conference room');

      // Construction → finish → acoustic data (Wall 1 is plasterboard, painted, with plasterboard data).
      const before = copy(p().room.surfaces);
      act.setConstruction(ctx(), 'glass', { dataset: { key: 'wall1' } });
      const w1 = p().room.surfaces.wall1;
      check('Wall 1 changed to glass: "painted" does not fit glass and the plasterboard data describes something else, so both are cleared; the other surfaces are unchanged',
        w1.construction === 'glass' && w1.finish === '' && w1.material === '' && ['wall2', 'wall3', 'wall4', 'floor', 'ceiling'].every(k => json(p().room.surfaces[k]) === json(before[k])), json(w1));
      const offered = SF.finishesFor('wall', 'glass'), ids = [...offered.common, ...offered.rest].map(f => f.id);
      check('Finishes offered for glass: only those a glass wall can carry', json(ids.sort()) === json(RF.FITS.wall.glass.slice().sort()), ids.join(', '));
      act.setConstruction(ctx(), 'plasterboard', { dataset: { key: 'wall1' } });
      act.setFinish(ctx(), 'painted', { dataset: { key: 'wall1' } });
      const list = SF.materialsFor('wall', null, { construction: 'plasterboard', finish: 'painted' }).flatMap(g => g.items);
      check('Plasterboard, painted: the library entries offered all describe plasterboard, painted (and include the sample room\'s)',
        list.length > 0 && list.every(m => { const k = SF.classOf(m, 'wall'); return k.c.includes('plasterboard') && k.f.includes('painted'); }) && list.some(m => m.id === PLASTERBOARD), `${list.length} entries`);
      act.surfaceMaterial(ctx(), PLASTERBOARD, { dataset: { key: 'wall1', part: 'finish' } });
      act.setFinish(ctx(), 'other', { dataset: { key: 'wall1' } });
      check('Finish "Other / not listed": no library entry can describe it, so the data is cleared and a name can be typed',
        p().room.surfaces.wall1.material === '' && json(p().room.surfaces.wall1.finishOther) === json({ name: '', notes: '' }) && !SF.materialsFor('wall', null, { construction: 'plasterboard', finish: 'other' }).length, json(p().room.surfaces.wall1));
      act.setFinish(ctx(), 'painted', { dataset: { key: 'wall1' } });
      check('Back to a listed finish: the typed name goes', !('finishOther' in p().room.surfaces.wall1), json(p().room.surfaces.wall1));
      act.surfaceMaterial(ctx(), PLASTERBOARD, { dataset: { key: 'wall1', part: 'finish' } });
      act.setFinish(ctx(), 'wallpaper', { dataset: { key: 'wall1' } });
      check('Another finish the data does not describe (wallpaper): the data is cleared, the construction kept', p().room.surfaces.wall1.material === '' && p().room.surfaces.wall1.construction === 'plasterboard', json(p().room.surfaces.wall1));
      act.setFinish(ctx(), 'painted', { dataset: { key: 'wall1' } });
      act.surfaceMaterial(ctx(), PLASTERBOARD, { dataset: { key: 'wall1', part: 'finish' } });

      // Equipment: ticked per wall, nothing to measure.
      act.toggleEquipment(ctx(), 'wall2|speaker');
      act.toggleEquipment(ctx(), 'wall2|ac');
      check('Ticking equipment on Wall 2: an air conditioner and a speaker are recorded, in the list\'s order, with no sizes', json(p().room.surfaces.wall2.equipment) === json(['ac', 'speaker']), json(p().room.surfaces.wall2.equipment));
      act.toggleEquipment(ctx(), 'wall2|other');
      S.set('room.surfaces.wall2.equipmentOther', 'Fire panel');
      check('"Other" can say what it is', SF.surfaceModel(p().room, 'wall2').equipment.some(e => e.type === 'other' && e.label === 'Fire panel'), json(SF.surfaceModel(p().room, 'wall2').equipment));
      act.toggleEquipment(ctx(), 'wall2|other');
      check('Unticking "Other" drops what it was', !p().room.surfaces.wall2.equipment.includes('other') && !('equipmentOther' in p().room.surfaces.wall2), json(p().room.surfaces.wall2));
      act.toggleEquipment(ctx(), 'wall2|ac');
      act.toggleEquipment(ctx(), 'wall2|speaker');
      check('Unticked again: Wall 2 has no equipment, and nothing else on it changed', !p().room.surfaces.wall2.equipment.length && p().room.surfaces.wall2.material === D.demoRoom().surfaces.wall2.material, json(p().room.surfaces.wall2.equipment));
      act.toggleEquipment(ctx(), 'floor|ac');
      check('Equipment is for walls: ticking it on the floor does nothing', !(p().room.surfaces.floor.equipment || []).length, json(p().room.surfaces.floor.equipment));
    }

    /* ===== 2b. what a surface is, in everyday words (js/data/room-form.js SURFACE_TYPES) ===== */
    status('Everyday types…');
    {
      const kinds = ['wall', 'floor', 'ceiling'];
      // Every type stands for a construction and finish that fit each other, and its typical sound data, where it has
      // any, is a library entry for that kind of surface that describes them (no value of its own).
      const bad = kinds.flatMap(k => RF.SURFACE_TYPES[k].filter(t => {
        if (!RF.FINISHES.some(f => f.id === t.finish && f.kinds.includes(k))) return true;
        if (t.construction && !(RF.FITS[k][t.construction] || []).includes(t.finish)) return true;
        if (!t.material) return false;
        const m = SF.material(t.material);
        return !m || !m.surfaces.includes(k) || !SF.materialFits(t.material, k, t.construction, t.finish);
      }).map(t => `${k}:${t.id}`));
      const noData = kinds.flatMap(k => RF.SURFACE_TYPES[k].filter(t => !t.material).map(t => `${k}:${t.id}`));
      check('Every everyday type has a construction and finish that fit, and typical sound data from a library entry that describes it; only these have none: mirror, metal sheet and "Something else"',
        !bad.length && json(noData) === json(['wall:mirror', 'wall:metal-sheet', 'wall:other', 'floor:other', 'ceiling:other']), bad.join(', ') || `no data: ${noData.join(', ')}`);
      const types = [...new Set(D.INDUSTRIES.flatMap(i => i.types))].filter(t => t !== 'Other');
      const missing = types.filter(t => { const l = RF.ROOM_MATERIALS[t]; return !l || kinds.some(k => !l[k] || !l[k].length || l[k].some(id => !SF.typeOf(k, id))); });
      check('Every room type has its own list of the walls, floors and ceilings common in it, each a type in the list', !missing.length, missing.join(', ') || `${types.length} room types`);
      // The three types added from the Vicoustic room list (26 October 2026): each has six measured bands and a manufacturer source.
      const added = [['wall', 'felt-panels'], ['wall', 'bass-absorber'], ['ceiling', 'hygiene-tiles']].map(([k, id]) => { const m = SF.material(SF.typeOf(k, id).material); return { k, id, m, src: m && AM.materialData.SOURCES[m.source] }; });
      check('Felt or PET panels, low-frequency absorbers and hygiene ceiling tiles: six measured bands each and a manufacturer source; examination rooms list hygiene tiles, control centres low-frequency absorbers',
        added.every(a => a.m && a.m.alpha.length === 6 && a.m.alpha.every(v => typeof v === 'number') && a.src && /^https:/.test(a.src.url) && a.m.quality === 'manufacturer')
          && RF.ROOM_MATERIALS['Examination room'].ceiling.includes('hygiene-tiles') && RF.ROOM_MATERIALS['Monitoring / control centre'].wall.includes('bass-absorber') && RF.COVER_TYPES.wall.includes('felt-panels'),
        added.map(a => `${a.id}: ${a.m ? json(a.m.alpha) : 'none'} (${a.src ? a.src.short : 'no source'})`).join(' · '));
      const lobby = SF.typesFor('floor', { type: 'Hotel lobby', industry: 'Hospitality and restaurants' }), mine = SF.typesFor('wall', { type: 'Other', industry: 'Industrial and commercial facilities' });
      check('The common types come first: a hotel lobby\'s floors start with marble, granite or Kota stone; a room type the user names uses its industry\'s list; "Something else" is always last',
        lobby.common[0].id === 'stone' && /hotel lobby/.test(lobby.label) && mine.common[0].id === 'block-bare' && mine.label === 'Common in this industry' && lobby.rest[lobby.rest.length - 1].id === 'other' && !lobby.common.some(t => t.id === 'other'),
        `${lobby.label}: ${lobby.common.map(t => t.id).join(', ')} · ${mine.label}: ${mine.common[0].id}`);
      // Choosing a type: its construction, finish and typical entry; the same type again keeps an exact entry chosen for it.
      act.setSurfaceType(ctx(), 'wall3|gypsum-partition');
      const w3 = () => p().room.surfaces.wall3;
      check('"Gypsum board partition" on Wall 3: plasterboard, painted, and the typical entry (Hall, gypsum wallboard on studs)',
        w3().type === 'gypsum-partition' && w3().construction === 'plasterboard' && w3().finish === 'painted' && w3().material === 'hall-gypsum-wallboard-1-2-in-on-studs', json(w3()).slice(0, 200));
      act.surfaceMaterial(ctx(), PLASTERBOARD, { dataset: { key: 'wall3', part: 'finish' } });
      act.setSurfaceType(ctx(), 'wall3|gypsum-partition');
      check('An exact entry of the same type (2 × 13 mm plasterboard) keeps the type, and choosing the type again does not replace it', w3().type === 'gypsum-partition' && w3().material === PLASTERBOARD, `${w3().type}; ${w3().material}`);
      act.setSurfaceType(ctx(), 'wall3|mirror');
      check('Another type replaces it: a mirror wall has no library data, so none is set (never a borrowed value)', w3().type === 'mirror' && w3().construction === 'glass' && w3().finish === 'mirror' && w3().material === '' && SF.surfaceModel(p().room, 'wall3').parts.find(x => x.role === 'finish').alpha == null,
        json(w3()).slice(0, 200));
      act.setSurfaceType(ctx(), 'wall3|other');
      S.set('room.surfaces.wall3.finishOther', { name: 'Jute wall covering', notes: '' });
      check('"Something else": its name is asked, it has no sound data, and it is listed for review with the report form', w3().type === 'other' && w3().finish === 'other' && !w3().material && SF.typeText(w3(), 'wall') === 'Jute wall covering' && SF.customMaterials(p().room).some(c => c.name === 'Jute wall covering'),
        json(SF.customMaterials(p().room)));
      // A surface saved before types existed is recognised, not rewritten.
      const old = { construction: 'plasterboard', finish: 'painted', material: PLASTERBOARD };
      const rec = SF.typeOfSurface(old, 'wall');
      check('A wall saved before types existed (plasterboard, painted) is recognised as a gypsum board partition, and nothing is written to it', rec && rec.type.id === 'gypsum-partition' && rec.inferred && !('type' in old), rec ? rec.type.id : 'none');
      // Sound in words, from the sourced α, mean over 250 Hz–2 kHz: painted plaster (0.02 × 4) 0.02: hard; plywood panelling
      // (0.22 + 0.17 + 0.09 + 0.10) ÷ 4 = 0.145: a little; cork board (0.05 + 0.17 + 0.52 + 0.50) ÷ 4 = 0.31: some;
      // fabric-wrapped panel 25 mm (0.27 + 0.80 + 1.00 + 1.00, the last two limited to 1.00) ÷ 4 = 0.7675: a lot.
      const lv = id => SF.soundRating(id).level, mean = id => SF.soundRating(id).mean;
      check('Sound in plain words from the sourced data (mean 250 Hz–2 kHz, worked out here): painted plaster 0.02 hard; plywood panelling 0.145 a little; cork board 0.31 some; a 25 mm fabric-wrapped panel 0.7675 a lot',
        lv('aua-painted-plaster-on-masonry') === 0 && Math.abs(mean('as-plywood-panelling-3-8-in') - 0.145) < 1e-9 && lv('as-plywood-panelling-3-8-in') === 1 && Math.abs(mean('aua-cork-board-25-mm-on-solid-backing') - 0.31) < 1e-9 && lv('aua-cork-board-25-mm-on-solid-backing') === 2
          && Math.abs(mean('mfr-fabric-wrapped-fibreglass-panel-25-mm-type-a') - 0.7675) < 1e-9 && lv('mfr-fabric-wrapped-fibreglass-panel-25-mm-type-a') === 3 && SF.soundRating('') === null,
        ['aua-painted-plaster-on-masonry', 'as-plywood-panelling-3-8-in', 'aua-cork-board-25-mm-on-solid-backing', 'mfr-fabric-wrapped-fibreglass-panel-25-mm-type-a'].map(id => `${mean(id).toFixed(4)} → ${SF.soundRating(id).word}`).join(' · '));
      // Doors, windows and coverings in everyday words.
      act.addOpening(ctx(), 'wall4|door');
      const door = () => p().room.surfaces.wall4.openings[p().room.surfaces.wall4.openings.length - 1];
      check('A new door starts as a wooden door with its typical data', door().type === 'wood-door' && door().material === 'pra-solid-wooden-door', json(door()));
      act.setOpeningType(ctx(), `wall4|${door().id}|glass-door`);
      check('Changed to a glass door: its typical data follows', door().type === 'glass-door' && door().material === 'hall-heavy-plate-glass', json(door()));
      act.removeOpening(ctx(), `wall4|${door().id}`);
      act.setCoverType(ctx(), 'wall4|curtains');
      check('Curtains covering part of Wall 4: typical curtain data and half of the wall to start', p().room.surfaces.wall4.cover.type === 'curtains' && p().room.surfaces.wall4.cover.material === 'aua-curtains-hung-in-folds-against-solid-wall' && p().room.surfaces.wall4.cover.pct === 50, json(p().room.surfaces.wall4.cover));
      act.removeCover(ctx(), 'wall4');
      // Library entries read by their own words, not parts of words: "unglazed", "unpainted" and "no carpet".
      const cls = id => SF.classOf(SF.material(id), id.includes('floor') ? 'floor' : 'wall').f;
      check('Library entries are read by whole words: unglazed brick and unpainted block are bare, a raised floor with no carpet is uncovered',
        json(cls('as-brick-unglazed')) === json(['exposed']) && json(cls('hall-concrete-block-unpainted')) === json(['exposed']) && json(cls('aua-raised-access-floor-no-carpet')) === json(['exposed']) && json(cls('as-brick-unglazed-painted')) === json(['painted']),
        ['as-brick-unglazed', 'hall-concrete-block-unpainted', 'aua-raised-access-floor-no-carpet', 'as-brick-unglazed-painted'].map(cls).join(' · '));
      S.set('room.surfaces.wall3', copy(D.demoRoom().surfaces.wall3));
    }

    /* ===== 3. walls and ceiling sections ===== */
    status('Walls…');
    {
      act.addWall(ctx());
      const r = p().room;
      check('"Add a wall": Wall 5 after the four, its own card data, no area until its length is given (its height is the room\'s)',
        json(r.wallKeys) === json(['wall1', 'wall2', 'wall3', 'wall4', 'wall5']) && !!r.surfaces.wall5 && SF.surfaceModel(r, 'wall5').grossM2 === null && SF.surfaceModel(r, 'wall5').problems.includes('Enter the length of Wall 5.'),
        `${json(r.wallKeys)}; ${SF.surfaceModel(r, 'wall5').problems.join(' ')}`);
      S.set('room.surfaces.wall5.lengthM', 4);
      // 4 × 3 = 12 m²; then 4 × 2.5 = 10 m²
      const a1 = SF.surfaceModel(p().room, 'wall5').grossM2;
      S.set('room.surfaces.wall5.heightM', 2.5);
      check('Wall 5 4 m long: 4 × 3 = 12 m²; 2.5 m high: 4 × 2.5 = 10 m²', close(a1, 12) && close(SF.surfaceModel(p().room, 'wall5').grossM2, 10), `${a1}, ${SF.surfaceModel(p().room, 'wall5').grossM2}`);
      const pl = SF.placementsFor(p().room);
      check('Treatment placements follow the walls: "Walls" covers all five, and Wall 5 can be chosen on its own',
        json(pl[0].keys) === json(['wall1', 'wall2', 'wall3', 'wall4', 'wall5']) && pl[0].label === 'Walls, spread over all five' && pl.some(x => x.value === 'Wall 5'), pl.map(x => x.label).join(' · '));
      act.duplicateWall(ctx(), 'wall3');
      const r2 = p().room, dup = r2.surfaces.wall6;
      check('"Duplicate" Wall 3: Wall 6 next to it, with its construction, finish, data and window copied',
        json(r2.wallKeys) === json(['wall1', 'wall2', 'wall3', 'wall6', 'wall4', 'wall5']) && dup.construction === r2.surfaces.wall3.construction && dup.material === r2.surfaces.wall3.material && json(dup.openings) === json(r2.surfaces.wall3.openings),
        `${json(r2.wallKeys)}; ${json(dup.openings)}`);
      act.askRemoveSurface(ctx(), 'wall4');
      check('Removing asks first: nothing is removed yet', S.state.ui.confirm === 'surface:wall4' && p().room.wallKeys.includes('wall4'), S.state.ui.confirm);
      act.cancelRemoveSurface(ctx());
      check('"Keep": still there', S.state.ui.confirm === null && p().room.wallKeys.includes('wall4'), json(p().room.wallKeys));
      act.removeSurface(ctx(), 'wall4');
      check('Removed: Wall 4 and what was recorded on it are gone; the other walls keep their numbers (Wall 5 is still Wall 5)',
        !p().room.wallKeys.includes('wall4') && !p().room.surfaces.wall4 && SF.surfaceDef('wall5', p().room).name === 'Wall 5' && SF.surfaceDef('wall6', p().room).name === 'Wall 6', json(p().room.wallKeys));
      act.removeSurface(ctx(), 'floor');
      act.removeSurface(ctx(), 'ceiling');
      check('The floor and the main ceiling cannot be removed', !!p().room.surfaces.floor && !!p().room.surfaces.ceiling && SF.surfacesOf(p().room).some(s => s.key === 'floor'), 'kept');
      const one = Object.assign(copy(p().room), { wallKeys: ['wall1'] });
      S.set('room', one);
      act.removeSurface(ctx(), 'wall1');
      check('The last wall cannot be removed', json(p().room.wallKeys) === json(['wall1']), json(p().room.wallKeys));
      S.set('room', Object.assign(copy(D.demoRoom()), { surfaces: copy(D.demoRoom().surfaces) }));
      S.set('room.shape', 'irregular');
      S.set('room.surfaces.wall1.lengthM', 7.5);
      // own length 7.5 × room height 3 = 22.5 m²
      check('An irregular room: a wall\'s own length is used (7.5 × 3 = 22.5 m²); the others still follow the room', close(SF.surfaceModel(p().room, 'wall1').grossM2, 22.5) && close(SF.surfaceModel(p().room, 'wall2').grossM2, 18), `${SF.surfaceModel(p().room, 'wall1').grossM2}, ${SF.surfaceModel(p().room, 'wall2').grossM2}`);
      S.set('room.surfaces.wall1.lengthM', 0.05);
      const cc = W.get('room').canContinue(p());
      check('A wall length outside 0.1–100 m is reported and the step cannot be finished', !cc.ok && /Wall 1 length: enter 0\.1–100 m/.test(cc.reason) && SF.surfaceModel(p().room, 'wall1').problems.some(x => /Wall 1 length/.test(x)), cc.reason);
      S.set('room.surfaces.wall1.lengthM', null);
      S.set('room.shape', 'rectangular');
      act.addCeilingSection(ctx());
      S.set('room.surfaces.ceiling2.areaM2', 12);
      // floor 10 × 6 = 60 m²: section 12 m², the main ceiling the other 48 m²
      check('A ceiling section of 12 m²: the main ceiling keeps 60 − 12 = 48 m²; together still 60 m²; "Ceiling" placement covers both',
        close(SF.surfaceModel(p().room, 'ceiling').grossM2, 48) && close(SF.surfaceModel(p().room, 'ceiling2').grossM2, 12) && close(SF.totals(p().room).ceilingM2, 60) && json(SF.placementKeys('Ceiling', p().room)) === json(['ceiling', 'ceiling2']),
        `${SF.surfaceModel(p().room, 'ceiling').grossM2} + ${SF.surfaceModel(p().room, 'ceiling2').grossM2}`);
      S.set('room.surfaces.ceiling2.areaM2', 70);
      check('Sections larger than the floor: reported, never negative', SF.surfaceModel(p().room, 'ceiling').grossM2 === 0 && SF.surfaceModel(p().room, 'ceiling').problems.some(x => /more than the floor area \(60\.0 of 60\.0|more than the floor area/.test(x)), SF.surfaceModel(p().room, 'ceiling').problems.join(' '));
      act.removeSurface(ctx(), 'ceiling2');
      check('The section removed: one ceiling of 60 m² again', json(SF.ceilingKeysOf(p().room)) === json(['ceiling']) && close(SF.surfaceModel(p().room, 'ceiling').grossM2, 60), json(p().room.ceilingKeys));
    }

    /* ===== 4. openings, coverings, equipment and the area free for treatment ===== */
    status('Free area…');
    {
      const base = Object.assign(copy(D.demoRoom()), { surfaces: copy(D.demoRoom().surfaces) });
      // Wall 1 of 10 × 6 × 3: 30 m². Door 0.9 × 2.1 = 1.89, window 2.0 × 1.2 = 2.40 → solid 25.71 m²; 20 % covered → 5.142 m²;
      // the finish, free for treatment, 25.71 − 5.142 = 20.568 m². An air conditioner and a speaker ticked: no area taken.
      base.surfaces.wall1.openings = [{ id: 'o1', kind: 'door', material: '', widthM: 0.9, heightM: 2.1, count: 1 }, { id: 'o2', kind: 'window', material: '', widthM: 2.0, heightM: 1.2, count: 1 }];
      base.surfaces.wall1.cover = { material: PLASTERBOARD, pct: 20 };
      base.surfaces.wall1.equipment = ['ac', 'speaker'];
      S.set('room', base);
      const w1 = SF.surfaceModel(p().room, 'wall1');
      check('Wall 1 with a door, a window and 20 % covered: solid 25.71 m², covered 5.142 m², free for treatment 20.568 m²; its air conditioner and speaker are listed and take no area',
        close(w1.solidM2, 25.71) && close(w1.coverM2, 5.142) && close(w1.availableM2, 20.568) && json(w1.equipment.map(e => e.type)) === json(['ac', 'speaker']) && !w1.problems.length,
        `solid ${w1.solidM2}, covered ${w1.coverM2}, free ${w1.availableM2}; ${w1.equipment.map(e => e.label).join(', ')}`);
      const cb = SF.coveredBy(p().room, 'Wall 1'), al = SF.alphaOf(PLASTERBOARD).values;
      check('What a treatment on Wall 1 covers: the 20.568 m² free, at the plasterboard\'s own α', close(cb.freeM2, 20.568) && cb.known && close(cb.alpha[1000], al[1000], 1e-12), `free ${cb.freeM2}, α ${cb.alpha[1000]} (library ${al[1000]})`);
      const t = SF.totals(p().room);
      // Walls 1–4: 20.568 + 18 + (30 − 6 window) 24 + (18 − 1.89 door) 16.11 = 78.678 m² free; 2 items on 1 wall.
      check('The room\'s free wall area adds the walls up: 20.568 + 18 + 24 + 16.11 = 78.678 m²; 2 items of equipment on 1 wall',
        close(t.wallAvailableM2, 78.678) && t.equipmentItems === 2 && t.wallsWithEquipment === 1 && close(t.wallM2, 96), `free ${t.wallAvailableM2}, items ${t.equipmentItems} on ${t.wallsWithEquipment}, walls ${t.wallM2}`);
      check('A treatment over all walls has 78.678 m² free (openings and coverings never covered twice)', close(SF.coveredBy(p().room, 'Walls').freeM2, 78.678), SF.coveredBy(p().room, 'Walls').freeM2);
      const line = SF.describe(p().room).find(x => x.key === 'wall1');
      check('Wall 1 described with its equipment: "…, 2 openings, with air conditioner and speaker"', /, 2 openings, with air conditioner and speaker$/.test(line.text), line.text);
    }

    /* ===== 5. materials not in the library ===== */
    status('Custom materials…');
    {
      act.setConstruction(ctx(), 'other', { dataset: { key: 'wall1' } });
      act.setFinish(ctx(), 'other', { dataset: { key: 'wall1' } });
      S.set('room.surfaces.wall1.constructionOther.name', 'Hempcrete blocks');
      S.set('room.surfaces.wall1.constructionOther.notes', '300 mm, lime-rendered');
      S.set('room.surfaces.wall1.finishOther.name', 'Clay plaster');
      const w1 = SF.surfaceModel(p().room, 'wall1'), cb = SF.coveredBy(p().room, 'Wall 1');
      check('Wall 1 built from a material not in the library: kept with its name and notes, and no acoustic value of any kind (the treatment says so rather than estimate)',
        p().room.surfaces.wall1.material === '' && w1.parts.find(x => x.role === 'finish').material === null && !cb.known && /Wall 1: no material chosen/.test(cb.why) && cb.alpha[1000] === null,
        `${json(p().room.surfaces.wall1.constructionOther)}; ${cb.why}`);
      act.duplicateWall(ctx(), 'wall1');
      act.setConstruction(ctx(), 'other', { dataset: { key: 'wall2' } }); // no name typed: not a material
      const list = SF.customMaterials(p().room), sent = A.reportGate.projectSummary(p()).customMaterials;
      check('Custom materials of the room: the construction and finish of Wall 1 and of its copy; a nameless one is not listed', list.length === 4 && list.every(x => x.surface === 'wall'), json(list.map(x => `${x.where}: ${x.kind} ${x.name}`)));
      check('For the report form each is sent once, with only its kind, surface, name and notes', json(sent) === json([
        { kind: 'construction', surface: 'wall', name: 'Hempcrete blocks', notes: '300 mm, lime-rendered' },
        { kind: 'finish', surface: 'wall', name: 'Clay plaster', notes: '' }]), json(sent));
      const M = A.report.model(p()), line = M.surfaces.find(s => s.key === 'wall1');
      check('The report says what Wall 1 is: "Hempcrete blocks, clay plaster"', line && line.chosen && line.text.startsWith('Hempcrete blocks, clay plaster'), line ? line.text : 'missing');
      const room = copy(p().room);
      check('The custom materials have no acoustic data anywhere in the room (no α stored)', !/"alpha"/.test(json(room)), 'room data has no alpha');
    }

    /* ===== 6. calculations ===== */
    status('Calculations…');
    {
      const r = Object.assign(copy(D.demoRoom()), { L: 4.2, W: 3.5, H: 2.7, surfaces: copy(D.demoRoom().surfaces) });
      // 4.2 × 3.5 = 14.7 m² floor; × 2.7 = 39.69 m³; walls 2 × 2.7 × (4.2 + 3.5) = 41.58 m²; Wall 1 11.34, Wall 2 9.45
      const g = A.acoustics.geometry(r), t = SF.totals(r);
      check('Floor area 14.7 m², volume 39.69 m³, walls 41.58 m² (11.34 + 9.45 + 11.34 + 9.45), ceiling 14.7 m²',
        close(g.floor, 14.7) && close(g.V, 39.69) && close(t.wallM2, 41.58) && close(SF.surfaceModel(r, 'wall1').grossM2, 11.34) && close(SF.surfaceModel(r, 'wall2').grossM2, 9.45) && close(t.ceilingM2, 14.7),
        `floor ${g.floor}, V ${g.V}, walls ${t.wallM2}`);
      const nos = Object.assign(copy(r), { L: null });
      check('Without a complete size: no areas and nothing reported against the walls', SF.surfacesOf(nos).every(s => SF.surfaceModel(nos, s.key).grossM2 == null) && SF.totals(nos).wallM2 === null, 'all null');
      S.set('room', Object.assign(copy(r), { L: 0.5 }));
      check('A room length under 1 m is refused with its reason', /Room length: enter 1–100 m/.test(W.get('room').canContinue(p()).reason), W.get('room').canContinue(p()).reason);
    }

    /* ===== 7. saved, reopened, edited ===== */
    status('Save and reopen…');
    {
      const r = Object.assign(copy(D.demoRoom()), { surfaces: copy(D.demoRoom().surfaces) });
      S.set('room', r);
      act.addWall(ctx());
      S.set('room.surfaces.wall5.lengthM', 3.2);
      S.set('room.surfaces.wall5.label', 'Alcove wall');
      act.toggleEquipment(ctx(), 'wall5|speaker');
      act.setConstruction(ctx(), 'other', { dataset: { key: 'wall5' } });
      S.set('room.surfaces.wall5.constructionOther.name', 'Rammed earth');
      act.toggleItem(ctx(), 'problems|flutter');
      act.toggleItem(ctx(), 'furnishings|curtains');
      S.set('room.reference', 'L3-314');
      const id = p().id, snap = json(p().room);
      const saved = JSON.parse(localStorage.getItem(PKEY(id)) || 'null');
      check('Saved with the project as entered: walls, equipment, the custom material, lists and reference', saved && json(saved.room) === snap && saved.room.surfaces.wall5.equipment.length === 1, saved ? 'saved' : 'not saved');
      S.closeProject();
      S.openProject(id);
      check('Closed and reopened from history: the same room', p() && p().id === id && json(p().room) === snap, 'reopened');
      S.set('room.surfaces.wall5.lengthM', 3.6);
      act.toggleItem(ctx(), 'problems|flutter');
      // 3.6 × 3 = 10.8 m²
      check('Edited after reopening: Wall 5 3.6 m long is 10.8 m²; "flutter" unticked; the rest unchanged',
        close(SF.surfaceModel(p().room, 'wall5').grossM2, 10.8) && !p().room.problems.includes('flutter') && p().room.furnishings.includes('curtains') && p().room.surfaces.wall5.constructionOther.name === 'Rammed earth',
        `${SF.surfaceModel(p().room, 'wall5').grossM2}; ${json(p().room.problems)}`);
    }

    /* ===== 8. the screen ===== */
    status('Screen…');
    {
      S.go('room');
      await sleep(120);
      const app = document.getElementById('app');
      const cards = () => [...app.querySelectorAll('details.surf')];
      check('One folded card per surface: five walls, the floor and the ceiling; each line names it and gives its area',
        cards().length === 7 && cards().every(c => c.querySelector('summary b') && c.querySelector('.surf-area')) && !app.querySelector('details.surf[open]#surf-card-wall2'),
        cards().map(c => `${c.querySelector('summary b').textContent} ${c.querySelector('.surf-area').textContent.trim()}`).join(' · '));
      check('The industry\'s questions are on the screen (video calls, seats), all optional', /About how the room is used/.test(app.textContent) && !!app.querySelector('#q-seats') && !!app.querySelector('#q-calls-0'), 'questions card');
      app.querySelector('[data-action="addWall"]').click();
      await sleep(80);
      const w6 = app.querySelector('#surf-card-wall6');
      check('"Add a wall" on the screen: Wall 6 appears, open, with its length field', p().room.wallKeys.includes('wall6') && w6 && w6.open && !!app.querySelector('#surf-wall6-len'), json(p().room.wallKeys));
      app.querySelector('#surf-wall6-type-glass').click();
      await sleep(60);
      // The card's text without the optional exact type (wherever it is: on a wall, inside "More details").
      const w6c = app.querySelector('#surf-card-wall6'), plainOf = el => { const c = el.cloneNode(true); c.querySelectorAll('.surf-exact').forEach(x => x.remove()); return c.textContent; }, plain = plainOf(w6c.querySelector('.surf-b'));
      check('"What is this wall?" on the screen: one click on "Glass wall or glass partition" records it with its typical data, says how much sound it absorbs in words, and shows no sizes in millimetres outside the optional exact type',
        p().room.surfaces.wall6.type === 'glass' && p().room.surfaces.wall6.material === 'hall-heavy-plate-glass' && app.querySelector('#surf-wall6-type-glass').getAttribute('aria-pressed') === 'true'
          && /Hard: reflects almost all sound/.test(w6c.querySelector('.surf-sound').textContent) && /typical values/.test(w6c.querySelector('.surf-sound').textContent) && !/\d\s?mm\b/.test(plain) && !app.querySelector('#surf-wall6-con'),
        `${p().room.surfaces.wall6.type}; ${w6c.querySelector('.surf-sound').textContent}`);
      app.querySelector('#surf-wall6-eq-ac').click();
      await sleep(60);
      check('Ticking "Air conditioner" on Wall 6: recorded and shown as ticked; no size, position or clearance fields',
        json(p().room.surfaces.wall6.equipment) === json(['ac']) && app.querySelector('#surf-wall6-eq-ac').getAttribute('aria-pressed') === 'true' && !app.querySelector('#surf-card-wall6 [id*="clearance"], #surf-card-wall6 [id$="-x"], #surf-card-wall6 [id$="-c"]'),
        json(p().room.surfaces.wall6.equipment));
      // Regression (26 October 2026): the "Other" equipment button and the box saying what it is shared one id, so after
      // each keystroke the screen put the cursor back on the button, and a space typed next ticked "Other" off, with the text.
      app.querySelector('#surf-wall6-eq-other').click();
      await sleep(60);
      const more6 = app.querySelector('#surf-card-wall6 details.surf-more');
      if (more6 && !more6.open) { more6.querySelector('summary').click(); await sleep(60); }
      const otherBox = app.querySelector('#surf-wall6-eq-other-name');
      if (otherBox) { otherBox.focus(); otherBox.value = 'F'; otherBox.dispatchEvent(new Event('input', { bubbles: true })); }
      await sleep(60);
      const ids = [...app.querySelectorAll('[id]')].map(e => e.id), dup = [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];
      check('"Other" ticked on Wall 6: the box saying what it is has its own id and keeps the cursor while typing; no id is used twice on the Room screen',
        !!otherBox && document.activeElement && document.activeElement.id === 'surf-wall6-eq-other-name' && p().room.surfaces.wall6.equipmentOther === 'F' && !dup.length,
        `focused ${document.activeElement && document.activeElement.id}; stored ${p().room.surfaces.wall6.equipmentOther}; used twice: ${dup.join(', ') || 'none'}`);
      check('A rectangular room asks no wall sizes for walls 1–4 (they follow the room); the added wall asks its own', !app.querySelector('#surf-wall1-len') && !app.querySelector('#surf-wall1-ht') && !!app.querySelector('#surf-wall6-len'), 'wall 1: none; wall 6: length');
      const ind = app.querySelector('#room-industry');
      ind.value = 'Healthcare facilities';
      ind.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(60);
      check('Industry changed on the screen: the room type select is emptied and offers healthcare rooms only',
        p().room.type === '' && [...app.querySelector('#room-type').options].filter(o => o.value).every(o => D.roomTypesFor('Healthcare facilities').includes(o.value)), [...app.querySelector('#room-type').options].map(o => o.value).join(', '));
      check('The Room step names no predicted RT60', !/predicted|room model|as built/i.test(app.querySelector('#surf-card-wall1').closest('.grid.split').textContent), 'none');
    }

    status('Done');
    document.title = `${results.filter(t => t.ok).length}/${results.length} passed`;
    return results;
  }

  window.ROOM_FORM_DONE = run().catch(e => { check('The test ran to the end', false, `${e.message}\n${e.stack || ''}`); status('Error'); document.title = 'error'; return results; });
})();
