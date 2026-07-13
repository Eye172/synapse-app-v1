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
          <View style={{ paddingHorizontal: space.gutter, gap: space.sm }}>
            {/* summary strip */}
            <HUDFrame tint={hudTint.acid} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <StatReadout k="SESSIONS" v={String(sessions.length)} tint={color.textHi} />
              <StatReadout k="REPS" v={String(totalReps)} tint={color.mesh} />
              <StatReadout k="7D SCORE" v={weekly === null ? '—' : String(weekly)} tint={color.acid} />
              <StatReadout k="STREAK" v={String(streak)} unit={streak === 1 ? 'DAY' : 'DAYS'} tint={streak > 0 ? color.acid : color.textLo} />
            </HUDFrame>

            {/* per-exercise trend */}
            <GlassCard style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <AppText variant="nano" color={color.textLo}>
                  TECHNIQUE TREND
                </AppText>
                {trend.topFault ? <Chip label={`TOP FAULT · ${trend.topFault.toUpperCase()}`} tint={color.warn} /> : null}
              </View>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {trained.map((e) => (
                  <PressableScale key={e.id} onPress={() => setExFilter(e.id)} accessibilityRole="button" accessibilityLabel={`Trend for ${e.name}`}>
                    <Chip label={e.name.toUpperCase()} tint={active === e.id ? color.acid : color.textLo} filled={active === e.id} />
                  </PressableScale>
                ))}
              </View>
              <TrendChart values={trend.scores} width={width - space.gutter * 2 - 32} />
              <View style={{ flexDirection: 'row', gap: 26 }}>
                <StatReadout k="LAST" v={trend.scores.length ? String(trend.scores[trend.scores.length - 1]) : '—'} tint={color.acid} />
                <StatReadout k="AVG SYM" v={trend.sym === null ? '—' : String(trend.sym)} unit={trend.sym === null ? undefined : '%'} tint={color.mesh} />
                <StatReadout k="AVG TEMPO" v={trend.tempo === null ? '—' : String(trend.tempo)} unit={trend.tempo === null ? undefined : '%'} tint={color.mesh} />
              </View>
            </GlassCard>

            {/* achievements */}
            <GlassCard style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <AppText variant="nano" color={color.textLo}>
                  ACHIEVEMENTS
                </AppText>
                <Chip label={`${earned.length}/${achievements.length}`} tint={color.acid} />
              </View>
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
            </GlassCard>

            {/* timeline */}
            <AppText variant="nano" color={color.textLo} style={{ marginTop: 4 }}>
              TIMELINE · METRICS ONLY · NO VIDEO IS EVER STORED
            </AppText>
            {sessions.map((s) => (
              <GlassCard key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <SeverityRing score={s.techniqueScore} size={64} showValue />
                <View style={{ flex: 1, gap: 4 }}>
                  <AppText variant="nano" color={color.textLo}>
                    {new Date(s.date)
                      .toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
                      .toUpperCase()}
                    {` · ${s.durationSec}s · ${s.dataSource.toUpperCase()}`}
                  </AppText>
                  <AppText variant="h3">{s.exerciseName}</AppText>
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                    <Chip label={`${s.reps} REPS`} tint={color.textMid} />
                    <Chip label={`${s.cleanReps} CLEAN`} tint={color.ok} />
                    {s.safetyAlerts > 0 ? <Chip label={`${s.safetyAlerts} STOP`} tint={color.error} dot /> : null}
                    {s.topFault ? <Chip label={s.topFault.name.toUpperCase()} tint={color.warn} /> : null}
                  </View>
                </View>
              </GlassCard>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
