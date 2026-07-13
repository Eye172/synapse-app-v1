/**
 * SetEngine — the headless heart of a live set. Subscribes to a PoseSource
 * (+ optional SensorSource), derives metrics, fuses, grades, counts reps,
 * and forwards breakpoints to the coach. The UI only ever renders what this
 * emits; it never computes a grade itself.
 */
import type { Coach, CoachCue } from '@/src/coach/types';
import type { PoseSource, SensorSource, Unsubscribe } from '@/src/sources/types';

import { MetricFusion, type DataSourceLabel } from './fusion';
import { MetricTracker, deriveMetrics } from './poseMetrics';
import { RepCounter, tempoAdherence, type RepTiming } from './repCounter';
import {
  AlertTracker,
  RepScopeTracker,
  gradeFrame,
  type FrameGrade,
  type RuleEval,
  type SafetyAlert,
} from './ruleEngine';
import type { ExerciseSpec, FormRule, JointMetrics, PoseFrame } from './types';

export interface RepRecord {
  index: number;
  timing: RepTiming;
  tempoScore: number | null;
  /** worst frame-rule severity seen during this rep, per rule id */
  frameWorst: Record<string, number>;
  /** rep-scope judgments (depth etc.) */
  repEvals: RuleEval[];
  clean: boolean;
  worstRule: FormRule | null;
}

export interface RuleSetResult {
  ruleId: string;
  name: string;
  /** worst severity across the set, 0..1 */
  worst: number;
  failedReps: number[];
  noData: boolean;
  fixCue: string;
  risk: FormRule['risk'];
}

export interface SetSummary {
  exerciseId: string;
  exerciseName: string;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  reps: number;
  cleanReps: number;
  techniqueScore: number;
  tempoAdherence: number | null;
  symmetryAvg: number | null;
  safetyAlerts: number;
  ruleResults: RuleSetResult[];
  dataSource: DataSourceLabel;
  repRecords: RepRecord[];
}

export interface EngineFrame {
  t: number;
  pose: PoseFrame;
  metrics: Omit<JointMetrics, 't'>;
  grade: FrameGrade;
  repCount: number;
  repPhase: string;
  source: DataSourceLabel;
}

export interface SetEngineEvents {
  onFrame?: (f: EngineFrame) => void;
  onRep?: (r: RepRecord) => void;
  /** alert raised (object) or cleared (null) */
  onAlert?: (a: SafetyAlert | null) => void;
  onCue?: (c: CoachCue) => void;
}

export class SetEngine {
  private tracker = new MetricTracker();
  private fusion = new MetricFusion();
  private alerts = new AlertTracker();
  private repScope = new RepScopeTracker();
  private counter: RepCounter;

  private subs: Unsubscribe[] = [];
  private running = false;
  private paused = false;

  private startedAt = 0;
  private endedAt = 0;
  private pausedTotalMs = 0;
  private pausedAt: number | null = null;

  private repRecords: RepRecord[] = [];
  private frameWorstThisRep = new Map<string, number>();
  private ruleWorst = new Map<string, number>();
  private ruleFailedReps = new Map<string, number[]>();
  private ruleSawData = new Set<string>();
  private symSum = 0;
  private symN = 0;
  private alertCount = 0;
  private lastAlertAt: number | null = null;
  private lastSource: DataSourceLabel = 'sim';

  constructor(
    private ex: ExerciseSpec,
    private io: {
      poseSource: PoseSource;
      sensorSource?: SensorSource | null;
      /** false when the sensor is app-shared (live Rig link) — the set must not stop it */
      ownsSensor?: boolean;
      /** per-node zero offsets from the calibration hold (§2.9) */
      calibration?: Record<string, number>;
      coach: Coach;
      events?: SetEngineEvents;
      now?: () => number;
    },
  ) {
    this.counter = new RepCounter(ex.rep);
    for (const [nodeId, offset] of Object.entries(io.calibration ?? {})) {
      this.fusion.calibrate(nodeId, offset);
    }
  }

