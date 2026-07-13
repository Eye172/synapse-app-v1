import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { buzz } from '@/src/coach/haptics';
import { speakCue } from '@/src/coach/speech';
import type { ExerciseSpec, Landmark } from '@/src/engine/types';
import type { SourceBundle } from '@/src/sources/provider';
import { ghostPose } from '@/src/sources/sim/kinematics';
import { color, space } from '@/src/theme/tokens';
import { AppText } from '@/src/ui/AppText';
import { CornerBrackets, bracketTint } from '@/src/ui/CornerBrackets';
import { MeshView, type MeshFrame } from '@/src/ui/MeshView';
import { ScanlineSweep } from '@/src/ui/ScanlineSweep';

import { alignmentScore } from './alignment';

const HOLD_MS = 1500;
const LOCK_SCORE = 0.85;

/**
 * GET_INTO_POSITION (§2.5): the acid ghost target, the live turquoise body
 * drifting into it, a ring that closes while alignment holds, then LOCK.
 * Demo Mode simulates the walk-in with the same alignment math the camera
 * path will use.
 */
export function PositionStage({
  ex,
  sources,
  onLocked,
}: {
  ex: ExerciseSpec;
  sources?: SourceBundle | null;
  onLocked: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const ghost = useMemo(() => ghostPose(ex), [ex]);
  const [frame, setFrame] = useState<MeshFrame | null>(null);
  const [score, setScore] = useState(0);
  const [hold, setHold] = useState(0);
  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false);

  useEffect(() => {
    lockedRef.current = false;
    setLocked(false);
    setHold(0);
    const t0 = Date.now();
    let holdStart: number | null = null;
    let raf: ReturnType<typeof setTimeout> | null = null;
    let unsub: (() => void) | null = null;

    const evaluate = (live: Landmark[], now: number) => {
      const s = alignmentScore(live, ghost);
      setScore(s);
      setFrame({ landmarks: live, segments: {}, t: now });
      if (!lockedRef.current) {
        if (s >= LOCK_SCORE) {
          if (holdStart === null) holdStart = now;
          const h = Math.min(1, (now - holdStart) / HOLD_MS);
          setHold(h);
          if (h >= 1) {
            lockedRef.current = true;
            setLocked(true);
            buzz('lock');
            speakCue('Position locked.');
            setTimeout(onLocked, 700);
            return true;
          }
        } else {
          holdStart = null;
          setHold(0);
        }
      }
      return false;
    };

    if (sources?.poseIsReal) {
      // real camera pose: align the actual body against the ghost
      unsub = sources.pose.onPose((f) => {
        if (!lockedRef.current) evaluate(f.landmarks, f.t);
      });
      sources.pose.start();
    } else {
      // demo: a scripted body walks into the ghost over ~2.4s
      const tick = () => {
        const now = Date.now();
        const t = (now - t0) / 1000;
        const k = Math.min(1, t / 2.4);
        const eased = 1 - (1 - k) ** 3;
        const off = 1 - eased;
        const wob = (f: number, p: number) => Math.sin(t * f + p) * 0.006 * (0.4 + off);
        const live: Landmark[] = ghost.map((g, i) => ({
          ...g,
          x: g.x - off * 0.11 + wob(1.9, i * 0.7),
          y: g.y + off * 0.05 + wob(2.6, i * 1.3),
        }));
        if (evaluate(live, now)) return;
        raf = setTimeout(tick, 33);
      };
      tick();
    }

    return () => {
      if (raf) clearTimeout(raf);
      unsub?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ex, ghost, sources]);

  const ringSize = 108;
  const ring = useMemo(() => {
    const r = ringSize / 2 - 6;
    const p = Skia.Path.Make();
    p.addArc({ x: 6, y: 6, width: r * 2, height: r * 2 }, -90, 360 * hold);
    const track = Skia.Path.Make();
    track.addCircle(ringSize / 2, ringSize / 2, r);
    return { p, track };
  }, [hold]);

  const tint = locked ? color.ok : score >= LOCK_SCORE ? color.acid : color.mesh;

  return (
    <View style={{ flex: 1 }}>
      {!locked ? <ScanlineSweep tint="rgba(33,240,220,0.28)" durationMs={2100} /> : null}
      <View style={{ position: 'absolute', top: 0, left: 0 }}>
        <MeshView frame={frame} ghost={locked ? null : ghost} width={width} height={height} />
      </View>

      <View style={{ position: 'absolute', top: space.xl + 26, left: 0, right: 0, alignItems: 'center', gap: 4 }}>
        <AppText variant="nano" color={color.acid}>
          {`· ${ex.name.toUpperCase()} · POSITION ·`}
        </AppText>
        <AppText variant="h2" color={locked ? color.ok : color.textHi}>
          {locked ? 'POSITION LOCKED' : 'Step into the frame'}
        </AppText>
        <AppText variant="micro" color={color.textMid}>
          {locked ? 'STARTING THE SET' : 'ALIGN YOUR BODY WITH THE GREEN TARGET'}
        </AppText>
      </View>

      <View style={{ position: 'absolute', bottom: 110, left: 0, right: 0, alignItems: 'center', gap: 8 }}>
        <View style={{ width: ringSize, height: ringSize, alignItems: 'center', justifyContent: 'center' }}>
          <Canvas style={{ width: ringSize, height: ringSize, position: 'absolute' }}>
            <Path path={ring.track} style="stroke" strokeWidth={3} color="rgba(255,255,255,0.10)" />
            <Path path={ring.p} style="stroke" strokeWidth={3.5} strokeCap="round" color={tint} />
          </Canvas>
          <AppText variant="monoValue" color={tint} style={{ fontSize: 22 }}>
            {`${Math.round(score * 100)}%`}
          </AppText>
          <AppText variant="nano" color={color.textLo}>
            ALIGNED
          </AppText>
        </View>
        <View style={{ paddingHorizontal: 14, paddingVertical: 6 }}>
          <CornerBrackets size={10} tint={locked ? 'rgba(22,227,154,0.6)' : bracketTint.dim} />
          <AppText variant="nano" color={locked ? color.ok : color.textMid}>
            {locked ? 'LOCK CONFIRMED' : score >= LOCK_SCORE ? 'HOLD IT' : 'KEEP MOVING IN'}
          </AppText>
        </View>
      </View>
    </View>
  );
}
