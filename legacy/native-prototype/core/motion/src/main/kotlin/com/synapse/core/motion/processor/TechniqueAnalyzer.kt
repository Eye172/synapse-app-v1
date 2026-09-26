package com.synapse.core.motion.processor

import com.synapse.core.motion.model.JointId
import com.synapse.core.motion.model.JointQuality
import com.synapse.core.motion.model.SkeletonFrame
import com.synapse.core.motion.model.TechniqueAnalysis
import com.synapse.core.motion.model.TechniqueError
import kotlin.math.abs
import kotlin.math.roundToInt

object TechniqueAnalyzer {

    fun analyze(frame: SkeletonFrame, targetAngle: Float): TechniqueAnalysis {
        val errors = mutableListOf<TechniqueError>()
        val angleDiff = abs(frame.backAngleDeg - targetAngle)

        val spineSeverity = when {
            angleDiff < 5f  -> JointQuality.GOOD
            angleDiff < 15f -> JointQuality.WARN
            angleDiff < 30f -> JointQuality.ERROR
            else            -> JointQuality.DANGER
        }

        if (spineSeverity != JointQuality.GOOD) {
            errors += TechniqueError(
                joint = JointId.SPINE_MID,
                severity = spineSeverity,
                message = when (spineSeverity) {
                    JointQuality.WARN   -> "Maintain a more upright posture."
                    JointQuality.ERROR  -> "Back angle significantly off – adjust your position."
                    JointQuality.DANGER -> "Dangerous back position – stop and reset."
                    else -> ""
                },
            )
        }

        if (frame.isFormAlert) {
            errors += TechniqueError(
                joint = JointId.SPINE_MID,
                severity = JointQuality.ERROR,
                message = "Sensor detects form error. Check back alignment.",
            )
        }

        val qualityScore = when (spineSeverity) {
            JointQuality.GOOD   -> 95
            JointQuality.WARN   -> 72
            JointQuality.ERROR  -> 45
            JointQuality.DANGER -> 15
            else -> 50
        }

        return TechniqueAnalysis(
            qualityScore = qualityScore,
            symmetryScore = 80,
            stabilityScore = if (frame.isFormAlert) 50 else 85,
            riskScore = 100 - qualityScore,
            errors = errors,
        )
    }
}
