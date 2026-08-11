import { EXERCISES } from '@/src/data/exercises';
import { useConnectionStore } from '@/src/store/connectionStore';

import { CameraPoseSource } from './camera/CameraPoseSource';
import { createSetSources, hasLiveSource } from './provider';
import { rigLink } from './udp/rigLink';

/**
 * The promise the whole product rests on: Synapse grades what its sensors can
 * actually see. In a shipped build there is no simulator to fall back on, so a
 * set with no instrument must refuse to start rather than animate a plausible
 * body. These tests run with `__DEV__` forced false — the value a tester's APK
 * is compiled with.
 */

const squat = EXERCISES[0]!;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

describe('source selection in a release build', () => {
  let devWas: boolean;

  beforeEach(() => {
    devWas = g.__DEV__;
    g.__DEV__ = false;
    useConnectionStore.setState({ mode: 'offline' });
    jest.spyOn(CameraPoseSource, 'available').mockReturnValue(false);
    jest.spyOn(rigLink, 'active', 'get').mockReturnValue(null);
  });

  afterEach(() => {
    g.__DEV__ = devWas;
    jest.restoreAllMocks();
  });

  it('reports nothing to measure with when neither Rig nor camera is there', () => {
    expect(hasLiveSource(false)).toBe(false);
    expect(createSetSources(squat, { camGranted: false })).toBeNull();
  });

  it('refuses even with camera permission granted but no detector behind it', () => {
    // permission is not capability — a granted camera with no pose landmarker
    // cannot place a body, and pretending otherwise is the exact failure mode
    // this test exists to prevent
    expect(hasLiveSource(true)).toBe(false);
    expect(createSetSources(squat, { camGranted: true })).toBeNull();
  });

  it('refuses when the app thinks it is linked but the socket is gone', () => {
    useConnectionStore.setState({ mode: 'linked' });
    expect(hasLiveSource(false)).toBe(false);
    expect(createSetSources(squat, { camGranted: false })).toBeNull();
  });

  it('draws from the camera when a real detector is present', () => {
    (CameraPoseSource.available as jest.Mock).mockReturnValue(true);
    const bundle = createSetSources(squat, { camGranted: true });
    expect(bundle).not.toBeNull();
    expect(bundle!.poseOrigin).toBe('camera');
    expect(bundle!.poseIsReal).toBe(true);
    // no sensor stands in for the Rig — the camera grades what it can and the
    // rest reports NO DATA
    expect(bundle!.sensor).toBeNull();
    bundle!.dispose();
  });

  it('never produces a simulated body, whatever the inputs', () => {
    for (const camGranted of [false, true]) {
      for (const mode of ['offline', 'searching', 'linked'] as const) {
        useConnectionStore.setState({ mode });
        const bundle = createSetSources(squat, { camGranted });
        expect(bundle?.poseOrigin).not.toBe('sim');
        bundle?.dispose();
      }
    }
  });
});
