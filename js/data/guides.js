/* Instructional videos. Content only; AM.guide (js/ui/guide.js) plays it.

   Each guide is a sequence of chapters. A chapter has a time span, the scene drawn during it and its captions
   (shown one after another across the chapter). To use a filmed video instead of the animated one, set
   `video.src` to the file (e.g. 'media/how-to-measure.mp4'); the chapters then become jump points into it.

   One device measures: the laptop or phone running the app plays the test signal through its own speaker and records
   the room with its own microphone. Placement follows common RT60 practice (ISO 3382-2) for the microphone: at a
   listening position, at about seated ear height (1.2 m) where practical, at least 1 m from walls. */
(function (AM) {
  'use strict';

  AM.guides = {
    measure: {
      title: 'How to measure',
      lengthLabel: '1 min',
      closeLabel: 'Close and measure',
      video: { src: '' },
      poster: { scene: 'place', u: 0.95 },
      chapters: [
        { id: 'intro', from: 0, to: 7, title: 'What you will do', scene: 'intro', captions: [
          'Your laptop or phone does the whole measurement: its speaker plays a short test signal and its microphone records the room.',
          'After the signal stops, the room keeps ringing. How long that takes is the RT60.',
        ] },
        { id: 'prepare', from: 7, to: 17, title: 'Prepare the room', scene: 'prepare', captions: [
          'Close doors and windows.',
          'Switch ventilation and air conditioning off, or to the lowest setting.',
          'Put other phones on silent and leave the furniture as the room is normally used.',
        ] },
        { id: 'place', from: 17, to: 28, title: 'Place the device', scene: 'place', captions: [
          'Put the laptop or phone at the measuring position, where people normally sit.',
          'A laptop goes on a firm table; a phone on a stand or propped upright. At about seated ear height where you can, at least 1 m from walls.',
          'Do not hold it, and do not press it against a wall or anything that can vibrate.',
        ] },
        { id: 'device', from: 28, to: 37, title: 'Set up the device', scene: 'device', captions: [
          'Disconnect headphones and earbuds, so the test signal plays into the room.',
          'Keep the speaker and microphone openings uncovered. Set the volume high, but not so high that it distorts.',
          'Then step back. Do not touch the device or its table during the take.',
        ] },
        { id: 'run', from: 37, to: 47, title: 'Run the measurement', scene: 'run', captions: [
          'Press Start measurement.',
          'Stay still and silent while the signal plays and the room rings down.',
          'Wait until the take is complete. It takes about 10 seconds.',
        ] },
        { id: 'avoid', from: 47, to: 55, title: 'What to avoid', scene: 'avoid', captions: [
          'Avoid anything that adds noise or changes the room during the take.',
          'Corners, talking, fans, holding the device, distortion and ringtones all spoil the decay.',
        ] },
        { id: 'ready', from: 55, to: 60, title: 'Ready', scene: 'ready', captions: [
          'That is all. Close the video and press Start measurement.',
        ] },
      ],
    },

    /* Room Setup: taking the inside length, width and height. The app treats the room as a box (V = L × W × H),
       so irregular rooms are reduced to a box with the same floor area and average height. */
    dimensions: {
      title: 'How to measure the room',
      lengthLabel: '1 min',
      closeLabel: 'Close and enter the sizes',
      video: { src: '' },
      poster: { scene: 'dimIntro', u: 0.9 },
      chapters: [
        { id: 'what', from: 0, to: 7, title: 'What you will measure', scene: 'dimIntro', captions: [
          'Room Setup needs three inside sizes: length, width and height, in metres.',
          'The app multiplies them to get the room volume, which the RT60 target and the treatment amount both depend on.',
        ] },
        { id: 'tools', from: 7, to: 14, title: 'Tools', scene: 'dimTools', captions: [
          'A laser distance meter is quickest. Set it to metres and hold its back edge flat against the wall.',
          'A tape measure works too. Ask someone to hold the other end and keep the tape straight and level.',
        ] },
        { id: 'length', from: 14, to: 25, title: 'Length', scene: 'dimLength', captions: [
          'Length is the longer side. Measure from the inside face of one wall to the inside face of the opposite wall.',
          'Aim straight across, above the furniture, at about waist height.',
          'If the walls are not parallel, measure at both ends and use the average.',
        ] },
        { id: 'width', from: 25, to: 34, title: 'Width', scene: 'dimWidth', captions: [
          'Width is the shorter side, at right angles to the length.',
          'Measure it the same way, wall face to wall face, at both ends if the room narrows.',
        ] },
        { id: 'height', from: 34, to: 45, title: 'Height', scene: 'dimHeight', captions: [
          'Height runs from the floor to the ceiling you can see.',
          'With a closed suspended ceiling, measure to the ceiling tiles, not the slab above.',
          'If the ceiling is an open grid or hanging baffles, measure to the slab instead.',
        ] },
        { id: 'irregular', from: 45, to: 54, title: 'Irregular rooms', scene: 'dimIrregular', captions: [
          'Ignore pillars, window recesses and small alcoves.',
          'For an L-shaped room, add up the floor areas of its parts and enter a length and width that give the same area.',
          'For a sloping ceiling, use the average of the lowest and the highest height.',
        ] },
        { id: 'enter', from: 54, to: 60, title: 'Enter the sizes', scene: 'dimEnter', captions: [
          'Enter the three sizes to the nearest 0.1 m. The app works out the volume and draws the room so you can check it.',
        ] },
      ],
    },

    /* Target step: what RT60 is and why it matters, before the target is set. An explainer, not a measurement: the
       room types are placed in their usual order, not at values, and the targets themselves come from js/data/targets.js. */
    rt60: {
      title: 'What is RT60?',
      lengthLabel: '1 min',
      closeLabel: 'Close and set the target',
      video: { src: '' },
      poster: { scene: 'rtDefine', u: 0.95 },
      chapters: [
        { id: 'linger', from: 0, to: 10, title: 'Sound lingers', scene: 'rtWhat', captions: [
          'Every room keeps a sound going after it stops: it bounces off the walls, the floor and the ceiling.',
          'Each bounce is a little quieter, until the sound dies away. That lingering is called reverberation.',
        ] },
        { id: 'define', from: 10, to: 22, title: 'What RT60 measures', scene: 'rtDefine', captions: [
          'RT60 is the time it takes for a sound to fade by 60 decibels after it stops: from a loud clap to almost nothing.',
          'It is given in seconds. The longer it is, the more the room rings.',
        ] },
        { id: 'long', from: 22, to: 34, title: 'Too long', scene: 'rtLong', captions: [
          'When RT60 is too long, each word is still ringing when the next one starts.',
          'Speech blurs, people raise their voices, and the room gets noisy and tiring, in meetings and on calls.',
        ] },
        { id: 'short', from: 34, to: 44, title: 'Short', scene: 'rtShort', captions: [
          'When it is short, each word fades before the next one: speech is clear and easy to follow.',
          'Far too short can sound dead. That matters for music, not for meeting rooms.',
        ] },
        { id: 'depends', from: 44, to: 55, title: 'The right value', scene: 'rtDepends', captions: [
          'There is no single best value. Rooms for speech, like meeting rooms and classrooms, need a short RT60.',
          'Rooms for music, like concert halls, need a longer one. Standards set the target for each use and size, and this step uses them.',
        ] },
        { id: 'treat', from: 55, to: 66, title: 'What changes it', scene: 'rtTreat', captions: [
          'Hard, bare surfaces such as glass, plaster and concrete reflect sound, and bigger rooms ring for longer.',
          'Acoustic panels absorb sound and shorten RT60. The treatment steps work out how much is needed.',
        ] },
        { id: 'app', from: 66, to: 72, title: 'In this app', scene: 'rtInApp', captions: [
          'Here you set the target. Then you measure the room, compare the two, and choose treatment if it is needed.',
        ] },
      ],
    },

    /* Home: a walkthrough of the workflow, one chapter per step, on a sketch of the app. Not every feature: the steps and
       what you do in each. The room in it is an example (10 × 6 × 3 m), not a measurement. */
    tour: {
      title: 'How the app works',
      lengthLabel: '2 min',
      closeLabel: 'Close the walkthrough',
      video: { src: '' },
      poster: { scene: 'tourMeasure', u: 0.95 },
      chapters: [
        { id: 'intro', from: 0, to: 7, title: 'The workflow', scene: 'tourIntro', captions: [
          'The app takes you through ten steps, from describing the room to a report you can share.',
          'The rail on the left always shows where you are and what is done.',
        ] },
        { id: 'room', from: 7, to: 18, title: 'Room Setup', scene: 'tourRoom', captions: [
          'Step 1: name the room, choose its type and use, and enter its length, width and height.',
          'The app works out the volume. You can also describe the surfaces, for the treatment later.',
        ] },
        { id: 'target', from: 18, to: 27, title: 'Target', scene: 'tourTarget', captions: [
          'Step 2: the app recommends a target RT60 from the room’s use and size.',
          'Check it and confirm. Adjust it only if the project has its own criteria.',
        ] },
        { id: 'setup', from: 27, to: 38, title: 'Measurement Setup', scene: 'tourSetup', captions: [
          'Step 3: allow the microphone, prepare the room, and measure the background noise.',
          'One device does everything: its own speaker plays the test signal and its microphone records.',
        ] },
        { id: 'measure', from: 38, to: 52, title: 'Measure', scene: 'tourMeasure', captions: [
          'Step 4: place the device at the first position and start the measurement. A take lasts about 10 seconds.',
          'Then move to a second position and measure again. The room’s values are the average of the positions.',
        ] },
        { id: 'processing', from: 52, to: 61, title: 'Processing', scene: 'tourProcessing', captions: [
          'Step 5: the app checks each take and calculates RT60, band by band.',
          'A take that cannot be trusted is rejected with the reason, never guessed.',
        ] },
        { id: 'results', from: 61, to: 71, title: 'Results', scene: 'tourResults', captions: [
          'Step 6: the measured RT60, averaged over the positions, in plain words first.',
          'The technical detail is one click away when you need it.',
        ] },
        { id: 'assessment', from: 71, to: 80, title: 'Assessment', scene: 'tourAssessment', captions: [
          'Step 7: the room is compared with its target, band by band.',
          'You see straight away whether it meets the target or needs treatment.',
        ] },
        { id: 'treatment', from: 80, to: 91, title: 'Treatment', scene: 'tourTreatment', captions: [
          'Step 8: choose tested acoustic products and how many.',
          'The app shows how much absorption is needed and how much your plan adds.',
        ] },
        { id: 'prediction', from: 91, to: 100, title: 'Predicted Result', scene: 'tourPrediction', captions: [
          'Step 9: see the RT60 the room is predicted to have after treatment, against the target.',
          'Change the amounts here and the prediction updates.',
        ] },
        { id: 'final', from: 100, to: 111, title: 'Final Result', scene: 'tourFinal', captions: [
          'Step 10: the whole project on one page.',
          'Fill in the short report form, then download the PDF report for your client.',
        ] },
        { id: 'end', from: 111, to: 116, title: 'Ready', scene: 'tourOutro', captions: [
          'That is the workflow. Every step has an Explain button, and short videos where they help.',
        ] },
      ],
    },
  };
})(window.AM);
