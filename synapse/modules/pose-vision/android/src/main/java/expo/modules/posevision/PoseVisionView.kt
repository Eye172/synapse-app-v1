package expo.modules.posevision

import android.annotation.SuppressLint
import android.content.Context
import android.os.Bundle
import android.util.Size
import android.view.ViewGroup
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.io.File
import java.util.concurrent.Executors

/**
 * The camera, owned outright.
 *
 * `expo-camera` shows a preview and keeps its frames to itself, and Android
 * will not open the same camera twice, so a detector that needs pixels has to
 * replace the preview rather than sit beside it. This view therefore carries
 * all three use cases the live screen needs — preview, frame analysis and
 * recording — off one session.
 *
 * It deliberately does no drawing. The overlay stays in React, drawn by the
 * app's own renderer from the landmarks this view emits, so the figure on a
 * phone is built by the same code the harness draws with on a laptop.
 */
@SuppressLint("ViewConstructor")
class PoseVisionView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onPose by EventDispatcher<Bundle>()
  private val onStatus by EventDispatcher<Bundle>()
  private val onCameraError by EventDispatcher<Bundle>()
  private val onRecordingFinished by EventDispatcher<Bundle>()

  private val previewView = PreviewView(context).apply {
    layoutParams = ViewGroup.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.MATCH_PARENT,
    )
    // FILL_CENTER matches how the app's `coverViewport` maps a frame onto the
    // screen; any other scale type and the overlay would sit off the body.
    scaleType = PreviewView.ScaleType.FILL_CENTER
  }

  private val analysisExecutor = Executors.newSingleThreadExecutor()
  private var provider: ProcessCameraProvider? = null
  private var engine: PoseEngine? = null
  private var videoCapture: VideoCapture<Recorder>? = null
  private var recording: Recording? = null
  private var bound = false

  /** front or back, as the live screen's flip control sets it */
  var lensFacing: Int = CameraSelector.LENS_FACING_FRONT
    set(value) {
      if (field == value) return
      field = value
      if (bound) bind()
    }

  /** false pauses detection without tearing the camera down */
  var detecting: Boolean = true

  init {
    addView(previewView)
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    bind()
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    release()
  }

  private fun bind() {
    val activity = appContext.currentActivity
    if (activity !is LifecycleOwner) {
      fail("no activity to host the camera")
      return
    }
    val future = ProcessCameraProvider.getInstance(context)
    future.addListener({
      try {
        val cameraProvider = future.get()
        provider = cameraProvider
        cameraProvider.unbindAll()

        val preview = Preview.Builder().build().also {
          it.surfaceProvider = previewView.surfaceProvider
        }

        // A phone does not need a 4K frame to find a shoulder, and a smaller
        // one is the difference between a detector that keeps up and one that
        // falls behind the lifter.
        val resolution = ResolutionSelector.Builder()
          .setResolutionStrategy(
            ResolutionStrategy(Size(ANALYSIS_WIDTH, ANALYSIS_HEIGHT), ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER),
          )
          .build()

        val analysis = ImageAnalysis.Builder()
          .setResolutionSelector(resolution)
          // the newest frame only: a queue of stale frames would show the
          // lifter where they were, not where they are
          .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
          .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
          .build()

        val poseEngine = engine ?: PoseEngine(
          context = context.applicationContext,
          onResult = ::emitPose,
          onFailure = ::fail,
        ).also { engine = it }

        analysis.setAnalyzer(analysisExecutor) { proxy ->
          if (detecting && poseEngine.ready) poseEngine.submit(proxy) else proxy.close()
        }

        val recorder = Recorder.Builder()
          .setQualitySelector(QualitySelector.from(Quality.HD))
          .build()
        val capture = VideoCapture.withOutput(recorder)
        videoCapture = capture

        cameraProvider.bindToLifecycle(
          activity,
          CameraSelector.Builder().requireLensFacing(lensFacing).build(),
          preview,
          analysis,
          capture,
        )
        bound = true
        onStatus(Bundle().apply { putString("state", if (poseEngine.ready) "ready" else "no-detector") })
      } catch (e: Throwable) {
        fail(e.message ?: "the camera could not be opened")
      }
    }, ContextCompat.getMainExecutor(context))
  }

  /**
   * Start recording to `path`. The live screen keeps clips in its own cache
   * and deletes them on every exit from Review, so this takes a path rather
   * than choosing one — nothing here may touch the gallery.
   */
  fun startRecording(path: String) {
    val capture = videoCapture ?: run { fail("camera is not ready to record"); return }
    if (recording != null) return
    try {
      val output = FileOutputOptions.Builder(File(path)).build()
      // no audio: clips are recorded mute by design, and the app does not hold
      // the permission that would let it do otherwise
      recording = capture.output.prepareRecording(context, output)
        .start(ContextCompat.getMainExecutor(context)) { event ->
          if (event is VideoRecordEvent.Finalize) {
            recording = null
            // The file is only complete once the muxer has finalized it.
            // Announcing the path any earlier would hand Review a truncated
            // clip that plays for a fraction of the set and then stops.
            if (event.hasError()) fail("recording failed with code ${event.error}")
            onRecordingFinished(
              Bundle().apply {
                putString("path", path)
                putBoolean("ok", !event.hasError())
              },
            )
          }
        }
    } catch (e: Throwable) {
      fail(e.message ?: "recording could not start")
    }
  }

  fun stopRecording() {
    recording?.stop()
    recording = null
  }

  private fun emitPose(reading: PoseEngine.PoseReading) {
    onPose(
      Bundle().apply {
        putFloatArray("image", reading.image)
        putFloatArray("world", reading.world)
        putInt("width", reading.width)
        putInt("height", reading.height)
        putDouble("t", reading.timestampMs.toDouble())
        putDouble("latencyMs", reading.latencyMs.toDouble())
      },
    )
  }

  private fun fail(message: String) {
    onCameraError(Bundle().apply { putString("message", message) })
  }

  private fun release() {
    bound = false
    stopRecording()
    try {
      provider?.unbindAll()
    } catch (_: Throwable) {
      // tearing down a camera that is already gone is not an error
    }
    provider = null
    videoCapture = null
    engine?.close()
    engine = null
    analysisExecutor.shutdown()
  }

  private companion object {
    const val ANALYSIS_WIDTH = 720
    const val ANALYSIS_HEIGHT = 1280
  }
}
