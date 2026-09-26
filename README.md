# SYNAPSE — every rep, supervised

> **Выпустить приложение и отдать тестировщику → [ЗАПУСК.md](%D0%97%D0%90%D0%9F%D0%A3%D0%A1%D0%9A.md)** (пошагово, на русском).
> Инструкция для самого тестировщика → [TESTING.md](TESTING.md).

**Synapse** pairs a wearable sensor rig (**the Synapse Rig**) with an Android app that replaces the most expensive thing about lifting safely: a coach's eyes on your form. Put the Rig on, pick a lift, and the app watches your body through a live turquoise skeleton (**the Mesh**), grades every joint segment teal → amber → red, counts your reps, speaks corrections out loud, and hands you a report when you rack the weight.

This repository contains the **Rig companion app** — a real, screen-recordable Android app built to the [Master Brief](SYNAPSE_Master-Brief_for_Fable5.md). The app lives in [`synapse/`](synapse); the original firmware prototype and design references live in [`materials/`](materials).

---

> **Adding technique grading?** Start with [`HANDOFF.md`](HANDOFF.md): the seam, the data it receives, what to return, and a worked example that runs in the test suite.

## There is no demo mode

Synapse grades what its sensors can actually see. If neither the Rig nor the camera is available, a set **does not start** — the app says `NOTHING TO MEASURE WITH` and offers to connect. If the Rig drops mid-set, the Mesh freezes and a full-width `RIG LINK LOST` banner says the set is no longer being graded.

This is a product decision, not a missing feature. A form coach that animates a plausible body while measuring nothing is worse than no coach: it teaches the lifter to trust it right up until the rep that hurts them. Every skeleton on screen is drawn from live sensor data or it is not drawn.

A simulator does exist — it drives the 185-test suite and development builds, gated behind `__DEV__` so it is absent from any APK a user installs.

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

### Build the APK locally

The Rig receiver (`modules/rig-udp`) and the camera detector (`modules/pose-vision`) are native code: they exist only in a real build, never in Expo Go. Compile them locally before asking CI for a release — a CI run takes ~25 minutes and publishes a Release the tester sees, while a local check of one module takes two.

**What the build needs** (versions are set by `node_modules/react-native/gradle/libs.versions.toml`):

| Tool | Version |
|---|---|
| JDK | 17 (not 8 or 11 — AGP 8 refuses them) |
| Android SDK platform | 36 |
| Build-tools | 36.0.0 (AGP also pulls 35.0.0 on its own) |
| NDK | 27.1.12297006 — the New Architecture compiles C++ |
| CMake | 3.22.1 |

**Steps**, with the toolchain kept on `D:\android-toolchain` on the development machine:

```powershell
cd synapse
npx expo prebuild --platform android --no-install   # generates android/, which is gitignored

$env:JAVA_HOME        = 'D:\android-toolchain\jdk-17.0.20.1+1'
$env:ANDROID_HOME     = 'D:\android-toolchain\sdk'
$env:GRADLE_USER_HOME = 'D:\android-toolchain\gradle-home'
$env:JAVA_TOOL_OPTIONS = '-Djavax.net.ssl.trustStoreType=Windows-ROOT'   # see below
cd android

.\gradlew.bat :pose-vision:compileReleaseKotlin --no-daemon                          # ~2 min: the camera module only
.\gradlew.bat assembleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a      # the whole APK, one ABI
```

The APK lands in `android/app/build/outputs/apk/release/`. CI builds all four ABIs; one is enough to prove the native code compiles and links.

Two traps, both of which fail with a message that points somewhere else:

- **`android/local.properties` needs forward slashes**: `sdk.dir=D\:/android-toolchain/sdk`. Backslashes are escape characters in a `.properties` file, `D:\android-toolchain\sdk` is read as `D:android-toolchainsdk`, and the error is an `IOException` from `SdkLocator` saying the file name syntax is wrong — on a Russian-locale Windows, in unreadable mojibake.
- **An antivirus that scans HTTPS breaks every Java tool.** Avast (and others) re-sign every site with their own root certificate. Windows trusts it, so browsers and `curl` work; Java carries its own trust store and does not, so `sdkmanager`, the Gradle wrapper and Gradle itself fail with `PKIX path building failed`. `JAVA_TOOL_OPTIONS=-Djavax.net.ssl.trustStoreType=Windows-ROOT` makes Java trust exactly what Windows trusts. Do not switch off certificate checking instead.

