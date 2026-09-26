import { RigCalibration } from '@/src/engine/rigBody';
import type { ExerciseSpec } from '@/src/engine/types';
import { useConnectionStore } from '@/src/store/connectionStore';
import { useSettingsStore } from '@/src/store/settingsStore';

import { CameraPoseSource } from './camera/CameraPoseSource';
import { RigPoseSource } from './udp/RigPoseSource';
import { rigLink, storedCalibration } from './udp/rigLink';
import type { PoseSource, SensorSource } from './types';

/**
 * Chooses the set's instrument in exactly one place (§2.6).
 *
 * The Rig is the instrument: connect it first, then train. Its five IMUs are
 * what the set is graded from. The camera is optional and only shows — it
 * places the exoskeleton over the lifter's picture so the fault is visible on
 * their body — and never grades. With no linked Rig there is no set, except
 * in developer mode, where the camera measures the set on its own.
 *
 * The simulator never drives a set, in any build: a body moved by a script
 * is exactly the plausible-looking fake this app exists not to show. It
 * lives on in the tests.
 */
export interface SourceBundle {
  /** what draws the body and drives the engine */
  pose: PoseSource;
  /**
   * The camera's detector for this set. Beside a linked Rig it only places
   * the exoskeleton on the lifter's picture — to show where the fault is —
   * and never feeds grading: that comes from the Rig alone. Null when there
   * is no camera or no detector.
   */
  camera: PoseSource | null;
  sensor: SensorSource | null;
  /** false when the sensor is the app-shared Rig link — the set must not stop it */
  ownsSensor: boolean;
  /** neutral-stance reference for the Rig's IMUs (§2.9 calibration) */
  calibration: RigCalibration;
  /** true when the body being drawn is the user's, not the simulator's */
  poseIsReal: boolean;
  /** what is actually drawing the Mesh, for the HUD status strip */
  poseOrigin: 'sim' | 'camera' | 'rig';
  /** called as the live set begins: starts a camera running beside the Rig */
  startSet(): void;
  dispose(): void;
}

/**
 * Developer mode: sets may start without the Rig. Always on in a development
 * build; in an installed APK it is the Profile → Developer switch.
 */
export function developerMode(): boolean {
  return __DEV__ || useSettingsStore.getState().devSkipRig;
}

/** Can a set start right now? With a linked Rig — or without one, in developer mode. */
export function canStartSet(): boolean {
  return rigIsLinked() || developerMode();
}

function rigIsLinked(): boolean {
  return useConnectionStore.getState().mode === 'linked' && rigLink.active !== null;
}

export function createSetSources(
  ex: ExerciseSpec,
  opts: {
    camGranted: boolean;
  },
): SourceBundle | null {
  // the linked Rig grades the set and, without a camera, draws the body
  const rigLive = rigIsLinked() ? rigLink.active : null;
  const calibration = rigLive ? storedCalibration() : new RigCalibration();
  const cameraViable = opts.camGranted && CameraPoseSource.available();

  let pose: PoseSource;
  let poseOrigin: SourceBundle['poseOrigin'];
  let rigPose: RigPoseSource | null = null;
  let camera: PoseSource | null = null;
  /** a camera that runs next to the Rig, owned (started and stopped) here */
  let companionCamera: CameraPoseSource | null = null;
  /** developer mode with no Rig: the camera measures and draws on its own */
  let cameraOnly = false;

  if (rigLive) {
    // The exoskeleton draws its own body. Nothing stands in for it when it
    // goes quiet — the live screen reports the loss instead of animating a
    // body that is not being measured.
    rigPose = new RigPoseSource(rigLive, calibration);
    pose = rigPose;
    poseOrigin = 'rig';
    if (cameraViable) {
      companionCamera = new CameraPoseSource({ hasCameraPermission: opts.camGranted });
      camera = companionCamera;
    }
  } else if (developerMode() && cameraViable) {
    // Developer mode, no Rig: the camera is the instrument. It tracks the
    // lifter, places the 3D figure on them, and the rule engine grades the
    // pose it measures — the camera path end to end, testable on a phone
    // with nothing strapped on.
    pose = new CameraPoseSource({ hasCameraPermission: opts.camGranted });
    camera = pose;
    poseOrigin = 'camera';
    cameraOnly = true;
  } else {
    // no instrument, no set
    return null;
  }

  const sensor: SensorSource | null = rigLive;
  const ownsSensor = rigLive === null;

  return {
    pose,
    camera,
    sensor,
    ownsSensor,
    calibration,
    poseIsReal: rigLive !== null || cameraOnly,
    poseOrigin,
    startSet() {
      // rep zero starts a beat after the live screen mounts
      // the engine starts `pose`; a camera beside the Rig is started here
      companionCamera?.start();
    },
    dispose() {
      pose.stop();
      rigPose?.stop();
      companionCamera?.stop();
      // the shared Rig link outlives the set on purpose
    },
  };
}
