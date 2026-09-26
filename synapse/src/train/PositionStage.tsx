import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { buzz } from '@/src/coach/haptics';
import { speakCue } from '@/src/coach/speech';
import type { ExerciseSpec, PoseFrame } from '@/src/engine/types';
import type { SourceBundle } from '@/src/sources/provider';
import { useSettingsStore } from '@/src/store/settingsStore';
import { color, space } from '@/src/theme/tokens';
import { AppText } from '@/src/ui/AppText';
import { CornerBrackets, bracketTint } from '@/src/ui/CornerBrackets';
import { LiveBody } from '@/src/ui/LiveBody';
import { ScanlineSweep } from '@/src/ui/ScanlineSweep';
import { useBodyTracking } from '@/src/vision/useBodyTracking';
import { coverViewport, landmarksToScreen } from '@/src/vision/viewport';

import { FRAMING_HINT, assessFraming } from './framing';

/** How long the lifter must stay framed before the set begins. */
const HOLD_MS = 1500;

/**
 * GET_INTO_POSITION (§2.5): the lifter sees themselves, with their 3D body
 * tracked onto the picture, and is told what to fix until the camera sees
 * every joint the set is graded from. Held for a moment, it locks and the
 * set begins — on the same camera, the same tracker settings, no restart.
 *
 * There is no target pose to match and nothing simulated: readiness is
 * decided from what the detector actually reports (`framing.ts`).
 */
export function PositionStage({
  ex,
  sources,
  onLocked,
}: {
  ex: ExerciseSpec;
  sources: SourceBundle;
  onLocked: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const mirrored = useSettingsStore((s) => s.cameraFacing) === 'front';

  // the camera source is started here and keeps running into the set
  const poseRef = useRef(sources.pose);
  poseRef.current = sources.pose;
  useEffect(() => {
    sources.pose.start();
  }, [sources]);
  const subscribe = useMemo(() => (cb: (f: PoseFrame) => void) => poseRef.current.onPose(cb), []);
  const { tracker, status } = useBodyTracking(subscribe);

  const framing = useMemo(() => {
    const onScreen =
      status.image && status.frame
        ? landmarksToScreen(status.image, coverViewport(status.frame, { width, height }, mirrored))
        : null;
    return assessFraming(onScreen, status.placed);
  }, [status, width, height, mirrored]);

  const [hold, setHold] = useState(0);
  const [locked, setLocked] = useState(false);
  const readySince = useRef<number | null>(null);
  const onLockedRef = useRef(onLocked);
  onLockedRef.current = onLocked;

  useEffect(() => {
    if (locked) return undefined;
    if (framing.issue !== 'ready') {
      readySince.current = null;
      setHold(0);
      return undefined;
    }
    const now = Date.now();
    if (readySince.current === null) readySince.current = now;
    const h = Math.min(1, (now - readySince.current) / HOLD_MS);
    setHold(h);
    if (h < 1) return undefined;
    setLocked(true);
    buzz('lock');
    speakCue('Position locked.');
    return undefined;
  }, [framing, locked]);

  // a beat on POSITION LOCKED, then the set — its own effect, so the framing
  // updates that keep arriving cannot cancel the handover
  useEffect(() => {
    if (!locked) return undefined;
    const t = setTimeout(() => onLockedRef.current(), 700);
    return () => clearTimeout(t);
  }, [locked]);

  const ringSize = 108;
  const ring = useMemo(() => {
    const r = ringSize / 2 - 6;
    const p = Skia.Path.Make();
    p.addArc({ x: 6, y: 6, width: r * 2, height: r * 2 }, -90, 360 * hold);
    const track = Skia.Path.Make();
    track.addCircle(ringSize / 2, ringSize / 2, r);
    return { p, track };
  }, [hold]);

  const ready = framing.issue === 'ready';
  const tint = locked ? color.ok : ready ? color.acid : color.mesh;
  const copy = FRAMING_HINT[framing.issue];

  // the numbers the camera has recovered, so what is being measured is visible
  const readout = [
    `JOINTS ${framing.seen}/${framing.total}`,
    status.distance !== null ? `DISTANCE ${status.distance.toFixed(1)} M` : null,
    status.height !== null && status.confidence > 0.3 ? `HEIGHT ${status.height.toFixed(2)} M` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={{ flex: 1 }}>
      {!locked ? <ScanlineSweep tint="rgba(33,240,220,0.28)" durationMs={2100} /> : null}
      <View style={{ position: 'absolute', top: 0, left: 0 }} pointerEvents="none">
        <LiveBody tracker={tracker} width={width} height={height} mirrored={mirrored} />
      </View>

      <View style={{ position: 'absolute', top: space.xl + 26, left: 0, right: 0, alignItems: 'center', gap: 4 }}>
        <AppText variant="nano" color={color.acid}>
          {`· ${ex.name.toUpperCase()} · POSITION ·`}
        </AppText>
        <AppText variant="h2" color={locked ? color.ok : color.textHi}>
          {locked ? 'POSITION LOCKED' : copy.title}
        </AppText>
        <AppText variant="micro" color={locked ? color.ok : ready ? color.acid : color.textMid} align="center">
          {locked ? 'STARTING THE SET' : copy.hint}
        </AppText>
      </View>

      <View style={{ position: 'absolute', bottom: 110, left: 0, right: 0, alignItems: 'center', gap: 8 }}>
        <View style={{ width: ringSize, height: ringSize, alignItems: 'center', justifyContent: 'center' }}>
          <Canvas style={{ width: ringSize, height: ringSize, position: 'absolute' }}>
            <Path path={ring.track} style="stroke" strokeWidth={3} color="rgba(255,255,255,0.10)" />
            <Path path={ring.p} style="stroke" strokeWidth={3.5} strokeCap="round" color={tint} />
          </Canvas>
          <AppText variant="monoValue" color={tint} style={{ fontSize: 22 }}>
            {`${framing.seen}/${framing.total}`}
          </AppText>
          <AppText variant="nano" color={color.textLo}>
            IN FRAME
          </AppText>
        </View>
        <View style={{ paddingHorizontal: 14, paddingVertical: 6 }}>
          <CornerBrackets size={10} tint={locked ? 'rgba(22,227,154,0.6)' : bracketTint.dim} />
          <AppText variant="nano" color={locked ? color.ok : color.textMid}>
            {readout}
          </AppText>
        </View>
      </View>
    </View>
  );
}
