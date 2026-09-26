# legacy/

Code that is kept for reference and is **not built, shipped or tested**.

- `native-prototype/` — the first attempt at the app, a native Kotlin/Gradle
  project from the initial commit. It was superseded by the Expo app in
  `synapse/`, which is what CI builds and what testers install. Nothing in the
  current app imports from it. It was moved here from the repository root so
  that nobody mistakes its `build.gradle.kts` for the real build.
