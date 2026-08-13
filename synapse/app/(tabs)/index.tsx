import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EXERCISES, getExercise } from '@/src/data/exercises';
import { useConnectionStore } from '@/src/store/connectionStore';
import { computeStreak, useHistoryStore, weeklySafetyScore } from '@/src/store/historyStore';
import { color, space } from '@/src/theme/tokens';
import { AppText } from '@/src/ui/AppText';
import { ConnectionChip } from '@/src/ui/ConnectionChip';
import { GridBackdrop } from '@/src/ui/GridBackdrop';
import { MiniMesh } from '@/src/ui/MiniMesh';
import { PressableScale } from '@/src/ui/PressableScale';
import { PrimaryButton } from '@/src/ui/PrimaryButton';
import { Bar, Metric, Section } from '@/src/ui/Section';

const DAY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function greeting(h: number): string {
  if (h < 5) return 'Night shift';
  if (h < 12) return 'Morning session';
  if (h < 18) return 'Day session';
  return 'Evening session';
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mode = useConnectionStore((s) => s.mode);
  const nodeCount = useConnectionStore((s) => s.nodeCount);
  const sessions = useHistoryStore((s) => s.sessions);

  const now = useMemo(() => new Date(), []);
  const dateStr = `${DAY[now.getDay()]} ${now.getDate()} ${MON[now.getMonth()]}`;

  const lastSession = sessions[0];
  const continueEx = (lastSession && getExercise(lastSession.exerciseId)) || EXERCISES[0]!;
  const safety = weeklySafetyScore(sessions);
  const streak = computeStreak(sessions);
  const weekSessions = sessions.filter((s) => s.date >= Date.now() - 7 * 86400000);
  const weekReps = weekSessions.reduce((a, s) => a + s.reps, 0);

  const ctaSub =
    mode === 'linked'
      ? `RIG LINKED · ${nodeCount}/5 NODES`
      : mode === 'searching'
        ? 'SEARCHING FOR RIG'
        : 'RIG NOT CONNECTED';

  const safetyTint = safety === null ? color.textLo : safety >= 75 ? color.acid : safety >= 50 ? color.warn : color.error;

  return (
    <View style={{ flex: 1 }}>
      <GridBackdrop />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: 128 }}
        showsVerticalScrollIndicator={false}
      >
        {/* masthead — the date is small print, the greeting carries the page */}
        <View style={{ paddingHorizontal: space.gutter }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText variant="nano" color={color.textLo}>
              {dateStr}
            </AppText>
            <ConnectionChip />
          </View>
          <AppText variant="h1" style={{ marginTop: 14 }}>
            {greeting(now.getHours())}
          </AppText>
          <AppText variant="body" style={{ marginTop: 2 }}>
            Every rep, supervised.
          </AppText>
        </View>

        {/* Nothing logged yet means every reading below is a dash, and a
            column of dashes above the one button worth pressing buries it.
            With a history the readings have earned the headline; without
            one, the action leads. */}
        {safety === null ? (
          <View style={{ marginTop: space.xl, paddingHorizontal: space.gutter }}>
            <PrimaryButton
              title="Start training"
              sub={ctaSub}
              onPress={() => router.push('/train')}
              accessibilityLabel="Start training"
            />
          </View>
        ) : null}

        {/* The week, as instrument readings — asymmetric on purpose: the score
            is the headline and the rest are footnotes beside it.
            No entrance animation: an `entering` fade here leaves the block at
            visibility:hidden and the page's headline numbers never appear.
            Two hundred milliseconds of polish is not worth a screen that
            sometimes has no numbers on it. */}
        <View style={{ marginTop: space.xl, paddingHorizontal: space.gutter }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.lg }}>
            <View style={{ flex: 1 }}>
              <Metric
                value={safety === null ? '—' : String(safety)}
                unit={safety === null ? undefined : '/100'}
                caption="SAFETY SCORE · LAST 7 DAYS"
                tint={safetyTint}
                size={64}
              />
              <View style={{ marginTop: 10 }}>
                <Bar fill={(safety ?? 0) / 100} tint={safetyTint} />
              </View>
            </View>
            <View style={{ gap: 16, paddingBottom: 4 }}>
              <Metric value={streak > 0 ? String(streak) : '—'} caption={streak === 1 ? 'DAY STREAK' : 'DAY STREAK'} size={26} tint={streak > 0 ? color.textHi : color.textLo} />
              <Metric value={weekReps > 0 ? String(weekReps) : '—'} caption="REPS THIS WEEK" size={26} tint={weekReps > 0 ? color.textHi : color.textLo} />
            </View>
          </View>
          {safety === null ? (
            <AppText variant="nano" color={color.textLo} style={{ marginTop: 12 }}>
              NOTHING LOGGED YET — ONE SET STARTS THE RECORD
            </AppText>
          ) : null}
        </View>

        {safety !== null ? (
          <View style={{ marginTop: space.xl, paddingHorizontal: space.gutter }}>
            <PrimaryButton
              title="Start training"
              sub={ctaSub}
              onPress={() => router.push('/train')}
              accessibilityLabel="Start training"
            />
          </View>
        ) : null}

        {/* continue — a wide plate, not a card: image left, text ranged left */}
        <Section label={lastSession ? 'CONTINUE' : 'START HERE'} style={{ marginTop: space.xl }} first>
          <PressableScale
            onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: continueEx.id } })}
            accessibilityRole="button"
            accessibilityLabel={`Continue with ${continueEx.name}`}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <View
                style={{
                  width: 92,
                  height: 92,
                  backgroundColor: 'rgba(33,240,220,0.04)',
                  borderLeftWidth: 2,
                  borderLeftColor: color.mesh,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MiniMesh exercise={continueEx} size={80} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <AppText variant="h2" style={{ flex: 1 }}>
                    {continueEx.name}
                  </AppText>
                  <AppText variant="h3" color={color.textLo}>
                    ›
                  </AppText>
                </View>
                <AppText variant="nano" color={color.textLo} style={{ marginTop: 5 }}>
                  {continueEx.lesson.watchList.join('  ').toUpperCase()}
                </AppText>
                {lastSession ? (
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
                    <AppText variant="monoValue" color={color.textHi} style={{ fontSize: 17 }}>
                      {lastSession.techniqueScore}
                    </AppText>
                    <AppText variant="nano" color={color.textLo}>
                      LAST SESSION
                    </AppText>
                  </View>
                ) : (
                  <AppText variant="nano" color={color.mesh} style={{ marginTop: 8 }}>
                    {`${continueEx.rules.length} RULES WATCHED`}
                  </AppText>
                )}
              </View>
            </View>
          </PressableScale>
        </Section>

        {/* the template reads as a list of lifts, not a grid of tiles */}
        <Section label="POSTERIOR CHAIN DAY" aside={<AppText variant="nano" color={color.textLo}>3 LIFTS</AppText>} style={{ marginTop: space.xl }}>
          {(['back_squat', 'rdl', 'barbell_row'] as const).map((id, i) => {
            const ex = getExercise(id)!;
            return (
              <PressableScale
                key={id}
                onPress={() => router.push({ pathname: '/exercise/[id]', params: { id } })}
                accessibilityRole="button"
                accessibilityLabel={ex.name}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.sm,
                    paddingVertical: 10,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: 'rgba(255,255,255,0.05)',
                  }}
                >
                  <AppText variant="nano" color={color.textLo} style={{ width: 18 }}>
                    {String(i + 1).padStart(2, '0')}
                  </AppText>
                  <MiniMesh exercise={ex} size={38} />
                  <AppText variant="bodyMed" style={{ flex: 1 }}>
                    {ex.name}
                  </AppText>
                  <AppText variant="nano" color={ex.riskLevel === 3 ? color.error : color.textLo}>
                    {`RISK ${ex.riskLevel}`}
                  </AppText>
                  <AppText variant="h3" color={color.textLo}>
                    ›
                  </AppText>
                </View>
              </PressableScale>
            );
          })}
        </Section>
      </ScrollView>
    </View>
  );
}
