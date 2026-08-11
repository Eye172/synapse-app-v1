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
 * app reports the link as unavailable.
 */

export interface UdpSocketLike {
  bind(port: number): void;
  on(event: 'message', cb: (msg: Uint8Array | string, rinfo?: unknown) => void): void;
  once?(event: 'error', cb: (e: unknown) => void): void;
  removeAllListeners?(event?: string): void;
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
/** ~10 Hz is the firmware's rate; this leaves generous headroom for bursts. */
const MAX_PACKETS_PER_SEC = 120;
const HZ_WINDOW_MAX = 200;
const RAW_LOG_MAX = 12;
const RAW_TEXT_MAX = 400;

/** One packet as it came off the wire, with the parser's verdict. */
export interface RawPacket {
  t: number;
  parsed: boolean;
  text: string;
}

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
  private budgetStart = 0;
  private acceptedThisSecond = 0;
  private droppedThisSecond = 0;
  private rawLog: RawPacket[] = [];
  private rejectedCount = 0;

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

    // An open UDP port accepts traffic from anything on the same network, so
    // the intake is rate-limited before any work happens. A real Rig sends at
    // ~10 Hz; a flood — misconfigured device or someone probing the hotspot —
    // is dropped here rather than being allowed to drive the render loop flat
    // out and burn the battery.
    if (now - this.budgetStart >= 1000) {
      if (this.droppedThisSecond > 0) {
        console.warn(`[synapse] rig intake dropped ${this.droppedThisSecond} packet(s) over the rate cap`);
      }
      this.budgetStart = now;
      this.acceptedThisSecond = 0;
      this.droppedThisSecond = 0;
    }
    if (this.acceptedThisSecond >= MAX_PACKETS_PER_SEC) {
      this.droppedThisSecond += 1;
      return;
    }
    this.acceptedThisSecond += 1;

    const frame = parseRigPayload(msg, now);

    // Keep the raw text of recent packets with the verdict. A packet that
    // arrives but does not parse is otherwise invisible — this is the
    // difference between "the rig is silent" and "the rig is talking and we
    // don't understand it", which are completely different problems in a gym.
    this.recordRaw(msg, frame !== null, now);

    if (frame === null) return; // malformed → drop, never crash
    // out-of-order guard: keep the newest only
    if (frame.t < this.lastFrameT) return;
    this.lastFrameT = frame.t;
    this.lastFrameAt = now;
    this.hzWindow.push(now);
    if (this.hzWindow.length > HZ_WINDOW_MAX) this.hzWindow.shift();
    if (this.status !== 'active') this.setStatus('active');
    this.frames.emit(frame);
  }

  stop(): void {
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      try {
        // drop handlers before closing so a late packet can't reach a
        // half-torn-down source
        socket.removeAllListeners?.('message');
        socket.removeAllListeners?.('error');
        socket.close();
      } catch {
        // socket may already be gone
      }
    }
    this.hzWindow.length = 0;
    this.lastFrameT = 0;
    this.setStatus('idle');
  }

  /** Recent packets exactly as they arrived, newest first (diagnostics). */
  get recentPackets(): readonly RawPacket[] {
    return this.rawLog;
  }

  /** How many packets arrived but could not be understood. */
  get rejected(): number {
    return this.rejectedCount;
  }

  private recordRaw(msg: Uint8Array | string, parsed: boolean, now: number): void {
    if (!parsed) this.rejectedCount += 1;
    let text: string;
    try {
      text = typeof msg === 'string' ? msg : new TextDecoder().decode(msg);
    } catch {
      text = `<${typeof msg === 'string' ? msg.length : msg.byteLength} undecodable bytes>`;
    }
    this.rawLog.unshift({ t: now, parsed, text: text.slice(0, RAW_TEXT_MAX) });
    if (this.rawLog.length > RAW_LOG_MAX) this.rawLog.length = RAW_LOG_MAX;
  }

  /**
   * Release every listener as well as the socket. `stop()` is reversible;
   * this is not — call it when the link itself is being discarded.
   */
  dispose(): void {
    this.stop();
    this.frames.clear();
    this.statuses.clear();
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
