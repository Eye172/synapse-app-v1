import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { useSettingsStore } from '@/src/store/settingsStore';

/**
 * Haptic vocabulary (§2.8): short buzz = minor drift, double buzz = fault,
 * long/heavy = STOP. Setting-aware, fire-and-forget, never throws.
 */
export type HapticKind = 'minor' | 'fault' | 'stop' | 'lock' | 'rep';

export function buzz(kind: HapticKind): void {
  if (Platform.OS === 'web') return; // no-op on the web harness
  if (!useSettingsStore.getState().hapticsOn) return;
  const run = async () => {
    switch (kind) {
      case 'minor':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case 'fault':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        await new Promise((r) => setTimeout(r, 120));
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
      case 'stop':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        await new Promise((r) => setTimeout(r, 150));
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
      case 'lock':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case 'rep':
        await Haptics.selectionAsync();
        break;
    }
  };
  run().catch(() => {
    /* haptics are best-effort */
  });
}
