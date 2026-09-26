package com.synapse.feature.livesession.presentation.screen

import android.Manifest
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.*
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.FlipCameraAndroid
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState
import com.synapse.core.camera.RecordingState
import com.synapse.core.connectivity.model.ConnectionState
import com.synapse.core.designsystem.BackgroundDeep
import com.synapse.core.designsystem.BackgroundOverlay
import com.synapse.core.designsystem.BrandLime
import com.synapse.core.designsystem.Error
import com.synapse.core.designsystem.SkeletonCyan
import com.synapse.core.designsystem.SkeletonDanger
import com.synapse.core.designsystem.SkeletonError
import com.synapse.core.designsystem.SkeletonWarn
import com.synapse.core.designsystem.component.DeviceStatus
import com.synapse.core.designsystem.component.DeviceStatusBadge
import com.synapse.core.designsystem.component.SynapsePrimaryButton
import com.synapse.core.motion.model.JointQuality
import com.synapse.feature.livesession.presentation.component.CameraPreviewView
import com.synapse.feature.livesession.presentation.component.RecordingButton
import com.synapse.feature.livesession.presentation.component.RecordingDurationSelector
import com.synapse.feature.livesession.presentation.component.RecordingProgressBar
import com.synapse.feature.livesession.presentation.component.SkeletonOverlay
import com.synapse.feature.livesession.presentation.viewmodel.LiveSessionAction
import com.synapse.feature.livesession.presentation.viewmodel.LiveSessionEffect
import com.synapse.feature.livesession.presentation.viewmodel.LiveSessionViewModel

@OptIn(ExperimentalPermissionsApi::class)
@Composable
fun LiveSessionScreen(
    exerciseId: String,
    onNavigateBack: () -> Unit,
    onSessionComplete: (String) -> Unit,
    viewModel: LiveSessionViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val cameraPermission = rememberPermissionState(Manifest.permission.CAMERA)

    LaunchedEffect(exerciseId) {
        viewModel.init(exerciseId)
    }

    LaunchedEffect(Unit) {
        viewModel.effect.collect { effect ->
            when (effect) {
                is LiveSessionEffect.SessionComplete -> onSessionComplete(effect.sessionId)
                else -> {}
            }
        }
    }

    if (!cameraPermission.status.isGranted) {
        CameraPermissionRationale(
            onGrantPermission = { cameraPermission.launchPermissionRequest() },
            onNavigateBack = onNavigateBack,
        )
        return
    }

    Box(modifier = Modifier.fillMaxSize().background(BackgroundDeep)) {
        // Camera preview (full screen behind everything)
        CameraPreviewView(
            cameraManager = viewModel.cameraManager,
            useFrontCamera = state.useFrontCamera,
            modifier = Modifier.fillMaxSize(),
        )

        // HUD scan ring targeting reticule
        HudScanRing(
            isActive = state.isSessionActive,
            modifier = Modifier.fillMaxSize(),
        )

        // Skeletal overlay
        SkeletonOverlay(
            frame = state.skeletonFrame,
            targetFrame = if (state.isSessionActive) null else state.targetFrame,
            modifier = Modifier.fillMaxSize(),
        )

        // Top bar
        TopControls(
            exerciseName = state.exercise?.name ?: "Live Session",
            connectionState = state.connectionState,
            elapsedSeconds = state.sessionElapsedSeconds,
            onNavigateBack = onNavigateBack,
            onFlipCamera = { viewModel.handleAction(LiveSessionAction.ToggleCamera) },
        )

        // Live feedback overlay
        AnimatedVisibility(
            visible = state.isSessionActive && state.coachingFeedback.isNotBlank(),
            enter = slideInVertically { it } + fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.align(Alignment.Center).padding(horizontal = 24.dp),
        ) {
            FeedbackCard(
                message = state.coachingFeedback,
                quality = state.analysis?.errors?.firstOrNull()?.severity ?: JointQuality.GOOD,
            )
        }

        // Bottom controls
        BottomControls(
            state = state,
            onStartSession = { viewModel.handleAction(LiveSessionAction.StartSession) },
            onStopSession = { viewModel.handleAction(LiveSessionAction.StopSession) },
            onStartRecording = { viewModel.handleAction(LiveSessionAction.StartRecording) },
            onStopRecording = { viewModel.handleAction(LiveSessionAction.StopRecording) },
            onSelectDuration = { viewModel.handleAction(LiveSessionAction.SelectDuration(it)) },
            modifier = Modifier.align(Alignment.BottomCenter),
        )
    }
}

