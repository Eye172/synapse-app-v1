package expo.modules.posevision

import android.annotation.SuppressLint
import android.content.Context
import android.os.Bundle
import android.util.Size
import android.view.View
import android.view.ViewGroup
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.core.UseCase
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.FallbackStrategy
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
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * The camera, owned outright.
 *
 * `expo-camera` shows a preview and keeps its frames to itself, and Android
 * will not open the same camera twice, so a detector that needs pixels has to
 * replace the preview rather than sit beside it. This view therefore carries
 * all three use cases a set needs — preview, frame analysis and recording —
 * off one camera session.
 *
 * It deliberately draws nothing. The overlay stays in React, built by the
 * app's own renderer from the landmarks this view emits, so the figure on a
 * phone comes from the same code the harness draws with on a laptop.
 */
@SuppressLint("ViewConstructor")
class PoseVisionView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onPose by EventDispatcher<Bundle>()
  private val onStatus by EventDispatcher<Bundle>()
  private val onCameraError by EventDispatcher<Bundle>()
  private val onRecordingFinished by EventDispatcher<Bundle>()

  private val previewView = PreviewView(context).apply {
    elevation = 0f
    // FILL_CENTER matches `coverViewport`, which is how the app maps a frame
    // onto the screen; any other scale type and the overlay sits off the body
    scaleType = PreviewView.ScaleType.FILL_CENTER
  }

  /**
   * Everything tied to one detector: the thread it runs on and the engine
   * itself. Replaced whole on every attach, because a shut-down executor
   * cannot be restarted and a view that is detached and re-attached — a
   * navigation, a flip back to the app — must come back working.
   */
  private class Session {
    val executor: ExecutorService = Executors.newSingleThreadExecutor()

    @Volatile var engine: PoseEngine? = null

    @Volatile var closed = false
  }

  private var session: Session? = null
  private var provider: ProcessCameraProvider? = null
  private var videoCapture: VideoCapture<Recorder>? = null
  private var recording: Recording? = null
  private var attached = false
  private var lastWidth = -1
  private var lastHeight = -1

  /** what the JavaScript side is told; re-sent whole on every change */
  private var cameraState = "starting"
  private var detectorState = "loading"
  private var detectorDetail = ""
  private var canRecord = false

  /** front or back, as the live screen's flip control sets it */
  var lensFacing: Int = CameraSelector.LENS_FACING_FRONT
    set(value) {
      if (field == value) return
      field = value
      if (attached) bindCamera()
    }

  /** false skips detection without tearing the camera down */
  @Volatile var detecting: Boolean = true

  init {
    // PreviewView adds its SurfaceView or TextureView asynchronously, once the
    // camera asks for a surface. React Native never lays out a native child it
    // did not create, so without this the preview stays 0×0 and the screen is
    // black while the camera runs — the same trap expo-camera works around.
    previewView.setOnHierarchyChangeListener(object : OnHierarchyChangeListener {
      override fun onChildViewRemoved(parent: View?, child: View?) = Unit
      override fun onChildViewAdded(parent: View?, child: View?) {
        parent?.measure(
          MeasureSpec.makeMeasureSpec(measuredWidth, MeasureSpec.EXACTLY),
          MeasureSpec.makeMeasureSpec(measuredHeight, MeasureSpec.EXACTLY),
        )
        parent?.layout(0, 0, parent.measuredWidth, parent.measuredHeight)
      }
    })
    addView(
      previewView,
      ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT),
    )
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    measureChild(previewView, widthMeasureSpec, heightMeasureSpec)
    setMeasuredDimension(
      ViewGroup.resolveSize(previewView.measuredWidth, widthMeasureSpec),
      ViewGroup.resolveSize(previewView.measuredHeight, heightMeasureSpec),
    )
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    val width = right - left
    val height = bottom - top
    if (width != lastWidth || height != lastHeight) {
      previewView.layout(0, 0, width, height)
      lastWidth = width
      lastHeight = height
    }
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    attached = true
    bindCamera()
  }

  override fun onDetachedFromWindow() {
    attached = false
    release()
    super.onDetachedFromWindow()
  }

  private fun currentSession(): Session =
    session ?: Session().also {
      session = it
      startEngine(it)
    }

  /** Build the detector off the UI thread: it loads a model and may start a GPU context. */
  private fun startEngine(s: Session) {
    detectorState = "loading"
    s.executor.execute {
      if (s.closed) return@execute
      val engine = PoseEngine(
        context = context.applicationContext,
        onResult = ::emitPose,
        onFailure = { message -> post { reportError(message) } },
      )
      if (s.closed) {
        engine.close()
        return@execute
      }
      s.engine = engine
      post {
        if (engine.ready) {
          detectorState = "ready"
          detectorDetail = engine.delegate ?: ""
        } else {
          detectorState = "unavailable"
          detectorDetail = engine.failure ?: ""
        }
        emitStatus()
      }
    }
  }

  private fun bindCamera() {
    val owner = appContext.currentActivity as? LifecycleOwner
    if (owner == null) {
      failCamera("there is no activity to host the camera")
      return
    }
    val s = currentSession()
    val future = ProcessCameraProvider.getInstance(context)
    future.addListener({
      if (!attached) return@addListener
      try {
        val cameraProvider = future.get()
        provider = cameraProvider
        stopRecording()
        cameraProvider.unbindAll()

        // Preview, analysis and recording all ask for the same 16:9 shape, so
        // they see the same field of view. Were the analysis stream 4:3 while
        // the preview is 16:9, the detector would be looking at more of the
        // room than the wearer is, and the figure would land off their body by
        // an amount that changes from phone to phone.
        val shape = AspectRatioStrategy.RATIO_16_9_FALLBACK_AUTO_STRATEGY

        val preview = Preview.Builder()
          .setResolutionSelector(ResolutionSelector.Builder().setAspectRatioStrategy(shape).build())
          .build()
          .also { it.surfaceProvider = previewView.surfaceProvider }

        // A phone does not need a 4K frame to find a shoulder, and a smaller one
        // is the difference between a detector that keeps up with a rep and one
        // that falls behind it. Sizes here are in the sensor's own landscape
        // orientation; the frame is rotated upright before detection.
        val analysis = ImageAnalysis.Builder()
          .setResolutionSelector(
            ResolutionSelector.Builder()
              .setAspectRatioStrategy(shape)
              .setResolutionStrategy(
                ResolutionStrategy(
                  Size(ANALYSIS_LONG_SIDE, ANALYSIS_SHORT_SIDE),
                  ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER,
                ),
              )
              .build(),
          )
          // the newest frame only: a queue of stale frames shows the lifter
          // where they were, not where they are
          .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
          .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
          .build()
          .also {
            it.setAnalyzer(s.executor) { proxy ->
              val engine = s.engine
              if (detecting && engine != null && engine.ready) engine.submit(proxy) else proxy.close()
            }
          }

        val recorder = Recorder.Builder()
          .setQualitySelector(
            QualitySelector.from(Quality.HD, FallbackStrategy.lowerQualityOrHigherThan(Quality.HD)),
          )
          .build()
        val capture = VideoCapture.withOutput(recorder)

        val selector = CameraSelector.Builder().requireLensFacing(lensFacing).build()

        // Not every phone can run three streams at once. Detection is the point
        // of this view and recording is optional, so when the full set will not
        // bind, recording is the part given up — and the app is told, so it
        // does not offer a clip it cannot make.
        val bound = bindFirstThatFits(
          cameraProvider,
          owner,
          selector,
          listOf(
            listOf(preview, analysis, capture),
            listOf(preview, analysis),
            listOf(preview),
          ),
        )
        if (bound == null) {
          failCamera("this camera cannot run a preview")
          return@addListener
        }
        videoCapture = if (capture in bound) capture else null
        canRecord = videoCapture != null
        if (analysis !in bound) {
          detectorState = "unavailable"
          detectorDetail = "this camera cannot stream frames to the detector"
        }
        cameraState = "ready"
        emitStatus()
      } catch (e: Throwable) {
        failCamera(e.message ?: "the camera could not be opened")
      }
    }, ContextCompat.getMainExecutor(context))
  }

  private fun bindFirstThatFits(
    cameraProvider: ProcessCameraProvider,
    owner: LifecycleOwner,
    selector: CameraSelector,
    candidates: List<List<UseCase>>,
  ): List<UseCase>? {
    for (useCases in candidates) {
      try {
        cameraProvider.unbindAll()
        cameraProvider.bindToLifecycle(owner, selector, *useCases.toTypedArray())
        return useCases
      } catch (_: IllegalArgumentException) {
        // this combination of streams is beyond this camera; try a smaller one
      }
    }
    return null
  }

  /**
   * Start recording to `path`. The app keeps clips in its own cache and
   * deletes them on every exit from Review, so this takes a path rather than
   * choosing one — nothing here may touch the gallery.
   */
  fun startRecording(path: String) {
    val capture = videoCapture ?: throw IllegalStateException("this camera cannot record right now")
    if (recording != null) return
    val file = File(path)
    file.parentFile?.mkdirs()
    // no audio: clips are recorded mute by design, and the app does not hold
    // the permission that would let it do otherwise
    recording = capture.output
      .prepareRecording(context, FileOutputOptions.Builder(file).build())
      .start(ContextCompat.getMainExecutor(context)) { event ->
        if (event is VideoRecordEvent.Finalize) {
          recording = null
          // The clip is only complete once the muxer has finalized it; before
          // that the path points at a truncated file. Some errors still leave
          // a playable clip — a recording cut short is still a recording.
          val usable = file.exists() && file.length() > 0 && event.error in USABLE_FINALIZE
          if (!usable) reportError("recording failed (code ${event.error})")
          onRecordingFinished(
            Bundle().apply {
              putString("path", path)
              putBoolean("ok", usable)
            },
          )
        }
      }
  }

  fun stopRecording() {
    recording?.stop()
    recording = null
  }

  private fun emitPose(reading: PoseEngine.PoseReading) {
    // results arrive on MediaPipe's thread; events leave from the main one,
    // as every other camera view in this app does
    post {
      if (!attached) return@post
      onPose(
        Bundle().apply {
          putFloatArray("image", reading.image)
          putFloatArray("world", reading.world)
          putInt("width", reading.width)
          putInt("height", reading.height)
          putDouble("t", reading.capturedAtMs.toDouble())
          putDouble("latencyMs", reading.latencyMs.toDouble())
        },
      )
    }
  }

  private fun emitStatus() {
    onStatus(
      Bundle().apply {
        putString("camera", cameraState)
        putString("detector", detectorState)
        putString("detail", detectorDetail)
        putBoolean("canRecord", canRecord)
      },
    )
  }

  private fun failCamera(message: String) {
    cameraState = "failed"
    canRecord = false
    onCameraError(Bundle().apply { putString("message", message) })
    emitStatus()
  }

  /** A problem worth telling someone about that does not stop the camera. */
  private fun reportError(message: String) {
    onCameraError(
      Bundle().apply {
        putString("message", message)
        putBoolean("fatal", false)
      },
    )
  }

  private fun release() {
    stopRecording()
    try {
      provider?.unbindAll()
    } catch (_: Throwable) {
      // tearing down a camera that is already gone is not an error
    }
    provider = null
    videoCapture = null
    canRecord = false
    cameraState = "starting"

    val s = session ?: return
    session = null
    s.closed = true
    // queued behind any construction still running, so an engine built after
    // the view went away is closed rather than leaked
    s.executor.execute {
      s.engine?.close()
      s.engine = null
    }
    s.executor.shutdown()
  }

  private companion object {
    const val ANALYSIS_LONG_SIDE = 1280
    const val ANALYSIS_SHORT_SIDE = 720

    val USABLE_FINALIZE = setOf(
      VideoRecordEvent.Finalize.ERROR_NONE,
      VideoRecordEvent.Finalize.ERROR_DURATION_LIMIT_REACHED,
      VideoRecordEvent.Finalize.ERROR_FILE_SIZE_LIMIT_REACHED,
      VideoRecordEvent.Finalize.ERROR_SOURCE_INACTIVE,
    )
  }
}
