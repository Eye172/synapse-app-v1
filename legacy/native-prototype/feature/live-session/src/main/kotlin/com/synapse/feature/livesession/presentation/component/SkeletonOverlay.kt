package com.synapse.feature.livesession.presentation.component

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import com.synapse.core.designsystem.SkeletonCyan
import com.synapse.core.designsystem.SkeletonDanger
import com.synapse.core.designsystem.SkeletonError
import com.synapse.core.designsystem.SkeletonGood
import com.synapse.core.designsystem.SkeletonWarn
import com.synapse.core.motion.model.Bone
import com.synapse.core.motion.model.Joint
import com.synapse.core.motion.model.JointId
import com.synapse.core.motion.model.JointQuality
import com.synapse.core.motion.model.SKELETON_BONES
import com.synapse.core.motion.model.SkeletonFrame

private fun JointQuality.toColor() = when (this) {
    JointQuality.UNKNOWN -> SkeletonCyan.copy(alpha = 0.35f)
    JointQuality.GOOD    -> SkeletonGood
    JointQuality.WARN    -> SkeletonWarn
    JointQuality.ERROR   -> SkeletonError
    JointQuality.DANGER  -> SkeletonDanger
}

/**
 * Full-screen Canvas that renders the skeletal overlay from a [SkeletonFrame].
 * Joint positions are normalized [0..1] and mapped to the composable's pixel bounds.
 * Live joints get a pulsing glow; non-live joints render at reduced opacity.
 * Target overlay shows the desired pose as dashed lines.
 */
@Composable
fun SkeletonOverlay(
    frame: SkeletonFrame,
    targetFrame: SkeletonFrame? = null,
    modifier: Modifier = Modifier,
) {
    Canvas(modifier = modifier) {
        val w = size.width
        val h = size.height

        // Draw target pose (dashed, dimmed) first so it's behind the live skeleton
        if (targetFrame != null) {
            drawSkeletonBones(targetFrame.joints, SKELETON_BONES, w, h, alpha = 0.25f, strokeWidth = 2f)
        }

        // Draw live skeleton bones
        drawSkeletonBones(frame.joints, SKELETON_BONES, w, h, alpha = 1f, strokeWidth = 3f)

        // Draw joint points
        SKELETON_BONES.flatMap { listOf(it.from, it.to) }.distinct().forEach { jointId ->
            val joint = frame.joints[jointId] ?: return@forEach
            val px = joint.position.x * w
            val py = joint.position.y * h
            val color = joint.quality.toColor()

            // Glow effect for live joints
            if (joint.isLive) {
                drawCircle(color = color.copy(alpha = 0.25f), radius = 18.dp.toPx(), center = Offset(px, py))
                drawCircle(color = color.copy(alpha = 0.12f), radius = 28.dp.toPx(), center = Offset(px, py))
            }

            // Joint circle
            drawCircle(color = color, radius = if (joint.isLive) 8.dp.toPx() else 5.dp.toPx(), center = Offset(px, py))
            drawCircle(
                color = Color.Black.copy(alpha = 0.4f),
                radius = if (joint.isLive) 8.dp.toPx() else 5.dp.toPx(),
                center = Offset(px, py),
                style = Stroke(width = 1.5f),
            )
        }
    }
}

private fun DrawScope.drawSkeletonBones(
    joints: Map<JointId, Joint>,
    bones: List<Bone>,
    w: Float,
    h: Float,
    alpha: Float,
    strokeWidth: Float,
) {
    bones.forEach { bone ->
        val from = joints[bone.from] ?: return@forEach
        val to = joints[bone.to] ?: return@forEach
        val fromPos = Offset(from.position.x * w, from.position.y * h)
        val toPos = Offset(to.position.x * w, to.position.y * h)

        val fromColor = from.quality.toColor().copy(alpha = alpha)
        val toColor = to.quality.toColor().copy(alpha = alpha)

        drawLine(
            brush = Brush.linearGradient(
                colors = listOf(fromColor, toColor),
                start = fromPos,
                end = toPos,
            ),
            start = fromPos,
            end = toPos,
            strokeWidth = strokeWidth.dp.toPx(),
        )
    }
}

/** Compact version for the preparation screen (no live data, just pose guide). */
@Composable
fun TargetPoseGuide(
    targetFrame: SkeletonFrame,
    modifier: Modifier = Modifier,
) {
    Canvas(modifier = modifier) {
        val w = size.width
        val h = size.height
        drawSkeletonBones(targetFrame.joints, SKELETON_BONES, w, h, alpha = 0.7f, strokeWidth = 2.5f)
        SKELETON_BONES.flatMap { listOf(it.from, it.to) }.distinct().forEach { jointId ->
            val joint = targetFrame.joints[jointId] ?: return@forEach
            drawCircle(
                color = SkeletonCyan.copy(alpha = 0.7f),
                radius = 5.dp.toPx(),
                center = Offset(joint.position.x * w, joint.position.y * h),
            )
        }
    }
}
