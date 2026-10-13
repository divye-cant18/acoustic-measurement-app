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
  };
})(window.AM);
