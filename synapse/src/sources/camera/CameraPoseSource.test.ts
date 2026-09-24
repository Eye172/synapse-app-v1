import type { PoseFrame } from '@/src/engine/types';
import type { PoseObservation } from '@/src/vision/types';

import { CameraPoseSource } from './CameraPoseSource';
import { registerPoseDetector, type PoseDetector } from './PoseDetector';

/** A detector the test drives by hand. */
class FakeDetector implements PoseDetector {
  readonly name = 'fake';
  readonly metric = true;
  starts = 0;
  onPose: ((o: PoseObservation) => void) | null = null;
  onFailure: ((r: string) => void) | null = null;
  async start(onPose: (o: PoseObservation) => void, onFailure?: (r: string) => void) {
    this.starts += 1;
    this.onPose = onPose;
    this.onFailure = onFailure ?? null;
  }
  async stop() {
    this.onPose = null;
  }
}

function observation(t: number): PoseObservation {
  const pt = { x: 0.5, y: 0.5, z: 0, v: 1 };
  return {
    t,
    image: Array.from({ length: 33 }, () => ({ ...pt })),
    world: Array.from({ length: 33 }, () => ({ ...pt })),
    frame: { width: 720, height: 1280 },
  };
}

describe('CameraPoseSource', () => {
  let created: FakeDetector[];

  beforeEach(() => {
    jest.useFakeTimers();
    created = [];
    registerPoseDetector({
      isAvailable: () => true,
      create: () => {
        const d = new FakeDetector();
        created.push(d);
        return d;
      },
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /**
   * Position-lock starts the source and the live set starts it again. Before
   * this held, the second start attached a second detector and a second
   * watchdog, and every frame reached the tracker twice.
   */
  it('attaches one detector however many times it is started', async () => {
    const src = new CameraPoseSource({ hasCameraPermission: true });
    const frames: PoseFrame[] = [];
    src.onPose((f) => frames.push(f));

    src.start();
    src.start();
    await Promise.resolve();

    expect(created).toHaveLength(1);
    expect(created[0]!.starts).toBe(1);

    created[0]!.onPose!(observation(1000));
    expect(frames).toHaveLength(1);
    src.stop();
  });

  it('carries both spaces and the frame size into the pose it emits', async () => {
    const src = new CameraPoseSource({ hasCameraPermission: true });
    const frames: PoseFrame[] = [];
    src.onPose((f) => frames.push(f));
    src.start();
    await Promise.resolve();

    created[0]!.onPose!(observation(1234));
    expect(frames[0]!.source).toBe('camera');
    expect(frames[0]!.t).toBe(1234);
    expect(frames[0]!.world).toHaveLength(33);
    expect(frames[0]!.frame).toEqual({ width: 720, height: 1280 });
    src.stop();
  });

  it('goes active on the first pose and back to searching when poses stop', async () => {
    const src = new CameraPoseSource({ hasCameraPermission: true });
    src.start();
    await Promise.resolve();
    expect(src.status).toBe('searching');

    created[0]!.onPose!(observation(Date.now()));
    expect(src.status).toBe('active');

    jest.advanceTimersByTime(2000);
    expect(src.status).toBe('searching');
    src.stop();
  });

  /**
   * A camera that runs while nothing measures behind it must say so. Before,
   * the source searched forever for a body nobody was looking for.
   */
  it('reports unavailable when the detector says it cannot run', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const src = new CameraPoseSource({ hasCameraPermission: true });
    const statuses: string[] = [];
    src.onStatus((s) => statuses.push(s));
    src.start();
    await Promise.resolve();

    created[0]!.onFailure!('GPU: refused; CPU: model missing');
    expect(src.status).toBe('unavailable');
    expect(statuses).toContain('unavailable');
    warn.mockRestore();
    src.stop();
  });

  it('recovers on its own if poses arrive after a failure', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const src = new CameraPoseSource({ hasCameraPermission: true });
    src.start();
    await Promise.resolve();
    created[0]!.onFailure!('transient');
    created[0]!.onPose!(observation(Date.now()));
    expect(src.status).toBe('active');
    warn.mockRestore();
    src.stop();
  });

  it('never starts a detector without camera permission', () => {
    const src = new CameraPoseSource({ hasCameraPermission: false });
    src.start();
    expect(created).toHaveLength(0);
    expect(src.status).toBe('unavailable');
  });

  it('can be started again after it was stopped', async () => {
    const src = new CameraPoseSource({ hasCameraPermission: true });
    src.start();
    await Promise.resolve();
    src.stop();
    src.start();
    await Promise.resolve();
    expect(created).toHaveLength(2);
    src.stop();
  });
});
