/**
 * Sensor fusion (§2.6): the camera/sim pose draws the body; Rig angles are
 * authoritative for any joint a node covers. Stale sensor data is dropped —
 * a sleeping Rig must never freeze a red segment on screen.
 */
import type { JointMetrics, SensorFrame } from './types';

export type DataSourceLabel = 'sim' | 'pose' | 'rig' | 'rig+pose';

const SENSOR_STALE_MS = 700;

export class MetricFusion {
  private lastSensor: SensorFrame | null = null;
  /** calibration zero offsets per node id (PASS 4 fills via the wizard) */
  private zeroOffsets = new Map<string, number>();

  updateSensor(frame: SensorFrame): void {
    // keep only the newest by timestamp — UDP may arrive out of order
    if (this.lastSensor === null || frame.t >= this.lastSensor.t) {
      this.lastSensor = frame;
    }
  }

  calibrate(nodeId: string, offsetDeg: number): void {
    this.zeroOffsets.set(nodeId, offsetDeg);
  }
  clearCalibration(): void {
    this.zeroOffsets.clear();
  }

  sensorFresh(now: number): boolean {
    return this.lastSensor !== null && now - this.lastSensor.t <= SENSOR_STALE_MS;
  }

  /** true when the fresh sensor frame carries the firmware's alert flag */
  rigAlert(now: number): boolean {
    return this.sensorFresh(now) && this.lastSensor?.flags.alert === true;
  }

  rigBattery(): number | null {
    return this.lastSensor?.battery ?? null;
  }

  /**
   * Overlay Rig angles onto pose-derived metrics.
   * Today's mapping: node "spine" → spineFlex (the firmware's one signal).
   * The label is honest: only a REAL rig may claim "rig".
   */
  fuse(
    poseMetrics: Omit<JointMetrics, 't'>,
    now: number,
    poseIsSim: boolean,
    sensorIsSim = true,
  ): { metrics: Omit<JointMetrics, 't'>; source: DataSourceLabel } {
    const fresh = this.sensorFresh(now);
    if (!fresh) {
      return { metrics: poseMetrics, source: poseIsSim ? 'sim' : 'pose' };
    }
    const metrics = { ...poseMetrics };
    for (const node of this.lastSensor!.nodes) {
      if (node.angleDeg === undefined) continue;
      const zeroed = node.angleDeg - (this.zeroOffsets.get(node.id) ?? 0);
      if (node.id === 'spine') {
        metrics.spineFlex = zeroed;
      }
      // future nodes (knee/hip/…) map here as firmware grows into v1
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
  }
}
