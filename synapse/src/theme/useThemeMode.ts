import { useSettingsStore } from '@/src/store/settingsStore';
import type { ThemeMode } from '@/src/theme/tokens';

/**
 * Subscribes a screen to the active theme.
 *
 * The tokens are a plain mutable object, which is what lets every `color.x`
 * read in the app stay as it is — but a mutation is invisible to React. Call
 * this once at the top of anything that owns a screen: it re-renders on a
 * theme change, and its children re-render with it because they are rebuilt
 * during that render. Nothing here is memoised, so the cascade is complete.
 *
 * The returned mode is worth using directly only where a component needs to
 * *branch*, not merely recolour — a status bar style, an image asset. Colours
 * should keep coming from the tokens.
 */
export function useThemeMode(): ThemeMode {
  return useSettingsStore((s) => s.theme);
}
