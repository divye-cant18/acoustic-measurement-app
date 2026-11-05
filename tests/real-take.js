/* Development only: runs the application's own take (AM.services.measurement) on this device's real speaker and
   microphone and keeps the raw recording, which the application itself never stores. For finding out what a device does
   to a take: normal takes, a take with no test sound (damage there comes from the recording path, not the speaker) and
   takes at a lower sweep level (damage that goes away there comes from the speaker).
   ?send=PORT sends each recording to a receiver on this computer (http://127.0.0.1:PORT/take?name=...). Without it, or
   when sending fails, each recording is offered as a file to save. */
(function () {
  'use strict';
  const AN = AM.analysis, IO = AM.audioIO, MEAS = AM.services.measurement, PROC = AM.services.processing;
  const $ = id => document.getElementById(id);
  const port = new URLSearchParams(location.search).get('send');
  const RUNS = [
    { name: 'normal-1', level: 0 }, { name: 'normal-2', level: 0 }, { name: 'normal-3', level: 0 },
    { name: 'silent', silent: true },
    { name: 'quiet-1', level: -12 }, { name: 'quiet-2', level: -12 },
  ];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const status = t => { $('status').textContent = t; };

  // The recording as analysed, kept before the application's code lets it go.
  let kept = null;
  const analyse = AN.analyseTake;
  AN.analyseTake = function (rec, plan, sweep, losses) { kept = { rec: Float32Array.from(rec), plan, losses }; return analyse.call(AN, rec, plan, sweep, losses); };

  function wav(samples, fs) {
    const n = samples.length, b = new ArrayBuffer(44 + n * 4), v = new DataView(b);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true);
    v.setUint16(20, 3, true); v.setUint16(22, 1, true); v.setUint32(24, fs, true); v.setUint32(28, fs * 4, true);
    v.setUint16(32, 4, true); v.setUint16(34, 32, true); str(36, 'data'); v.setUint32(40, n * 4, true);
    new Float32Array(b, 44).set(samples);
    return new Blob([b], { type: 'application/octet-stream' });
  }

  async function save(name, blob, cell) {
    if (port) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/take?name=${encodeURIComponent(name)}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: blob });
        if (r.ok) { cell.append(`${cell.textContent ? ' · ' : ''}sent`); return; }
      } catch (e) { /* offered as a file below */ }
    }
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name, textContent: name });
    cell.append(a, ' ');
  }

  function row(name) {
    const tr = document.createElement('tr'), cells = [name, '…', '', '', '', '', ''].map(t => { const td = document.createElement('td'); td.textContent = t; tr.appendChild(td); return td; });
    $('rows').appendChild(tr);
    return cells;
  }

  // What a take found, without any recorded sound (the recording goes in its own file).
  const summary = (name, level, t, res) => ({
    name, level, takenAt: t.takenAt, status: t.status, reason: t.reason, sampleRate: t.sampleRate, deviceLabel: t.deviceLabel, outputLabel: t.outputLabel, settings: t.settings, tap: t.tap,
    browser: t.config && t.config.browser, output: t.config && t.config.output, plan: t.plan, levels: t.levels, integrity: t.integrity,
    analysis: t.analysis && { latencySec: t.analysis.latencySec, arrivalClarityDb: t.analysis.arrivalClarityDb, onsetSec: t.analysis.onsetSec, irSeconds: t.analysis.irSeconds, distortion: t.analysis.distortion, timing: t.analysis.timing, clicks: t.analysis.clicks, sweepGain: t.analysis.sweepGain, damage: t.analysis.damage },
    result: res && { valid: res.valid, reason: res.reason, warnings: res.warnings, bands: res.bands.map(b => ({ f: b.f, rt60: b.rt60, path: b.path, t20: b.t20, t30: b.t30, decayRangeDb: b.decayRangeDb, headDb: b.headDb, curvature: b.curvature, reason: b.reason || null })) },
  });
  const clicksText = c => (c && c.found && c.found.length ? c.found.map(k => `${k.atSec.toFixed(2)} s, ${Math.round(k.db)} dB`).join('; ') : 'none');

  async function normalTake(run, cells) {
    kept = null;
    const t = await MEAS.measureRT60({ deviceId: 'default', outputId: 'default', position: 'P1', levelDb: run.level }).done;
    const res = t.status === 'captured' ? PROC.evaluate(t, {}) : null, a = t.analysis || {};
    cells[1].textContent = res ? (res.valid ? `Valid, ${res.bands.filter(b => b.rt60 != null).length} of 6 bands` : `Not valid, ${res.bands.filter(b => b.rt60 != null).length} of 6 bands`) : `Failed: ${t.reason}`;
    cells[1].className = res && res.valid ? 'ok' : 'bad';
    cells[2].textContent = clicksText(a.clicks);
    cells[3].textContent = a.clicks && a.clicks.worstDb != null ? a.clicks.worstDb : '—';
    cells[4].textContent = a.timing && a.timing.maxStepMs != null ? `${a.timing.maxStepMs} ms` : '—';
    cells[5].textContent = t.integrity ? `${t.integrity.inputLostFrames} / ${t.integrity.outputUnderruns}` : '—';
    if (kept) await save(`${run.name}.wav`, wav(kept.rec, kept.plan.fs), cells[6]);
    await save(`${run.name}.json`, new Blob([JSON.stringify(summary(run.name, run.level, t, res), null, 1)]), cells[6]);
  }

  // The same recording, the same length, and no test signal: read the way a take is read, as if the sweep had played.
  async function silentTake(run, cells) {
    const s = await IO.acquire('take', 'default', 'default');
    try {
      await s.waitForAudio();
      const plan = AN.sweepPlan(s.sampleRate), x = await s.record(Math.round(plan.total * plan.fs)).done;
      const above = AN.aboveSweep(x, plan, Math.round((plan.preRoll + 0.05) * plan.fs));
      cells[1].textContent = 'Recorded, no test sound';
      cells[2].textContent = clicksText(above.clicks);
      cells[3].textContent = above.clicks.worstDb != null ? above.clicks.worstDb : '—';
      await save(`${run.name}.wav`, wav(x, plan.fs), cells[6]);
      await save(`${run.name}.json`, new Blob([JSON.stringify({ name: run.name, sampleRate: plan.fs, deviceLabel: s.label, settings: s.settings, plan, clicks: above.clicks, sweepGain: above.gain }, null, 1)]), cells[6]);
    } finally { IO.release('take'); }
  }

  $('start').addEventListener('click', async () => {
    $('start').disabled = true;
    // The microphone stays open across the takes, as on the Measure step.
    let mon = null;
    try {
      status('Opening the microphone…');
      mon = await MEAS.monitor('default', null, null, 'default');
      await sleep(1500);
      let done = 0;
      for (const run of RUNS) {
        const cells = row(run.name);
        status(`${run.name} (${++done} of ${RUNS.length}). Keep the room quiet and do not touch the laptop.`);
        try {
          if (run.silent) await silentTake(run, cells); else await normalTake(run, cells);
        } catch (e) {
          cells[1].textContent = `Stopped: ${e.message}`;
          cells[1].className = 'bad';
          await save(`${run.name}.json`, new Blob([JSON.stringify({ name: run.name, error: e.message, code: e.code })]), cells[6]);
        }
        await sleep(1500);
      }
      status('Finished. You can close this tab.');
      document.title = 'Real take capture: finished';
    } catch (e) {
      status(`Could not start: ${e.message}`);
    } finally {
      if (mon) mon.stop();
      $('start').disabled = false;
    }
  });
  if (window.location.search.includes('auto')) $('start').click();
})();
