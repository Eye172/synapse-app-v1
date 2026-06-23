# Synapse — Smart Training Platform

**Android application component** of the Synapse Smart Training System — a group project combining a wearable exoskeleton with real-time biomechanical analysis and AI coaching.

> This repository contains the software (Android app) part of the system. The hardware component (exoskeleton with embedded IMU sensor) is developed separately by the hardware team.

---

## What it does

Synapse pairs with a wearable exoskeleton over WiFi and gives athletes real-time feedback on their movement quality:

- **Live skeletal visualization** — 15-joint overlay drawn on top of the camera feed
- **Biomechanical analysis** — angle tracking, form scoring, risk detection via BNO085 IMU data
- **AI coaching** — GPT-4o-mini generates personalised feedback after each session
- **Exercise library** — catalog of exercises with demo videos and target angle profiles
- **Session recording** — CameraX video capture with automatic review screen
- **Session history** — all workouts stored locally with quality scores and AI notes

---

## Tech stack

| Layer | Technology |
|---|---|
| Language | Kotlin 2.0.21 |
| UI | Jetpack Compose + Material 3 |
| Architecture | Multi-module Clean Architecture, MVI |
| DI | Hilt |
| Database | Room |
| Video | Media3 / ExoPlayer |
| Camera | CameraX |
| Networking | OkHttp (AI), UDP socket (sensor) |
| Build | Gradle 8.10.2, AGP 8.7.3 |
| Min SDK | 26 (Android 8.0) |

---

## Hardware protocol

The exoskeleton firmware broadcasts UDP packets to `192.168.43.1:1234` (the phone's hotspot IP).  
Packet format:
```json
{"angle": 45.3, "alert": false}
```
- `angle` — back/joint angle in degrees (0–180), filtered with EMA α = 0.25  
- `alert` — `true` when the sensor detects a form error  

**WiFi hotspot setup on phone:** SSID = `Synapse`, password = `GymSafetyNetPassword`

---

## Setup

### Prerequisites
- **JDK 17** — [Temurin 17](https://adoptium.net/) recommended  
- **Android Studio Ladybug** or later (or command-line build tools)  
- **Android SDK** with `platforms;android-35` and `build-tools;35.0.0`  
- **OpenAI API key** — [platform.openai.com/api-keys](https://platform.openai.com/api-keys)

### 1. Clone
```bash
git clone https://github.com/Eye172/synapse-app-v1.git
cd synapse-app-v1
```

### 2. Create `local.properties`
Copy the example and fill in your values:
```bash
cp local.properties.example local.properties
```
Edit `local.properties`:
```properties
sdk.dir=/path/to/your/Android/Sdk
openai.api.key=sk-your-key-here
```

### 3. Add demo videos (optional)
Place MP4 files in `app/src/main/res/raw/` to enable in-app exercise previews:
```
video_squat.mp4
video_pullup.mp4
video_shoulder_press.mp4
video_leg_raises.mp4
```
The app shows a placeholder if a video file is missing — no build error.

### 4. Build & install
```bash
./gradlew assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
```

Or open the project in Android Studio and press **Run**.

---

## Project structure

```
app/                      # Application entry point, DI root, navigation graph
core/
  ai/                     # OpenAI GPT-4o-mini coaching client
  camera/                 # CameraX recording manager
  common/                 # BaseViewModel (MVI), UiState, Result
  connectivity/           # UDP sensor server, connection state
  database/               # Room: exercises, sessions, auth
  designsystem/           # Design tokens, shared Compose components
  motion/                 # Skeletal mapper, technique analyzer, EMA filter
  network/                # OkHttp client
feature/
  auth/                   # Login / register screens
  device-pairing/         # WiFi hotspot setup guide
  exercise-library/       # Exercise catalog + detail + video player
  live-session/           # Camera + skeleton overlay + real-time HUD
  onboarding/             # First-run flow
  profile/                # User profile
  settings/               # App settings
  video-review/           # Post-session video playback
  workout/                # Dashboard + workout prep
```

---

## Running tests

```bash
./gradlew :core:motion:testDebugUnitTest \
          :core:connectivity:testDebugUnitTest \
          :feature:exercise-library:testDebugUnitTest
```

37 unit tests covering:
- Technique analysis across all severity bands
- UDP sensor packet parsing and validation
- Exercise catalog integrity

---

## Team

This is a group project. This repository covers the **Android application** component.  
Hardware / firmware / mechanical design are maintained in separate repositories by the respective team members.
