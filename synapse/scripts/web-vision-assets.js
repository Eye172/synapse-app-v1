/**
 * Puts MediaPipe's web library, its runtime and the pose model where the web build serves
 * them from: `public/mediapipe/`.
 *
 * The browser build of the pose-vision module (`modules/pose-vision/
 * index.web.tsx`) loads these from its own origin first — the same model
 * file the Android APK ships, and the WASM runtime from the installed
 * `@mediapipe/tasks-vision` — so the laptop runs exactly what the phone runs,
 * with no CDN and no internet. The copies are generated (and gitignored):
 * this runs after every `npm install`, and before `npm run web`.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'mediapipe');
const LIB = path.join(ROOT, 'node_modules', '@mediapipe', 'tasks-vision');
const WASM = path.join(LIB, 'wasm');
const MODEL = path.join(ROOT, 'modules', 'pose-vision', 'android', 'src', 'main', 'assets', 'pose_landmarker_full.task');

function copyIfChanged(from, to) {
  const src = fs.statSync(from);
  if (fs.existsSync(to) && fs.statSync(to).size === src.size) return false;
  fs.copyFileSync(from, to);
  return true;
}

if (!fs.existsSync(WASM)) {
  console.warn('[web-vision-assets] @mediapipe/tasks-vision is not installed; the web build will load it from the CDN');
  process.exit(0);
}
fs.mkdirSync(path.join(OUT, 'wasm'), { recursive: true });
let copied = 0;
for (const f of fs.readdirSync(WASM)) {
  if (copyIfChanged(path.join(WASM, f), path.join(OUT, 'wasm', f))) copied++;
}
// the library itself: Metro cannot bundle it (see PoseVisionWeb.tsx), so the
// browser imports it from here as an ES module
if (copyIfChanged(path.join(LIB, 'vision_bundle.mjs'), path.join(OUT, 'vision_bundle.mjs'))) copied++;
if (copyIfChanged(MODEL, path.join(OUT, 'pose_landmarker_full.task'))) copied++;
console.log(`[web-vision-assets] public/mediapipe ready (${copied} file${copied === 1 ? '' : 's'} updated)`);
