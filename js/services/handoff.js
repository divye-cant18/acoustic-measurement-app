/* Estimate | Measure: the link with Lighter RT60, the quick sales estimator ("Estimate").

   Lighter hands a room over in the address, after the "#", which browsers never send to a server:
     #handoff=<base64url of JSON>   { v: 1, from: 'estimate', back, room: { name, industry, type, typeOther, use, L, W, H,
                                      occupancy, furnishing, surfaces: { wall1..wall4: { type, other, doors, windows },
                                      floor: { type, other }, ceiling: { type, other } } } }
     #from=estimate                 the switch was pressed with no room open
   The room becomes a new measurement, filled in through Room Setup's own actions (as the voice confirm card fills it),
   so every value is checked the same way and anything this app does not know is left out. The project keeps where it
   came from (room.estimateBack), so the Estimate switch returns to that room in Lighter. Nothing is sent anywhere.

   AM.services.handoff:
     receive()            on start, after the store has loaded: takes a handed-over room, if any, and clears the address
     estimateLink(p)      where the Estimate switch goes: the room this project came from, else Lighter's projects
     canGoBack(p)         whether that is simply the page before this one (the switch then uses the browser's Back)
     ESTIMATE_URL         Lighter's address */
(function (AM) {
  'use strict';

  const ESTIMATE_URL = 'https://univicoustic-product-advisor.vercel.app';
  const S = AM.store, W = AM.workflow, D = AM.demo;
  const WALLS = ['wall1', 'wall2', 'wall3', 'wall4'];
  const LIMITS = { L: [1, 100], W: [1, 100], H: [1.8, 30] }; // as Room Setup checks them (js/stages/room.js)
  const MAX_OPENINGS = 20;
  const FURNISHING = ['Empty', 'Lightly furnished', 'Furnished'];

  const text = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);

  function decode(s) {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
  }

  // A link back is only ever to Lighter itself: its address online, or this computer while developing.
  function safeBack(u) {
    try {
      const url = new URL(u);
      if (url.origin === new URL(ESTIMATE_URL).origin || /^(localhost|127\.0\.0\.1)$/.test(url.hostname)) return url.href;
    } catch (e) { /* not an address */ }
    return '';
  }

  function fill(data) {
    const r = (data && data.room) || {};
    S.startProject('new');
    const A = W.get('room').actions, ctx = () => ({ project: S.state.project, state: S.state }), room = () => S.state.project.room;

    // Industry, then room type, then main activity: each only as Room Setup offers it.
    if (D.INDUSTRIES.some(i => i.name === r.industry)) A.setIndustry(ctx(), r.industry);
    if (room().industry && D.roomTypesFor(room().industry).includes(r.type)) A.setType(ctx(), r.type);
    if (room().type === D.OTHER_TYPE && r.typeOther) S.set('room.typeOther', text(r.typeOther, 80));
    if (room().type && AM.services.target.knownUses(room().type).includes(r.use)) S.set('room.use', r.use);

    const name = text(r.name, 80);
    if (name) S.set('room.name', name);
    Object.keys(LIMITS).forEach(k => {
      const v = r[k], [lo, hi] = LIMITS[k];
      if (typeof v === 'number' && isFinite(v) && v >= lo && v <= hi) S.set(`room.${k}`, Math.round(v * 100) / 100);
    });
    if (Number.isInteger(r.occupancy) && r.occupancy > 0 && r.occupancy <= 5000) S.set('room.occupancy', r.occupancy);
    if (FURNISHING.includes(r.furnishing)) S.set('room.furnishing', r.furnishing);

    // Walls, floor and ceiling: the same types in both apps. "Something else" keeps the rep's words.
    const surfaces = r.surfaces || {};
    [...WALLS, 'floor', 'ceiling'].forEach(key => {
      const s = surfaces[key];
      if (!s || !s.type) return;
      A.setSurfaceType(ctx(), `${key}|${s.type}`);
      const other = text(s.other, 80);
      if (s.type === 'other' && other) S.set(`room.surfaces.${key}.finishOther`, { name: other, notes: 'From the estimate' });
    });
    // Doors and windows on each wall, at the standard sizes.
    WALLS.forEach(key => {
      const s = surfaces[key] || {};
      ['door', 'window'].forEach(kind => {
        const want = Math.max(0, Math.min(MAX_OPENINGS, Number.isInteger(s[`${kind}s`]) ? s[`${kind}s`] : 0));
        for (let i = 0; i < want; i++) A.stepOpening(ctx(), `${key}|${kind}|1`);
      });
    });

    const back = safeBack(data && data.back);
    if (back) S.set('room.estimateBack', back);
    S.toast(`${room().name || 'The room'} came from the estimate. Check Room Setup, then measure.`);
  }

  // Where this tab came from: Lighter's page just before this one in the browser's history. While nothing else has been
  // opened since, the Estimate switch goes back to it with the browser's Back, which shows it at once, as it was left.
  const ARRIVED = 'am-from-estimate';
  function remember(back) {
    try { sessionStorage.setItem(ARRIVED, JSON.stringify({ len: history.length, back: back || '' })); } catch (e) { /* only a speed-up */ }
  }
  function cameFrom() {
    try { return JSON.parse(sessionStorage.getItem(ARRIVED) || 'null'); } catch (e) { return null; }
  }

  // The end of the switch: the UV tile, still, in the middle, as Lighter left it; the app fades in around it and the
  // switch's thumb slides over to Measure. It is the page's own opening tile (#boot in index.html, already showing,
  // logo built in), so nothing pops or waits for a download.
  function arrive() {
    let over = document.getElementById('boot');
    if (over) over.removeAttribute('id'); // taken: the app's start leaves it to this
    else {
      over = document.createElement('div');
      over.className = 'app-switch-spin';
      over.innerHTML = '<div class="app-switch-tile"><img alt=""></div>';
      over.querySelector('img').src = window.UV_ICON || 'assets/brand/univicoustic-icon.png';
      document.body.appendChild(over);
    }
    over.setAttribute('aria-hidden', 'true');
    const tile = over.firstElementChild;
    const ease = 'cubic-bezier(.22,1,.36,1)';
    requestAnimationFrame(() => {
      tile.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }], { duration: 320, easing: ease, fill: 'forwards' });
      over.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, easing: 'ease-out', fill: 'forwards' }).finished.then(() => over.remove(), () => over.remove());
      // The app is drawn by now: the thumb comes across from Estimate, as if the one switch had been flipped.
      const thumb = document.querySelector('.app-switch .as-thumb');
      if (thumb && !matchMedia('(prefers-reduced-motion: reduce)').matches)
        thumb.animate([{ transform: 'translateX(-100%)' }, { transform: 'none' }], { duration: 380, delay: 180, easing: ease, fill: 'backwards' });
    });
  }

  function receive() {
    const h = location.hash || '';
    const m = h.match(/^#handoff=([A-Za-z0-9_-]+)$/);
    if (!m && h !== '#from=estimate') return false;
    // Cleared at once, so a reload never starts the same room twice.
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* address unchanged */ }
    let back = '';
    if (m) {
      try {
        const data = decode(m[1]);
        if (data && data.v === 1 && data.from === 'estimate') {
          fill(data);
          back = safeBack(data.back);
        }
      } catch (e) {
        S.toast('The room from the estimate could not be read. Fill in Room Setup here.');
      }
    }
    remember(back);
    arrive();
    return true;
  }

  /** Whether the Estimate switch can simply go back: the page before this one is the Lighter page the switch means. */
  function canGoBack(p) {
    const c = cameFrom();
    const back = (p && p.room && safeBack(p.room.estimateBack)) || '';
    return !!c && c.len === history.length && history.length > 1 && c.back === back;
  }

  function estimateLink(p) {
    const back = p && p.room && safeBack(p.room.estimateBack);
    return back || `${ESTIMATE_URL}/#/projects`;
  }

  AM.services.handoff = { receive, estimateLink, canGoBack, ESTIMATE_URL };
})(window.AM);
