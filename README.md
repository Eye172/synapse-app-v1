# SYNAPSE — every rep, supervised

> **Выпустить приложение и отдать тестировщику → [ЗАПУСК.md](%D0%97%D0%90%D0%9F%D0%A3%D0%A1%D0%9A.md)** (пошагово, на русском).
> Инструкция для самого тестировщика → [TESTING.md](TESTING.md).

**Synapse** pairs a wearable sensor rig (**the Synapse Rig**) with an Android app that replaces the most expensive thing about lifting safely: a coach's eyes on your form. Put the Rig on, pick a lift, and the app watches your body through a live turquoise skeleton (**the Mesh**), grades every joint segment teal → amber → red, counts your reps, speaks corrections out loud, and hands you a report when you rack the weight.

This repository contains the **Rig companion app** — a real, screen-recordable Android app built to the [Master Brief](SYNAPSE_Master-Brief_for_Fable5.md). The app lives in [`synapse/`](synapse); the original firmware prototype and design references live in [`materials/`](materials).

---

## There is no demo mode

Synapse grades what its sensors can actually see. If neither the Rig nor the camera is available, a set **does not start** — the app says `NOTHING TO MEASURE WITH` and offers to connect. If the Rig drops mid-set, the Mesh freezes and a full-width `RIG LINK LOST` banner says the set is no longer being graded.

This is a product decision, not a missing feature. A form coach that animates a plausible body while measuring nothing is worse than no coach: it teaches the lifter to trust it right up until the rep that hurts them. Every skeleton on screen is drawn from live sensor data or it is not drawn.

A simulator does exist — it drives the 132-test suite and development builds, gated behind `__DEV__` so it is absent from any APK a user installs.

### Run it

```bash
cd synapse
npm install
npx expo start --offline        # add --max-workers 1 on low-RAM machines
```

Press **`a`** for a connected Android device/emulator, **`w`** for the browser preview. To exercise the full loop you need a source: a Rig on the hotspot, a camera-equipped device, or a dev build (where the simulator stands in). To feed the app real packets without hardware:

```bash
node scripts/send-test-packet.js <phone-ip> --stream
```

> **Windows note:** if Metro dies near the end of a bundle, the machine is RAM-starved — use
> `NODE_OPTIONS=--max-old-space-size=3072 npx expo start --offline --max-workers 1`.

---

## What this build ships vs. the roadmap

| **This build (working today)** | **Roadmap (§7 of the brief)** |
|---|---|
| Full training loop: select → tutorial → arm → position-lock → live set → ephemeral review → report | BLE transport + auto-pairing |
| Deterministic **form-rule engine**: continuous severity grading, safety alerts, hysteresis rep counting, tempo & symmetry | Per-joint quaternions (a second IMU below each knee/elbow) |
| **The Mesh**: Skia skeleton with backbone, ghost alignment, fault tinting — **drawn by the Rig itself** via forward kinematics, or by the camera | Cloud accounts, program sync, coach-shared programs |
| **Rig link**: UDP `:1234`, five-node quaternion protocol v2 (both wire forms) + legacy payloads, connect wizard, per-node calibration | Real-time interruptible voice coaching |
| **AI Coach**: RuleCoach always-on (offline); optional Claude coach (`claude-haiku-4-5` in-set ≤8 words, `claude-sonnet-5` debrief) with hard no-fabrication guards | PT / clinical mode |
| Ephemeral recording (app-private cache, hard-deleted on leave/background), history = **metrics only** | Opt-in human form review (the only path video would ever leave) |
| Progress trends, achievements, kit manager, onboarding, on-phone sensor setup (no rebuild to fix mount conventions) | Social, marketplace, Play Billing, iOS |

**Honest limits of this machine's verification:** everything above is exercised by 132 unit/integration tests plus a full browser walk of every screen; the Android Hermes bundle compiles clean. What could **not** be verified here (no Android device/emulator on the build machine): a physical Rig on the wire (the emulator covers the protocol end-to-end, but not radio behaviour), on-device camera pose, TTS/haptics feel, and on-device fps. The seams for all four are built, guarded, and unit-tested.

---

## The Rig protocol (v2 — five nodes, quaternions)

The exoskeleton carries one IMU per limb plus the back, and ships each frame as a JSON string over UDP to `:1234`. Both spellings below are accepted and carry identical information — use whichever the firmware finds cheaper to serialize.

`a` is the node's alert flag, `q` its quaternion.

**Named form** — read as `package.back.a`, `package.back.q.k`:

```json
{"back":{"a":false,"q":{"r":0.0,"i":0.0,"j":0.0,"k":0.0}},
 "leftArm":{"a":false,"q":{"r":0.0,"i":0.0,"j":0.0,"k":0.0}},
 "leftLeg":{"a":false,"q":{"r":0.0,"i":0.0,"j":0.0,"k":0.0}},
 "rightArm":{"a":false,"q":{"r":0.0,"i":0.0,"j":0.0,"k":0.0}},
 "rightLeg":{"a":false,"q":{"r":0.0,"i":0.0,"j":0.0,"k":0.0}}}
```

**Compact form** — read as `package[0].a`, `package[0].q[3]`:

```json
[{"a":false,"q":[0.0,0.0,0.0,0.0]},
 {"a":false,"q":[0.0,0.0,0.0,0.0]},
 {"a":false,"q":[0.0,0.0,0.0,0.0]},
 {"a":false,"q":[0.0,0.0,0.0,0.0]},
 {"a":false,"q":[0.0,0.0,0.0,0.0]}]
```

Contract details the parser enforces:

| Point | Rule |
|---|---|
| **Array order** | `[0] back, [1] leftArm, [2] leftLeg, [3] rightArm, [4] rightLeg` — positional, from `RIG_NODE_ORDER` |
| **`q` shape** | An object `{r,i,j,k}` in the named form, a packed array in the compact one. The two can never be confused — the parser tells them apart by shape, not by key |
| **`q` order** | Packed: `[r, i, j, k]`, scalar first, matching the named form's own field order. A runtime toggle (Sensor setup) flips it if firmware packs scalar-last; the named form is unambiguous and ignores it |
| **Alerts** | Per node, under `a`. Any node alerting raises the frame alert and a safety stop on its own authority |
| **Key spelling** | `a`/`q` is what the firmware ships. The earlier `alert`/`quaternions` still parse — a rig running older firmware would otherwise be indistinguishable from dead hardware |
| **Zero quaternions** | `{r:0,i:0,j:0,k:0}` is not a rotation — it is what an uninitialized or failed IMU read looks like, so it is dropped rather than drawn. The node still reports, and its `a` flag still counts; only the orientation is withheld. Identity is `r:1`. |
| **Partial rigs** | A frame with 2 of 5 nodes is valid — dead straps degrade, they don't break the session |
| **Python reprs** | A raw `str(dict)` (single quotes, `False`/`True`/`None`) is repaired rather than dropped |
| **Hostile input** | Oversized payloads, NaN, non-unit quaternions, wrong types, unknown segment names and `__proto__` keys are all rejected without throwing; intake is rate-capped at 120 packets/s |
| **Legacy** | The prototype's `{"angle":41.7,"alert":true}` and the v1 `nodes[]` form still parse, mapped onto the `back` node |

**What five IMUs can honestly measure.** Segment orientation gives trunk lean, hip angle (trunk↔thigh), shoulder elevation (trunk↔arm), left/right symmetry and a thigh-collapse valgus proxy — all real, all graded. Knee and elbow *flexion* need a second sensor below each joint and are reported as **NO DATA** from the Rig alone, never guessed. Spinal *rounding* is likewise not separable from a correct hinge with one back sensor, so it stays a camera measurement — while the firmware's own `alert` flag still raises a safety stop.

**Calibration is what makes it mounting-agnostic.** Hold a neutral stance for three seconds and every node's reference orientation is captured; from then on the app works in *relative* rotation, so it does not care how the straps happen to sit. The references persist between sessions.

**The Rig draws the body.** With five nodes calibrated, forward kinematics places a full 33-point skeleton — so the Mesh renders, grades and counts reps with **no camera and no pose model at all**. Points the hardware cannot see (ankles, wrists) are drawn but flagged as inferred and carry low confidence.

## Pointing a real Rig at it

> **Field-testing with hardware?** Read [TESTING.md](TESTING.md) first — it covers building the APK (the rig link needs a native module Expo Go does not carry), the three things to verify in the first five minutes on real hardware, and what to ask the tester for.

The firmware (see [`materials/base/main.py`](materials/base/main.py)) speaks UDP/JSON to the phone's hotspot gateway:

