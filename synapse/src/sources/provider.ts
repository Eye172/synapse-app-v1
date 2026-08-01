import { RigCalibration } from '@/src/engine/rigBody';
import type { ExerciseSpec, PoseFrame } from '@/src/engine/types';
import { useConnectionStore } from '@/src/store/connectionStore';

import { CameraPoseSource } from './camera/CameraPoseSource';
import { SimPoseSource } from './sim/SimPoseSource';
import { SimSensorSource } from './sim/SimSensorSource';
import { SimTimeline, defaultFaultScript, type FaultScript } from './sim/simTimeline';
import { RigPoseSource } from './udp/RigPoseSource';
import { rigLink, storedCalibration } from './udp/rigLink';
import { Emitter, type PoseSource, type SensorSource, type SourceStatus, type Unsubscribe } from './types';

/**
 * Chooses the set's sources in exactly one place (§2.6, §2.10):
 *   camera pose when it is truly available, simulator otherwise,
 *   sim Rig until the real UDP link lands (PASS 4 swaps it in when LINKED).
 * The UI never knows which one it got — that is the whole point.
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
 * Wraps the camera source and drops to an internal simulator if the camera
 * path reports unavailable or never produces a frame — the user always sees
 * a live Mesh, and Demo Mode can never break (deal-breaker 3).
 */
export class FallbackPoseSource implements PoseSource {
  status: SourceStatus = 'idle';
  private inner: PoseSource;
  private sim: SimPoseSource;
  private usingSim = false;
  private poses = new Emitter<PoseFrame>();
  private statuses = new Emitter<SourceStatus>();
  private subs: Unsubscribe[] = [];
  private firstFrameTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(camera: PoseSource, sim: SimPoseSource) {
    this.inner = camera;
    this.sim = sim;
  }

  get kind(): 'sim' | 'camera' {
    return this.usingSim ? 'sim' : 'camera';
  }

  start(): void {
    this.subs.push(
      this.inner.onPose((f) => {
        if (this.firstFrameTimer) {
          clearTimeout(this.firstFrameTimer);
          this.firstFrameTimer = null;
        }
        if (!this.usingSim) this.poses.emit(f);
      }),
      this.inner.onStatus((s) => {
        if (s === 'unavailable') this.fallback();
        else if (!this.usingSim) this.setStatus(s);
      }),
      this.sim.onPose((f) => {
        if (this.usingSim) this.poses.emit(f);
      }),
    );
    this.setStatus('searching');
    this.inner.start();
    // no first frame in time → the detector is not real; go sim
    this.firstFrameTimer = setTimeout(() => this.fallback(), 2500);
  }

  private fallback(): void {
    if (this.usingSim) return;
    this.usingSim = true;
    if (this.firstFrameTimer) {
      clearTimeout(this.firstFrameTimer);
      this.firstFrameTimer = null;
    }
    this.inner.stop();
    this.sim.start();
    this.setStatus('active');
  }

  stop(): void {
    if (this.firstFrameTimer) clearTimeout(this.firstFrameTimer);
    this.firstFrameTimer = null;
    for (const u of this.subs) u();
    this.subs = [];
    this.inner.stop();
    this.sim.stop();
    this.setStatus('idle');
  }

  onPose(cb: (f: PoseFrame) => void): Unsubscribe {
    return this.poses.on(cb);
  }
  onStatus(cb: (s: SourceStatus) => void): Unsubscribe {
    return this.statuses.on(cb);
  }
  private setStatus(s: SourceStatus): void {
    this.status = s;
    this.statuses.emit(s);
  }
}

export function createSetSources(
  ex: ExerciseSpec,
  opts: {
    camGranted: boolean;
    demoFault: boolean;
    forceDemo: boolean;
  },
): SourceBundle {
  const fault: FaultScript = opts.demoFault
    ? defaultFaultScript(ex)
    : { kind: 'none', reps: [], intensity: 0 };
  const timeline = new SimTimeline(ex, { t0: Date.now(), fault });
  const simPose = new SimPoseSource(timeline);
  const simSensor = new SimSensorSource(timeline);

  // A linked Rig is the primary instrument: five IMUs place the whole body,
  // so it both grades and draws. The sim Rig may only accompany the sim body —
  // scripted angles under a real person would fabricate their metrics
  // (deal-breaker 2).
  const rigLive = !opts.forceDemo && useConnectionStore.getState().mode === 'linked' ? rigLink.active : null;
  const calibration = rigLive ? storedCalibration() : new RigCalibration();

  const cameraViable = !opts.forceDemo && opts.camGranted && CameraPoseSource.available();

  let pose: PoseSource;
  let poseOrigin: SourceBundle['poseOrigin'];
  let rigPose: RigPoseSource | null = null;
  if (rigLive) {
    // the exoskeleton draws its own body; the simulator stands by if it stalls
    rigPose = new RigPoseSource(rigLive, calibration);
    pose = new FallbackPoseSource(rigPose, simPose);
    poseOrigin = 'rig';
  } else if (cameraViable) {
    pose = new FallbackPoseSource(new CameraPoseSource({ hasCameraPermission: opts.camGranted }), simPose);
    poseOrigin = 'camera';
  } else {
    pose = simPose;
    poseOrigin = 'sim';
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
      timeline.rebase(Date.now() + 400);
    },
    dispose() {
      pose.stop();
      rigPose?.stop();
      simPose.stop();
      simSensor.stop();
      // the shared Rig link outlives the set on purpose
    },
  };
}
