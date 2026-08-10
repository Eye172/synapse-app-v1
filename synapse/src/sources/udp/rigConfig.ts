import { setRigSegmentAxis } from '@/src/engine/rigBody';
import { useSettingsStore } from '@/src/store/settingsStore';

import { setV2QuatScalarLast } from './protocol';

/**
 * Push the two hardware conventions from settings into the engine, and keep
 * them in sync afterwards. Both are things only a real Rig can confirm, so
 * they are adjustable from the phone — this is the wire that makes a change
 * on the Diagnostics screen take effect immediately.
 */
export function applyRigConfig(): void {
  const s = useSettingsStore.getState();
  setV2QuatScalarLast(s.rigQuatScalarLast);
  setRigSegmentAxis(s.rigSegmentAxis);
}

/** Subscribe once at startup; returns the unsubscribe. */
export function watchRigConfig(): () => void {
  applyRigConfig();
  return useSettingsStore.subscribe((state, prev) => {
    if (
      state.rigQuatScalarLast !== prev.rigQuatScalarLast ||
      state.rigSegmentAxis !== prev.rigSegmentAxis
    ) {
      applyRigConfig();
    }
  });
}
