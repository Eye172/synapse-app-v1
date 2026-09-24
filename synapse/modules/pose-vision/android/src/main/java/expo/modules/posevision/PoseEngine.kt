package expo.modules.posevision

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Matrix
import androidx.camera.core.ImageProxy
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarkerResult

/**
 * The pose landmarker, fed one camera frame at a time.
 *
 * This is the piece the app was missing. Everything downstream of a detection
 * — smoothing, bone lengths, the camera solve, the mannequin — already exists
 * in TypeScript and is already tested; none of it could ever run because
 * nothing on Android produced landmarks. `expo-camera` renders a preview and
 * hands frames to nobody, so the camera has to be owned here instead.
 *
 * Two spaces come back, and both matter. The image landmarks say where the
 * joints appeared in the picture; the world landmarks say how big the body
 * actually is, in metres. Only together do they recover the lens that took
 * the frame, which is what puts a measured figure on a real person rather
 * than a drawing over a photograph.
 */
internal class PoseEngine(
  context: Context,
  private val onResult: (PoseReading) -> Unit,
  private val onFailure: (String) -> Unit,
) {
  /** One detection, flattened for the trip across the bridge. */
  internal data class PoseReading(
    /** 33 × (x, y, z, visibility), normalized to the frame, y down */
    val image: FloatArray,
    /** 33 × (x, y, z, visibility), metres, origin between the hips, y down */
    val world: FloatArray,
    /** size of the frame the landmarks are normalized against, after rotation */
    val width: Int,
    val height: Int,
    /** the frame's own timestamp, ms */
    val timestampMs: Long,
    /** how long the detector took, ms */
    val latencyMs: Long,
  )

  private var landmarker: PoseLandmarker? = null

  /** Frames arrive faster than MediaPipe's monotonic clock tolerates ties. */
  private var lastStamp = 0L

  init {
    try {
      val base = BaseOptions.builder()
        .setModelAssetPath(MODEL_ASSET)
        // GPU is materially faster on the mid-range phones this is for, and
        // falls back to CPU on its own when the driver will not have it.
        .setDelegate(Delegate.GPU)
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
        .setErrorListener { e -> onFailure(e.message ?: "pose landmarker failed") }
        .build()

      landmarker = PoseLandmarker.createFromOptions(context, options)
    } catch (e: Throwable) {
      // A missing model or a device the delegate cannot serve is reported, not
      // swallowed: the app's contract is that it measures or says it cannot.
      onFailure(e.message ?: "pose landmarker could not be created")
    }
  }

  val ready: Boolean get() = landmarker != null

  /**
   * Hand one camera frame to the detector.
   *
   * The frame is rotated upright first. MediaPipe reports landmarks in the
   * coordinates of the image it was given, and the rest of the pipeline
   * assumes those are the coordinates the preview is showing — a frame left
   * in sensor orientation would put every joint on its side.
   */
  fun submit(proxy: ImageProxy) {
    val lm = landmarker
    if (lm == null) {
      proxy.close()
      return
    }
    try {
      val bitmap = proxy.toUprightBitmap() ?: run { proxy.close(); return }
      val stamp = (proxy.imageInfo.timestamp / 1_000_000L).let {
        // strictly increasing, or MediaPipe rejects the frame outright
        if (it <= lastStamp) lastStamp + 1 else it
      }
      lastStamp = stamp
      started[stamp] = System.currentTimeMillis()
      lm.detectAsync(BitmapImageBuilder(bitmap).build(), stamp)
    } catch (e: Throwable) {
      onFailure(e.message ?: "frame could not be analysed")
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
    landmarker = null
    started.clear()
  }

  private val started = HashMap<Long, Long>()

  private fun publish(result: PoseLandmarkerResult, width: Int, height: Int) {
    val stamp = result.timestampMs()
    val began = started.remove(stamp)
    // the map only grows if results are dropped; keep it from becoming a leak
    if (started.size > STAMP_SLACK) started.clear()

    val image = result.landmarks().firstOrNull()
    val world = result.worldLandmarks().firstOrNull()
    if (image == null || world == null) return

    val img = FloatArray(image.size * 4)
    for (i in image.indices) {
      val p = image[i]
      img[i * 4] = p.x()
      img[i * 4 + 1] = p.y()
      img[i * 4 + 2] = p.z()
      img[i * 4 + 3] = p.visibility().orElse(1f)
    }

    val wld = FloatArray(world.size * 4)
    for (i in world.indices) {
      val p = world[i]
      wld[i * 4] = p.x()
      wld[i * 4 + 1] = p.y()
      wld[i * 4 + 2] = p.z()
      wld[i * 4 + 3] = p.visibility().orElse(1f)
    }

    onResult(
      PoseReading(
        image = img,
        world = wld,
        width = width,
        height = height,
        timestampMs = stamp,
        latencyMs = if (began == null) 0L else System.currentTimeMillis() - began,
      ),
    )
  }

  private companion object {
    const val MODEL_ASSET = "pose_landmarker_full.task"
    const val MIN_DETECTION = 0.5f
    const val MIN_PRESENCE = 0.5f
    const val MIN_TRACKING = 0.5f
    const val STAMP_SLACK = 64
  }
}

/**
 * The analyser is configured for RGBA_8888, so a frame is one packed buffer
 * and needs no YUV conversion. Rotation is applied here rather than left to
 * the consumer: everything downstream reasons about an upright picture.
 */
private fun ImageProxy.toUprightBitmap(): Bitmap? {
  val plane = planes.firstOrNull() ?: return null
  val bitmap = Bitmap.createBitmap(
    plane.rowStride / plane.pixelStride,
    height,
    Bitmap.Config.ARGB_8888,
  )
  bitmap.copyPixelsFromBuffer(plane.buffer)

  // rowStride can overshoot the real width; trim the padding before rotating
  val trimmed =
    if (bitmap.width == width) bitmap
    else Bitmap.createBitmap(bitmap, 0, 0, width, height)

  val degrees = imageInfo.rotationDegrees
  if (degrees == 0) return trimmed

  val matrix = Matrix().apply { postRotate(degrees.toFloat()) }
  return Bitmap.createBitmap(trimmed, 0, 0, trimmed.width, trimmed.height, matrix, true)
}
