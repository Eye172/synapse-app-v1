import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EXERCISES } from '@/src/data/exercises';
import { useSettingsStore } from '@/src/store/settingsStore';
import { color, space } from '@/src/theme/tokens';
import { AppText } from '@/src/ui/AppText';
import { Chip } from '@/src/ui/Chip';
import { GridBackdrop } from '@/src/ui/GridBackdrop';
import { HUDFrame, hudTint } from '@/src/ui/HUDFrame';
import { MiniMesh } from '@/src/ui/MiniMesh';
import { PressableScale } from '@/src/ui/PressableScale';
import { PrimaryButton } from '@/src/ui/PrimaryButton';

/**
 * First run (§2.4-A): three slabs — what the Rig is, putting it on, how the
 * link works — then straight into Connect. Never shown again.
 */
export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const scroller = useRef<ScrollView | null>(null);
  const squat = EXERCISES[0]!;

  const finish = (to: '/' | '/connect') => {
    useSettingsStore.getState().set({ onboardingDone: true });
    router.replace(to);
  };

  return (
    <View style={{ flex: 1 }}>
      <GridBackdrop />
      <View style={{ flex: 1, paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.lg }}>
        <View style={{ paddingHorizontal: space.gutter, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText variant="nano" color={color.acid}>
            · SYNAPSE · FIRST LINK ·
          </AppText>
          <PressableScale onPress={() => finish('/')} accessibilityRole="button" accessibilityLabel="Set up later">
            <AppText variant="nano" color={color.textMid}>
              LATER
            </AppText>
          </PressableScale>
        </View>

        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
          style={{ flexGrow: 0, marginTop: space.lg }}
        >
          {/* slab 1 — what the Rig is */}
          <View style={{ width, paddingHorizontal: space.gutter }}>
            <HUDFrame tint={hudTint.mesh} style={{ alignItems: 'center', paddingVertical: space.lg, gap: 10 }}>
              <MiniMesh exercise={squat} size={170} cyclePos={0.35} />
              <AppText variant="nano" color={color.textLo}>
                FIVE SENSORS · ONE BODY · LIVE GRADING
              </AppText>
            </HUDFrame>
            <AppText variant="h1" style={{ marginTop: space.md }}>
              A coach's eyes, instrumented
            </AppText>
            <AppText variant="body" style={{ marginTop: 6 }}>
              The Synapse Rig is a wearable sensor kit. With the app it watches every rep through a live body Mesh —
              grading your form teal → amber → red, counting reps, and speaking up before a bad rep becomes an injury.
            </AppText>
          </View>

          {/* slab 2 — put it on */}
          <View style={{ width, paddingHorizontal: space.gutter }}>
            <HUDFrame tint={hudTint.acid} style={{ paddingVertical: space.lg, gap: 12, alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Chip label="BACK · ARMS · LEGS" tint={color.mesh} dot />
                <Chip label="STRAP SNUG · SENSOR FLAT" tint={color.textMid} />
                <Chip label="POWER ON · LED PULSES" tint={color.acid} />
              </View>
              <AppText variant="display" color={color.acid} style={{ fontSize: 54, lineHeight: 58 }}>
                01
              </AppText>
              <AppText variant="nano" color={color.textLo}>
                NODES REPORT THE MOMENT THEY WAKE
              </AppText>
            </HUDFrame>
            <AppText variant="h1" style={{ marginTop: space.md }}>
              Put the Rig on
            </AppText>
            <AppText variant="body" style={{ marginTop: 6 }}>
              Strap each sensor flat against the segment it measures — back, both arms, both legs. Power the Rig on and
              every node joins the session by itself. Together the five place your whole body.
            </AppText>
          </View>

          {/* slab 3 — how the link works */}
          <View style={{ width, paddingHorizontal: space.gutter }}>
            <HUDFrame tint={hudTint.blue} style={{ paddingVertical: space.lg, gap: 8, alignItems: 'center' }}>
              <AppText variant="monoBody" color={color.mesh} style={{ textAlign: 'center' }}>
                {'RIG ──UDP──▶ PHONE HOTSPOT “Synapse”\n:1234 · JSON · 10HZ'}
              </AppText>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Chip label="NO CLOUD" tint={color.acid} />
                <Chip label="NO PAIRING" tint={color.acid} />
                <Chip label="NOTHING LEAVES THE PHONE" tint={color.mesh} />
              </View>
            </HUDFrame>
            <AppText variant="h1" style={{ marginTop: space.md }}>
              The link is local
            </AppText>
            <AppText variant="body" style={{ marginTop: 6 }}>
              Name your phone's hotspot “Synapse” and the Rig streams straight to the app — no cloud, no account, no
              pairing dance. Nothing about your training ever leaves this phone.
            </AppText>
          </View>
        </ScrollView>

        {/* dots */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 7, marginTop: space.md }}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={{
                width: page === i ? 20 : 7,
                height: 7,
                borderRadius: 4,
                backgroundColor: page === i ? color.acid : 'rgba(255,255,255,0.18)',
              }}
            />
          ))}
        </View>

        <View style={{ flex: 1 }} />

        <View style={{ paddingHorizontal: space.gutter, gap: 8 }}>
          {page < 2 ? (
            <PrimaryButton
              title="Next"
              onPress={() => {
                const next = Math.min(2, page + 1);
                scroller.current?.scrollTo({ x: next * width, animated: true });
                setPage(next);
              }}
            />
          ) : (
            <>
              <PrimaryButton title="Connect the Rig" sub="HOTSPOT · SEARCH · CALIBRATE" onPress={() => finish('/connect')} />
              <PressableScale onPress={() => finish('/')} accessibilityRole="button" accessibilityLabel="Set up later">
                <AppText variant="micro" color={color.textMid} align="center" style={{ paddingVertical: 10 }}>
                  SET UP LATER
                </AppText>
              </PressableScale>
            </>
          )}
        </View>
      </View>
    </View>
  );
}
