import { RigCalibration } from '@/src/engine/rigBody';
import type { ExerciseSpec } from '@/src/engine/types';
import { useConnectionStore } from '@/src/store/connectionStore';

import { CameraPoseSource } from './camera/CameraPoseSource';
import { SimPoseSource } from './sim/SimPoseSource';
import { SimSensorSource } from './sim/SimSensorSource';
import { SimTimeline, defaultFaultScript, type FaultScript } from './sim/simTimeline';
import { RigPoseSource } from './udp/RigPoseSource';
import { rigLink, storedCalibration } from './udp/rigLink';
import type { PoseSource, SensorSource } from './types';

/**
 * Chooses the set's instrument in exactly one place (§2.6): the linked Rig
 * first — five IMUs place the whole body — then the camera. If neither can
 * measure, there is no set. Nothing is substituted for a missing sensor.
 */
export interface SourceBundle {
  pose: PoseSource;
  sensor: SensorSource | null;
  /** false when the sensor is the app-shared Rig link — the set must not stop it */
  ownsSensor: boolean;
  /** neutral-stance reference for the Rig's IMUs (§2.9 calibration) */
  calibration: RigCalibration;
  /** true when the body being drawn is the user's, not the simulator's */
  poseIsReal: boolean;
  /** what is actually drawing the Mesh, for the HUD status strip */
  poseOrigin: 'sim' | 'camera' | 'rig';
  /** rebase the sim timeline so the set starts at rep zero */
  startSet(): void;
  dispose(): void;
}

/**
 * Is there anything that can actually measure a set right now?
 *
 * A shipped build answers this with hardware only. The simulator exists for
 * tests and for development builds; it is not a product feature, and a user
 * is never offered a pretend workout.
 */
export function hasLiveSource(camGranted: boolean): boolean {
  if (useConnectionStore.getState().mode === 'linked' && rigLink.active) return true;
  if (camGranted && CameraPoseSource.available()) return true;
  return __DEV__;
}

export function createSetSources(
  ex: ExerciseSpec,
  opts: {
    camGranted: boolean;
  },
): SourceBundle | null {
  // A linked Rig is the primary instrument: five IMUs place the whole body,
  // so it both grades and draws.
  const rigLive = useConnectionStore.getState().mode === 'linked' ? rigLink.active : null;
  const calibration = rigLive ? storedCalibration() : new RigCalibration();
  const cameraViable = opts.camGranted && CameraPoseSource.available();

  // The simulator is a development instrument. `__DEV__` is false in the APK a
  // tester installs, so none of this exists in their build.
  const simEnabled = __DEV__;
  const timeline = simEnabled ? new SimTimeline(ex, { t0: Date.now(), fault: defaultFaultScript(ex) }) : null;
  const simPose = timeline ? new SimPoseSource(timeline) : null;
  const simSensor = timeline ? new SimSensorSource(timeline) : null;

  let pose: PoseSource;
  let poseOrigin: SourceBundle['poseOrigin'];
  let rigPose: RigPoseSource | null = null;

  if (rigLive) {
    // The exoskeleton draws its own body. Nothing stands in for it when it
    // goes quiet — the live screen reports the loss instead of animating a
    // body that is not being measured.
    rigPose = new RigPoseSource(rigLive, calibration);
    pose = rigPose;
    poseOrigin = 'rig';
  } else if (cameraViable) {
    pose = new CameraPoseSource({ hasCameraPermission: opts.camGranted });
    poseOrigin = 'camera';
  } else if (simPose) {
    pose = simPose;
    poseOrigin = 'sim';
  } else {
    // no instrument, no set
    return null;
  }

  const sensor: SensorSource | null = rigLive ?? (cameraViable ? null : simSensor);
  const ownsSensor = rigLive === null;

  return {
    pose,
    sensor,
    ownsSensor,
    calibration,
    poseIsReal: rigLive !== null || cameraViable,
    poseOrigin,
    startSet() {
      // rep zero starts a beat after the live screen mounts
      timeline?.rebase(Date.now() + 400);
    },
    dispose() {
      pose.stop();
      rigPose?.stop();
      simPose?.stop();
      simSensor?.stop();
      // the shared Rig link outlives the set on purpose
    },
  };
}
