package com.synapse.core.motion.processor

import com.synapse.core.motion.model.Joint
import com.synapse.core.motion.model.JointId
import com.synapse.core.motion.model.JointPosition
import com.synapse.core.motion.model.JointQuality
import com.synapse.core.motion.model.SkeletonFrame
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/**
 * Builds a [SkeletonFrame] from raw sensor data.
 *
 * With one torso sensor we derive:
 *  - SPINE_MID position from the measured back angle
 *  - Head/Neck follow the spine
 *  - Limbs held in neutral stance (adjustable per exercise)
 *
 * Coordinate system: (0,0) = top-left, (1,1) = bottom-right of the
 * bounding box (normalized skeleton space).
 */
object SkeletalMapper {

    private val NEUTRAL_POSITIONS = mapOf(
        JointId.HEAD       to JointPosition(0.50f, 0.06f),
        JointId.NECK       to JointPosition(0.50f, 0.14f),
        JointId.SHOULDER_LEFT  to JointPosition(0.33f, 0.22f),
        JointId.SHOULDER_RIGHT to JointPosition(0.67f, 0.22f),
        JointId.ELBOW_LEFT     to JointPosition(0.26f, 0.38f),
        JointId.ELBOW_RIGHT    to JointPosition(0.74f, 0.38f),
        JointId.WRIST_LEFT     to JointPosition(0.22f, 0.53f),
        JointId.WRIST_RIGHT    to JointPosition(0.78f, 0.53f),
        JointId.SPINE_MID      to JointPosition(0.50f, 0.40f),
        JointId.HIP_LEFT       to JointPosition(0.39f, 0.53f),
        JointId.HIP_RIGHT      to JointPosition(0.61f, 0.53f),
        JointId.KNEE_LEFT      to JointPosition(0.39f, 0.72f),
        JointId.KNEE_RIGHT     to JointPosition(0.61f, 0.72f),
        JointId.ANKLE_LEFT     to JointPosition(0.38f, 0.90f),
        JointId.ANKLE_RIGHT    to JointPosition(0.62f, 0.90f),
    )

    fun buildFrame(angleDegs: Float, isFormAlert: Boolean): SkeletonFrame {
        // Map back angle → torso lean offset.
        // Firmware: 0° = vertical (good), larger = leaning forward.
        // We display the top half of the skeleton shifted based on lean.
        val leanFraction = (angleDegs / 90f).coerceIn(-1f, 1f)
        val leanX = leanFraction * 0.08f   // max ±8% horizontal shift for upper body

        val spineMidQuality = when {
            !isFormAlert        -> JointQuality.GOOD
            angleDegs < 30f     -> JointQuality.WARN
            angleDegs < 15f     -> JointQuality.ERROR
            else                -> JointQuality.DANGER
        }

        val joints = NEUTRAL_POSITIONS.map { (id, pos) ->
            val adjusted = when (id) {
                JointId.HEAD, JointId.NECK,
                JointId.SHOULDER_LEFT, JointId.SHOULDER_RIGHT,
                JointId.ELBOW_LEFT, JointId.ELBOW_RIGHT,
                JointId.WRIST_LEFT, JointId.WRIST_RIGHT ->
                    pos.copy(x = pos.x + leanX)
                JointId.SPINE_MID ->
                    pos.copy(x = pos.x + leanX * 0.5f)
                else -> pos
            }
            val isLive = id == JointId.SPINE_MID
            val quality = if (isLive) spineMidQuality else JointQuality.UNKNOWN
            id to Joint(id = id, position = adjusted, quality = quality, isLive = isLive)
        }.toMap()

        return SkeletonFrame(
            joints = joints,
            backAngleDeg = angleDegs,
            isFormAlert = isFormAlert,
        )
    }

    fun buildNeutralFrame(): SkeletonFrame = buildFrame(angleDegs = 0f, isFormAlert = false)

    fun buildTargetFrame(exerciseType: String): SkeletonFrame {
        // Per-exercise target poses (extensible via exercise metadata)
        return when (exerciseType.lowercase()) {
            "deadlift" -> buildFrame(45f, false)
            "squat"    -> buildFrame(30f, false)
            else       -> buildNeutralFrame()
        }
    }
}
