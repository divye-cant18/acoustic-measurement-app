/* TEST HARNESS — a virtual room in place of the microphone and speaker, to test the live measurement end to end in a
   browser that has no microphone. Loaded only by tests/virtual-room.html. The application never loads it, and nothing
   from it can reach a real measurement.

   It replaces navigator.mediaDevices.getUserMedia / enumerateDevices and navigator.permissions.query, and routes
   everything the app plays (AudioContext.destination) through a simulated room: the played signal is convolved with a
   synthetic impulse response of known RT60 per octave band (tests/fixtures.js), background noise is added, and the result
   is the stream the app receives as "the microphone". The app's own code runs unchanged: it opens the stream, plays the
   sweep, records, and analyses exactly as it would with a real microphone and speaker.

   The virtual device is a single laptop or phone: its speaker and microphone are centimetres apart, so the direct sound
   reaches the microphone far louder than the room's reverberation (directDb).

   VR controls (window.VR):
     mode          'ok' | 'denied' | 'none' | 'busy'   what getUserMedia does
     rt            RT60 per octave band of the virtual room (125 … 4000 Hz), seconds
     directDb      energy of the direct sound from the device's speaker to its microphone, above the whole reverberation, dB
                   (null: no direct sound, as with a microphone far from the source)
     gainsDb       level of the room response per octave band (a weak speaker in a band), dB
     noiseDbfs     background noise level at the microphone (white noise), dBFS
     speakerDbfs   RMS level of the room's response to the sweep at the microphone, dBFS
     disturb(kind) adds a changing sound for the next seconds: 'speech' | 'door' | 'hvac'
     stopMic()     ends the microphone track, as when a device is unplugged
     rebuild()     applies changed rt / gainsDb / speakerDbfs to the room */
