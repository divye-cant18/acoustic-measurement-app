/* Tests of Voice Room Setup (js/services/voice-room.js, src/shell/VoicePanel.tsx) in the whole application
   (tests/voice-room.html). The server (/api/voice-room, /api/health) and the microphone are fakes here: nothing is sent
   anywhere and no real microphone is used. Results on the page and in window.VOICE_ROOM_TEST (window.VOICE_ROOM_DONE
   resolves). Expected sizes are worked out by hand in the comments.

    1 what the AI may choose from: the app's own lists, every type and its other names; the room as it is
    2 checking a proposal: feet to metres, limits, length the longer side, a room type that tells its industry, names
      not in a list left out with a note, a material named by its other names, "Something else" in the rep's words,
      walls the room does not have, door and window counts, nothing proposed that the room already has
    3 filling Room Setup with what was kept: through the step's actions; Something else named; doors and windows at the
      standard size; what was said kept with the project, on this device
    4 the recording: 16-bit mono WAV, speech against silence, the whole path from a (fake) microphone to the request
    5 the pop-up card: opened from Room Setup, nothing filled in before "Fill in Room Setup", an unticked change left out,
      the server's messages, nothing heard, closed while waiting, not set up
    6 Edit on the card: a wall's type searched and picked, "Something else" in the rep's words, an industry changed (the
      room type and activity that no longer fit say so and are held back until edited), a size in feet, a size outside
      the limits, Escape, the count of windows, a name with Enter; then filled in as edited */
