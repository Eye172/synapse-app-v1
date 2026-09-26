# Handoff — adding technique grading

Guide for the developer who writes the part that turns the Rig's quaternions
into a judgement of form: done right or wrong, and where. Everything around
that part is already built and wired. The Rig's data reaches you every frame,
and what you return colours the body on screen, shows a warning, speaks it and
vibrates.

## 1. Get it running (10 minutes)

```bash
git clone https://github.com/Eye172/synapse-app-v1.git
cd synapse-app-v1/synapse
npm install
npm test                 # 380+ tests, all green
npm run typecheck
```

Optional browser harnesses, which run the app's own vision code on clips, still
photos and a laptop webcam:

```bash
cd ../harness
npm install
npm run setup            # builds geometry.js from the app's src/ and copies assets
npm run harness          # http://localhost:8099 — clips + reference stills
npm run live             # http://localhost:8098 — laptop webcam
```

After changing anything in `synapse/src`, run `npm run build` in `harness/` so the
pages pick up the new code.

To build an APK yourself, see **Build the APK locally** in `README.md`. To give a
build to a tester, run the GitHub Actions workflow. Every run publishes a Release.

## 2. Where your code goes

**One file is the seam: `synapse/src/technique/evaluator.ts`.**

```ts
export interface TechniqueEvaluator {
  readonly name: string;
  ready(input: TechniqueInput): boolean;          // false → "not checked", nothing is tinted
  evaluate(input: TechniqueInput): TechniqueVerdict;
  reset(): void;                                  // called when every set starts
}
```

Install yours once at startup, in `synapse/app/_layout.tsx` next to
`installPoseVision()`:

```ts
import { setTechniqueEvaluator } from '@/src/technique/evaluator';
setTechniqueEvaluator(new MyEvaluator());
```

Put your implementation next to the seam, for example in
`src/technique/myEvaluator.ts`. Nothing outside `src/technique/` needs to change.

## 3. What you receive, every pose frame of a set

| Field | What it is |
|---|---|
| `input.t` | frame time, ms, on `Date.now()`'s clock |
| `input.exercise` | the lift being performed, with its rules and tolerances (`src/data/exercises.ts`) |
| `input.sensor` | the Rig's latest raw frame, or `null` with no Rig: five nodes `back`, `leftArm`, `rightArm`, `leftLeg`, `rightLeg`, each with `quat: [r, i, j, k]` (scalar first, unit length). A node that has no fix yet carries `fault: 'zero' \| 'denormal'` instead of `quat`. It may also carry the firmware's own `alert` flag |
| `input.rigBody` | **use this one**: the same frame put through the wearer's calibration. For each node, `dir` is the unit direction of that segment in body coordinates (x across, y up, z forward), and `deltaDeg` is how far it has rotated from the calibrated neutral stance |

**The Rig judges; the camera only shows.** The two are not connected, on
purpose. Grading comes from the Rig's quaternions alone, and the camera never
reaches the evaluator. When the phone's camera is on, it tracks the lifter
only to draw the exoskeleton over their picture. Your severities colour that
exoskeleton, so the lifter sees *where* the fault is, on their own body:

| Situation | What is on screen | Where the colours come from |
|---|---|---|
| Rig linked + camera allowed | the exoskeleton over the camera picture | the Rig: rule engine + your evaluator |
| Rig linked, no camera | the Rig's own 3D figure | the same |
| no Rig | nothing: a set does not start until the Rig is linked | — |

The wire format the firmware sends today is
`{"back":[r,i,j,k], "leftArm":[…], "leftLeg":[…], "rightArm":[…], "rightLeg":[…]}`.
It is parsed for you in `src/sources/udp/protocol.ts`.

## 4. What you return

```ts
{
  segments: { leftThigh: 0.8, torso: 0.2 },   // 0 = clean … 1 = a fault worth stopping for
  worst: {                                     // or null
    segment: 'leftThigh',
    label: 'Knee caving in',                   // shown in the chip and on the Review timeline
    severity: 0.8,
    cue: 'Push the knees out',                 // optional: said out loud; without it the label is
  },
  computed: true,                              // false = "not checked", never "clean"
  by: 'my evaluator',
}
```

