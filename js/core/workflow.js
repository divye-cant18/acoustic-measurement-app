/* The workflow model: the eleven stages, their order and phases, and the rules for moving between them.
   Stage files attach their view and behaviour with AM.workflow.define(id, {...}).

   Stage statuses
     completed  finished; can be reopened and edited
     current    the stage on screen
     available  prerequisites done, not yet finished (shown as "Upcoming")
     locked     an earlier stage is not finished yet
   A completed stage can also carry a review flag when something upstream changed after it was finished. */
(function (AM) {
  'use strict';

  /* deps: the earlier steps whose data a step uses. When a finished step changes, only the finished steps that
     depend on it (directly or through another step) are marked for review. */
  const STAGES = [
    { id: 'home', title: 'Home', nav: 'Home', phase: null, owns: [], deps: [],
      purpose: 'Start or resume a measurement project.' },
    { id: 'room', title: 'Room Setup', nav: 'Room Setup', phase: 'Define', owns: ['room'], deps: [],
      purpose: 'Describe the room you are going to measure: what it is, how big it is and what it is made of.' },
    { id: 'target', title: 'Target / Ideal RT60', nav: 'Target / Ideal RT60', phase: 'Define', owns: ['target'], deps: ['room'],
      purpose: 'Decide how reverberant this room should be. This is what we want, set before anything is measured.' },
    { id: 'setup', title: 'Measurement Setup', nav: 'Measurement Setup', phase: 'Measure', owns: ['setup'], deps: [],
      purpose: 'Prepare the microphone, the measuring position, the room and the test signal.' },
    { id: 'measure', title: 'Acoustic Measurement', nav: 'Acoustic Measurement', phase: 'Measure', owns: ['measurement'], deps: ['setup'],
      purpose: 'Play the test signal and record how the room responds. This is where the room is actually measured.' },
    { id: 'processing', title: 'Measurement Processing', nav: 'Processing', phase: 'Measure', owns: ['processing'], deps: ['measure'],
      purpose: 'Check that the recording can be trusted, choose a valid calculation, then calculate RT60.' },
    { id: 'results', title: 'Results', nav: 'Results', phase: 'Analyse', owns: [], deps: ['processing'],
      purpose: 'The measured reverberation of the room, band by band, with how it was calculated.' },
    { id: 'assessment', title: 'Acoustic Assessment', nav: 'Acoustic Assessment', phase: 'Analyse', owns: [], deps: ['target', 'results'],
      purpose: 'Compare what was measured with the target, and decide whether the room needs treatment.' },
    { id: 'treatment', title: 'Treatment', nav: 'Treatment', phase: 'Improve', owns: ['treatment'], deps: ['room', 'assessment'],
      purpose: 'Choose acoustic treatment and how much of it to add.' },
    { id: 'prediction', title: 'Predicted Result', nav: 'Predicted Result', phase: 'Improve', owns: [], deps: ['treatment'],
      purpose: 'Estimate the room after treatment and compare the estimate with the target.' },
    { id: 'final', title: 'Final Result', nav: 'Final Result', phase: 'Summary', owns: [], deps: ['room', 'assessment', 'prediction'],
      purpose: 'The whole project in one place: room, target, measurement, treatment and prediction.' },
  ];
  const PHASES = ['Define', 'Measure', 'Analyse', 'Improve', 'Summary'];
  const NUMBERED = STAGES.length - 1; // Home is not a numbered step

  const byId = Object.fromEntries(STAGES.map(s => [s.id, s]));
  const get = id => byId[id];
  const idx = id => STAGES.findIndex(s => s.id === id);
  const next = id => STAGES[idx(id) + 1] || null;
  const prev = id => STAGES[idx(id) - 1] || null;
  const stepNo = id => idx(id);

  const isDone = (p, id) => !!p && p.completed.includes(id);
  const needsReview = (p, id) => !!p && p.review.includes(id);

  // Sequential progression: a stage opens once every stage before it is finished.
  function canEnter(p, id) {
    if (id === 'home') return true;
    if (!p) return false;
    return STAGES.slice(0, idx(id)).every(s => p.completed.includes(s.id));
  }
  const blocker = (p, id) => STAGES.slice(0, idx(id)).find(s => !isDone(p, s.id)) || null;

  function status(p, id, current) {
    if (id === current) return 'current';
    if (isDone(p, id)) return 'completed';
    return canEnter(p, id) ? 'available' : 'locked';
  }

  // Which stage owns a piece of project data (used to flag later stages when it changes).
  function ownerOf(path) {
    const root = path.split('.')[0];
    const s = STAGES.find(st => st.owns.includes(root));
    return s ? s.id : null;
  }

  // Every later step that uses `id`'s data, directly or through another step, in workflow order.
  function dependents(id) {
    const hit = new Set([id]);
    STAGES.slice(idx(id) + 1).forEach(s => { if (s.deps.some(d => hit.has(d))) hit.add(s.id); });
    hit.delete(id);
    return STAGES.filter(s => hit.has(s.id)).map(s => s.id);
  }

  function define(id, impl) { Object.assign(byId[id], impl); }

  /* Data that only some of its owner's dependents use. The room's surfaces feed the predictions only: changing a wall
     material never puts the target, the assessment or any measurement step up for review. The room's name is a label
     and the furnishing a note (it does not change the target: services/target.js): correcting either puts nothing up
     for review. */
  const NARROW = { 'room.surfaces': ['treatment', 'prediction', 'final'], 'room.name': [], 'room.furnishing': [] };
  function affects(path) {
    const k = Object.keys(NARROW).find(x => path === x || path.startsWith(x + '.'));
    return k ? NARROW[k] : null;
  }

  AM.workflow = { STAGES, PHASES, NUMBERED, get, idx, next, prev, stepNo, isDone, needsReview, canEnter, blocker, status, ownerOf, dependents, affects, define };
})(window.AM);
