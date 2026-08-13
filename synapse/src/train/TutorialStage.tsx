import { VideoView, useVideoPlayer } from 'expo-video';
import React from 'react';
import { ScrollView, View } from 'react-native';

import { tutorialVideo } from '@/src/data/videos';
import type { ExerciseSpec } from '@/src/engine/types';
import { color, radius, space } from '@/src/theme/tokens';
import { AppText } from '@/src/ui/AppText';
import { Chip } from '@/src/ui/Chip';
import { CornerBrackets, bracketTint } from '@/src/ui/CornerBrackets';
import { GlassCard } from '@/src/ui/GlassCard';
import { PrimaryButton } from '@/src/ui/PrimaryButton';

function TutorialPlayer({ source }: { source: number }) {
  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={{ width: '100%', aspectRatio: 16 / 10, borderRadius: radius.hud }}
      contentFit="cover"
      nativeControls
    />
  );
}

/** Video lesson (skippable). Reference footage for the lifts we have it for. */
export function TutorialStage({ ex, onContinue }: { ex: ExerciseSpec; onContinue: () => void }) {
  const source = tutorialVideo(ex.lesson.videoKey);
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: 48, gap: space.sm }} showsVerticalScrollIndicator={false}>
      <AppText variant="nano" color={color.acid}>
        {`· TRAINING · ${ex.name.toUpperCase()} · LESSON ·`}
      </AppText>
      <AppText variant="h1">Watch the standard</AppText>

      <View style={{ padding: 3 }}>
        <CornerBrackets size={16} tint={bracketTint.mesh} />
        {source !== null ? (
          <TutorialPlayer source={source} />
        ) : (
          <View
            style={{
              width: '100%',
              aspectRatio: 16 / 10,
              borderRadius: radius.hud,
              backgroundColor: 'rgba(16,20,28,0.6)',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <AppText variant="nano" color={color.textLo}>
              · FOOTAGE PENDING ·
            </AppText>
            <AppText variant="body" align="center" style={{ maxWidth: 260 }}>
              No lesson clip for this lift yet. The form rules below still apply in full.
            </AppText>
          </View>
        )}
      </View>
      {source !== null ? (
        <AppText variant="nano" color={color.textLo}>
          REFERENCE FOOTAGE · MUTED LOOP
        </AppText>
      ) : null}

      <GlassCard style={{ gap: 8 }}>
        <AppText variant="nano" color={color.textLo}>
          THE MESH WILL WATCH
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {ex.lesson.watchList.map((w) => (
            <Chip key={w} label={w.toUpperCase()} tint={color.mesh} />
          ))}
        </View>
        <AppText variant="body">{ex.lesson.summary}</AppText>
      </GlassCard>

      <PrimaryButton title="Continue" sub="SKIP ANY TIME — THE RULES STILL WATCH" onPress={onContinue} />
    </ScrollView>
  );
}