**Releases for testers** still come from GitHub Actions (`.github/workflows/build-apk.yml`). Every run — manual *Run workflow* or a pushed `v*` tag — publishes a GitHub Release with the APK attached, so run it once the local build is green.

---

## What this build ships vs. the roadmap

| **This build (working today)** | **Roadmap (§7 of the brief)** |
|---|---|
| Full training loop: select → tutorial → arm → position-lock → live set → ephemeral review → report | BLE transport + auto-pairing |
| Deterministic **form-rule engine**: continuous severity grading, safety alerts, hysteresis rep counting, tempo & symmetry | Per-joint quaternions (a second IMU below each knee/elbow) |
| **The Mesh**: solid, perspective-projected body where the Rig draws it — a box per segment, tinted by that segment's own severity, with unsensed limbs left as open frames; flat overlay skeleton over camera video |  Cloud accounts, program sync, coach-shared programs |
| **Rig link**: UDP `:1234`, five-node quaternion protocol v2 (three wire forms) + legacy payloads, connect wizard, per-node calibration | Real-time interruptible voice coaching |
| **AI Coach**: RuleCoach always-on (offline); optional Claude coach (`claude-haiku-4-5` in-set ≤8 words, `claude-sonnet-5` debrief) with hard no-fabrication guards | PT / clinical mode |
| Ephemeral recording (app-private cache, hard-deleted on leave/background), history = **metrics only** | Opt-in human form review (the only path video would ever leave) |
| Progress trends, achievements, kit manager, onboarding, on-phone sensor setup, dark + paper themes | Social, marketplace, Play Billing, iOS |

**Honest limits of this machine's verification:** everything above is exercised by 185 unit/integration tests plus a full browser walk of every screen; the Android Hermes bundle compiles clean. What could **not** be verified here (no Android device/emulator on the build machine): a physical Rig on the wire (the emulator covers the protocol end-to-end, but not radio behaviour), on-device camera pose, TTS/haptics feel, and on-device fps — including what the solid Mesh costs per frame, which is the one number that decides whether it ships as the default. The seams for all four are built, guarded, and unit-tested.

---

## The Rig protocol (v2 — five nodes, quaternions)

The exoskeleton carries one IMU per limb plus the back, and ships each frame as a JSON string over UDP to `:1234`. Three spellings are accepted; the first is what the firmware sends today and the others are kept so a rig on older firmware still connects.

**Current form** — the node's value *is* its quaternion, `[r, i, j, k]`, read as
`pack.leftLeg[0]`…`pack.leftLeg[3]`:

```json
{"back":[0.0,0.0,0.0,0.0],
 "leftArm":[0.0,0.0,0.0,0.0],
 "leftLeg":[0.0,0.0,0.0,0.0],
 "rightArm":[0.0,0.0,0.0,0.0],
 "rightLeg":[0.0,0.0,0.0,0.0]}
```

It carries orientation and nothing else — **there is no fault flag in this
form.** Grading is unaffected (the rule engine judges geometry), but the
firmware's own `alert`, which could raise a safety stop on its own authority,
has no way to reach the app. The two earlier spellings below still parse.

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
| **Node value** | An array is the packed quaternion; an object holds named fields. Inside an object, `q` as an object is spelled out and `q` as an array is packed. None of the four can be confused — the parser reads shape, not key names |
| **`q` order** | Packed: `[r, i, j, k]`, scalar first. A runtime toggle (Sensor setup) flips it if firmware packs scalar-last, and the screen says whether it applies to the rig currently talking; a spelled-out `{r,i,j,k}` is unambiguous and ignores it |
| **Alerts** | Per node, under `a`, **where the form has one**. The packed form does not: no node claims a flag it never received, and the frame reports "no alert raised" rather than "no fault" |
| **Key spelling** | Every revision still parses — packed, `a`/`q`, and the original `alert`/`quaternions`. A rig on older firmware would otherwise be indistinguishable from dead hardware |
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

