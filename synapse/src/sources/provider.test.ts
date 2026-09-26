import { EXERCISES } from '@/src/data/exercises';
import { useConnectionStore } from '@/src/store/connectionStore';

import { CameraPoseSource } from './camera/CameraPoseSource';
import { canStartSet, createSetSources } from './provider';
import { rigLink } from './udp/rigLink';
import type { UdpSensorSource } from './udp/UdpSensorSource';

/**
 * The app works one way: the camera measures the lifter and the 3D body is
 * placed on their picture; the Rig is optional and joins the grading when
 * linked. And the promise the product rests on: nothing stands in for a
 * missing instrument — no camera, no set, and never a simulated body.
 */

const squat = EXERCISES[0]!;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

describe.each([
  ['a release build', false],
  ['a development build', true],
])('source selection in %s', (_name, dev) => {
  let devWas: boolean;

  beforeEach(() => {
    devWas = g.__DEV__;
    g.__DEV__ = dev;
    useConnectionStore.setState({ mode: 'offline' });
    jest.spyOn(CameraPoseSource, 'available').mockReturnValue(true);
    jest.spyOn(rigLink, 'active', 'get').mockReturnValue(null);
  });

  afterEach(() => {
    g.__DEV__ = devWas;
    jest.restoreAllMocks();
  });

  it('measures the set from the camera, with no Rig needed', () => {
    expect(canStartSet(true)).toBe(true);
    const s = createSetSources(squat, { camGranted: true })!;
    expect(s.poseOrigin).toBe('camera');
    expect(s.pose).toBeInstanceOf(CameraPoseSource);
    expect(s.camera).toBe(s.pose);
    expect(s.poseIsReal).toBe(true);
    expect(s.rigLinked).toBe(false);
    expect(s.sensor).toBeNull();
    s.dispose();
  });

  it('starts no set without camera permission — and never simulates one', () => {
    expect(canStartSet(false)).toBe(false);
    expect(createSetSources(squat, { camGranted: false })).toBeNull();
  });

  it('starts no set on a build with no detector', () => {
    (CameraPoseSource.available as jest.Mock).mockReturnValue(false);
    expect(canStartSet(true)).toBe(false);
    expect(createSetSources(squat, { camGranted: true })).toBeNull();
  });

  it('adds a linked Rig to the grading, and still draws from the camera', () => {
    const rig = { kind: 'udp' } as unknown as UdpSensorSource;
    (jest.spyOn(rigLink, 'active', 'get') as jest.SpyInstance).mockReturnValue(rig);
    useConnectionStore.setState({ mode: 'linked' });

    const s = createSetSources(squat, { camGranted: true })!;
    expect(s.poseOrigin).toBe('camera');
    expect(s.sensor).toBe(rig);
    expect(s.rigLinked).toBe(true);
    // the Rig link is app-wide and outlives the set
    expect(s.ownsSensor).toBe(false);
    s.dispose();
  });

  it('never produces a simulated body, whatever the inputs', () => {
    for (const camGranted of [true, false]) {
      for (const available of [true, false]) {
        (CameraPoseSource.available as jest.Mock).mockReturnValue(available);
        const s = createSetSources(squat, { camGranted });
        expect(s?.poseOrigin ?? 'none').not.toBe('sim');
        s?.dispose();
      }
    }
  });
});
