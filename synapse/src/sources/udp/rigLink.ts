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
        if (s === 'searching') store.set({ mode: 'searching', nodeCount: 0, hz: 0 });
        else if (s === 'active') store.set({ mode: 'linked' });
        else if (s === 'lost') store.set({ mode: 'searching' });
        else if (s === 'unavailable' || s === 'idle') {
          store.set({ mode: 'sim', nodeCount: 0, hz: 0 });
        }
      }),
      src.onFrame((f: SensorFrame) => {
        const store = useConnectionStore.getState();
        store.set({
          nodeCount: f.nodes.length,
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
    useConnectionStore.getState().set({ mode: 'sim', nodeCount: 0, hz: 0 });
  }
}

export const rigLink = new RigLinkManager();

/**
 * Calibration (§2.9): sample the neutral stance for ~3s and zero the spine
 * reference — offsets persist in settings and feed every set's fusion.
 */
export async function calibrateNeutral(
  src: UdpSensorSource,
  opts: { durationMs?: number; onProgress?: (p: number, angle: number | null) => void } = {},
): Promise<{ ok: boolean; offset?: number; samples?: number }> {
  const durationMs = opts.durationMs ?? 3000;
  const samples: number[] = [];
  const t0 = Date.now();

  return new Promise((resolve) => {
    const unsub = src.onFrame((f) => {
      const spine = f.nodes.find((n) => n.id === 'spine');
      if (spine?.angleDeg !== undefined) samples.push(spine.angleDeg);
      const p = Math.min(1, (Date.now() - t0) / durationMs);
      opts.onProgress?.(p, spine?.angleDeg ?? null);
    });
    const timer = setInterval(() => {
      if (Date.now() - t0 >= durationMs) {
        clearInterval(timer);
        unsub();
        if (samples.length < 5) {
          resolve({ ok: false, samples: samples.length });
          return;
        }
        const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
        // neutral upright spine should read 90 (firmware convention)
        const offset = mean - 90;
        useSettingsStore.getState().set({ rigZeroOffsets: { spine: offset } });
        resolve({ ok: true, offset, samples: samples.length });
      }
    }, 100);
  });
}
