import { RigCalibration } from '@/src/engine/rigBody';
import type { ExerciseSpec } from '@/src/engine/types';
import { useConnectionStore } from '@/src/store/connectionStore';

import { CameraPoseSource } from './camera/CameraPoseSource';
import { rigLink, storedCalibration } from './udp/rigLink';
import type { PoseSource, SensorSource } from './types';

/**
 * Chooses the set's instruments, in exactly one place (§2.6).
 *
 * The app works one way. The camera films the lifter; MediaPipe finds their
 * pose; the 3D mannequin is tracked onto their own picture; the set is
 * graded from that pose. The Rig is optional: when it is linked its five IMUs
 * are fused into the grading and handed to the technique evaluator, and the
 * body on screen is still the one the camera placed.
 *
 * Nothing stands in for a missing instrument. With no camera that can
 * measure there is no set, and the simulator never drives one in any build —
 * a body moved by a script is exactly the fake this app exists not to show.
 * It lives on in the tests.
 */
export interface SourceBundle {
  /** what draws the body and drives the engine: the camera */
  pose: PoseSource;
  /** the camera's pose source — the same object as `pose` */
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
  /** a Rig was linked when the set began, and its sensors join the grading */
  rigLinked: boolean;
  /** called as the live set begins */
  startSet(): void;
  dispose(): void;
}

/**
 * Can a set start right now? When the camera can measure. The Rig is
 * optional: linked, it adds its sensors to the grading; not linked, the
 * camera grades on its own.
 */
export function canStartSet(camGranted: boolean): boolean {
  return camGranted && CameraPoseSource.available();
}

function rigIsLinked(): boolean {
  return useConnectionStore.getState().mode === 'linked' && rigLink.active !== null;
}

/**
 * One way a set runs: the camera films the lifter, the 3D mannequin is
 * tracked onto their picture, and the set is graded from that pose — plus
 * the Rig's sensors whenever a Rig is linked. There is no other mode.
 */
export function createSetSources(
  ex: ExerciseSpec,
  opts: {
    camGranted: boolean;
  },
): SourceBundle | null {
  void ex;
  // no camera that can measure, no set: the body on screen is always the
  // lifter's own, placed on their picture
  if (!canStartSet(opts.camGranted)) return null;

  const rigLive = rigIsLinked() ? rigLink.active : null;
  const calibration = rigLive ? storedCalibration() : new RigCalibration();
  const camera = new CameraPoseSource({ hasCameraPermission: opts.camGranted });

  return {
    pose: camera,
    camera,
    // the Rig, when linked, is fused into the grading; it is shared app-wide
    // and outlives the set, so the set never stops it
    sensor: rigLive,
    ownsSensor: false,
    calibration,
    poseIsReal: true,
    poseOrigin: 'camera',
    rigLinked: rigLive !== null,
    startSet() {
      // the engine starts the camera source itself
    },
    dispose() {
      camera.stop();
      // the shared Rig link outlives the set on purpose
    },
  };
}
