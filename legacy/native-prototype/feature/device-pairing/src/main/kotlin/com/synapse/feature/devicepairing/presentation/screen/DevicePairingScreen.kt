package com.synapse.feature.devicepairing.presentation.screen

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.synapse.core.connectivity.model.ConnectionState
import com.synapse.core.connectivity.model.isConnected
import com.synapse.core.designsystem.BackgroundDeep
import com.synapse.core.designsystem.BackgroundSurface
import com.synapse.core.designsystem.BrandLime
import com.synapse.core.designsystem.SkeletonCyan
import com.synapse.core.designsystem.SkeletonCyanGlow
import com.synapse.core.designsystem.component.DeviceStatus
import com.synapse.core.designsystem.component.DeviceStatusBadge
import com.synapse.core.designsystem.component.SynapsePrimaryButton
import com.synapse.core.designsystem.component.SynapseSecondaryButton
import com.synapse.core.designsystem.component.SynapseTopBar
import com.synapse.feature.devicepairing.presentation.viewmodel.DevicePairingViewModel

@Composable
fun DevicePairingScreen(
    onDeviceConnected: () -> Unit,
    onSkip: () -> Unit,
    viewModel: DevicePairingViewModel = hiltViewModel(),
) {
    val connectionState by viewModel.connectionState.collectAsStateWithLifecycle()
    val isConnected = connectionState.isConnected

    LaunchedEffect(isConnected) {
        if (isConnected) {
            kotlinx.coroutines.delay(1500)
            onDeviceConnected()
        }
    }

    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val pulseScale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.3f,
        animationSpec = infiniteRepeatable(tween(1000), RepeatMode.Reverse),
        label = "pulse_scale",
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BackgroundDeep)
            .systemBarsPadding(),
    ) {
        SynapseTopBar(title = "Device Setup")

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(24.dp))

            // Status indicator
            Box(
                modifier = Modifier.size(140.dp),
                contentAlignment = Alignment.Center,
            ) {
                if (!isConnected) {
                    Box(
                        modifier = Modifier
                            .size(140.dp)
                            .scale(pulseScale)
                            .background(SkeletonCyanGlow, CircleShape)
                    )
                }
                Box(
                    modifier = Modifier
                        .size(100.dp)
                        .background(
                            if (isConnected) BrandLime.copy(alpha = 0.15f) else SkeletonCyan.copy(alpha = 0.1f),
                            CircleShape,
                        )
                        .border(2.dp, if (isConnected) BrandLime else SkeletonCyan, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = if (isConnected) Icons.Default.CheckCircle else Icons.Default.Wifi,
                        contentDescription = null,
                        tint = if (isConnected) BrandLime else SkeletonCyan,
                        modifier = Modifier.size(44.dp),
                    )
                }
            }

            Spacer(Modifier.height(24.dp))

            DeviceStatusBadge(
                status = when (connectionState) {
                    is ConnectionState.Connected -> DeviceStatus.Connected
                    is ConnectionState.WaitingForDevice -> DeviceStatus.Connecting
                    else -> DeviceStatus.Disconnected
                }
            )

            Spacer(Modifier.height(32.dp))

            Text(
                text = if (isConnected) "DEVICE CONNECTED!" else "CONNECT YOUR DEVICE",
                style = MaterialTheme.typography.headlineSmall,
                color = if (isConnected) BrandLime else MaterialTheme.colorScheme.onBackground,
                textAlign = TextAlign.Center,
            )

            Spacer(Modifier.height(32.dp))

            // Step-by-step guide
            if (!isConnected) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = BackgroundSurface),
                    shape = RoundedCornerShape(16.dp),
                ) {
                    Column(modifier = Modifier.padding(20.dp)) {
                        Text(
                            "Setup Instructions",
                            style = MaterialTheme.typography.titleMedium,
                            color = SkeletonCyan,
                            fontWeight = FontWeight.Bold,
                        )
                        Spacer(Modifier.height(16.dp))
                        SetupStep(1, "Enable Wi-Fi Hotspot on this phone")
                        SetupStep(2, "Set hotspot name: Synapse")
                        SetupStep(3, "Set hotspot password: GymSafetyNetPassword")
                        SetupStep(4, "Power on your Synapse exoskeleton")
                        SetupStep(5, "Wait for device to connect (~10 seconds)")
                    }
                }

                Spacer(Modifier.height(24.dp))

                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.3f)),
                    shape = RoundedCornerShape(12.dp),
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("⚠️", style = MaterialTheme.typography.titleMedium)
                        Spacer(Modifier.width(8.dp))
                        Text(
                            "Hotspot must be active before turning on the exoskeleton. The device connects to port 1234.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f),
                        )
                    }
                }
            }

            Spacer(Modifier.weight(1f))
            Spacer(Modifier.height(32.dp))

            if (isConnected) {
                SynapsePrimaryButton(text = "Continue", onClick = onDeviceConnected)
            } else {
                SynapsePrimaryButton(
                    text = "Start Listening",
                    onClick = { viewModel.startListening() },
                )
                Spacer(Modifier.height(12.dp))
                SynapseSecondaryButton(text = "Skip for now", onClick = onSkip)
            }

            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun SetupStep(step: Int, text: String) {
    Row(
        modifier = Modifier.padding(vertical = 8.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Box(
            modifier = Modifier
                .size(24.dp)
                .background(SkeletonCyan.copy(alpha = 0.15f), CircleShape)
                .border(1.dp, SkeletonCyan.copy(alpha = 0.4f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = step.toString(),
                style = MaterialTheme.typography.labelSmall,
                color = SkeletonCyan,
                fontWeight = FontWeight.Bold,
            )
        }
        Spacer(Modifier.width(12.dp))
        Text(
            text = text,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.8f),
            modifier = Modifier.padding(top = 2.dp),
        )
    }
}
