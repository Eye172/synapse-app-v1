package com.synapse.feature.workout.presentation.screen

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.synapse.core.connectivity.model.ConnectionState
import com.synapse.core.database.entity.SessionEntity
import com.synapse.core.designsystem.BackgroundDeep
import com.synapse.core.designsystem.BackgroundSurface
import com.synapse.core.designsystem.BorderDefault
import com.synapse.core.designsystem.BrandLime
import com.synapse.core.designsystem.Error
import com.synapse.core.designsystem.SkeletonCyan
import com.synapse.core.designsystem.SkeletonGood
import com.synapse.core.designsystem.TextSecondary
import com.synapse.core.designsystem.component.DeviceStatus
import com.synapse.core.designsystem.component.DeviceStatusBadge
import com.synapse.feature.workout.presentation.viewmodel.DashboardViewModel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun DashboardScreen(
    onNavigateToExerciseLibrary: () -> Unit,
    onNavigateToDevicePairing: () -> Unit,
    onNavigateToProfile: () -> Unit,
    onNavigateToSettings: () -> Unit,
    viewModel: DashboardViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BackgroundDeep)
            .systemBarsPadding(),
    ) {
        DashboardTopBar(
            connectionState = state.connectionState,
            onNavigateToProfile = onNavigateToProfile,
            onNavigateToSettings = onNavigateToSettings,
        )

        LazyColumn(
            contentPadding = PaddingValues(horizontal = 20.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Device status / pairing callout
            item {
                DeviceStatusPanel(
                    connectionState = state.connectionState,
                    onNavigateToDevicePairing = onNavigateToDevicePairing,
                )
            }

            // Start training hero card
            item {
                StartTrainingCard(onClick = onNavigateToExerciseLibrary)
            }

            // Stats summary (only when there's history)
            if (state.recentSessions.isNotEmpty()) {
                item {
                    SessionStatsRow(sessions = state.recentSessions)
                }

                item {
                    SectionLabel("RECENT SESSIONS")
                }

                items(state.recentSessions.take(5)) { session ->
                    SessionHistoryCard(session = session)
                }
            }

            item { Spacer(Modifier.navigationBarsPadding()) }
        }
    }
}

@Composable
private fun DashboardTopBar(
    connectionState: ConnectionState,
    onNavigateToProfile: () -> Unit,
    onNavigateToSettings: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column {
            Text(
                "SYNAPSE",
                style = MaterialTheme.typography.titleLarge,
                color = BrandLime,
                fontWeight = FontWeight.Black,
                letterSpacing = 4.sp,
            )
            Text(
                "SMART TRAINING",
                style = MaterialTheme.typography.labelSmall,
                color = SkeletonCyan,
                letterSpacing = 2.sp,
            )
        }

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            DeviceStatusBadge(
                status = when (connectionState) {
                    is ConnectionState.Connected -> DeviceStatus.Connected
                    is ConnectionState.WaitingForDevice -> DeviceStatus.Connecting
                    else -> DeviceStatus.Disconnected
                }
            )
            IconButton(onClick = onNavigateToProfile) {
                Icon(Icons.Default.Person, "Profile", tint = TextSecondary)
            }
            IconButton(onClick = onNavigateToSettings) {
                Icon(Icons.Default.Settings, "Settings", tint = TextSecondary)
            }
        }
    }
}

@Composable
private fun DeviceStatusPanel(
    connectionState: ConnectionState,
    onNavigateToDevicePairing: () -> Unit,
) {
    val isConnected = connectionState is ConnectionState.Connected
    val pulseAnim = rememberInfiniteTransition(label = "dot_pulse")
    val dotAlpha by pulseAnim.animateFloat(
        initialValue = 0.4f, targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(900), RepeatMode.Reverse),
        label = "dot_alpha",
    )

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(BackgroundSurface)
            .border(1.dp, if (isConnected) SkeletonCyan.copy(0.3f) else BorderDefault, RoundedCornerShape(12.dp))
            .clickable(enabled = !isConnected, onClick = onNavigateToDevicePairing)
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        // Pulse dot
        Box(
            modifier = Modifier
                .size(10.dp)
                .alpha(if (!isConnected) dotAlpha else 1f)
                .background(if (isConnected) SkeletonCyan else Error, androidx.compose.foundation.shape.CircleShape)
        )

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = if (isConnected) "EXOSKELETON CONNECTED" else "EXOSKELETON NOT CONNECTED",
                style = MaterialTheme.typography.labelMedium,
                color = if (isConnected) SkeletonCyan else MaterialTheme.colorScheme.onBackground,
                fontWeight = FontWeight.Bold,
            )
            val subText = when (connectionState) {
                is ConnectionState.Connected ->
                    "Device: ${connectionState.deviceAddress}  ·  Packets: ${connectionState.packetCount}"
                is ConnectionState.WaitingForDevice -> "Listening on port 1234…"
                is ConnectionState.Timeout -> "Signal lost – tap to reconnect"
                is ConnectionState.Error -> "Error – tap to retry"
                else -> "Tap to set up your Synapse device"
            }
            Text(
                text = subText,
                style = MaterialTheme.typography.bodySmall,
                color = TextSecondary,
                modifier = Modifier.padding(top = 2.dp),
            )
        }

        Icon(
            imageVector = Icons.Default.Wifi,
            contentDescription = null,
            tint = if (isConnected) SkeletonCyan else TextSecondary,
            modifier = Modifier.size(22.dp),
        )
    }
}

