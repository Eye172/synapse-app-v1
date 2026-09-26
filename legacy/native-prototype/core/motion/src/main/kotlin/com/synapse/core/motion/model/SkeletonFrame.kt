package com.synapse.core.motion.model

data class SkeletonFrame(
    val joints: Map<JointId, Joint>,
    val backAngleDeg: Float,
    val isFormAlert: Boolean,
    val timestampMs: Long = System.currentTimeMillis(),
) {
    val overallQuality: JointQuality
        get() = joints.values
            .filter { it.isLive }
            .maxByOrNull { it.quality.ordinal }
            ?.quality ?: JointQuality.UNKNOWN
}

data class TechniqueAnalysis(
    val qualityScore: Int,      // 0-100
    val symmetryScore: Int,     // 0-100
    val stabilityScore: Int,    // 0-100
    val riskScore: Int,         // 0-100 (lower = safer)
    val errors: List<TechniqueError>,
)

data class TechniqueError(
    val joint: JointId,
    val severity: JointQuality,
    val message: String,
)
