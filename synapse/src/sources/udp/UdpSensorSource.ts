import type { EventSubscription } from 'expo-modules-core';

import RigUdp from '@/modules/rig-udp';
import type { SensorFrame } from '@/src/engine/types';
import { Emitter, type SensorSource, type SourceStatus, type Unsubscribe } from '@/src/sources/types';

import { parseRigPayload } from './protocol';

/**
 * The live Rig link (§2.9): a UDP socket bound on :1234 receiving the
 * firmware's JSON datagrams over the phone's hotspot. Every byte is treated
 * as untrusted; missing packets → SEARCHING, silence after activity → LOST
 * with auto-recovery; nothing here can crash the app (deal-breakers 5, 8).
 *
 * The socket heals itself: a port that cannot be opened, or a socket the OS
 * kills underneath us, is reopened with backoff. Before this, either one left
 * a link that said SEARCHING while nothing was listening at all.
 * `unavailable` is reserved for a build that has no receiver.
 *
 * The receiver is `modules/rig-udp`, a local Expo module. It exists only in a
 * real build — on the web and in Expo Go this source reports `unavailable`
 * and the app says the link cannot be opened here.
 */

export interface UdpSocketLike {
  /** a returned promise resolves once the port is actually open */
  bind(port: number): void | Promise<void>;
  /** `from` is the sender's address — the Rig's place on the hotspot */
  on(event: 'message', cb: (msg: Uint8Array | string, from?: string) => void): void;
  once?(event: 'error', cb: (e: unknown) => void): void;
  removeAllListeners?(event?: string): void;
  close(): void;
}

export type UdpSocketFactory = () => UdpSocketLike | null;

/**
 * The native module owns exactly one socket, and its `bind` and `close` are
 * asynchronous. Without an order between them, a reopen could have the old
 * adapter's `close` land after the new `bind` and silently shut the fresh
 * socket — a link that looks alive and hears nothing. Every native call goes
 * through this one chain, so they reach the native side in the order issued.
 */
let nativeQueue: Promise<unknown> = Promise.resolve();
function queueNative(op: () => Promise<void>): Promise<void> {
  const next = nativeQueue.then(op, op);
  nativeQueue = next.catch(() => {});
  return next;
}

/**
 * Adapts the native module to the node-flavoured socket shape this class was
 * written against, which is also the shape the tests drive. The native `bind`
 * is asynchronous and can reject; a rejection is routed to the same 'error'
 * path as a socket that dies later, so the caller has one thing to handle.
 */
function defaultSocketFactory(): UdpSocketLike | null {
  const native = RigUdp;
  if (native === null) return null;

  const subs: EventSubscription[] = [];
  let onError: ((e: unknown) => void) | null = null;
  let closed = false;

  const raise = (e: unknown): void => {
    const cb = onError;
    onError = null; // 'error' is once-only: the link is torn down on the first
    cb?.(e);
  };

  const dropSubs = (): void => {
    for (const s of subs) s.remove();
    subs.length = 0;
  };

  return {
    bind(port) {
      const bound = queueNative(() => native.bind(port));
      bound.catch(raise);
      return bound;
    },
    on(_event, cb) {
      subs.push(native.addListener('onMessage', ({ data, address }) => cb(data, address)));
    },
    once(_event, cb) {
      onError = cb;
      subs.push(native.addListener('onError', ({ message }) => raise(new Error(message))));
    },
    removeAllListeners() {
      dropSubs();
      onError = null;
    },
    close() {
      if (closed) return;
      closed = true;
      dropSubs();
      onError = null;
      // the native side is already gone if bind never succeeded; either way a
      // failed close must not surface as an unhandled rejection
      queueNative(() => native.close()).catch(() => {});
    },
  };
}

export const RIG_UDP_PORT = 1234;
const SILENCE_LOST_MS = 2500;
/** ~10 Hz is the firmware's rate; this leaves generous headroom for bursts. */
const MAX_PACKETS_PER_SEC = 120;
const HZ_WINDOW_MAX = 200;
const RAW_LOG_MAX = 12;
const RAW_TEXT_MAX = 400;
/**
 * Waits before reopening a failed socket. The last one repeats for as long
 * as the link is wanted — a port held by something else may free up later.
 */
const REOPEN_DELAYS_MS = [1000, 2000, 5000, 10000] as const;

/** One packet as it came off the wire, with the parser's verdict. */
export interface RawPacket {
  t: number;
  parsed: boolean;
  text: string;
  /** sender's address, when the transport reports one */
  from?: string;
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
  /** true from start() to stop(), including while a failed socket waits to reopen */
  private wanted = false;
  private reopenTimer: ReturnType<typeof setTimeout> | null = null;
  private reopenAttempt = 0;
  private hzWindow: number[] = [];
  private budgetStart = 0;
  private acceptedThisSecond = 0;
  private droppedThisSecond = 0;
  private rawLog: RawPacket[] = [];
  private rejectedCount = 0;
  private receivedCount = 0;
  private lastSenderAddr: string | null = null;
  private socketError: string | null = null;

