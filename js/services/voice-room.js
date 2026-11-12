/* Voice Room Setup — a sales representative describes the room in English or Hinglish; the description becomes a
   proposal on a pop-up confirm card (src/shell/VoicePanel.tsx), and what the rep keeps fills Room Setup.

   The card's steps (state.phase):
     idle        what to say, and "Start speaking" (or why voice is not available here)
     recording   the microphone is on, at most 60 s: a timer and a level; "Done" or "Cancel"
     working     the recording goes to the server (server/voice_room.py): speech to text, then understanding
     review      the confirm card: what was heard (it can be corrected and read again), each change with a tick and an
                 Edit (the form's own choices for it, under the change), what was left out and why, the questions still
                 open; "Fill in Room Setup", "Speak again", "Cancel"
     error       what went wrong, in words
   Nothing is written to the project before "Fill in Room Setup". Then each ticked change goes through the Room step's
   own actions (setIndustry, setType, setSurfaceType, stepOpening) or S.set on the paths its fields bind, so the step's
   checks, the 3D room and every later step follow exactly as when the rep taps; and what was said is kept with the
   project (room.voiceNotes: [{ at, text }]), in this browser only. Only the rep speaks: the microphone is on only
   between "Start speaking" and "Done".

   Every value the server proposes is checked here against the app's own lists and limits. A type not in the list
   becomes "Something else" with the words said; a size outside the limits, a wall the room does not have, or a name
   that is not in a list is left out, with a note saying so. A value that does not fit is never replaced by a guess. */
