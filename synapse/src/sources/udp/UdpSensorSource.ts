import type { SensorFrame } from '@/src/engine/types';
import { Emitter, type SensorSource, type SourceStatus, type Unsubscribe } from '@/src/sources/types';

import { parseRigPayload } from './protocol';

/**
 * The live Rig link (§2.9): a UDP socket bound on :1234 receiving the
 * firmware's JSON datagrams over the phone's hotspot. Every byte is treated
 * as untrusted; missing packets → SEARCHING, silence after activity → LOST
 * with auto-recovery; nothing here can crash the app (deal-breakers 5, 8).
 *
 * react-native-udp is a native module — present in dev builds, absent in
 * Expo Go and on the web, where this source reports `unavailable` and the
 * app stays in Demo Mode.
 */

export interface UdpSocketLike {
  bind(port: number): void;
  on(event: 'message', cb: (msg: Uint8Array | string, rinfo?: unknown) => void): void;
  once?(event: 'error', cb: (e: unknown) => void): void;
  close(): void;
}

export type UdpSocketFactory = () => UdpSocketLike | null;

function defaultSocketFactory(): UdpSocketLike | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const dgram = require('react-native-udp');
    const createSocket = dgram?.createSocket ?? dgram?.default?.createSocket;
    if (typeof createSocket !== 'function') return null;
    return createSocket({ type: 'udp4' }) as UdpSocketLike;
  } catch {
    return null;
  }
}

export const RIG_UDP_PORT = 1234;
const SILENCE_LOST_MS = 2500;

export class UdpSensorSource implements SensorSource {
  readonly kind = 'udp' as const;
  status: SourceStatus = 'idle';

  private socket: UdpSocketLike | null = null;
  private frames = new Emitter<SensorFrame>();
  private statuses = new Emitter<SourceStatus>();
  private lastFrameAt = 0;
  private lastFrameT = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private hzWindow: number[] = [];

  constructor(
    private opts: {
      port?: number;
      socketFactory?: UdpSocketFactory;
      now?: () => number;
    } = {},
  ) {}

  static available(): boolean {
    const s = defaultSocketFactory();
    if (s === null) return false;
    try {
      s.close();
    } catch {
      // probe socket cleanup is best-effort
    }
    return true;
  }

  /** measured incoming frame rate, Hz */
  get hz(): number {
    const now = this.now();
    this.hzWindow = this.hzWindow.filter((t) => now - t <= 2000);
    return Math.round(this.hzWindow.length / 2);
  }

  private now(): number {
    return this.opts.now ? this.opts.now() : Date.now();
  }

  start(): void {
    if (this.socket) return;
    const factory = this.opts.socketFactory ?? defaultSocketFactory;
    const socket = factory();
    if (socket === null) {
      this.setStatus('unavailable');
      return;
    }
    this.socket = socket;
    this.setStatus('searching');

    try {
      socket.once?.('error', (e) => {
        console.warn('[synapse] rig socket error', e);
        this.stop();
        this.setStatus('unavailable');
      });
      socket.on('message', (msg) => this.onMessage(msg));
      socket.bind(this.opts.port ?? RIG_UDP_PORT);
    } catch (e) {
      console.warn('[synapse] rig socket failed to bind', e);
      this.socket = null;
      this.setStatus('unavailable');
      return;
    }

    this.watchdog = setInterval(() => {
      if (this.status === 'active' && this.now() - this.lastFrameAt > SILENCE_LOST_MS) {
        this.setStatus('lost'); // Rig sleep/reset — recovers on the next packet
      }
    }, 800);
  }

  /** exposed for tests */
  onMessage(msg: Uint8Array | string): void {
    const now = this.now();
    const frame = parseRigPayload(msg, now);
    if (frame === null) return; // malformed → drop, never crash
    // out-of-order guard: keep the newest only
    if (frame.t < this.lastFrameT) return;
    this.lastFrameT = frame.t;
    this.lastFrameAt = now;
    this.hzWindow.push(now);
    if (this.hzWindow.length > 200) this.hzWindow.shift();
    if (this.status !== 'active') this.setStatus('active');
    this.frames.emit(frame);
  }

  stop(): void {
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // socket may already be gone
      }
      this.socket = null;
    }
    this.setStatus('idle');
  }

  onFrame(cb: (f: SensorFrame) => void): Unsubscribe {
    return this.frames.on(cb);
  }
  onStatus(cb: (s: SourceStatus) => void): Unsubscribe {
    return this.statuses.on(cb);
  }
  private setStatus(s: SourceStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.statuses.emit(s);
  }
}
