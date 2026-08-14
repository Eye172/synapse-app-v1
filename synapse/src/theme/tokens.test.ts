import { applyTheme, color } from './tokens';

/**
 * The palette is mutated in place, which is what lets every `color.x` read in
 * the app stay untouched — and also what makes a missing token silent. A key
 * present in one ground and absent from the other does not throw; it paints
 * near-white text onto paper and is only discovered by someone holding the
 * phone.
 */

/** Relative luminance per WCAG 2.1, for #rrggbb only. */
function luminance(hex: string): number {
  const ch = (i: number) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(0) + 0.7152 * ch(1) + 0.0722 * ch(2);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

function snapshot(): Record<string, string> {
  return { ...color };
}

describe('the two grounds', () => {
  afterEach(() => applyTheme('dark'));

  it('paints every token in both grounds', () => {
    applyTheme('dark');
    const dark = snapshot();
    applyTheme('light');
    const light = snapshot();

    expect(Object.keys(light).sort()).toEqual(Object.keys(dark).sort());
    // and no token may be left behind at its dark value on paper — that is
    // exactly how invisible text ships
    const unchanged = Object.keys(dark).filter((k) => dark[k] === light[k]);
    expect(unchanged).toEqual([]);
  });

  it('goes back to dark, so the toggle is not one-way', () => {
    applyTheme('dark');
    const dark = snapshot();
    applyTheme('light');
    applyTheme('dark');
    expect(snapshot()).toEqual(dark);
  });

  it.each(['dark', 'light'] as const)('keeps body text readable on %s', (mode) => {
    applyTheme(mode);
    // 4.5:1 is the WCAG AA floor for body text
    expect(contrast(color.textHi, color.void)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color.textMid, color.void)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['dark', 'light'] as const)('keeps the small print legible on %s', (mode) => {
    applyTheme(mode);
    // textLo carries captions at 9.5pt; 3:1 is the large/incidental floor and
    // the reason section labels were lifted off it in the first place
    expect(contrast(color.textLo, color.void)).toBeGreaterThanOrEqual(3);
  });

  it.each(['dark', 'light'] as const)('keeps ink on a filled accent readable on %s', (mode) => {
    applyTheme(mode);
    // the primary button is acid with inkOnAcid on top — the one place where
    // a palette change can quietly destroy the main call to action
    expect(contrast(color.inkOnAcid, color.acid)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color.inkOnError, color.error)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['dark', 'light'] as const)('keeps the accents distinguishable from the ground on %s', (mode) => {
    applyTheme(mode);
    for (const token of ['acid', 'mesh', 'ok', 'warn', 'error'] as const) {
      // these carry meaning — a severity colour that vanishes into the page
      // is a grade the lifter never sees
      expect({ token, ratio: contrast(color[token], color.void) >= 3 }).toEqual({ token, ratio: true });
    }
  });
});
