import { FakeRigUdp, flush } from './fakeRigUdp';
import { UdpSensorSource, RIG_UDP_PORT } from './UdpSensorSource';

/**
 * The glue between the source and `modules/rig-udp`. Everything else in this
 * folder is driven by a fake socket, so without these tests the one piece that
 * actually touches the native module would be the only untested link in the
 * chain that carries the Rig.
 */

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
    mockRigUdp.reset();
    src = new UdpSensorSource();
  });

  afterEach(() => {
    src.stop();
    jest.useRealTimers();
  });

  it('reports available while the native module is there', () => {
    expect(UdpSensorSource.available()).toBe(true);
  });

  it('binds the rig port and turns native messages into frames', async () => {
    const frames: unknown[] = [];
    src.onFrame((f) => frames.push(f));
    src.start();
    await flush();

    expect(mockRigUdp.binds).toEqual([RIG_UDP_PORT]);
    expect(src.status).toBe('searching');

    mockRigUdp.emit('onMessage', { data: NAMED_FRAME, address: '192.168.43.55', port: 5000 });

    expect(frames).toHaveLength(1);
    expect(src.status).toBe('active');
    // the sender is kept: it is the Rig's address on the hotspot
    expect(src.lastSender).toBe('192.168.43.55');
    expect(src.recentPackets[0]!.from).toBe('192.168.43.55');
  });

  it('keeps searching after a failed bind, says why, and retries it', async () => {
    jest.useFakeTimers();
    mockRigUdp.bindFailure = new Error('EADDRINUSE');
    src.start();
    await flush();

    // a port that cannot be opened is a reason to retry, not a missing module
    expect(src.status).toBe('searching');
    expect(src.error).toBe('EADDRINUSE');

    mockRigUdp.bindFailure = null;
    jest.advanceTimersByTime(1000);
    await flush();
    expect(mockRigUdp.binds).toHaveLength(2);
    // listening again clears the error, before any Rig has said a word
    expect(src.error).toBeNull();

    mockRigUdp.emit('onMessage', { data: NAMED_FRAME, address: '192.168.43.55', port: 5000 });
    expect(src.status).toBe('active');
  });

  it('reopens the socket when the native side reports an error', async () => {
    jest.useFakeTimers();
    src.start();
    await flush();
    mockRigUdp.emit('onMessage', { data: NAMED_FRAME, address: '192.168.43.55', port: 5000 });
    expect(src.status).toBe('active');

    mockRigUdp.emit('onError', { message: 'socket closed unexpectedly' });
    // the Rig was heard, so this reads as a lost link, and it is not given up on
    expect(src.status).toBe('lost');
    expect(src.error).toBe('socket closed unexpectedly');

    jest.advanceTimersByTime(1000);
    await flush();
    expect(mockRigUdp.binds).toHaveLength(2);
  });

  it('reacts to a native error only once, however many arrive', async () => {
    jest.useFakeTimers();
    src.start();
    await flush();

    mockRigUdp.emit('onError', { message: 'first' });
    mockRigUdp.emit('onError', { message: 'second' });
    mockRigUdp.emit('onError', { message: 'third' });
    expect(src.error).toBe('first');

    // 'error' is once-only: the first schedules one reopen, and the rest must
    // not re-enter teardown on an already-dead socket
    jest.advanceTimersByTime(1000);
    await flush();
    expect(mockRigUdp.binds).toHaveLength(2);
  });

  it('backs off between repeated failures', async () => {
    jest.useFakeTimers();
    mockRigUdp.bindFailure = new Error('EACCES');
    src.start();
    await flush();

    jest.advanceTimersByTime(1000); // first retry
    await flush();
    expect(mockRigUdp.binds).toHaveLength(2);

    jest.advanceTimersByTime(1000); // the second waits longer
    await flush();
    expect(mockRigUdp.binds).toHaveLength(2);
    jest.advanceTimersByTime(1000);
    await flush();
    expect(mockRigUdp.binds).toHaveLength(3);
  });

  it('closes before it rebinds, in order, on refresh', async () => {
    src.start();
    await flush();
    const calls: string[] = [];
    const origBind = mockRigUdp.bind.bind(mockRigUdp);
    const origClose = mockRigUdp.close.bind(mockRigUdp);
    mockRigUdp.bind = async (port: number) => {
      calls.push('bind');
      return origBind(port);
    };
    mockRigUdp.close = async () => {
      calls.push('close');
      return origClose();
    };
    try {
      src.refresh();
      await flush();
      expect(calls).toEqual(['close', 'bind']);
    } finally {
      mockRigUdp.bind = origBind;
      mockRigUdp.close = origClose;
    }
  });

  it('releases every native listener and the socket on stop', async () => {
    src.start();
    await flush();
    expect(mockRigUdp.liveListeners).toBeGreaterThan(0);

    src.stop();
    await flush();

    expect(mockRigUdp.liveListeners).toBe(0);
    expect(mockRigUdp.closes).toBe(1);
    // a datagram that arrives after teardown must not reach a dead source
    expect(() => mockRigUdp.emit('onMessage', { data: NAMED_FRAME, address: '', port: 0 })).not.toThrow();
    expect(src.status).toBe('idle');
  });

  it('opens nothing again once stopped, even with a reopen pending', async () => {
    jest.useFakeTimers();
    src.start();
    await flush();
    mockRigUdp.emit('onError', { message: 'gone' });
    src.stop();

    jest.advanceTimersByTime(20000);
    await flush();
    expect(mockRigUdp.binds).toHaveLength(1);
    expect(src.status).toBe('idle');
  });
});
