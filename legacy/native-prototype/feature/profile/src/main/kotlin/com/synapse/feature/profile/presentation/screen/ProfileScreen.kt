package com.synapse.feature.profile.presentation.screen

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.synapse.core.designsystem.BackgroundDeep
import com.synapse.core.designsystem.BackgroundSurface
import com.synapse.core.designsystem.BrandLime
import com.synapse.core.designsystem.SkeletonCyan
import com.synapse.core.designsystem.component.SynapseTopBar
import com.synapse.feature.profile.presentation.viewmodel.ProfileViewModel

@Composable
fun ProfileScreen(
    onNavigateBack: () -> Unit,
    viewModel: ProfileViewModel = hiltViewModel(),
) {
    val sessions by viewModel.sessions.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier.fillMaxSize().background(BackgroundDeep).systemBarsPadding(),
    ) {
        SynapseTopBar(title = "Profile", onNavigateBack = onNavigateBack)

        LazyColumn(
            contentPadding = PaddingValues(horizontal = 20.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // Avatar + stats
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = BackgroundSurface),
                    shape = RoundedCornerShape(20.dp),
                ) {
                    Column(
                        modifier = Modifier.padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Box(
                            modifier = Modifier
                                .size(80.dp)
                                .background(SkeletonCyan.copy(0.15f), CircleShape),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text("S", style = MaterialTheme.typography.displaySmall, color = SkeletonCyan, fontWeight = FontWeight.Black)
                        }
                        Spacer(Modifier.height(12.dp))
                        Text("Synapse User", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onBackground)
                        Spacer(Modifier.height(20.dp))

                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                            StatItem("${sessions.size}", "Sessions")
                            StatItem(
                                if (sessions.isEmpty()) "–"
                                else "${(sessions.sumOf { it.qualityScore } / sessions.size)}",
                                "Avg Quality",
                            )
                            StatItem(
                                "${sessions.sumOf { it.durationSeconds / 60 }}m",
                                "Total Time",
                            )
                        }
                    }
                }
            }

            item {
                Text(
                    "SESSION HISTORY",
                    style = MaterialTheme.typography.labelLarge,
                    color = SkeletonCyan,
                    fontWeight = FontWeight.Bold,
                )
            }

            if (sessions.isEmpty()) {
                item {
                    Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                        Text("No sessions yet. Start training!", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onBackground.copy(0.4f))
                    }
                }
            } else {
                items(sessions) { session ->
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = BackgroundSurface),
                        shape = RoundedCornerShape(12.dp),
                    ) {
                        Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(session.exerciseName, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                                Text(
                                    java.text.SimpleDateFormat("MMM d, yyyy  HH:mm", java.util.Locale.US).format(java.util.Date(session.startedAt)),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onBackground.copy(0.4f),
                                )
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Text("${session.qualityScore}", style = MaterialTheme.typography.titleMedium, color = BrandLime, fontWeight = FontWeight.Bold)
                                Text("${session.durationSeconds}s", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onBackground.copy(0.4f))
                            }
                        }
                    }
                }
            }

            item { Spacer(Modifier.navigationBarsPadding()) }
        }
    }
}

@Composable
private fun StatItem(value: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.titleLarge, color = BrandLime, fontWeight = FontWeight.Bold)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onBackground.copy(0.5f))
    }
}
