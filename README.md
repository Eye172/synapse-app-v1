# SYNAPSE — every rep, supervised

**Synapse** pairs a wearable sensor rig (**the Synapse Rig**) with an Android app that replaces the most expensive thing about lifting safely: a coach's eyes on your form. Put the Rig on, pick a lift, and the app watches your body through a live turquoise skeleton (**the Mesh**), grades every joint segment teal → amber → red, counts your reps, speaks corrections out loud, and hands you a report when you rack the weight.

This repository contains the **Rig companion app** — a real, screen-recordable Android app built to the [Master Brief](SYNAPSE_Master-Brief_for_Fable5.md). The app lives in [`synapse/`](synapse); the original firmware prototype and design references live in [`materials/`](materials).

---

## Run it in 2 minutes (Demo Mode — no Rig, no camera, no API key)

Demo Mode is not a stub: the entire training loop — form grading, rep counting, safety alerts, coaching — runs on a physics-consistent simulator with a deterministic fault injector. It is how "fully working" is proven.

```bash
cd synapse
npm install
npx expo start --offline        # add --max-workers 1 on low-RAM machines
```

Then press **`a`** to launch on a connected Android device/emulator (Expo Go works for Demo Mode), or **`w`** for the browser preview.

> **Windows note:** if Metro dies near the end of a bundle, the machine is RAM-starved — use
> `NODE_OPTIONS=--max-old-space-size=3072 npx expo start --offline --max-workers 1`.

### The 60-second demo script

Read this while screen-recording; every line maps 1:1 to an on-screen beat.

| t | Say | Do / See |
|---|-----|----------|
| 0:00 | "This is Synapse. Every rep, supervised." | Home: dark HUD, acid **START TRAINING**, `SIM` chip top-right. |
| 0:05 | "No hardware today — the whole loop runs on the simulator." | Tap **START TRAINING** → pick **Back Squat**. |
| 0:12 | "Every lift ships with a real form lesson…" | Tutorial: Rig footage plays. Tap **Continue**. |
| 0:18 | "…and the set is armed here: sources, recording, duration." | Arm screen: `MESH SIMULATOR / RIG SIM`, duration bar **15·30·60·90s**, *Demo fault · rep 3* ON. Tap **Begin positioning**. |
| 0:26 | "The ghost shows the start position — the Mesh has to step into it." | Acid ghost + turquoise body walks in → ring closes → **POSITION LOCKED**. |
| 0:34 | "Live set. Left rail: angle, tempo, rep count, symmetry." | Live HUD: Mesh squatting, big acid rep counter ticking. |
| 0:42 | "Watch rep three — the simulator injects a knee fault." | Knees + thighs flash **red**, fault chip appears, coach speaks *"Knees out."*, safety banner: **SAFETY · KNEE**. |
| 0:50 | "Every number in the report traces to the rule engine — nothing is invented." | Tap **STOP** → Report: technique ring, per-rule verdicts (`BROKE · REP 3`), coach paragraph. |
| 0:58 | "Metrics save. Video never does." | Tap **Save & finish** → Progress shows the session. |

*(With recording enabled on a camera-equipped device, the loop inserts the REVIEW step: scrub the clip with fault markers, then watch it get hard-deleted the moment you leave.)*

---

## What this build ships vs. the roadmap

| **This build (working today)** | **Roadmap (§7 of the brief)** |
|---|---|
| Full training loop: select → tutorial → arm → position-lock → live set → ephemeral review → report | BLE transport + auto-pairing |
| Deterministic **form-rule engine**: continuous severity grading, safety alerts, hysteresis rep counting, tempo & symmetry | Per-joint quaternions (a second IMU below each knee/elbow) |
| **The Mesh**: Skia skeleton with backbone, ghost alignment, fault tinting — **drawn by the Rig itself** via forward kinematics, or by camera/sim | Cloud accounts, program sync, coach-shared programs |
| **Rig link**: UDP `:1234`, five-node quaternion protocol v2 (both wire forms) + legacy payloads, connect wizard, per-node calibration | Real-time interruptible voice coaching |
| **AI Coach**: RuleCoach always-on (offline); optional Claude coach (`claude-haiku-4-5` in-set ≤8 words, `claude-sonnet-5` debrief) with hard no-fabrication guards | PT / clinical mode |
| Ephemeral recording (app-private cache, hard-deleted on leave/background), history = **metrics only** | Opt-in human form review (the only path video would ever leave) |
| Progress trends, achievements, kit manager, onboarding, Demo Mode everywhere | Social, marketplace, Play Billing, iOS |

