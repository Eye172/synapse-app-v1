import { Platform, type ViewStyle } from 'react-native';

/**
 * Cross-platform glow. Native uses shadow props (+elevation); web uses
 * boxShadow — react-native-web deprecates shadow* and warns on every render,
 * and the budget says zero warnings (§2.14).
 */
export function glow(tint: string, radius = 12, opacity = 0.55, elevation = 6): ViewStyle {
  if (Platform.OS === 'web') {
    const a = Math.round(opacity * 255)
      .toString(16)
      .padStart(2, '0');
    const web: Record<string, unknown> = { boxShadow: `0 0 ${radius}px ${tint}${tint.startsWith('#') && tint.length === 7 ? a : ''}` };
    return web as ViewStyle;
  }
  return {
    shadowColor: tint,
    shadowOpacity: opacity,
    shadowRadius: radius,
    shadowOffset: { width: 0, height: 0 },
    elevation,
  };
}
