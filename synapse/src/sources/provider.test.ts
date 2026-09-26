import { EXERCISES } from '@/src/data/exercises';
import { useConnectionStore } from '@/src/store/connectionStore';

import { CameraPoseSource } from './camera/CameraPoseSource';
import { canStartSet, createSetSources } from './provider';
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

  it('refuses a set with no Rig linked', () => {
    expect(canStartSet()).toBe(false);
    expect(createSetSources(squat, { camGranted: false })).toBeNull();
  });

  it('refuses a camera-only set, even with a working detector', () => {
    // the Rig comes first: the camera only shows, it never grades a set alone
    (CameraPoseSource.available as jest.Mock).mockReturnValue(true);
    expect(canStartSet()).toBe(false);
    expect(createSetSources(squat, { camGranted: true })).toBeNull();
  });

  it('refuses when the app thinks it is linked but the socket is gone', () => {
    useConnectionStore.setState({ mode: 'linked' });
    expect(canStartSet()).toBe(false);
    expect(createSetSources(squat, { camGranted: false })).toBeNull();
  });

  it('grades from the Rig and draws its own figure when there is no camera', () => {
    useConnectionStore.setState({ mode: 'linked' });
    const fakeRig = { onFrame: () => () => {}, onStatus: () => () => {}, status: 'active' };
    (jest.spyOn(rigLink, 'active', 'get') as jest.SpyInstance).mockReturnValue(fakeRig);

    expect(canStartSet()).toBe(true);
    const bundle = createSetSources(squat, { camGranted: false });
    expect(bundle!.poseOrigin).toBe('rig');
    expect(bundle!.sensor).toBe(fakeRig);
    expect(bundle!.camera).toBeNull();
    bundle!.dispose();
  });

  it('runs the camera beside a linked Rig, to show the body, not to grade it', () => {
    (CameraPoseSource.available as jest.Mock).mockReturnValue(true);
    useConnectionStore.setState({ mode: 'linked' });
    const fakeRig = { onFrame: () => () => {}, onStatus: () => () => {}, status: 'active' };
    (jest.spyOn(rigLink, 'active', 'get') as jest.SpyInstance).mockReturnValue(fakeRig);

    const bundle = createSetSources(squat, { camGranted: true });
    expect(bundle!.poseOrigin).toBe('rig');
    // the camera places the exoskeleton on the picture; the Rig stays the pose
    // source the engine grades from
    expect(bundle!.camera).not.toBeNull();
    expect(bundle!.camera).not.toBe(bundle!.pose);
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
