/**
 * Biometric HUD design tokens — the single source of truth (§2.2 of the brief).
 * Acid = the app talking. Turquoise = the body. Red = danger only.
 *
 * Two grounds, one instrument. Light is not an inversion: an inverted HUD
 * reads as a form, and acid-on-white is both illegible and the exact "council
 * website" look this app is trying not to have. So the ground becomes warm
 * paper rather than white, and the accents darken into inks that carry the
 * same meanings at readable contrast — acid stays the app's voice, it just
 * speaks in olive on paper instead of lime on black.
 *
 * `color` is mutated in place rather than swapped, so all ~385 existing
 * `color.x` reads keep working untouched. Nothing here notifies React;
 * `applyTheme` runs synchronously before the re-render that `useThemeMode`
 * triggers, so a render always sees a consistent palette.
 */
export type ThemeMode = 'dark' | 'light';

const DARK = {
  // canvas
  void: '#06070B',
  base: '#0A0C12',
  surface1: '#10141C',
  surfaceGlass: 'rgba(20,26,36,0.55)',
  surfaceGlassHeavy: 'rgba(14,18,26,0.88)',
  hairline: 'rgba(200,240,60,0.10)',
  hairlineDim: 'rgba(255,255,255,0.06)',
  gridLine: 'rgba(140,160,190,0.08)',

  // structural greys — borders, panel fills and overlays that were literals
  // scattered through the components before there was a second ground
  line: 'rgba(255,255,255,0.08)',
  lineSoft: 'rgba(255,255,255,0.05)',
  lineStrong: 'rgba(255,255,255,0.14)',
  panel: 'rgba(16,20,28,0.6)',
  panelSolid: 'rgba(16,20,28,0.7)',
  scrim: 'rgba(8,10,15,0.94)',
  dim: 'rgba(6,7,11,0.52)',
  meshWash: 'rgba(33,240,220,0.04)',

  // HUD frame + corner bracket strokes, per accent
  frameAcid: 'rgba(200,240,60,0.55)',
  frameMesh: 'rgba(33,240,220,0.5)',
  frameDim: 'rgba(153,162,174,0.3)',
  frameError: 'rgba(255,59,92,0.6)',
  frameBlue: 'rgba(46,107,255,0.55)',

  // the backdrop's ambient wash — barely-there colour in the corners
  auraBlue: 'rgba(46,107,255,0.055)',
  auraAcid: 'rgba(200,240,60,0.035)',

  // brand + accents
  acid: '#C8F03C',
  acidPress: '#A9CE2A',
  acidGlow: 'rgba(200,240,60,0.35)',
  mesh: '#21F0DC',
  meshGlow: 'rgba(33,240,220,0.35)',
  blue: '#2E6BFF',

  // technique severity gradient
  ok: '#16E39A',
  warn: '#FFC24B',
  error: '#FF3B5C',
  errorGlow: 'rgba(255,59,92,0.35)',

  // text
  textHi: '#EAF0EC',
  textMid: '#99A2AE',
  textLo: '#5A6472',

  // on-accent ink
  inkOnAcid: '#0B0F03',
  inkOnError: '#12030A',
};

type Palette = typeof DARK;

const LIGHT: Palette = {
  // warm paper, never white — white plus green is the municipal-portal look
  void: '#EDEEE7',
  base: '#F4F5F0',
  surface1: '#FFFFFF',
  surfaceGlass: 'rgba(255,255,255,0.72)',
  surfaceGlassHeavy: 'rgba(252,252,249,0.95)',
  hairline: 'rgba(92,122,12,0.28)',
  hairlineDim: 'rgba(20,26,18,0.12)',
  gridLine: 'rgba(40,60,90,0.07)',

  line: 'rgba(20,26,18,0.14)',
  lineSoft: 'rgba(20,26,18,0.09)',
  lineStrong: 'rgba(20,26,18,0.22)',
  panel: 'rgba(255,255,255,0.78)',
  panelSolid: 'rgba(255,255,255,0.92)',
  scrim: 'rgba(237,238,231,0.95)',
  dim: 'rgba(237,238,231,0.62)',
  meshWash: 'rgba(11,127,116,0.06)',

  // heavier on paper: a 55%-alpha stroke that reads as a glowing edge on
  // black turns into a faint smudge on white
  frameAcid: 'rgba(79,107,10,0.55)',
  frameMesh: 'rgba(11,124,114,0.5)',
  frameDim: 'rgba(89,99,107,0.35)',
  frameError: 'rgba(192,27,58,0.55)',
  frameBlue: 'rgba(29,78,216,0.5)',

  // on paper a blue haze reads as a printing fault; warm the corners instead
  auraBlue: 'rgba(29,78,216,0.035)',
  auraAcid: 'rgba(79,107,10,0.045)',

  // the same voices, pitched to be read as ink rather than as light
  acid: '#4F6B0A',
  acidPress: '#3D5307',
  acidGlow: 'rgba(79,107,10,0.22)',
  mesh: '#0B7C72',
  meshGlow: 'rgba(11,124,114,0.24)',
  blue: '#1D4ED8',

  ok: '#0C7F55',
  warn: '#8A5A00',
  error: '#C01B3A',
  errorGlow: 'rgba(192,27,58,0.22)',

  textHi: '#12170F',
  textMid: '#59636B',
  textLo: '#7B848D',

  // filled accents carry white ink on this ground, not near-black
  inkOnAcid: '#FFFFFF',
  inkOnError: '#FFFFFF',
};

/**
 * The live palette. Mutable on purpose — see the note above.
 */
export const color: Palette = { ...DARK };

/** Repaint every token in place. Safe to call before React has mounted. */
export function applyTheme(mode: ThemeMode): void {
  Object.assign(color, mode === 'light' ? LIGHT : DARK);
}

/** 4pt base. Screen gutters 20. */
export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  gutter: 20,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

/** Two radius languages: soft glass (calm) vs sharp HUD (live/technical). */
export const radius = {
  glass: 20,
  glassSm: 14,
  hud: 6,
  hudSm: 4,
  pill: 999,
} as const;

export const fontSize = {
  display: 40,
  h1: 28,
  h2: 22,
  h3: 18,
  body: 15,
  label: 13,
  micro: 11,
  nano: 9.5,
} as const;

export const track = {
  micro: 1.2, // ~+0.08em at micro sizes; RN letterSpacing is px
  label: 0.8,
  display: -0.5,
} as const;

export type SeverityColor = typeof color.ok | typeof color.warn | typeof color.error;

/** Continuous severity (0 ok … 1 error) → color. Lerps ok→warn→error. */
export function severityColor(s: number): string {
  const clamp = Math.max(0, Math.min(1, s));
  const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
  const hex = (c: string) => [
    parseInt(c.slice(1, 3), 16),
    parseInt(c.slice(3, 5), 16),
    parseInt(c.slice(5, 7), 16),
  ];
  const [c1, c2, t] =
    clamp < 0.5
      ? [hex(color.ok), hex(color.warn), clamp * 2]
      : [hex(color.warn), hex(color.error), (clamp - 0.5) * 2];
  const r = lerp(c1[0]!, c2[0]!, t);
  const g = lerp(c1[1]!, c2[1]!, t);
  const b = lerp(c1[2]!, c2[2]!, t);
  return `rgb(${r},${g},${b})`;
}

/** Mesh tint: healthy turquoise sliding toward warn/error as severity rises. */
export function meshSeverityColor(s: number): string {
  if (s <= 0.02) return color.mesh;
  return severityColor(s);
}