@Composable
private fun HudScanRing(isActive: Boolean, modifier: Modifier = Modifier) {
    val infiniteTransition = rememberInfiniteTransition(label = "hud_ring")

    val rotation by infiniteTransition.animateFloat(
        initialValue = 0f, targetValue = 360f,
        animationSpec = infiniteRepeatable(tween(8000, easing = LinearEasing)),
        label = "ring_spin",
    )
    val pulse by infiniteTransition.animateFloat(
        initialValue = 0.4f, targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(1200), RepeatMode.Reverse),
        label = "pulse",
    )

    Canvas(modifier = modifier) {
        val cx = size.width * 0.5f
        val cy = size.height * 0.42f
        val ringR = minOf(size.width, size.height) * 0.40f
        val ringStroke = 1.5.dp.toPx()
        val activeAlpha = if (isActive) pulse else 0.35f

        // Outer dim glow ring
        drawCircle(
            color = SkeletonCyan.copy(alpha = activeAlpha * 0.08f),
            radius = ringR * 1.25f,
            center = Offset(cx, cy),
        )

        // Main targeting ring — broken arc segments
        drawArc(
            color = SkeletonCyan.copy(alpha = activeAlpha * 0.55f),
            startAngle = rotation,
            sweepAngle = 80f,
            useCenter = false,
            topLeft = Offset(cx - ringR, cy - ringR),
            size = Size(ringR * 2, ringR * 2),
            style = Stroke(width = ringStroke),
        )
        drawArc(
            color = SkeletonCyan.copy(alpha = activeAlpha * 0.55f),
            startAngle = rotation + 100f,
            sweepAngle = 80f,
            useCenter = false,
            topLeft = Offset(cx - ringR, cy - ringR),
            size = Size(ringR * 2, ringR * 2),
            style = Stroke(width = ringStroke),
        )
        drawArc(
            color = SkeletonCyan.copy(alpha = activeAlpha * 0.55f),
            startAngle = rotation + 200f,
            sweepAngle = 80f,
            useCenter = false,
            topLeft = Offset(cx - ringR, cy - ringR),
            size = Size(ringR * 2, ringR * 2),
            style = Stroke(width = ringStroke),
        )

        // Inner dashed ring (counter-rotates)
        val innerR = ringR * 0.70f
        drawCircle(
            color = BrandLime.copy(alpha = activeAlpha * 0.20f),
            radius = innerR,
            center = Offset(cx, cy),
            style = Stroke(
                width = 0.8.dp.toPx(),
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 10f), 360f - rotation),
            ),
        )

        // Center crosshair dot
        drawCircle(
            color = SkeletonCyan.copy(alpha = activeAlpha * 0.8f),
            radius = 3.dp.toPx(),
            center = Offset(cx, cy),
        )

        // Cardinal tick marks on main ring
        val tickLen = 10.dp.toPx()
        val tickOffset = ringR + tickLen * 0.5f
        val tickAlpha = activeAlpha * 0.6f
        listOf(0f, 90f, 180f, 270f).forEach { angle ->
            val rad = Math.toRadians(angle.toDouble())
            val dx = Math.cos(rad).toFloat()
            val dy = Math.sin(rad).toFloat()
            drawLine(
                color = BrandLime.copy(alpha = tickAlpha),
                start = Offset(cx + dx * (ringR - tickLen * 0.3f), cy + dy * (ringR - tickLen * 0.3f)),
                end = Offset(cx + dx * (ringR + tickLen * 0.7f), cy + dy * (ringR + tickLen * 0.7f)),
                strokeWidth = 1.5.dp.toPx(),
            )
        }

        // Corner L-bracket markers (screen corners)
        val pad = 20.dp.toPx()
        val arm = 18.dp.toPx()
        val bracketAlpha = 0.5f
        val bracketColor = BrandLime.copy(alpha = bracketAlpha)
        val bw = 1.5.dp.toPx()
        // Top-left
        drawLine(bracketColor, Offset(pad, pad), Offset(pad + arm, pad), bw)
        drawLine(bracketColor, Offset(pad, pad), Offset(pad, pad + arm), bw)
        // Top-right
        drawLine(bracketColor, Offset(size.width - pad, pad), Offset(size.width - pad - arm, pad), bw)
        drawLine(bracketColor, Offset(size.width - pad, pad), Offset(size.width - pad, pad + arm), bw)
        // Bottom-left
        drawLine(bracketColor, Offset(pad, size.height - pad), Offset(pad + arm, size.height - pad), bw)
        drawLine(bracketColor, Offset(pad, size.height - pad), Offset(pad, size.height - pad - arm), bw)
        // Bottom-right
        drawLine(bracketColor, Offset(size.width - pad, size.height - pad), Offset(size.width - pad - arm, size.height - pad), bw)
        drawLine(bracketColor, Offset(size.width - pad, size.height - pad), Offset(size.width - pad, size.height - pad - arm), bw)
    }
}

