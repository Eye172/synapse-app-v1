/**
 * Sensor fusion (§2.6). Two instruments see different things well, so the
 * merge is decided per metric rather than per source:
 *
 *   Rig wins    trunk orientation and any angle spanning two IMUs
 *               (spine, lean, hip, shoulder, left/right symmetry) — a
 *               body-mounted gyro beats inferring depth from a 2D image
 *   Camera wins geometry the Rig has no sensor for (knee/elbow flexion, bar
 *               path, depth) and true knee-vs-ankle valgus, which needs to
 *               see where the joint actually is in space
 *
 * Whatever neither can measure stays null, and the grader reports NO DATA.
 */
import type { RigMetrics } from './rigBody';
import type { JointMetrics, SensorFrame } from './types';

export type DataSourceLabel = 'sim' | 'pose' | 'rig' | 'rig+pose';

const SENSOR_STALE_MS = 700;

/**
 * Metrics the Rig measures directly; it overrides the camera on these.
 *
 * `spineFlex` is deliberately absent. One IMU on the back measures how far the
 * trunk is *inclined*, which a correct deadlift does on purpose — it cannot
 * tell a rounded spine from a flat hinge without a second sensor on the
 * pelvis. Spinal rounding stays a camera measurement; the firmware's own
 * per-node alert still raises a safety stop on its own authority.
 */
const RIG_PREFERRED = ['torsoLean', 'hipAngle', 'shoulderElev', 'symmetry'] as const;

export class MetricFusion {
  private lastSensor: SensorFrame | null = null;
  private lastRig: RigMetrics | null = null;

  updateSensor(frame: SensorFrame, rig?: RigMetrics | null): void {
    // keep only the newest by timestamp — UDP may arrive out of order
    if (this.lastSensor === null || frame.t >= this.lastSensor.t) {
      this.lastSensor = frame;
      this.lastRig = rig ?? null;
    }
  }

  sensorFresh(now: number): boolean {
    return this.lastSensor !== null && now - this.lastSensor.t <= SENSOR_STALE_MS;
  }

  /** true when the fresh frame carries a fault flag from any node */
  rigAlert(now: number): boolean {
    return this.sensorFresh(now) && this.lastSensor?.flags.alert === true;
  }

  /** which rig nodes raised the flag, for cueing the right body part */
  alertingNodes(now: number): string[] {
    if (!this.sensorFresh(now) || !this.lastSensor) return [];
    return this.lastSensor.nodes.filter((n) => n.alert === true).map((n) => n.id);
  }

  rigBattery(): number | null {
    return this.lastSensor?.battery ?? null;
  }

  /**
   * Overlay Rig measurements onto pose-derived metrics.
   * The label is honest: only a real rig may claim "rig".
   */
  fuse(
    poseMetrics: Omit<JointMetrics, 't'>,
    now: number,
    poseIsSim: boolean,
    sensorIsSim = true,
  ): { metrics: Omit<JointMetrics, 't'>; source: DataSourceLabel } {
    if (!this.sensorFresh(now)) {
      return { metrics: poseMetrics, source: poseIsSim ? 'sim' : 'pose' };
    }

    const metrics = { ...poseMetrics };
    const rig = this.lastRig;

    if (rig) {
      for (const key of RIG_PREFERRED) {
        const v = rig[key];
        if (v !== null && v !== undefined) metrics[key] = v;
      }
      // valgus: the camera sees the true knee-over-ankle relationship, so it
      // wins when present; the Rig's thigh deviation stands in otherwise.
      if (metrics.kneeValgus === null && rig.kneeValgus !== null) {
        metrics.kneeValgus = rig.kneeValgus;
      }
    } else {
      // legacy v0/v1 single-angle firmware: one scalar spine pitch
      const back = this.lastSensor!.nodes.find((n) => n.id === 'back');
      if (back?.angleDeg !== undefined) metrics.spineFlex = back.angleDeg;
    }

    const source: DataSourceLabel = sensorIsSim
      ? poseIsSim
        ? 'sim'
        : 'pose'
      : poseIsSim
        ? 'rig'
        : 'rig+pose';
    return { metrics, source };
  }

  reset(): void {
    this.lastSensor = null;
    this.lastRig = null;
  }
}