### Camera pose — how the body gets onto the person

This is the path that measures a lifter with nothing strapped to them. It runs
end to end on-device and no frame ever leaves the phone.

**The flow, in the order the data moves:**

| Stage | Where | What it does |
|---|---|---|
| 1. Camera | `src/train/SetCamera.tsx` | One camera for the whole set, mounted by the training flow — not by a stage |
| 2. Frames | `modules/pose-vision` (Kotlin) | CameraX owns the camera: preview, frame analysis and recording off one session |
| 3. Landmarks | `PoseEngine.kt` | MediaPipe Pose (LIVE_STREAM) → 33 points in **two spaces** per frame |
| 4. Crossing | `src/sources/camera/poseVisionBridge.ts` | Flattened arrays → `PoseObservation`; axis flips and the clock fix happen here and nowhere else |
| 5. Seam | `src/sources/camera/PoseDetector.ts`, `CameraPoseSource.ts` | The registry the rest of the app asks; no registration = camera reports unavailable |
| 6. Tracking | `src/vision/` | One Euro smoothing, bone lengths over frames, camera solved per frame |
| 7. Drawing | `src/ui/bodyVolumes.ts`, `facets.ts` | Solids built in metres, projected back through the solved lens |
| 8. Grading | `src/engine/` | Joint angles from the same pose, in one unit along every axis |

**Why the camera belongs to the flow.** `app/train.tsx` mounts `SetCamera`
outside the keyed stage view, so the same camera runs from position-lock
through the last rep. Position-lock needs frames to align a body against the
ghost; while the camera lived inside the live screen, the lock screen listened
for poses nothing was producing, and a camera-only set could never begin. It
also means no second of black screen at the handover, and the tracker keeps
the body it has just measured.

**Why a native module and not `expo-camera`.** `expo-camera` renders a preview
and hands its frames to nobody, and Android will not open one camera twice. A
detector that needs pixels has to *replace* the preview — which is why
`PoseVisionView` also carries the recorder. On a build without the native
module `SetCamera` falls back to `expo-camera` automatically: the lifter still
sees themselves, the Rig path is untouched, and nothing places a body on them.
The Arm screen says so (`CAMERA · NO DETECTOR`) rather than promising a source.

**The two spaces, and why both.** Image landmarks say *where on screen* a joint
appeared and carry no scale. World landmarks say *how big the body is*, in
metres. Neither alone can put a mannequin on a person; together they recover the
lens that took the frame.

**Four conversions that fail silently when wrong.** None of these crash. Each
one, got wrong, produces something that looks like a working app:

| Conversion | Where | What wrong looks like |
|---|---|---|
| **Axes.** MediaPipe is y-down with z away from the lens; the app is y-up, z toward the viewer | `observationFromNative` | a body built facing backwards |
| **Clock.** A frame is stamped on the wall clock the tracker samples by, never the sensor's boot clock | `frameTime` + `PoseEngine.capturedAtMs` | every joint reads hours stale and the figure never appears |
| **Screen.** Frame coordinates, unmirrored, become screen coordinates over a cropped, mirrored preview | `landmarksToScreen` | the skeleton beside the wearer, stepping left as they step right |
| **Units.** Per-axis normalization is undone before angles are measured | `isotropicLandmarks` | a 30° lean graded as 46°; a 120° knee read ~31° off |

Each conversion has tests that fail when it is broken — checked by breaking it. The unit fix is also tested through the whole engine: take it out of `SetEngine` and a 30° lean comes back as 45.7°. The screen mapping is tested as a function; its two call sites, `PositionStage` and the flat fallback in `LiveStage`, are components and are not.

**Handedness.** Frames are rotated upright but **never mirrored** before
detection, even from the front camera. MediaPipe names a joint by the side of
the body it is on; a mirrored frame would call the left knee the right one, and
technique faults are reported by side. The preview is mirrored for the wearer —
on screen, never in the data.

**Hardware it has to survive.** The detector tries the GPU and retries on the
CPU when the driver refuses (MediaPipe does not fall back by itself). The model
is loaded into memory rather than named by asset path, so it works however the
APK was packed. Preview, analysis and recording all ask for 16:9 so they see
the same field of view. A camera that cannot run all three streams gives up
recording, never detection — and says so, so the app does not offer a clip it
cannot make. A detector that cannot start at all is reported to the source,
which goes `unavailable` instead of searching forever.

