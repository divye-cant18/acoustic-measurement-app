/* Step 3 · Measurement Setup — the measuring device, microphone access, measuring position, room preparation, test
   signal and a real background-noise measurement. The microphone is only opened while it is needed and released
   afterwards. Microphone and noise work goes through AM.live (js/measurement/live.js); this file only shows its state.

   One device measures: the laptop or phone running the app plays the test signal through its own speaker and records
   the room with its own microphone. The instructions place that device; nothing else is set up.
   The screen is drawn by the interface (src/screens/Setup.tsx); this file keeps the checklist, checks and actions. */
(function (AM) {
  'use strict';
  const W = AM.workflow, S = AM.store, D = AM.demo, ui = AM.ui;
  const LIVE = AM.live;

  const PREP = [
    ['doors', 'Doors and windows closed', 'Openings leak sound and change the decay.'],
    ['hvac', 'Ventilation and air conditioning off or at minimum', 'Fan noise raises the recording background noise.'],
    ['quiet', 'Room quiet, nobody talking', 'Stay still and silent during the take.'],
    ['placed', 'Device placed at the measuring position, not held', 'On a firm, stable support. Nobody touches it or the surface it stands on during the take.'],
    ['uncovered', 'Microphone and speaker openings uncovered', 'No case flap, cover, paper or hand over them.'],
    ['output', 'Sound plays into the room from this device', 'Headphones and earbuds (wired or Bluetooth) disconnected; volume high but not distorting.'],
  ];
  // The checklist items that depend on how the device is placed: asked again when the device profile changes.
  const PLACEMENT_PREP = ['placed', 'uncovered', 'output'];

  function canContinue(p) {
    const s = p.setup, L = LIVE.state;
    if (L.noise) return { ok: false, reason: 'Wait for the background noise measurement to finish.' };
    if (s.permission !== 'granted') return { ok: false, reason: s.permission === 'not-requested' ? 'Allow microphone access first.' : 'The microphone is not available. See Microphone access.' };
    const problem = LIVE.configProblem(p);
    if (problem) return { ok: false, reason: problem };
    const done = PREP.filter(([k]) => s.prep[k]).length;
    if (done < PREP.length) return { ok: false, reason: `Finish the room preparation checklist (${done} of ${PREP.length} done).` };
    if (!s.noise) return { ok: false, reason: s.noiseAttempt ? 'The last background noise measurement could not be used. Measure it again.' : 'Measure the background noise.' };
    return { ok: true };
  }

  let checkedFor = null; // the project whose browser permission state was read on this visit
  W.define('setup', {
    canContinue,
    model: { PREP }, // read by the screen
    continueLabel: 'Continue to measurement',
    actions: {
      allowMic: ctx => LIVE.requestAccess(ctx.project),
      /* The device profile decides how the device is placed and what to check (DEVICE_KINDS); the audio request is the
         same for every profile, since a decay must reach the analysis unprocessed either way. A new profile therefore
         asks for the placement items of the checklist again and reads the input's configuration again; the background
         measurement (same microphone, same room) stays. Takes already made keep the profile they were made with.
         Picking the detected kind returns to following the browser. */
      setKind: (ctx, v) => {
        const p = ctx.project;
        if (!D.DEVICE_KINDS[v] || v === LIVE.kindOf(p)) return;
        S.update(pp => { pp.setup.deviceKind = v === AM.services.measurement.deviceKind() ? null : v; PLACEMENT_PREP.forEach(k => { pp.setup.prep[k] = false; }); });
        if (p.setup.permission === 'granted') LIVE.requestAccess(p);
        S.toast(`Profile: ${D.DEVICE_KINDS[v].name}. Check its placement and tick those room preparation items again.`);
      },
      // Levels are relative to each microphone's own full scale, so another microphone needs its own noise measurement.
      setDevice: (ctx, id) => {
        const d = LIVE.state.devices.find(x => x.id === id);
        S.set('setup', Object.assign({}, ctx.project.setup, { deviceId: id, deviceLabel: d ? d.label : '', input: null, noise: null, noiseAttempt: null }));
        if (ctx.project.setup.permission === 'granted') LIVE.requestAccess(ctx.project);
      },
      // Another output (where the browser can choose one) changes where the test signal plays, not the background:
      // the configuration is read again with it, and a take cannot start until the browser has applied it.
      setOutput: (ctx, id) => {
        S.update(pp => { pp.setup.outputId = id || 'default'; });
        if (ctx.project.setup.permission === 'granted') LIVE.requestAccess(ctx.project);
      },
      measureNoise: ctx => LIVE.measureNoise(ctx.project),
      cancelNoise: () => LIVE.cancelNoise(),
    },
    mount(root, ctx) {
      const p = ctx.project;
      LIVE.bind(st => {
        if (!st.noise) return;
        const t = document.getElementById('nz-time'), pr = document.getElementById('nz-prog');
        if (t) t.textContent = st.noise.sec.toFixed(1) + ' s';
        if (pr) pr.style.width = (st.noise.frac * 100).toFixed(1) + '%';
        ui.updateLevel('nz-level', st.mic);
      });
      if (!p || checkedFor === p.id) return;
      checkedFor = p.id;
      // What the browser says now, without asking: a permission withdrawn since the last visit is shown as blocked.
      AM.services.measurement.permissionState().then(st => {
        if (S.state.project !== p) return;
        if ((st === 'denied' || st === 'embedded') && p.setup.permission !== st) S.update(pp => { pp.setup.permission = st; });
        // Blocked by an embedding page last time, opened on its own now: access has not been asked for here yet.
        else if (st !== 'embedded' && p.setup.permission === 'embedded') S.update(pp => { pp.setup.permission = 'not-requested'; });
        if (st === 'granted' && !LIVE.state.devices.length) LIVE.refreshDevices(p);
      });
    },
    leave() { checkedFor = null; LIVE.bind(null); if (LIVE.state.noise) LIVE.cancelNoise(); },
    // Developer tools: tick the checklist. Microphone access and background noise can only come from a real measurement.
    demoFill(p) {
      PREP.forEach(([k]) => { p.setup.prep[k] = true; });
      return !!p.setup.noise && p.setup.permission === 'granted';
    },
  });
})(window.AM);
