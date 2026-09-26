/**
 * The pose-vision module's browser entry.
 *
 * A `.ts` file on purpose, matching the native `index.ts`: Metro tries every
 * platform variant of one extension before moving to the next, so an
 * `index.web.tsx` would lose to `index.ts` and the web build would silently
 * get the native module — with no camera and no detector. The implementation
 * (which needs JSX) lives in `PoseVisionWeb.tsx`.
 */
export * from './types';
export { default, getPoseVisionView, isPoseVisionAvailable } from './PoseVisionWeb';
