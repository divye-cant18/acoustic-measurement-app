/* How each everyday surface type (js/data/room-form.js SURFACE_TYPES) is drawn: its own colour within its kind of
   surface, a small pattern for the flat drawings (so a colour is never the only way to tell two apart), and the
   texture the 3D room paints for it. The colours say which part is which; they are not a rating of the material. */
export interface Look { color: string; tex: string; look: string }

const L = (color: string, tex: string, look: string): Look => ({ color, tex, look });
export const LOOKS: Record<string, Record<string, Look>> = {
  wall: {
    'painted-plaster': L('#D8C7AE', 'speck', 'plaster'), 'gypsum-partition': L('#9DB2CF', 'seams', 'drywall'), glass: L('#7CC3D2', 'glint', 'glass'),
    'wood-panelling': L('#D5A25A', 'grain', 'wood'), fabric: L('#B07AA1', 'weave', 'fabric'), 'acoustic-panels': L('#EE4935', 'grooves', 'panels'),
    'felt-panels': L('#8E6FB5', 'weave', 'felt'), 'bass-absorber': L('#6E4A7E', 'weave', 'felt'), 'wood-slats': L('#8E5A3C', 'ribs', 'slots'),
    wallpaper: L('#E2B9A4', 'dots', 'plaster'), 'tiles-stone': L('#B7C9C2', 'tilegrid', 'tiles'), 'bare-brick': L('#B9654A', 'brick', 'brick'),
    'bare-concrete': L('#A3A19C', 'dots', 'concrete'), 'block-painted': L('#CFCBC2', 'brick', 'block'), 'block-bare': L('#8F8A82', 'brick', 'block'),
    cork: L('#C9A27E', 'dots', 'concrete'), curtains: L('#C58FB0', 'hatch', 'fabric'), mirror: L('#C4D3DA', 'glint', 'mirror'),
    'metal-sheet': L('#7D8A99', 'ribs', 'metal'), other: L('#BDB5B3', 'hatch', 'plaster'),
  },
  floor: {
    'vitrified-tiles': L('#D6CDBD', 'tilegrid', 'tiles'), stone: L('#B8B2AA', 'dots', 'concrete'), carpet: L('#7F9E6E', 'pile', 'carpet'),
    'carpet-tiles': L('#6E8C8A', 'tilegrid', 'carpet'), vinyl: L('#B39B8B', 'none', 'vinyl'), laminate: L('#C9965A', 'grain', 'wood'),
    'wood-floor': L('#A8743E', 'grain', 'wood'), 'concrete-floor': L('#A3A19C', 'speck', 'concrete'), 'sports-vinyl': L('#D08C5B', 'none', 'vinyl'),
    rubber: L('#5F6B6E', 'dots', 'vinyl'), 'raised-floor': L('#C2C6C9', 'tilegrid', 'tiles'), 'raised-floor-carpet': L('#7C7F9E', 'tilegrid', 'carpet'),
    other: L('#BDB5B3', 'hatch', 'vinyl'),
  },
  ceiling: {
    'gypsum-ceiling': L('#E6DDD1', 'speck', 'plaster'), 'grid-tiles': L('#C3D19A', 'grid', 'ctiles'), 'hygiene-tiles': L('#A8C8D8', 'grid', 'ctiles'),
    'metal-tiles': L('#7D8A99', 'perf', 'metal'), 'perforated-gypsum': L('#CBB9E0', 'perf', 'perf'), 'plastered-slab': L('#EDE6DA', 'none', 'plaster'),
    'bare-slab': L('#A3A19C', 'dots', 'concrete'), 'wood-ceiling': L('#D9B07A', 'grain', 'wood'), 'metal-roof': L('#8C969E', 'ribs', 'metal'),
    'acoustic-ceiling': L('#EE4935', 'grooves', 'panels'), other: L('#BDB5B3', 'hatch', 'plaster'),
  },
};
export const lookOf = (kind: string, type: string | null | undefined): Look | null => (type && (LOOKS[kind] || {})[type]) || null;

// The flat drawings' patterns, 12 px square, drawn over the type's colour.
const TEX: Record<string, string> = {
  speck: '<circle cx="3" cy="4" r=".9" fill="rgba(0,0,0,.10)"/><circle cx="9" cy="10" r=".8" fill="rgba(0,0,0,.08)"/>',
  seams: '<line x1="11.5" y1="0" x2="11.5" y2="12" stroke="rgba(255,255,255,.7)" stroke-width="1.2"/>',
  glint: '<path d="M-2 14L14 -2" stroke="rgba(255,255,255,.75)" stroke-width="2.4"/><path d="M6 14L14 6" stroke="rgba(255,255,255,.55)" stroke-width="1"/>',
  brick: '<path d="M0 .5H12 M0 6.5H12 M6 0V6 M0 6V12 M12 6V12" stroke="rgba(255,255,255,.6)" stroke-width="1.1"/>',
  dots: '<circle cx="3" cy="3" r="1.1" fill="rgba(0,0,0,.14)"/><circle cx="9" cy="8.5" r=".9" fill="rgba(0,0,0,.12)"/>',
  grain: '<path d="M0 3Q3 2 6 3.2T12 2.8 M0 8.5Q4 7.6 7 8.7T12 8.2" stroke="rgba(0,0,0,.13)" stroke-width="1" fill="none"/>',
  hatch: '<path d="M0 0L12 12 M12 0L0 12" stroke="rgba(255,255,255,.5)" stroke-width=".9"/>',
  grooves: '<rect x="8" width="2.5" height="12" fill="rgba(0,0,0,.16)"/>',
  grid: '<path d="M0 .5H12 M.5 0V12" stroke="rgba(0,0,0,.12)"/><circle cx="6" cy="6" r=".8" fill="rgba(0,0,0,.12)"/>',
  ribs: '<rect x="2" width="3" height="12" fill="rgba(0,0,0,.28)"/>',
  pile: '<circle cx="2" cy="2" r=".8" fill="rgba(0,0,0,.14)"/><circle cx="6" cy="5" r=".8" fill="rgba(0,0,0,.12)"/><circle cx="10" cy="9" r=".8" fill="rgba(0,0,0,.14)"/>',
  tilegrid: '<path d="M0 .5H12 M.5 0V12" stroke="rgba(0,0,0,.14)" stroke-width="1.1"/>',
  weave: '<path d="M0 3H12 M0 9H12 M3 0V12 M9 0V12" stroke="rgba(255,255,255,.22)" stroke-width=".8"/>',
  perf: '<circle cx="3" cy="3" r="1.1" fill="rgba(0,0,0,.30)"/><circle cx="9" cy="9" r="1.1" fill="rgba(0,0,0,.30)"/>',
  none: '',
};
// The patterns for every type, once on the page; fillOf(kind, type) refers to them. A part not chosen yet is hatched.
export const lookDefs = (): string => Object.entries(LOOKS).flatMap(([kind, ts]) => Object.entries(ts).map(([id, l]) =>
  `<pattern id="look-${kind}-${id}" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="${l.color}"/>${TEX[l.tex] || ''}</pattern>`)).join('')
  + '<pattern id="look-unset" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#F6F3F2"/><path d="M0 8L8 0" stroke="#DCD5D3"/></pattern>';
export const fillOf = (kind: string, type: string | null | undefined): string => `url(#look-${lookOf(kind, type) ? `${kind}-${type}` : 'unset'})`;