(function (AM) {
  'use strict';
  const { isNum } = AM.util;
  const S = AM.store, W = AM.workflow, D = AM.demo, RF = AM.roomFormData;
  const SURF = () => AM.services.surfaces, TS = () => AM.services.target;
  const MAX_S = 60, RATE = 16000, MAX_NOTES = 20;
  const api = path => new URL(`api/${path}`, document.baseURI).href;
  const render = () => { if (AM.app && AM.app.render) AM.app.render(); };

  const fresh = () => ({ phase: 'idle', notice: null, error: null, step: '', text: '', textKey: 0, items: [], notes: [], questions: [], edit: null });
  let state = fresh(), rec = null, pending = null, health = null; // health: null | 'checking' | 'configured' | 'not_configured' | 'unreachable'
  const set = patch => { Object.assign(state, patch); render(); };
  const fail = msg => set({ phase: 'error', error: msg, step: '' });

  /* ---------- what the AI may choose from: the app's own lists, as text ---------- */
  const L = a => a.join(' | ');
  function catalog() {
    const lines = ['Industries and their room types:'];
    D.INDUSTRIES.forEach(i => lines.push(`- ${i.name}: ${L(i.types)}`));
    lines.push('', 'Activities of each room type (only for that room type):');
    [...new Set(D.INDUSTRIES.flatMap(i => i.types))].forEach(t => { const u = TS().knownUses(t); if (u.length) lines.push(`- ${t}: ${L(u)}`); });
    ['wall', 'floor', 'ceiling'].forEach(kind => {
      lines.push('', `${kind === 'wall' ? 'Wall' : kind === 'floor' ? 'Floor' : 'Ceiling'} types (id: name; other names people use):`);
      SURF().typesOf(kind).forEach(t => {
        const al = (RF.ALIASES && RF.ALIASES[kind] && RF.ALIASES[kind][t.id]) || [];
        lines.push(t.id === 'other' ? '- other: Something else (a material not in this list)' : `- ${t.id}: ${t.name}${al.length ? `; ${al.join(', ')}` : ''}`);
      });
    });
    return lines.join('\n');
  }
  // The room as it is now, for changes said later ("wall 2 is brick, not plaster").
  function roomNow(r) {
    const SF = SURF(), dims = ['L', 'W', 'H'].map(k => (isNum(r[k]) ? `${{ L: 'length', W: 'width', H: 'height' }[k]} ${r[k]} m` : null)).filter(Boolean);
    const lines = [
      `Name: ${r.name || '(none)'}; industry: ${r.industry || '(none)'}; room type: ${r.type || '(none)'}${r.typeOther ? ` (${r.typeOther})` : ''}; activity: ${r.use || '(none)'}`,
      `Size: ${dims.length ? dims.join(', ') : '(not given)'}`,
      `Surfaces in this room: ${SF.surfacesOf(r).map(s => `${s.key}${s.kind === 'wall' ? (s.a === 'L' ? ' (long wall)' : s.a === 'W' ? ' (end wall)' : ' (added wall)') : ''}`).join(', ')}`,
    ];
    SF.surfacesOf(r).forEach(s => {
      const cfg = (r.surfaces || {})[s.key] || {}, what = SF.typeText(cfg, s.kind), ops = (cfg.openings || []);
      const n = kind => ops.filter(o => o.kind === kind).reduce((t, o) => t + (isNum(o.count) && o.count >= 1 ? Math.floor(o.count) : 1), 0);
      const extra = s.kind === 'wall' ? [n('door') ? `${n('door')} door(s)` : '', n('window') ? `${n('window')} window(s)` : ''].filter(Boolean) : [];
      if (what || cfg.label || extra.length) lines.push(`${s.key}: ${what || 'type not chosen'}${cfg.label ? `; named "${cfg.label}"` : ''}${extra.length ? `; ${extra.join(', ')}` : ''}`);
    });
    return lines.join('\n');
  }

  /* ---------- the proposal: checked against the app's lists and limits ---------- */
  const UNIT = { m: 1, cm: 0.01, mm: 0.001, ft: 0.3048, in: 0.0254 };
  const DIM_WORD = { L: 'Length', W: 'Width', H: 'Height' };
  const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  const pick = (list, v) => list.find(x => same(x, v)) || null;
  const clean = (v, max) => (typeof v === 'string' && v.trim() ? Array.from(v.trim().replace(/\s+/g, ' ')).slice(0, max).join('') : '');
  const fmtM = v => `${+v.toFixed(2)} m`;
  const openingCount = (cfg, kind) => (cfg.openings || []).filter(o => o.kind === kind).reduce((t, o) => t + (isNum(o.count) && o.count >= 1 ? Math.floor(o.count) : 1), 0);
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  // The one type of a kind whose name or other names hold every word said (SURF.searchTypes), or null.
  const resolve = (kind, words) => { if (!words) return null; const f = SURF().searchTypes(kind, words); return f && f.all && f.types.length === 1 ? f.types[0] : null; };
  const defName = (key, room) => { const d = SURF().surfaceDef(key, room); return d ? d.name : key; };
  // What a change says on the card (build adds what was said, e.g. "(20 ft)", as x.said).
  function labelOf(x, room) {
    const v = x.value, k = String(x.path || '').replace(/^room\./, '');
    if (x.op === 'industry') return `Industry: ${v}`;
    if (x.op === 'type') return `Room type: ${v}`;
    if (x.op === 'set') {
      if (k === 'typeOther') return `Name of the room type: ${v}`;
      if (k === 'use') return `Main activity: ${v}`;
      if (k === 'name') return `Room name: ${v}`;
      if (k === 'occupancy') return `Typical occupancy: ${v} people`;
      return `${DIM_WORD[k] || k}: ${fmtM(v)}`;
    }
    const name = defName(x.key, room);
    if (x.op === 'surface') { const t = SURF().typeOf(SURF().surfaceDef(x.key, room).kind, v); return `${name}: ${t ? t.name : v}`; }
    if (x.op === 'other') return `${name}: Something else, “${v}” (not in the list; kept in your words)`;
    if (x.op === 'label') return `${name} named “${v}”`;
    return `${name}: ${v ? plural(v, x.kind) : `no ${x.kind}s`}${v ? ' (standard size; change it under the wall)' : ''}`;
  }

  /* { items: [{ id, group, label, on, op, … }], notes: [text], questions: [text] }. Groups, in order: Room, Size,
     Walls, Floor and ceiling, Doors and windows. Values the room already has are not listed again. */
  function build(p, room) {
    const items = [], notes = [], SF = SURF(), model = W.get('room').model;
    const add = (group, op, said) => { const x = Object.assign({ id: `v${items.length + 1}`, group, on: true, said: said || '' }, op); x.label = labelOf(x, room) + x.said; items.push(x); };
    const pr = (p && p.room) || {};
    // Industry and room type. A room type in exactly one industry also tells the industry.
    const names = D.INDUSTRIES.map(i => i.name);
    let industry = pr.industry ? pick(names, pr.industry) : null;
    if (pr.industry && !industry) notes.push(`Industry “${clean(pr.industry, 80)}” is not in the list: choose it on the form.`);
    let type = null, typeOther = '';
    if (pr.roomType) {
      const want = clean(pr.roomType, 80);
      if (same(want, D.OTHER_TYPE)) { type = D.OTHER_TYPE; typeOther = clean(pr.roomTypeOther, 80); }
      else {
        const inInd = ind => pick(D.roomTypesFor(ind), want);
        if (industry || room.industry) type = inInd(industry || room.industry);
        if (!type && !industry) {
          const homes = D.INDUSTRIES.filter(i => pick(i.types, want));
          if (homes.length === 1) { industry = homes[0].name; type = pick(homes[0].types, want); }
        }
        if (!type) notes.push(`Room type “${want}” is not in the list for ${industry || room.industry || 'this industry'}: choose it on the form.`);
      }
    }
    if (industry && !same(industry, room.industry)) add('Room', { op: 'industry', value: industry });
    if (type && (!same(type, room.type) || (industry && !same(industry, room.industry)))) add('Room', { op: 'type', value: type }, typeOther ? ` (${typeOther})` : '');
    if (type === D.OTHER_TYPE && typeOther && !same(typeOther, room.typeOther)) add('Room', { op: 'set', path: 'room.typeOther', value: typeOther });
    if (pr.activity) {
      const t = type || room.type, use = t ? pick(TS().knownUses(t), clean(pr.activity, 80)) : null;
      if (use && !same(use, room.use)) add('Room', { op: 'set', path: 'room.use', value: use });
      else if (!use) notes.push(`Activity “${clean(pr.activity, 80)}” is not one of ${t ? `the activities of a ${String(t).toLowerCase()}` : 'the listed activities'}: choose it on the form.`);
    }
    const name = clean(pr.name, 120);
    if (name && !same(name, room.name)) add('Room', { op: 'set', path: 'room.name', value: name });
    // Sizes in metres; length the longer side of the floor.
    const dims = {};
    [['L', 'length'], ['W', 'width'], ['H', 'height']].forEach(([k, f]) => {
      const d = pr[f];
      if (!d || !isNum(d.value) || !(d.value > 0) || !UNIT[d.unit]) return;
      dims[k] = { m: Math.round(d.value * UNIT[d.unit] * 100) / 100, said: d.unit === 'm' ? '' : ` (${+d.value} ${d.unit})` };
    });
    if (dims.L && dims.W && dims.L.m < dims.W.m) { [dims.L, dims.W] = [dims.W, dims.L]; notes.push('Length and width were swapped, so the length is the longer side (walls 1 and 3 run along it).'); }
    Object.entries(dims).forEach(([k, d]) => {
      const err = model.dimError(k, d.m);
      if (err) notes.push(`${DIM_WORD[k]} ${fmtM(d.m)}${d.said} is outside the limits (${err.replace(/^Enter /, '')}): not filled.`);
      else if (d.m !== room[k]) add('Size', { op: 'set', path: `room.${k}`, value: d.m }, d.said);
    });
    if (Number.isInteger(pr.occupancy) && pr.occupancy >= 0) {
      const err = model.occError(Object.assign({}, room, { L: dims.L ? dims.L.m : room.L, W: dims.W ? dims.W.m : room.W, H: dims.H ? dims.H.m : room.H, occupancy: pr.occupancy }));
      if (err) notes.push(`Occupancy ${pr.occupancy}: ${err.charAt(0).toLowerCase()}${err.slice(1)}`);
      else if (pr.occupancy !== room.occupancy) add('Room', { op: 'set', path: 'room.occupancy', value: pr.occupancy });
    }
    // Surfaces: each key once (the last said wins), only those this room has.
    const defs = SF.surfacesOf(room), byKey = new Map();
    (p && p.surfaces || []).forEach(s => { if (s && typeof s.surface === 'string') byKey.set(s.surface.trim().toLowerCase(), s); });
    byKey.forEach((s, key) => {
      const def = defs.find(d => d.key === key);
      if (!def) { notes.push(`“${clean(s.surface, 20)}” is not a surface of this room: add it on the form first, then describe it.`); return; }
      const group = def.kind === 'wall' ? 'Walls' : 'Floor and ceiling', cfg = (room.surfaces || {})[key] || {};
      const id = typeof s.type === 'string' ? s.type.trim() : '', words = clean(s.notListed, 80) || (id && id !== 'other' && !SF.typeOf(def.kind, id) ? clean(id, 80) : '');
      // An id from the list; otherwise the words said, when they name exactly one type of the list by its name or
      // other names (Room Setup's own search); otherwise "Something else" in the rep's words.
      const t = (id !== 'other' && SF.typeOf(def.kind, id)) || resolve(def.kind, words);
      if (t) {
        if (cfg.type !== t.id) add(group, { op: 'surface', key, value: t.id, words }, words && !same(words, t.name) ? ` (said: “${words}”)` : '');
      } else if (!words) notes.push(`${def.name}: what it is was not clear: choose it on the form.`);
      else if (!(cfg.type === 'other' && same((cfg.finishOther || {}).name, words))) add(group, { op: 'other', key, value: words });
      const label = clean(s.name, 60);
      if (label && !same(label, cfg.label)) add(group, { op: 'label', key, value: label });
    });
    // Doors and windows: the count on each wall, as said.
    const counts = new Map();
    (p && p.openings || []).forEach(o => {
      if (!o || typeof o.surface !== 'string' || !['door', 'window'].includes(o.kind) || !Number.isInteger(o.count)) return;
      counts.set(`${o.surface.trim().toLowerCase()}|${o.kind}`, o);
    });
    counts.forEach((o, k) => {
      const [key, kind] = k.split('|'), def = defs.find(d => d.key === key && d.kind === 'wall');
      if (!def) { notes.push(`${kind === 'door' ? 'Doors' : 'Windows'} on “${clean(o.surface, 20)}”: not a wall of this room, so not added.`); return; }
      if (o.count < 0 || o.count > 20) { notes.push(`${def.name}: ${o.count} ${kind}s is not a count the form takes (0–20).`); return; }
      if (openingCount((room.surfaces || {})[key] || {}, kind) !== o.count) add('Doors and windows', { op: 'openings', key, kind, value: o.count });
    });
    const questions = (p && Array.isArray(p.questions) ? p.questions : []).map(q => clean(q, 160)).filter(Boolean).slice(0, 4);
    const ORDER = ['Room', 'Size', 'Walls', 'Floor and ceiling', 'Doors and windows'];
    items.sort((a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group));
    items.forEach((x, i) => { x.id = `v${i + 1}`; });
    return { items, notes, questions };
  }

  /* ---------- filling Room Setup with what was kept ---------- */
  // Industry before room type before activity: each clears what no longer fits the one before.
  const STEP = { industry: 0, type: 1, set: 2, surface: 3, other: 3, label: 4, openings: 5 };
  function applyItems(items, text) {
    const A = W.get('room').actions, ctx = () => ({ project: S.state.project, state: S.state });
    const room = () => S.state.project.room;
    items.slice().sort((a, b) => STEP[a.op] - STEP[b.op]).forEach(x => {
      if (x.op === 'industry') A.setIndustry(ctx(), x.value);
      else if (x.op === 'type') A.setType(ctx(), x.value);
      else if (x.op === 'set') S.set(x.path, x.value);
      else if (x.op === 'surface') A.setSurfaceType(ctx(), `${x.key}|${x.value}`);
      else if (x.op === 'other') { A.setSurfaceType(ctx(), `${x.key}|other`); S.set(`room.surfaces.${x.key}.finishOther`, { name: x.value, notes: 'Described by voice' }); }
      else if (x.op === 'label') S.set(`room.surfaces.${x.key}.label`, x.value);
      else if (x.op === 'openings') {
        for (let guard = 0; guard < 40; guard++) {
          const n = openingCount((room().surfaces || {})[x.key] || {}, x.kind);
          if (n === x.value) break;
          A.stepOpening(ctx(), `${x.key}|${x.kind}|${n < x.value ? 1 : -1}`);
        }
      }
    });
    // What was said, kept with this project only (the latest MAX_NOTES).
    const said = clean(text, 4000);
    if (said) S.update(p => { p.room.voiceNotes = (Array.isArray(p.room.voiceNotes) ? p.room.voiceNotes : []).concat({ at: new Date().toISOString(), text: said }).slice(-MAX_NOTES); });
  }

  /* ---------- changing a proposed value on the card (Edit) ----------
     Each change on the card has an Edit button. It opens, under the change, the same choices as the form: the industries,
     the room types of the industry, the activities of the room type, the wall, floor or ceiling types (searchable and
     grouped, with "Something else" in the rep's words), a box for a name or a size, a count for doors and windows. A
     choice is taken at once; a typed value with Save (or Enter). The value is checked as the form checks it, the change
     is ticked again and marked as changed by the rep. A change that no longer fits another one (a room type of another
     industry, an activity of another room type) says so and is not filled in until it is edited or unticked. */
  // The industry, room type and size the room will have once the ticked changes are in.
  function planned(items, room) {
    const on = (op, path) => items.find(x => x.on && x.op === op && (!path || x.path === path));
    const ind = on('industry'), industry = ind ? ind.value : room.industry;
    const t = on('type'), type = t && D.roomTypesFor(industry).includes(t.value) ? t.value : room.type;
    const dims = {};
    ['L', 'W', 'H'].forEach(k => { const d = on('set', `room.${k}`); dims[k] = d ? d.value : room[k]; });
    return { industry, type, dims };
  }
  // Why a ticked change cannot be filled in as it stands, or ''.
  function problemOf(x, items, room) {
    const p = planned(items, room), k = x.op === 'set' ? x.path : '';
    if (x.op === 'type' && !D.roomTypesFor(p.industry).includes(x.value)) return p.industry ? `Not a room type of ${p.industry}: edit it, or untick it.` : 'It needs its industry: tick the industry, or untick this.';
    if (k === 'room.use' && !(p.type && TS().knownUses(p.type).includes(x.value))) return `Not an activity of ${p.type ? `a ${String(p.type).toLowerCase()}` : 'this room type'}: edit it, or untick it.`;
    if (k === 'room.typeOther' && p.type !== D.OTHER_TYPE) return 'Only used when the room type is Other: untick it.';
    if (k === 'room.occupancy') { const err = W.get('room').model.occError(Object.assign({}, room, p.dims, { occupancy: x.value })); if (err) return `${err.replace(/\.$/, '')}: edit it, or untick it.`; }
    return '';
  }
  // What the Edit of a change offers.
  function editorOf(x, items, room) {
    const p = planned(items, room), k = x.op === 'set' ? x.path.replace(/^room\./, '') : '';
    if (x.op === 'industry') return { kind: 'choice', question: 'Industry', options: D.INDUSTRIES.map(i => i.name) };
    if (x.op === 'type') return { kind: 'choice', question: p.industry ? `Room type in ${p.industry}` : 'Room type', options: D.roomTypesFor(p.industry), empty: 'Keep or choose the industry first.' };
    if (k === 'use') return { kind: 'choice', question: p.type ? `Main activity of a ${String(p.type).toLowerCase()}` : 'Main activity', options: p.type && p.type !== D.OTHER_TYPE ? TS().knownUses(p.type) : [], empty: 'Choose the room type first.' };
    if (DIM_WORD[k]) return { kind: 'size', question: DIM_WORD[k], value: String(x.value), hint: 'In metres, or with the unit: 20 ft, 610 cm.' };
    if (k === 'occupancy') return { kind: 'count', question: 'Typical occupancy (people)', value: String(x.value) };
    if (k) return { kind: 'text', question: k === 'name' ? 'Room name' : 'Name of the room type', value: x.value, max: k === 'name' ? 120 : 80 };
    const def = SURF().surfaceDef(x.key, room) || { kind: 'wall', name: x.key };
    if (x.op === 'label') return { kind: 'text', question: `What ${def.name} is called`, value: x.value, max: 60 };
    if (x.op === 'openings') return { kind: 'stepper', question: `${x.kind === 'door' ? 'Doors' : 'Windows'} on ${def.name}`, value: state.edit ? state.edit.draft : x.value, max: 20 };
    return { kind: 'type', surface: def.kind, question: `What ${def.name} is`, value: x.op === 'other' || (state.edit && state.edit.other) ? 'other' : x.value,
      words: x.op === 'other' ? x.value : x.words || '', room: Object.assign({}, room, { type: p.type }) };
  }
  // A size typed by the rep, in metres (rounded to the centimetre): "6.1", "6,1 m", "20 ft", "20'", "610 cm".
  const SIZE_UNIT = { '': 'm', m: 'm', mtr: 'm', mtrs: 'm', metre: 'm', metres: 'm', meter: 'm', meters: 'm', cm: 'cm', mm: 'mm', ft: 'ft', feet: 'ft', foot: 'ft', "'": 'ft', in: 'in', inch: 'in', inches: 'in', '"': 'in' };
  function parseSize(text) {
    const m = String(text == null ? '' : text).trim().toLowerCase().replace(',', '.').match(/^(\d+(?:\.\d+)?)\s*([a-z'"]*)\.?$/);
    const u = m && SIZE_UNIT[m[2]];
    if (!u) return null;
    const v = Math.round(parseFloat(m[1]) * UNIT[u] * 100) / 100;
    return v > 0 ? v : null;
  }
  const focusOn = id => { const el = document.getElementById(id); if (el) el.focus(); };
  const itemOf = id => state.items.find(y => y.id === id) || null;
  function openEdit(id) {
    const x = itemOf(id);
    if (!x || state.phase !== 'review') return;
    if (state.edit && state.edit.id === id) { closeEdit(); return; }
    set({ edit: { id, draft: x.op === 'openings' ? x.value : null, other: x.op === 'other', error: '' } });
    const first = document.querySelector(`#voice-ed-${id} input, #voice-ed-${id} [aria-pressed="true"], #voice-ed-${id} button`);
    if (first) first.focus();
  }
  function closeEdit() { const id = state.edit && state.edit.id; state.edit = null; render(); if (id) focusOn(`voice-edit-${id}`); }
  function commit(x, patch) {
    Object.assign(x, patch, { on: true, edited: true, said: '' });
    x.label = labelOf(x, S.state.project.room);
    closeEdit();
  }
  const editError = error => { state.edit.error = error; render(); };
  // A choice or a type picked in the open editor: "<change id>|<value>".
  function pickEdit(v) {
    const s = String(v || ''), i = s.indexOf('|'), x = itemOf(s.slice(0, i)), value = s.slice(i + 1);
    if (!x || !state.edit || state.edit.id !== x.id || !S.state.project) return;
    const ed = editorOf(x, state.items, S.state.project.room);
    if (ed.kind === 'choice') { if (ed.options.includes(value)) commit(x, { value }); return; }
    if (ed.kind !== 'type') return;
    if (value === 'other') { state.edit.other = true; state.edit.error = ''; render(); focusOn(`voice-ed-${x.id}-words`); return; }
    const t = SURF().typeOf(ed.surface, value);
    if (t) commit(x, { op: 'surface', value: t.id });
  }
  // Save in the open editor: what was typed (a name, a size, a count, a material in the rep's words), or the count of
  // doors or windows set with − and +.
  function saveEdit(id, raw) {
    const x = itemOf(id);
    if (!x || !state.edit || state.edit.id !== id || !S.state.project) return;
    const room = S.state.project.room, ed = editorOf(x, state.items, room), said = clean(raw, 4000);
    if (ed.kind === 'stepper') { commit(x, { value: state.edit.draft }); return; }
    if (ed.kind === 'type') {
      if (!state.edit.other) return;
      if (!said) { editError('Type what it is, in your words.'); return; }
      commit(x, { op: 'other', value: clean(raw, 80) });
      return;
    }
    if (ed.kind === 'text') { if (!said) { editError('Type it first.'); return; } commit(x, { value: clean(raw, ed.max) }); return; }
    if (ed.kind === 'size') {
      const m = parseSize(raw), k = x.path.replace(/^room\./, '');
      if (m == null) { editError('Type a size, e.g. 6.1 or 20 ft.'); return; }
      const err = W.get('room').model.dimError(k, m);
      if (err) { editError(`${fmtM(m)} is outside the limits: ${err.replace(/^Enter /, 'enter ')}.`); return; }
      commit(x, { value: m });
      return;
    }
    if (ed.kind === 'count') {
      if (!/^\d{1,5}$/.test(said)) { editError('Type a whole number of people.'); return; }
      const n = parseInt(said, 10), err = W.get('room').model.occError(Object.assign({}, room, planned(state.items, room).dims, { occupancy: n }));
      if (err) { editError(err); return; }
      commit(x, { value: n });
    }
  }
  function stepEdit(delta) {
    const x = state.edit && itemOf(state.edit.id);
    if (!x || x.op !== 'openings') return;
    state.edit.draft = Math.max(0, Math.min(20, state.edit.draft + (Number(delta) || 0)));
    render();
  }

  /* ---------- the recording ---------- */
  // 16-bit PCM WAV of mono samples.
  function wav(samples, rate) {
    const n = samples.length, buf = new ArrayBuffer(44 + 2 * n), v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + 2 * n, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, 2 * n, true);
    for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, samples[i])); v.setInt16(44 + 2 * i, s < 0 ? s * 0x8000 : s * 0x7FFF, true); }
    return new Uint8Array(buf);
  }
  function base64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  // Seconds of the recording that are louder than quiet room noise (30 ms frames above -42 dBFS).
  function speechSeconds(samples, rate) {
    const n = Math.max(1, Math.round(rate * 0.03));
    let loud = 0;
    for (let i = 0; i + n <= samples.length; i += n) {
      let e = 0;
      for (let j = i; j < i + n; j++) e += samples[j] * samples[j];
      if (Math.sqrt(e / n) > 0.0079) loud++;
    }
    return loud * n / rate;
  }
  async function toMono16k(buffer) {
    const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const off = new Off(1, Math.max(1, Math.ceil(buffer.duration * RATE)), RATE), src = off.createBufferSource();
    src.buffer = buffer; src.connect(off.destination); src.start();
    return (await off.startRendering()).getChannelData(0);
  }
  function micMessage(e) {
    const n = e && e.name;
    if (n === 'NotAllowedError' || n === 'SecurityError') return 'The microphone is blocked for this site. Allow it from the lock icon in the address bar, then try again.';
    if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'No microphone was found. Connect one, or check that the laptop\'s microphone is turned on.';
    if (n === 'NotReadableError') return 'The microphone is being used by another app. Close it, then try again.';
    return 'The microphone could not be started. Try again.';
  }
  const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  // The timer and level are drawn straight into the card (ten times a second, without drawing the whole page).
  function tick() {
    if (!rec) return;
    const s = (performance.now() - rec.started) / 1000, a = rec.data;
    rec.an.getFloatTimeDomainData(a);
    let e = 0;
    for (let i = 0; i < a.length; i++) e += a[i] * a[i];
    const level = Math.min(1, Math.sqrt(e / a.length) * 6);
    const t = document.getElementById('voice-time'), l = document.getElementById('voice-level-bar');
    if (t) t.textContent = mmss(s);
    if (l) l.style.transform = `scaleX(${level.toFixed(3)})`;
    if (s >= MAX_S) stop();
  }
  async function start() {
    if (rec) return;
    cancelRequest();
    const md = navigator.mediaDevices;
    if (!md || !md.getUserMedia || typeof window.MediaRecorder === 'undefined') { fail('This browser cannot record here. Use Chrome or Edge on the laptop.'); return; }
    set(Object.assign(fresh(), { phase: 'recording' }));
    let stream;
    try {
      stream = await md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    } catch (e) { fail(micMessage(e)); return; }
    if (state.phase !== 'recording') { stream.getTracks().forEach(t => t.stop()); return; } // cancelled while asking
    const Ctx = window.AudioContext || window.webkitAudioContext, ctx = new Ctx(), an = ctx.createAnalyser();
    an.fftSize = 2048;
    ctx.createMediaStreamSource(stream).connect(an);
    const mr = new MediaRecorder(stream), chunks = [];
    mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec = { stream, ctx, an, mr, chunks, data: new Float32Array(an.fftSize), started: performance.now() };
    mr.start(250);
    rec.timer = setInterval(tick, 100);
    render();
  }
  function release(r) {
    clearInterval(r.timer);
    try { if (r.mr.state !== 'inactive') r.mr.stop(); } catch (e) { /* already stopped */ }
    r.stream.getTracks().forEach(t => t.stop());
  }
  async function stop() {
    if (!rec) return;
    const r = rec;
    rec = null;
    const stopped = new Promise(res => { r.mr.onstop = res; });
    release(r);
    set({ phase: 'working', step: 'Listening to what you said…' });
    try {
      await stopped;
      const blob = new Blob(r.chunks, { type: r.mr.mimeType || 'audio/webm' });
      const samples = await toMono16k(await r.ctx.decodeAudioData(await blob.arrayBuffer()));
      r.ctx.close();
      if (state.phase !== 'working') return; // cancelled meanwhile
      if (speechSeconds(samples, RATE) < 0.4) { set(Object.assign(fresh(), { notice: 'Nothing was heard. Speak a little louder, close to the laptop, and try again.' })); return; }
      await send({ audio: base64(wav(samples, RATE)) });
    } catch (e) {
      try { r.ctx.close(); } catch (x) { /* closed */ }
      if (state.phase === 'working') fail('The recording could not be read. Try again.');
    }
  }
  function cancelRequest() { if (pending) { pending.abort(); pending = null; } }
  // Stops everything (the card was closed or cancelled): the microphone is released, a request still on its way is dropped.
  function close() {
    if (rec) { const r = rec; rec = null; release(r); try { r.ctx.close(); } catch (e) { /* closed */ } }
    cancelRequest();
    state = fresh();
  }
  function cancel() { close(); render(); }

  /* ---------- the server ---------- */
  async function send(extra) {
    const p = S.state.project;
    if (!p) return;
    const id = p.id, ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 75000);
    cancelRequest();
    pending = ctrl;
    set({ phase: 'working', step: extra.audio ? 'Listening to what you said…' : 'Reading the description…', error: null, notice: null });
    let res = null, data = null;
    try {
      res = await fetch(api('voice-room'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', credentials: 'same-origin', signal: ctrl.signal,
        body: JSON.stringify(Object.assign({ catalog: catalog(), room: roomNow(p.room) }, extra)) });
      try { data = await res.json(); } catch (e) { data = null; }
    } catch (e) {
      if (pending !== ctrl) return; // replaced or cancelled
      pending = null;
      fail(e && e.name === 'AbortError' ? 'The voice service did not answer in time. Try again with a shorter description.' : 'The server could not be reached. Check the internet connection and try again.');
      return;
    } finally { clearTimeout(timer); }
    if (pending !== ctrl) return;
    pending = null;
    if (!S.state.project || S.state.project.id !== id) { state = fresh(); return; } // another project was opened meanwhile
    if (!res.ok || !data) { fail((data && data.message) || ([404, 405, 501].includes(res.status) ? 'Voice is not available on this server.' : 'The voice request failed. Try again.')); return; }
    if (data.status === 'empty') { set(Object.assign(fresh(), { notice: 'Nothing was heard. Speak a little louder, close to the laptop, and try again.' })); return; }
    if (data.status !== 'ok' || !data.proposal) { fail(data.message || 'The voice request failed. Try again.'); return; }
    const b = build(data.proposal, S.state.project.room);
    set({ phase: 'review', step: '', text: String(data.text || ''), textKey: state.textKey + 1, items: b.items, notes: b.notes, questions: b.questions, edit: null });
  }
  function checkHealth() {
    if (location.protocol === 'file:') { health = 'unreachable'; return; }
    health = 'checking';
    fetch(api('health'), { cache: 'no-store' }).then(r => r.json()).then(d => { health = d && d.voice === 'configured' ? 'configured' : d && d.ok ? 'not_configured' : 'unreachable'; })
      .catch(() => { health = 'unreachable'; }).then(render);
  }

  /* ---------- what the card shows, and its actions ---------- */
  // Ticked, and fitting the other ticked changes: what "Fill in Room Setup" fills in.
  const keptOf = room => state.items.filter(x => x.on && !problemOf(x, state.items, room));
  function view() {
    const room = S.state.project ? S.state.project.room : null, groups = [];
    const items = state.items.map(x => Object.assign({}, x, { problem: room && x.on ? problemOf(x, state.items, room) : '' }));
    items.forEach(x => { let g = groups.find(y => y.name === x.group); if (!g) groups.push(g = { name: x.group, items: [] }); g.items.push(x); });
    const ed = state.edit && room ? itemOf(state.edit.id) : null;
    const editor = ed ? Object.assign({ value: ed.value }, editorOf(ed, state.items, room), { id: ed.id, other: state.edit.other, error: state.edit.error }) : null;
    return Object.assign({}, state, { items, groups, kept: items.filter(x => x.on && !x.problem).length, editor, health, max: MAX_S, recording: !!rec });
  }
  AM.services.voiceRoom = {
    MAX_S, RATE,
    view, catalog, roomNow, build, applyItems, wav, base64, speechSeconds, parseSize,
    // Each time the card opens it asks the server again whether voice is set up (keys can be added while it runs).
    open() { close(); checkHealth(); S.ui({ sheet: { kind: 'voice' } }); },
    start, stop, cancel, close,
    readText(text) { const t = clean(text, 4000); if (!t) { set({ notice: 'Type or say what the room is like first.' }); return; } send({ text: t }); },
    toggle(id) { const x = state.items.find(y => y.id === id); if (x) { x.on = !x.on; render(); } },
    edit: openEdit, editCancel: closeEdit, editPick: pickEdit, editSave: saveEdit, editStep: stepEdit,
    apply() {
      if (state.phase !== 'review' || !S.state.project || state.edit) return;
      const kept = keptOf(S.state.project.room), text = state.text;
      if (!kept.length) return;
      applyItems(kept, text);
      close();
      S.ui({ sheet: null });
      S.toast(`Room Setup filled in from your description: ${plural(kept.length, 'change')}. Check it before you continue.`);
    },
  };
})(window.AM);