(function () {
  'use strict';
  const results = window.VOICE_ROOM_TEST = [];
  const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) }); show(); };
  const status = t => { const el = document.getElementById('vr-status'); if (el) el.textContent = t; };
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  function show() {
    const el = document.getElementById('vr-out');
    if (el) el.innerHTML = results.map(t => `<li class="${t.ok ? 'ok' : 'bad'}"><b>${t.ok ? 'PASS' : 'FAIL'}</b> ${esc(t.name)}<br><small>${esc(t.detail)}</small></li>`).join('');
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const json = o => JSON.stringify(o);
  const until = async (fn, ms = 8000) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (fn()) return true; await sleep(40); } return !!fn(); };

  // Before the app loads: a clean store under this page's prefix.
  (function seed() {
    const P = 'voice-room-test:';
    [localStorage, sessionStorage].forEach(st => {
      const keys = [];
      for (let i = 0; i < st.length; i++) { const k = st.key(i); if (k && k.startsWith(P)) keys.push(k.slice(P.length)); }
      keys.forEach(k => st.removeItem(k));
    });
  })();

  /* ---------- the fake server ---------- */
  const server = { health: 'configured', answer: null, requests: [], hold: null };
  const realFetch = window.fetch.bind(window);
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  window.fetch = async (url, opts) => {
    const u = String(url);
    if (/\/api\/health$/.test(u)) return reply(200, { ok: true, store: 'not_configured', voice: server.health });
    if (/\/api\/voice-room$/.test(u)) {
      const body = JSON.parse(opts.body);
      server.requests.push(body);
      if (server.hold) await server.hold;
      if (opts.signal && opts.signal.aborted) throw new DOMException('aborted', 'AbortError');
      const [st, b] = typeof server.answer === 'function' ? server.answer(body) : server.answer;
      return reply(st, b);
    }
    return realFetch(url, opts);
  };
  const ok = (proposal, text = 'what was said') => [200, { status: 'ok', text, proposal }];
  const P = (room = {}, surfaces = [], openings = [], questions = []) => ({
    room: Object.assign({ name: null, industry: null, roomType: null, roomTypeOther: null, activity: null, length: null, width: null, height: null, occupancy: null }, room),
    surfaces, openings, questions,
  });

  /* ---------- the fake microphone: a tone, as speech would be heard ---------- */
  const mic = { constraints: null, calls: 0 };
  function fakeMic() {
    navigator.mediaDevices.getUserMedia = async c => {
      mic.calls++;
      mic.constraints = c;
      const Ctx = window.AudioContext || window.webkitAudioContext, ctx = new Ctx(), osc = ctx.createOscillator(), g = ctx.createGain(), dest = ctx.createMediaStreamDestination();
      osc.frequency.value = 220; g.gain.value = 0.2; // about -17 dBFS: speech level
      osc.connect(g).connect(dest); osc.start();
      if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) { /* stays suspended */ } }
      mic.ctx = ctx;
      return dest.stream;
    };
  }

  async function run() {
    await window.APP_READY;
    await sleep(200);
    const A = window.AM, S = A.store, W = A.workflow, D = A.demo, SF = A.services.surfaces, TS = A.services.target, RF = A.roomFormData, VR = A.services.voiceRoom;
    const act = W.get('room').actions, ctx = () => ({ project: S.state.project, state: S.state });
    const p = () => S.state.project, room = () => p().room;
    S.startProject('new');
    S.go('room');
    await sleep(150);

    /* ===== 1. what the AI may choose from ===== */
    status('Lists…');
    {
      const cat = VR.catalog(), kinds = ['wall', 'floor', 'ceiling'];
      const missing = kinds.flatMap(k => SF.typesOf(k).filter(t => !cat.includes(t.id === 'other' ? '- other: Something else' : `- ${t.id}: ${t.name}`)).map(t => `${k}:${t.id}`));
      const industries = D.INDUSTRIES.filter(i => !cat.includes(`- ${i.name}: ${i.types.join(' | ')}`)).map(i => i.name);
      check('The lists sent are the app\'s own: every industry with its room types, every wall, floor and ceiling type by id and name, with their other names (POP, sheesha, Kota) and each room type\'s activities',
        !missing.length && !industries.length && /gypsum-ceiling: Gypsum or POP false ceiling; POP/.test(cat) && /sheesha/.test(cat) && /Kota/.test(cat) && cat.includes(`- Conference room: ${TS.knownUses('Conference room').join(' | ')}`),
        `${cat.length} characters; missing: ${[...missing, ...industries].join(', ') || 'none'}`);
      const r = Object.assign(D.demoRoom(), { name: 'Demo', L: 8, W: 5, H: 3 });
      const now = VR.roomNow(r);
      check('The room as it is: its name, size, which walls are long and which are end walls, and what each surface is now',
        /Name: Demo/.test(now) && /length 8 m, width 5 m, height 3 m/.test(now) && /wall1 \(long wall\), wall2 \(end wall\), wall3 \(long wall\), wall4 \(end wall\), floor, ceiling/.test(now)
          && now.includes(`wall1: ${SF.typeText(r.surfaces.wall1, 'wall')}`), now.split('\n').slice(0, 3).join(' / '));
    }

    /* ===== 2. checking a proposal ===== */
    status('Checking a proposal…');
    {
      const r = room();
      // A room type found in one industry only tells its industry; one in several does not.
      const only = [...new Set(D.INDUSTRIES.flatMap(i => i.types))].find(t => t !== D.OTHER_TYPE && D.INDUSTRIES.filter(i => i.types.includes(t)).length === 1);
      const home = D.INDUSTRIES.find(i => i.types.includes(only)).name;
      // 26 ft = 7.9248 → 7.92 m; 16 ft = 4.8768 → 4.88 m; 10 ft = 3.048 → 3.05 m.
      const b = VR.build(P({ name: '  Board   room ', roomType: only, length: { value: 16, unit: 'ft' }, width: { value: 26, unit: 'ft' }, height: { value: 10, unit: 'ft' } },
        [{ surface: 'wall1', type: 'glass', notListed: null, name: 'Glass wall' }, { surface: 'wall2', type: 'moss-wall', notListed: 'green moss wall', name: null },
          { surface: 'wall3', type: 'other', notListed: 'jute fabric covering', name: null }, { surface: 'wall9', type: 'glass', notListed: null, name: null },
          { surface: 'floor', type: 'Kota stone', notListed: null, name: null }, { surface: 'ceiling', type: 'gypsum-ceiling', notListed: null, name: null }],
        [{ surface: 'wall3', kind: 'window', count: 2 }, { surface: 'wall4', kind: 'door', count: 1 }, { surface: 'wall9', kind: 'door', count: 1 }, { surface: 'wall1', kind: 'door', count: 25 }],
        ['How high is the ceiling?', 'q2', 'q3', 'q4', 'q5']), r);
      const lab = b.items.map(x => x.label), by = re => b.items.find(x => re.test(x.label));
      check(`A room type found in one industry only (${only}) also gives its industry (${home}); the name is tidied`,
        by(/^Industry:/) && by(/^Industry:/).value === home && by(/^Room type:/).value === only && by(/^Room name:/).value === 'Board room', lab.slice(0, 3).join(' · '));
      check('Feet to metres, rounded to the centimetre, and the longer side made the length (16 × 26 ft said: 7.92 × 4.88 m, height 3.05 m), with a note',
        by(/^Length:/).value === 7.92 && by(/^Width:/).value === 4.88 && by(/^Height:/).value === 3.05 && /Length: 7\.92 m \(26 ft\)/.test(lab.join()) && b.notes.some(n => /swapped/.test(n)),
        lab.filter(l => /^(Length|Width|Height)/.test(l)).join(' · '));
      check('Materials: an id from the list; words naming exactly one type by its other names ("green moss wall" → green wall, "Kota stone" → marble, granite or Kota stone); otherwise "Something else" in the rep\'s words',
        by(/^Wall 1: Glass wall/).value === 'glass' && by(/^Wall 2: Green wall/).value === 'green-wall' && by(/^Floor: Marble, granite or Kota stone/).value === 'stone'
          && by(/^Wall 3: Something else, “jute fabric covering”/).op === 'other' && by(/^Ceiling: Gypsum or POP/).value === 'gypsum-ceiling' && by(/Wall 1 named “Glass wall”/).op === 'label',
        lab.filter(l => /^(Wall|Floor|Ceiling)/.test(l)).join(' · '));
      check('A wall the room does not have, and a count the form does not take, are left out with a note; two windows on Wall 3 and a door on Wall 4 are kept',
        !lab.some(l => /Wall 9/.test(l)) && b.notes.filter(n => /wall9/.test(n)).length === 2 && b.notes.some(n => /25 doors/.test(n))
          && by(/^Wall 3: 2 windows/).value === 2 && by(/^Wall 4: 1 door/).value === 1, b.notes.join(' | '));
      check('Questions: at most four; the changes are grouped Room, Size, Walls, Floor and ceiling, Doors and windows; all ticked',
        json(b.questions) === json(['How high is the ceiling?', 'q2', 'q3', 'q4']) && json([...new Set(b.items.map(x => x.group))]) === json(['Room', 'Size', 'Walls', 'Floor and ceiling', 'Doors and windows']) && b.items.every(x => x.on),
        [...new Set(b.items.map(x => x.group))].join(', '));
      const bad = VR.build(P({ industry: 'Space stations', roomType: 'Moon base', height: { value: 50, unit: 'm' }, activity: 'Juggling' }), r);
      check('Names not in a list (an industry, a room type, an activity) and a height outside the limits (50 m, limit 1.8–30 m) are left out with notes, never guessed',
        !bad.items.length && bad.notes.length === 4 && bad.notes.some(n => /Space stations/.test(n)) && bad.notes.some(n => /Moon base/.test(n)) && bad.notes.some(n => /Height 50 m is outside the limits \(1\.8–30 m\)/.test(n)) && bad.notes.some(n => /Juggling/.test(n)),
        bad.notes.join(' | '));
    }

    /* ===== 3. filling Room Setup ===== */
    status('Filling Room Setup…');
    {
      const r = room(), ind = 'Corporate offices and meeting rooms', type = 'Conference room', use = TS.knownUses(type)[1];
      const b = VR.build(P({ name: 'Board room', industry: ind, roomType: type, activity: use, length: { value: 8, unit: 'm' }, width: { value: 500, unit: 'cm' }, height: { value: 3, unit: 'm' }, occupancy: 12 },
        [{ surface: 'wall1', type: 'acp-cladding', notListed: null, name: null }, { surface: 'wall2', type: 'other', notListed: 'jute wall covering', name: null }, { surface: 'ceiling', type: 'grid-tiles', notListed: null, name: null }],
        [{ surface: 'wall3', kind: 'window', count: 2 }, { surface: 'wall4', kind: 'door', count: 1 }]), r);
      VR.applyItems(b.items, 'Board room, eight by five, three metres high');
      const s = room().surfaces, wins = (s.wall3.openings || []).filter(o => o.kind === 'window');
      check('Filled through the step\'s own actions: industry, room type, activity, name, 8 × 5 × 3 m, 12 people; the step can now be finished',
        room().industry === ind && room().type === type && room().use === use && room().name === 'Board room' && room().L === 8 && room().W === 5 && room().H === 3 && room().occupancy === 12 && W.get('room').canContinue(p()).ok,
        json({ industry: room().industry, type: room().type, use: room().use, L: room().L, W: room().W, H: room().H }));
      check('Surfaces as chosen with buttons: ACP cladding (metal, no sound data), "Something else" named "jute wall covering" (listed for review), grid ceiling with its typical data',
        s.wall1.type === 'acp-cladding' && s.wall1.construction === 'metal' && s.wall1.material === '' && s.wall2.type === 'other' && s.wall2.finishOther.name === 'jute wall covering'
          && SF.customMaterials(room()).some(c => c.name === 'jute wall covering') && s.ceiling.type === 'grid-tiles' && s.ceiling.material === SF.typeOf('ceiling', 'grid-tiles').material,
        `${s.wall1.type}; ${json(s.wall2.finishOther)}; ${s.ceiling.type}`);
      check('Two windows on Wall 3 and a door on Wall 4, each at the standard size (window 1.2 × 1.2 m, door 0.9 × 2.1 m)',
        wins.reduce((t, o) => t + (o.count || 1), 0) === 2 && wins.every(o => o.widthM === 1.2 && o.heightM === 1.2) && s.wall4.openings.filter(o => o.kind === 'door').length === 1 && s.wall4.openings[0].widthM === 0.9 && s.wall4.openings[0].heightM === 2.1,
        json(wins));
      const notes = room().voiceNotes, saved = JSON.parse(localStorage.getItem(`acoustic-measurement-prototype:p:${p().id}`) || 'null');
      check('What was said is kept with this project, with its time, and saved on this device',
        Array.isArray(notes) && notes.length === 1 && notes[0].text === 'Board room, eight by five, three metres high' && !isNaN(Date.parse(notes[0].at)) && saved && saved.room.voiceNotes && saved.room.voiceNotes.length === 1,
        json(notes));
      const again = VR.build(P({ name: 'Board room', industry: ind, roomType: type, length: { value: 8, unit: 'm' } }, [{ surface: 'wall1', type: 'acp-cladding', notListed: null, name: null }], [{ surface: 'wall3', kind: 'window', count: 2 }]), room());
      check('Saying again what the room already has proposes nothing', !again.items.length, json(again.items.map(x => x.label)));
      // Fewer windows than there are: the count comes down.
      VR.applyItems(VR.build(P({}, [], [{ surface: 'wall3', kind: 'window', count: 1 }]), room()).items, '');
      check('A smaller count takes windows off (2 → 1), and nothing is kept for an empty description', (room().surfaces.wall3.openings || []).filter(o => o.kind === 'window').reduce((t, o) => t + (o.count || 1), 0) === 1 && room().voiceNotes.length === 1,
        json(room().surfaces.wall3.openings));
    }

    /* ===== 4. the recording ===== */
    status('Recording…');
    {
      const w = VR.wav(new Float32Array([0, 1, -1, 0.5]), 16000), v = new DataView(w.buffer), tag = (o, n) => String.fromCharCode(...w.slice(o, o + n));
      check('The recording is a 16 kHz, 16-bit mono WAV: header and samples (1 → 32767, -1 → -32768, 0.5 → 16383)',
        tag(0, 4) === 'RIFF' && tag(8, 4) === 'WAVE' && v.getUint16(20, true) === 1 && v.getUint16(22, true) === 1 && v.getUint32(24, true) === 16000 && v.getUint16(34, true) === 16
          && v.getUint32(40, true) === 8 && v.getInt16(46, true) === 32767 && v.getInt16(48, true) === -32768 && v.getInt16(50, true) === 16383 && w.length === 52, `${w.length} bytes`);
      const tone = (s, amp) => Float32Array.from({ length: Math.round(16000 * s) }, (_, i) => amp * Math.sin(2 * Math.PI * 200 * i / 16000));
      const silent = VR.speechSeconds(new Float32Array(16000), 16000), quiet = VR.speechSeconds(tone(1, 0.003), 16000), loud = VR.speechSeconds(tone(1, 0.1), 16000);
      check('Speech against silence: silence and quiet noise (-50 dBFS) count 0 s; a voice-level sound for 1 s counts about 1 s (threshold -42 dBFS)',
        silent === 0 && quiet === 0 && loud > 0.9 && loud <= 1.0, `silence ${silent}, quiet ${quiet}, loud ${loud.toFixed(2)}`);

      // The whole path, with a fake microphone: speech mode, a WAV at 16 kHz, sent with the lists and the room.
      fakeMic();
      server.requests = [];
      server.answer = ok(P({ name: 'Recorded room' }), 'Recorded room');
      VR.open();
      await sleep(100);
      await VR.start();
      await sleep(1300);
      await VR.stop();
      await until(() => VR.view().phase === 'review' || VR.view().phase === 'error' || VR.view().phase === 'idle', 15000);
      const sent = server.requests[0] || {}, audio = sent.audio ? Uint8Array.from(atob(sent.audio), c => c.charCodeAt(0)) : null;
      const secs = audio ? new DataView(audio.buffer).getUint32(40, true) / 32000 : 0, rate = audio ? new DataView(audio.buffer).getUint32(24, true) : 0;
      const c = (mic.constraints || {}).audio || {};
      check('From a (fake) microphone: opened for speech (echo cancellation, noise suppression, automatic level), recorded about 1.3 s, sent as a 16 kHz WAV with the lists and the room; the card then shows the changes',
        c.echoCancellation === true && c.noiseSuppression === true && c.autoGainControl === true && rate === 16000 && secs > 0.9 && secs < 2.5 && typeof sent.catalog === 'string' && /Room as|Name:/.test(sent.room) && VR.view().phase === 'review' && VR.view().items.some(x => x.value === 'Recorded room'),
        `phase ${VR.view().phase}${VR.view().error ? ` (${VR.view().error})` : ''}; ${secs.toFixed(2)} s at ${rate} Hz; mic calls ${mic.calls}`);
      VR.cancel();
      S.ui({ sheet: null });
      if (mic.ctx) mic.ctx.close();
    }

    /* ===== 5. the pop-up card ===== */
    status('The card…');
    {
      S.go('room');
      await sleep(150);
      const app = document.getElementById('app'), q = sel => document.querySelector(sel);
      const before = JSON.stringify(room());
      server.health = 'configured';
      app.querySelector('#voice-open').click();
      await until(() => q('#voice-start') && !q('#voice-start').disabled);
      const sheet = q('.sheet.sheet-pop');
      check('"Describe by voice" on Room Setup opens the pop-up card: what to say, "Start speaking"; nothing in the room changed',
        S.state.ui.sheet && S.state.ui.sheet.kind === 'voice' && sheet && /Describe the room/.test(sheet.textContent) && /length, width and height/.test(sheet.textContent) && !!q('#voice-start') && JSON.stringify(room()) === before,
        sheet ? sheet.className : 'no sheet');
      // Typed text (as after correcting what was heard): the server answers, the card shows each change with a tick.
      server.requests = [];
      server.answer = ok(P({ name: 'Training room A', height: { value: 3.2, unit: 'm' } }, [{ surface: 'floor', type: 'carpet-tiles', notListed: null, name: null }], [], ['What is the room used for?']), 'Training room A, 3.2 metres high, carpet tiles');
      VR.readText('Training room A, 3.2 metres high, carpet tiles');
      await until(() => q('#voice-apply'));
      const items = [...document.querySelectorAll('.voice-item')];
      check('The confirm card: what was heard (editable), each change with a tick, the questions still open, and "Fill in Room Setup (3)"; nothing filled in yet',
        q('#voice-text') && q('#voice-text').value === 'Training room A, 3.2 metres high, carpet tiles' && items.length === 3 && items.every(b => b.getAttribute('aria-checked') === 'true')
          && /What is the room used for\?/.test(q('.sheet').textContent) && /Fill in Room Setup \(3\)/.test(q('#voice-apply').textContent) && room().name !== 'Training room A' && server.requests[0].text === 'Training room A, 3.2 metres high, carpet tiles',
        items.map(b => b.textContent).join(' · '));
      const heightBtn = items.find(b => /Height/.test(b.textContent));
      heightBtn.click();
      await until(() => heightBtn.getAttribute('aria-checked') === 'false' || (q(`#${heightBtn.id}`) && q(`#${heightBtn.id}`).getAttribute('aria-checked') === 'false'));
      q('#voice-apply').click();
      await until(() => !S.state.ui.sheet);
      check('An unticked change (the height) is left out; the rest is filled in, the card closes and says what happened',
        !S.state.ui.sheet && room().name === 'Training room A' && room().H === 3 && room().surfaces.floor.type === 'carpet-tiles' && /2 changes/.test(S.state.ui.toast || ''),
        `${room().name}, H ${room().H}, floor ${room().surfaces.floor.type}; toast: ${S.state.ui.toast}`);
      await sleep(80);
      check('Room Setup lists what was said, kept with this project', /2 descriptions kept with this project/.test(app.textContent) && room().voiceNotes.length === 2, room().voiceNotes.map(n => n.text).join(' | '));

      // The server's own message, in words; nothing heard; the card closed while the server is still answering.
      VR.open();
      await until(() => q('#voice-start'));
      server.answer = [429, { status: 'failed', reason: 'ai_quota', message: 'Today\'s free voice allowance is used up. Fill Room Setup by hand; voice works again after 5:30 AM India time.' }];
      VR.readText('anything');
      await until(() => VR.view().phase === 'error');
      check('A failure shows the server\'s message in words, with "Try again"', /free voice allowance is used up/.test(q('.sheet').textContent) && /Try again/.test(q('#voice-start').textContent), VR.view().error);
      server.answer = [200, { status: 'empty', text: '' }];
      VR.readText('anything');
      await until(() => VR.view().phase === 'idle');
      check('Nothing heard: the card says so and offers to try again', /Nothing was heard/.test(q('.sheet').textContent), VR.view().notice);
      let release;
      server.hold = new Promise(r => { release = r; });
      server.answer = ok(P({ name: 'Should not appear' }));
      const nameBefore = room().name;
      VR.readText('late answer');
      await until(() => VR.view().phase === 'working');
      q('#sheet-close').click();
      await sleep(50);
      release();
      server.hold = null;
      await sleep(200);
      check('Closed while the server is still answering: the answer is dropped and nothing is filled in', !S.state.ui.sheet && VR.view().phase === 'idle' && room().name === nameBefore, `${VR.view().phase}; ${room().name}`);

      // Not set up on the server: the card says so, and "Start speaking" is off.
      server.health = 'not_configured';
      VR.open();
      await until(() => /Voice is not set up on this server yet/.test((q('.sheet') || {}).textContent || ''));
      check('Voice not set up on the server (no Cloudflare keys): the card says so and "Start speaking" is off; Room Setup can still be filled in by hand',
        /Voice is not set up on this server yet/.test(q('.sheet').textContent) && q('#voice-start').disabled, q('.note-warn') && q('.note-warn').textContent);
      server.health = 'configured';
      const ids = [...document.querySelectorAll('[id]')].map(e => e.id), dup = [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];
      check('No id is used twice with the card open', !dup.length, dup.join(', ') || 'none');
      S.ui({ sheet: null });
    }

    /* ===== 6. Edit on the card ===== */
    status('Edit…');
    {
      const sz = ['6.1', '6,1 m', '20 ft', "20'", '610 cm', '6100mm', '240 in', '20 feet'].map(VR.parseSize), badSz = ['abc', '0', '-3', '6 yards', ''].map(VR.parseSize);
      // 20 ft = 6.096 m → 6.1; 240 in = 6.096 m → 6.1.
      check('A size typed on the card: metres by default, or with its unit (6.1 · 6,1 m · 20 ft · 20\' · 610 cm · 6100mm · 240 in · 20 feet are all 6.1 m); anything else is not a size',
        sz.every(v => v === 6.1) && badSz.every(v => v === null), `${json(sz)} / ${json(badSz)}`);

      S.startProject('new');
      S.go('room');
      await sleep(150);
      const q = sel => document.querySelector(sel), row = re => VR.view().items.find(x => re.test(x.label));
      const editBtn = re => q(`#voice-edit-${row(re).id}`);
      const setVal = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
      const key = (el, k) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
      const corp = 'Corporate offices and meeting rooms', edu = 'Education and training facilities';
      server.answer = ok(P({ name: 'Meeting Room 2', industry: corp, roomType: 'Conference room', activity: TS.knownUses('Conference room')[0], length: { value: 20, unit: 'ft' }, width: { value: 14, unit: 'ft' }, height: { value: 9, unit: 'ft' } },
        [{ surface: 'wall1', type: 'glass', notListed: null, name: null }, { surface: 'wall2', type: 'other', notListed: 'jute wall covering', name: null }, { surface: 'floor', type: 'carpet-tiles', notListed: null, name: null }],
        [{ surface: 'wall3', kind: 'window', count: 2 }]), 'Meeting room two…');
      VR.open();
      await until(() => q('#voice-start'));
      VR.readText('Meeting room two…');
      await until(() => q('#voice-apply'));
      const all = VR.view().items.length;
      check('Every change on the card has its own Edit button', document.querySelectorAll('.voice-edit').length === all && all === 11, `${document.querySelectorAll('.voice-edit').length} Edit buttons for ${all} changes: ${VR.view().items.map(x => x.label).join(' · ')}`);

      // A wall: the form's own choices (search, groups, "Something else"), the type it has now picked.
      const w1 = row(/^Wall 1:/), ed1 = `voice-ed-${w1.id}`;
      editBtn(/^Wall 1:/).click();
      const search = q(`#${ed1}-type-q`);
      check('Edit on "Wall 1: Glass" opens, under it, the wall types as on the form: a search box (with the focus), the groups, "Something else"; Glass is picked; "Fill in Room Setup" waits until the edit is saved or cancelled',
        q(`#${ed1}`) && search && document.activeElement === search && q(`#${ed1}-type-glass`).getAttribute('aria-pressed') === 'true' && q(`#${ed1}-type-other`) && document.querySelectorAll(`#${ed1} .type-pick-g`).length > 4
          && q(`#voice-edit-${w1.id}`).getAttribute('aria-expanded') === 'true' && q('#voice-apply').getAttribute('aria-disabled') === 'true',
        `${document.querySelectorAll(`#${ed1} .type-pick-g`).length} rows; focus ${document.activeElement && document.activeElement.id}`);
      setVal(search, 'ACP');
      const found = [...document.querySelectorAll(`#${ed1} .chip`)].map(b => b.id.replace(`${ed1}-type-`, ''));
      q(`#${ed1}-type-acp-cladding`).click();
      const w1b = VR.view().items.find(x => x.id === w1.id);
      check('Searching "ACP" finds ACP cladding; picking it changes the change at once: "Wall 1: ACP or aluminium composite cladding · changed by you", still ticked, the edit closed and the focus back on its Edit button',
        found.includes('acp-cladding') && found.includes('other') && found.length === 2 && w1b.value === 'acp-cladding' && w1b.op === 'surface' && w1b.on && w1b.edited && !q(`#${ed1}`)
          && /^Wall 1: ACP or aluminium composite cladding · changed by you$/.test(q(`#voice-item-${w1.id}`).textContent) && document.activeElement === q(`#voice-edit-${w1.id}`),
        `${found.join(', ')} → ${q(`#voice-item-${w1.id}`).textContent}`);

      // "Something else", in the rep's words.
      const w2 = row(/^Wall 2:/), ed2 = `voice-ed-${w2.id}`;
      editBtn(/^Wall 2:/).click();
      const words = q(`#${ed2}-words`);
      check('Edit on a "Something else" wall shows the words said, ready to correct; "Something else" is picked',
        words && words.value === 'jute wall covering' && q(`#${ed2}-type-other`).getAttribute('aria-pressed') === 'true', words ? words.value : 'no box');
      words.value = '';
      q(`#${ed2}-save`).click();
      const err2 = (q(`#${ed2} .field-err`) || {}).textContent || '';
      q(`#${ed2}-words`).value = 'jute panels on battens';
      q(`#${ed2}-save`).click();
      const w2b = VR.view().items.find(x => x.id === w2.id);
      check('Saved empty, it asks for the words; saved with words, the wall is "Something else, “jute panels on battens”"',
        /Type what it is/.test(err2) && w2b.op === 'other' && w2b.value === 'jute panels on battens' && /Something else, “jute panels on battens”/.test(w2b.label), `${err2} → ${w2b.label}`);

      // The industry changed: the room type and activity that no longer fit say so and are held back.
      const kept0 = VR.view().kept, iRow = row(/^Industry:/);
      editBtn(/^Industry:/).click();
      const indChips = [...document.querySelectorAll(`#voice-ed-${iRow.id} .chip`)].map(b => b.textContent);
      q(`#voice-ed-${iRow.id} .chip[data-value$="|${edu}"]`).click();
      const tRow = row(/^Room type:/), uRow = row(/^Main activity:/), v1 = VR.view();
      const tView = v1.items.find(x => x.id === tRow.id), uView = v1.items.find(x => x.id === uRow.id);
      check(`Edit on the industry offers every industry (${D.INDUSTRIES.length}); choosing ${edu} leaves "Conference room" and its activity not fitting: each says so and they are not filled in (${kept0} → ${kept0 - 2} changes)`,
        indChips.length === D.INDUSTRIES.length && row(/^Industry:/).value === edu && /Not a room type of Education/.test(tView.problem) && /Not an activity of/.test(uView.problem) && v1.kept === kept0 - 2
          && q(`#voice-problem-${tRow.id}`) && /Fill in Room Setup \(9\)/.test(q('#voice-apply').textContent),
        `${tView.problem} | ${uView.problem}; kept ${v1.kept}`);
      editBtn(/^Room type:/).click();
      const typeChips = [...document.querySelectorAll(`#voice-ed-${tRow.id} .chip`)].map(b => b.textContent);
      q(`#voice-ed-${tRow.id} .chip[data-value$="|Classroom"]`).click();
      const useOf = TS.knownUses('Classroom');
      editBtn(/^Main activity:/).click();
      const useChips = [...document.querySelectorAll(`#voice-ed-${uRow.id} .chip`)].map(b => b.textContent);
      q(`#voice-ed-${uRow.id} .chip[data-value$="|${useOf[0]}"]`).click();
      const v2 = VR.view();
      check('Edit on the room type then offers the room types of that industry; Classroom chosen, Edit on the activity offers a classroom\'s activities; both fit again and are filled in',
        json(typeChips) === json(D.roomTypesFor(edu)) && useOf.length > 0 && json(useChips) === json(useOf) && row(/^Room type:/).value === 'Classroom' && row(/^Main activity:/).value === useOf[0]
          && v2.items.every(x => !x.problem) && v2.kept === kept0,
        `${typeChips.length} room types; ${useChips.join(', ')}; kept ${v2.kept}`);
      // Unticking the industry: the room type, of an industry the room does not have, is held back.
      q(`#voice-item-${iRow.id}`).click();
      const held = VR.view().items.find(x => x.id === tRow.id).problem;
      q(`#voice-item-${iRow.id}`).click();
      check('With the industry unticked, the room type says it needs its industry; ticked again, it fits', /needs its industry/.test(held) && !VR.view().items.find(x => x.id === tRow.id).problem, held);

      // A size: in feet; outside the limits; not a size; Escape closes the edit only.
      const L = row(/^Length:/), edL = `voice-ed-${L.id}`;
      editBtn(/^Length:/).click();
      const inL = q(`#${edL}-in`), startL = inL.value;
      inL.value = '500';
      q(`#${edL}-save`).click();
      const errBig = (q(`#${edL} .field-err`) || {}).textContent || '';
      q(`#${edL}-in`).value = 'six';
      q(`#${edL}-save`).click();
      const errWord = (q(`#${edL} .field-err`) || {}).textContent || '';
      key(q(`#${edL}-in`), 'Escape');
      const escaped = !q(`#${edL}`) && !!S.state.ui.sheet && S.state.ui.sheet.kind === 'voice' && row(/^Length:/).value === 6.1;
      editBtn(/^Length:/).click();
      q(`#${edL}-in`).value = '30 ft';
      q(`#${edL}-save`).click();
      // 30 ft = 9.144 m → 9.14 m.
      check('A size: the box holds it in metres (6.1); 500 is outside the limits and "six" is not a size: each says so and nothing changes; Escape closes the edit, not the card; "30 ft" is saved as 9.14 m',
        startL === '6.1' && /500 m is outside the limits: enter 1–100 m/.test(errBig) && /Type a size/.test(errWord) && escaped && row(/^Length:/).value === 9.14 && /^Length: 9\.14 m$/.test(row(/^Length:/).label),
        `${startL}; ${errBig}; ${errWord}; escape ${escaped}; ${row(/^Length:/).label}`);

      // Windows: − and +, then Save.
      const win = row(/^Wall 3: 2 windows/), edW = `voice-ed-${win.id}`;
      editBtn(/^Wall 3: 2 windows/).click();
      q(`#${edW}-plus`).click();
      q(`#${edW}-plus`).click();
      q(`#${edW}-minus`).click();
      const shown = q(`#${edW}-n`).textContent;
      q(`#${edW}-save`).click();
      const winAfter = VR.view().items.find(x => x.id === win.id);
      check('Windows: + + − shows 3, Save makes it "Wall 3: 3 windows"', shown === '3' && winAfter.value === 3 && /^Wall 3: 3 windows/.test(winAfter.label), `${shown} → ${winAfter.label}`);

      // The name, with Enter.
      const nm = row(/^Room name:/), edN = `voice-ed-${nm.id}`;
      editBtn(/^Room name:/).click();
      q(`#${edN}-in`).value = '  Board   Room ';
      key(q(`#${edN}-in`), 'Enter');
      check('A name: Enter saves it, tidied ("Board Room")', !q(`#${edN}`) && row(/^Room name:/).value === 'Board Room', row(/^Room name:/).label);

      const ids = [...document.querySelectorAll('[id]')].map(e => e.id), dup = [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];
      const fl = row(/^Floor:/);
      editBtn(/^Floor:/).click();
      const ids2 = [...document.querySelectorAll('[id]')].map(e => e.id), dup2 = [...new Set(ids2.filter((x, i) => ids2.indexOf(x) !== i))];
      q(`#voice-ed-${fl.id}-cancel`).click();
      const flAfter = VR.view().items.find(x => x.id === fl.id);
      check('No id is used twice, with an edit open or not; Cancel closes the edit and changes nothing', !dup.length && !dup2.length && !q(`#voice-ed-${fl.id}`) && flAfter.value === 'carpet-tiles' && !flAfter.edited, [...dup, ...dup2].join(', ') || 'none');

      // Filled in as edited.
      q('#voice-apply').click();
      await until(() => !S.state.ui.sheet);
      const r = room(), s = r.surfaces, w3 = (s.wall3.openings || []).filter(o => o.kind === 'window').reduce((t, o) => t + (o.count || 1), 0);
      check('"Fill in Room Setup" fills in the changes as edited: Education, Classroom and its activity, "Board Room", 9.14 m long, Wall 1 ACP cladding, Wall 2 "jute panels on battens", carpet tiles, 3 windows on Wall 3',
        r.industry === edu && r.type === 'Classroom' && r.use === useOf[0] && r.name === 'Board Room' && r.L === 9.14 && s.wall1.type === 'acp-cladding' && s.wall2.type === 'other' && s.wall2.finishOther.name === 'jute panels on battens'
          && s.floor.type === 'carpet-tiles' && w3 === 3 && /11 changes/.test(S.state.ui.toast || ''),
        json({ industry: r.industry, type: r.type, use: r.use, name: r.name, L: r.L, w1: s.wall1.type, w2: s.wall2.finishOther, w3, toast: S.state.ui.toast }));
    }

    status('Done');
    document.title = `${results.filter(t => t.ok).length}/${results.length} passed`;
    return results;
  }

  window.VOICE_ROOM_DONE = run().catch(e => { check('The test ran to the end', false, `${e.message}\n${e.stack || ''}`); status('Error'); document.title = 'error'; return results; });
})();