  get exercise(): ExerciseSpec {
    return this.ex;
  }
  get isRunning(): boolean {
    return this.running;
  }
  get isPaused(): boolean {
    return this.paused;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.startedAt = this.now();
    this.io.coach.setStart(this.ex);
    this.subs.push(this.io.poseSource.onPose((p) => this.onPose(p)));
    if (this.io.sensorSource) {
      this.subs.push(this.io.sensorSource.onFrame((f) => this.fusion.updateSensor(f)));
      if (this.io.ownsSensor !== false) this.io.sensorSource.start();
    }
    this.io.poseSource.start();
  }

  pause(): void {
    if (!this.paused) {
      this.paused = true;
      this.pausedAt = this.now();
    }
  }

  resume(): void {
    if (this.paused) {
      this.paused = false;
      if (this.pausedAt !== null) this.pausedTotalMs += this.now() - this.pausedAt;
      this.pausedAt = null;
    }
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.endedAt = this.now();
    if (this.pausedAt !== null) {
      this.pausedTotalMs += this.endedAt - this.pausedAt;
      this.pausedAt = null;
    }
    for (const u of this.subs) u();
    this.subs = [];
    this.io.poseSource.stop();
    if (this.io.ownsSensor !== false) this.io.sensorSource?.stop();
  }

  private now(): number {
    return this.io.now ? this.io.now() : Date.now();
  }

  private onPose(pose: PoseFrame): void {
    if (!this.running || this.paused) return;
    const t = pose.t;

    const poseMetrics = deriveMetrics(pose.landmarks, t, this.tracker);
    const { metrics, source } = this.fusion.fuse(
      poseMetrics,
      t,
      pose.source === 'sim',
      (this.io.sensorSource?.kind ?? 'sim') === 'sim',
    );
    this.lastSource = source;

    const hadAlert = this.lastAlertAt !== null;
    const grade = gradeFrame(this.ex, t, metrics, this.alerts, this.fusion.rigAlert(t));

    // ---- set-level aggregation ----
    for (const e of grade.evals) {
      if (e.severity === null) continue;
      this.ruleSawData.add(e.rule.id);
      this.ruleWorst.set(e.rule.id, Math.max(this.ruleWorst.get(e.rule.id) ?? 0, e.severity));
      this.frameWorstThisRep.set(e.rule.id, Math.max(this.frameWorstThisRep.get(e.rule.id) ?? 0, e.severity));
    }
    if (metrics.symmetry !== null) {
      this.symSum += metrics.symmetry;
      this.symN += 1;
    }
    this.repScope.observe(metrics);

    // ---- alert transitions ----
    if (grade.alert && grade.alert.at !== this.lastAlertAt) {
      this.lastAlertAt = grade.alert.at;
      this.alertCount += 1;
      this.io.events?.onAlert?.(grade.alert);
      this.io.events?.onCue?.(this.io.coach.safetyAlert(grade.alert, t));
    } else if (!grade.alert && hadAlert) {
      this.lastAlertAt = null;
      this.io.events?.onAlert?.(null);
    }

    // ---- rep machine ----
    const primary = metrics[this.ex.rep.metric];
    const tick = this.counter.update(typeof primary === 'number' ? primary : null, t);
    if (tick.completed) {
      const rep = this.finishRep(tick.completed.index, tick.completed.timing);
      this.io.events?.onRep?.(rep);
      const cue = this.io.coach.repComplete(rep, t);
      if (cue) this.io.events?.onCue?.(cue);
    }

    // ---- live coaching (rate-limited inside the coach) ----
    if (!grade.alert) {
      const cue = this.io.coach.liveGrade(grade, t);
      if (cue) this.io.events?.onCue?.(cue);
    }

    this.io.events?.onFrame?.({
      t,
      pose,
      metrics,
      grade,
      repCount: tick.count,
      repPhase: tick.phase,
      source,
    });
  }

