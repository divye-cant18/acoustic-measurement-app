/* Home: the application's workspace. Start a new measurement, or reopen a saved project.
   Projects come from Measurement History (saved in this browser, no account). Pinned projects stay at the top;
   Recent shows the latest of the rest, and the full list is one click away in Measurement History. */
(function (AM) {
  'use strict';
  const { esc, icon } = AM.util;
  const W = AM.workflow, S = AM.store, ui = AM.ui;

  const RECENT = 6; // recent projects shown on Home; the history sheet lists every project

  // What happens in each phase of the workflow, in a sentence. Step numbers come from the workflow itself.
  const PHASE_TEXT = {
    Define: 'Describe the room. Its size and use set the target RT60.',
    Measure: 'Your device measures the background noise, then plays a test sweep through its speaker and records the room with its microphone.',
    Analyse: 'RT60, the time sound takes to fade by 60 dB, is calculated from the recording and compared with the target.',
    Improve: 'Choose tested acoustic products and see the RT60 they are predicted to give.',
    Summary: 'Review the whole project and download a PDF report.',
  };
  function howItWorks() {
    const items = W.PHASES.map(ph => {
      const n = W.STAGES.filter(s => s.phase === ph).map(s => W.stepNo(s.id));
      const steps = n.length > 1 ? `Steps ${n[0]}–${n[n.length - 1]}` : `Step ${n[0]}`;
      return `<li class="how-i"><span class="how-h"><b>${esc(ph)}</b><span>${steps}</span></span><span class="how-t">${esc(PHASE_TEXT[ph] || '')}</span></li>`;
    }).join('');
    return `<section class="home-sec" aria-labelledby="how-h"><div class="home-sec-h"><h2 id="how-h">How a measurement works</h2></div><ol class="how">${items}</ol></section>`;
  }

  function view(ctx) {
    const p = ctx.project, all = S.history().map(AM.derive.summary), active = p && p.id;
    const pinned = all.filter(s => s.pinned), others = all.filter(s => !s.pinned), recent = others.slice(0, RECENT);
    const cards = list => `<div class="pcards">${list.map(s => ui.projectCard(s, active)).join('')}</div>`;

    const head = `<header class="home-head">
        <div class="home-brand">${ui.logo(44)}${ui.wordmark(40)}</div>
      </header>
      <section class="home-hero">
        <h1 class="home-title">${esc(AM.brand.descriptor)}</h1>
        <p class="home-lede">Measure how long sound lingers in a room, compare it with the target for the way the room is used, and see what acoustic treatment would change.</p>
        ${all.length ? `<div class="home-actions">
          <button class="btn btn-primary btn-lg" data-action="startNew">${icon('plus', 18, 2.4)} New Measurement</button>
          <button class="btn btn-secondary btn-lg" data-action="history">${icon('history', 18, 2)} Measurement History</button>
        </div>` : ''}
      </section>`;

    let projects;
    if (!all.length) { // the empty panel carries the one New Measurement button
      projects = `<section class="home-empty">
        ${icon('wave', 30, 1.8)}
        <h2>No measurements yet</h2>
        <p>Start your first acoustic measurement to create a project.</p>
        <button class="btn btn-primary btn-lg" data-action="startNew">${icon('plus', 18, 2.4)} New Measurement</button>
      </section>`;
    } else {
      projects = `${pinned.length ? `<section class="home-sec" aria-labelledby="pinned-h">
          <div class="home-sec-h"><h2 id="pinned-h">${icon('pushpin', 16, 2)} Pinned projects <span class="home-count">${pinned.length}</span></h2></div>
          ${cards(pinned)}
        </section>` : ''}
        ${others.length ? `<section class="home-sec" aria-labelledby="recent-h">
          <div class="home-sec-h"><h2 id="recent-h">Recent projects</h2>
            ${others.length > RECENT ? `<button class="btn btn-ghost btn-sm" data-action="history">View all ${all.length} ${icon('arrowR', 14, 2.2)}</button>` : pinned.length ? '' : '<span class="small muted">Pin a project to keep it at the top.</span>'}</div>
          ${cards(recent)}
        </section>` : ''}`;
    }

    return {
      header: false,
      footer: false,
      body: `<div class="home">${head}${projects}${howItWorks()}
        <p class="home-foot">${icon('info', 14, 2)} Projects are saved in this browser on this device. No account is needed.</p></div>`,
    };
  }

  W.define('home', { view });
})(window.AM);