@Composable
private fun TopControls(
    exerciseName: String,
    connectionState: ConnectionState,
    elapsedSeconds: Int,
    onNavigateBack: () -> Unit,
    onFlipCamera: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = 8.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(
            onClick = onNavigateBack,
            modifier = Modifier
                .background(BackgroundOverlay, RoundedCornerShape(8.dp))
        ) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Color.White)
        }

        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = exerciseName.uppercase(),
                style = MaterialTheme.typography.labelLarge,
                color = Color.White,
                fontWeight = FontWeight.Bold,
            )
            if (elapsedSeconds > 0) {
                Text(
                    text = formatTime(elapsedSeconds),
                    style = MaterialTheme.typography.bodySmall,
                    color = BrandLime,
                )
            }
        }

        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            DeviceStatusBadge(
                status = when (connectionState) {
                    is ConnectionState.Connected    -> DeviceStatus.Connected
                    is ConnectionState.WaitingForDevice -> DeviceStatus.Connecting
                    else -> DeviceStatus.Disconnected
                }
            )
            IconButton(
                onClick = onFlipCamera,
                modifier = Modifier.background(BackgroundOverlay, RoundedCornerShape(8.dp)),
            ) {
                Icon(Icons.Default.FlipCameraAndroid, "Flip Camera", tint = Color.White)
            }
        }
    }
}

@Composable
private fun FeedbackCard(message: String, quality: JointQuality) {
    val bgColor = when (quality) {
        JointQuality.GOOD   -> SkeletonCyan.copy(alpha = 0.85f)
        JointQuality.WARN   -> SkeletonWarn.copy(alpha = 0.85f)
        JointQuality.ERROR  -> SkeletonError.copy(alpha = 0.85f)
        JointQuality.DANGER -> SkeletonDanger.copy(alpha = 0.85f)
        else -> BackgroundOverlay
    }
    Card(
        colors = CardDefaults.cardColors(containerColor = bgColor),
        shape = RoundedCornerShape(12.dp),
    ) {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = BackgroundDeep,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
        )
    }
}

@Composable
private fun BottomControls(
    state: com.synapse.feature.livesession.presentation.viewmodel.LiveSessionState,
    onStartSession: () -> Unit,
    onStopSession: () -> Unit,
    onStartRecording: () -> Unit,
    onStopRecording: () -> Unit,
    onSelectDuration: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(BackgroundOverlay)
            .navigationBarsPadding()
            .padding(horizontal = 20.dp, vertical = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // Recording progress
        if (state.recordingState == RecordingState.Recording) {
            RecordingProgressBar(
                progress = state.recordingProgress,
                modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
            )
        }

        // Analysis metrics (live)
        state.analysis?.let { analysis ->
            Row(
                modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                MetricPill("QUALITY", "${analysis.qualityScore}", qualityColor(analysis.qualityScore))
                MetricPill("STABILITY", "${analysis.stabilityScore}", qualityColor(analysis.stabilityScore))
                MetricPill("RISK", "${analysis.riskScore}", if (analysis.riskScore > 60) Error else SkeletonCyan)
            }
        }

        if (!state.isSessionActive) {
            // Pre-session: duration selector + start button
            Text("Record Duration", style = MaterialTheme.typography.labelMedium, color = Color.White.copy(0.7f))
            Spacer(Modifier.height(8.dp))
            RecordingDurationSelector(
                selectedDuration = state.selectedDuration,
                onDurationSelected = onSelectDuration,
            )
            Spacer(Modifier.height(16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                SynapsePrimaryButton(
                    text = "Start Session",
                    onClick = onStartSession,
                    modifier = Modifier.weight(1f),
                )
            }
        } else {
            // In-session: record + stop controls
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                RecordingButton(
                    recordingState = state.recordingState,
                    onStartRecording = onStartRecording,
                    onStopRecording = onStopRecording,
                )
                SynapsePrimaryButton(
                    text = "End Session",
                    onClick = onStopSession,
                    modifier = Modifier.weight(1f).padding(start = 16.dp),
                )
            }
        }
    }
}

@Composable
private fun MetricPill(label: String, value: String, color: androidx.compose.ui.graphics.Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.titleMedium, color = color, fontWeight = FontWeight.Bold)
        Text(label, style = MaterialTheme.typography.labelSmall, color = Color.White.copy(0.5f))
    }
}

@Composable
private fun CameraPermissionRationale(onGrantPermission: () -> Unit, onNavigateBack: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().background(BackgroundDeep).padding(24.dp).systemBarsPadding(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Camera Permission Required", style = MaterialTheme.typography.headlineSmall, color = BrandLime)
        Spacer(Modifier.height(16.dp))
        Text(
            "The live session requires camera access to overlay skeletal visualization on your movement.",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onBackground.copy(0.7f),
        )
        Spacer(Modifier.height(32.dp))
        SynapsePrimaryButton("Grant Camera Permission", onClick = onGrantPermission)
        Spacer(Modifier.height(16.dp))
        TextButton(onClick = onNavigateBack) {
            Text("Go Back", color = SkeletonCyan)
        }
    }
}

private fun qualityColor(score: Int) = when {
    score >= 80 -> SkeletonCyan
    score >= 60 -> BrandLime
    score >= 40 -> SkeletonWarn
    else -> Error
}

private fun formatTime(seconds: Int): String {
    val m = seconds / 60
    val s = seconds % 60
    return "%02d:%02d".format(m, s)
}