  private finishRep(index: number, timing: RepTiming): RepRecord {
    const repEvals = this.repScope.judge(this.ex);
    for (const e of repEvals) {
      if (e.severity === null) continue;
      this.ruleSawData.add(e.rule.id);
      this.ruleWorst.set(e.rule.id, Math.max(this.ruleWorst.get(e.rule.id) ?? 0, e.severity));
      if (e.severity >= 1) {
        const list = this.ruleFailedReps.get(e.rule.id) ?? [];
        list.push(index);
        this.ruleFailedReps.set(e.rule.id, list);
      }
    }

    const frameWorst: Record<string, number> = {};
    let worstRule: FormRule | null = null;
    let worstScore = 0;
    for (const [ruleId, sev] of this.frameWorstThisRep) {
      frameWorst[ruleId] = sev;
      if (sev >= 1) {
        const list = this.ruleFailedReps.get(ruleId) ?? [];
        list.push(index);
        this.ruleFailedReps.set(ruleId, list);
      }
      const rule = this.ex.rules.find((r) => r.id === ruleId);
      if (rule && sev * rule.priority > worstScore && sev >= 0.55) {
        worstScore = sev * rule.priority;
        worstRule = rule;
      }
    }
    for (const e of repEvals) {
      if (e.severity !== null && e.severity >= 1 && e.rule.priority > (worstRule?.priority ?? 0)) {
        worstRule = e.rule;
      }
    }

    const clean =
      Object.values(frameWorst).every((s) => s < 1) &&
      repEvals.every((e) => e.severity === null || e.severity < 1);

    const rep: RepRecord = {
      index,
      timing,
      tempoScore: tempoAdherence(timing, this.ex.tempo),
      frameWorst,
      repEvals,
      clean,
      worstRule,
    };
    this.repRecords.push(rep);
    this.frameWorstThisRep.clear();
    return rep;
  }

  getSummary(): SetSummary {
    const endedAt = this.endedAt || this.now();
    const reps = this.repRecords.length;
    const cleanReps = this.repRecords.filter((r) => r.clean).length;

    const ruleResults: RuleSetResult[] = this.ex.rules.map((r) => ({
      ruleId: r.id,
      name: r.name,
      worst: this.ruleWorst.get(r.id) ?? 0,
      failedReps: [...new Set(this.ruleFailedReps.get(r.id) ?? [])].sort((a, b) => a - b),
      noData: !this.ruleSawData.has(r.id),
      fixCue: r.cue,
      risk: r.risk,
    }));

    const withData = ruleResults.filter((r) => !r.noData);
    const meanWorst = withData.length
      ? withData.reduce((a, r) => a + Math.min(1, r.worst), 0) / withData.length
      : 0;

    // deterministic, explainable score: clean-rep ratio + how far rules stayed
    // from their error lines, minus a fixed cost per safety stop
    let score =
      reps > 0
        ? 100 * (0.55 * (cleanReps / reps) + 0.45 * (1 - meanWorst))
        : 80 * (1 - meanWorst);
    score -= this.alertCount * 5;
    score = Math.round(Math.max(0, Math.min(100, score)));

    const tempoScores = this.repRecords.map((r) => r.tempoScore).filter((x): x is number => x !== null);

    return {
      exerciseId: this.ex.id,
      exerciseName: this.ex.name,
      startedAt: this.startedAt,
      endedAt,
      durationSec: Math.max(0, Math.round((endedAt - this.startedAt - this.pausedTotalMs) / 1000)),
      reps,
      cleanReps,
      techniqueScore: score,
      tempoAdherence: tempoScores.length
        ? Math.round(tempoScores.reduce((a, b) => a + b, 0) / tempoScores.length)
        : null,
      symmetryAvg: this.symN > 0 ? this.symSum / this.symN : null,
      safetyAlerts: this.alertCount,
      ruleResults,
      dataSource: this.lastSource,
      repRecords: this.repRecords,
    };
  }
}
