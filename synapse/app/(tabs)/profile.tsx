import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Linking, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getAiKey, setAiKey, verifyAiKey } from '@/src/coach/aiKeyStore';
import { useConnectionStore } from '@/src/store/connectionStore';
import { useSettingsStore } from '@/src/store/settingsStore';
import { color, radius, space } from '@/src/theme/tokens';
import { font } from '@/src/theme/typography';
import { AppSwitch } from '@/src/ui/AppSwitch';
import { AppText } from '@/src/ui/AppText';
import { Chip } from '@/src/ui/Chip';
import { GlassCard } from '@/src/ui/GlassCard';
import { GridBackdrop } from '@/src/ui/GridBackdrop';
import { PressableScale } from '@/src/ui/PressableScale';
import { ScreenHeader } from '@/src/ui/ScreenHeader';

function Row({
  label,
  sub,
  right,
  onPress,
}: {
  label: string;
  sub?: string;
  right?: React.ReactNode;
  onPress?: () => void;
}) {
  const inner = (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: 10 }}>
      <View style={{ flex: 1 }}>
        <AppText variant="bodyMed">{label}</AppText>
        {sub ? (
          <AppText variant="nano" color={color.textLo} style={{ marginTop: 2 }}>
            {sub}
          </AppText>
        ) : null}
      </View>
      {right}
    </View>
  );
  if (onPress) {
    return (
      <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
        {inner}
      </PressableScale>
    );
  }
  return inner;
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.05)' }} />;
}

/**
 * Kit manager (§2.4-F): rename the Rig, battery, firmware note, re-calibrate.
 */