1. Build the dev client (the UDP receiver is a native module — Expo Go won't carry it):
   ```bash
   cd synapse && npx expo run:android        # needs JDK 17 + Android SDK
   ```
2. On the phone: enable the hotspot with **exactly** the name and password the Connect screen shows. Both are compiled into the Rig (`AT+CWJAP="Synapse","…"`) — a "better" password means it never joins.
3. Power the Rig. In the app: **Profile → HARDWARE → Synapse Rig** → the wizard walks `SEARCH → NODES → CALIBRATE → LINKED` (hold neutral 3 s to zero the five reference quaternions).
4. No hardware handy? Emulate the Rig from this repo:
   ```bash
   cd synapse
   node scripts/send-test-packet.js <phone-ip>            # one v2 five-node frame
   node scripts/send-test-packet.js <phone-ip> --stream   # 10 Hz five-node squat cycle
   node scripts/send-test-packet.js <phone-ip> --stream --compact   # the array form
   ```

When LINKED the Rig is the instrument: five IMUs place the whole body, so it both grades and draws the Mesh. The wizard, staleness handling (`SEARCHING`/`LOST` auto-recovery), and hostile-input hardening are unit-tested against the exact firmware payloads.

**The address is the firmware's, not the app's.** The Rig sends to `192.168.43.1:1234` unconditionally — its source asserts that Android hotspots are "always" that address, which stopped being true years ago. The app listens on every interface, so it does not care where a packet lands; the Rig does. Connect therefore enumerates every IPv4 address the phone actually holds and states plainly whether `192.168.43.1` is among them. (The platform's own "what is my IP" cannot answer this: on a phone joined to Wi-Fi *while* hosting the hotspot it reports the home network.) When the phone does not hold it, the fix is a different phone or one line of firmware — see [ЗАПУСК.md](%D0%97%D0%90%D0%9F%D0%A3%D0%A1%D0%9A.md).

**Mount conventions are fixed on the phone, not in a rebuild.** Quaternion component order (`[r,i,j,k]` vs `[i,j,k,r]`) and which board axis runs along the segment are toggles in **Profile → HARDWARE → Sensor setup**, with live per-segment directions that turn green when the convention is right. A tester with an unknown firmware build converges in about twenty seconds.

### Real camera pose (dev build)

The Mesh's camera path ships behind a seam: `CameraPoseSource` + a `PoseDetector` registry. With no detector registered the camera reports unavailable and the app says so — it never invents tracking. To light it up on-device, install a pose landmarker (e.g. an MLKit pose module), then register it at startup:

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
├── app/                    # expo-router: tabs, train modal, connect wizard, onboarding, sensor setup
├── src/
│   ├── engine/             # THE TRUTH: rule engine, rep counter, pose→metric derivation, fusion, set session
│   ├── sources/            # the seams: udp (protocol+link+rig pose), camera (detector registry), sim (__DEV__/tests only)
│   ├── coach/              # RuleCoach (deterministic) + LLMCoach (Claude, breakpoints only) + TTS/haptics
│   ├── data/               # 6-exercise seed (full rule specs), tutorial clips, achievements
│   ├── train/              # the training-loop stages (arm/position/live/review/report) + ephemeral recording
│   ├── store/              # zustand: settings, history (metrics only), connection
│   ├── theme/ + ui/        # "Biometric HUD" tokens and component kit
│   └── shims/              # metro shims (node:* → empty on native)
├── modules/rig-udp/        # local Expo module: the native UDP receiver (Kotlin, ~100 lines)
├── scripts/                # asset generator, Rig packet emulator
└── assets/                 # generated brand assets + the two lesson clips we can honestly label
```

Verification: `npm run typecheck` · `npm test` (132 tests: quaternion + forward-kinematics math, rep hysteresis, protocol hostility across both wire forms, coach grounding, ephemeral-deletion contract) · `npx expo export --platform android`.

### Non-negotiables, enforced in code

- **Video is ephemeral.** Recordings live in the app-private cache, are hard-deleted on every exit path from Review (continue/back/background/unmount), never touch the gallery, never upload. History stores numbers.
- **Nothing is fabricated.** Only the deterministic rule engine produces grades, reps, alerts. Claude may only rephrase engine output; over-spec output is discarded for the deterministic cue. Missing data reads **NO DATA**, never a guess. That extends to the lesson clips: the source footage covers a squat and a shoulder press, so those two lifts get a video and the other four say they have none — a pull-up standing in for a deadlift teaches the wrong movement to somebody holding a loaded bar.
- **No pretend workouts.** With no instrument, the set refuses to start; when the instrument drops mid-set, the screen says so. The simulator is `__DEV__`-gated and cannot reach a user's build.
- **The UI never touches hardware.** Everything flows through `SensorSource` / `PoseSource` / `CoachProvider`.

## Play readiness

- **Package** `com.synapse.rig`, versionCode 1; adaptive icon + splash generated (`npm run gen:assets`).
- **Permissions**: `CAMERA` (live Mesh + optional recording; rationale strings in `app.json`), `VIBRATE`, `INTERNET`/network state (Rig UDP + optional coach). `RECORD_AUDIO` is **blocked** — clips record muted by design.
- **Data safety**: camera frames processed on-device, never stored/shared; recordings app-private + auto-deleted; history metrics stay on-device; the only optional network calls are to `api.anthropic.com` with the user's own key (structured metrics, never media).
- **Disclaimers**: first-run + Profile: *training aid, not medical advice; stop if you feel pain* — plus warm-up prompts on risk-3 lifts.
- Store build: `eas build --platform android` (or `npx expo run:android --variant release` with local SDK/JDK 17).
