import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { LLMCoach } from '@/src/coach/LLMCoach';
import { RuleCoach } from '@/src/coach/RuleCoach';
import type { SetSummary } from '@/src/engine/setSession';
import { useHistoryStore } from '@/src/store/historyStore';
import { color, severityColor, space } from '@/src/theme/tokens';
import { AppText } from '@/src/ui/AppText';
import { Chip } from '@/src/ui/Chip';
import { GlassCard } from '@/src/ui/GlassCard';
import { HUDFrame, hudTint } from '@/src/ui/HUDFrame';
import { PressableScale } from '@/src/ui/PressableScale';
import { PrimaryButton } from '@/src/ui/PrimaryButton';
import { SeverityRing } from '@/src/ui/SeverityRing';
import { StatReadout } from '@/src/ui/StatReadout';

/**
 * REPORT (§2.5): technique score, per-rule verdicts, tempo/symmetry, the
 * coach's written summary and the one fix. Saves METRICS ONLY (§2.12).
 */
export function ReportStage({
  summary,
  aiKey,
  onDone,
}: {
  summary: SetSummary;
  aiKey: string | null;
  onDone: () => void;
}) {
  const addSession = useHistoryStore((s) => s.addSession);
  const [coachText, setCoachText] = useState<string | null>(null);
  const [coachSource, setCoachSource] = useState<'rules' | 'llm'>('rules');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    const coach = aiKey ? new LLMCoach({ apiKey: aiKey, onCue: () => {} }) : new RuleCoach();
    coach.setSummary(summary).then(({ text, source }) => {
      if (alive) {
        setCoachText(text);
        setCoachSource(source);
      }
    });
    return () => {
      alive = false;
    };
  }, [summary, aiKey]);

  const topFault =
    summary.ruleResults
      .filter((r) => !r.noData && r.failedReps.length > 0)
      .sort((a, b) => b.failedReps.length - a.failedReps.length)[0] ?? null;

  const save = () => {
    if (saved) return;
    setSaved(true);
    addSession({
      id: `${summary.exerciseId}-${summary.endedAt}`,
      date: summary.endedAt,
      exerciseId: summary.exerciseId,
      exerciseName: summary.exerciseName,
      reps: summary.reps,
      cleanReps: summary.cleanReps,
      techniqueScore: summary.techniqueScore,
      symmetryAvg: summary.symmetryAvg,
      tempoAdherence: summary.tempoAdherence,
      ruleResults: summary.ruleResults.map((r) => ({
        ruleId: r.ruleId,
        name: r.name,
        worst: r.worst,
        failedReps: r.failedReps,
        noData: r.noData,
      })),
      topFault: topFault
        ? { ruleId: topFault.ruleId, name: topFault.name, failedReps: topFault.failedReps.length }
        : null,
      safetyAlerts: summary.safetyAlerts,
      durationSec: summary.durationSec,
      coachSummary: coachText,
      dataSource: summary.dataSource,
    });
    onDone();
  };

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: 48, gap: space.sm }} showsVerticalScrollIndicator={false}>
      <AppText variant="nano" color={color.acid}>
        {`· REPORT · ${summary.exerciseName.toUpperCase()} ·`}
      </AppText>
      <AppText variant="h1">Set debrief</AppText>

      <HUDFrame tint={summary.safetyAlerts > 0 ? hudTint.error : hudTint.acid} style={{ alignItems: 'center', gap: 10, paddingVertical: space.lg }}>
        <SeverityRing score={summary.techniqueScore} size={148} label="TECHNIQUE" />
        <View style={{ flexDirection: 'row', gap: 26 }}>
          <StatReadout k="REPS" v={String(summary.reps)} tint={color.textHi} />
          <StatReadout k="CLEAN" v={String(summary.cleanReps)} tint={color.ok} />
          <StatReadout k="TEMPO" v={summary.tempoAdherence === null ? '—' : String(summary.tempoAdherence)} unit={summary.tempoAdherence === null ? undefined : '%'} tint={color.mesh} />
          <StatReadout k="SYM" v={summary.symmetryAvg === null ? '—' : String(Math.round(summary.symmetryAvg))} unit={summary.symmetryAvg === null ? undefined : '%'} tint={color.mesh} />
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Chip label={`SOURCE · ${summary.dataSource.toUpperCase()}`} tint={color.blue} />
          <Chip label={`${summary.durationSec}s SET`} tint={color.textMid} />
          {summary.safetyAlerts > 0 ? (
            <Chip label={`${summary.safetyAlerts} SAFETY STOP${summary.safetyAlerts === 1 ? '' : 'S'}`} tint={color.error} dot />
          ) : null}
        </View>
      </HUDFrame>

      <GlassCard style={{ gap: 12 }}>
        <AppText variant="nano" color={color.textLo}>
          RULE VERDICTS
        </AppText>
        {summary.ruleResults.map((r) => (
          <View key={r.ruleId} style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <AppText variant="bodyMed">{r.name}</AppText>
              {r.noData ? (
                <Chip label="NO DATA" tint={color.textLo} />
              ) : r.failedReps.length > 0 ? (
                <Chip label={`BROKE · REP ${r.failedReps.join(', ')}`} tint={color.error} />
              ) : r.worst > 0.5 ? (
                <Chip label="DRIFTED" tint={color.warn} />
              ) : (
                <Chip label="HELD" tint={color.ok} />
              )}
            </View>
            <View style={{ height: 4, borderRadius: 2, backgroundColor: color.line, overflow: 'hidden' }}>
              <View
                style={{
                  width: `${Math.min(1, r.worst) * 100}%`,
                  height: 4,
                  backgroundColor: r.noData ? color.textLo : severityColor(r.worst),
                }}
              />
            </View>
          </View>
        ))}
      </GlassCard>

      <GlassCard style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText variant="nano" color={color.textLo}>
            COACH
          </AppText>
          <Chip
            label={coachSource === 'llm' ? 'AI COACH · CLAUDE' : aiKey ? 'RULE COACH · FALLBACK' : 'RULE COACH'}
            tint={coachSource === 'llm' ? color.acid : color.textMid}
          />
        </View>
        <AppText variant="body" color={color.textHi}>
          {coachText ?? 'Compiling debrief…'}
        </AppText>
      </GlassCard>

      <AppText variant="nano" color={color.textLo} align="center">
        SAVED: NUMBERS ONLY. NO VIDEO, NO FRAMES, EVER.
      </AppText>

      <PrimaryButton title="Save & finish" sub="METRICS → PROGRESS" onPress={save} disabled={saved} />
      <PressableScale onPress={onDone} accessibilityRole="button" accessibilityLabel="Discard set">
        <AppText variant="micro" color={color.textLo} align="center" style={{ paddingVertical: 8 }}>
          DISCARD SET
        </AppText>
      </PressableScale>
    </ScrollView>
  );
}
