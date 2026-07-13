import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface SettingsState {
  units: 'kg' | 'lb';
  /** spoken cues */
  voiceOn: boolean;
  hapticsOn: boolean;
  /** in-set coach chattiness */
  coachVerbosity: 'quiet' | 'normal';
  /** force Demo Mode even when hardware is present */
  demoModeForced: boolean;
  /** whether an AI key is stored (the key itself lives in SecureStore) */
  aiKeyPresent: boolean;
  /** LLM provider id — provider-agnostic seam, Claude is the default */
  aiProvider: 'anthropic';
  onboardingDone: boolean;
  /** Rig calibration: per-node zero offsets from the neutral-stance hold */
  rigZeroOffsets: Record<string, number>;
  set: (p: Partial<Omit<SettingsState, 'set'>>) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      units: 'kg',
      voiceOn: true,
      hapticsOn: true,
      coachVerbosity: 'normal',
      demoModeForced: false,
      aiKeyPresent: false,
      aiProvider: 'anthropic',
      onboardingDone: false,
      rigZeroOffsets: {},
      set: (p) => set(p),
    }),
    {
      name: 'synapse.settings.v1',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
