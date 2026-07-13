/**
 * Biometric HUD design tokens — the single source of truth (§2.2 of the brief).
 * Dark-only. Acid = the app talking. Turquoise = the body. Red = danger only.
 */
export const color = {
  // canvas
  void: '#06070B',
  base: '#0A0C12',
  surface1: '#10141C',
  surfaceGlass: 'rgba(20,26,36,0.55)',
  surfaceGlassHeavy: 'rgba(14,18,26,0.88)',
  hairline: 'rgba(200,240,60,0.10)',
  hairlineDim: 'rgba(255,255,255,0.06)',
  gridLine: 'rgba(140,160,190,0.08)',

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
} as const;

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
