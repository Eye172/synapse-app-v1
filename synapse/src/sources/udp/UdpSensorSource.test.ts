import type { SensorFrame } from '@/src/engine/types';

import { UdpSensorSource, type UdpSocketLike } from './UdpSensorSource';

class FakeSocket implements UdpSocketLike {
  bound: number | null = null;
  closed = false;
  private handlers = new Map<string, (m: Uint8Array | string) => void>();
  bind(port: number): void {
    this.bound = port;
  }
  on(event: 'message', cb: (msg: Uint8Array | string) => void): void {
    this.handlers.set(event, cb);
  }
  once(): void {}
  close(): void {
    this.closed = true;
  }
  push(msg: string): void {
    this.handlers.get('message')?.(msg);
  }
}

function makeSource() {
  let now = 1_000_000;
  const socket = new FakeSocket();
  const src = new UdpSensorSource({
    socketFactory: () => socket,
    now: () => now,
  });
  liveSources.push(src);
  return {
    src,
    socket,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const liveSources: UdpSensorSource[] = [];

describe('UdpSensorSource — the real-world is messy (§2.9)', () => {
  afterEach(() => {
    for (const s of liveSources.splice(0)) s.stop();
    jest.useRealTimers();
  });

  it('binds :1234 and goes searching → active on the first firmware packet', () => {
    const { src, socket } = makeSource();
    const frames: SensorFrame[] = [];
    src.onFrame((f) => frames.push(f));
    src.start();
    expect(socket.bound).toBe(1234);
    expect(src.status).toBe('searching');

    socket.push('{"angle": 41.7, "alert": true}');
    expect(src.status).toBe('active');
    expect(frames).toHaveLength(1);
    expect(frames[0]!.nodes[0]).toEqual({ id: 'back', angleDeg: 41.7, alert: true });
    expect(frames[0]!.flags.alert).toBe(true);
  });

  it('survives malformed floods without emitting or crashing', () => {
    const { src, socket } = makeSource();
    const frames: SensorFrame[] = [];
    src.onFrame((f) => frames.push(f));
    src.start();
    for (const junk of ['garbage', '{"angle": "no"}', '[]', '', '{"angle": 1e999}', '\x00\x01\x02']) {
      socket.push(junk);
    }
    expect(frames).toHaveLength(0);
    expect(src.status).toBe('searching'); // junk is not a Rig
  });

  it('goes lost on silence and auto-recovers on the next packet', () => {
    jest.useFakeTimers();
    const { src, socket, advance } = makeSource();
    src.start();
    socket.push('{"angle": 88}');
    expect(src.status).toBe('active');

    advance(3000); // silence beyond the watchdog
    jest.advanceTimersByTime(1000);
    expect(src.status).toBe('lost');

    socket.push('{"angle": 87}');
    expect(src.status).toBe('active');
  });

  it('reports unavailable when the native module is missing', () => {
    const src = new UdpSensorSource({ socketFactory: () => null });
    src.start();
    expect(src.status).toBe('unavailable');
  });

  it('stop closes the socket and further packets are ignored', () => {
    const { src, socket } = makeSource();
    const frames: SensorFrame[] = [];
    src.onFrame((f) => frames.push(f));
    src.start();
    socket.push('{"angle": 88}');
    src.stop();
    expect(socket.closed).toBe(true);
    expect(src.status).toBe('idle');
  });
});