**Honest limits of this machine's verification:** everything above is exercised by 109 unit/integration tests plus a full browser walk of every screen; the Android Hermes bundle compiles clean. What could **not** be verified here (no Android device/emulator on the build machine): a physical Rig on the wire (the emulator covers the protocol end-to-end, but not radio behaviour), on-device camera pose, TTS/haptics feel, and on-device fps. The seams for all four are built, guarded, and unit-tested.

---

## The Rig protocol (v2 — five nodes, quaternions)

The exoskeleton carries one IMU per limb plus the back, and ships each frame as a JSON string over UDP to `:1234`. Both spellings below are accepted and carry identical information — use whichever the firmware finds cheaper to serialize.

**Named form** — read as `package.back.alert`, `package.back.quaternions.k`:

```json
{"back":{"alert":false,"quaternions":{"r":0.0,"i":0.0,"j":0.0,"k":0.0}},
 "leftArm":{"alert":false,"quaternions":{"r":0.0,"i":0.0,"j":0.0,"k":0.0}},
 "leftLeg":{"alert":false,"quaternions":{"r":0.0,"i":0.0,"j":0.0,"k":0.0}},
 "rightArm":{"alert":false,"quaternions":{"r":0.0,"i":0.0,"j":0.0,"k":0.0}},
 "rightLeg":{"alert":false,"quaternions":{"r":0.0,"i":0.0,"j":0.0,"k":0.0}}}
```

**Compact form** — read as `package[0].alert`, `package[0].q[3]`:

```json
[{"alert":false,"q":[0.0,0.0,0.0,0.0]},
 {"alert":false,"q":[0.0,0.0,0.0,0.0]},
 {"alert":false,"q":[0.0,0.0,0.0,0.0]},
 {"alert":false,"q":[0.0,0.0,0.0,0.0]},
 {"alert":false,"q":[0.0,0.0,0.0,0.0]}]
```

Contract details the parser enforces:

| Point | Rule |
|---|---|
| **Array order** | `[0] back, [1] leftArm, [2] leftLeg, [3] rightArm, [4] rightLeg` — positional, from `RIG_NODE_ORDER` |
| **`q` order** | `[r, i, j, k]` — scalar first, matching the named form's own field order. One constant (`V2_QUAT_ORDER`) flips it if firmware ever packs scalar-last |
| **Alerts** | Per node. Any node alerting raises the frame alert and a safety stop on its own authority |
| **Partial rigs** | A frame with 2 of 5 nodes is valid — dead straps degrade, they don't break the session |
| **Python reprs** | A raw `str(dict)` (single quotes, `False`/`True`/`None`) is repaired rather than dropped |
| **Hostile input** | Oversized payloads, NaN, non-unit quaternions, wrong types, unknown segment names and `__proto__` keys are all rejected without throwing; intake is rate-capped at 120 packets/s |
| **Legacy** | The prototype's `{"angle":41.7,"alert":true}` and the v1 `nodes[]` form still parse, mapped onto the `back` node |

**What five IMUs can honestly measure.** Segment orientation gives trunk lean, hip angle (trunk↔thigh), shoulder elevation (trunk↔arm), left/right symmetry and a thigh-collapse valgus proxy — all real, all graded. Knee and elbow *flexion* need a second sensor below each joint and are reported as **NO DATA** from the Rig alone, never guessed. Spinal *rounding* is likewise not separable from a correct hinge with one back sensor, so it stays a camera measurement — while the firmware's own `alert` flag still raises a safety stop.

**Calibration is what makes it mounting-agnostic.** Hold a neutral stance for three seconds and every node's reference orientation is captured; from then on the app works in *relative* rotation, so it does not care how the straps happen to sit. The references persist between sessions.

**The Rig draws the body.** With five nodes calibrated, forward kinematics places a full 33-point skeleton — so the Mesh renders, grades and counts reps with **no camera and no pose model at all**. Points the hardware cannot see (ankles, wrists) are drawn but flagged as inferred and carry low confidence.

## Pointing a real Rig at it

The firmware (see [`materials/base/main.py`](materials/base/main.py)) speaks UDP/JSON to the phone's hotspot gateway:

1. Build the dev client (UDP needs a native module — Expo Go won't carry it):
   ```bash
   cd synapse && npx expo run:android        # needs JDK 17 + Android SDK
   ```
2. On the phone: enable the hotspot, name it **`Synapse`** (set a strong password — the firmware default is weak).
3. Power the Rig. In the app: **Profile → Kit → Connect** → the wizard walks `SEARCH → NODES → CALIBRATE → LINKED` (hold neutral 3 s to zero the spine reference).
4. No hardware handy? Emulate the Rig from this repo:
   ```bash
   cd synapse
   node scripts/send-test-packet.js <phone-ip>            # one v2 five-node frame
   node scripts/send-test-packet.js <phone-ip> --stream   # 10 Hz five-node squat cycle
   node scripts/send-test-packet.js <phone-ip> --stream --compact   # the array form
   ```

When LINKED, Rig angles are authoritative for the spine; the camera/sim Mesh covers everything else. The wizard, staleness handling (`SEARCHING`/`LOST` auto-recovery), and hostile-input hardening are unit-tested against the exact firmware payloads.

### Real camera pose (dev build)

The Mesh's camera path ships behind a seam: `CameraPoseSource` + a `PoseDetector` registry with an automatic, honest fallback to the simulator (never a crash, never fake tracking). To light it up on-device, install a pose landmarker (e.g. an MLKit pose module), then register it at startup:

```ts
import { registerPoseDetector } from '@/src/sources/camera/CameraPoseSource';
registerPoseDetector(myMlkitAdapter); // returns 33 landmarks; frames never leave the device
```

### The Claude coach (optional)

**Profile → Coach → AI coach** → paste your own Anthropic API key (verified with a zero-token Models call, stored in the device secure store). With a key: Claude rephrases in-set cues (≤8 words, 2-second deadline, deterministic fallback) and writes the end-of-set debrief from the engine's JSON — it never sees frames and cannot invent numbers. Without a key: the RuleCoach carries everything and the HUD shows `AI COACH OFFLINE`.

---

## Engineering map

```
synapse/
├── app/                    # expo-router: tabs, train modal, connect wizard, onboarding, dev probes
├── src/
│   ├── engine/             # THE TRUTH: rule engine, rep counter, pose→metric derivation, fusion, set session
│   ├── sources/            # the seams: sim (kinematics+timeline), camera (detector registry), udp (protocol+link)
│   ├── coach/              # RuleCoach (deterministic) + LLMCoach (Claude, breakpoints only) + TTS/haptics
│   ├── data/               # 6-exercise seed (full rule specs), tutorial clips, achievements
│   ├── train/              # the training-loop stages (arm/position/live/review/report) + ephemeral recording
│   ├── store/              # zustand: settings, history (metrics only), connection
│   ├── theme/ + ui/        # "Biometric HUD" tokens and component kit
│   └── shims/              # metro shims (node:* → empty on native)
├── scripts/                # asset generator, Rig packet emulator
└── assets/                 # generated brand assets + bundled Rig footage
```

Verification: `npm run typecheck` · `npm test` (74 tests: engine math, rep hysteresis, protocol hostility, coach grounding, ephemeral-deletion contract) · `npx expo export --platform android`.

### Non-negotiables, enforced in code

- **Video is ephemeral.** Recordings live in the app-private cache, are hard-deleted on every exit path from Review (continue/back/background/unmount), never touch the gallery, never upload. History stores numbers.
- **Nothing is fabricated.** Only the deterministic rule engine produces grades, reps, alerts. Claude may only rephrase engine output; over-spec output is discarded for the deterministic cue. Missing data reads **NO DATA**, never a guess.
- **Demo Mode is total.** Every screen and the full loop run with no Rig, no camera, no key, no network.
- **The UI never touches hardware.** Everything flows through `SensorSource` / `PoseSource` / `CoachProvider`.

## Play readiness

- **Package** `com.synapse.rig`, versionCode 1; adaptive icon + splash generated (`npm run gen:assets`).
- **Permissions**: `CAMERA` (live Mesh + optional recording; rationale strings in `app.json`), `VIBRATE`, `INTERNET`/network state (Rig UDP + optional coach). `RECORD_AUDIO` is **blocked** — clips record muted by design.
- **Data safety**: camera frames processed on-device, never stored/shared; recordings app-private + auto-deleted; history metrics stay on-device; the only optional network calls are to `api.anthropic.com` with the user's own key (structured metrics, never media).
- **Disclaimers**: first-run + Profile: *training aid, not medical advice; stop if you feel pain* — plus warm-up prompts on risk-3 lifts.
- Store build: `eas build --platform android` (or `npx expo run:android --variant release` with local SDK/JDK 17).
