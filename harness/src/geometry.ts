/**
 * The bridge to the app's own geometry.
 *
 * Nothing here reimplements anything: the page bundles the same modules the
 * phone renders with, so what the browser shows is what the app would draw.
 * A harness with its own copy of the maths proves nothing about the app.
 */

// --- the vision pipeline: detections in, a placed 3D body out -------------
export { PoseTracker, rigidify } from '@/src/vision/tracker';
export { BoneLengths, proportionLengths } from '@/src/vision/boneLengths';
export { OneEuroFilter } from '@/src/vision/oneEuro';
export { BodyMeasure, defaultProportions, girthsFor, DEFAULT_HEIGHT } from '@/src/vision/proportions';
export { fitCamera, cameraProjector, focalFromFov } from '@/src/vision/cameraFit';
export { coverViewport, containViewport, identityViewport } from '@/src/vision/viewport';
export type { TrackedPose } from '@/src/vision/tracker';
export type { BodyProportions, BodyGirths } from '@/src/vision/proportions';
export type { FittedCamera } from '@/src/vision/cameraFit';
export type { PoseObservation, WorldPoint, FrameSize } from '@/src/vision/types';
export type { Viewport } from '@/src/vision/viewport';

// --- the mannequin -------------------------------------------------------
export { buildBody, bodyVolumes, solidFaces, bodyFrame, worldFromLandmarks } from '@/src/ui/bodyVolumes';
export {
  boxOutline, cylinderOutline, coveredArea, painterSort, perspectiveProjector,
  DEFAULT_CAMERA, faceDepth, facesAway, shade, centroid,
} from '@/src/ui/volume';
export { buildFacets, litColor, OVERLAY_STYLES } from '@/src/ui/facets';
export type { Facet, OverlayStyle } from '@/src/ui/facets';
export type { BodySolid, BodyModel } from '@/src/ui/bodyVolumes';
export type { Outline, Projector, Quad, Camera } from '@/src/ui/volume';

// --- the rig path, unchanged: wire bytes in, posed body out --------------
export { parseRigPayload } from '@/src/sources/udp/protocol';
export { rigBodyState, rigLandmarks, rigMetrics, RigCalibration } from '@/src/engine/rigBody';
export { evaluateTechnique, techniqueEvaluator, setTechniqueEvaluator, StubEvaluator } from '@/src/technique/evaluator';
export { getExercise } from '@/src/data/exercises';
export { meshSeverityColor } from '@/src/theme/tokens';
export { EMPTY_METRICS, LM } from '@/src/engine/types';
