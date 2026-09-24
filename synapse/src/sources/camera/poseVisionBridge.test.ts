import { LANDMARK_COUNT, LM } from '@/src/engine/types';

import { observationFromNative } from './poseVisionBridge';

/** Build a native payload with every landmark at a known, distinct value. */
function payload(
  overrides: Partial<{ image: number[]; world: number[]; width: number; height: number; t: number }> = {},
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
    const obs = observationFromNative(payload());
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
