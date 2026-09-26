package com.synapse.core.motion.model

/**
 * Named joints of the skeletal model.
 * Current hardware: only SPINE_MID receives live sensor data.
 * All others are held at calibrated neutral or estimated from context.
 */
enum class JointId {
    HEAD,
    NECK,
    SHOULDER_LEFT, SHOULDER_RIGHT,
    ELBOW_LEFT, ELBOW_RIGHT,
    WRIST_LEFT, WRIST_RIGHT,
    SPINE_MID,   // ← BNO085 sensor placed here
    HIP_LEFT, HIP_RIGHT,
    KNEE_LEFT, KNEE_RIGHT,
    ANKLE_LEFT, ANKLE_RIGHT,
}

/** Normalised 2D position in skeleton-space [0..1] × [0..1]. */
data class JointPosition(val x: Float, val y: Float)

/**
 * Classification of a joint's technique quality.
 * Maps directly to a rendering color in the overlay.
 */
enum class JointQuality {
    /** No live data – rendered dimly */
    UNKNOWN,
    /** Correct movement */
    GOOD,
    /** Minor deviation – yellow */
    WARN,
    /** Significant deviation – orange */
    ERROR,
    /** Dangerous – stop immediately – red */
    DANGER,
}

data class Joint(
    val id: JointId,
    val position: JointPosition,
    val quality: JointQuality = JointQuality.UNKNOWN,
    val isLive: Boolean = false,
)

/** Bone = directed connection between two joints. */
data class Bone(val from: JointId, val to: JointId)

val SKELETON_BONES = listOf(
    Bone(JointId.HEAD, JointId.NECK),
    Bone(JointId.NECK, JointId.SHOULDER_LEFT),
    Bone(JointId.NECK, JointId.SHOULDER_RIGHT),
    Bone(JointId.SHOULDER_LEFT, JointId.ELBOW_LEFT),
    Bone(JointId.ELBOW_LEFT, JointId.WRIST_LEFT),
    Bone(JointId.SHOULDER_RIGHT, JointId.ELBOW_RIGHT),
    Bone(JointId.ELBOW_RIGHT, JointId.WRIST_RIGHT),
    Bone(JointId.NECK, JointId.SPINE_MID),
    Bone(JointId.SPINE_MID, JointId.HIP_LEFT),
    Bone(JointId.SPINE_MID, JointId.HIP_RIGHT),
    Bone(JointId.HIP_LEFT, JointId.KNEE_LEFT),
    Bone(JointId.KNEE_LEFT, JointId.ANKLE_LEFT),
    Bone(JointId.HIP_RIGHT, JointId.KNEE_RIGHT),
    Bone(JointId.KNEE_RIGHT, JointId.ANKLE_RIGHT),
)
