/* Instructional videos. Content only; AM.guide (js/ui/guide.js) plays it.

   Each guide is a sequence of chapters: the scene drawn during it and its narration. Every line of `captions` is
   spoken by the player's voice as it appears on screen, so the subtitles are always exactly what is said. A chapter
   lasts as long as its lines take to say at an easy pace (timed() below), never less than `min` seconds, so the
   drawing never hurries the voice. To use a filmed video instead of the animated one, set `video.src` to the file
   (e.g. 'media/how-to-measure.mp4'); the chapters then become jump points into it.

   The narration is written to be listened to: short sentences, spoken numbers ("a metre", "sixty decibels"), a warm
   second person, and a clear next step at the end. It says only what the app does.

   One device measures: the laptop or phone running the app plays the test signal through its own speaker and records
   the room with its own microphone. Placement follows common RT60 practice (ISO 3382-2) for the microphone: at a
   listening position, at about seated ear height (1.2 m) where practical, at least 1 m from walls. */
(function (AM) {
  'use strict';

  /* How long each chapter lasts: the words of its lines at about 170 a minute, a short pause after each line and a
     breath between chapters, and never less than the scene's own `min`. `cues` are where each line starts, as a
     fraction of the chapter, weighted by its length, so a long line gets more time on screen than a short one. The
     player also waits for the voice at the end of a line, so a slower voice is never cut off. */
  const WORDS_PER_S = 2.8, LINE_PAUSE = 0.5, CHAPTER_PAUSE = 0.6;
  const lineSeconds = line => line.split(/\s+/).filter(Boolean).length / WORDS_PER_S + LINE_PAUSE;
  function timed(g) {
    let t = 0;
    g.chapters.forEach(c => {
      const lines = c.captions.map(lineSeconds), spoken = lines.reduce((s, x) => s + x, 0) + CHAPTER_PAUSE;
      const d = Math.max(c.min || 0, Math.ceil(spoken * 2) / 2);
      let at = 0;
      c.cues = lines.map(x => { const start = at; at += x / spoken; return start; });
      c.from = t; c.to = t + d; t += d;
    });
    const halves = Math.max(2, Math.round(t / 30)); // to the nearest half minute
    g.lengthLabel = `${halves % 2 ? `${(halves - 1) / 2}½` : halves / 2} min`;
    return g;
  }

  AM.guides = {
    measure: timed({
      title: 'How to measure',
      closeLabel: 'Close and measure',
      video: { src: '' },
      poster: { scene: 'place', u: 0.95 },
      chapters: [
        { id: 'intro', min: 7, title: 'What you will do', scene: 'intro', captions: [
          'Let’s measure your room! Your laptop or phone does everything: it plays a short test sound, and listens with its own microphone.',
          'When the sound stops, the room keeps ringing for a moment. That ring-down is exactly what we are measuring.',
        ] },
        { id: 'prepare', min: 10, title: 'Prepare the room', scene: 'prepare', captions: [
          'First, make the room quiet. Close the doors and the windows.',
          'Switch off the air conditioning and fans, or turn them right down.',
          'Put phones on silent, and leave the furniture just as the room is normally used.',
        ] },
        { id: 'place', min: 11, title: 'Place the device', scene: 'place', captions: [
          'Now place the device where people usually sit.',
          'A laptop goes on a firm table; a phone on a stand, or propped upright. Keep it about a metre from the walls, near seated ear height.',
          'Don’t hold it, and don’t lean it against anything that can rattle.',
        ] },
        { id: 'device', min: 9, title: 'Set up the device', scene: 'device', captions: [
          'Unplug headphones and earbuds, so the sound comes out into the room.',
          'Keep the speaker and the microphone uncovered, and turn the volume up. Loud, but not so loud that it crackles.',
          'Then step back. Hands off.',
        ] },
        { id: 'run', min: 10, title: 'Run the measurement', scene: 'run', captions: [
          'Press Start measurement.',
          'Stay still and silent while the sound plays and the room rings down.',
          'In about ten seconds, it’s done.',
        ] },
        { id: 'avoid', min: 8, title: 'What to avoid', scene: 'avoid', captions: [
          'A few things can spoil a take: talking, fans, ringtones, holding the device, or tucking it into a corner.',
          'Keep the room calm, and your results will be spot on.',
        ] },
        { id: 'ready', min: 5, title: 'Ready', scene: 'ready', captions: [
          'You’re ready. Close this video, and press Start measurement.',
        ] },
      ],
    }),

    /* Room Setup: taking the inside length, width and height. The app treats the room as a box (V = L × W × H),
       so irregular rooms are reduced to a box with the same floor area and average height. */
    dimensions: timed({
      title: 'How to measure the room',
      closeLabel: 'Close and enter the sizes',
      video: { src: '' },
      poster: { scene: 'dimIntro', u: 0.9 },
      chapters: [
        { id: 'what', min: 7, title: 'What you will measure', scene: 'dimIntro', captions: [
          'Before anything else, the app needs three numbers: the room’s inside length, width and height, in metres.',
          'From them it works out the volume, which shapes both the target and how much treatment the room needs.',
        ] },
        { id: 'tools', min: 7, title: 'Tools', scene: 'dimTools', captions: [
          'A laser distance meter is the quickest. Set it to metres, and rest its back edge flat against the wall.',
          'No laser? A tape measure works fine. Ask someone to hold the other end, and keep it straight and level.',
        ] },
        { id: 'length', min: 11, title: 'Length', scene: 'dimLength', captions: [
          'Length is the longer side. Measure from the inside face of one wall, straight across to the opposite wall.',
          'Aim above the furniture, at about waist height.',
          'If the walls are not parallel, measure at both ends and use the average.',
        ] },
        { id: 'width', min: 9, title: 'Width', scene: 'dimWidth', captions: [
          'Width is the shorter side, at right angles to the length.',
          'Same method: wall to wall, and at both ends if the room narrows.',
        ] },
        { id: 'height', min: 11, title: 'Height', scene: 'dimHeight', captions: [
          'Height runs from the floor up to the ceiling you can see.',
          'With a closed false ceiling, measure to the ceiling tiles, not to the slab above.',
          'If the ceiling is an open grid or hanging baffles, measure to the slab instead.',
        ] },
        { id: 'irregular', min: 9, title: 'Irregular rooms', scene: 'dimIrregular', captions: [
          'Pillars, window recesses and small alcoves? Simply ignore them.',
          'For an L-shaped room, add up the floor areas of its parts, and enter a length and width that give the same total.',
          'For a sloping ceiling, use the average of the lowest and the highest point.',
        ] },
        { id: 'enter', min: 6, title: 'Enter the sizes', scene: 'dimEnter', captions: [
          'Type in the three sizes, to the nearest ten centimetres. The app draws the room, so you can check it at a glance.',
        ] },
      ],
    }),

    /* Target step: what RT60 is and why it matters, before the target is set. An explainer, not a measurement: the
       room types are placed in their usual order, not at values, and the targets themselves come from js/data/targets.js. */
    rt60: timed({
      title: 'What is RT60?',
      closeLabel: 'Close and set the target',
      video: { src: '' },
      poster: { scene: 'rtDefine', u: 0.95 },
      chapters: [
        { id: 'linger', min: 10, title: 'Sound lingers', scene: 'rtWhat', captions: [
          'Clap your hands in an empty hall, and the sound doesn’t stop straight away. It bounces off the walls, the floor and the ceiling.',
          'Each bounce is a little quieter, until it fades away. That lingering is called reverberation.',
        ] },
        { id: 'define', min: 12, title: 'What RT60 measures', scene: 'rtDefine', captions: [
          'RT60 puts a number on it: the time a sound takes to fade by sixty decibels after it stops. From a loud clap, to almost nothing.',
          'It is measured in seconds. The longer it is, the more the room rings.',
        ] },
        { id: 'long', min: 12, title: 'Too long', scene: 'rtLong', captions: [
          'When RT60 is too long, every word is still echoing when the next one begins.',
          'Speech blurs, people raise their voices, and meetings and calls become tiring.',
        ] },
        { id: 'short', min: 10, title: 'Short', scene: 'rtShort', captions: [
          'When it is short, each word fades before the next one starts. Speech is clear and easy to follow.',
          'Far too short can sound dead. But that matters for music, not for meeting rooms.',
        ] },
        { id: 'depends', min: 11, title: 'The right value', scene: 'rtDepends', captions: [
          'So, what is the right value? It depends on the room. Rooms for talking, like meeting rooms and classrooms, need a short RT60.',
          'Rooms for music, like concert halls, need a longer one. Acoustic standards set the target for each use and size, and this app follows them.',
        ] },
        { id: 'treat', min: 11, title: 'What changes it', scene: 'rtTreat', captions: [
          'Hard, bare surfaces like glass, plaster and concrete bounce sound around, and bigger rooms ring for longer.',
          'Acoustic panels soak up sound and bring RT60 down. The app works out how much your room needs.',
        ] },
        { id: 'app', min: 6, title: 'In this app', scene: 'rtInApp', captions: [
          'Here is the plan: set the target, measure the room, compare the two, and choose treatment if it is needed. Let’s begin!',
        ] },
      ],
    }),

    /* Home: a walkthrough of the workflow, one chapter per step, on a sketch of the app. Not every feature: the steps and
       what you do in each. The room in it is an example (10 × 6 × 3 m), not a measurement. */
    tour: timed({
      title: 'How the app works',
      closeLabel: 'Close the walkthrough',
      video: { src: '' },
      poster: { scene: 'tourMeasure', u: 0.95 },
      chapters: [
        { id: 'intro', min: 7, title: 'The workflow', scene: 'tourIntro', captions: [
          'Welcome! In the next few minutes, you’ll see how to turn a room full of echo into a clear, professional report.',
          'There are ten simple steps, and the menu on the left always shows where you are.',
        ] },
        { id: 'room', min: 11, title: 'Room Setup', scene: 'tourRoom', captions: [
          'Step one: Room Setup. Give the room a name, pick what it is used for, and type in its length, width and height.',
          'The app works out the volume for you. Describing the walls and the ceiling is optional, but it sharpens the treatment advice later.',
        ] },
        { id: 'target', min: 9, title: 'Target', scene: 'tourTarget', captions: [
          'Step two: the target. From how the room is used and how big it is, the app recommends the ideal echo time, straight from acoustic standards.',
          'Have a quick look, and confirm it.',
        ] },
        { id: 'setup', min: 11, title: 'Measurement Setup', scene: 'tourSetup', captions: [
          'Step three: get ready. Allow the microphone, close the doors, and switch off the air conditioning.',
          'Then the app listens to the room’s background noise for a few seconds.',
        ] },
        { id: 'measure', min: 14, title: 'Measure', scene: 'tourMeasure', captions: [
          'Step four, the fun part! Place your laptop or phone, press Start, and stay quiet. It plays a short test sound and listens to how the room rings. About ten seconds.',
          'Then move to a second spot, and do it once more. The app averages the two.',
        ] },
        { id: 'processing', min: 9, title: 'Processing', scene: 'tourProcessing', captions: [
          'Step five: the app checks every recording carefully, and calculates the echo time, from low sounds to high.',
          'If a recording can’t be trusted, it tells you why and asks you to measure again. No guessing.',
        ] },
        { id: 'results', min: 10, title: 'Results', scene: 'tourResults', captions: [
          'Step six: your results, in plain words first. How long low sounds, voices and high sounds ring in this room.',
        ] },
        { id: 'assessment', min: 9, title: 'Assessment', scene: 'tourAssessment', captions: [
          'Step seven: the verdict. Does the room meet its target, or does it need treatment? You’ll know at a glance.',
        ] },
        { id: 'treatment', min: 11, title: 'Treatment', scene: 'tourTreatment', captions: [
          'Step eight: choose acoustic products from the catalogue. The app picks the best way to mount them, and works out how much the room needs.',
          'Prefer another mounting? Pick it, and watch the result update.',
        ] },
        { id: 'prediction', min: 9, title: 'Predicted Result', scene: 'tourPrediction', captions: [
          'Step nine: a look into the future. The app predicts how the room will sound after treatment, side by side with the target.',
          'Try more or less, and the prediction updates instantly.',
        ] },
        { id: 'final', min: 11, title: 'Final Result', scene: 'tourFinal', captions: [
          'Step ten: everything on one page. Fill in a short form, and download a clean PDF report for your client.',
        ] },
        { id: 'end', min: 5, title: 'Ready', scene: 'tourOutro', captions: [
          'That’s it! Ten steps, from echo to answer. If you are ever unsure, press Explain this step, or come back to these videos.',
        ] },
      ],
    }),
  };
})(window.AM);
