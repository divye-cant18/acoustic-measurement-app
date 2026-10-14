/* ExplanationProvider — STATIC placeholder for the contextual assistant.

   Contract the assistant must keep:
     forStage(stageId, project) -> { title, paragraphs: string[] }

   The assistant explains results produced by the deterministic engines. It never calculates or changes them.
   This placeholder fills prewritten text with the project's own numbers. */
(function (AM) {
  'use strict';
  const { fmt, isNum } = AM.util;

  const TEXT = {
    home: () => [
      'A project follows one room from description to a predicted result. The steps in the sidebar are the whole process, in order.',
      'Each step opens once the one before it is finished. You can go back to any finished step. If you change something there, the later steps are marked for review.',
      'Every measurement you start is kept in Measurement History on this device, so you can reopen it later. Starting a new one never replaces an earlier one.',
    ],
    room: p => {
      const g = AM.acoustics.geometry(p.room);
      return [
        `Reverberation depends on two things: how big the room is and how much of its surface absorbs sound.${g ? ` This room holds ${fmt.m3(g.V)} of air and has ${fmt.m2(g.total, 0)} of surface.` : ''}`,
        'Bigger rooms ring longer. Hard surfaces such as plasterboard, glass and concrete reflect most of the sound that reaches them. Soft, porous materials absorb it.',
        'Describe each surface on its own: the four walls (1 and 3 are the long walls, 2 and 4 the end walls), the floor and the ceiling, with any doors, windows or partial coverings. The room\'s RT60 is not estimated from them: it is measured later, with the microphone.',
        'Three values stay separate: the target (what the room should be, from its type and use), the measured RT60 (from the microphone) and, if you choose treatment, the RT60 predicted after it. That prediction starts from the measured room; the surfaces tell it what each product covers, so nothing is counted twice. A surface never changes the target or a measurement.',
        'The How to measure the room video in the Dimensions card shows how to take the length, width and height.',
      ];
    },
    target: p => {
      const rec = AM.services.target.recommend(p.room);
      return [
        // Only a complete target (preferred, minimum and maximum) is quoted; a preferred value set while the range is still
        // empty (the room size not entered yet) is not.
        `RT60 is the time it takes for sound to fall by 60 dB after the source stops.${(t => (t ? ` The target here is ${fmt.s(t.preferred)}, with an acceptable range of ${t.min.toFixed(2)}–${fmt.s(t.max)}.` : ''))(AM.derive.target(p))}`,
        rec ? `The recommendation follows ${rec.source.short}, ${rec.criterion.name}, chosen from the room type and how the room is used. The room's volume${rec.inUse && rec.inUse.people ? ' and occupancy' : ''} then set${rec.inUse && rec.inUse.people ? '' : 's'} the value.` : 'Rooms for speech work best with short reverberation, so words stay distinct. Rooms for music usually want more.',
        'The target is a decision made before measuring. Keeping it separate from the measured value keeps the comparison honest.',
      ];
    },
    setup: () => [
      'One device does the whole measurement: the laptop or phone you are using plays the test signal through its own speaker and records the room with its own microphone. Nothing else needs to be connected.',
      'A measurement is only as good as its conditions. Background noise sets a floor the decay has to fall through, so a noisier room leaves less usable decay to measure.',
      'The background is measured with the microphone for five seconds, in the frequency bands RT60 is measured in. If voices, knocks or a changing level are picked up, you are told to measure with care; only a silent or overloaded input has to be measured again. Each take then checks its own background: sounds during the take that could affect the decay are counted as noise, and the take says so.',
      'Levels are shown in dBFS, relative to the microphone input\'s full scale, because the microphone is not calibrated. RT60 only needs relative levels: it is a time, not a loudness.',
      'Place the device where people actually sit, on a firm support, not held, and away from walls where practical.',
    ],
    measure: () => [
      'The device records the room for a moment, then plays an exponential sine sweep through its own speaker and keeps recording with its own microphone while the sound dies away.',
      'From the recording it recovers the room\'s impulse response by deconvolution: how the room answers a single, very short sound. The delay between playing and recording is read from that response, not assumed.',
      'Because the speaker and the microphone are centimetres apart, the sound that travels straight from one to the other is much louder than the room\'s reverberation. The analysis separates that direct sound from the room\'s decay and measures only the decay.',
      'The sweep level changes how loud this app plays the test sweep, in steps of 3 dB from its default (0 dB), up to the most the sweep can be raised without clipping. A higher level can lift the room\'s decay further above the background noise; it does not change the decay itself, so valid takes at different levels should give similar RT60. It is not sound pressure: the device and its volume decide how loud the room hears it. Use a comfortable level, and lower it if the sound distorts.',
      'A finished take is not yet a measurement. The next step checks whether the decay in it is long and clean enough to calculate RT60. A take that fails never replaces a valid measurement; earlier valid takes stay listed under Results, each with its sweep level.',
      'The How to measure video at the top of this step shows how to place the device and what to avoid during the take.',
    ],
    processing: () => [
      'The impulse response is split into octave bands. In each band the device\'s direct sound is separated from the room\'s reverberant decay, the noise floor and the point where the decay meets it are found (Lundeby\'s method), and the decay curve is built by backward integration (Schroeder).',
      'For every band it asks how much of the room\'s own decay sits above the noise floor. With 45 dB it fits 30 dB and extrapolates (T30). With 35 dB it fits 20 dB and extrapolates (T20). With less, that band has no value.',
      'A value is also rejected when the decay is not a straight line. If the 1000 Hz band has no value, the result is "Unable to obtain a reliable RT60 measurement" and nothing is estimated in its place.',
    ],
    results: p => {
      const m = AM.derive.measured(p), avg = AM.derive.averageRT60(p);
      return [
        m ? (avg.available ? `Averaged over 500, 1000 and 2000 Hz, the room takes ${fmt.s(avg.value)} for sound to fall by 60 dB. The average always uses these three bands, so it means the same on every device; if one of them has no reliable value there is no average, rather than one over fewer bands. It is a summary of the mid frequencies, not a standardised single-number rating.` : `There is no average RT60 (500–2000 Hz) for this measurement: ${avg.reason} The bands that have a value are listed on their own.`) : 'No valid result yet.',
        m ? `At ${m.headline.f} Hz, the band the target is compared at, it takes ${fmt.s(m.headline.rt60)}, calculated with ${m.headline.method} from the take recorded ${new Date(m.takenAt).toLocaleString()}.` : '',
        'Low frequencies usually ring longest, because most surfaces absorb bass poorly. A laptop or phone speaker produces little low-frequency sound: those bands may show "Not reliable" rather than a guess.',
        'This is a browser-based measurement with the device\'s built-in speaker and microphone. The RT60 comes from the room\'s measured decay, but neither the microphone nor the speaker is calibrated, so it is not a laboratory-grade measurement.',
        'Confidence follows what was measured: T30 with a straight decay gives high confidence; T20, a curved decay or browser processing that stayed on gives medium.',
      ].filter(Boolean);
    },
    assessment: p => {
      const a = AM.derive.assessment(p);
      return [
        a ? `At ${a.f} Hz, where the target is set, the room measures ${fmt.s(a.rt)} against a preferred ${fmt.s(a.target.preferred)}, a difference of ${fmt.signedS(a.diff)}. The average across the measured bands on Results is a summary and is not what is compared.` : 'No assessment yet.',
        'The assessment only compares two things that already exist: the target you set and the value you measured. It does not change either of them.',
        'A room above its range sounds boomy and blurs speech. A room below its range sounds dead and tiring.',
      ];
    },
    treatment: () => [
      'Treatment adds absorption. Each square metre contributes its absorption coefficient (α), which changes with frequency.',
      'The same product absorbs differently depending on how it is mounted. A panel fixed directly to the wall and the same panel on a 50 mm air gap are separate tested configurations, each with its own test certificate and α values. Choose the one that matches the installation.',
      'NRC is the average of α at 250, 500, 1000 and 2000 Hz. It is handy for comparing products, but the per-band values decide the result.',
      'A plan can combine several products, for example wall panels and ceiling tiles. Each keeps its own configuration and α; their absorption adds up band by band in the prediction.',
    ],
    prediction: () => [
      'The prediction starts from the measured RT60: it gives the room’s equivalent absorption, everything in the room included. The panels’ tested absorption is added (less that of the surface they cover) and RT60 is recalculated with the Sabine formula. The room’s own RT60 is never estimated: it is measured.',
      'The model assumes an even spread of sound. In a room that becomes very absorbent (average absorption coefficient above about 0.3) Sabine reads long, and the page says so.',
      'It is an estimate. It is shown apart from measured values so the two are never confused. Only a new measurement after installation can confirm it.',
    ],
    final: () => [
      'This page follows the project end to end: the room, the target, what was measured, the treatment chosen and the predicted result.',
      'The loop closes with a second measurement after the treatment is installed. “Measure the treated room” starts that measurement as a new project with the same room and target.',
    ],
  };

  AM.services.explain = {
    kind: 'static',
    forStage(id, p) {
      const s = AM.workflow.get(id);
      return { title: s.title, paragraphs: p || id === 'home' ? TEXT[id](p) : [] };
    },
  };
})(window.AM);
