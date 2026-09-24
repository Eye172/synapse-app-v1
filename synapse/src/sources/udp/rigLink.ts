import { CalibrationCollector, RigCalibration } from '@/src/engine/rigBody';
import type { SensorFrame } from '@/src/engine/types';
import { useConnectionStore } from '@/src/store/connectionStore';
import { useSettingsStore } from '@/src/store/settingsStore';

import { UdpSensorSource } from './UdpSensorSource';

/**
 * The app-wide Rig link: one UDP listener whose state feeds the connection
 * chip, the Connect wizard and (when LINKED) the live set. Started from the
 * Connect screen; keeps running while linked so the chip stays truthful.
 */
class RigLinkManager {
  private source: UdpSensorSource | null = null;
  private unsubs: (() => void)[] = [];
  private chipTimer: ReturnType<typeof setInterval> | null = null;

  get active(): UdpSensorSource | null {
    return this.source;
  }

  available(): boolean {
    return UdpSensorSource.available();
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
        if (s === 'searching') store.set({ mode: 'searching', nodeCount: 0, nodesHeard: 0, hz: 0 });
        else if (s === 'active') store.set({ mode: 'linked' });
        else if (s === 'lost') store.set({ mode: 'searching' });
        else if (s === 'unavailable' || s === 'idle') {
          store.set({ mode: 'offline', nodeCount: 0, nodesHeard: 0, hz: 0 });
        }
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
    // hz ticker for the chip
    this.chipTimer = setInterval(() => {
      const store = useConnectionStore.getState();
      if (store.mode === 'linked') store.set({ hz: src.hz });
    }, 1000);

    src.start();
    return src;
  }

  stop(): void {
    for (const u of this.unsubs) u();
    this.unsubs = [];
    if (this.chipTimer) clearInterval(this.chipTimer);
    this.chipTimer = null;
    this.source?.stop();
    this.source = null;
    useConnectionStore.getState().set({ mode: 'offline', nodeCount: 0, nodesHeard: 0, hz: 0 });
  }
}

export const rigLink = new RigLinkManager();

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
