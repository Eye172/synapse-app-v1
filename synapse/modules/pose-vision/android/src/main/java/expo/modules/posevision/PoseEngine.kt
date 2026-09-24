package expo.modules.posevision

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Matrix
import android.os.SystemClock
import androidx.camera.core.ImageProxy
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarkerResult
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * The pose landmarker, fed one camera frame at a time.
 *
 * Everything downstream of a detection — smoothing, bone lengths, the camera
 * solve, the mannequin — lives in TypeScript and is tested there. This class
 * exists because nothing on Android produced landmarks at all: `expo-camera`
 * shows a preview and hands its frames to nobody.
 *
 * Two spaces come back per frame, and both matter. Image landmarks say where
 * the joints appeared in the picture; world landmarks say how big the body is,
 * in metres. Only together do they recover the lens that took the frame.
 *
 * Threading: construct this and call [submit] on the same single background
 * thread. Construction loads a model and may bring up a GPU context, which is
 * far too slow for the UI thread; results arrive on MediaPipe's own thread.
 */
internal class PoseEngine(
  context: Context,
  private val onResult: (PoseReading) -> Unit,
  private val onFailure: (String) -> Unit,
) {
  /** One detection, flattened for the trip across the bridge. */
  internal class PoseReading(
    /** 33 × (x, y, z, visibility), normalized to the frame, y down */
    val image: FloatArray,
    /** 33 × (x, y, z, visibility), metres, origin between the hips, y down */
    val world: FloatArray,
    /** size of the upright frame the image landmarks are normalized against */
    val width: Int,
    val height: Int,
    /**
     * When the frame was handed to the detector, on the wall clock.
     *
     * Not the camera's own timestamp: that runs on the sensor's clock, which
     * counts from boot, while everything in JavaScript samples against
     * `Date.now()`. Handing the tracker one clock for updates and another for
     * sampling makes every joint look hours stale, and the figure never
     * appears — silently, with no error anywhere.
     */
    val capturedAtMs: Long,
    /** how long the detector took on this frame, ms */
    val latencyMs: Long,
  )

  private val landmarker: PoseLandmarker?

  /** which hardware the detector ended up on, for diagnostics; null if none */
  val delegate: String?

  /** why there is no detector, when there is none */
  val failure: String?

  /** MediaPipe rejects a timestamp that does not strictly increase. */
  private var lastStamp = 0L

  /**
   * A fault that repeats does so on every frame — thirty times a second — and
   * reporting each one would flood the bridge with the same sentence. The first
   * is reported, then at most one per interval.
   */
  @Volatile private var lastFailureAt = 0L

  init {
    var built: PoseLandmarker? = null
    var used: String? = null
    var reason: String? = null

    val model = loadModel(context)
    if (model == null) {
      reason = "the pose model is missing from this build"
    } else {
      // GPU first: it is materially faster on the mid-range phones this is for.
      // It does not fall back by itself — createFromOptions throws when the
      // driver will not have it — so the fallback to CPU is done here, and a
      // phone with an awkward GPU still gets a working detector.
      for (hardware in listOf(Delegate.GPU, Delegate.CPU)) {
        try {
          built = create(context, model.duplicate(), hardware)
          used = hardware.name
          break
        } catch (e: Throwable) {
          reason = "${hardware.name}: ${e.message ?: e.javaClass.simpleName}"
        }
      }
    }

    landmarker = built
    delegate = used
    failure = if (built == null) reason ?: "the pose detector could not be created" else null
  }

  val ready: Boolean get() = landmarker != null

  /**
   * Hand one camera frame to the detector. Always closes the frame.
   *
   * The frame is rotated upright first, because MediaPipe reports landmarks in
   * the coordinates of the image it was given and everything downstream
   * reasons about an upright picture. It is deliberately *not* mirrored, even
   * from the front camera: the detector names joints by the side of the body
   * they are on, and a mirrored frame would call a left knee the right one —
   * which is the side a technique fault is reported against. The preview is
   * mirrored for the wearer; that happens on screen, never here.
   */
  fun submit(proxy: ImageProxy) {
    val lm = landmarker
    try {
      if (lm == null) return
      val upright = proxy.toUprightBitmap()
      val now = SystemClock.uptimeMillis()
      val stamp = if (now <= lastStamp) lastStamp + 1 else now
      lastStamp = stamp
      lm.detectAsync(BitmapImageBuilder(upright).build(), stamp)
    } catch (e: Throwable) {
      reportFailure(e.message ?: "a frame could not be analysed")
    } finally {
      proxy.close()
    }
  }

  fun close() {
    try {
      landmarker?.close()
    } catch (_: Throwable) {
      // a detector that will not close cleanly must not take the app with it
    }
  }

  private fun create(context: Context, model: ByteBuffer, hardware: Delegate): PoseLandmarker {
    val base = BaseOptions.builder()
      // Loaded into memory rather than named by asset path: MediaPipe reads a
      // path by memory-mapping it, which fails on an asset the packager has
      // compressed — and nothing in a library module can stop the app from
      // compressing it. A buffer works however the APK was packed.
      .setModelAssetBuffer(model)
      .setDelegate(hardware)
      .build()

    val options = PoseLandmarker.PoseLandmarkerOptions.builder()
      .setBaseOptions(base)
      .setRunningMode(RunningMode.LIVE_STREAM)
      .setNumPoses(1)
      .setMinPoseDetectionConfidence(MIN_DETECTION)
      .setMinPosePresenceConfidence(MIN_PRESENCE)
      .setMinTrackingConfidence(MIN_TRACKING)
      .setOutputSegmentationMasks(false)
      .setResultListener { result, input -> publish(result, input.width, input.height) }
      .setErrorListener { e -> reportFailure(e.message ?: "the pose detector failed") }
      .build()

    return PoseLandmarker.createFromOptions(context, options)
  }

  private fun reportFailure(message: String) {
    val now = SystemClock.uptimeMillis()
    if (lastFailureAt != 0L && now - lastFailureAt < FAILURE_INTERVAL_MS) return
    lastFailureAt = now
    onFailure(message)
  }

  private fun publish(result: PoseLandmarkerResult, width: Int, height: Int) {
    val image = result.landmarks().firstOrNull() ?: return
    val world = result.worldLandmarks().firstOrNull() ?: return
    if (image.size != LANDMARKS || world.size != LANDMARKS) return

    val img = FloatArray(LANDMARKS * STRIDE)
    val wld = FloatArray(LANDMARKS * STRIDE)
    for (i in 0 until LANDMARKS) {
      val p = image[i]
      img[i * STRIDE] = p.x()
      img[i * STRIDE + 1] = p.y()
      img[i * STRIDE + 2] = p.z()
      img[i * STRIDE + 3] = p.visibility().orElse(0f)

      val w = world[i]
      wld[i * STRIDE] = w.x()
      wld[i * STRIDE + 1] = w.y()
      wld[i * STRIDE + 2] = w.z()
      wld[i * STRIDE + 3] = w.visibility().orElse(0f)
    }

    // the stamp was taken on the uptime clock when the frame went in, so the
    // detector's latency is exact, and the wall-clock moment the frame was
    // taken is that far back from now
    val latency = (SystemClock.uptimeMillis() - result.timestampMs()).coerceAtLeast(0L)
    onResult(
      PoseReading(
        image = img,
        world = wld,
        width = width,
        height = height,
        capturedAtMs = System.currentTimeMillis() - latency,
        latencyMs = latency,
      ),
    )
  }

  private companion object {
    const val MODEL_ASSET = "pose_landmarker_full.task"
    const val LANDMARKS = 33
    const val STRIDE = 4
    const val MIN_DETECTION = 0.5f
    const val MIN_PRESENCE = 0.5f
    const val MIN_TRACKING = 0.5f
    const val FAILURE_INTERVAL_MS = 5000L

    fun loadModel(context: Context): ByteBuffer? =
      try {
        context.assets.open(MODEL_ASSET).use { input ->
          val bytes = input.readBytes()
          ByteBuffer.allocateDirect(bytes.size).order(ByteOrder.nativeOrder()).apply {
            put(bytes)
            rewind()
          }
        }
      } catch (_: Throwable) {
        null
      }
  }
}

/**
 * CameraX's own conversion, which knows about row padding and pixel format —
 * copying the plane buffer by hand breaks on any device whose row stride is
 * wider than the image. Rotation is applied here because every consumer
 * downstream assumes an upright picture.
 */
private fun ImageProxy.toUprightBitmap(): Bitmap {
  val raw = toBitmap()
  val degrees = imageInfo.rotationDegrees
  if (degrees == 0) return raw
  val matrix = Matrix().apply { postRotate(degrees.toFloat()) }
  val upright = Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, matrix, true)
  if (upright !== raw) raw.recycle()
  return upright
}