**Versions.** CameraX is kept on expo-camera's line (1.5.x): Gradle resolves one
version for the APK and CameraX artifacts are only supported at matching
versions. MediaPipe `tasks-vision` is pinned to the same 1.0 line the web
harness runs, never `latest.release`.

**Changing the detector.** Swap the model by replacing
`modules/pose-vision/android/src/main/assets/pose_landmarker_full.task`. To use
a different landmarker entirely, implement `PoseDetectorFactory` and register it
instead:

```ts
import { registerPoseDetector } from '@/src/sources/camera/PoseDetector';
registerPoseDetector(myFactory); // 33 landmarks; frames never leave the device
```

**Trying it without a phone.** `harness/` and `live/` run the identical
pipeline in a browser — the pages bundle the app's own modules, so what the
browser draws is what the app would draw. `cd harness && npm install && npm run setup`,
then `npm run harness` (clips + reference stills, :8099) or `npm run live`
(laptop webcam, :8098). After changing app code, `npm run build` re-bundles it.
Neither page has its own copy of the maths, which is the point.

### Recording — one clip, from start to Review or to nothing

`src/train/clipRecorder.ts` owns a clip's life, independent of any camera so it
can be tested without one. A clip is handed over only once the muxer has
**finalized** it — a path given out at stop is a truncated file. A recording
that ends by itself (a duration cap) is held for the stop that follows. A clip
that finishes after its screen is gone, or after the wait for it was given up,
is deleted on arrival; the stale-clip sweep at launch is the backstop.

On the `expo-camera` fallback the preview runs in `mode="video"`: expo-camera
binds its recorder only in video mode, and in the default picture mode
`recordAsync` has nothing to record with. Every earlier build had that bug, so
no clip ever reached Review on Android.

### Technique grading — the seam left open

`src/technique/evaluator.ts` is where a lift is judged by the Rig + camera evaluator, and it is deliberately the one part not built here — see [`HANDOFF.md`](HANDOFF.md). The shipped default is `StubEvaluator`, which computes nothing **and says so** (`computed: false`); until a real one is installed, the built-in rule engine alone colours the body.

What is already wired, so a real evaluator lights up on arrival: `SetEngine` calls it on every pose frame with the Rig's raw frame, the calibrated rig body and the camera's tracked body, and resets it at the start of each set. Its per-segment severities are merged with the rule engine's (worse wins) and tint the body turquoise → amber → red. Its `worst` finding takes the fault chip, and at full severity it is marked on the Review timeline. Output is sanitized first, and an evaluator that throws degrades to "not checked". `src/technique/example.test.ts` proves the whole path on a simulated set.

### Diagnosing the Rig link

The firmware sends to a fixed address, so the question is always whether this
phone holds it. Connect → the live panel answers it directly.

**Wire formats accepted** (`src/sources/udp/protocol.ts`), newest first:

```
v2-packed  {"back":[r,i,j,k], "leftArm":[…], …}   ← current firmware
v2-named   {"back":{"a":false,"q":{"r":…,"i":…,"j":…,"k":…}}, …}
v2-array   [{"a":false,"q":[r,i,j,k]}, …]          ← 5 entries, RIG_NODE_ORDER
v1         {"v":1,"nodes":[{"id":"spine","q":[i,j,k,r]}],"batt":83}
v0         {"angle":41.7,"alert":true}
```

**Per-node states on the Connect screen**, and what each one means:

| State | Meaning | Where to look |
|---|---|---|
| `REPORTING` | orientation arriving and usable | — |
| `NO FIX` | node is in the packet, quaternion is all zeroes | the IMU is powered but has not settled; seconds, or wiring |
| `CORRUPT` | four finite numbers that are not a rotation | the sensor is reading garbage |
| `ALERT` | firmware raised its own fault flag | the rig thinks the angle is bad |
| `SILENT` | node never appears in any packet | that strap is not transmitting |

