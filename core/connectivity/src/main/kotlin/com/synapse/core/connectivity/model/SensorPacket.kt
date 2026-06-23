package com.synapse.core.connectivity.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * JSON packet sent by the BNO085 firmware over UDP.
 * Protocol: phone hotspot "Synapse" / device connects → sends UDP to 192.168.43.1:1234
 * Payload: {"angle": float, "alert": bool}
 *
 * angle  = smoothed pitch of the torso IMU (degrees, EMA α=0.25, absolute value, mirrored at 90°)
 * alert  = true when angle < 45° (incorrect form)
 */
@Serializable
data class SensorPacket(
    @SerialName("angle") val angle: Float,
    @SerialName("alert") val alert: Boolean,
)

/** Timestamped, validated sensor reading ready for the motion engine. */
data class SensorReading(
    val angleDegs: Float,
    val isFormAlert: Boolean,
    val timestampMs: Long = System.currentTimeMillis(),
) {
    val isValid: Boolean get() = angleDegs in 0f..180f
}
