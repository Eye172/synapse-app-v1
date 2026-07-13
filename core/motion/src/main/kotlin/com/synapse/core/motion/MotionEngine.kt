package com.synapse.core.motion

import com.synapse.core.connectivity.IConnectivityRepository
import com.synapse.core.connectivity.model.SensorReading
import com.synapse.core.motion.model.SkeletonFrame
import com.synapse.core.motion.model.TechniqueAnalysis
import com.synapse.core.motion.processor.SkeletalMapper
import com.synapse.core.motion.processor.TechniqueAnalyzer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class MotionEngine @Inject constructor(
    private val connectivityRepository: IConnectivityRepository,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private val _skeletonFrame = MutableStateFlow(SkeletalMapper.buildNeutralFrame())
    val skeletonFrame: StateFlow<SkeletonFrame> = _skeletonFrame.asStateFlow()

    private val _techniqueAnalysis = MutableStateFlow<TechniqueAnalysis?>(null)
    val techniqueAnalysis: StateFlow<TechniqueAnalysis?> = _techniqueAnalysis.asStateFlow()

    private var targetAngle: Float = 0f
    private var isRunning = false

    fun start(exerciseId: String, targetAngleDeg: Float = 0f) {
        if (isRunning) return
        isRunning = true
        targetAngle = targetAngleDeg

        connectivityRepository.sensorStream
            .filterNotNull()
            .onEach { reading -> process(reading) }
            .launchIn(scope)
    }

    fun stop() {
        isRunning = false
        _skeletonFrame.value = SkeletalMapper.buildNeutralFrame()
        _techniqueAnalysis.value = null
    }

    private fun process(reading: SensorReading) {
        if (!reading.isValid) return
        val frame = SkeletalMapper.buildFrame(reading.angleDegs, reading.isFormAlert)
        _skeletonFrame.value = frame
        _techniqueAnalysis.value = TechniqueAnalyzer.analyze(frame, targetAngle)
    }
}
