/**
 * Build everything the two browser harnesses serve, from what is in the repo.
 *
 *   cd harness
 *   npm install
 *   npm run setup        # then: npm run harness  or  npm run live
 *
 * Nothing the pages load is committed — it is all derived, so it cannot drift
 * from its source:
 *
 *   geometry.js          bundled from the app's own src/ (harness/src/geometry.ts
 *                        re-exports it); re-run after changing app code, or the
 *                        pages keep drawing with the old maths
 *   vision_bundle.mjs,   the MediaPipe web runtime, from @mediapipe/tasks-vision
 *   wasm/
 *   pose model           the same file the Android build ships, from
 *                        synapse/modules/pose-vision/android/src/main/assets
 *   clips/, refs/        test footage (harness only): the app's lesson clips and
 *                        the reference stills in harness/refs
 *
 * `npm run build` does the first step alone, which is all a code change needs.
 */
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const ROOT = path.resolve(HERE, '..');
const TARGETS = [path.join(HERE, 'public'), path.join(ROOT, 'live', 'public')];
const MEDIAPIPE = path.join(HERE, 'node_modules', '@mediapipe', 'tasks-vision');
const MODEL = path.join(ROOT, 'synapse', 'modules', 'pose-vision', 'android', 'src', 'main', 'assets', 'pose_landmarker_full.task');

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function copyDir(from, to, filter = () => true) {
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    if (filter(name)) copy(path.join(from, name), path.join(to, name));
  }
}

function need(p, hint) {
  if (!fs.existsSync(p)) {
    console.error(`missing: ${path.relative(ROOT, p)}\n  ${hint}`);
    process.exit(1);
  }
}

/** Bundle the app's geometry for the browser. Same flags the committed pages were built with. */
async function buildGeometry() {
  const esbuild = require('esbuild');
  const out = path.join(HERE, 'public', 'geometry.js');
  await esbuild.build({
    entryPoints: [path.join(HERE, 'src', 'geometry.ts')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2020',
    alias: { '@': path.join(ROOT, 'synapse') },
    outfile: out,
    logLevel: 'warning',
  });
  for (const dir of TARGETS.slice(1)) copy(out, path.join(dir, 'geometry.js'));
  console.log('geometry.js      built from synapse/src');
}

async function main() {
  const onlyBuild = process.argv.includes('--build-only');
  need(path.join(HERE, 'node_modules', 'esbuild'), 'run `npm install` in harness/ first');
  await buildGeometry();
  if (onlyBuild) return;

  need(MEDIAPIPE, 'run `npm install` in harness/ first');
  need(MODEL, 'the pose model is committed with the Android module; is the checkout complete?');

  for (const dir of TARGETS) {
    copy(path.join(MEDIAPIPE, 'vision_bundle.mjs'), path.join(dir, 'vision_bundle.mjs'));
    copyDir(path.join(MEDIAPIPE, 'wasm'), path.join(dir, 'wasm'));
    copy(MODEL, path.join(dir, 'pose_landmarker_full.task'));
  }
  console.log('mediapipe        runtime + wasm from @mediapipe/tasks-vision');
  console.log('pose model       from the Android module');

  const harnessPublic = TARGETS[0];
  copyDir(path.join(ROOT, 'synapse', 'assets', 'videos'), path.join(harnessPublic, 'clips'), (n) => /^clip\d\.mp4$/.test(n));
  copyDir(path.join(HERE, 'refs'), path.join(harnessPublic, 'refs'));
  console.log('clips, refs      test footage for the harness');
  console.log('\nready:  npm run harness   (clips + stills, http://localhost:8099)');
  console.log('        npm run live      (laptop webcam,  http://localhost:8098)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