(function () {
  'use strict';
  const RealAC = window.AudioContext || window.webkitAudioContext;
  const VR = window.VR = {
    mode: 'ok', rt: [1.0, 0.9, 0.8, 0.7, 0.6, 0.5], directDb: 18, gainsDb: null, noiseDbfs: -65, speakerDbfs: -24,
    stats: { getUserMedia: 0, contexts: 0 }, room: null, lastTrack: null,
  };

  function seededNoise(n, seed) {
    let a = seed >>> 0;
    const r = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) { let u = 0; while (u === 0) u = r(); x[i] = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
    return x;
  }

  function irBuffer(ctx) {
    const ir = window.FIX.roomIR({ fs: ctx.sampleRate, seconds: Math.max(2, Math.max(...VR.rt) * 1.6), rt: VR.rt, gainsDb: VR.gainsDb, seed: 5, directDb: VR.directDb });
    // Scale so the response to the sweep (RMS about 0.49) arrives at speakerDbfs RMS.
    let e = 0; for (let i = 0; i < ir.length; i++) e += ir[i] * ir[i];
    const g = Math.pow(10, VR.speakerDbfs / 20) / (0.49 * Math.sqrt(e));
    const buf = ctx.createBuffer(1, ir.length, ctx.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < ir.length; i++) ch[i] = ir[i] * g;
    return buf;
  }

  function ensureRoom() {
    if (VR.room) return VR.room;
    const ctx = new RealAC({ sampleRate: 48000 });
    const roomIn = ctx.createGain(), conv = ctx.createConvolver(), bus = ctx.createGain(), dest = ctx.createMediaStreamDestination();
    conv.normalize = false;
    conv.buffer = irBuffer(ctx);
    roomIn.connect(conv); conv.connect(bus); bus.connect(dest);
    // Steady background: 20 s of seeded white noise, looped.
    const nb = ctx.createBuffer(1, 20 * ctx.sampleRate, ctx.sampleRate);
    nb.copyToChannel(seededNoise(nb.length, 9), 0);
    const noise = ctx.createBufferSource(), ng = ctx.createGain();
    noise.buffer = nb; noise.loop = true; ng.gain.value = Math.pow(10, VR.noiseDbfs / 20);
    noise.connect(ng); ng.connect(bus); noise.start();
    VR.room = { ctx, roomIn, conv, bus, dest, noiseGain: ng };
    return VR.room;
  }
  VR.rebuild = () => { const r = ensureRoom(); r.conv.buffer = irBuffer(r.ctx); r.noiseGain.gain.value = Math.pow(10, VR.noiseDbfs / 20); };
  VR.setNoise = db => { VR.noiseDbfs = db; if (VR.room) VR.room.noiseGain.gain.value = Math.pow(10, db / 20); };

  // A changing background for the next few seconds.
  VR.disturb = kind => {
    const r = ensureRoom(), fs = r.ctx.sampleRate, n = 5 * fs, x = seededNoise(n, 77), base = Math.pow(10, VR.noiseDbfs / 20);
    for (let i = 0; i < n; i++) {
      const t = i / fs;
      let g = 0;
      if (kind === 'speech') g = (Math.floor(t / 0.25) % 2 ? 0 : 1) * (0.5 + 0.5 * Math.sin(t * 9)) * base * 30; // syllable-like bursts ~ +25 dB
      else if (kind === 'door') g = t > 2 && t < 2.08 ? base * 300 : 0;                                              // one impact ~ +50 dB
      else if (kind === 'hvac') g = t > 1.5 ? base * 3 : 0;                                                           // background steps up ~ +10 dB
      x[i] *= g;
    }
    const b = r.ctx.createBuffer(1, n, fs);
    b.copyToChannel(x, 0);
    const s = r.ctx.createBufferSource();
    s.buffer = b; s.connect(r.bus); s.start();
  };
  VR.stopMic = () => { if (VR.lastTrack) VR.lastTrack.stop(); if (VR.lastTrack) VR.lastTrack.dispatchEvent(new Event('ended')); };

  /* ---------- browser API replacements ---------- */
  // Projects made in the harness are stored under their own prefix, so they never appear in the application's history.
  const PREFIX = 'vr-harness:', sp = Storage.prototype, gi = sp.getItem, si = sp.setItem, ri = sp.removeItem;
  sp.getItem = function (k) { return gi.call(this, PREFIX + k); };
  sp.setItem = function (k, v) { return si.call(this, PREFIX + k, v); };
  sp.removeItem = function (k) { return ri.call(this, PREFIX + k); };

  const md = navigator.mediaDevices;
  md.getUserMedia = async () => {
    VR.stats.getUserMedia++;
    if (VR.mode === 'denied') throw new DOMException('Permission denied', 'NotAllowedError');
    if (VR.mode === 'none') throw new DOMException('Requested device not found', 'NotFoundError');
    if (VR.mode === 'busy') throw new DOMException('Could not start audio source', 'NotReadableError');
    const r = ensureRoom();
    if (r.ctx.state !== 'running') await r.ctx.resume();
    const track = r.dest.stream.getAudioTracks()[0].clone();
    VR.lastTrack = track;
    return new MediaStream([track]);
  };
  md.enumerateDevices = async () => [
    { kind: 'audioinput', deviceId: 'virtual-room', groupId: 'vr', label: VR.mode === 'ok' ? 'Virtual device microphone (test harness)' : '' },
    { kind: 'audiooutput', deviceId: 'default', groupId: 'vr', label: VR.mode === 'ok' ? 'Default - Virtual device speaker (test harness)' : '' },
  ];
  const realQuery = navigator.permissions && navigator.permissions.query.bind(navigator.permissions);
  if (navigator.permissions) navigator.permissions.query = async d => (d && d.name === 'microphone' ? { state: VR.mode === 'denied' ? 'denied' : 'granted' } : realQuery(d));

  // Everything the app plays goes into the virtual room instead of the speakers.
  class VRContext extends RealAC {
    constructor(opts) {
      super(opts);
      VR.stats.contexts++;
      this._vrOut = RealAC.prototype.createMediaStreamDestination.call(this);
      const r = ensureRoom();
      r.ctx.createMediaStreamSource(this._vrOut.stream).connect(r.roomIn);
    }
    get destination() { return this._vrOut; }
  }
  window.AudioContext = VRContext;
  window.webkitAudioContext = VRContext;
})();
