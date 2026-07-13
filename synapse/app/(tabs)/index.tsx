import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EXERCISES, getExercise } from '@/src/data/exercises';
import { useConnectionStore } from '@/src/store/connectionStore';
import { computeStreak, useHistoryStore, weeklySafetyScore } from '@/src/store/historyStore';
import { color, space } from '@/src/theme/tokens';
import { AppText } from '@/src/ui/AppText';
import { Chip } from '@/src/ui/Chip';
import { GlassCard } from '@/src/ui/GlassCard';
import { GridBackdrop } from '@/src/ui/GridBackdrop';
import { MiniMesh } from '@/src/ui/MiniMesh';
import { PressableScale } from '@/src/ui/PressableScale';
import { PrimaryButton } from '@/src/ui/PrimaryButton';
import { ScreenHeader } from '@/src/ui/ScreenHeader';
import { SeverityRing } from '@/src/ui/SeverityRing';

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
  const dateStr = `${DAY[now.getDay()]} · ${now.getDate()} ${MON[now.getMonth()]} ${now.getFullYear()}`;

  const lastSession = sessions[0];
  const continueEx = (lastSession && getExercise(lastSession.exerciseId)) || EXERCISES[0]!;
  const safety = weeklySafetyScore(sessions);
  const streak = computeStreak(sessions);

  const ctaSub =
    mode === 'linked'
      ? `RIG LINKED · ${nodeCount} NODE${nodeCount === 1 ? '' : 'S'}`
      : mode === 'searching'
        ? 'SEARCHING FOR RIG · DEMO READY'
        : 'DEMO MODE · NO RIG NEEDED';

  return (
    <View style={{ flex: 1 }}>
      <GridBackdrop />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 120, gap: space.md }}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader eyebrow={`SYNAPSE · ${dateStr}`} title={greeting(now.getHours())}>
          <AppText variant="body" style={{ marginTop: -2 }}>
            Every rep, supervised.
          </AppText>
        </ScreenHeader>

        <Animated.View entering={FadeInDown.duration(220)} style={{ paddingHorizontal: space.gutter, marginTop: space.xs }}>
          <PrimaryButton
            title="Start training"
            sub={ctaSub}
            onPress={() => router.push('/train')}
            accessibilityLabel="Start training"
          />
        </Animated.View>

        {/* Continue */}
        <Animated.View entering={FadeInDown.duration(220).delay(40)} style={{ paddingHorizontal: space.gutter }}>
          <PressableScale
            onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: continueEx.id } })}
            accessibilityRole="button"
            accessibilityLabel={`Continue with ${continueEx.name}`}
          >
            <GlassCard style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <View
                style={{
                  width: 84,
                  height: 84,
                  borderRadius: 12,
                  backgroundColor: 'rgba(33,240,220,0.05)',
                  borderWidth: 1,
                  borderColor: 'rgba(33,240,220,0.15)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MiniMesh exercise={continueEx} size={76} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <AppText variant="nano" color={color.textLo}>
                  {lastSession ? 'CONTINUE' : 'SUGGESTED FIRST LIFT'}
                </AppText>
                <AppText variant="h3">{continueEx.name}</AppText>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Chip label={continueEx.category.toUpperCase()} tint={color.blue} />
                  {lastSession ? (
                    <Chip label={`LAST · ${lastSession.techniqueScore}`} tint={color.textMid} />
                  ) : (
                    <Chip label={`${continueEx.rules.length} RULES WATCHED`} tint={color.mesh} />
                  )}
                </View>
              </View>
              <AppText variant="h2" color={color.textLo}>
                ›
              </AppText>
            </GlassCard>
          </PressableScale>
        </Animated.View>

        {/* Safety + streak */}
        <Animated.View entering={FadeInDown.duration(220).delay(80)} style={{ flexDirection: 'row', paddingHorizontal: space.gutter, gap: space.sm }}>
          <GlassCard style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <AppText variant="nano" color={color.textLo}>
              SAFETY SCORE · 7D
            </AppText>
            <SeverityRing score={safety} size={92} />
            <AppText variant="nano" color={safety === null ? color.textLo : color.textMid}>
              {safety === null ? 'NO SETS LOGGED YET' : safety >= 75 ? 'FORM HOLDING' : 'NEEDS ATTENTION'}
            </AppText>
          </GlassCard>
          <GlassCard style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <AppText variant="nano" color={color.textLo}>
              STREAK
            </AppText>
            <AppText variant="display" color={streak > 0 ? color.acid : color.textLo} style={{ fontSize: 44, lineHeight: 48 }}>
              {streak > 0 ? streak : '—'}
            </AppText>
            <AppText variant="nano" color={color.textMid}>
              {streak === 1 ? 'DAY' : 'DAYS'} SUPERVISED
            </AppText>
          </GlassCard>
        </Animated.View>

        {/* Recommended session */}
        <Animated.View entering={FadeInDown.duration(220).delay(120)} style={{ paddingHorizontal: space.gutter }}>
          <GlassCard style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <AppText variant="nano" color={color.textLo}>
                RECOMMENDED · STARTER TEMPLATE
              </AppText>
              <Chip label="3 LIFTS" tint={color.textMid} />
            </View>
            <AppText variant="h3">Posterior chain day</AppText>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['back_squat', 'rdl', 'barbell_row'] as const).map((id) => {
                const ex = getExercise(id)!;
                return (
                  <PressableScale
                    key={id}
                    style={{ flex: 1 }}
                    onPress={() => router.push({ pathname: '/exercise/[id]', params: { id } })}
                    accessibilityRole="button"
                    accessibilityLabel={ex.name}
                  >
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: 'rgba(255,255,255,0.07)',
                        borderRadius: 12,
                        paddingVertical: 8,
                        alignItems: 'center',
                        gap: 4,
                        backgroundColor: 'rgba(255,255,255,0.02)',
                      }}
                    >
                      <MiniMesh exercise={ex} size={54} />
                      <AppText variant="nano" color={color.textMid} numberOfLines={1}>
                        {ex.name.toUpperCase()}
                      </AppText>
                    </View>
                  </PressableScale>
                );
              })}
            </View>
          </GlassCard>
        </Animated.View>
      </ScrollView>
    </View>
  );
}
