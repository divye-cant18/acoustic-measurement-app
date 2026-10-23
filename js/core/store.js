/* Project store: the open project, the measurement history, the current stage, transient UI state,
   and the actions that change them.

   Measurement history is kept in this browser's localStorage, on this device only. There are no accounts.
   Each project is stored under its own key, so starting a new measurement never overwrites an earlier one
   (also not from a second tab). A small index lists the project ids. The app works the same without storage. */
(function (AM) {
  'use strict';

  const KEY = 'acoustic-measurement-prototype';  // index: { v: 2, activeId, ids }  (v1 held a single project)
  const PKEY = id => `${KEY}:p:${id}`;            // one saved project
  const SKEY = `${KEY}:here`;                     // this tab only (sessionStorage): the step on screen, kept across a reload
  const VERSION = 2;
  const W = AM.workflow;
  const freshUi = () => ({
    navOpen: false, sheet: null, toast: null, band: AM.demo.REFERENCE_BAND, confirm: null,
    // The solutions explorer on Treatment: its view (home, category, product), category, product and version, search.
    catalog: { query: '', category: 'All', surface: 'Any', browsing: false, adding: false, view: 'home', cat: null, group: null, variant: null, config: null },
  });

  const state = { project: null, projects: [], current: 'home', ui: freshUi() };
  const listeners = new Set();
  let toastTimer = 0;
  const contentSig = new Map(); // project id -> saved content, to know when it really changed
  const written = new Map();    // project id -> last JSON written to storage
  const deleted = new Set();    // project ids deleted in this tab, never listed again
  let storageWarned = false;

  const readJson = key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; } };
  // What counts as a change to the project. Where it was left and whether it is pinned do not.
  const content = p => JSON.stringify(p, (k, v) => (k === 'updatedAt' || k === 'lastStage' || k === 'pinned' || k === 'pinnedAt' ? undefined : v));
  function remember(p) { contentSig.set(p.id, content(p)); written.set(p.id, JSON.stringify(p)); }

  /* The app opens on Home (new measurement or history). The last opened project stays open so it is one click away.
     A reload of the same tab returns to the step that was on screen. */
  function load() {
    try {
      const d = readJson(KEY);
      if (d && d.v === 1 && d.project) {
        // Earlier version: one project in the index key. Becomes the first history entry.
        const p = migrate(d.project);
        if (d.current && d.current !== 'home') p.lastStage = d.current;
        state.projects = [p];
        state.project = p;
        localStorage.setItem(PKEY(p.id), JSON.stringify(p)); // saved in the new format before the index is replaced
        remember(p);
      } else if (d && d.v === VERSION && Array.isArray(d.ids)) {
        // Each project on its own: one that cannot be read or brought up to date (damaged, or saved by a version this
        // one does not know) is left in storage, untouched, and the others still load.
        d.ids.forEach(id => {
          try {
            const p = readJson(PKEY(id));
            if (p && p.id === id) { state.projects.push(migrate(p)); remember(p); }
          } catch (e) { console.warn(`Project ${id} could not be loaded and was skipped.`, e); }
        });
        state.project = state.projects.find(p => p.id === d.activeId) || null;
      }
    } catch (e) { /* storage unavailable: start fresh */ }
    state.current = 'home';
    try {
      // This tab's own project and step come first: the index's activeId is whichever tab saved last.
      const here = JSON.parse(sessionStorage.getItem(SKEY) || 'null');
      const mine = here && here.projectId ? state.projects.find(p => p.id === here.projectId) : null;
      if (mine) state.project = mine;
      if (here && state.project && here.projectId === state.project.id && W.get(here.current) && W.canEnter(state.project, here.current)) state.current = here.current;
    } catch (e) { /* no session storage: open on Home */ }
    window.addEventListener('storage', onStorage);
  }

  const LEGACY_USE = { 'Speech and video calls': 'Video calls and hybrid meetings', Presentations: 'Meetings and presentations', Music: 'Music rehearsal and performance' };

  /* Saved projects from earlier versions: add new fields, and drop a treatment item the catalog
     no longer has (e.g. the old demo panel). Treatment and later steps are then reopened. */
  function migrate(p) {
    p.updatedAt = p.updatedAt || p.createdAt || new Date().toISOString();
    p.lastStage = p.lastStage || 'room';
    if (p.room && p.room.industry === undefined) p.room.industry = AM.demo.industryFor(p.room.type);
    // Industries renamed and regrouped (2026-10-19): an earlier name moves to the one its room type is in now.
    if (p.room && p.room.industry) p.room.industry = AM.demo.canonicalIndustry(p.room.industry, p.room.type);
    // Room uses depend on the room type. An earlier version's general use name moves to today's where the type has it;
    // any other saved activity is kept exactly as saved (also for a type without a verified criterion), and a room saved
    // before activities existed gets its type's most common activity with a verified criterion.
    const TS = AM.services.target, legacy = LEGACY_USE[p.room.use];
    if (legacy && TS.knownUses(p.room.type).includes(legacy)) p.room.use = legacy;
    if (!p.room.use && TS.usesFor(p.room.type).length) p.room.use = TS.usesFor(p.room.type)[0];
    // Earlier targets had no source. A confirmed one is kept as the user's; an unconfirmed one follows the recommendation.
    if (!p.target.source) {
      const kept = p.completed.includes('target');
      p.target = Object.assign({}, p.target, { source: kept ? 'custom' : 'recommended', basis: kept ? 'Set in an earlier version of the app' : '' });
    }
    // Earlier versions held one product on the treatment itself. It becomes the first item of the plan.
    const old = p.treatment || {};
    if (!Array.isArray(old.items)) {
      const item = old.productId ? [Object.assign(AM.demo.newTreatmentItem([]), {
        productId: old.productId, configurationId: old.configurationId || null, size: old.size ?? null,
        quantity: typeof old.quantity === 'number' ? old.quantity : 10, areaM2: old.areaM2 ?? null, placement: old.placement || 'Walls',
      })] : [];
      p.treatment = { items: item, active: item.length ? item[0].id : null };
    }
    migrateMeasurement(p);
    migrateMethod(p);
    migrateTarget(p);
    // Six surfaces, from an earlier single floor / walls / ceiling choice where it names one material (surfaces.fromLegacy).
    if (p.room && !p.room.surfaces) p.room.surfaces = AM.services.surfaces.fromLegacy(p.room);
    const cat = AM.services.catalog, t = p.treatment;
    let changed = false;
    t.items = t.items.filter(it => { const ok = !!cat.getProduct(it.productId); changed = changed || !ok; return ok; });
    t.items.forEach(it => {
      if (it.configurationId && (cat.getAcousticConfiguration(it.configurationId) || {}).productId !== it.productId) { it.configurationId = null; changed = true; }
    });
    if (!t.items.some(it => it.id === t.active)) t.active = t.items.length ? t.items[t.items.length - 1].id : null;
    if (changed) {
      const later = W.STAGES.slice(W.idx('treatment')).map(s => s.id);
      p.completed = p.completed.filter(x => !later.includes(x));
      p.review = p.review.filter(x => !later.includes(x));
    }
    return p;
  }

  /* Targets come only from verified criteria (2026-10-19, js/data/targets.js). A recommended target is brought up to date
     with the room as saved. When no verified criterion applies any more, its values are kept apart (target.earlier) and
     never used: the project has no target until a supported category or the project's own target is chosen. A target
     the user set in an earlier version stays theirs; where no criterion applies, its earlier basis is kept as its source.
     The finished steps that relied on a changed target are marked for review, and targetNote says what happened. */
  function migrateTarget(p) {
    const TS = AM.services.target, stage = W.get('target'), t = p.target;
    if (!t || !stage || !stage.sync) return;
    const rec = TS.recommend(p.room);
    if (t.source === 'custom') {
      if (!rec && !t.note && t.basis) t.note = `Set in an earlier version of the app (${t.basis})`;
      return;
    }
    const had = [t.preferred, t.min, t.max].some(x => typeof x === 'number');
    const old = { preferred: t.preferred, min: t.min, max: t.max, basis: t.basis || '' };
    if (!stage.sync(p) || !had) return;
    const now = p.target, same = now.preferred === old.preferred && now.min === old.min && now.max === old.max;
    if (same) return;
    if (!TS.complete(now)) {
      p.target = Object.assign({}, now, { earlier: old });
      p.targetNote = `The target saved with this project (${old.basis || 'an earlier recommendation'}: ${typeof old.preferred === 'number' ? old.preferred.toFixed(2) : '—'} s) ${['outside', 'needs-input'].includes(TS.availability(p.room).status) ? `no longer applies to this room: ${TS.availability(p.room).message} It is kept for the record but no longer used.` : 'came from a criterion that is not verified for this room. It is kept for the record but no longer used: choose a supported room category, or set the project\'s own target with its source.'}`;
    } else {
      p.targetNote = `The recommended target was updated to the verified criterion (${now.basis}): it was ${typeof old.preferred === 'number' ? `${old.preferred.toFixed(2)} s (${old.min != null ? old.min.toFixed(2) : '—'}–${old.max != null ? old.max.toFixed(2) : '—'} s)` : 'different'}.`;
    }
    const flag = ['target', 'assessment', 'treatment', 'prediction', 'final'].filter(id => p.completed.includes(id) && !p.review.includes(id));
    p.review.push(...flag);
  }

  /* RT60 is reported from T20 since 20 October 2026 (services/processing.js); before, from T30 where 45 dB of decay was
     usable. A result processed before keeps every band's T20, so its bands are brought over to T20 from the take's own
     data (rtMethod marks a result that is), never re-estimated: a position average never mixes the two. Its fit is
     the T30 one, so it is dropped with its r² (shown as not kept). The finished steps that show the result are marked
     for review when a value changed. */
  function migrateMethod(p) {
    const pr = p.processing || {}, results = [...Object.values(pr.positions || {}), pr.result].filter(r => r && r.valid && !r.rtMethod);
    let changed = false;
    results.forEach(r => {
      (r.bands || []).forEach(b => {
        if (b.path !== 'T30' || typeof b.t20 !== 'number') return;
        Object.assign(b, { rt60: b.t20, path: 'T20', fit: null, r2: null, xi: null, converted: true });
        changed = true;
      });
      const ref = (r.bands || []).find(b => b.f === r.referenceBand);
      if (ref && r.headline) Object.assign(r.headline, { rt60: ref.rt60, method: ref.path });
      r.rtMethod = 'T20';
    });
    if (!changed) return;
    const flag = ['results', 'assessment', 'treatment', 'prediction', 'final'].filter(id => p.completed.includes(id) && !p.review.includes(id));
    p.review.push(...flag);
  }

  /* Earlier versions simulated the microphone, the background noise and the measurement. Those values were never
     measured, so they are removed here and the project returns to Measurement Setup. Room, target and treatment plan
     are kept. legacyNote tells the user what happened. */
  function migrateMeasurement(p) {
    const s = p.setup || (p.setup = {});
    if (s.deviceId === undefined) { s.deviceId = 'default'; s.deviceLabel = ''; delete s.device; }
    if (s.signal !== 'sweep') s.signal = 'sweep';
    if (s.noiseAttempt === undefined) s.noiseAttempt = null;
    if (s.input === undefined) s.input = null;
    // Projects from before the sweep level existed were measured at the default level.
    if (s.sweepLevelDb === undefined) s.sweepLevelDb = 0;
    p.measurement = Object.assign({ recording: null, failed: null, retry: null }, p.measurement);
    p.processing = Object.assign({ result: null, attempt: null, history: [] }, p.processing);
    /* Projects measured before positions were kept (app 2026.10.16): the current take is the only valid result, at its
       own position. The room now needs at least two positions (AM.services.spatial) and is judged band by band over the
       bands its target's criterion sets (AM.services.evaluation), so finished steps that show the result are marked for
       review and the Measure step says why. Nothing measured is removed. */
    if (!p.processing.positions) {
      const cur = p.processing.result;
      p.processing.positions = {};
      if (cur && cur.valid && cur.engine !== 'simulated') {
        p.processing.positions[(cur.meta && cur.meta.position) || 'P1'] = cur;
        const flag = ['results', 'assessment'].filter(id => p.completed.includes(id) && !p.review.includes(id));
        p.review.push(...flag);
        p.legacyNote = 'This project was measured at one position. Rooms are now measured at two or more positions and judged band by band over the bands their target standard sets. Measure a second position to complete it; the steps that show the result are marked for review.';
      }
    }
    const rec = p.measurement.recording, res = p.processing.result;
    const simulated = (rec && (rec.simulated || rec.sim)) || (res && res.engine === 'simulated') || (s.noise && s.noise.dBA !== undefined) || p.proto;
    if (!simulated) return;
    const hadMeasurement = !!(rec || res);
    s.noise = null; s.noiseAttempt = null; s.permission = 'not-requested'; s.input = null;
    p.measurement = { recording: null, failed: null, retry: null };
    p.processing = { result: null, attempt: null, history: [], positions: {} };
    delete p.proto;
    const keep = ['home', 'room', 'target'];
    p.completed = p.completed.filter(id => keep.includes(id));
    p.review = p.review.filter(id => keep.includes(id));
    if (W.idx(p.lastStage) > W.idx('setup')) p.lastStage = 'setup';
    if (hadMeasurement) p.legacyNote = 'An earlier version of the app simulated the measurement of this project. Those simulated values have been removed. Measure the room to continue.';
  }

  function saveProject(p) {
    if (state.current !== 'home') p.lastStage = state.current;
    const c = content(p);
    if (contentSig.has(p.id) && contentSig.get(p.id) !== c) p.updatedAt = new Date().toISOString();
    contentSig.set(p.id, c);
    const json = JSON.stringify(p);
    if (written.get(p.id) !== json) { localStorage.setItem(PKEY(p.id), json); written.set(p.id, json); }
  }
  function saveIndex() {
    const ids = state.projects.map(p => p.id);
    const stored = readJson(KEY); // keep ids another tab added meanwhile
    // A project deleted here stays out of the index only while its data is gone: another tab that still has it open
    // saves it again, and then it is listed again.
    if (stored && stored.v === VERSION && Array.isArray(stored.ids)) stored.ids.forEach(id => { if (!ids.includes(id) && (!deleted.has(id) || localStorage.getItem(PKEY(id)))) ids.push(id); });
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, activeId: state.project ? state.project.id : null, ids }));
  }
  function save() {
    try { sessionStorage.setItem(SKEY, JSON.stringify({ current: state.current, projectId: state.project ? state.project.id : null })); } catch (e) { /* optional */ }
    try {
      if (state.project) saveProject(state.project);
      // Every history entry is written before the index lists it (e.g. a project migrated from the old format).
      state.projects.forEach(p => { if (!written.has(p.id)) { localStorage.setItem(PKEY(p.id), JSON.stringify(p)); remember(p); } });
      saveIndex();
    } catch (e) {
      if (!storageWarned) { storageWarned = true; setTimeout(() => toast('This browser did not allow saving. Measurement history may not be kept.'), 0); }
    }
  }

  /* Another tab saved: pick up projects it added or changed. The project open here is brought up to date too when the
     other tab changed it (every change here is saved at once, so nothing of this tab's is lost); it is updated in place,
     so a take or a processing job running here still belongs to it. A project another version cannot read is skipped. */
  function onStorage(e) {
    if (!e.key || !e.key.startsWith(KEY)) return;
    const d = readJson(KEY);
    if (!d || d.v !== VERSION || !Array.isArray(d.ids)) return;
    let changed = false;
    // Deleted in the other tab: drop it here too (unless it is open here, where it will be saved again).
    const kept = state.projects.filter(x => x === state.project || d.ids.includes(x.id) || readJson(PKEY(x.id)));
    if (kept.length !== state.projects.length) { state.projects = kept; changed = true; }
    d.ids.forEach(id => {
      const raw = localStorage.getItem(PKEY(id));
      if (deleted.has(id)) { if (!raw) return; deleted.delete(id); } // saved again by a tab that had it open
      if (!raw || written.get(id) === raw) return;
      try {
        const p = JSON.parse(raw);
        if (!p || p.id !== id) return;
        const i = state.projects.findIndex(x => x.id === id);
        if (state.project && state.project.id === id) {
          const fresh = migrate(p), cur = state.project;
          Object.keys(cur).forEach(k => { if (!(k in fresh)) delete cur[k]; });
          Object.assign(cur, fresh);
          remember(cur); changed = true;
        } else if (i < 0) { state.projects.push(migrate(p)); remember(p); changed = true; }
        else if (JSON.stringify(state.projects[i]) !== raw) { state.projects[i] = migrate(p); remember(p); changed = true; }
      } catch (err) { console.warn(`Project ${id} saved by another tab could not be read and was skipped.`, err); }
    });
    if (changed) listeners.forEach(fn => fn(state));
  }

  function emit() { save(); listeners.forEach(fn => fn(state)); }
  const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };

  const ui = patch => { Object.assign(state.ui, patch); emit(); };
  // Set one piece of screen state (e.g. 'catalog.query'). Not project data, so nothing is flagged for review.
  const uiSet = (path, value) => { AM.util.setPath(state.ui, path, value); emit(); };
  const update = fn => { if (state.project) fn(state.project); emit(); };

  /* Set one value on the project. If the stage that owns it is already finished, the later finished stages that
     use its data are flagged for review rather than thrown away. Data that follows other data (a recommended
     target follows the room) is brought up to date first, so every screen shows the same values. */
  function set(path, value) {
    const p = state.project;
    if (!p) return;
    if (JSON.stringify(AM.util.getPath(p, path)) === JSON.stringify(value)) return;
    AM.util.setPath(p, path, value);
    W.STAGES.forEach(s => { if (s.sync) s.sync(p); });
    flagDownstream(W.ownerOf(path), undefined, W.affects(path));
    emit();
  }
  // only: limit the flags to these stages (data that only some dependents use, W.affects).
  function flagDownstream(owner, message, only) {
    const p = state.project;
    if (!owner || !p.completed.includes(owner)) return;
    const from = Math.max(W.idx(owner), W.idx(state.current));
    const ids = W.dependents(owner).filter(id => (!only || only.includes(id)) && W.idx(id) > from && p.completed.includes(id) && !p.review.includes(id));
    if (!ids.length) return;
    p.review.push(...ids);
    toast(message || `${W.get(owner).title} changed. ${ids.length} later step${ids.length > 1 ? 's are' : ' is'} marked for review.`);
  }
  // Marks the finished steps that depend on `owner` for review, e.g. after the background noise changed a lot.
  function flagFrom(owner, message) { if (state.project) { flagDownstream(owner, message); emit(); } }

  function complete(id) {
    const p = state.project;
    if (!p.completed.includes(id)) p.completed.push(id);
    p.review = p.review.filter(x => x !== id);
  }

  /* New evidence replaces old evidence: this stage and everything after it must be done again. */
  function resetFrom(id) {
    const p = state.project;
    const later = W.STAGES.slice(W.idx(id)).map(s => s.id);
    p.completed = p.completed.filter(x => !later.includes(x));
    p.review = p.review.filter(x => !later.includes(x));
  }

  function go(id) {
    if (!W.canEnter(state.project, id)) {
      const b = W.blocker(state.project, id);
      toast(state.project ? `${W.get(id).title} is locked. Finish ${b ? b.title : 'the previous step'} first.` : 'Start a project from Home first.');
      return false;
    }
    state.current = id;
    state.ui.navOpen = false;
    state.ui.confirm = null;
    emit();
    return true;
  }

  /* Whether the step on screen can be finished: its own check, and no number field on it holding text that is not a
     number (AM.ui.bad, kept by the interface). Such text is not stored, so continuing would silently drop it. */
  function check(p, s) {
    const chk = s.canContinue ? s.canContinue(p) : { ok: true };
    if (!chk.ok || typeof document === 'undefined') return chk;
    const bad = (AM.ui && AM.ui.bad) || {};
    for (const id of Object.keys(bad)) {
      const el = document.getElementById(id);
      if (!el || !el.closest(`main.is-${s.id}`)) continue; // a field of this step, as on screen
      const l = document.querySelector(`label[for="${id}"]`), name = l && l.firstChild ? String(l.firstChild.textContent || '').trim() : '';
      return { ok: false, reason: `${name ? `${name}: ` : ''}"${bad[id]}" is not a number. Correct it or clear the field.` };
    }
    return chk;
  }

  function advance() {
    const p = state.project, s = W.get(state.current);
    const chk = check(p, s);
    if (!chk.ok) { toast(chk.reason); return; }
    if (s.onContinue) s.onContinue(p);
    complete(s.id);
    const n = W.next(s.id);
    if (n) { state.current = n.id; state.ui.confirm = null; }
    else toast('Project complete.');
    emit();
  }
  function back() { const pv = W.prev(state.current); if (pv) go(pv.id); }

  // Before switching projects, stop anything the current step is running (a measurement take, processing).
  function leaveCurrent() { const s = W.get(state.current); if (s && s.leave) s.leave(); }

  // A project nothing has been entered into yet (as created by New Measurement).
  function isUntouched(p) {
    const fresh = AM.demo.newProject('new');
    return p.completed.length <= 1 && JSON.stringify(p.room) === JSON.stringify(fresh.room) && !p.measurement.recording
      && !p.treatment.items.length && !p.setup.noise && p.setup.permission === fresh.setup.permission;
  }

  /* A new measurement is always a new history entry. Earlier ones are kept as they are.
     An untouched new project is reused rather than adding another empty "Untitled room". */
  function startProject(kind) {
    leaveCurrent();
    const blank = kind === 'new' ? state.projects.find(isUntouched) : null;
    const p = blank || AM.demo.newProject(kind);
    if (blank) { state.projects.splice(state.projects.indexOf(blank), 1); blank.createdAt = blank.updatedAt = new Date().toISOString(); }
    state.projects.unshift(p);
    state.project = p;
    state.current = 'room';
    state.ui = freshUi();
    emit();
  }

  /* After treatment: measure the same room again, as a new project with the room, target and measuring setup copied.
     It opens at Measurement Setup; the original project is not changed. */
  function startFollowUp() {
    const src = state.project;
    if (!src) return;
    leaveCurrent();
    const copy = o => JSON.parse(JSON.stringify(o));
    const p = AM.demo.newProject('new');
    p.room = Object.assign(copy(src.room), { name: `${src.room.name || 'Untitled room'} · after treatment` });
    p.target = copy(src.target);
    // The same measuring setup, sweep level and room preparation included (the same room, prepared the same way), so the
    // treated room is measured as the original was, starting again at the first position.
    Object.assign(p.setup, { deviceKind: src.setup.deviceKind || null, deviceId: src.setup.deviceId || 'default', deviceLabel: src.setup.deviceLabel || '', outputId: src.setup.outputId || 'default', position: AM.demo.POSITIONS[0].id, sweepLevelDb: AM.analysis.sweepLevel(src.setup.sweepLevelDb), prep: Object.assign({}, p.setup.prep, copy(src.setup.prep || {})) });
    p.followUpOf = src.id;
    p.completed = ['home', 'room', 'target'];
    p.lastStage = 'setup';
    state.projects.unshift(p);
    state.project = p;
    state.current = 'setup';
    state.ui = freshUi();
    emit();
    toast('New project for the treated room. The room and target are copied from the original.');
  }

  /* Delete a project from this device: its saved data and its place in Measurement History. Cannot be undone,
     so the UI asks first. Deleting the open project returns to Home. */
  function deleteProject(id) {
    const p = state.projects.find(x => x.id === id);
    if (!p) return;
    if (state.project === p) { leaveCurrent(); state.project = null; state.current = 'home'; }
    state.projects.splice(state.projects.indexOf(p), 1);
    deleted.add(id);
    contentSig.delete(id);
    written.delete(id);
    try { localStorage.removeItem(PKEY(id)); } catch (e) { /* storage unavailable */ }
    state.ui.confirm = null;
    emit();
    toast(`Deleted “${p.room.name || 'Untitled room'}”.`);
  }

  // Reopen a project from Measurement History where it was left.
  function openProject(id) {
    const p = state.projects.find(x => x.id === id);
    if (!p) return;
    leaveCurrent();
    state.project = p;
    state.current = W.canEnter(p, p.lastStage) ? p.lastStage : 'room';
    state.ui = freshUi();
    emit();
  }

  // Closes the open project. It stays in Measurement History.
  function closeProject() { leaveCurrent(); state.project = null; state.current = 'home'; state.ui = freshUi(); emit(); }

  // Prototype tool: clear the open project's data and progress, in its own history entry.
  function resetProject() {
    const old = state.project;
    if (!old) return;
    leaveCurrent();
    const p = AM.demo.newProject(old.kind);
    p.id = old.id;
    state.projects[state.projects.indexOf(old)] = p;
    state.project = p;
    state.current = 'room';
    state.ui = freshUi();
    emit();
  }

  /* Pin or unpin any saved project from Home. Stored with that project, so it survives closing the browser.
     Pinning is not an edit: the project keeps its "last updated" time and its place in Recent. */
  function togglePin(id) {
    const p = state.projects.find(x => x.id === id);
    if (!p) return;
    if (p.pinned) { delete p.pinned; delete p.pinnedAt; } else { p.pinned = true; p.pinnedAt = new Date().toISOString(); }
    try {
      const json = JSON.stringify(p);
      localStorage.setItem(PKEY(p.id), json);
      written.set(p.id, json);
    } catch (e) { /* storage unavailable: the pin lasts for this session */ }
    emit();
  }

  // Measurement history, most recently updated first.
  const history = () => state.projects.slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

  /* Developer tools are for building and checking the app, not for measuring a room: their step shortcuts are hidden
     unless turned on with ?dev=1 in the address (remembered on this device; ?dev=0 turns them off again). */
  const DEV_KEY = 'am.devtools';
  const devTools = (() => {
    let q = null;
    try { q = new URLSearchParams(location.search).get('dev'); } catch (e) { /* no address to read */ }
    try {
      if (q === '1') localStorage.setItem(DEV_KEY, '1');
      if (q === '0') localStorage.removeItem(DEV_KEY);
      return q === '1' || (q !== '0' && localStorage.getItem(DEV_KEY) === '1');
    } catch (e) { return q === '1'; } // storage unavailable: on for this visit only
  })();

  /* Developer tool: finish every stage before `id` with sample input, then open `id`. A stage whose demoFill returns
     false needs real data (a microphone measurement): the tool stops there and opens that stage instead.
     safe (the Developer tools panel): only a sample project is ever filled in. From any other project a new sample
     project is started, so a room, target, checklist or plan someone entered is never replaced; and the tool stops at a
     step marked for review, or one whose sample input does not check out, instead of marking it complete. */
  function autofillTo(id, opts) {
    const safe = !!(opts && opts.safe), fresh = safe && !(state.project && state.project.kind === 'demo');
    if (fresh) startProject('demo');
    else if (!state.project) { const np = AM.demo.newProject('demo'); state.projects.unshift(np); state.project = np; }
    const p = state.project;
    let stop = null, why = '';
    for (const s of W.STAGES.slice(0, W.idx(id))) {
      if (safe && W.needsReview(p, s.id)) { stop = s; why = 'is marked for review'; break; }
      if (!p.completed.includes(s.id) && s.demoFill && s.demoFill(p) === false) { stop = s; why = 'needs a real measurement'; break; }
      if (safe && !p.completed.includes(s.id) && s.canContinue && !s.canContinue(p).ok) { stop = s; why = 'does not check out with the sample input'; break; }
      complete(s.id);
    }
    state.current = stop ? stop.id : id;
    state.ui.sheet = null;
    state.ui.navOpen = false;
    emit();
    const said = [fresh ? 'Opened a new sample project, so no project of yours is changed.' : '', stop ? `${stop.title} ${why}. Developer tools stop here.` : ''].filter(Boolean).join(' ');
    if (said) toast(said);
  }

  function toast(msg) {
    state.ui.toast = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { state.ui.toast = null; emit(); }, 3800);
    emit();
  }

  AM.store = { state, load, subscribe, emit, ui, uiSet, update, set, complete, resetFrom, flagFrom, go, advance, check, back, startProject, startFollowUp, openProject, closeProject, resetProject, deleteProject, togglePin, history, autofillTo, devTools, toast };
})(window.AM);
