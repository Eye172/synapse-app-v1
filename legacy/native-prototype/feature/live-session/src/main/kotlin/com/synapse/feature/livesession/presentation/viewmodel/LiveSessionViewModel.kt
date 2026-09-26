package com.synapse.feature.livesession.presentation.viewmodel

import android.util.Log
import androidx.lifecycle.viewModelScope
import com.synapse.core.ai.CoachingRepository
import com.synapse.core.ai.model.CoachingRequest
import com.synapse.core.camera.CameraManager
import com.synapse.core.camera.RecordingState
import com.synapse.core.common.BaseViewModel
import com.synapse.core.connectivity.IConnectivityRepository
import com.synapse.core.connectivity.model.ConnectionState
import com.synapse.core.database.dao.SessionDao
import com.synapse.core.database.entity.SessionEntity
import com.synapse.core.motion.MotionEngine
import com.synapse.core.motion.model.SkeletonFrame
import com.synapse.core.motion.model.TechniqueAnalysis
import com.synapse.core.motion.processor.SkeletalMapper
import com.synapse.feature.exerciselibrary.data.ExerciseRepository
import com.synapse.feature.exerciselibrary.domain.model.Exercise
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import java.io.File
import javax.inject.Inject
import javax.inject.Named

data class LiveSessionState(
    val exercise: Exercise? = null,
    val connectionState: ConnectionState = ConnectionState.Idle,
    val skeletonFrame: SkeletonFrame = SkeletalMapper.buildNeutralFrame(),
    val targetFrame: SkeletonFrame = SkeletalMapper.buildNeutralFrame(),
    val analysis: TechniqueAnalysis? = null,
    val coachingFeedback: String = "",
    val recordingState: RecordingState = RecordingState.Idle,
    val recordingProgress: Float = 0f,
    val selectedDuration: Int = 30,
    val countdown: Int = 0,
    val isSessionActive: Boolean = false,
    val sessionElapsedSeconds: Int = 0,
    val useFrontCamera: Boolean = false,
)

sealed interface LiveSessionAction {
    data object StartSession : LiveSessionAction
    data object StopSession : LiveSessionAction
    data object StartRecording : LiveSessionAction
    data object StopRecording : LiveSessionAction
    data class SelectDuration(val seconds: Int) : LiveSessionAction
    data object ToggleCamera : LiveSessionAction
}

sealed interface LiveSessionEffect {
    data class SessionComplete(val sessionId: String) : LiveSessionEffect
    data class ShowToast(val message: String) : LiveSessionEffect
}

