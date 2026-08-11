import { UdpSensorSource, RIG_UDP_PORT } from './UdpSensorSource';

/**
 * The glue between the source and `modules/rig-udp`. Everything else in this
 * folder is driven by a fake socket, so without these tests the one piece that
 * actually touches the native module would be the only untested link in the
 * chain that carries the Rig.
 */

type Listener = (event: never) => void;

class FakeRigUdp {
  readonly listeners = new Map<string, Listener[]>();
  readonly binds: number[] = [];
  closes = 0;
  bindFailure: Error | null = null;

  addListener(name: string, cb: Listener): { remove(): void } {
    const list = this.listeners.get(name) ?? [];
    list.push(cb);
    this.listeners.set(name, list);
    return {
      remove: () => {
        this.listeners.set(name, (this.listeners.get(name) ?? []).filter((x) => x !== cb));
      },
    };
  }

  async bind(port: number): Promise<void> {
    this.binds.push(port);
    if (this.bindFailure) throw this.bindFailure;
  }

  async close(): Promise<void> {
    this.closes += 1;
  }

  emit(name: string, event: unknown): void {
    for (const cb of [...(this.listeners.get(name) ?? [])]) (cb as (e: unknown) => void)(event);
  }

  get liveListeners(): number {
    let n = 0;
    for (const list of this.listeners.values()) n += list.length;
    return n;
  }
}

const mockRigUdp = new FakeRigUdp();

jest.mock('@/modules/rig-udp', () => ({
  __esModule: true,
  get default() {
    return mockRigUdp;
  },
}));

const NAMED_FRAME = JSON.stringify({
  back: { alert: false, quaternions: { r: 1, i: 0, j: 0, k: 0 } },
  leftArm: { alert: false, quaternions: { r: 1, i: 0, j: 0, k: 0 } },
  leftLeg: { alert: false, quaternions: { r: 1, i: 0, j: 0, k: 0 } },
  rightArm: { alert: false, quaternions: { r: 1, i: 0, j: 0, k: 0 } },
  rightLeg: { alert: true, quaternions: { r: 1, i: 0, j: 0, k: 0 } },
});

describe('the native socket adapter', () => {
  let src: UdpSensorSource;

  beforeEach(() => {
    mockRigUdp.listeners.clear();
    mockRigUdp.binds.length = 0;
    mockRigUdp.closes = 0;
    mockRigUdp.bindFailure = null;
    src = new UdpSensorSource();
  });

  afterEach(() => {
    src.stop();
  });

  it('reports available while the native module is there', () => {
    expect(UdpSensorSource.available()).toBe(true);
  });

  it('binds the rig port and turns native messages into frames', () => {
    const frames: unknown[] = [];
    src.onFrame((f) => frames.push(f));
    src.start();

    expect(mockRigUdp.binds).toEqual([RIG_UDP_PORT]);
    expect(src.status).toBe('searching');

    mockRigUdp.emit('onMessage', { data: NAMED_FRAME, address: '192.168.43.55', port: 5000 });

    expect(frames).toHaveLength(1);
    expect(src.status).toBe('active');
  });

  it('treats a failed bind as an unavailable link, not a crash', async () => {
    mockRigUdp.bindFailure = new Error('EADDRINUSE');
    src.start();
    // the native bind is a promise; its rejection lands on the error path
    await Promise.resolve();
    await Promise.resolve();

    expect(src.status).toBe('unavailable');
  });

  it('tears the link down when the native side reports an error', () => {
    src.start();
    mockRigUdp.emit('onError', { message: 'socket closed unexpectedly' });

    expect(src.status).toBe('unavailable');
  });

  it('reports a native error only once, however many arrive', () => {
    const seen: string[] = [];
    src.onStatus((s) => seen.push(s));
    src.start();

    mockRigUdp.emit('onError', { message: 'first' });
    mockRigUdp.emit('onError', { message: 'second' });
    mockRigUdp.emit('onError', { message: 'third' });

    // 'error' is once-only: the first tears the link down, and the rest must
    // not re-enter stop() on an already-dead socket
    expect(seen.filter((s) => s === 'unavailable')).toHaveLength(1);
  });

  it('releases every native listener and the socket on stop', () => {
    src.start();
    expect(mockRigUdp.liveListeners).toBeGreaterThan(0);

    src.stop();

    expect(mockRigUdp.liveListeners).toBe(0);
    expect(mockRigUdp.closes).toBe(1);
    // a datagram that arrives after teardown must not reach a dead source
    expect(() => mockRigUdp.emit('onMessage', { data: NAMED_FRAME, address: '', port: 0 })).not.toThrow();
    expect(src.status).toBe('idle');
  });
});
