import { AppState, type NativeEventSubscription } from 'react-native';

import { CalibrationCollector, RigCalibration } from '@/src/engine/rigBody';
import type { SensorFrame } from '@/src/engine/types';
import { useConnectionStore } from '@/src/store/connectionStore';
import { useSettingsStore, type SettingsState } from '@/src/store/settingsStore';

import { UdpSensorSource } from './UdpSensorSource';

const NO_NODES = { nodeCount: 0, nodesHeard: 0, hz: 0 } as const;
const IDLE_LINK = { ...NO_NODES, mode: 'offline', linkError: null } as const;

/**
 * The app-wide Rig link: one UDP listener whose state feeds the connection
 * chip, the Connect wizard and (when LINKED) the live set.
 *
 * Started from the Connect screen, or at launch for a Rig that has been
 * calibrated before (`autoStart`) — the wearer powers the Rig on and the chip
 * goes LINKED without anyone opening a screen. Once started it keeps
 * listening until `stop()`: an idle socket costs nothing, and a link that
 * quietly closes behind the user is the one that "never connects".
 */
class RigLinkManager {
  private source: UdpSensorSource | null = null;
  private unsubs: (() => void)[] = [];
  private chipTimer: ReturnType<typeof setInterval> | null = null;
  private appState: NativeEventSubscription | null = null;

  get active(): UdpSensorSource | null {
    return this.source;
  }

  available(): boolean {
    return UdpSensorSource.available();
  }

  /**
   * Start listening at launch if this phone has worked with a Rig before.
   * A phone that never calibrated one opens no socket until asked. Settings
   * load asynchronously, so this waits for them; returns the unsubscribe.
   */
  autoStart(): () => void {
    const tryStart = () => {
      if (hasStoredCalibration()) this.start();
    };
    // start() is idempotent, so trying now and again after hydration is safe
    tryStart();
    return useSettingsStore.persist.onFinishHydration(tryStart);
  }

  /**
   * A screen that started the link is done with it. Keeps listening if the
   * Rig linked or this phone has a calibrated Rig — that one should link the
   * moment it powers on. Only a first visit that heard nothing closes it.
   */
  release(): void {
    if (useConnectionStore.getState().mode !== 'linked' && !hasStoredCalibration()) this.stop();
  }

  start(): UdpSensorSource | null {
    if (this.source) return this.source;
    if (!this.available()) {
      return null;
    }
    const src = new UdpSensorSource();
    this.source = src;

    this.unsubs.push(
      src.onStatus((s) => {
        const store = useConnectionStore.getState();
        if (s === 'searching') store.set({ ...NO_NODES, mode: 'searching' });
        else if (s === 'active') store.set({ mode: 'linked' });
        else if (s === 'lost') store.set({ mode: 'searching' });
        else if (s === 'unavailable' || s === 'idle') store.set(IDLE_LINK);
      }),
      src.onFrame((f: SensorFrame) => {
        const store = useConnectionStore.getState();
        // only a node with an orientation is measuring anything; one that
        // arrived with a zeroed or corrupt reading is heard but not reading,
        // and the chip must not count it as a working sensor
        store.set({
          nodeCount: f.nodes.filter((n) => n.quat !== undefined).length,
          nodesHeard: f.nodes.length,
          battery: f.battery ?? store.battery,
        });
      }),
    );
    // once a second: rate for the chip, and the socket's own diagnostics —
    // polled rather than pushed so a 10 Hz stream does not re-render screens,
    // and written only when something moved
    this.chipTimer = setInterval(() => {
      const store = useConnectionStore.getState();
      const next = {
        hz: store.mode === 'linked' ? src.hz : 0,
        packets: src.received,
        rejected: src.rejected,
        lastSender: src.lastSender,
        linkError: src.error,
      };
      const changed = (Object.keys(next) as (keyof typeof next)[]).some((k) => store[k] !== next[k]);
      if (changed) store.set(next);
    }, 1000);

    // Android can drop a background app's socket without a word; coming back
    // to the foreground reopens it unless the Rig is visibly streaming.
    this.appState = AppState.addEventListener('change', (next) => {
      if (next === 'active' && src.status !== 'active') src.refresh();
    });

    src.start();
    return src;
  }

  stop(): void {
    for (const u of this.unsubs) u();
    this.unsubs = [];
    if (this.chipTimer) clearInterval(this.chipTimer);
    this.chipTimer = null;
    this.appState?.remove();
    this.appState = null;
    this.source?.stop();
    this.source = null;
    useConnectionStore.getState().set(IDLE_LINK);
  }
}

export const rigLink = new RigLinkManager();

/** How many Rig nodes have a stored neutral reference — a settings selector. */
export function calibratedNodeCount(s: Pick<SettingsState, 'rigCalibration'>): number {
  return Object.keys(s.rigCalibration).length;
}

/** Has this phone been calibrated against a Rig before? */
export function hasStoredCalibration(): boolean {
  return calibratedNodeCount(useSettingsStore.getState()) > 0;
}

/**
 * Calibration (§2.9): hold a neutral stance while every node's orientation is
 * averaged. Those references are what make the whole body model
 * mounting-agnostic — after this, "how far has this segment moved from
 * neutral" is exact regardless of how the hardware sits on the user.
 *
 * Persists to settings so a calibrated Rig stays calibrated across sessions.
 */
export async function calibrateNeutral(
  src: UdpSensorSource,
  opts: {
    durationMs?: number;
    onProgress?: (p: number, nodesSeen: number) => void;
  } = {},
): Promise<{ ok: boolean; calibration?: RigCalibration; nodes?: number; reason?: string }> {
  const durationMs = opts.durationMs ?? 3000;
  const collector = new CalibrationCollector();
  const t0 = Date.now();
  // "nothing arrived" and "everything arrived with no fix" both end with an
  // empty collector, and they send the wearer to opposite places: one is the
  // network, the other is the sensors. Counting packets separates them.
  let packetsSeen = 0;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: Awaited<ReturnType<typeof calibrateNeutral>>) => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      unsub();
      resolve(result);
    };

    const unsub = src.onFrame((f) => {
      packetsSeen += 1;
      collector.add(f);
      opts.onProgress?.(Math.min(1, (Date.now() - t0) / durationMs), collector.nodeCount);
    });

    const timer = setInterval(() => {
      if (Date.now() - t0 < durationMs) return;
      const cal = collector.build();
      if (cal === null) {
        finish({
          ok: false,
          nodes: collector.nodeCount,
          reason:
            collector.nodeCount > 0
              ? 'The back node never reported; it anchors the body reference.'
              : packetsSeen === 0
                ? 'No packets arrived. Check the Rig is powered and joined to this phone’s hotspot.'
                : `The Rig is streaming (${packetsSeen} packet${packetsSeen === 1 ? '' : 's'}), but no sensor produced an orientation. Give the IMUs a few seconds to find their fix; if it persists, the sensors are wired but not reading.`,
        });
        return;
      }
      useSettingsStore.getState().set({ rigCalibration: cal.toJSON() });
      finish({ ok: true, calibration: cal, nodes: collector.nodeCount });
    }, 100);
  });
}

/** The calibration persisted from a previous session, if any. */
export function storedCalibration(): RigCalibration {
  return RigCalibration.fromJSON(useSettingsStore.getState().rigCalibration);
}
