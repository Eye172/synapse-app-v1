package com.synapse.core.camera

import android.content.Context
import android.util.Log
import androidx.camera.core.CameraSelector
import androidx.camera.core.Preview
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
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File
import java.text.SimpleDateFormat
import java.util.Locale
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "CameraManager"

enum class RecordingState { Idle, Recording, Stopped }

@Singleton
class CameraManager @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val _recordingState = MutableStateFlow(RecordingState.Idle)
    val recordingState: StateFlow<RecordingState> = _recordingState.asStateFlow()

    private val _recordingProgress = MutableStateFlow(0f)
    val recordingProgress: StateFlow<Float> = _recordingProgress.asStateFlow()

    private var videoCapture: VideoCapture<Recorder>? = null
    private var activeRecording: Recording? = null
    private var currentOutputFile: File? = null

    fun bindCamera(
        lifecycleOwner: LifecycleOwner,
        previewView: PreviewView,
        useFrontCamera: Boolean = false,
    ) {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(context)
        cameraProviderFuture.addListener({
            val cameraProvider = cameraProviderFuture.get()

            val preview = Preview.Builder().build().also {
                it.surfaceProvider = previewView.surfaceProvider
            }

            val recorder = Recorder.Builder()
                .setQualitySelector(QualitySelector.from(Quality.HD))
                .build()
            videoCapture = VideoCapture.withOutput(recorder)

            val selector = if (useFrontCamera) CameraSelector.DEFAULT_FRONT_CAMERA
                           else CameraSelector.DEFAULT_BACK_CAMERA

            try {
                cameraProvider.unbindAll()
                cameraProvider.bindToLifecycle(lifecycleOwner, selector, preview, videoCapture)
                Log.d(TAG, "Camera bound successfully")
            } catch (e: Exception) {
                Log.e(TAG, "Camera bind failed", e)
            }
        }, ContextCompat.getMainExecutor(context))
    }

    fun startRecording(durationSeconds: Int = 30): File? {
        val vc = videoCapture ?: return null
        val file = createTempVideoFile()
        currentOutputFile = file
        val outputOptions = FileOutputOptions.Builder(file).build()

        activeRecording = vc.output
            .prepareRecording(context, outputOptions)
            .apply { withAudioEnabled() }
            .start(ContextCompat.getMainExecutor(context)) { event ->
                when (event) {
                    is VideoRecordEvent.Status -> {
                        val progress = event.recordingStats.recordedDurationNanos /
                                (durationSeconds * 1_000_000_000.0)
                        _recordingProgress.value = progress.toFloat().coerceIn(0f, 1f)
                        if (_recordingProgress.value >= 1f) stopRecording()
                    }
                    is VideoRecordEvent.Finalize -> {
                        _recordingState.value = RecordingState.Stopped
                        Log.d(TAG, "Recording finalized: ${file.absolutePath}")
                    }
                    else -> {}
                }
            }
        _recordingState.value = RecordingState.Recording
        Log.d(TAG, "Recording started: ${file.absolutePath}")
        return file
    }

    fun stopRecording() {
        activeRecording?.stop()
        activeRecording = null
    }

    fun deleteCurrentRecording() {
        currentOutputFile?.let { if (it.exists()) it.delete() }
        currentOutputFile = null
    }

    private fun createTempVideoFile(): File {
        val timestamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(System.currentTimeMillis())
        val dir = File(context.cacheDir, "synapse_recordings").also { it.mkdirs() }
        return File(dir, "session_$timestamp.mp4")
    }
}