**`NO FIX` on every node** is its own banner — *rig is streaming, none has a fix
yet*. It is worth calling out because it used to be invisible: a packet whose
quaternions were all zero was discarded as malformed, so a rig that was powered,
associated and transmitting looked exactly like a rig that was switched off.
A well-formed reading now survives as a fault even when its value is unusable;
anything that is *not* four finite numbers is still rejected outright, so junk
on an open UDP port cannot pass itself off as a sensor.

Geometry never follows a faulted node — `rigBodyState` skips it exactly as it
skips an absent one, because a segment placed from a zeroed quaternion would sit
at the neutral pose and read as a limb held still.

### The Claude coach (optional)

**Profile → Coach → AI coach** → paste your own Anthropic API key (verified with a zero-token Models call, stored in the device secure store). With a key: Claude rephrases in-set cues (≤8 words, 2-second deadline, deterministic fallback) and writes the end-of-set debrief from the engine's JSON — it never sees frames and cannot invent numbers. Without a key: the RuleCoach carries everything and the HUD shows `AI COACH OFFLINE`.

---

## Architecture — how the code is organised

### Repository layout

| Path | What it is |
|---|---|
| `synapse/` | **the app** (Expo SDK 54, React Native 0.81, TypeScript strict). Everything shipped lives here |
| `harness/`, `live/` | browser test pages that run the app's own vision code on clips, stills and a laptop webcam |
| `materials/` | firmware prototype (`materials/base/main.py` is the ground truth for the Rig's network constants), design references, source footage |
| `legacy/` | the abandoned native Kotlin prototype — not built, not used, kept for reference |
| `.github/workflows/build-apk.yml` | CI: typecheck + tests + release APK + GitHub Release |
| `HANDOFF.md` | guide for the developer adding technique grading |
| `ЗАПУСК.md`, `TESTING.md` | how to release a build (owner) and how to test it (tester) |

### Layers inside `synapse/`

Data flows one way: **sources → engine → screens → renderer**. Each layer depends only on the ones to its left. The UI never touches hardware, and the engine never touches React.

```
 sources/            engine/                 train/ (screens)         ui/ (renderer)
 udp/  Rig ──┐       setSession.ts           train.tsx (flow)         BodyOverlay (camera: solids on the body)
 camera/ ────┼──►    ├ poseMetrics  angles   ├ PositionStage          MeshView3D  (rig: solids from an angle)
 sim/  dev ──┘       ├ rigBody     IMU→body  ├ LiveStage ──────────►  MeshView    (flat fallback)
                     ├ fusion      pose+rig  ├ ReviewStage            facets.ts   severity → colour
                     ├ ruleEngine  grades    └ ReportStage
                     ├ repCounter  reps
                     └ technique/evaluator ◄── the seam for technique grading (HANDOFF.md)

 vision/ (camera only): tracker → cameraFit → proportions → useBodyTracking → BodyOverlay
```

### `synapse/src/`, folder by folder

| Folder | Responsibility | Start with |
|---|---|---|
| `sources/` | **Where data comes from.** Each source implements `PoseSource` or `SensorSource` from `sources/types.ts`. `provider.ts` picks the sources for a set: a linked Rig first, then the camera, then (dev builds only) the simulator. If none is available, no set starts | `provider.ts` |
| `sources/udp/` | The Rig link. `protocol.ts` parses every wire format and treats all input as untrusted. `UdpSensorSource` owns the socket and the link state. `rigLink.ts` holds the app-wide link and calibration. `RigPoseSource` turns rig frames into a body. `firmware.ts` holds the Rig's fixed network constants | `protocol.ts` |
| `sources/camera/` | Camera pose. `PoseDetector.ts` is the detector registry, `CameraPoseSource` is the source, and `poseVisionBridge.ts` turns native MediaPipe events into observations | `poseVisionBridge.ts` |
| `sources/sim/` | A deterministic simulator of a lifter and a Rig, with fault injection. Used only by tests and `__DEV__` builds; it can never reach a tester's APK | `simTimeline.ts` |
| `engine/` | **The truth.** `SetEngine` (`setSession.ts`) runs a set. For every pose frame it derives metrics, fuses them with the Rig, grades them against the exercise's rules, counts reps, calls the technique evaluator, and emits one `EngineFrame`. Pure TypeScript, fully unit-tested | `setSession.ts`, `types.ts` |
| `technique/` | **The seam for technique grading.** See `HANDOFF.md` | `evaluator.ts` |
| `vision/` | Camera-only maths: One Euro smoothing, bone lengths, body proportions, the per-frame camera solve, and the viewport mapping between frame and screen | `tracker.ts`, `useBodyTracking.ts` |
| `train/` | The training flow's screens (select → tutorial → arm → position → live → review → report). Also `SetCamera` (one camera for the whole set), `ClipRecorder` (a clip's lifecycle) and `recording.ts` (ephemeral files) | `app/train.tsx`, then `LiveStage.tsx` |
| `ui/` | Components and the renderer. `bodyVolumes.ts` builds solids in metres, `facets.ts` turns them into coloured faces, and `BodyOverlay` / `MeshView3D` / `MeshView` draw them | `facets.ts` |
| `coach/` | `RuleCoach` (deterministic cues), `LLMCoach` (optional Claude rephrasing that never invents numbers), speech, haptics | `RuleCoach.ts` |
| `data/` | The exercise catalogue with full rule specs, lesson videos, achievements | `exercises.ts` |
| `store/` | zustand stores: settings, history (numbers only, never media), Rig connection state | — |
| `theme/` | Design tokens, the dark and paper palettes, typography, and the severity colour ramp `meshSeverityColor` | `tokens.ts` |

