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
  /** which lens films the set — front to watch yourself, back for a propped phone */
  cameraFacing: 'front' | 'back';
  /** whether an AI key is stored (the key itself lives in SecureStore) */
  aiKeyPresent: boolean;
  /** LLM provider id — provider-agnostic seam, Claude is the default */
  aiProvider: 'anthropic';
  onboardingDone: boolean;
  /**
   * Rig calibration: the neutral-stance reference quaternion per node,
   * scalar-first (r,i,j,k). Persisted so a calibrated Rig stays calibrated
   * between sessions.
   */
  rigCalibration: Record<string, [number, number, number, number]>;
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
      cameraFacing: 'front',
      aiKeyPresent: false,
      aiProvider: 'anthropic',
      onboardingDone: false,
      rigCalibration: {},
      set: (p) => set(p),
    }),
    {
      name: 'synapse.settings.v1',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
