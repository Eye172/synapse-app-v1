package expo.modules.posevision

import androidx.camera.core.CameraSelector
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The module surface: one view, and the two calls that drive a recording.
 *
 * Everything else the live screen needs arrives as events on the view itself,
 * because the landmarks belong to the camera that produced them and routing
 * them through a singleton would make a second preview quietly impossible.
 */
class PoseVisionModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PoseVision")

    /**
     * True on any build that actually carries the native side. The JS asks
     * before offering the camera as a source, so that a build without it
     * reports "no detector" instead of showing a preview that measures
     * nothing.
     */
    Function("isAvailable") { true }

    View(PoseVisionView::class) {
      Events("onPose", "onStatus", "onCameraError", "onRecordingFinished")

      Prop("facing") { view: PoseVisionView, facing: String ->
        view.lensFacing =
          if (facing == "back") CameraSelector.LENS_FACING_BACK else CameraSelector.LENS_FACING_FRONT
      }

      Prop("detecting") { view: PoseVisionView, detecting: Boolean ->
        view.detecting = detecting
      }

      // Both on the main thread, where the recorder's finish callback also
      // arrives: the view's recording state is then only ever touched from one
      // thread. Expo runs async functions on a background queue by default.
      AsyncFunction("startRecording") { view: PoseVisionView, path: String ->
        view.startRecording(path)
      }.runOnQueue(Queues.MAIN)

      AsyncFunction("stopRecording") { view: PoseVisionView ->
        view.stopRecording()
      }.runOnQueue(Queues.MAIN)
    }
  }
}
