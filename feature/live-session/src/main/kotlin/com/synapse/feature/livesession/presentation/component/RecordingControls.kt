package com.synapse.feature.livesession.presentation.component

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FiberManualRecord
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.synapse.core.camera.RecordingState
import com.synapse.core.designsystem.Error
import com.synapse.core.designsystem.SkeletonCyan

@Composable
fun RecordingButton(
    recordingState: RecordingState,
    onStartRecording: () -> Unit,
    onStopRecording: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val infiniteTransition = rememberInfiniteTransition(label = "rec_pulse")
    val scale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.2f,
        animationSpec = infiniteRepeatable(tween(700), RepeatMode.Reverse),
        label = "rec_scale",
    )

    val isRecording = recordingState == RecordingState.Recording

    Box(
        modifier = modifier
            .size(72.dp)
            .clip(CircleShape)
            .background(if (isRecording) Error.copy(0.15f) else MaterialTheme.colorScheme.surfaceVariant)
            .border(2.dp, if (isRecording) Error else SkeletonCyan, CircleShape)
            .clickable { if (isRecording) onStopRecording() else onStartRecording() },
        contentAlignment = Alignment.Center,
    ) {
        if (isRecording) {
            Box(
                modifier = Modifier
                    .size(72.dp)
                    .scale(scale)
                    .background(Error.copy(alpha = 0.1f), CircleShape)
            )
        }
        Icon(
            imageVector = if (isRecording) Icons.Default.Stop else Icons.Default.FiberManualRecord,
            contentDescription = if (isRecording) "Stop Recording" else "Start Recording",
            tint = if (isRecording) Error else SkeletonCyan,
            modifier = Modifier.size(32.dp),
        )
    }
}

@Composable
fun RecordingDurationSelector(
    selectedDuration: Int,
    onDurationSelected: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val durations = listOf(15, 30, 60, 120)
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        durations.forEach { secs ->
            val selected = secs == selectedDuration
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (selected) SkeletonCyan.copy(0.2f) else MaterialTheme.colorScheme.surfaceVariant)
                    .border(1.dp, if (selected) SkeletonCyan else MaterialTheme.colorScheme.outline, RoundedCornerShape(8.dp))
                    .clickable { onDurationSelected(secs) }
                    .padding(horizontal = 12.dp, vertical = 6.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = if (secs < 60) "${secs}s" else "${secs / 60}m",
                    style = MaterialTheme.typography.labelMedium,
                    color = if (selected) SkeletonCyan else MaterialTheme.colorScheme.onBackground.copy(0.6f),
                    fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
                )
            }
        }
    }
}

@Composable
fun RecordingProgressBar(progress: Float, modifier: Modifier = Modifier) {
    LinearProgressIndicator(
        progress = { progress },
        modifier = modifier.clip(RoundedCornerShape(4.dp)),
        color = Error,
        trackColor = MaterialTheme.colorScheme.surfaceVariant,
    )
}
