/* Shared utilities.
   Everything lives on one global namespace (AM) so the app runs from file:// with no build step.
   Script order is set in index.html. */
window.AM = window.AM || { services: {} };

(function (AM) {
  'use strict';

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isNum = x => typeof x === 'number' && isFinite(x);
  const num = v => {
    if (v == null || v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v).trim().replace(',', '.'));
    return isFinite(n) ? n : null;
  };
  const int = v => { const n = num(v); return n == null ? null : Math.round(n); };
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const round = (x, d = 2) => Number(x.toFixed(d));
  const trimNum = (x, d = 2) => isNum(x) ? String(round(x, d)) : '—';
  const neg = s => String(s).replace(/^-/, '−');

  const fmt = {
    s: (x, d = 2) => isNum(x) ? x.toFixed(d) + ' s' : '—',
    signedS: (x, d = 2) => {
      if (!isNum(x)) return '—';
      const r = round(x, d);
      return (r > 0 ? '+' : r < 0 ? '−' : '±') + Math.abs(r).toFixed(d) + ' s';
    },
    m: x => isNum(x) ? trimNum(x) + ' m' : '—',
    m2: (x, d = 1) => isNum(x) ? x.toFixed(d) + ' m²' : '—',
    m3: (x, d = 0) => isNum(x) ? x.toFixed(d) + ' m³' : '—',
    db: (x, d = 0) => isNum(x) ? neg(x.toFixed(d)) + ' dB' : '—',
    dbfs: (x, d = 1) => isNum(x) ? neg(x.toFixed(d)) + ' dBFS' : '—',
    hz: f => f + ' Hz',
    hzShort: f => f >= 1000 ? (f / 1000) + 'k' : String(f),
    pct: (x, d = 0) => isNum(x) ? (x * 100).toFixed(d) + '%' : '—',
    dims: r => r && [r.L, r.W, r.H].every(isNum) ? `${trimNum(r.L)} × ${trimNum(r.W)} × ${trimNum(r.H)} m` : '—',
    // "today, 14:32", "yesterday, 09:10", or the date.
    ago: iso => {
      const d = new Date(iso);
      if (!iso || isNaN(d)) return '—';
      const day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
      const diff = Math.round((day(new Date()) - day(d)) / 864e5);
      const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      return diff === 0 ? `today, ${time}` : diff === 1 ? `yesterday, ${time}` : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    },
    when: iso => {
      try { return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
      catch (e) { return '—'; }
    },
  };

  const getPath = (o, path) => path.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
  function setPath(o, path, v) {
    const ks = path.split('.');
    const last = ks.pop();
    const t = ks.reduce((x, k) => (x[k] = x[k] ?? {}), o);
    t[last] = v;
  }

  /* 24px stroke icons. */
  const ICONS = {
    home: '<path d="M3.5 11L12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/>',
    room: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0012 0M12 17v4"/>',
    decay: '<path d="M3.5 4v16h17"/><path d="M6.5 6.5c2.5 0 3.5 10.5 13 11"/>',
    bars: '<rect x="5" y="11" width="3.5" height="9" rx=".6"/><rect x="10.25" y="5" width="3.5" height="15" rx=".6"/><rect x="15.5" y="13" width="3.5" height="7" rx=".6"/>',
    scale: '<path d="M12 4v16M7.5 20h9M5 7.5h14"/><path d="M5 7.5l-2.5 6h5zM19 7.5l-2.5 6h5z"/>',
    panels: '<rect x="3.5" y="4.5" width="7.5" height="6.5" rx="1"/><rect x="13" y="4.5" width="7.5" height="6.5" rx="1"/><rect x="3.5" y="13" width="7.5" height="6.5" rx="1"/><rect x="13" y="13" width="7.5" height="6.5" rx="1"/>',
    trend: '<path d="M3.5 6.5l6 6 4-4 7 7"/><path d="M15 15.5h5.5V10"/>',
    flag: '<path d="M5.5 21V4M5.5 4.5h11l-2 4 2 4h-11"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    lock: '<rect x="5" y="11" width="14" height="9.5" rx="2"/><path d="M8.5 11V8a3.5 3.5 0 017 0v3"/>',
    chevL: '<path d="M15 18l-6-6 6-6"/>',
    chevR: '<path d="M9 18l6-6-6-6"/>',
    arrowR: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    arrowD: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.4"/>',
    sparkles: '<path d="M11 3.5l1.7 4.8 4.8 1.7-4.8 1.7L11 16.5l-1.7-4.8L4.5 10l4.8-1.7z"/><path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
    play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
    stop: '<rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor"/>',
    refresh: '<path d="M19.5 12a7.5 7.5 0 11-2.2-5.3"/><path d="M19.5 4.5v4.5H15"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.2v.3"/>',
    seal: '<circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.7 2.7L16 9.5"/>',
    flask: '<path d="M9.5 3.5h5M10.5 3.5v5.5L5 18.5a1.5 1.5 0 001.3 2.2h11.4a1.5 1.5 0 001.3-2.2L13.5 9V3.5"/><path d="M7.5 15h9"/>',
    pin: '<path d="M12 21s-6.5-5.8-6.5-10.5a6.5 6.5 0 0113 0C18.5 15.2 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.3"/>',
    speaker: '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M15.5 9.5a3.5 3.5 0 010 5M18 7a7 7 0 010 10"/>',
    laptop: '<rect x="5" y="5" width="14" height="10" rx="1.5"/><path d="M2.5 18.5h19"/>',
    wall: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 16.5h18"/><rect x="6" y="7" width="4.5" height="6.5" rx=".6"/><rect x="13.5" y="7" width="4.5" height="6.5" rx=".6"/>',
    phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    folder: '<path d="M3.5 7a2 2 0 012-2h4l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2h-13a2 2 0 01-2-2z"/>',
    wave: '<path d="M3 12h1.5M7 8.5v7M11 5v14M15 8v8M19 10.5v3"/>',
    users: '<circle cx="9" cy="8.5" r="3"/><circle cx="17" cy="9.5" r="2.3"/><path d="M3.5 19a5.5 5.5 0 0111 0M15.5 14.6A4.5 4.5 0 0121 19"/>',
    shield: '<path d="M12 3.5l7.5 3V12c0 4.3-3.2 7.6-7.5 8.5-4.3-.9-7.5-4.2-7.5-8.5V6.5z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
    gauge: '<path d="M4.5 16a7.5 7.5 0 1115 0"/><path d="M12 16l3.5-4.5"/>',
    list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><path d="M4.5 6.5h.5M4.5 12h.5M4.5 17.5h.5"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    pushpin: '<path class="pin-head" d="M9 3.5h6l-.9 5.6 3.4 3.4v1.8h-11v-1.8l3.4-3.4L9 3.5z"/><path d="M12 14.3V21"/>',
    history: '<path d="M4.5 12a7.5 7.5 0 102.2-5.3"/><path d="M4.5 4.5v3.5H8"/><path d="M12 8v4.2l2.8 1.8"/>',
    doc: '<path d="M7 3.5h7l4.5 4.5v12a.5.5 0 01-.5.5H7a.5.5 0 01-.5-.5V4a.5.5 0 01.5-.5z"/><path d="M14 3.5V8h4.5M9.5 12.5h5M9.5 16h5"/>',
    trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12.5a1 1 0 001 .9h7.4a1 1 0 001-.9L17.5 7"/><path d="M10 11v5.5M14 11v5.5"/>',
    printer: '<path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="8" rx="1.5"/><path d="M7 14h10v6.5H7z"/>',
    rec: '<circle cx="12" cy="12" r="5.5" fill="currentColor" stroke="none"/>',
    arrowUp: '<path d="M12 19V5M6.5 10.5L12 5l5.5 5.5"/>',
    arrowDn: '<path d="M12 5v14M6.5 13.5L12 19l5.5-5.5"/>',
  };
  function icon(name, size = 18, sw = 1.8, attrs = '') {
    return `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${attrs}>${ICONS[name] || ''}</svg>`;
  }

  AM.util = { esc, isNum, num, int, clamp, round, trimNum, fmt, getPath, setPath, icon };
})(window.AM);