@HiltViewModel
class LiveSessionViewModel @Inject constructor(
    private val connectivityRepository: IConnectivityRepository,
    private val motionEngine: MotionEngine,
    val cameraManager: CameraManager,
    private val exerciseRepository: ExerciseRepository,
    private val sessionDao: SessionDao,
    private val coachingRepository: CoachingRepository,
    @Named("openai_api_key") private val apiKey: String,
) : BaseViewModel<LiveSessionState, LiveSessionAction, LiveSessionEffect>(LiveSessionState()) {

    private var sessionStartMs = 0L
    private var videoFile: File? = null
    private var initialized = false
    private var timerJob: kotlinx.coroutines.Job? = null

    fun init(exerciseId: String) {
        if (initialized) return
        initialized = true

        viewModelScope.launch {
            val exercise = exerciseRepository.getExerciseById(exerciseId)
            if (exercise != null) {
                val target = SkeletalMapper.buildTargetFrame(exercise.name)
                updateState { copy(exercise = exercise, targetFrame = target) }
            }
        }

        connectivityRepository.connectionState
            .onEach { cs -> updateState { copy(connectionState = cs) } }
            .launchIn(viewModelScope)

        motionEngine.skeletonFrame
            .onEach { frame -> updateState { copy(skeletonFrame = frame) } }
            .launchIn(viewModelScope)

        motionEngine.techniqueAnalysis
            .onEach { analysis ->
                if (analysis != null) {
                    updateState { copy(analysis = analysis) }
                    if (analysis.errors.isNotEmpty() && state.value.isSessionActive) {
                        updateState { copy(coachingFeedback = analysis.errors.first().message) }
                    }
                }
            }
            .launchIn(viewModelScope)

        cameraManager.recordingState
            .onEach { rs -> updateState { copy(recordingState = rs) } }
            .launchIn(viewModelScope)

        cameraManager.recordingProgress
            .onEach { p ->
                updateState { copy(recordingProgress = p) }
                if (p >= 1f) stopRecordingAndFinish()
            }
            .launchIn(viewModelScope)
    }

    override fun handleAction(action: LiveSessionAction) = when (action) {
        is LiveSessionAction.StartSession    -> startSession()
        is LiveSessionAction.StopSession     -> stopSession()
        is LiveSessionAction.StartRecording  -> startRecording()
        is LiveSessionAction.StopRecording   -> stopRecordingAndFinish()
        is LiveSessionAction.SelectDuration  -> updateState { copy(selectedDuration = action.seconds) }
        is LiveSessionAction.ToggleCamera    -> updateState { copy(useFrontCamera = !useFrontCamera) }
    }

    private fun startSession() {
        val exercise = state.value.exercise ?: return
        sessionStartMs = System.currentTimeMillis()

        motionEngine.start(exercise.id, exercise.targetAngleDeg)
        connectivityRepository.startListening()

        updateState { copy(isSessionActive = true, countdown = 0) }

        timerJob = viewModelScope.launch {
            while (state.value.isSessionActive) {
                delay(1000)
                val elapsed = ((System.currentTimeMillis() - sessionStartMs) / 1000).toInt()
                updateState { copy(sessionElapsedSeconds = elapsed) }
            }
        }
    }

    private fun stopSession() {
        timerJob?.cancel()
        timerJob = null
        motionEngine.stop()
        updateState { copy(isSessionActive = false) }
        saveSessionAndNavigate()
    }

    private fun startRecording() {
        val duration = state.value.selectedDuration
        videoFile = cameraManager.startRecording(duration)
    }

    private fun stopRecordingAndFinish() {
        cameraManager.stopRecording()
        saveSessionAndNavigate()
    }

    private fun saveSessionAndNavigate() {
        val s = state.value
        val exercise = s.exercise ?: return
        val analysis = s.analysis
        val durationSeconds = s.sessionElapsedSeconds.takeIf { it > 0 } ?: s.selectedDuration

        viewModelScope.launch {
            // Build coaching request from last analysis snapshot
            val coachingRequest = CoachingRequest(
                exerciseName = exercise.name,
                qualityScore = analysis?.qualityScore ?: 50,
                symmetryScore = analysis?.symmetryScore ?: 50,
                stabilityScore = analysis?.stabilityScore ?: 50,
                riskScore = analysis?.riskScore ?: 50,
                backAngleDeg = s.skeletonFrame.backAngleDeg,
                isFormAlert = s.skeletonFrame.isFormAlert,
                errorDescriptions = analysis?.errors?.map { it.message } ?: emptyList(),
            )

            val aiResponse = try {
                coachingRepository.getCoachingFeedback(coachingRequest, apiKey)
            } catch (e: Exception) {
                Log.w("LiveSession", "AI coaching call failed", e)
                null
            }

            val aiText = aiResponse?.feedback ?: s.coachingFeedback

            val sessionEntity = SessionEntity(
                exerciseId = exercise.id,
                exerciseName = exercise.name,
                startedAt = sessionStartMs,
                durationSeconds = durationSeconds,
                qualityScore = analysis?.qualityScore ?: 50,
                symmetryScore = analysis?.symmetryScore ?: 50,
                stabilityScore = analysis?.stabilityScore ?: 50,
                riskScore = analysis?.riskScore ?: 50,
                aiCoachingFeedback = aiText,
                hasVideo = videoFile?.exists() == true,
                videoPath = videoFile?.absolutePath ?: "",
            )
            sessionDao.insertSession(sessionEntity)
            updateState { copy(isSessionActive = false, coachingFeedback = aiText) }
            emitEffect(LiveSessionEffect.SessionComplete(sessionEntity.id))
        }
    }

    override fun onCleared() {
        super.onCleared()
        timerJob?.cancel()
        motionEngine.stop()
        connectivityRepository.stopListening()
    }
}
