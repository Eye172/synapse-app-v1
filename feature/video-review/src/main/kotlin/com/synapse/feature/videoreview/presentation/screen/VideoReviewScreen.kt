package com.synapse.feature.videoreview.presentation.screen

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.synapse.core.database.entity.SessionEntity
import com.synapse.core.designsystem.BackgroundDeep
import com.synapse.core.designsystem.BackgroundSurface
import com.synapse.core.designsystem.BrandLime
import com.synapse.core.designsystem.Error
import com.synapse.core.designsystem.SkeletonCyan
import com.synapse.core.designsystem.Warning
import com.synapse.core.designsystem.component.SynapsePrimaryButton
import com.synapse.core.designsystem.component.SynapseTopBar
import com.synapse.feature.videoreview.presentation.viewmodel.VideoReviewViewModel

@Composable
fun VideoReviewScreen(
    sessionId: String,
    onNavigateBack: () -> Unit,
    viewModel: VideoReviewViewModel = hiltViewModel(),
) {
    val session by viewModel.session.collectAsStateWithLifecycle()

    LaunchedEffect(sessionId) { viewModel.loadSession(sessionId) }

    DisposableEffect(Unit) {
        onDispose { viewModel.deleteVideoOnExit() }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BackgroundDeep)
            .systemBarsPadding(),
    ) {
        SynapseTopBar(title = "Session Review", onNavigateBack = onNavigateBack)

        session?.let { s ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Spacer(Modifier.height(24.dp))

                // Success icon
                Icon(Icons.Default.CheckCircle, null, tint = BrandLime, modifier = Modifier.size(64.dp))
                Spacer(Modifier.height(12.dp))
                Text("Session Complete!", style = MaterialTheme.typography.headlineSmall, color = BrandLime, fontWeight = FontWeight.Bold)
                Text(s.exerciseName, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onBackground.copy(0.7f))

                Spacer(Modifier.height(32.dp))

                // Scores grid
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = BackgroundSurface),
                    shape = RoundedCornerShape(20.dp),
                ) {
                    Column(modifier = Modifier.padding(20.dp)) {
                        Text("PERFORMANCE SCORES", style = MaterialTheme.typography.labelLarge, color = SkeletonCyan, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(16.dp))
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                            ScoreColumn("Quality", s.qualityScore)
                            ScoreColumn("Symmetry", s.symmetryScore)
                            ScoreColumn("Stability", s.stabilityScore)
                        }
                        Spacer(Modifier.height(12.dp))
                        LinearProgressIndicator(
                            progress = { s.qualityScore / 100f },
                            modifier = Modifier.fillMaxWidth(),
                            color = scoreColor(s.qualityScore),
                            trackColor = MaterialTheme.colorScheme.surfaceVariant,
                        )
                        Text(
                            text = scoreLabel(s.qualityScore),
                            style = MaterialTheme.typography.bodySmall,
                            color = scoreColor(s.qualityScore),
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }
                }

                if (s.aiCoachingFeedback.isNotBlank()) {
                    Spacer(Modifier.height(16.dp))
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = SkeletonCyan.copy(0.08f)),
                        shape = RoundedCornerShape(16.dp),
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text("AI COACHING FEEDBACK", style = MaterialTheme.typography.labelLarge, color = SkeletonCyan, fontWeight = FontWeight.Bold)
                            Spacer(Modifier.height(8.dp))
                            Text(s.aiCoachingFeedback, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onBackground.copy(0.85f))
                        }
                    }
                }

                // Duration
                Spacer(Modifier.height(16.dp))
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = BackgroundSurface),
                    shape = RoundedCornerShape(16.dp),
                ) {
                    Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Duration", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onBackground.copy(0.5f))
                            Text("${s.durationSeconds}s", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onBackground)
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Risk Score", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onBackground.copy(0.5f))
                            Text("${s.riskScore}", style = MaterialTheme.typography.titleMedium, color = scoreColor(100 - s.riskScore))
                        }
                    }
                }

                if (s.hasVideo) {
                    Spacer(Modifier.height(16.dp))
                    Text("Video saved temporarily – will be deleted when you leave this screen.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onBackground.copy(0.4f))
                }

                Spacer(Modifier.height(32.dp))
                SynapsePrimaryButton("Done", onClick = onNavigateBack)
                Spacer(Modifier.height(24.dp).navigationBarsPadding())
            }
        }
    }
}

@Composable
private fun ScoreColumn(label: String, score: Int) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text("$score", style = MaterialTheme.typography.headlineMedium, color = scoreColor(score), fontWeight = FontWeight.Bold)
        Text(label.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onBackground.copy(0.5f))
    }
}

private fun scoreColor(score: Int) = when {
    score >= 80 -> SkeletonCyan
    score >= 60 -> BrandLime
    score >= 40 -> Warning
    else -> Error
}

private fun scoreLabel(score: Int) = when {
    score >= 85 -> "Excellent technique"
    score >= 70 -> "Good form, minor adjustments needed"
    score >= 50 -> "Technique needs improvement"
    else -> "Significant form issues – review safety notes"
}
