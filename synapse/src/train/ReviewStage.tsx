import { VideoView, useVideoPlayer } from 'expo-video';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';

import { color, radius, space } from '@/src/theme/tokens';
import { AppText } from '@/src/ui/AppText';
import { Chip } from '@/src/ui/Chip';
import { CornerBrackets, bracketTint } from '@/src/ui/CornerBrackets';
import { GlassCard } from '@/src/ui/GlassCard';
import { PrimaryButton } from '@/src/ui/PrimaryButton';

import type { FaultMarker } from './LiveStage';
import type { EphemeralClip } from './recording';

/**
 * REVIEW (§2.5): scrub the ephemeral clip, faults marked on the timeline.
 * The file is hard-deleted on EVERY way out of this state — continue, back,
 * background, unmount (§2.12, deal-breaker 1).
 */
export function ReviewStage({
  clip,
  durationSec,
  markers,
  onContinue,
}: {
  clip: EphemeralClip;
  durationSec: number;
  markers: FaultMarker[];
  onContinue: () => void;
}) {
  const uri = clip.currentUri;
  const [deleting, setDeleting] = useState(false);
  const continued = useRef(false);

  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  // any exit path destroys the clip
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') void clip.deleteNow();
    });
    return () => {
      sub.remove();
      void clip.deleteNow(); // unmount = leave = delete
    };
  }, [clip]);

  const handleContinue = async () => {
    if (continued.current) return;
    continued.current = true;
    setDeleting(true);
    try {
      player.pause();
    } catch {
      // player may already be released
    }
    await clip.deleteNow();
    onContinue();
  };

  return (
    <View style={{ flex: 1, paddingHorizontal: space.gutter, gap: space.sm }}>
      <AppText variant="nano" color={color.acid}>
        · REVIEW · EPHEMERAL ·
      </AppText>
      <AppText variant="h1">One look. Then it burns.</AppText>
      <AppText variant="body">
        This clip lives in the app’s private cache only. Leaving this screen deletes it permanently — it never
        touches your gallery and never uploads.
      </AppText>

      <View style={{ padding: 3 }}>
        <CornerBrackets size={16} tint={bracketTint.mesh} />
        {uri ? (
          <VideoView
            player={player}
            style={{ width: '100%', aspectRatio: 9 / 14, borderRadius: radius.hud, backgroundColor: color.base }}
            contentFit="cover"
            nativeControls
          />
        ) : (
          <View
            style={{
              width: '100%',
              aspectRatio: 9 / 14,
              borderRadius: radius.hud,
              backgroundColor: 'rgba(16,20,28,0.6)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppText variant="nano" color={color.textLo}>
              · NO CLIP CAPTURED ·
            </AppText>
          </View>
        )}
      </View>

      {/* fault timeline */}
      <GlassCard style={{ gap: 8 }}>
        <AppText variant="nano" color={color.textLo}>
          FAULT TIMELINE
        </AppText>
        <View style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.08)' }}>
          {markers.map((m, i) => (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: `${Math.min(98, (m.tSec / Math.max(1, durationSec)) * 100)}%`,
                top: -2,
                width: 4,
                height: 12,
                borderRadius: 2,
                backgroundColor: color.error,
              }}
            />
          ))}
        </View>
        {markers.length === 0 ? (
          <AppText variant="nano" color={color.ok}>
            NO FAULTS MARKED THIS SET
          </AppText>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {markers.map((m, i) => (
              <Chip key={i} label={`${m.tSec.toFixed(0)}s · ${m.name.toUpperCase()}`} tint={color.error} />
            ))}
          </View>
        )}
      </GlassCard>

      <PrimaryButton
        title={deleting ? 'Deleting clip…' : 'Delete & see report'}
        sub="THE CLIP IS DESTROYED NOW"
        onPress={handleContinue}
        disabled={deleting}
      />
    </View>
  );
}
