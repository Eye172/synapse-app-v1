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
  /**
   * Two hardware conventions that can only be confirmed against a real Rig.
   * They live in settings, not in code, so a tester can fix them on the phone
   * in the gym instead of waiting for a rebuild.
   */
  /** false = q is [r,i,j,k] (scalar first); true = [i,j,k,r] */
  rigQuatScalarLast: boolean;
  /** which local sensor axis runs along the body segment */
  rigSegmentAxis: '+x' | '-x' | '+y' | '-y' | '+z' | '-z';
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
      rigQuatScalarLast: false,
      rigSegmentAxis: '+z',
      set: (p) => set(p),
    }),
    {
      name: 'synapse.settings.v1',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
