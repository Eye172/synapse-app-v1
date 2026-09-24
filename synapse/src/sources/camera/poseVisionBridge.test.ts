import { LANDMARK_COUNT, LM } from '@/src/engine/types';

import {
  MAX_CLOCK_SKEW_MS,
  frameTime,
  listenerCount,
  observationFromNative,
  poseVisionFactory,
  publishDetectorState,
  publishNativePose,
  resetPoseVision,
} from './poseVisionBridge';

/** Build a native payload with every landmark at a known, distinct value. */
function payload(
  overrides: Partial<{ image: number[]; world: number[]; width: number; height: number; t: number; latencyMs: number }> = {},
) {
  const image: number[] = [];
  const world: number[] = [];
  for (let i = 0; i < LANDMARK_COUNT; i++) {
    image.push(0.1 + i / 1000, 0.2 + i / 1000, 0.3 + i / 1000, 0.9);
    world.push(0.4 + i / 1000, 0.5 + i / 1000, 0.6 + i / 1000, 0.8);
  }
  return { image, world, width: 720, height: 1280, t: 1234, latencyMs: 9, ...overrides };
}

describe('native detection → the app’s observation', () => {
  it('reads every landmark across both spaces', () => {
    const obs = observationFromNative(payload(), 1234);
    expect(obs).not.toBeNull();
    expect(obs!.image).toHaveLength(LANDMARK_COUNT);
    expect(obs!.world).toHaveLength(LANDMARK_COUNT);
    expect(obs!.frame).toEqual({ width: 720, height: 1280 });
    expect(obs!.t).toBe(1234);
  });

  /**
   * The one conversion in this file, and the one that is invisible when it is
   * wrong: a sign error does not crash, it quietly builds a body facing the
   * wrong way. MediaPipe reports both spaces y-down with z growing away from
   * the lens; the app has y up and z toward the viewer in metres.
   */
  it('flips the axes exactly once, and only where it should', () => {
    const obs = observationFromNative(payload())!;
    // image space keeps y as it came and flips only z
    expect(obs.image[0]!.x).toBeCloseTo(0.1);
    expect(obs.image[0]!.y).toBeCloseTo(0.2);
    expect(obs.image[0]!.z).toBeCloseTo(-0.3);
    // metric space flips y and z
    expect(obs.world![0]!.x).toBeCloseTo(0.4);
    expect(obs.world![0]!.y).toBeCloseTo(-0.5);
    expect(obs.world![0]!.z).toBeCloseTo(-0.6);
  });

  it('keeps visibility, which the tracker gates every joint on', () => {
    const obs = observationFromNative(payload())!;
    expect(obs.image[LM.leftKnee]!.v).toBeCloseTo(0.9);
    expect(obs.world![LM.leftKnee]!.v).toBeCloseTo(0.8);
  });

  it('indexes landmarks positionally, so named joints land where they should', () => {
    const obs = observationFromNative(payload())!;
    expect(obs.image[LM.nose]!.x).toBeCloseTo(0.1);
    expect(obs.image[LM.rightAnkle]!.x).toBeCloseTo(0.1 + LM.rightAnkle / 1000);
  });

  describe('a payload that is not what it claims is no pose, never a wrong one', () => {
    it('rejects a short image array', () => {
      expect(observationFromNative(payload({ image: [1, 2, 3] }))).toBeNull();
    });

    it('rejects a short world array', () => {
      expect(observationFromNative(payload({ world: [] }))).toBeNull();
    });

    it('rejects a frame with no size', () => {
      expect(observationFromNative(payload({ width: 0 }))).toBeNull();
      expect(observationFromNative(payload({ height: -1 }))).toBeNull();
    });

    it('rejects NaN anywhere in either space', () => {
      const bad = payload();
      bad.image[7] = Number.NaN;
      expect(observationFromNative(bad)).toBeNull();

      const alsoBad = payload();
      alsoBad.world[80] = Number.POSITIVE_INFINITY;
      expect(observationFromNative(alsoBad)).toBeNull();
    });

    it('falls back to arrival time when the frame carries no stamp', () => {
      const obs = observationFromNative(payload({ t: Number.NaN }))!;
      expect(Number.isFinite(obs.t)).toBe(true);
    });
  });
});

