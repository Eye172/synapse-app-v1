# SYNAPSE — Master Build Brief for Fable 5
### Turn a sensor-training kit into a shippable, screenshot-worthy Android app — the Contractor way

> **What this is.** A single, self-contained brief you hand to **Claude Fable 5** (in Claude Code) to build the **Synapse** Android app end-to-end. It is written in the *Contractor Method* from the *"How I Prompt Claude Fable 5"* guide, and staged in ordered copy-paste passes like the *CASE* prompt pack. Everything Fable 5 needs is stocked inside — brand, design tokens, screen specs, the real hardware protocol pulled from your colleague's prototype, the coaching architecture, and the demo-mode that makes every feature work **without hardware or API keys**.
>
> **How it was built.** This brief is derived from three inputs: (1) *Fable-5 Prompt Guide — The Contractor Method*; (2) *Build CASE — Free Prompt Pack*; (3) your colleague's real firmware (`materials/base/main.py`) + the design references in `materials/images/references/`. Where the rough idea and the real hardware disagreed, the hardware won and the idea was sharpened. See **§Appendix A** for the annotated prototype.

---

## Table of contents

0. [How to use this document](#0--how-to-use-this-document)
1. [The product in one breath](#1--the-product-in-one-breath)
2. [The Fridge — everything stocked](#2--the-fridge--everything-stocked)
   - 2.1 [Brand & voice](#21-brand--voice)
   - 2.2 [Design system — "Biometric HUD"](#22-design-system--biometric-hud)
   - 2.3 [Information architecture & navigation](#23-information-architecture--navigation)
   - 2.4 [Screen-by-screen spec](#24-screen-by-screen-spec)
   - 2.5 [The Training Loop — the core](#25-the-training-loop--the-core)
   - 2.6 [The Mesh — pose + sensor fusion](#26-the-mesh--pose--sensor-fusion)
   - 2.7 [The Form-Rule engine & rep counter](#27-the-form-rule-engine--rep-counter)
   - 2.8 [The AI Coach](#28-the-ai-coach)
   - 2.9 [Hardware data protocol](#29-hardware-data-protocol-reconciled-from-the-prototype)
   - 2.10 [Demo / Simulator mode](#210-demo--simulator-mode-non-negotiable)
   - 2.11 [Exercise content seed](#211-exercise-content-seed)
   - 2.12 [Privacy, safety & compliance](#212-privacy-safety--compliance)
   - 2.13 [Tech stack](#213-tech-stack-recommendation)
   - 2.14 [Performance budget](#214-performance-budget--optimization-targets)
3. [Deal-breakers — master list](#3--deal-breakers--master-non-negotiable)
4. [Done-when — master checklist](#4--done-when--master-robot-checkable)
5. [The Passes — copy-paste Fable 5 prompts](#5--the-passes--copy-paste-fable-5-prompts)
6. [The Inspection prompts — fresh eyes](#6--the-inspection-prompts--fresh-eyes)
7. [Roadmap beyond this build](#7--roadmap-beyond-this-build-the-full-machine)
8. [Appendix](#8--appendix)

---

## 0 · How to use this document

You are not going to type this whole thing at Fable 5. You are going to **run the passes in §5, in order**, and use the rest of the document as the shared reference both you and the model point back to.

### The Contractor Method, in one screen
The guide's whole system is seven moves. This brief bakes them in so you don't have to think about them:

| Move | What it means | Where it lives here |
|---|---|---|
| **1. Hand it the job, not the toolbox** | Describe the finished *what* and *who*, and how it should *feel* — not a step list. | Every pass leads with **THE JOB** and **THE FEEL**. |
| **2. State your deal-breakers** | 2–4 things it may never violate. | Per-pass deal-breakers + the master list in **§3**. |
| **3. Define "done" so a robot could check it** | Checkable finish lines, not adjectives. | Per-pass **DONE WHEN** + master checklist in **§4**. |
| **4. Stock the fridge** | Give it everything up front so it never has to stop and ask. | The entire **§2** is the fridge; passes point into it. |
| **5. Let it cook** | Long, uninterrupted runs. Don't hover. | Passes are sized to run for a long time unattended. |
| **6. Inspect like a client, not the builder** | Review in a *fresh* chat, harshly. | The inspection prompts in **§6**. |
| **7. Stack passes & keep the receipts** | Skeleton first, then compounding passes. Save what wins. | The pass ladder in **§5**. |

### The Anatomy every pass uses
```
THE JOB          Build ___ for ___.
THE FEEL         It should feel like ___ / make the user ___.
DEAL-BREAKERS    Non-negotiables: ___, ___, ___.
DONE WHEN        You're finished when: ___, ___, ___  (all checkable).
THE FRIDGE       Everything you need: → §2.x of the Master Brief (paste alongside).
```

### The workflow (do this)
1. **Open Claude Code in the project folder** with **Fable 5 selected**. Point it at this file so it has the fridge.
2. **Paste the passes in order** (§5). Let each one **finish and be verified against its DONE-WHEN before the next.** (CASE pack rule: *"Let each one finish and try it before the next."*)
3. **Let it cook.** Don't interrupt mid-run to "check in." The best work comes from long uninterrupted runs.
4. **After each pass, inspect in a fresh chat** using §6. Feed the flaws back as the next job.
5. **If a pass errors, paste the error straight back** and ask it to fix — that's the whole loop.
6. **Keep the receipts.** When a pass produces something great, this document *is* the saved template. Update it as the product sharpens.

### One rule that matters more than the rest
**Freedom on the *how*, walls around the *what-matters*.** Fable 5 is allowed to pick libraries, structure, and a hundred small design decisions you'd never think to ask for. It is **not** allowed to cross a deal-breaker (§3) — most of all: **never fabricate coaching, metrics, or "results"**, and **never let a workout video leave the device**.

---

## 1 · The product in one breath

**Synapse** sells a wearable sensor rig — **the Synapse Rig** — and a companion Android app that replaces the single most expensive thing about lifting safely: *a coach's eyes on your form.* You put on the Rig, open the app, pick an exercise, and the app watches your body through a live **turquoise sensor skeleton (the "Mesh")** overlaid on your own camera feed. It shows you exactly where your technique breaks, **grades each body segment from teal → amber → red by how wrong it is**, coaches you in plain language and out loud, counts your reps, and hands you a short report when you rack the weight. On the dangerous lifts — squat, deadlift, press — it is a spotter that never blinks.

- **Who it's for:** lifters training alone (home gym, commercial gym, no coach) who do compound barbell/dumbbell work and are one bad rep away from a hurt back, shoulder, or knee.
- **The promise:** *"Every rep, supervised."* The confidence of a good coach standing behind you, for the price of a gadget instead of $80/session.
- **The feel:** a **cockpit HUD for your body** — precise, a little sci-fi, trustworthy, calm under load. Not a cutesy fitness app. It should feel like *serious instrumentation you'd trust with your spine*, borrowing the restrained menace of a Marathon interface and the glowing-anatomy readouts of a biometric scanner.

### From rough idea → diamond (what changed and why)
| Rough idea said | This brief says | Why |
|---|---|---|
| "Connect to the exoskeleton, probably via Bluetooth." | **Wi-Fi UDP over the phone's hotspot** (BLE is a documented *future* transport). | The real firmware (`main.py`) already speaks UDP/JSON to the phone hotspot. Build what actually works, keep the interface swappable. |
| "Turquoise dots connected by lines showing sensor positions." | **The Mesh:** on-device **camera pose** (a real 33-point skeleton on your body) **fused** with **Rig joint angles** for the authoritative grading. | One IMU can't draw a body. Camera pose draws the body *today, with no hardware*; the Rig makes the angle grading trustworthy when present. Best of both. |
| "GPT API points out mistakes and highlights errors in red." | A **deterministic form-rule engine** does the real-time grading + color + rep counting; the **LLM coach** speaks at natural breakpoints (fault, end of rep, end of set). Provider-agnostic; **Claude recommended.** | Per-frame LLM calls are too slow, too expensive, and can hallucinate. Rules are instant and honest; the LLM turns rule output into good coaching. |
| "Record, review, then it deletes when you leave the tab." | **Ephemeral by design:** recordings live in app-private cache, never touch the gallery, never upload, and are **hard-deleted on leave / background / set-end.** | Turns a footnote into a privacy *guarantee* — a selling point and a Play-compliance win. |
| "It should just work." | **Demo Mode** runs the entire app — every screen, the full training loop, coaching — with **no Rig, no camera, no API key.** | "Fully working" has to be demonstrable on an emulator. This is the CASE lesson: the first build is something you can screen-record. |
| — (new) | **Audio + haptic coaching.** | Mid-squat you are not looking at the phone. Spoken one-liners + haptic buzzes are the real magic and a genuine differentiator. |

### Honest scope — this build vs the full machine
Borrowing CASE's honesty. **This brief builds the "Rig companion" — a real, shippable, screen-recordable app.** It is not yet the whole company.

| This build ships | The full machine (roadmap, §7) |
|---|---|
| One phone, one Rig, Wi-Fi UDP, full training loop | BLE + multi-node full-body Mesh, many Rigs |
| Camera pose + IMU fusion, live grading, rep counting | Cloud sync, accounts, coach-shared programs |
| LLM coach at breakpoints + audio/haptic cues | Real-time interruptible voice, PT/clinical mode |
| Ephemeral local recording & review | Optional opted-in cloud form-review by a human coach |
| Progress/history (metrics only, no video) | Social, leaderboards, marketplace of programs |
| Demo Mode, offline-first, Android/Play-ready | Play Billing subscriptions, iOS parity |

---

## 2 · The Fridge — everything stocked

> Paste the relevant subsection alongside the pass that needs it. When a pass says *"→ §2.6"*, that's the fridge item for that job.

### 2.1 Brand & voice

- **Name:** Synapse. **Hardware:** *Synapse Rig*. **The sensor overlay/network:** *the Mesh*. **A single sensor:** *a node*.
- **Tagline options (pick one, use consistently):** *"Every rep, supervised."* · *"Your form, instrumented."* · *"The coach in the mesh."*
- **Voice:** terse, technical, confident, safety-first. Think flight instrumentation, not a hype coach. Short sentences. No exclamation marks in the coaching voice. Never chirpy. It respects that the user is under a loaded barbell.
- **Coach persona (system-prompt seed for the LLM):** *"You are the Synapse coach — a calm, precise strength coach speaking through a HUD. You see the lifter only as joint angles and rule deviations provided to you; you never guess about anything you can't see. You give at most one correction at a time, the highest-priority one, in 8 words or fewer while a set is live. Between sets you may give one short paragraph. You never invent numbers, reps, or praise you can't justify from the data. Safety outranks everything: if a rule flags spinal or joint risk, you say to stop. No exclamation marks."*
- **Micro-copy motif:** technical HUD labels in mono, uppercase, e.g. `MESH · LINKED · 8 NODES · 62Hz`, `SHELL INTEGRITY 98%`, `TEMPO 3–1–1`, `SYMMETRY 96%`. (Directly from the reference boards.)

### 2.2 Design system — "Biometric HUD"

> **⬛ LOOK AT THESE BEFORE YOU WRITE ANY UI.** Two visual sources are stocked in the repo and are not optional:
> - **The pixel target:** `materials/deliverables/synapse-hud-mockup.html` — a fully-rendered mockup of the **live-set screen** plus the **report screen** and a token legend. **This is the bar. Match its density, hierarchy, restraint, and accent discipline — do not reinvent the look.** Build the real screens to look like this, then apply the same system to every other screen.
> - **The vibe boards:** `materials/images/references/0001.png` (glowing biometric skeleton + red grading), `0002.png` (Marathon — acid-green/black, heavy display type, HUD "alert" panels, mono micro-labels), `0003.png` (glassmorphism + blue/purple gradients for the calm surfaces). **Open them.** Steal the *feeling*, not the pixels: 0001 for the in-session cockpit, 0002 for brand/structure/typography, 0003 for the between-sets glass surfaces.
>
> If your output does not look like it belongs next to `synapse-hud-mockup.html`, it is not done. The fresh-eyes design check (§6.2) exists to enforce this.

A dark-only system that fuses the three reference boards: **near-black canvas + acid lime-green brand (Marathon)** + **turquoise glowing skeleton (biometric scan)** + **red→amber error grading** + **glassmorphic panels (glass board)**.

**Color tokens** (use these exact values; dark theme only):
```
/* Canvas */
--bg-void:        #06070B   /* app background, void black */
--bg-base:        #0A0C12   /* default surface */
--surface-1:      #10141C   /* raised card */
--surface-glass:  rgba(20,26,36,0.55)   /* glass panel; backdrop-blur 24px */
--hairline:       rgba(200,240,60,0.10) /* 1px glass borders */
--grid-line:      rgba(140,160,190,0.08)/* faint HUD grid/scanlines */

/* Brand + accents */
--acid:           #C8F03C   /* PRIMARY. Synapse green. CTAs, active tab, brand */
--acid-press:     #A9CE2A
--mesh:           #21F0DC   /* turquoise. skeleton nodes + bones + glow */
--blue:           #2E6BFF   /* data accent, secondary highlights */

/* Technique severity gradient (continuous ok→error) */
--ok:             #16E39A   /* segment within tolerance */
--warn:           #FFC24B   /* drifting */
--error:          #FF3B5C   /* fault. also the "ALERT" red */

/* Text */
--text-hi:        #EAF0EC
--text-mid:       #99A2AE
--text-lo:        #5A6472
```
Rule: **acid green = the app talking to you (brand, actions, "you're good").** **Turquoise = your body (the Mesh).** **Red = danger in *your* body, never a UI decoration.** Keep red sacred so it means something under load.

**Typography** (all free / Google Fonts):
- **Display / HUD headers:** `Chakra Petch` (condensed sci-fi geometric — reads like the refs). Uppercase, tight tracking.
- **UI / body:** `Space Grotesk` (or `Inter` fallback).
- **Mono / technical labels & live data:** `JetBrains Mono` (or `Space Mono`). Uppercase, `letter-spacing +0.08em` for micro-labels.
- **Scale (sp):** Display 40/48 · H1 28 · H2 22 · H3 18 · Body 15 · Label 13 · Micro-mono 11.

**Shape & space:**
- 4pt spacing base. Screen gutters 20.
- **Two radius languages, used on purpose:** soft glass cards `radius 20` (consumer, calm surfaces) **and** sharp HUD frames `radius 4–6` with corner-bracket accents (technical, in-session surfaces). The refs live in exactly this tension — honor it.
- Glass panels: `--surface-glass` + 24px blur + 1px `--hairline` + soft inner glow.

**Signature elements (the "divine frontend"):**
- **Corner brackets** framing live/technical panels (`⌜ ⌝ ⌞ ⌟`), thin acid or turquoise.
- **Left data rail** in-session: stacked mono readouts (angle, tempo, rep, symmetry) like a cockpit.
- **Scanline sweep** on loading and on "scanning body" states; faint animated grid behind dark screens.
- **Glow** on the Mesh (additive), on the primary CTA, on the active tab.
- **Number counters** tick up; **status strips** in mono (`MESH: SIM · 30Hz`).

**Motion (use Reanimated + Skia):**
- Screen enter 220ms ease-out; card stagger 40ms.
- Mesh nodes pulse 1.2s. On fault, the affected bone flashes `--error` for 120ms then settles to its graded color; tiny jitter on error.
- "Get into position": a ring closes over the countdown; on alignment lock, a green ring snaps + haptic.
- Rep counted: brief acid pulse on the counter + light haptic.

**Empty / loading / error states** get the same care as the happy path — corner brackets, a mono status line, one clear action. No blank white screens ever (there is no white in this app).

### 2.3 Information architecture & navigation

**Bottom tab bar** (5 tabs, center emphasized), glass, with an acid glow on the active tab:

```
[ Home ]  [ Library ]  [ ● TRAIN ● ]  [ Progress ]  [ Profile ]
```

- **TRAIN** (center, raised, acid) opens the **Training flow as a full-screen modal stack** — it is not a tab page; it takes over the screen so nothing distracts under load, then returns you to where you were.
- Tabs persist state. Deep, obvious, thumb-reachable. No hamburger menus.
- A persistent, unobtrusive **connection chip** (top-right on Home/Library/Progress) shows Rig state: `LINKED` (acid) / `SIM` (blue) / `SEARCHING` (amber, pulsing) / `OFFLINE` (grey). Tapping it opens the Connect sheet.

### 2.4 Screen-by-screen spec

Every screen is dark, HUD-framed, and has explicit empty/loading/error states.

**A. Onboarding & Connect**
- First-run: 3 slabs — *what the Rig is*, *put it on & align nodes*, *how connection works*. Then a **Connect wizard**.
- **Connect wizard (matches real firmware):** guides the user to enable the phone's **hotspot named `Synapse`** (the Rig's ESP joins it and sends UDP to the gateway). Live status: `SEARCHING → NODES FOUND (n) → CALIBRATE → LINKED`. A prominent **"Skip — use Demo Mode"** path is always available.
- **Calibration:** hold neutral stance ~3s to zero the reference (T-pose optional). Shows nodes lighting up as they report.

**B. Home / Today**
- Greeting + date in mono. **Big "START TRAINING" CTA** (acid, glowing).
- Cards: *Continue* (last/next exercise), *Safety score* this week (a graded ring), *Streak*, *Recommended session*. Connection chip top-right.

**C. Library / Exercises**
- Searchable, filterable grid/list of exercises. Each card: name (display), category chip, **risk badge** (1–3; risk-3 = red outline), a looping muted thumbnail. Filters: *Compound / Accessory*, *Risk*, *Body region*, *Has Rig rules*.
- Tapping a card → **Exercise detail**: video lesson, the muscles/joints watched, the form rules in plain English ("we watch your spine angle and knee tracking"), and **"Start with this exercise."**

**D. Training flow (modal stack)** — see **§2.5** for the full step machine. Screens: *Loading → Video tutorial → Camera + Mesh (get-into-position → live set) → Review (ephemeral) → Report.*

**E. Progress / History**
- Timeline of sessions (date, exercises, duration, safety score). Per-exercise trend charts (technique score, symmetry, tempo adherence, top recurring fault). Achievements. **No video is ever stored here** — metrics only.

**F. Profile / Settings**
- Account (local-first; cloud is roadmap). **Kit manager** (rename Rig, battery, firmware note, re-calibrate). **Units** (kg/lb). **Coach settings** (verbosity, voice on/off, haptics on/off, connect/enter AI key). **Privacy** (recording policy explained; camera is on-device only). **Buy / manage kit** (store link; Play Billing is roadmap). Disclaimers & safety.

### 2.5 The Training Loop — the core

A single state machine. Every state has demo-mode parity (§2.10).

```
SELECT ──▶ LOADING ──▶ TUTORIAL(video, skippable)
                             │
                             ▼
                     PERMISSIONS(camera; mic if recording)
                             │
                             ▼
                     GET_INTO_POSITION  ← ghost "target pose" + countdown, locks on alignment
                             │
                     ┌───────┴────────┐
             record? NO          record? YES → pick duration (segmented bar: 15s·30s·60s·90s)
                     │                │
                     ▼                ▼
                  LIVE_SET ◀──────────┘   ← Mesh overlay, live grading, rep count, coaching, HUD rail
                             │  (stop / duration reached / rep target)
                             ▼
                     REVIEW  ← only if recorded: scrub the ephemeral clip, faults marked on timeline
                             │  (video HARD-DELETED on leaving this state)
                             ▼
                     REPORT  ← scores, per-rule breakdown, LLM summary, top fix; save METRICS only
                             │
                             ▼
                     DONE → back to Home / "next exercise"
```

Details that matter:
- **GET_INTO_POSITION:** render a 40%-opacity **acid-green ghost skeleton** (the "glowing exoskeleton" from the idea). The user aligns their live turquoise Mesh into it. A countdown ring (default 5s) closes; when alignment is within tolerance it **locks** (green ring + haptic + `POSITION LOCKED`). Auto-proceeds or on user tap.
- **Duration selector:** a **segmented slider bar** with fixed stops `15s / 30s / 60s / 90s` (the "полоска с определёнными вариантами"). Recording is capped to the chosen length.
- **LIVE_SET HUD:** camera fills the screen; the **Mesh** overlays the body; **left data rail** shows `ANGLE`, `TEMPO`, `REP`, `SYMMETRY`; top strip shows mesh source/rate; the affected segment turns amber/red on fault; a single coaching line appears bottom-center and is **spoken + haptic**. A big `STOP` and a `PAUSE`.
- **REVIEW:** appears only if the user recorded. Scrubbable player; the fault timeline marks where technique broke. On any exit from this state (back, tab switch, app background, or advancing to REPORT) the clip file is **deleted immediately**.
- **REPORT:** overall technique score (graded ring), reps, per-rule pass/fail with the worst deviation, tempo & symmetry, and the **LLM's short written summary + the one thing to fix next.** Saves **metrics only**.

### 2.6 The Mesh — pose + sensor fusion

Two data sources, one unified skeleton, behind clean interfaces so Demo Mode and real hardware are interchangeable.

- **`PoseSource`** → a real body skeleton from the **camera, on-device** (33 landmarks). Implementations: `CameraPoseSource` (ML Kit / MediaPipe Pose Landmarker via the camera frame processor) and `SimPoseSource` (scripted landmarks for Demo Mode). This is what *draws* the turquoise dots-and-lines on the body — it works with **no Rig at all.**
- **`SensorSource`** → **joint angles from the Rig** over UDP (§2.9). Implementations: `UdpSensorSource` (live) and `SimSensorSource` (scripted, with fault injection). This is the *authoritative* angle truth used for grading when the Rig is linked.
- **Fusion:** the **Mesh renderer** draws the pose skeleton (turquoise nodes + bones + glow, Skia). The **grader** (§2.7) prefers Rig angles for any joint a node covers, and falls back to angles computed from camera pose for the rest. If neither is present → Demo Mode sim. The user always sees a live skeleton; grading gets more trustworthy as more real data is present.
- **Rendering:** nodes = filled turquoise dots (8–12px) with radial glow; bones = 2px turquoise lines with additive glow; each bone/node is **tinted by its segment's severity** (ok→warn→error). Must hold ≥24fps on a mid-range Android (§2.14) — render on Skia, keep pose inference off the UI thread.

### 2.7 The Form-Rule engine & rep counter

The honest heart of the app. Deterministic, instant, explainable. **This — not the LLM — produces the red grading, the alerts, and the rep count.**

**Per-exercise schema** (seed data lives in the app; see §2.11):
```jsonc
{
  "id": "back_squat",
  "name": "Back Squat",
  "category": "compound",
  "riskLevel": 3,
  "primaryJoint": "knee",              // drives the rep phase machine
  "rep": { "topAngle": 165, "bottomAngle": 95, "hysteresis": 8 },
  "targetPose": [ /* landmark targets for the GET_INTO_POSITION ghost */ ],
  "tempo": { "ecc": 3, "pause": 1, "con": 1 },   // optional target tempo (s)
  "rules": [
    {
      "id": "neutral_spine",
      "segment": "torso",              // which Mesh segment to tint
      "metric": "torsoHipAngle",
      "ok":   [65, 115],               // within tolerance  → --ok
      "warn": [55, 125],               // drifting          → --warn
      "error":"outside",               // beyond warn       → --error
      "priority": 1.0,                 // higher wins the single live cue
      "cue": "Chest up. Stop the round.",
      "risk": "spine"
    },
    {
      "id": "knee_tracking",
      "segment": "leftKnee|rightKnee",
      "metric": "kneeValgusDeg",
      "ok": [0, 8], "warn": [8, 15], "error": "outside",
      "priority": 0.8,
      "cue": "Knees out.",
      "risk": "knee"
    },
    {
      "id": "depth",
      "segment": "hip",
      "metric": "hipBelowKnee",
      "ok": [true], "warn": [], "error": [false],
      "priority": 0.4,
      "cue": "Hit depth.",
      "risk": null
    }
  ]
}
```
**Behavior:**
- **Grading:** each frame, for each rule compute the metric from Rig angles (preferred) or pose; map deviation → `ok/warn/error` → color the rule's `segment` on the Mesh. Severity is **continuous** (lerp within bands) so color slides smoothly.
- **Alerts:** any rule hitting `error` on a `risk` joint (spine/knee/shoulder) raises a **safety alert** (red HUD flash + `STOP` prompt) — this is the productized version of the prototype's `alert` boolean.
- **Rep counter:** a phase state machine on `primaryJoint` using `topAngle/bottomAngle` + `hysteresis` (top→bottom→top = 1 rep). Counts only **clean-ish** reps; tags reps that contained an `error`.
- **The LLM never computes grades.** It only *narrates* the engine's output (§2.8).

### 2.8 The AI Coach

Provider-agnostic, grounded, and useful **even with no key.**

- **`CoachProvider` interface** with two implementations, layered:
  - **`RuleCoach` (always on, no network):** turns rule-engine output into short cues + audio (TTS) + haptics. This alone makes the app coach you offline.
  - **`LLMCoach` (optional):** better phrasing, session summaries, and adaptivity. **Recommended: Claude** — `claude-haiku-4-5` for low-latency in-set one-liners at breakpoints; `claude-sonnet-5` (or `claude-opus-4-8`) for the end-of-set written report. Pluggable: a `GPT`/other provider can drop into the same interface if the user prefers.
- **When it's called (never per-frame):** on a *new sustained fault*, at *end of a rep with a fault*, and at *end of set*. Rate-limit: ≤1 in-set cue / 4s; 1 report / set.
- **What it receives (structured, never video/frames):** exercise id, rep count, per-rule current deviations + worst-of-set, tempo adherence, L/R symmetry, and which risk flags fired. Small JSON. Cheap, fast, private.
- **In-set output:** ≤8 words, one correction (the highest-priority failing rule), spoken + haptic. **Between sets:** one short paragraph + the single most important fix.
- **No-fabrication (deal-breaker):** every coaching statement must be traceable to engine output. It may not invent reps, scores, or praise. If data is thin (e.g., pose-only, no Rig), it says so rather than guessing.
- **Graceful degradation:** no API key → `LLMCoach` disabled, `RuleCoach` carries the session, an `AI COACH OFFLINE` chip is shown. The app is fully usable and demoable without any key.
- **Audio + haptics:** spoken cues (Android TTS, lowered rate for calm authority) + haptic patterns (short buzz = minor drift, double buzz = fault, long buzz = STOP). User can mute either.

### 2.9 Hardware data protocol (reconciled from the prototype)

Pulled directly from `materials/base/main.py`. Build the app to speak **this**, behind a `SensorSource` interface so it stays swappable.

- **Rig hardware:** RP2040/Pico-class MCU + **ESP-01 (ESP8266)** Wi-Fi via UART AT commands + **BNO08x IMU** (I²C addr `0x4b`), quaternion output in Q14 fixed-point (÷16384.0), pitch derived, EMA-smoothed (`α = 0.25`), emitting at ~10 Hz (100 ms loop).
- **Transport (today):** the Rig's ESP **joins the phone's Wi-Fi hotspot** (SSID `Synapse`, the firmware's default) and sends **UDP datagrams to the Android hotspot gateway `192.168.43.1:1234`.** ⇒ **The app binds a UDP socket on `:1234`** and listens.
- **Payload v0 (current firmware):**
  ```json
  { "angle": 41.7, "alert": true }
  ```
  `angle` = smoothed pitch in degrees; `alert` = firmware's simple fault flag (currently `angle < 45°`).
- **Normalize everything to one internal frame:**
  ```jsonc
  SensorFrame {
    t: number,                    // arrival ms
    nodes: [{ id: string, angleDeg?: number, quat?: [i,j,k,r] }],
    flags: { alert?: boolean },
    battery?: number
  }
  ```
  v0 maps to a single node `{ id: "spine", angleDeg: angle }`, `flags.alert = alert`.
- **Payload v1 (forward-compatible — define it now, firmware grows into it):**
  ```json
  { "v":1, "t":1723200000, "nodes":[{"id":"spine","q":[0.01,0.7,0.02,0.71]}], "batt":83 }
  ```
  If `nodes[]` present → full Mesh; if only `angle/alert` → v0 single node. Same normalizer handles both.
- **Robustness (must-have):** tolerate no packets (→ `SEARCHING`), malformed JSON (drop, don't crash), out-of-order (keep latest by `t`), Rig sleep/reset (→ `OFFLINE`, auto-recover). Parse **off the UI thread.**
- **Calibration:** capture a neutral-stance reference to zero angles; map node ids → body segments used by the grader (§2.7).
- **Security note:** the firmware default password is weak (`GymSafetyNetPassword`). Keep default compatibility, but the Connect wizard should *recommend* the user set a strong hotspot password, and the app should treat inbound data as untrusted (validate every field).

### 2.10 Demo / Simulator mode (NON-NEGOTIABLE)

The app must be **100% usable and screen-recordable on a bare Android emulator with no Rig, no camera hardware, and no API key.** This is how "fully working" is proven.

- **`SimSensorSource`:** plays scripted rep cycles for the selected exercise at ~30 Hz, producing realistic `SensorFrame`s. Includes a **fault injector** (dev toggle) to deterministically introduce a fault (e.g., spine rounding on rep 3) so grading, red coloring, alerts, and coaching all demonstrably fire.
- **`SimPoseSource`:** scripted 33-landmark pose so the turquoise Mesh animates a believable body even with no camera.
- **Auto-selects** when no Rig and/or no camera is available; also force-selectable from Settings ("Demo Mode"). The connection chip reads `SIM` (blue).
- **RuleCoach** runs regardless; if no LLM key, the whole loop still coaches via rules + TTS.
- **Result:** Select → tutorial → get-into-position → live set with a moving graded Mesh + rep count + spoken cues → (recorded) review → report — **all without any hardware.**

### 2.11 Exercise content seed

Ship a seed library of **6 exercises** with full form-rule specs (§2.7), tutorial-video placeholders (bundled short clips or a labelled placeholder player), thumbnails, and cue sets. Flag risk-3 lifts in red.

| id | Name | Category | Risk | Primary joint | Headline rules |
|---|---|---|---|---|---|
| `back_squat` | Back Squat | compound | 3 | knee | neutral spine, knee tracking, depth, L/R symmetry |
| `deadlift` | Conventional Deadlift | compound | 3 | hip | neutral spine (critical), bar path, hip-shoulder rise sync |
| `overhead_press` | Overhead Press | compound | 3 | shoulder | no excess lumbar extension, wrist stack, bar over mid-foot |
| `bench_press` | Bench Press | compound | 2 | elbow | elbow flare, bar path, even press |
| `barbell_row` | Barbell Row | accessory | 2 | hip | flat back, consistent torso angle, no jerk |
| `rdl` | Romanian Deadlift | compound | 3 | hip | hip hinge depth, neutral spine, soft knees |

Provide each as JSON in the app's seed data so the library, detail screens, get-into-position ghosts, grader, and rep counter are all driven by real content on first launch. (Deadlift's spine rule is the flagship: it's exactly the prototype's `angle`/`alert` idea, productized.)

### 2.12 Privacy, safety & compliance

- **Ephemeral video (guarantee):** recordings write to app-private cache only; play back in Review; **hard-delete on leave / background / set-end.** Never write to `MediaStore`/gallery. **Never upload.** No cloud. State this in Settings and the Play data-safety form.
- **On-device pose only:** camera frames are processed on-device for pose; frames are not stored or transmitted.
- **Health & safety:** first-run + Report footer disclaimer — *"Synapse is a training aid, not medical advice. Stop if you feel pain. Consult a professional before heavy or unfamiliar lifts."* Warm-up prompt before risk-3 lifts; the safety alert can advise racking the weight.
- **Play readiness:** camera + (optional) mic permission rationale strings; data-safety declaration (camera used on-device, not shared/stored; no video uploaded); target current Android API; adaptive icon; graceful permission-denied paths.

### 2.13 Tech stack recommendation

*(This is a fridge item, i.e. a strong default — Fable 5 may substitute a component if it demonstrably serves the goal better, but the platform target and the data protocol are fixed.)*

- **Platform:** **Android, Google-Play-ready.** (Reuse the existing Expo project in `materials/base`.)
- **Framework:** **React Native + Expo (dev/config-plugin build)** — matches the existing base and ships to Play fast.
- **Camera + pose:** `react-native-vision-camera` (frame processors) + an on-device pose landmarker (MediaPipe Pose / MoveNet). 
- **HUD & Mesh rendering:** `@shopify/react-native-skia` for the glowing skeleton + HUD chrome; `react-native-reanimated` for motion.
- **Networking:** `react-native-udp` for the UDP socket (§2.9).
- **State/storage:** lightweight local store (e.g. Zustand/MMKV) — metrics only, no video.
- **AI:** Anthropic SDK for the `LLMCoach` (Claude), behind the `CoachProvider` interface; key read from secure storage, optional.
- **Native alternative (if RN can't hit the perf/latency bar):** Kotlin + Jetpack Compose + CameraX + ML Kit Pose + Compose Canvas. Note the trade-off and choose deliberately; do not silently ship a laggy loop.

### 2.14 Performance budget & optimization targets

- Live set renders the Mesh at **≥24 fps on a mid-range Android** (target 30). No dropped frames during a set.
- Pose inference and UDP parsing run **off the UI thread.** End-to-end sensor→screen latency **< 120 ms.**
- LLM calls only at breakpoints (§2.8); never block the render loop; always have a rule-based fallback ready instantly.
- Battery-aware: no needless wake locks; stop the camera/socket when the training modal closes.
- App cold-start to interactive **< 3 s**; zero console errors/warnings in a clean run.

---

## 3 · Deal-breakers — master (non-negotiable)

Fable 5 may be as creative as it likes, but it may **never**:

1. **Let a workout video leave the device or survive the tab.** App-private cache only; hard-deleted on leave/background/set-end; never in the gallery; never uploaded.
2. **Fabricate coaching, scores, reps, or metrics.** Every number and cue must trace to the rule engine or real sensor/pose data. Thin data → say so, don't guess.
3. **Break Demo Mode.** The entire app + full training loop must run on an emulator with **no Rig, no camera, no API key.**
4. **Hardcode a hardware dependency into the UI.** All sensor/pose/coach access goes through the `SensorSource` / `PoseSource` / `CoachProvider` interfaces so live and sim are interchangeable.
5. **Speak the wrong protocol.** The Rig link is **UDP/JSON over the phone hotspot at `192.168.43.1:1234`, payload `{angle, alert}` normalized to `SensorFrame`** (§2.9). BLE is out of scope for this build.
6. **Ship a laggy live set.** ≥24 fps, <120 ms latency, pose/parse off the UI thread (§2.14).
7. **Use white / break the dark HUD system, or spend the red on decoration.** Red = danger in the body only.
8. **Crash on bad input.** Malformed/absent packets, denied permissions, missing key → graceful degraded states, never a crash or a blank screen.
9. **Ship UI that doesn't match the target.** The live-set screen must read like `materials/deliverables/synapse-hud-mockup.html`; the rest of the app must feel like it shares that DNA and the reference boards (§2.2). "Functional but plain" is a fail — this is a $10K-look product.

---

## 4 · Done-when — master (robot-checkable)

The build (across all passes) is done when **all** of these are true:

- [ ] App cold-starts to Home with **zero console errors**, dark HUD, working 5-tab nav (Home, Library, Train, Progress, Profile).
- [ ] On a bare emulator (**no Rig, no camera, no key**) I can: pick **Back Squat** → watch the tutorial → complete **get-into-position** with the ghost + countdown lock → run a **live set** where a **turquoise Mesh moves on a body**, a **rep counter** increments, **at least one segment turns red** on the injected fault, and a **spoken + on-screen cue** fires → (with recording on) **review** the clip and see it **deleted** when I leave → land on a **Report** with a technique score, per-rule breakdown, and a coach summary.
- [ ] The **connection chip** correctly shows `SIM` in Demo Mode and would show `SEARCHING → LINKED` with real UDP data; feeding a `{"angle":41.7,"alert":true}` UDP packet to `:1234` moves the spine node and can raise a safety alert.
- [ ] The **duration selector** offers fixed stops (15/30/60/90s) and caps the recording.
- [ ] **Library** lists all 6 seeded exercises with names, risk badges, and video/detail screens; risk-3 lifts are visibly flagged.
- [ ] **Progress** shows session history and per-exercise trends — and stores **no video**.
- [ ] With an API key set, the **LLM coach** produces an in-set one-liner and an end-of-set paragraph grounded in the session data; with no key, **RuleCoach** carries the session and an `AI COACH OFFLINE` chip shows.
- [ ] Denying camera/mic, killing the "Rig," and backgrounding mid-set all degrade gracefully with no crash and no orphaned video file.
- [ ] Live set holds **≥24 fps** on a mid-range device; a full run leaves **no console warnings**.
- [ ] The **live-set screen visibly matches** `materials/deliverables/synapse-hud-mockup.html` (corner-bracketed frame, data rail, mono status strip, acid rep counter, red fault chip + reddening Mesh segment, glass coaching pill), and the rest of the app shares that visual DNA + the reference boards.
- [ ] A `README.md` explains what Synapse is and how to run it, and there's a **60-second demo script** that shows the loop end-to-end in Demo Mode.

---

## 5 · The Passes — copy-paste Fable 5 prompts

Run in order. Let each **finish and pass its DONE-WHEN before the next.** Each pass assumes this Master Brief is available to the model in the project; paste the referenced §2.x alongside if needed. **Let it cook** between your inputs.

> Convention: fill nothing in — these are ready. Where a pass says *"→ §2.x"*, that section is the fridge for that job.

---

### PASS 0 — Scaffold, design system & demo data (the shell)

**THE JOB** — Set up the Synapse Android app project (reuse the Expo base in `materials/base`) and build the **design-system foundation + navigation shell + seeded data**, so I can open the app on an emulator and move between all five tabs with real styling and placeholder content.

**THE FEEL** — Opening it should already feel like *serious instrumentation* — dark, precise, a little sci-fi. Like the cockpit is booting up.

**DEAL-BREAKERS** — Dark-only HUD system with the exact tokens in **§2.2**; no white anywhere; 5-tab nav with a raised center **TRAIN** control; zero console errors; all six exercises from **§2.11** present as seed JSON driving the Library.

**DONE WHEN** — The app launches to a styled **Home**; I can navigate Home/Library/Progress/Profile; **Library** renders all 6 seeded exercises with names, category chips, and risk badges; the **TRAIN** control opens an empty full-screen modal placeholder; a persistent **connection chip** shows `SIM`; fonts (Chakra Petch / Space Grotesk / JetBrains Mono) and glass/HUD components are in place; no console errors.

**THE FRIDGE** — → §2.1, §2.2, §2.3, §2.11, §2.13. **First open `materials/deliverables/synapse-hud-mockup.html` and `materials/images/references/0001–0003.png`** and treat them as the visual bar. Build the reusable component kit here (glass card, sharp HUD frame with corner brackets, mono readout, severity ring/bar, tab bar with raised center TRAIN, connection chip) so it visibly matches the mockup — later passes reuse it.

---

### PASS 1 — The interfaces + Demo Mode plumbing (make it truthful)

**THE JOB** — Implement the three seams the whole app depends on — **`SensorSource`, `PoseSource`, `CoachProvider`** — with their **simulator implementations** wired up, plus the **form-rule engine** and **rep counter**, all runnable headless/visibly in Demo Mode.

**THE FEEL** — Invisible but load-bearing. When it's right, everything downstream "just works" with or without hardware.

**DEAL-BREAKERS** — No UI may touch hardware directly — only these interfaces; `SimSensorSource` must include the deterministic **fault injector**; the rule engine — **not any LLM** — computes grades, colors, alerts, and reps; grading severity is continuous.

**DONE WHEN** — A dev screen shows a live `SensorFrame` stream from `SimSensorSource` (with the fault injector toggling an `error`), the rule engine emits per-segment severities + a rep count for **Back Squat**, and `RuleCoach` prints the correct single highest-priority cue. Swapping in a stubbed `UdpSensorSource` that receives one real `{"angle":41.7,"alert":true}` packet on `:1234` produces the same `SensorFrame` shape.

**THE FRIDGE** — → §2.6, §2.7, §2.8 (RuleCoach only), §2.9, §2.10.

---

### PASS 2 — The Training Loop, end-to-end in Demo Mode (the magic)

**THE JOB** — Build the full **Training flow** as a modal stack: Select → Loading → Video tutorial (skippable) → permissions → **Get-into-position** (ghost + countdown lock) → record toggle + **duration selector** → **Live set** with the **turquoise Mesh** overlaying a body, live grading colors, rep counter, HUD data rail, and on-screen coaching → **Review** (ephemeral) → **Report**. It must run entirely on **`SimSensorSource` + `SimPoseSource`** with no camera or hardware.

**THE FEEL** — This is the screen-recordable *wow*. A cockpit locking onto your body and calling your reps. Tense, precise, alive — 0001 come to life.

**DEAL-BREAKERS** — Everything works in Demo Mode with no camera/Rig/key; the recorded clip is **hard-deleted** on leaving Review/backgrounding; the injected fault makes a body segment go **red** and raises a safety alert on risk joints; live Mesh holds **≥24 fps**; render on Skia, sim/pose off the UI thread.

**DONE WHEN** — All of the §4 line about "on a bare emulator I can pick Back Squat → … → Report" is literally true; the duration bar offers 15/30/60/90s and caps recording; leaving Review deletes the file (verify no orphan in cache).

**THE FRIDGE** — → §2.4(D), §2.5, §2.6, §2.7, §2.8(RuleCoach), §2.10, §2.12(ephemeral), §2.14. **The live-set screen must match `materials/deliverables/synapse-hud-mockup.html`** — same corner-bracketed camera frame, left data rail, mono status strip, big acid rep counter, red fault chip with the segment turning red on the Mesh, and the glass coaching pill.

---

### PASS 3 — Real camera pose + the Mesh on your body

**THE JOB** — Add the real **`CameraPoseSource`** (Vision Camera frame processor + on-device pose landmarker) so the turquoise Mesh tracks the **user's actual body**, fused with sim/real sensor angles per §2.6. Keep `SimPoseSource` as the automatic fallback.

**THE FEEL** — The moment it snaps onto *you* in the mirror. Uncanny, precise, trustworthy.

**DEAL-BREAKERS** — Pose runs **on-device only**, frames never stored/sent; denied camera permission degrades to Demo Mode gracefully; still **≥24 fps**; the get-into-position ghost aligns to the real body.

**DONE WHEN** — With a camera present, a real body gets a live turquoise skeleton that grades to red on bad form; with camera denied or absent, it falls back to `SimPoseSource` with no crash; frames are provably not persisted.

**THE FRIDGE** — → §2.6, §2.12, §2.13, §2.14.

---

### PASS 4 — Real Rig link + Connect wizard + calibration

**THE JOB** — Implement the live **`UdpSensorSource`** (bind `:1234`, parse the firmware's `{angle,alert}`, normalize to `SensorFrame`, tolerate the messy real world), plus the **Connect wizard** (hotspot `Synapse`, `SEARCHING → NODES FOUND → CALIBRATE → LINKED`) and **calibration** (zero the neutral reference). Prefer Rig angles for grading when linked.

**THE FEEL** — Plugging in and watching the body light up node by node. Hardware handshake as ritual.

**DEAL-BREAKERS** — Exact protocol per §2.9 (UDP/JSON, `192.168.43.1:1234`); parse off the UI thread; malformed/absent/out-of-order packets and Rig reset never crash; connection chip reflects true state; treat inbound data as untrusted (validate every field); Demo Mode still available as a one-tap skip.

**DONE WHEN** — Feeding real/emulated UDP packets to `:1234` drives the spine node and raises the safety alert on `alert:true`; unplugging the source flips to `SEARCHING`/`OFFLINE` and auto-recovers; calibration visibly zeroes the reference.

**THE FRIDGE** — → §2.4(A), §2.9, §2.10.

---

### PASS 5 — The AI Coach (LLM at breakpoints + voice + haptics)

**THE JOB** — Add **`LLMCoach`** behind `CoachProvider` (Claude recommended: `claude-haiku-4-5` for in-set one-liners at breakpoints; `claude-sonnet-5`/`claude-opus-4-8` for the end-of-set report), fed the **structured session summary** (never frames/video). Add **spoken cues (TTS)** and **haptic patterns** for both coaches. Key is optional and stored securely.

**THE FEEL** — A calm expert behind you who speaks only when it matters, and is always right because it only knows what the sensors know.

**DEAL-BREAKERS** — No per-frame calls; rate-limited (≤1 in-set cue/4s, 1 report/set); **no fabrication** — every statement traceable to engine output; **no key → RuleCoach carries on + `AI COACH OFFLINE` chip**; in-set cue ≤8 words; safety outranks everything.

**DONE WHEN** — With a key, a live set produces a grounded in-set one-liner and an end-of-set paragraph + top fix; with no key, the session still coaches via rules + TTS + haptics; cues are spoken and buzz; muting works.

**THE FRIDGE** — → §2.1(coach persona), §2.8, §2.13(AI).

---

### PASS 6 — Progress, Profile, content & the edges

**THE JOB** — Build **Progress/History** (session timeline, per-exercise trend charts, achievements — **metrics only, no video**), **Profile/Settings** (kit manager, units, coach/voice/haptic toggles, AI key entry, privacy explainer, buy-kit link, disclaimers), the **Exercise detail** screens with tutorials, and every **empty/loading/error state**.

**THE FEEL** — The calm, premium "home base" between sessions — glassy, quiet, confidence-building. Progress you're proud to screenshot.

**DEAL-BREAKERS** — No video ever stored in history; every screen has designed empty/loading/error states (no blank screens); privacy copy matches the real behavior (§2.12).

**DONE WHEN** — Completing sessions populates Progress with real metrics and trends; all six exercises have detail+tutorial screens; Settings toggles actually change behavior; disclaimers present; no white, no blank states.

**THE FRIDGE** — → §2.4(B,C,E,F), §2.11, §2.12.

---

### PASS 7 — Polish, performance & accessibility

**THE JOB** — A dedicated polish pass: motion/haptics tuning (§2.2), the scanline/grid/glow signature treatments, HUD micro-labels everywhere they belong, accessibility (contrast, dynamic type, screen-reader labels, "mute all"), and hit the full **performance budget**.

**THE FEEL** — The difference between "a demo" and "a product." Every transition intentional, every state alive.

**DEAL-BREAKERS** — ≥24 fps live set, <120 ms latency, <3 s cold start, zero console warnings in a clean run; nothing regresses Demo Mode or the deal-breakers.

**DONE WHEN** — A full Demo-Mode run is smooth end-to-end with polished motion and no warnings; accessibility checks pass; perf targets in §2.14 are met on a mid-range profile.

**THE FRIDGE** — → §2.2(motion/signature), §2.14, §3, §4.

---

### PASS 8 — Ship it & show it off

**THE JOB** — Write the `README.md` (what Synapse is, how to run it in Demo Mode in one flow, how to point a real Rig at it), prepare the Android build config for Play (icon, permissions rationale, data-safety notes), and give me a **60-second demo script** I can read while screen-recording the full loop in Demo Mode.

**THE FEEL** — Hand-off ready. Someone else could run it and get the magic in two minutes.

**DEAL-BREAKERS** — Demo script must work with **no hardware and no key**; README must not overstate scope (be CASE-honest about what's built vs roadmap §7).

**DONE WHEN** — Following the README from a clean checkout reaches a running Demo-Mode app; the demo script maps 1:1 to on-screen beats; Play prerequisites (icon, permissions, data-safety) are documented.

**THE FRIDGE** — → §1(scope), §2.12, §7.

---

## 6 · The Inspection prompts — fresh eyes

Run these in a **fresh chat** (not the one that built the pass). The builder always thinks the house looks great.

### 6.1 After any pass — the harsh triad
```
You are three skeptics reviewing the Synapse Android app (a wearable-sensor lifting-form
coach). Play each in turn and score 1–10, then give the 3 changes that would most raise each score:

1) A strength coach who has torn a client's form apart for 20 years. Does the live feedback
   catch real faults (spine rounding, knee valgus, bar path)? Is it safe? Would you trust it
   behind a lifter under a heavy bar? What's dangerously missing?

2) A lifter training alone at 6am who paid for the Rig. Is the training loop obvious and fast?
   Can they start a set in under 15 seconds? Is the coaching helpful or noise? Would they use it
   twice?

3) A Google Play reviewer and a privacy-conscious user. Are permissions justified? Is the
   "video is deleted / nothing uploaded" claim actually true in the code? Any crash paths,
   blank screens, or console errors? Would this pass review?

Be specific and cite screens/states. End with the single highest-priority fix.
```

### 6.2 Design fidelity check
```
Open materials/deliverables/synapse-hud-mockup.html and the reference boards
materials/images/references/0001-0003.png. Put the running app's live-set screen next to the
mockup. Does it match the density, hierarchy, and restraint — or is it plainer/busier? List
every gap.

Then compare the whole app against its design system (dark "Biometric HUD": #06070B canvas, acid green
#C8F03C for brand/actions, turquoise #21F0DC for the body Mesh, red #FF3B5C reserved for
danger in the body only, glass panels + sharp HUD frames, Chakra Petch / JetBrains Mono).
Find every place that drifts: stray whites, red used as decoration, off-grid spacing,
missing corner-brackets/mono-labels, unstyled empty or error states. List them with the
screen and the fix. Would a designer screenshot this? What's stopping them?
```

### 6.3 Pre-ship audit
```
Verify each item in §4 "Done-when" of the Master Brief against the actual code, one by one,
PASS/FAIL with the file/line as evidence. Then hunt specifically for: (a) any path where a
recorded video is NOT deleted, (b) any coaching line or metric not traceable to the rule
engine, (c) anything that breaks when there is no Rig, no camera, or no API key. Report only
what fails, ranked by severity.
```

---

## 7 · Roadmap beyond this build (the full machine)

Keep these **out** of the passes above; they're the "TARS" to this build's "CASE."

- **BLE transport** + auto-pairing (drop into `SensorSource` next to UDP).
- **Full-body multi-node Mesh** (many BNO08x nodes; per-joint quaternions; richer form rules).
- **Cloud accounts & sync**, program history, coach-shared programs.
- **Real-time interruptible voice coaching** (barge-in), not just breakpoint cues.
- **PT / clinical mode** (rehab ranges, physio-authored rule sets).
- **Optional opted-in human form-review** (user explicitly shares a clip to a coach — the *only* path video ever leaves the device).
- **Social / programs marketplace**, streaks, challenges.
- **Play Billing** subscriptions + kit-bundle onboarding.
- **iOS parity.**

---

## 8 · Appendix

### A. The prototype, annotated (`materials/base/main.py`)
What your colleague's firmware actually establishes — the ground truth this brief is built on:
- **Board:** MicroPython on an RP2040/Pico-class MCU. **UART0** (GP0/GP1) drives an **ESP-01 (ESP8266)** via `AT` commands.
- **Sensor:** **BNO08x IMU** on **I²C0** (SCL=GP9, SDA=GP8, addr `0x4b`), `INT`=GP4, `RST`=GP5. Reads the rotation-vector report, decodes quaternion in **Q14** (`÷16384.0`), derives **pitch**, applies **EMA smoothing** (`α=0.25`), ~**10 Hz** loop.
- **Link:** ESP joins Wi-Fi **SSID `Synapse`** (password `GymSafetyNetPassword`), opens **UDP** to **`192.168.43.1:1234`** (the Android hotspot gateway) and sends `AT+CIPSEND` frames.
- **Payload:** `{"angle": <deg>, "alert": <bool>}`, where `alert = angle < 45°`.
- **Implications baked into this brief:** the transport is **Wi-Fi UDP, not Bluetooth**; there is **one angle today**, so the app must *draw* the body from **camera pose** and treat Rig angles as authoritative where present; the firmware's `alert` is the seed of the **safety-alert** system; the whole thing must be wrapped behind a `SensorSource` interface with a **simulator** so the app is fully demoable without the Rig.

### B. Glossary
- **The Rig** — the Synapse wearable sensor hardware.
- **The Mesh** — the turquoise skeleton overlay (camera pose fused with Rig angles).
- **Node** — one sensor / one skeleton joint.
- **Rule engine** — deterministic per-frame form grader (colors, alerts, reps).
- **Coach** — RuleCoach (always-on, deterministic) + optional LLMCoach (narration).
- **Demo Mode** — the no-hardware/no-key path that runs the whole app on sim data.

### C. Keep the receipts
This document is the saved template. When a pass produces something great, or the product sharpens, **update this file** — the passes and fridge are meant to compound. The demo is the receipt; the saved brief is the business.

---

*Built the Contractor way: hand over the job, state the walls, define done, stock the fridge, let it cook, inspect with fresh eyes, stack the passes. Now — go build Synapse.*
