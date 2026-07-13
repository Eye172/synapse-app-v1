import type { PoseFrame, SensorFrame } from '@/src/engine/types';

/**
 * The three seams the whole app hangs on (§2.6, deal-breaker 4):
 * UI and engine code may only ever talk to these interfaces —
 * sim and live implementations are interchangeable.
 */

export type SourceStatus =
  /** created, not started */
  | 'idle'
  /** started, waiting for the first data (UDP: no packets yet) */
  | 'searching'
  /** producing frames */
  | 'active'
  /** was active, went silent (Rig slept/reset); auto-recovers */
  | 'lost'
  /** cannot run here (no permission / no hardware / module missing) */
  | 'unavailable';

export type Unsubscribe = () => void;

export interface SensorSource {
  readonly kind: 'sim' | 'udp';
  start(): void;
  stop(): void;
  onFrame(cb: (frame: SensorFrame) => void): Unsubscribe;
  onStatus(cb: (status: SourceStatus) => void): Unsubscribe;
  readonly status: SourceStatus;
}

export interface PoseSource {
  readonly kind: 'sim' | 'camera';
  start(): void;
  stop(): void;
  onPose(cb: (frame: PoseFrame) => void): Unsubscribe;
  onStatus(cb: (status: SourceStatus) => void): Unsubscribe;
  readonly status: SourceStatus;
}

/** Tiny typed emitter shared by source implementations. */
export class Emitter<T> {
  private subs = new Set<(v: T) => void>();
  emit(v: T): void {
    for (const s of [...this.subs]) {
      try {
        s(v);
      } catch (e) {
        console.error('[synapse] listener threw', e);
      }
    }
  }
  on(cb: (v: T) => void): Unsubscribe {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }
  clear(): void {
    this.subs.clear();
  }
}