function KitSection({ onConnect }: { onConnect: () => void }) {
  const rigName = useConnectionStore((s) => s.rigName);
  const mode = useConnectionStore((s) => s.mode);
  const battery = useConnectionStore((s) => s.battery);
  const offsets = useSettingsStore((s) => s.rigZeroOffsets);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(rigName);

  const saveName = () => {
    const name = draft.trim();
    if (name.length > 0) useConnectionStore.getState().set({ rigName: name.slice(0, 24) });
    setEditing(false);
  };

  return (
    <View>
      <Row
        label={rigName}
        sub={mode === 'linked' ? 'LINKED · TAP FOR DETAILS' : 'NOT LINKED · TAP FOR DETAILS'}
        right={<Chip label={mode.toUpperCase()} tint={mode === 'linked' ? color.acid : color.blue} />}
        onPress={() => {
          setDraft(rigName);
          setEditing((e) => !e);
        }}
      />
      {editing ? (
        <View style={{ gap: 8, paddingBottom: 10 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              maxLength={24}
              accessibilityLabel="Rig name"
              style={{
                flex: 1,
                fontFamily: font.mono,
                fontSize: 12,
                color: color.textHi,
                backgroundColor: 'rgba(16,20,28,0.7)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.1)',
                borderRadius: radius.hud,
                paddingHorizontal: 12,
                paddingVertical: 9,
              }}
            />
            <PressableScale onPress={saveName} accessibilityRole="button" accessibilityLabel="Save rig name">
              <View style={{ backgroundColor: color.acid, borderRadius: radius.hud, paddingHorizontal: 14, justifyContent: 'center', height: '100%' }}>
                <AppText variant="nano" color={color.inkOnAcid}>
                  RENAME
                </AppText>
              </View>
            </PressableScale>
          </View>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            <Chip label={`BATT · ${battery === null ? '—' : `${battery}%`}`} tint={battery !== null && battery < 20 ? color.warn : color.textMid} />
            <Chip label="FIRMWARE · V0 UDP" tint={color.textMid} />
            <Chip
              label={offsets.spine !== undefined ? `CALIBRATED · ${offsets.spine.toFixed(1)}°` : 'NOT CALIBRATED'}
              tint={offsets.spine !== undefined ? color.mesh : color.textLo}
            />
          </View>
          <PressableScale onPress={onConnect} accessibilityRole="button" accessibilityLabel="Open connect and calibration">
            <View style={{ borderWidth: 1, borderColor: 'rgba(33,240,220,0.35)', borderRadius: radius.hud, paddingVertical: 10, alignItems: 'center' }}>
              <AppText variant="nano" color={color.mesh}>
                {mode === 'linked' ? 'RE-CALIBRATE / MANAGE LINK' : 'CONNECT THE RIG'}
              </AppText>
            </View>
          </PressableScale>
        </View>
      ) : null}
    </View>
  );
}

/**
 * AI coach key management (§2.8): optional Anthropic key, kept in the device
 * secure store. No key ⇒ RuleCoach carries every session; the app never asks.
 */
function AiCoachSection() {
  const aiKeyPresent = useSettingsStore((s) => s.aiKeyPresent);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // reconcile the persisted flag with what the secure store actually holds
  useEffect(() => {
    getAiKey().then((k) => {
      const present = k !== null && k.length > 0;
      if (present !== useSettingsStore.getState().aiKeyPresent) {
        useSettingsStore.getState().set({ aiKeyPresent: present });
      }
    });
  }, []);

  const saveKey = async () => {
    const key = draft.trim();
    if (!key) return;
    setBusy(true);
    setNote('VERIFYING KEY…');
    const res = await verifyAiKey(key);
    if (res.ok) {
      await setAiKey(key);
      setNote('KEY VERIFIED · CLAUDE COACH ONLINE');
      setDraft('');
      setEditing(false);
    } else {
      setNote(`VERIFY FAILED · ${res.reason ?? 'CHECK THE KEY'}`.toUpperCase().slice(0, 60));
    }
    setBusy(false);
  };

  const clearKey = async () => {
    setBusy(true);
    await setAiKey(null);
    setNote('KEY REMOVED · RULE COACH ACTIVE');
    setDraft('');
    setEditing(false);
    setBusy(false);
  };

  return (
    <View>
      <Row
        label="AI coach"
        sub={aiKeyPresent ? 'CLAUDE NARRATES · RULES STILL GRADE' : 'NO KEY SET · RULE COACH ACTIVE'}
        right={<Chip label={aiKeyPresent ? 'ONLINE' : 'OFFLINE'} tint={aiKeyPresent ? color.acid : color.textLo} />}
        onPress={() => {
          setEditing((e) => !e);
          setNote(null);
        }}
      />
      {editing ? (
        <View style={{ gap: 8, paddingBottom: 10 }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="sk-ant-…"
            placeholderTextColor={color.textLo}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            accessibilityLabel="Anthropic API key"
            style={{
              fontFamily: font.mono,
              fontSize: 12,
              color: color.textHi,
              backgroundColor: 'rgba(16,20,28,0.7)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.1)',
              borderRadius: radius.hud,
              paddingHorizontal: 12,
              paddingVertical: 9,
            }}
          />
          <AppText variant="nano" color={color.textLo}>
            YOUR OWN ANTHROPIC KEY · STORED IN THE DEVICE SECURE STORE · USED ONLY FOR COACHING CALLS
          </AppText>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <PressableScale
              onPress={saveKey}
              disabled={busy || draft.trim().length === 0}
              accessibilityRole="button"
              accessibilityLabel="Verify and save key"
              style={{ flex: 1 }}
            >
              <View
                style={{
                  backgroundColor: busy || draft.trim().length === 0 ? color.surface1 : color.acid,
                  borderRadius: radius.hud,
                  paddingVertical: 10,
                  alignItems: 'center',
                }}
              >
                <AppText variant="nano" color={busy || draft.trim().length === 0 ? color.textLo : color.inkOnAcid}>
                  {busy ? 'WORKING…' : 'VERIFY & SAVE'}
                </AppText>
              </View>
            </PressableScale>
            {aiKeyPresent ? (
              <PressableScale onPress={clearKey} disabled={busy} accessibilityRole="button" accessibilityLabel="Remove key" style={{ flex: 1 }}>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: 'rgba(255,59,92,0.4)',
                    borderRadius: radius.hud,
                    paddingVertical: 10,
                    alignItems: 'center',
                  }}
                >
                  <AppText variant="nano" color={color.error}>
                    REMOVE KEY
                  </AppText>
                </View>
              </PressableScale>
            ) : null}
          </View>
          {note ? (
            <AppText variant="nano" color={note.includes('FAILED') ? color.error : color.acid}>
              {note}
            </AppText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const settings = useSettingsStore();

  return (
    <View style={{ flex: 1 }}>
      <GridBackdrop />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 120, gap: space.md }}
      >
        <ScreenHeader eyebrow="PROFILE" title="Operator" />

        <View style={{ paddingHorizontal: space.gutter, gap: space.sm }}>
          <GlassCard>
            <AppText variant="nano" color={color.textLo} style={{ marginBottom: 4 }}>
              KIT
            </AppText>
            <KitSection onConnect={() => router.push('/connect')} />
            <Divider />
            <Row
              label="Buy / manage kit"
              sub="SYNAPSE RIG · SENSOR NODES"
              right={
                <AppText variant="h3" color={color.textLo}>
                  ↗
                </AppText>
              }
              onPress={() => {
                // placeholder storefront — swap for the real shop before launch
                Linking.openURL('https://synapse-rig.example.com/kit').catch(() => {});
              }}
            />
          </GlassCard>

          <GlassCard>
            <AppText variant="nano" color={color.textLo} style={{ marginBottom: 4 }}>
              COACH
            </AppText>
            <Row
              label="Voice cues"
              sub="SPOKEN CORRECTIONS DURING THE SET"
              right={
                <AppSwitch value={settings.voiceOn} onValueChange={(v) => settings.set({ voiceOn: v })} accessibilityLabel='Voice cues' />
              }
            />
            <Divider />
            <Row
              label="Haptics"
              sub="BUZZ ON DRIFT AND FAULTS"
              right={
                <AppSwitch value={settings.hapticsOn} onValueChange={(v) => settings.set({ hapticsOn: v })} accessibilityLabel='Haptics' />
              }
            />
            <Divider />
            <Row
              label="Verbosity"
              sub={settings.coachVerbosity === 'quiet' ? 'QUIET · ONLY SAFETY IS SPOKEN' : 'NORMAL · CORRECTIONS SPOKEN'}
              right={
                <PressableScale
                  onPress={() =>
                    settings.set({ coachVerbosity: settings.coachVerbosity === 'quiet' ? 'normal' : 'quiet' })
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Toggle coach verbosity"
                >
                  <Chip
                    label={settings.coachVerbosity.toUpperCase()}
                    tint={settings.coachVerbosity === 'normal' ? color.acid : color.textMid}
                  />
                </PressableScale>
              }
            />
            <Divider />
            <AiCoachSection />
          </GlassCard>

          <GlassCard>
            <AppText variant="nano" color={color.textLo} style={{ marginBottom: 4 }}>
              TRAINING
            </AppText>
            <Row
              label="Units"
              right={
                <PressableScale onPress={() => settings.set({ units: settings.units === 'kg' ? 'lb' : 'kg' })} accessibilityRole="button" accessibilityLabel="Toggle units">
                  <Chip label={settings.units.toUpperCase()} tint={color.acid} />
                </PressableScale>
              }
            />
            <Divider />
            <Row
              label="Demo mode"
              sub="RUN EVERYTHING ON THE SIMULATOR"
              right={
                <AppSwitch value={settings.demoModeForced} onValueChange={(v) => settings.set({ demoModeForced: v })} accessibilityLabel='Demo mode' />
              }
            />
          </GlassCard>

          <GlassCard>
            <AppText variant="nano" color={color.textLo} style={{ marginBottom: 4 }}>
              PRIVACY
            </AppText>
            <AppText variant="body" style={{ marginBottom: 6 }}>
              Camera frames are processed on this device and never stored or sent anywhere. Set recordings live in the
              app’s private cache and are hard-deleted the moment you leave review. Your history keeps numbers, never
              video.
            </AppText>
            <Chip label="EPHEMERAL BY DESIGN" tint={color.mesh} />
          </GlassCard>

          <GlassCard>
            <AppText variant="nano" color={color.textLo} style={{ marginBottom: 4 }}>
              SYSTEM
            </AppText>
            <Row
              label="Diagnostics"
              sub="LIVE ENGINE PROBES · SIM STREAM"
              right={
                <AppText variant="h3" color={color.textLo}>
                  ›
                </AppText>
              }
              onPress={() => router.push('/dev')}
            />
          </GlassCard>

          <AppText variant="nano" color={color.textLo} style={{ textAlign: 'center', paddingHorizontal: space.lg }}>
            SYNAPSE IS A TRAINING AID, NOT MEDICAL ADVICE. STOP IF YOU FEEL PAIN.
          </AppText>
        </View>
      </ScrollView>
    </View>
  );
}