/**
 * The tracker is updated with each frame's time and sampled with Date.now().
 * A frame stamped on a different clock — a camera sensor counting from boot —
 * makes every joint look hours stale, the tracker drops them all, and the
 * figure silently never appears. These pin the one place that is prevented.
 */
describe('frame time lands on the clock the tracker samples by', () => {
  const NOW = 1_780_000_000_000; // a wall-clock millisecond in 2026

  it('keeps a stamp that is already on this clock', () => {
    expect(frameTime({ t: NOW - 40, latencyMs: 40 }, NOW)).toBe(NOW - 40);
  });

  it('replaces a stamp from the sensor clock with now less the detector latency', () => {
    const uptimeStamp = 93_000_000; // ~26 hours since boot
    expect(frameTime({ t: uptimeStamp, latencyMs: 35 }, NOW)).toBe(NOW - 35);
  });

  it('does not trust a stamp from the future either', () => {
    expect(frameTime({ t: NOW + MAX_CLOCK_SKEW_MS + 1, latencyMs: 20 }, NOW)).toBe(NOW - 20);
  });

  it('never lets a nonsense latency push the frame far into the past', () => {
    expect(frameTime({ t: Number.NaN, latencyMs: 9e9 }, NOW)).toBe(NOW - MAX_CLOCK_SKEW_MS);
    expect(frameTime({ t: Number.NaN, latencyMs: -5 }, NOW)).toBe(NOW);
  });

  it('is applied to every observation built from the native payload', () => {
    const obs = observationFromNative(payload({ t: 93_000_000, latencyMs: 30 }), NOW)!;
    expect(obs.t).toBe(NOW - 30);
  });
});

describe('the detector a source starts', () => {
  afterEach(() => resetPoseVision());

  it('subscribes once however many times it is started', async () => {
    const detector = poseVisionFactory.create()!;
    const before = listenerCount();
    const seen: number[] = [];
    await detector.start((o) => seen.push(o.t));
    await detector.start((o) => seen.push(o.t));
    expect(listenerCount()).toBe(before + 1);

    publishNativePose(payload({ t: Date.now() }));
    expect(seen).toHaveLength(1);

    await detector.stop();
    expect(listenerCount()).toBe(before);
  });

  it('hears nothing after it is stopped', async () => {
    const detector = poseVisionFactory.create()!;
    const seen: unknown[] = [];
    await detector.start((o) => seen.push(o));
    await detector.stop();
    publishNativePose(payload({ t: Date.now() }));
    expect(seen).toHaveLength(0);
  });

  it('is told when the detector cannot run, rather than searching forever', async () => {
    const detector = poseVisionFactory.create()!;
    const failures: string[] = [];
    await detector.start(() => {}, (r) => failures.push(r));
    publishDetectorState('unavailable', 'GPU: no; CPU: model missing');
    expect(failures).toEqual(['GPU: no; CPU: model missing']);
    // the same failure is not repeated on every status update
    publishDetectorState('unavailable', 'GPU: no; CPU: model missing');
    expect(failures).toHaveLength(1);
    await detector.stop();
  });

  it('learns of a failure that happened before it started listening', async () => {
    publishDetectorState('unavailable', 'no model');
    const detector = poseVisionFactory.create()!;
    const failures: string[] = [];
    await detector.start(() => {}, (r) => failures.push(r));
    expect(failures).toEqual(['no model']);
    await detector.stop();
  });

  it('forgets a failure once the detector reports ready again', async () => {
    publishDetectorState('unavailable', 'no model');
    publishDetectorState('ready', 'CPU');
    const detector = poseVisionFactory.create()!;
    const failures: string[] = [];
    await detector.start(() => {}, (r) => failures.push(r));
    expect(failures).toEqual([]);
    await detector.stop();
  });
});