  constructor(
    private opts: {
      port?: number;
      socketFactory?: UdpSocketFactory;
      now?: () => number;
    } = {},
  ) {}

  /**
   * There is one native socket, not one per caller, so this must never probe
   * by opening and closing one — that would shut the live link down.
   */
  static available(): boolean {
    return RigUdp !== null;
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
    if (this.wanted) return;
    // set first: a bind that fails synchronously must already see the link as
    // wanted, or it would never be reopened
    this.wanted = true;
    if (!this.openSocket()) {
      this.wanted = false;
      return;
    }

    this.watchdog = setInterval(() => {
      if (this.status === 'active' && this.now() - this.lastFrameAt > SILENCE_LOST_MS) {
        this.setStatus('lost'); // Rig sleep/reset — recovers on the next packet
      }
    }, 800);
  }

  /**
   * Close and reopen the socket now. Called when the app comes back to the
   * foreground: Android may have torn the socket down in the background
   * without reporting anything, and a fresh bind costs nothing.
   */
  refresh(): void {
    if (!this.wanted) return;
    this.clearReopen();
    this.closeSocket();
    this.openSocket();
  }

  /**
   * Returns false only when this build has no receiver at all; every other
   * failure goes to the reopen path.
   */
  private openSocket(): boolean {
    const factory = this.opts.socketFactory ?? defaultSocketFactory;
    const socket = factory();
    if (socket === null) {
      this.setStatus('unavailable');
      return false;
    }
    this.socket = socket;
    // a reopen after the Rig was heard keeps saying LOST, not SEARCHING
    if (this.status !== 'active' && this.status !== 'lost') this.setStatus('searching');

    try {
      socket.once?.('error', (e) => this.onSocketFailure(socket, e));
      socket.on('message', (msg, from) => this.onMessage(msg, from));
      const bound = socket.bind(this.opts.port ?? RIG_UDP_PORT);
      // listening again is what clears the error — not a packet, which a Rig
      // that is switched off will never send
      bound?.then(
        () => {
          if (socket === this.socket) this.socketError = null;
        },
        () => {}, // failures arrive through the 'error' path
      );
    } catch (e) {
      this.onSocketFailure(socket, e);
    }
    return true;
  }

  private onSocketFailure(socket: UdpSocketLike, e: unknown): void {
    // a late error from a socket that has already been replaced is history
    if (socket !== this.socket) return;
    console.warn('[synapse] rig socket failed, reopening', e);
    this.socketError = e instanceof Error ? e.message : String(e);
    this.closeSocket();
    if (this.status === 'active') this.setStatus('lost');
    this.scheduleReopen();
  }

  private scheduleReopen(): void {
    if (!this.wanted || this.reopenTimer) return;
    const delay = REOPEN_DELAYS_MS[Math.min(this.reopenAttempt, REOPEN_DELAYS_MS.length - 1)];
    this.reopenAttempt += 1;
    this.reopenTimer = setTimeout(() => {
      this.reopenTimer = null;
      if (this.wanted && this.socket === null) this.openSocket();
    }, delay);
  }

  private clearReopen(): void {
    if (this.reopenTimer) clearTimeout(this.reopenTimer);
    this.reopenTimer = null;
  }

  private closeSocket(): void {
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
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

  /** exposed for tests */
  onMessage(msg: Uint8Array | string, from?: string): void {
    const now = this.now();

    // anything arriving at all proves the socket is healthy
    this.receivedCount += 1;
    if (from) this.lastSenderAddr = from;
    this.reopenAttempt = 0;
    this.socketError = null;

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
    this.recordRaw(msg, frame !== null, now, from);

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
    this.wanted = false;
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
    this.clearReopen();
    this.reopenAttempt = 0;
    this.closeSocket();
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

  /** Every datagram that reached the socket, understood or not. */
  get received(): number {
    return this.receivedCount;
  }

  /** The address the last datagram came from — the Rig's place on the hotspot. */
  get lastSender(): string | null {
    return this.lastSenderAddr;
  }

  /** Why the socket last failed while it waits to reopen; null when healthy. */
  get error(): string | null {
    return this.socketError;
  }

  private recordRaw(msg: Uint8Array | string, parsed: boolean, now: number, from?: string): void {
    if (!parsed) this.rejectedCount += 1;
    let text: string;
    try {
      text = typeof msg === 'string' ? msg : new TextDecoder().decode(msg);
    } catch {
      text = `<${typeof msg === 'string' ? msg.length : msg.byteLength} undecodable bytes>`;
    }
    this.rawLog.unshift({ t: now, parsed, text: text.slice(0, RAW_TEXT_MAX), from });
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