`synapse/app/` holds the expo-router screens: the tabs, the `train` modal, the `connect` wizard, onboarding, and sensor setup. Startup wiring happens in `_layout.tsx`: the camera detector is registered there, and the technique evaluator will be too.

`synapse/modules/` holds the two local native Expo modules (Kotlin), which are autolinked from this folder:
- `rig-udp` — a receive-only UDP socket for the Rig
- `pose-vision` — a camera view that owns CameraX (preview, frame analysis, recording) and runs MediaPipe Pose. `PoseEngine.kt` is the detector, `PoseVisionView.kt` is the camera, and `index.ts` is the JS surface

### One frame, end to end

1. **Rig:** a UDP datagram goes to `UdpSensorSource`, then `parseRigPayload`, and becomes a `SensorFrame`. `RigPoseSource` builds landmarks through the calibration, and `SetEngine` keeps the frame plus its calibrated `rigBody`.
2. **Camera:** a CameraX frame goes to `PoseEngine` (MediaPipe), which fires an `onPose` event. `poseVisionBridge` fixes the axes and the clock, and `CameraPoseSource` emits a `PoseFrame` with image points, world points and the frame size. In parallel, `useBodyTracking` smooths the pose, measures the body and solves the camera.
3. **Engine:** `SetEngine.onPose` runs `deriveMetrics` (camera points are made isotropic first), fuses the result with the Rig, grades it with `gradeFrame` against the exercise rules, runs the rep counter, calls `evaluateTechnique`, and emits `EngineFrame { grade, technique, severity }`.
4. **Screen:** `LiveStage` tints the body by `frame.severity`, shows the worst finding in the fault chip, speaks the coach's cues and records the clip. The line at the bottom of the screen shows the camera's health.

### Conventions

- **TypeScript strict.** The path alias `@/` means `synapse/`.
- **Tests live next to the code** (`foo.ts` alongside `foo.test.ts`, run by jest). Everything pure is tested: parsing, maths, grading, the clip lifecycle. CI refuses to build an APK when tests fail.
- **Comments say why, not what.** Every non-obvious decision is written down where it happens, and especially every bug the code is there to prevent.
- **Nothing is invented.** Missing data reads `NO DATA` / `NO FIX` / `computed: false`, never a plausible guess. See *Non-negotiables* below.
- **Native code lives only in `modules/`.** `synapse/android/` is generated by `expo prebuild` and gitignored; never edit it by hand.

### Commands

```bash
cd synapse
npm install
npm run typecheck                 # tsc --noEmit
npm test                          # jest, ~390 tests
npx expo start --offline          # dev server (add --max-workers 1 on low-RAM machines)
npx expo export --platform android   # proves the JS bundle builds
node scripts/send-test-packet.js <phone-ip> --stream   # a fake Rig over the hotspot
```

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
