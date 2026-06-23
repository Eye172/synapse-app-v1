package com.synapse.feature.settings.presentation.screen

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.synapse.core.designsystem.BackgroundDeep
import com.synapse.core.designsystem.BackgroundSurface
import com.synapse.core.designsystem.BrandLime
import com.synapse.core.designsystem.SkeletonCyan
import com.synapse.core.designsystem.component.SynapseTopBar

@Composable
fun SettingsScreen(onNavigateBack: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().background(BackgroundDeep).systemBarsPadding(),
    ) {
        SynapseTopBar(title = "Settings", onNavigateBack = onNavigateBack)

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp),
        ) {
            Spacer(Modifier.height(8.dp))

            SettingsSection("Device") {
                SettingsItem("Hotspot Name", "Synapse")
                SettingsItem("Hotspot Password", "GymSafetyNetPassword")
                SettingsItem("UDP Port", "1234")
            }

            SettingsSection("Sensor") {
                SettingsItem("Smoothing Factor (α)", "0.25")
                SettingsItem("Form Alert Threshold", "45°")
                SettingsItem("Timeout", "3000ms")
            }

            SettingsSection("AI Coaching") {
                SettingsItem("AI Provider", "OpenAI GPT-4o-mini")
                SettingsItem("Offline Fallback", "Enabled")
                SettingsItem("Response Caching", "Enabled")
            }

            SettingsSection("About") {
                SettingsItem("Version", "1.0.0")
                SettingsItem("Architecture", "Clean MVI Multi-Module")
                SettingsItem("Sensor Protocol", "WiFi UDP / BNO085 IMU")
            }

            Spacer(Modifier.navigationBarsPadding().height(24.dp))
        }
    }
}

@Composable
private fun SettingsSection(title: String, content: @Composable ColumnScope.() -> Unit) {
    Text(
        title.uppercase(),
        style = MaterialTheme.typography.labelLarge,
        color = SkeletonCyan,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.padding(vertical = 12.dp),
    )
    Card(
        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
        colors = CardDefaults.cardColors(containerColor = BackgroundSurface),
        shape = RoundedCornerShape(16.dp),
    ) {
        Column(modifier = Modifier.padding(4.dp)) { content() }
    }
}

@Composable
private fun SettingsItem(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 14.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onBackground)
        Text(value, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onBackground.copy(0.5f))
    }
    HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(0.15f))
}
