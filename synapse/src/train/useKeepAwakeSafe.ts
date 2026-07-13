import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect } from 'react';

const TAG = 'synapse-live-set';

/**
 * expo-keep-awake's hook rejects unhandled when the platform denies the wake
 * lock (web policy, some OEM Androids). A dark screen mid-set is annoying;
 * a crash mid-set is a deal-breaker (§3.8). Best-effort only.
 */
export function useKeepAwakeSafe(): void {
  useEffect(() => {
    let held = false;
    activateKeepAwakeAsync(TAG)
      .then(() => {
        held = true;
      })
      .catch(() => {
        // denied — proceed without the lock
      });
    return () => {
      if (held) {
        Promise.resolve(deactivateKeepAwake(TAG)).catch(() => {});
      }
    };
  }, []);
}
