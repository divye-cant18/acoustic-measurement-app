/* Minimal PDF writer for the project report: A4 pages, text, lines, rectangles and one JPEG image. PDF 1.4.
   No external library, so the report can be made with the app opened from a file and no network.

   Text is real, selectable text in the standard PDF fonts: Helvetica and Helvetica-Bold (WinAnsiEncoding). The few
   characters the report needs that WinAnsi lacks (α Δ − ≥ ≤ ≈ ξ →) come from the standard Symbol font, which carries a
   ToUnicode map so they copy and search as themselves. Text widths use the fonts' published metrics (Adobe AFM), so
   wrapping and alignment are computed, not guessed. A character none of the fonts has is drawn as "?" and listed in
   doc.unsupported, so a test can see it.

   Coordinates in this API are in points from the TOP-left corner of the page (y grows downwards). */
(function (AM) {
  'use strict';

  const PAGE = { w: 595.28, h: 841.89 }; // A4

  /* ---------- font metrics (1/1000 em) ---------- */
  // Codes 32–126.
  const HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015,
    667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
    278, 278, 278, 469, 556, 333,
    556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500,
    334, 260, 334, 584];
  const HELV_B = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975,
    722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
    333, 278, 333, 584, 556, 333,
    556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500,
    389, 280, 389, 584];
  // WinAnsi characters outside ASCII without a decomposition to an ASCII letter: [code, regular width, bold width].
  const EXTRA = {
    '€': [0x80, 556, 556], '‚': [0x82, 222, 278], 'ƒ': [0x83, 556, 556], '„': [0x84, 333, 500], '…': [0x85, 1000, 1000],
    '†': [0x86, 556, 556], '‡': [0x87, 556, 556], 'ˆ': [0x88, 333, 333], '‰': [0x89, 1000, 1000], '‹': [0x8B, 333, 333],
    'Œ': [0x8C, 1000, 1000], '‘': [0x91, 222, 278], '’': [0x92, 222, 278], '“': [0x93, 333, 500], '”': [0x94, 333, 500],
    '•': [0x95, 350, 350], '–': [0x96, 556, 556], '—': [0x97, 1000, 1000], '˜': [0x98, 333, 333], '™': [0x99, 1000, 1000],
    '›': [0x9B, 333, 333], 'œ': [0x9C, 944, 944], 'Š': [0x8A, 667, 667], 'š': [0x9A, 500, 556], 'Ž': [0x8E, 611, 611],
    'ž': [0x9E, 500, 500], 'Ÿ': [0x9F, 667, 667],
    '¡': [0xA1, 333, 333], '¢': [0xA2, 556, 556], '£': [0xA3, 556, 556], '¤': [0xA4, 556, 556], '¥': [0xA5, 556, 556],
    '¦': [0xA6, 260, 280], '§': [0xA7, 556, 556], '¨': [0xA8, 333, 333], '©': [0xA9, 737, 737], 'ª': [0xAA, 370, 370],
    '«': [0xAB, 556, 556], '¬': [0xAC, 584, 584], '®': [0xAE, 737, 737], '¯': [0xAF, 333, 333], '°': [0xB0, 400, 400],
    '±': [0xB1, 584, 584], '²': [0xB2, 333, 333], '³': [0xB3, 333, 333], '´': [0xB4, 333, 333], 'µ': [0xB5, 556, 611],
    '¶': [0xB6, 537, 556], '·': [0xB7, 278, 278], '¸': [0xB8, 333, 333], '¹': [0xB9, 333, 333], 'º': [0xBA, 365, 365],
    '»': [0xBB, 556, 556], '¼': [0xBC, 834, 834], '½': [0xBD, 834, 834], '¾': [0xBE, 834, 834], '¿': [0xBF, 611, 611],
    'Æ': [0xC6, 1000, 1000], 'Ð': [0xD0, 722, 722], '×': [0xD7, 584, 584], 'Ø': [0xD8, 778, 778], 'Þ': [0xDE, 667, 667],
    'ß': [0xDF, 611, 611], 'æ': [0xE6, 889, 889], 'ð': [0xF0, 556, 611], '÷': [0xF7, 584, 584], 'ø': [0xF8, 611, 611],
    'þ': [0xFE, 556, 611],
  };
  // From the Symbol font: [code, width, Unicode].
  const SYMBOL = { 'α': [0x61, 631], 'Δ': [0x44, 612], '−': [0x2D, 549], '≥': [0xB3, 549], '≤': [0xA3, 549], '≈': [0xBB, 549], 'ξ': [0x78, 493], '→': [0xAE, 987] };

  // Spaces and hyphens that only differ in breaking behaviour, and quotes some locales use, are drawn as the plain ones.
  const normalize = s => String(s == null ? '' : s)
    .replace(/[  -   　]/g, ' ').replace(/[​-‍⁠﻿]/g, '')
    .replace(/[‐‑]/g, '-').replace(/′/g, '\'').replace(/″/g, '"');

  /* One character → { font: 'R'|'B'|'S', code, w } for the given text font ('R' or 'B'). */
  function glyph(ch, bold) {
    const c = ch.charCodeAt(0);
    if (c >= 32 && c <= 126) return { font: bold ? 'B' : 'R', code: c, w: (bold ? HELV_B : HELV)[c - 32] };
    const x = EXTRA[ch];
    if (x) return { font: bold ? 'B' : 'R', code: x[0], w: bold ? x[2] : x[1] };
    if (c >= 0xC0 && c <= 0xFF) { // accented Latin-1 letters: the width of the base letter
      const base = ch.normalize('NFD')[0], b = base.charCodeAt(0);
      if (b >= 32 && b <= 126) return { font: bold ? 'B' : 'R', code: c, w: (bold ? HELV_B : HELV)[b - 32] };
    }
    const sx = SYMBOL[ch];
    if (sx) return { font: 'S', code: sx[0], w: sx[1] };
    return null;
  }

  /* ---------- document ---------- */
  class Doc {
    constructor(info = {}) {
      this.info = info;
      this.pages = [];
      this.images = {};
      this.unsupported = new Set();
    }
    get width() { return PAGE.w; }
    get height() { return PAGE.h; }
    addPage() { const p = { ops: [] }; this.pages.push(p); this.page = p; return this.pages.length - 1; }
    usePage(i) { this.page = this.pages[i]; }
    op(s) { this.page.ops.push(s); }

    /* Runs of one font for a string: [{ font, codes: [], w }]. */
    runs(str, bold) {
      const out = [];
      for (const ch of normalize(str)) {
        let g = glyph(ch, bold);
        if (!g) { this.unsupported.add(ch); g = glyph('?', bold); }
        const last = out[out.length - 1];
        if (last && last.font === g.font) { last.codes.push(g.code); last.w += g.w; } else out.push({ font: g.font, codes: [g.code], w: g.w });
      }
      return out;
    }
    textWidth(str, size, bold) { return this.runs(str, bold).reduce((s, r) => s + r.w, 0) * size / 1000; }

    /* Lines of at most maxW points, broken at spaces (a word longer than the line is broken where it must be). */
    wrap(str, size, maxW, bold) {
      const lines = [];
      String(str == null ? '' : str).split('\n').forEach(par => {
        const words = normalize(par).split(' ');
        let line = '';
        words.forEach(w => {
          const tryLine = line ? `${line} ${w}` : w;
          if (this.textWidth(tryLine, size, bold) <= maxW || !line) {
            if (!line && this.textWidth(w, size, bold) > maxW) line = this.split(w, size, maxW, bold, lines);
            else line = tryLine;
          } else if (this.textWidth(w, size, bold) > maxW) { lines.push(line); line = this.split(w, size, maxW, bold, lines); }
          else { lines.push(line); line = w; }
        });
        lines.push(line);
      });
      return lines;
    }

    /* A word wider than the line (a certificate number, a long reference): full lines go to `lines`, preferably broken
       after "/", "-" or "_"; returns the remainder. */
    split(word, size, maxW, bold, lines) {
      let rest = word;
      while (rest.length > 1 && this.textWidth(rest, size, bold) > maxW) {
        let cut = 1;
        while (cut < rest.length && this.textWidth(rest.slice(0, cut + 1), size, bold) <= maxW) cut++;
        const soft = Math.max(rest.lastIndexOf('/', cut - 1), rest.lastIndexOf('-', cut - 1), rest.lastIndexOf('_', cut - 1));
        if (soft > 0 && soft + 1 >= cut * 0.5) cut = soft + 1;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      return rest;
    }

    /* Text with its baseline at y (from the top). opts: size, bold, color [r,g,b] 0–1, align 'left'|'right'|'center'. */
    text(x, y, str, opts = {}) {
      const size = opts.size || 9, bold = !!opts.bold, runs = this.runs(str, bold);
      const w = runs.reduce((s, r) => s + r.w, 0) * size / 1000;
      const x0 = opts.align === 'right' ? x - w : opts.align === 'center' ? x - w / 2 : x;
      const c = opts.color || [0.08, 0.1, 0.11];
      let s = `BT ${c.map(n).join(' ')} rg ${n(x0)} ${n(PAGE.h - y)} Td`;
      runs.forEach(r => { s += ` /${r.font === 'S' ? 'F3' : r.font === 'B' ? 'F2' : 'F1'} ${n(size)} Tf <${r.codes.map(hex2).join('')}> Tj`; });
      this.op(s + ' ET');
      return w;
    }
    /* Wrapped text block; returns the height used. */
    para(x, y, str, maxW, opts = {}) {
      const size = opts.size || 9, lead = opts.lead || size * 1.32;
      const lines = this.wrap(str, size, maxW, opts.bold);
      lines.forEach((l, i) => this.text(x, y + size + i * lead, l, opts));
      return lines.length * lead;
    }
    rect(x, y, w, h, { fill, stroke, lw = 0.6, dash } = {}) {
      let s = 'q ';
      if (fill) s += `${fill.map(n).join(' ')} rg `;
      if (stroke) s += `${stroke.map(n).join(' ')} RG ${n(lw)} w `;
      if (dash) s += `[${dash.join(' ')}] 0 d `;
      s += `${n(x)} ${n(PAGE.h - y - h)} ${n(w)} ${n(h)} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'} Q`;
      this.op(s);
    }
    line(x1, y1, x2, y2, { color = [0.79, 0.82, 0.81], lw = 0.6, dash } = {}) {
      this.op(`q ${color.map(n).join(' ')} RG ${n(lw)} w ${dash ? `[${dash.join(' ')}] 0 d ` : ''}${n(x1)} ${n(PAGE.h - y1)} m ${n(x2)} ${n(PAGE.h - y2)} l S Q`);
    }
    /* A circle centred at (cx, cy) from the top, drawn as four Bézier arcs. */
    circle(cx, cy, r, { fill, stroke, lw = 0.6 } = {}) {
      const k = 0.5523 * r, X = cx, Y = PAGE.h - cy;
      let s = 'q ';
      if (fill) s += `${fill.map(n).join(' ')} rg `;
      if (stroke) s += `${stroke.map(n).join(' ')} RG ${n(lw)} w `;
      s += `${n(X + r)} ${n(Y)} m ${n(X + r)} ${n(Y + k)} ${n(X + k)} ${n(Y + r)} ${n(X)} ${n(Y + r)} c `;
      s += `${n(X - k)} ${n(Y + r)} ${n(X - r)} ${n(Y + k)} ${n(X - r)} ${n(Y)} c `;
      s += `${n(X - r)} ${n(Y - k)} ${n(X - k)} ${n(Y - r)} ${n(X)} ${n(Y - r)} c `;
      s += `${n(X + k)} ${n(Y - r)} ${n(X + r)} ${n(Y - k)} ${n(X + r)} ${n(Y)} c ${fill && stroke ? 'B' : fill ? 'f' : 'S'} Q`;
      this.op(s);
    }
    /* A JPEG image: { bytes: Uint8Array, width, height } in pixels. */
    addImage(name, img) { this.images[name] = img; }
    image(name, x, y, w, h) { if (this.images[name]) this.op(`q ${n(w)} 0 0 ${n(h)} ${n(x)} ${n(PAGE.h - y - h)} cm /${name} Do Q`); }

    /* The finished file. */
    bytes() {
      const chunks = [], offsets = [];
      let length = 0;
      const push = part => { const b = typeof part === 'string' ? latin1(part) : part; chunks.push(b); length += b.length; };
      const obj = (id, body) => { offsets[id] = length; push(`${id} 0 obj\n`); body.forEach(push); push('\nendobj\n'); };
      const stream = (dict, data) => [`<< ${dict} /Length ${data.length} >>\nstream\n`, data, '\nendstream'];

      push('%PDF-1.4\n');
      push(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A])); // binary marker
      const names = Object.keys(this.images);
      const FIXED = 6, firstImage = FIXED + 1, firstPage = firstImage + names.length, infoId = firstPage + this.pages.length * 2;
      const pageIds = this.pages.map((_, i) => firstPage + i * 2);

      obj(1, [`<< /Type /Catalog /Pages 2 0 R /Lang ${pdfString(this.info.lang || 'en')} /ViewerPreferences << /DisplayDocTitle true >> >>`]);
      obj(2, [`<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`]);
      obj(3, ['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>']);
      obj(4, ['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>']);
      obj(5, ['<< /Type /Font /Subtype /Type1 /BaseFont /Symbol /ToUnicode 6 0 R >>']);
      const cmap = ['/CIDInit /ProcSet findresource begin', '12 dict begin', 'begincmap',
        '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def', '/CMapName /Adobe-Identity-UCS def', '/CMapType 2 def',
        '1 begincodespacerange', '<00> <FF>', 'endcodespacerange',
        `${Object.keys(SYMBOL).length} beginbfchar`, ...Object.entries(SYMBOL).map(([ch, [code]]) => `<${hex2(code)}> <${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}>`), 'endbfchar',
        'endcmap', 'CMapName currentdict /CMapResource defineresource pop', 'end', 'end'].join('\n');
      obj(6, stream('', latin1(cmap)));
      names.forEach((name, i) => {
        const im = this.images[name];
        obj(firstImage + i, stream(`/Type /XObject /Subtype /Image /Width ${im.width} /Height ${im.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, im.bytes));
      });
      const xobjects = names.length ? ` /XObject << ${names.map((nm, i) => `/${nm} ${firstImage + i} 0 R`).join(' ')} >>` : '';
      this.pages.forEach((p, i) => {
        const id = pageIds[i];
        obj(id, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.w} ${PAGE.h}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >>${xobjects} >> /Contents ${id + 1} 0 R >>`]);
        obj(id + 1, stream('', latin1(p.ops.join('\n'))));
      });
      const I = this.info;
      obj(infoId, [`<< ${[['Title', I.title], ['Author', I.author], ['Subject', I.subject], ['Creator', I.creator], ['Producer', I.producer]].filter(([, v]) => v).map(([k, v]) => `/${k} ${pdfString(v)}`).join(' ')} /CreationDate (${pdfDate(I.created || new Date())}) >>`]);

      const xref = length, size = infoId + 1;
      let table = `xref\n0 ${size}\n0000000000 65535 f \n`;
      for (let id = 1; id < size; id++) table += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
      const fileId = hexId(`${I.title}|${pdfDate(I.created || new Date())}|${length}`);
      push(`${table}trailer\n<< /Size ${size} /Root 1 0 R /Info ${infoId} 0 R /ID [<${fileId}> <${fileId}>] >>\nstartxref\n${xref}\n%%EOF\n`);

      const out = new Uint8Array(length);
      let at = 0;
      chunks.forEach(c => { out.set(c, at); at += c.length; });
      return out;
    }
  }

  /* ---------- helpers ---------- */
  const n = v => { const r = Math.round(v * 100) / 100; return Object.is(r, -0) ? '0' : String(r); };
  const hex2 = c => c.toString(16).toUpperCase().padStart(2, '0');
  const latin1 = s => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xFF; return b; };
  // Text strings in the document information: UTF-16BE with a byte-order mark, so any room name is kept exactly.
  const pdfString = s => `<FEFF${Array.from(String(s)).map(ch => { const c = ch.codePointAt(0); if (c < 0x10000) return c.toString(16).padStart(4, '0'); const v = c - 0x10000; return ((0xD800 + (v >> 10)).toString(16) + (0xDC00 + (v & 0x3FF)).toString(16)); }).join('').toUpperCase()}>`;
  function pdfDate(d) {
    const p = x => String(x).padStart(2, '0'), off = -d.getTimezoneOffset(), sign = off >= 0 ? '+' : '-', a = Math.abs(off);
    return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${sign}${p(Math.floor(a / 60))}'${p(a % 60)}'`;
  }
  // A 16-byte file identifier from the content description (FNV-1a, four rounds); identifies, does not protect.
  function hexId(s) {
    let out = '';
    for (let k = 0; k < 4; k++) {
      let h = 0x811C9DC5 ^ k;
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
      out += h.toString(16).padStart(8, '0');
    }
    return out.toUpperCase();
  }

  AM.pdf = { Doc, PAGE, normalize };
})(window.AM);
