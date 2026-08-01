import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { computeAchievements } from '@/src/data/achievements';
import { EXERCISES } from '@/src/data/exercises';
import { computeStreak, useHistoryStore, weeklySafetyScore } from '@/src/store/historyStore';
import { color, space } from '@/src/theme/tokens';
import { AppText } from '@/src/ui/AppText';
import { Chip } from '@/src/ui/Chip';
import { EmptyState } from '@/src/ui/EmptyState';
import { GlassCard } from '@/src/ui/GlassCard';
import { GridBackdrop } from '@/src/ui/GridBackdrop';
import { HUDFrame, hudTint } from '@/src/ui/HUDFrame';
import { PressableScale } from '@/src/ui/PressableScale';
import { ScreenHeader } from '@/src/ui/ScreenHeader';
import { Metric, Section } from '@/src/ui/Section';
import { SeverityRing } from '@/src/ui/SeverityRing';
import { StatReadout } from '@/src/ui/StatReadout';
import { TrendChart } from '@/src/ui/TrendChart';

/**
 * Progress (§2.4-E): session timeline, per-exercise trends, achievements.
 * Metrics only — no video exists anywhere in this store (§2.12).
 */
export default function ProgressScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const sessions = useHistoryStore((s) => s.sessions);
  const [exFilter, setExFilter] = useState<string | null>(null);

  const trained = useMemo(
    () => EXERCISES.filter((e) => sessions.some((s) => s.exerciseId === e.id)),
    [sessions],
  );
  const active = exFilter ?? trained[0]?.id ?? null;

  const trend = useMemo(() => {
    if (!active) return { scores: [] as number[], sym: null as number | null, tempo: null as number | null, topFault: null as string | null };
    const list = sessions.filter((s) => s.exerciseId === active).slice(0, 14).reverse();
    const scores = list.map((s) => s.techniqueScore);
    const syms = list.map((s) => s.symmetryAvg).filter((x): x is number => x !== null);
    const tempos = list.map((s) => s.tempoAdherence).filter((x): x is number => x !== null);
    const faultCounts = new Map<string, number>();
    for (const s of list) {
      if (s.topFault) faultCounts.set(s.topFault.name, (faultCounts.get(s.topFault.name) ?? 0) + s.topFault.failedReps);
    }
    const topFault = [...faultCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return {
      scores,
      sym: syms.length ? Math.round(syms.reduce((a, b) => a + b, 0) / syms.length) : null,
      tempo: tempos.length ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : null,
      topFault,
    };
  }, [sessions, active]);

  const achievements = useMemo(() => computeAchievements(sessions), [sessions]);
  const earned = achievements.filter((a) => a.earned);
  const streak = computeStreak(sessions);
  const weekly = weeklySafetyScore(sessions);
  const totalReps = sessions.reduce((a, s) => a + s.reps, 0);

  return (
    <View style={{ flex: 1 }}>
      <GridBackdrop />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 120, gap: space.md }}
      >
        <ScreenHeader eyebrow="PROGRESS" title="History" />

        {sessions.length === 0 ? (
          <EmptyState
            code="NO SESSIONS LOGGED"
            title="The log is empty"
            body="Finish one supervised set and your history, trends and safety score start here. Metrics only — video never leaves the set."
            actionTitle="Start training"
            onAction={() => router.push('/train')}
            tone="acid"
          />
        ) : (
          <View style={{ gap: space.lg }}>
            {/* the record, as four readings — no frame needed */}
            <View style={{ paddingHorizontal: space.gutter, flexDirection: 'row', justifyContent: 'space-between' }}>
              <Metric value={String(sessions.length)} caption="SESSIONS" size={30} />
              <Metric value={String(totalReps)} caption="REPS" size={30} tint={color.mesh} />
              <Metric value={weekly === null ? '—' : String(weekly)} caption="7-DAY SCORE" size={30} tint={color.acid} />
              <Metric
                value={String(streak)}
                caption={streak === 1 ? 'DAY' : 'DAYS'}
                size={30}
                tint={streak > 0 ? color.textHi : color.textLo}
              />
            </View>

            {/* per-exercise trend */}
            <Section
              label="TECHNIQUE TREND"
              aside={
                trend.topFault ? (
                  <AppText variant="nano" color={color.warn}>
                    {`TOP FAULT — ${trend.topFault.toUpperCase()}`}
                  </AppText>
                ) : null
              }
              style={{ gap: 10 }}
            >
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {trained.map((e) => (
                  <PressableScale key={e.id} onPress={() => setExFilter(e.id)} accessibilityRole="button" accessibilityLabel={`Trend for ${e.name}`}>
                    <Chip label={e.name.toUpperCase()} tint={active === e.id ? color.acid : color.textLo} filled={active === e.id} />
                  </PressableScale>
                ))}
              </View>
              <TrendChart values={trend.scores} width={width - space.gutter * 2} />
              <View style={{ flexDirection: 'row', gap: 26 }}>
                <StatReadout k="LAST" v={trend.scores.length ? String(trend.scores[trend.scores.length - 1]) : '—'} tint={color.acid} />
                <StatReadout k="AVG SYM" v={trend.sym === null ? '—' : String(trend.sym)} unit={trend.sym === null ? undefined : '%'} tint={color.mesh} />
                <StatReadout k="AVG TEMPO" v={trend.tempo === null ? '—' : String(trend.tempo)} unit={trend.tempo === null ? undefined : '%'} tint={color.mesh} />
              </View>
            </Section>

            {/* achievements */}
            <Section
              label="ACHIEVEMENTS"
              aside={
                <AppText variant="nano" color={color.acid}>
                  {`${earned.length}/${achievements.length}`}
                </AppText>
              }
            >
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {achievements.map((a) => (
                  <View
                    key={a.id}
                    accessibilityLabel={`${a.name}: ${a.desc}${a.earned ? ', earned' : ''}`}
                    style={{
                      width: '31%',
                      flexGrow: 1,
                      borderWidth: 1,
                      borderColor: a.earned ? 'rgba(200,240,60,0.35)' : 'rgba(255,255,255,0.07)',
                      backgroundColor: a.earned ? 'rgba(200,240,60,0.07)' : 'rgba(255,255,255,0.02)',
                      borderRadius: 10,
                      padding: 8,
                      gap: 3,
                    }}
                  >
                    <AppText variant="nano" color={a.earned ? color.acid : color.textMid} numberOfLines={1}>
                      {a.name.toUpperCase()}
                    </AppText>
                    <AppText variant="nano" color={color.textLo} numberOfLines={2} style={{ fontSize: 8.5, lineHeight: 11 }}>
                      {a.desc.toUpperCase()}
                    </AppText>
                    <View style={{ height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                      <View style={{ width: `${a.progress * 100}%`, height: 3, backgroundColor: a.earned ? color.acid : color.textLo }} />
                    </View>
                  </View>
                ))}
              </View>
            </Section>

            {/* the log reads as a ledger: date, lift, the numbers, done */}
            <Section
              label="SESSION LOG"
              aside={
                <AppText variant="nano" color={color.textLo}>
                  METRICS ONLY — NO VIDEO STORED
                </AppText>
              }
            >
              {sessions.map((s, i) => (
                <View
                  key={s.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.md,
                    paddingVertical: 12,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: 'rgba(255,255,255,0.05)',
                  }}
                >
                  <View style={{ width: 44 }}>
                    <AppText
                      variant="monoValue"
                      color={s.techniqueScore >= 75 ? color.acid : s.techniqueScore >= 50 ? color.warn : color.error}
                    >
                      {s.techniqueScore}
                    </AppText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyMed">{s.exerciseName}</AppText>
                    <AppText variant="nano" color={color.textLo} style={{ marginTop: 3 }}>
                      {[
                        new Date(s.date)
                          .toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
                          .toUpperCase(),
                        `${s.cleanReps}/${s.reps} CLEAN`,
                        `${s.durationSec}s`,
                        s.dataSource.toUpperCase(),
                      ].join('   ')}
                    </AppText>
                  </View>
                  {s.safetyAlerts > 0 ? (
                    <AppText variant="nano" color={color.error}>
                      {`${s.safetyAlerts} STOP`}
                    </AppText>
                  ) : s.topFault ? (
                    <AppText variant="nano" color={color.warn}>
                      {s.topFault.name.toUpperCase()}
                    </AppText>
                  ) : null}
                </View>
              ))}
            </Section>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
