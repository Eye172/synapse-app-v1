/**
 * The deterministic form-rule engine (§2.7). Instant, explainable, honest.
 * This — never an LLM — produces severities, segment colors, safety alerts
 * and rep judgments. Severity is continuous: 0 (ok) … 1 (error).
 */
import type { ExerciseSpec, FormRule, JointMetrics, MetricId, RiskJoint, SegmentId } from './types';

export interface RuleEval {
  rule: FormRule;
  /** current metric value; null = no data from any source */
  value: number | boolean | null;
  /** 0..1, or null when the metric has no data */
  severity: number | null;
}

export interface SafetyAlert {
  ruleId: string;
  risk: RiskJoint;
  cue: string;
  /** epoch ms when raised */
  at: number;
  /** true when raised by the Rig's own alert flag rather than a rule */
  fromRig: boolean;
}

export interface FrameGrade {
  t: number;
  evals: RuleEval[];
  /** worst severity per Mesh segment (only segments any rule touches) */
  segments: Partial<Record<SegmentId, number>>;
  /** highest-priority currently-failing frame rule (severity ≥ threshold) */
  worstLive: RuleEval | null;
  alert: SafetyAlert | null;
}

export function rangeSeverity(value: number, ok: [number, number], warn: [number, number]): number {
  const [okLo, okHi] = ok;
  const [wLo, wHi] = warn;
  if (value >= okLo && value <= okHi) return 0;
  if (value < okLo) {
    if (value <= wLo) return 1;
    const span = okLo - wLo;
    return span <= 1e-9 ? 1 : (okLo - value) / span;
  }
  if (value >= wHi) return 1;
  const span = wHi - okHi;
  return span <= 1e-9 ? 1 : (value - okHi) / span;
}

export function evalRule(rule: FormRule, metrics: Omit<JointMetrics, 't'>): RuleEval {
  const raw = metrics[rule.metric as MetricId];
  if (raw === null || raw === undefined) return { rule, value: null, severity: null };
  if (rule.kind === 'bool') {
    const v = raw as boolean;
    return { rule, value: v, severity: v === rule.expected ? 0 : 1 };
  }
  const v = raw as number;
  return { rule, value: v, severity: rangeSeverity(v, rule.ok!, rule.warn!) };
}

/**
 * Debounces safety alerts: a risk rule must hold severity 1 for `raiseMs`
 * to raise, and stay clean for `clearMs` to clear — no strobing red.
 */
export class AlertTracker {
  private errorSince = new Map<string, number>();
  private active: SafetyAlert | null = null;
  private cleanSince: number | null = null;

  constructor(
    private raiseMs = 250,
    private clearMs = 900,
  ) {}

  update(t: number, evals: RuleEval[], rigAlert: boolean, rigCue: string): SafetyAlert | null {
    const erroring = evals.filter((e) => e.rule.risk !== null && e.severity !== null && e.severity >= 1);

    for (const e of erroring) {
      if (!this.errorSince.has(e.rule.id)) this.errorSince.set(e.rule.id, t);
    }
    for (const key of [...this.errorSince.keys()]) {
      if (!erroring.some((e) => e.rule.id === key)) this.errorSince.delete(key);
    }

    const dueRule = erroring
      .filter((e) => t - (this.errorSince.get(e.rule.id) ?? t) >= this.raiseMs)
      .sort((a, b) => b.rule.priority - a.rule.priority)[0];

    if (this.active === null) {
      if (rigAlert) {
        this.active = { ruleId: 'rig_alert', risk: 'spine', cue: rigCue, at: t, fromRig: true };
      } else if (dueRule) {
        this.active = {
          ruleId: dueRule.rule.id,
          risk: dueRule.rule.risk!,
          cue: dueRule.rule.cue,
          at: t,
          fromRig: false,
        };
      }
      this.cleanSince = null;
    } else {
      const stillBad = rigAlert || erroring.length > 0;
      if (stillBad) {
        this.cleanSince = null;
      } else {
        if (this.cleanSince === null) this.cleanSince = t;
        if (t - this.cleanSince >= this.clearMs) {
          this.active = null;
          this.cleanSince = null;
        }
      }
    }
    return this.active;
  }

  reset(): void {
    this.errorSince.clear();
    this.active = null;
    this.cleanSince = null;
  }
}

export function gradeFrame(
  ex: ExerciseSpec,
  t: number,
  metrics: Omit<JointMetrics, 't'>,
  alerts: AlertTracker,
  rigAlert = false,
): FrameGrade {
  const frameRules = ex.rules.filter((r) => r.scope === 'frame');
  const evals = frameRules.map((r) => evalRule(r, metrics));

  const segments: Partial<Record<SegmentId, number>> = {};
  for (const e of evals) {
    if (e.severity === null) continue;
    for (const seg of e.rule.segments) {
      segments[seg] = Math.max(segments[seg] ?? 0, e.severity);
    }
  }

  const live = evals
    .filter((e) => e.severity !== null && e.severity >= 0.55)
    .sort((a, b) => b.rule.priority * b.severity! - a.rule.priority * a.severity!);

  const spineRule = ex.rules.find((r) => r.risk === 'spine');
  const alert = alerts.update(t, evals, rigAlert, spineRule?.cue ?? 'Rack the weight.');

  // a Rig-raised alert paints the torso red even if pose-derived rules are clean
  if (alert?.fromRig) {
    segments.torso = 1;
    segments.neck = Math.max(segments.neck ?? 0, 1);
  }

  return { t, evals, segments, worstLive: live[0] ?? null, alert };
}

/** Tracks per-rep extremes so rep-scope rules can be judged at rep end. */
export class RepScopeTracker {
  private min = new Map<MetricId, number>();
  private max = new Map<MetricId, number>();
  private everTrue = new Set<MetricId>();
  private everFalse = new Set<MetricId>();

  observe(metrics: Omit<JointMetrics, 't'>): void {
    for (const [k, v] of Object.entries(metrics) as [MetricId, number | boolean | null][]) {
      if (v === null || v === undefined) continue;
      if (typeof v === 'boolean') {
        if (v) this.everTrue.add(k);
        else this.everFalse.add(k);
      } else {
        this.min.set(k, Math.min(this.min.get(k) ?? v, v));
        this.max.set(k, Math.max(this.max.get(k) ?? v, v));
      }
    }
  }

  /** judge all rep-scope rules, then reset for the next rep */
  judge(ex: ExerciseSpec): RuleEval[] {
    const out: RuleEval[] = [];
    for (const rule of ex.rules.filter((r) => r.scope === 'rep')) {
      if (rule.kind === 'bool') {
        const seen = this.everTrue.has(rule.metric) || this.everFalse.has(rule.metric);
        if (!seen) {
          out.push({ rule, value: null, severity: null });
        } else {
          const achieved = rule.expected ? this.everTrue.has(rule.metric) : this.everFalse.has(rule.metric);
          out.push({ rule, value: achieved, severity: achieved ? 0 : 1 });
        }
      } else {
        const v = rule.repJudge === 'max' ? this.max.get(rule.metric) : this.min.get(rule.metric);
        if (v === undefined) {
          out.push({ rule, value: null, severity: null });
        } else {
          out.push({ rule, value: v, severity: rangeSeverity(v, rule.ok!, rule.warn!) });
        }
      }
    }
    this.reset();
    return out;
  }

  reset(): void {
    this.min.clear();
    this.max.clear();
    this.everTrue.clear();
    this.everFalse.clear();
  }
}
