/* Project structure and reference lists: octave bands, industries and room types, room options, measuring positions,
   the test signal, and the blank project. The sample room (demoRoom) is only used by Developer tools to fill Room Setup.
   This file holds no measurement data: every measured value comes from the microphone (js/measurement, services/measurement.js).
   RT60 targets come from js/data/targets.js. */
(function (AM) {
  'use strict';

  // Octave bands analysed (IEC 61260 base-2 centre frequencies).
  const BANDS = [125, 250, 500, 1000, 2000, 4000];

  // The band at which the measured RT60 is reported and compared with the target. Every band is measured.
  const REFERENCE_BAND = 1000;

  /* Industry → room types. Room Setup offers only the types of the chosen industry. Both are kept with the
     project so later stages (e.g. target RT60 recommendations) can use them. */
  const INDUSTRIES = [
    { name: 'Corporate / Office', types: ['Conference room', 'Meeting room', 'Boardroom', 'Private office', 'Open-plan office', 'Reception area'] },
    { name: 'Education', types: ['Classroom', 'Lecture hall', 'Library', 'Music room', 'Sports hall'] },
    { name: 'Hospitality', types: ['Restaurant', 'Café', 'Bar', 'Banquet hall', 'Hotel lobby'] },
    { name: 'Healthcare', types: ['Consultation room', 'Waiting area', 'Patient room', 'Therapy room'] },
    { name: 'Residential', types: ['Living room', 'Bedroom', 'Home theatre', 'Home studio'] },
    { name: 'Media & Entertainment', types: ['Recording studio', 'Control room', 'Cinema', 'Auditorium'] },
    { name: 'Public & Worship', types: ['Place of worship', 'Community hall', 'Exhibition hall', 'Gymnasium'] },
    { name: 'Other', types: ['Other'] },
  ];
  const roomTypesFor = industry => (INDUSTRIES.find(i => i.name === industry) || { types: [] }).types;
  const industryFor = type => (INDUSTRIES.find(i => i.types.includes(type)) || { name: '' }).name;

  // Room uses depend on the room type: AM.services.target.usesFor(type).
  const OPTIONS = {
    furnishing: ['Empty', 'Lightly furnished', 'Furnished'],
    floor: ['Carpet', 'Carpet tiles', 'Vinyl', 'Hardwood', 'Tile', 'Concrete'],
    walls: ['Plasterboard', 'Plasterboard + glass', 'Concrete', 'Brick', 'Glass', 'Wood panelling'],
    ceiling: ['Plasterboard', 'Concrete', 'Acoustic tile', 'Exposed structure', 'Wood'],
    existing: ['None', 'Some soft furnishings', 'Acoustic panels installed'],
  };

  /* The project's target. Filled from the recommendation for its room (source 'recommended') until the
     user adjusts it (source 'custom'). basis says where the values came from. */
  const newTarget = () => ({ preferred: null, min: null, max: null, source: 'recommended', basis: '' });

  /* Measuring positions: where the measuring device (one laptop or one phone, with its own speaker and microphone) is
     placed for a take. Measuring several positions means moving the same device and taking a separate recording at each.
     x along the room length from the front wall, y across the width (fractions of the room).
     Worded for any room type: a meeting room, a classroom, a hall or a living room. */
  const POSITIONS = [
    { id: 'P1', name: 'Main listening position', detail: 'Centre of the main seating or listening area', x: 0.55, y: 0.5 },
    { id: 'P2', name: 'Front of the room', detail: 'Near where a presenter, teacher or performer would be', x: 0.24, y: 0.42 },
    { id: 'P3', name: 'Rear corner', detail: 'A seat or standing place near a back corner, at least 1 m from both walls', x: 0.84, y: 0.24 },
  ];

  /* The measuring device. One device does the whole measurement: its own speaker plays the test signal and its own
     microphone records the room. Nothing else is connected. The kind only changes the placement advice; it is detected
     from the browser and can be corrected in Measurement Setup. */
  const DEVICE_KINDS = {
    computer: {
      name: 'Laptop or computer', noun: 'laptop',
      place: 'Place the laptop on a firm, stable table or stand at the measuring position, open as you normally use it, with its microphone and speaker unobstructed.',
      support: 'On a firm table or stand. Many laptops have their speakers underneath or at the sides, so never on a cushion, a bed or your lap.',
      // What to check with this kind of device (instructions only: the audio request is the same for every profile).
      checks: [
        'Switch off audio enhancements and microphone effects in the system\'s sound settings if it offers them (noise reduction, voice focus, automatic gain): the browser cannot always switch off what the system does.',
        'Where this browser lets you choose the sound output, choose the built-in speakers; elsewhere, disconnect headphones and Bluetooth audio so the system plays through them.',
      ],
    },
    mobile: {
      name: 'Phone or tablet', noun: 'phone',
      place: 'Place the phone securely at the measuring position, on a stand or propped upright on a firm surface. Do not hold it during the measurement. Keep the microphone and speaker openings unobstructed.',
      support: 'On a stand, or propped upright. Laid flat, its speaker or microphone may be blocked. Turn on Do Not Disturb so no call or alert sounds during the take.',
      checks: [
        'A phone browser cannot choose or confirm the loudspeaker. While the microphone is on, some phones play sound through the earpiece instead: the test sweep must be clearly audible from the loudspeaker. If it is faint, measure on a laptop.',
        'Small phone speakers give little sound below about 500 Hz, so 125 and 250 Hz may show "Not reliable". A band that cannot be measured is left out of the room\'s average and named. To include it, measure again in a quiet room with a higher sweep level, or on a laptop.',
        'Keep the screen on and this page in front during the take: locking the phone, a call or switching apps stops the take.',
      ],
    },
  };
  // Placement for either kind (the device-specific line is DEVICE_KINDS[kind].support).
  const PLACEMENT = [
    'Put the device at the selected measuring position and leave it there for the whole take.',
    'Do not hold it or touch the surface it stands on while measuring.',
    'Keep the microphone and speaker openings uncovered: no case flap, cover, paper or hand.',
    'At least 1 m from walls and large surfaces where practical, at about seated ear height (1.2 m) if you can.',
    'Not pressed against a wall, furniture or anything that can vibrate.',
    'Same place, height and orientation every time you measure this position.',
  ];

  // The measurement uses one test signal: an exponential sine sweep (its range and length: AM.analysis.sweepPlan).
  const SIGNALS = [
    { id: 'sweep', name: 'Exponential sine sweep', detail: 'Played through this device\'s own speaker and recorded through its own microphone; the room\'s impulse response is recovered from the recording by deconvolution.' },
  ];

  /* The room's six surfaces (AM.services.surfaces): Wall 1 to Wall 4 going round the room (1 and 3 long, 2 and 4 the
     ends), floor, ceiling. Nothing is chosen until the user chooses it. */
  const SURFACE_KEYS = ['wall1', 'wall2', 'wall3', 'wall4', 'floor', 'ceiling'];
  const blankSurface = () => ({ material: '', cover: { material: '', pct: null }, openings: [], origin: 'user' });
  const blankSurfaces = () => Object.fromEntries(SURFACE_KEYS.map(k => [k, blankSurface()]));

  /* Sample room for Developer tools: a glass-fronted meeting room with plasterboard walls, a window, a door, carpet tiles and a
     plasterboard ceiling. Material ids from js/data/materials.js. */
  const surf = (material, openings) => Object.assign(blankSurface(), { material, openings: openings || [] });
  const demoRoom = () => ({
    name: 'Conference Room A', industry: 'Corporate / Office', type: 'Conference room', use: 'Video calls and hybrid meetings',
    L: 10, W: 6, H: 3, occupancy: 12, furnishing: 'Furnished',
    floor: 'Carpet tiles', walls: 'Plasterboard + glass', ceiling: 'Plasterboard', existing: 'None',
    surfaces: {
      wall1: surf('aua-2-x-13-mm-plasterboard-on-frame-50-mm-cavity'),
      wall2: surf('as-glass-large-heavy-plate-panes'),
      wall3: surf('aua-2-x-13-mm-plasterboard-on-frame-50-mm-cavity', [{ id: 'o1', kind: 'window', material: 'pra-double-glazing-2-3-mm-glass-30-mm-gap', widthM: 4, heightM: 1.5, count: 1 }]),
      wall4: surf('aua-2-x-13-mm-plasterboard-on-frame-50-mm-cavity', [{ id: 'o1', kind: 'door', material: 'pra-solid-wooden-door', widthM: 0.9, heightM: 2.1, count: 1 }]),
      floor: surf('mfr-carpet-tiles-11-mm-type-a-lab-audit-sample'),
      ceiling: surf('pra-plasterboard-ceiling-on-battens-large-air-sp'),
    },
  });

  const blankRoom = () => ({
    name: '', industry: '', type: '', use: '', L: null, W: null, H: null, occupancy: null, furnishing: 'Furnished',
    floor: '', walls: '', ceiling: '', existing: 'None', surfaces: blankSurfaces(),
  });

  /* The project's treatment plan: one or more items, each a product in one tested configuration with its own
     amount and placement. Only ids and amounts live here; product data stays in the catalog.
       size: index into the product's size options, or 'area' to enter the treatment area directly
       active: the item being edited on the Treatment step */
  const newTreatment = () => ({ items: [], active: null });
  const newTreatmentItem = items => ({
    id: 't' + (1 + Math.max(0, ...(items || []).map(x => parseInt(String(x.id).slice(1), 10) || 0))),
    productId: null, configurationId: null, size: null, quantity: 10, areaM2: null, placement: 'Walls',
  });

  // Project ids: time plus a few bytes from the browser's cryptographic generator (ids only; never measurement data).
  function newId() {
    const b = new Uint8Array(3);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(b);
    return 'p' + Date.now().toString(36) + Array.from(b, x => x.toString(36).padStart(2, '0')).join('').slice(0, 4);
  }

  /* Measurement data in a project. Nothing is filled in until it has been measured.
       setup.deviceKind       the measuring device: null (as detected from the browser), 'computer' or 'mobile'
       setup.outputId         the sound output where the browser can choose one ('default': the system's)
       setup.permission       last microphone access result: not-requested | granted | denied | embedded | no-device | busy | unsupported | error
       setup.sweepLevelDb     the sweep level for the next take, dB relative to the default (AM.analysis.sweepLevel)
       setup.noise            the current valid background-noise measurement (status valid or warning), or null
       setup.noiseAttempt     the latest noise attempt that failed or was invalid; the previous valid one stays current
       measurement.recording  the latest captured take (with its analysis); measurement.failed: the latest take that failed
       processing.result      the CURRENT valid measurement; processing.attempt: the latest invalid evaluation;
       processing.history     earlier valid measurements that were replaced (SUPERSEDED) */
  function newProject(kind) {
    const demo = kind === 'demo';
    const now = new Date().toISOString();
    return {
      id: newId(),
      kind,
      createdAt: now,
      updatedAt: now,
      lastStage: 'room', // where the project reopens from Measurement History
      room: demo ? demoRoom() : blankRoom(),
      target: newTarget(),
      setup: {
        deviceKind: null, deviceId: 'default', deviceLabel: '', outputId: 'default', permission: 'not-requested', input: null, position: 'P1', signal: 'sweep',
        sweepLevelDb: 0, noise: null, noiseAttempt: null,
        prep: { doors: false, hvac: false, quiet: false, placed: false, uncovered: false, output: false },
      },
      measurement: { recording: null, failed: null, retry: null },
      processing: { result: null, attempt: null, history: [], positions: {} },
      treatment: newTreatment(),
      completed: ['home'],
      review: [],
    };
  }

  AM.demo = { BANDS, REFERENCE_BAND, INDUSTRIES, roomTypesFor, industryFor, OPTIONS, newTarget, POSITIONS, DEVICE_KINDS, PLACEMENT, SIGNALS, SURFACE_KEYS, blankSurface, blankSurfaces, demoRoom, newTreatment, newTreatmentItem, newProject };
})(window.AM);
