import { useLocalSearchParams, useRouter } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getExercise } from '@/src/data/exercises';
import { tutorialVideo } from '@/src/data/videos';
import type { ExerciseSpec } from '@/src/engine/types';
import { color, radius, space } from '@/src/theme/tokens';
import { AppText } from '@/src/ui/AppText';
import { Chip, RiskBadge } from '@/src/ui/Chip';
import { EmptyState } from '@/src/ui/EmptyState';
import { GlassCard } from '@/src/ui/GlassCard';
import { GridBackdrop } from '@/src/ui/GridBackdrop';
import { HUDFrame, hudTint } from '@/src/ui/HUDFrame';
import { MiniMesh } from '@/src/ui/MiniMesh';
import { PressableScale } from '@/src/ui/PressableScale';
import { PrimaryButton } from '@/src/ui/PrimaryButton';

/** Muted looping lesson clip — real Rig footage where it exists (§2.4-C). */
function LessonClip({ ex }: { ex: ExerciseSpec }) {
  const source = tutorialVideo(ex.lesson.videoKey);
  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  if (!source) {
    return (
      <View
        style={{
          height: 150,
          borderRadius: radius.hud,
          backgroundColor: 'rgba(16,20,28,0.6)',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.06)',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
        }}
      >
        <AppText variant="nano" color={color.textLo}>
          · RIG FOOTAGE PENDING ·
        </AppText>
        <AppText variant="nano" color={color.textLo}>
          THE RULESET BELOW STILL WATCHES EVERY REP
        </AppText>
      </View>
    );
  }
  return (
    <View style={{ gap: 6 }}>
      <VideoView
        player={player}
        style={{ width: '100%', height: 190, borderRadius: radius.hud, backgroundColor: color.base }}
        contentFit="cover"
        nativeControls
      />
      <AppText variant="nano" color={color.textLo}>
        {`RIG FOOTAGE · ${(ex.lesson.videoKey ?? '').toUpperCase()} · MUTED LOOP`}
      </AppText>
    </View>
  );
}

export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const ex = getExercise(id ?? '');

  if (!ex) {
    return (
      <View style={{ flex: 1 }}>
        <GridBackdrop />
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            code="UNKNOWN EXERCISE ID"
            title="Not in the library"
            body="This lift isn’t seeded yet."
            actionTitle="Back to library"
            onAction={() => router.back()}
            tone="error"
          />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <GridBackdrop />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24, gap: space.sm }}
      >
        <View style={{ paddingHorizontal: space.gutter, gap: 6 }}>
          <PressableScale onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={{ alignSelf: 'flex-start' }}>
            <AppText variant="micro" color={color.textMid}>
              ‹ LIBRARY
            </AppText>
          </PressableScale>
          <AppText variant="h1">{ex.name}</AppText>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            <Chip label={ex.category.toUpperCase()} tint={color.blue} />
            <RiskBadge level={ex.riskLevel} />
            <Chip label={ex.bodyRegion.toUpperCase()} tint={color.textMid} />
            {ex.hasRigRules ? <Chip label="RIG RULES" tint={color.mesh} /> : null}
          </View>
        </View>

        <View style={{ paddingHorizontal: space.gutter }}>
          <HUDFrame tint={hudTint.mesh} style={{ alignItems: 'center', paddingVertical: space.lg }}>
            <MiniMesh exercise={ex} size={190} cyclePos={0.4} />
            <AppText variant="nano" color={color.textLo} style={{ marginTop: 6 }}>
              {`VIEW · ${ex.view.toUpperCase()} · PRIMARY JOINT · ${ex.primaryJoint.toUpperCase()}`}
            </AppText>
          </HUDFrame>
        </View>

        <View style={{ paddingHorizontal: space.gutter, gap: space.sm }}>
          <GlassCard style={{ gap: 6 }}>
            <AppText variant="nano" color={color.textLo}>
              THE LIFT
            </AppText>
            <AppText variant="body">{ex.lesson.summary}</AppText>
            <LessonClip ex={ex} />
          </GlassCard>

          <GlassCard style={{ gap: 10 }}>
            <AppText variant="nano" color={color.textLo}>
              WHAT THE MESH WATCHES
            </AppText>
            {ex.rules.map((r) => (
              <View key={r.id} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <View
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 4,
                    marginTop: 5,
                    backgroundColor: r.risk ? color.error : color.mesh,
                  }}
                />
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyMed">
                    {r.name}
                    {r.risk ? (
                      <AppText variant="nano" color={color.error}>
                        {`  · ${r.risk.toUpperCase()} RISK`}
                      </AppText>
                    ) : null}
                  </AppText>
                  <AppText variant="body" style={{ marginTop: 1 }}>
                    {r.explain}
                  </AppText>
                </View>
              </View>
            ))}
          </GlassCard>

          <PrimaryButton
            title="Start with this exercise"
            sub={ex.riskLevel === 3 ? 'RISK 3 · WARM UP FIRST' : undefined}
            onPress={() => router.push({ pathname: '/train', params: { exercise: ex.id } })}
          />
        </View>
      </ScrollView>
    </View>
  );
}
