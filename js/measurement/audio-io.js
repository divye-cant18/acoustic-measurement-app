/* Browser audio input and output for the live measurement (MediaDevices + Web Audio).

   The microphone is opened with getUserMedia, asking the browser to switch off echo cancellation, noise suppression and
   automatic gain control, which would alter a decay. What the browser actually applied is read back from the track
   (track.getSettings()) and reported, never assumed. The stream feeds one AudioContext; a tap (AudioWorklet, or a
   ScriptProcessor where worklets are unavailable) reports block levels from the real samples and, while recording,
   passes the raw samples on. The test signal is played through the same AudioContext, so playback and capture share one
   clock; the remaining latency is found from the recording itself (see analysis.js).

   One microphone session is shared. Holders acquire and release it; the stream is stopped and the AudioContext closed
   when the last holder releases it, so the browser's microphone indicator goes off as soon as nothing is listening.

   Errors are AudioError objects with a code: denied, embedded, no-device, busy, unsupported, insecure, stopped,
   suspended, cancelled, error. Nothing here ever substitutes a value for audio that did not arrive. */
(function (AM) {
  'use strict';

  class AudioError extends Error { constructor(code, message) { super(message); this.name = 'AudioError'; this.code = code; } }
  const MESSAGES = {
    denied: 'Microphone access is blocked for this page. Allow the microphone in the browser (the lock or microphone icon next to the address, or the site settings), then try again.',
    embedded: 'This view shows the app inside another page that does not let it use the microphone. Open the app on its own (the downloaded copy in a browser) to measure.',
    'no-device': 'No usable microphone was found. Connect a microphone, or choose another input, then try again.',
    busy: 'The microphone could not be started. Another application may be using it. Close it and try again.',
    unsupported: 'This browser cannot capture audio on this page. Use a current version of Chrome, Edge, Firefox or Safari.',
    insecure: 'Microphone access needs a secure page (https, or a file or server on this computer).',
    stopped: 'The microphone stopped delivering audio.',
    suspended: 'The browser has paused audio for this page. Click the button again to start it.',
    cancelled: 'Cancelled.',
    error: 'The microphone could not be started.',
  };
  const err = (code, detail) => new AudioError(code, MESSAGES[code] + (detail ? ` (${detail})` : ''));

  // True only when the browser reports that the page containing this one does not allow the microphone here.
  function frameBlocked() {
    const pol = document.permissionsPolicy || document.featurePolicy;
    try { return !!(pol && pol.allowsFeature && !pol.allowsFeature('microphone')); } catch (e) { return false; }
  }

  function mapError(e) {
    const n = e && e.name;
    if (n === 'NotAllowedError' || n === 'PermissionDeniedError' || n === 'SecurityError') return err(frameBlocked() ? 'embedded' : 'denied');
    if (n === 'NotFoundError' || n === 'DevicesNotFoundError' || n === 'OverconstrainedError') return err('no-device');
    if (n === 'NotReadableError' || n === 'TrackStartError' || n === 'AbortError') return err('busy');
    if (n === 'TypeError') return err('unsupported');
    return err('error', e && e.message);
  }

  const AC = () => window.AudioContext || window.webkitAudioContext;
  function support() {
    const C = AC();
    return {
      secure: window.isSecureContext !== false,
      getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
      audioContext: !!C,
      worklet: !!(C && typeof AudioWorkletNode !== 'undefined'),
    };
  }

  async function permissionState() {
    if (frameBlocked()) return 'embedded';
    try { return (await navigator.permissions.query({ name: 'microphone' })).state; } catch (e) { return 'unknown'; }
  }

  // Audio inputs. Labels are only given once the page has been allowed to use the microphone.
  async function devices() {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      return list.filter(d => d.kind === 'audioinput').map((d, i) => ({ id: d.deviceId || 'default', label: d.label || `Microphone ${i + 1}` }));
    } catch (e) { return []; }
  }

  // The sound output the test signal plays through (the system's default), as the browser names it. Some browsers list
  // it once the microphone is allowed; others do not say, and then this is null.
  async function outputLabel() {
    try {
      const list = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audiooutput' && d.label);
      const d = list.find(x => x.deviceId === 'default') || list[0];
      return d ? d.label.replace(/^Default\s*-\s*/i, '') : null;
    } catch (e) { return null; }
  }

  // The kind of device this page runs on, from what the browser reports. Only used to word the placement advice.
  function deviceKind() {
    const nav = navigator, ua = nav.userAgent || '';
    if (nav.userAgentData && nav.userAgentData.mobile) return 'mobile';
    if (/Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua)) return 'mobile';
    if (/Macintosh/.test(ua) && nav.maxTouchPoints > 1) return 'mobile'; // iPadOS presents itself as a Mac
    return 'computer';
  }

  /* ---------- tap: levels from the real samples, and the samples themselves while recording ---------- */
  const BLOCK = 2048; // samples per level report (about 43 ms at 48 kHz)
  const WORKLET = `
    class AMTap extends AudioWorkletProcessor {
      constructor() {
        super();
        this.rec = false; this.chunk = new Float32Array(4096); this.ci = 0;
        this.pk = 0; this.ss = 0; this.n = 0; this.clip = 0; this.blocks = 0;
        this.port.onmessage = e => { if (e.data.cmd === 'rec') { if (!e.data.on) this.flush(); this.rec = e.data.on; } };
      }
      flush() { if (this.ci) { const c = this.chunk.slice(0, this.ci); this.port.postMessage({ t: 'pcm', d: c }, [c.buffer]); this.ci = 0; } }
      process(inputs) {
        const ch = inputs[0] && inputs[0][0];
        if (ch) {
          for (let i = 0; i < ch.length; i++) {
            const v = ch[i], a = v < 0 ? -v : v;
            if (a > this.pk) this.pk = a;
            this.ss += v * v;
            if (a >= 0.999) this.clip++;
            if (this.rec) { this.chunk[this.ci++] = v; if (this.ci === this.chunk.length) this.flush(); }
          }
          this.n += ch.length;
        }
        if (++this.blocks >= ${BLOCK / 128}) {
          this.port.postMessage({ t: 'lvl', pk: this.pk, ms: this.n ? this.ss / this.n : 0, n: this.n, clip: this.clip });
          this.pk = 0; this.ss = 0; this.n = 0; this.clip = 0; this.blocks = 0;
        }
        return true;
      }
    }
    registerProcessor('am-tap', AMTap);`;

  async function makeTap(ctx, onMessage) {
    if (typeof AudioWorkletNode !== 'undefined' && ctx.audioWorklet) {
      try {
        const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
        await ctx.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);
        const node = new AudioWorkletNode(ctx, 'am-tap', { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 1, channelCountMode: 'explicit' });
        node.port.onmessage = e => onMessage(e.data);
        return { kind: 'audio-worklet', node, record: on => node.port.postMessage({ cmd: 'rec', on }) };
      } catch (e) { /* fall back to a ScriptProcessor below */ }
    }
    // ScriptProcessor: runs on the page's thread; same measurements, same messages.
    const node = ctx.createScriptProcessor(BLOCK, 1, 1);
    let rec = false;
    node.onaudioprocess = ev => {
      const ch = ev.inputBuffer.getChannelData(0);
      let pk = 0, ss = 0, clip = 0;
      for (let i = 0; i < ch.length; i++) { const v = ch[i], a = v < 0 ? -v : v; if (a > pk) pk = a; ss += v * v; if (a >= 0.999) clip++; }
      if (rec) onMessage({ t: 'pcm', d: Float32Array.from(ch) });
      onMessage({ t: 'lvl', pk, ms: ss / ch.length, n: ch.length, clip });
    };
    node.connect(ctx.destination); // a ScriptProcessor only runs when connected; its output is silent
    return { kind: 'script-processor', node, record: on => { rec = on; } };
  }

  /* ---------- one microphone session ---------- */
  class Session {
    constructor(deviceId) {
      this.deviceId = deviceId || 'default';
      this.status = 'starting';     // starting | live | suspended | muted | stopped | closed
      this.levelListeners = new Set(); this.stateListeners = new Set();
      this.level = null; this.receivedAt = 0; this.recording = null;
    }

    async open() {
      const s = support();
      if (!s.secure) throw err('insecure');
      if (!s.getUserMedia || !s.audioContext) throw err('unsupported');
      const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 1 } };
      if (this.deviceId !== 'default') audio.deviceId = { exact: this.deviceId };
      try { this.stream = await navigator.mediaDevices.getUserMedia({ audio, video: false }); } catch (e) { throw mapError(e); }
      const track = this.track = this.stream.getAudioTracks()[0];
      if (!track) { this.close(); throw err('no-device'); }
      this.settings = track.getSettings ? track.getSettings() : {};
      this.label = track.label || 'Microphone';
      track.addEventListener('ended', () => this.setStatus('stopped'));
      track.addEventListener('mute', () => this.setStatus('muted'));
      track.addEventListener('unmute', () => this.setStatus(this.ctx && this.ctx.state === 'running' ? 'live' : 'suspended'));

      const C = AC();
      this.ctx = new C({ latencyHint: 'interactive' });
      this.sampleRate = this.ctx.sampleRate;
      this.source = this.ctx.createMediaStreamSource(this.stream);
      this.tap = await makeTap(this.ctx, m => this.onMessage(m));
      this.source.connect(this.tap.node);
      this.ctx.onstatechange = () => { if (this.status !== 'stopped' && this.status !== 'closed') this.setStatus(this.ctx.state === 'running' ? 'live' : 'suspended'); };
      if (this.ctx.state !== 'running') { try { await this.ctx.resume(); } catch (e) { /* needs a click: status says so */ } }
      this.setStatus(this.ctx.state === 'running' ? 'live' : 'suspended');
      return this;
    }

    onMessage(m) {
      if (m.t === 'pcm') { if (this.recording) this.recording.push(m.d); return; }
      if (m.t !== 'lvl') return;
      if (m.n > 0) this.receivedAt = performance.now();
      this.level = {
        peakDbfs: 20 * Math.log10(Math.max(m.pk, 1e-10)), rmsDbfs: 10 * Math.log10(Math.max(m.ms, 1e-20)),
        clipped: m.clip, samples: m.n, at: performance.now(),
      };
      this.levelListeners.forEach(fn => fn(this.level, this));
    }
    setStatus(s) { if (this.status === s || this.status === 'closed') return; this.status = s; this.stateListeners.forEach(fn => fn(s, this)); if (s === 'stopped' && this.recording) this.recording.abort(err('stopped')); }
    onLevel(fn) { this.levelListeners.add(fn); return () => this.levelListeners.delete(fn); }
    onState(fn) { this.stateListeners.add(fn); return () => this.stateListeners.delete(fn); }

    // Audio is arriving if a level report with samples came in the last half second.
    get receiving() { return this.status === 'live' && performance.now() - this.receivedAt < 500; }
    async resume() { if (this.ctx && this.ctx.state !== 'running') { await this.ctx.resume(); } this.setStatus(this.ctx.state === 'running' ? 'live' : 'suspended'); }
    waitForAudio(ms = 2000) {
      if (this.receiving) return Promise.resolve();
      if (this.status === 'suspended') return Promise.reject(err('suspended'));
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => { off(); reject(err('stopped', 'no audio arrived from the microphone')); }, ms);
        const off = this.onLevel(l => { if (l.samples > 0) { clearTimeout(t); off(); resolve(); } });
      });
    }

    // Records exactly `total` samples of the real input. A watchdog fails the recording if audio stops arriving.
    record(total, onProgress) {
      if (this.recording) throw err('error', 'a recording is already running');
      const chunks = [];
      let got = 0, timer = 0, resolveDone, rejectDone;
      const done = new Promise((res, rej) => { resolveDone = res; rejectDone = rej; });
      const stop = () => { this.tap.record(false); clearInterval(timer); this.recording = null; };
      const rec = this.recording = {
        push: d => {
          chunks.push(d); got += d.length;
          if (onProgress) onProgress(Math.min(got, total) / this.sampleRate, Math.min(1, got / total), d, got - d.length, total);
          if (got >= total) {
            stop();
            const out = new Float32Array(total);
            let o = 0;
            for (const c of chunks) { const k = Math.min(c.length, total - o); out.set(c.subarray(0, k), o); o += k; if (o >= total) break; }
            resolveDone(out);
          }
        },
        abort: e => { stop(); rejectDone(e); },
      };
      let last = 0, lastAt = performance.now();
      timer = setInterval(() => {
        if (got !== last) { last = got; lastAt = performance.now(); }
        else if (performance.now() - lastAt > 2500 && this.recording === rec) rec.abort(err('stopped', 'audio stopped arriving during the recording'));
      }, 500);
      this.tap.record(true);
      return { done, cancel: () => { if (this.recording === rec) rec.abort(err('cancelled')); } };
    }

    // Plays samples through the default output, `delay` seconds from now. Returns its scheduled start and an end promise.
    play(samples, delay) {
      const buf = this.ctx.createBuffer(1, samples.length, this.sampleRate);
      buf.copyToChannel(samples, 0);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.ctx.destination);
      const at = this.ctx.currentTime + delay;
      const ended = new Promise(r => { src.onended = r; });
      src.start(at);
      return { at, ended, stop: () => { try { src.stop(); } catch (e) { /* already stopped */ } } };
    }

    close() {
      if (this.recording) this.recording.abort(err('cancelled'));
      try { if (this.source) this.source.disconnect(); } catch (e) { /* ignore */ }
      if (this.stream) this.stream.getTracks().forEach(t => t.stop());
      if (this.ctx && this.ctx.state !== 'closed') this.ctx.close().catch(() => {});
      this.setStatus('closed');
      this.levelListeners.clear(); this.stateListeners.clear();
    }
  }

  /* ---------- the shared session ---------- */
  const holders = new Set();
  let shared = null, pending = null;

  async function acquire(holder, deviceId = 'default') {
    if (shared && (shared.deviceId !== (deviceId || 'default') || shared.status === 'stopped' || shared.status === 'closed') && !shared.recording) { shared.close(); shared = null; }
    if (!shared) {
      if (!pending) {
        const s = new Session(deviceId);
        pending = s.open().then(() => { shared = s; return s; }, e => { s.close(); throw e; }).finally(() => { pending = null; });
      }
      await pending;
    }
    holders.add(holder);
    return shared;
  }
  function release(holder) {
    holders.delete(holder);
    if (!holders.size && shared && !shared.recording) { shared.close(); shared = null; }
  }
  const current = () => shared;

  AM.audioIO = { AudioError, MESSAGES, support, permissionState, devices, outputLabel, deviceKind, acquire, release, current };
})(window.AM);