Segment ids: `head neck torso hips leftArm rightArm leftForearm rightForearm
leftThigh rightThigh leftShin rightShin`.

What happens to it, already implemented:

- Your severities are **merged** with the built-in rule engine's severities: for each segment the worse value wins. The result colours the body continuously, turquoise → amber → red (`meshSeverityColor`).
- `worst` takes over the live screen's fault chip (DRIFT at ≥ 0.55, FAULT at ≥ 1) whenever it is worse than the rule engine's finding. At severity 1 it is also marked on the Review timeline.
- `worst` is also **spoken with a vibration** (from 0.55; a harder buzz at 1), through the same coach that speaks the rule engine's corrections. It has the same limits: at most one correction every 4 s, and the same finding at most once every 9 s unless it gets worse. On a frame where both graders find something, the worse one speaks; on a tie the rule engine does. This is `techniqueFinding()` in `src/coach/RuleCoach.ts`.

**What colour means, in one place:** `src/theme/tokens.ts` → `meshSeverityColor(s)`: turquoise at 0, amber around 0.5, red at 1. You only return numbers; the renderers (`BodyOverlay` on the camera, `MeshView3D` for the Rig) paint each segment from them. Segment ids and the joints each covers are in `src/engine/skeleton.ts`.
- Your output is **sanitized** before it is used: severities are clamped to 0…1, NaN values and unknown segment ids are dropped, and a `worst` without a label is ignored. If your evaluator throws, the frame falls back to "not checked". A bug in grading can't crash the screen or paint a wrong colour.

## 5. The worked example — start here

**`synapse/src/technique/example.test.ts`** contains a complete evaluator, run
through the real `SetEngine` on a full simulated squat set. The simulator
caves both knees in on rep 3 only. The example evaluator finds it on rep 3 and
nowhere else, turns the thighs red, and puts "Knee caving in" in the fault chip.
A second test there shows a finding being spoken. Copy its structure:

- `ready()` returns `input.rigBody !== null`
- per-set state is learned from the first frame and cleared in `reset()`
- a segment is judged only if its node reported; a missing sensor is never guessed

Develop against the simulator first (`SimTimeline` + `SimSensorSource` +
`defaultFaultScript`, deterministic, used by that test). Then feed a real phone
over the hotspot with `node scripts/send-test-packet.js <phone-ip> --stream`,
then use the real Rig.

## 6. Rules of this codebase

- **Never invent data.** If something cannot be measured, return `computed: false` or leave the segment out. "Not checked" and "clean" must stay distinguishable. This is the product's core promise.
- `ready()` and `evaluate()` run up to 30 times a second inside the live screen. Keep them allocation-light and synchronous.
- Add tests next to your code (`*.test.ts`, jest). CI runs `tsc` and `jest` before every APK build.
- Commits follow the existing style: an imperative subject, and a body that explains *why*.

## 7. Map of the rest

| Path | What |
|---|---|
| `synapse/src/technique/` | **your seam** + worked example |
| `synapse/src/engine/` | rule engine, rep counter, metrics, `SetEngine` (calls your evaluator) |
| `synapse/src/sources/udp/` | Rig link: UDP, protocol parser, link state |
| `synapse/src/sources/camera/` | camera detector seam + bridge from the native module |
| `synapse/src/vision/` | tracker, camera solve, body proportions |
| `synapse/src/ui/` | renderer (`BodyOverlay`, `MeshView3D`, `facets.ts` colours) |
| `synapse/src/train/` | training flow screens; `LiveStage.tsx` is the live set |
| `synapse/modules/rig-udp`, `modules/pose-vision` | native Kotlin: UDP receiver; CameraX + MediaPipe |
| `harness/`, `live/` | browser test pages using the app's own code |

Known limits today: the Rig currently runs a base ESP Wi-Fi chip that cannot
sustain the packet rate, so expect sparse data from real hardware until that
chip is swapped. The camera path has been built and verified statically, but it
has not yet run on a phone.