@Composable
private fun StartTrainingCard(onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(
                Brush.linearGradient(
                    colors = listOf(BrandLime, BrandLime.copy(green = 0.85f)),
                )
            )
            .clickable(onClick = onClick)
    ) {
        // Subtle corner accent
        Box(
            modifier = Modifier
                .size(120.dp)
                .align(Alignment.TopEnd)
                .alpha(0.08f)
                .background(
                    BackgroundDeep,
                    RoundedCornerShape(bottomStart = 120.dp),
                )
        )

        Row(
            modifier = Modifier.padding(horizontal = 24.dp, vertical = 28.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    "START TRAINING",
                    style = MaterialTheme.typography.headlineMedium,
                    color = BackgroundDeep,
                    fontWeight = FontWeight.Black,
                )
                Text(
                    "Browse exercises · Live sensor feedback · AI coaching",
                    style = MaterialTheme.typography.bodySmall,
                    color = BackgroundDeep.copy(alpha = 0.65f),
                    modifier = Modifier.padding(top = 6.dp),
                )
                Spacer(Modifier.height(20.dp))
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .background(BackgroundDeep)
                        .padding(horizontal = 20.dp, vertical = 10.dp)
                ) {
                    Text(
                        "OPEN LIBRARY",
                        style = MaterialTheme.typography.labelLarge,
                        color = BrandLime,
                        fontWeight = FontWeight.Black,
                    )
                }
            }
            Icon(
                imageVector = Icons.Default.FitnessCenter,
                contentDescription = null,
                tint = BackgroundDeep.copy(alpha = 0.25f),
                modifier = Modifier
                    .size(80.dp)
                    .padding(start = 8.dp),
            )
        }
    }
}

@Composable
private fun SessionStatsRow(sessions: List<SessionEntity>) {
    val avgQuality = if (sessions.isEmpty()) 0 else sessions.sumOf { it.qualityScore } / sessions.size
    val totalMinutes = sessions.sumOf { it.durationSeconds } / 60
    val bestScore = sessions.maxOfOrNull { it.qualityScore } ?: 0

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(BackgroundSurface)
            .border(1.dp, BorderDefault, RoundedCornerShape(16.dp))
            .padding(20.dp),
        horizontalArrangement = Arrangement.SpaceEvenly,
    ) {
        StatCell(value = "${sessions.size}", label = "SESSIONS", color = SkeletonCyan)
        StatDivider()
        StatCell(value = "$avgQuality", label = "AVG QUALITY", color = scoreColor(avgQuality))
        StatDivider()
        StatCell(value = "${totalMinutes}m", label = "TOTAL TIME", color = BrandLime)
        StatDivider()
        StatCell(value = "$bestScore", label = "BEST SCORE", color = SkeletonGood)
    }
}

@Composable
private fun StatCell(value: String, label: String, color: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.titleLarge, color = color, fontWeight = FontWeight.Black)
        Text(label, style = MaterialTheme.typography.labelSmall, color = TextSecondary)
    }
}

@Composable
private fun StatDivider() {
    Box(
        modifier = Modifier
            .height(36.dp)
            .width(1.dp)
            .background(BorderDefault)
    )
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelLarge,
        color = SkeletonCyan,
        fontWeight = FontWeight.Bold,
        letterSpacing = 1.sp,
        modifier = Modifier.padding(top = 4.dp),
    )
}

@Composable
private fun SessionHistoryCard(session: SessionEntity) {
    val dateStr = remember(session.startedAt) {
        SimpleDateFormat("MMM d · HH:mm", Locale.US).format(Date(session.startedAt))
    }
    val quality = session.qualityScore
    val color = scoreColor(quality)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(BackgroundSurface)
            .border(1.dp, color.copy(alpha = 0.15f), RoundedCornerShape(12.dp))
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Color accent bar
        Box(
            modifier = Modifier
                .width(3.dp)
                .height(36.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(color)
        )
        Spacer(Modifier.width(14.dp))

        Column(modifier = Modifier.weight(1f)) {
            Text(
                session.exerciseName,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onBackground,
            )
            Text(
                dateStr,
                style = MaterialTheme.typography.bodySmall,
                color = TextSecondary,
                modifier = Modifier.padding(top = 2.dp),
            )
        }

        Column(horizontalAlignment = Alignment.End) {
            Text(
                "$quality",
                style = MaterialTheme.typography.titleMedium,
                color = color,
                fontWeight = FontWeight.Black,
            )
            Text(
                "${session.durationSeconds}s",
                style = MaterialTheme.typography.labelSmall,
                color = TextSecondary,
            )
        }
    }
}

private fun scoreColor(score: Int) = when {
    score >= 80 -> SkeletonCyan
    score >= 60 -> BrandLime
    score >= 40 -> Color(0xFFFFB800)
    else -> Error
}
