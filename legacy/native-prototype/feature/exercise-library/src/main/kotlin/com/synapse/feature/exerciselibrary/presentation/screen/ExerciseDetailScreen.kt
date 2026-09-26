package com.synapse.feature.exerciselibrary.presentation.screen

import androidx.annotation.OptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import com.synapse.core.common.UiState
import com.synapse.core.designsystem.BackgroundDeep
import com.synapse.core.designsystem.BackgroundSurface
import com.synapse.core.designsystem.BorderDefault
import com.synapse.core.designsystem.BrandLime
import com.synapse.core.designsystem.Error
import com.synapse.core.designsystem.SkeletonCyan
import com.synapse.core.designsystem.Warning
import com.synapse.core.designsystem.component.SynapseLoadingScreen
import com.synapse.core.designsystem.component.SynapsePrimaryButton
import com.synapse.core.designsystem.component.SynapseTopBar
import com.synapse.feature.exerciselibrary.domain.model.Exercise
import com.synapse.feature.exerciselibrary.presentation.viewmodel.ExerciseDetailAction
import com.synapse.feature.exerciselibrary.presentation.viewmodel.ExerciseDetailViewModel

@Composable
fun ExerciseDetailScreen(
    exerciseId: String,
    onNavigateBack: () -> Unit,
    onStartWorkout: () -> Unit,
    viewModel: ExerciseDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(exerciseId) {
        viewModel.handleAction(ExerciseDetailAction.Load(exerciseId))
    }

    when (val s = state.exercise) {
        is UiState.Loading -> SynapseLoadingScreen()
        is UiState.Success -> ExerciseDetailContent(
            exercise = s.data,
            onNavigateBack = onNavigateBack,
            onStartWorkout = onStartWorkout,
            onFavoriteToggle = { viewModel.handleAction(ExerciseDetailAction.ToggleFavorite) },
        )
        else -> Box(Modifier.fillMaxSize().background(BackgroundDeep)) {
            SynapseTopBar(title = "Exercise", onNavigateBack = onNavigateBack)
        }
    }
}

@Composable
private fun ExerciseDetailContent(
    exercise: Exercise,
    onNavigateBack: () -> Unit,
    onStartWorkout: () -> Unit,
    onFavoriteToggle: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().background(BackgroundDeep).systemBarsPadding(),
    ) {
        SynapseTopBar(
            title = exercise.name,
            onNavigateBack = onNavigateBack,
            actions = {
                IconButton(onClick = onFavoriteToggle) {
                    Icon(
                        imageVector = if (exercise.isFavorite) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                        contentDescription = "Favorite",
                        tint = if (exercise.isFavorite) Error else MaterialTheme.colorScheme.onBackground,
                    )
                }
            }
        )

        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
        ) {
            // Demo video or placeholder
            DemoVideoPlayer(
                videoRawName = exercise.videoUrl,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(220.dp)
                    .clip(RoundedCornerShape(16.dp)),
            )

            Spacer(Modifier.height(20.dp))

            // Category + Difficulty row
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SectionChip(exercise.category.displayName)
                SectionChip(exercise.difficulty.displayName, BrandLime)
            }

            Spacer(Modifier.height(20.dp))

            SectionHeader("About")
            Text(
                text = exercise.description,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onBackground.copy(0.8f),
                modifier = Modifier.padding(top = 8.dp),
            )

            Spacer(Modifier.height(20.dp))

            SectionHeader("Muscles Trained")
            MuscleChipGroup(exercise.muscles)

            if (exercise.equipment.isNotEmpty() && exercise.equipment.firstOrNull() != "None") {
                Spacer(Modifier.height(20.dp))
                SectionHeader("Equipment")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    exercise.equipment.forEach { SectionChip(it) }
                }
            }

            if (exercise.safetyNotes.isNotBlank()) {
                Spacer(Modifier.height(20.dp))
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Warning.copy(alpha = 0.1f)),
                    shape = RoundedCornerShape(12.dp),
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        verticalAlignment = Alignment.Top,
                    ) {
                        Icon(Icons.Default.Warning, null, tint = Warning, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(12.dp))
                        Column {
                            Text(
                                "Safety Notes",
                                style = MaterialTheme.typography.labelLarge,
                                color = Warning,
                                fontWeight = FontWeight.Bold,
                            )
                            Spacer(Modifier.height(4.dp))
                            Text(
                                exercise.safetyNotes,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onBackground.copy(0.8f),
                            )
                        }
                    }
                }
            }

            Spacer(Modifier.height(24.dp))
        }

        Box(modifier = Modifier.padding(horizontal = 16.dp, vertical = 16.dp).navigationBarsPadding()) {
            SynapsePrimaryButton(text = "Start Training", onClick = onStartWorkout)
        }
    }
}

@OptIn(UnstableApi::class)
@Composable
private fun DemoVideoPlayer(videoRawName: String, modifier: Modifier = Modifier) {
    val context = LocalContext.current

    if (videoRawName.isBlank()) {
        // Placeholder when no video is available
        Box(
            modifier = modifier.background(BackgroundSurface).border(1.dp, BorderDefault, RoundedCornerShape(16.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Box(
                    modifier = Modifier
                        .size(56.dp)
                        .background(SkeletonCyan.copy(0.1f), CircleShape)
                        .border(1.dp, SkeletonCyan.copy(0.3f), CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Default.PlayArrow,
                        contentDescription = null,
                        tint = SkeletonCyan,
                        modifier = Modifier.size(28.dp),
                    )
                }
                Spacer(Modifier.height(12.dp))
                Text(
                    "DEMONSTRATION VIDEO",
                    style = MaterialTheme.typography.labelMedium,
                    color = SkeletonCyan.copy(0.6f),
                    letterSpacing = androidx.compose.ui.unit.TextUnit(1f, androidx.compose.ui.unit.TextUnitType.Sp),
                )
                Text(
                    "Coming soon",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onBackground.copy(0.3f),
                )
            }
        }
        return
    }

    // Resolve raw resource by name (handles debug/release package suffix transparently)
    val resourceId = remember(videoRawName) {
        context.resources.getIdentifier(videoRawName, "raw", context.packageName)
    }

    if (resourceId == 0) {
        // Resource not found yet (video file not added) — fall through to placeholder
        Box(
            modifier = modifier.background(BackgroundSurface).border(1.dp, BrandLime.copy(0.2f), RoundedCornerShape(16.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Box(
                    modifier = Modifier
                        .size(56.dp)
                        .background(BrandLime.copy(0.1f), CircleShape)
                        .border(1.dp, BrandLime.copy(0.4f), CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Default.PlayArrow, null, tint = BrandLime, modifier = Modifier.size(28.dp))
                }
                Spacer(Modifier.height(12.dp))
                Text("DEMO VIDEO", style = MaterialTheme.typography.labelMedium, color = BrandLime.copy(0.7f))
                Text("Add $videoRawName.mp4 to res/raw/", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onBackground.copy(0.35f))
            }
        }
        return
    }

    val uri = remember(resourceId) {
        android.net.Uri.parse("android.resource://${context.packageName}/$resourceId")
    }

    val exoPlayer = remember {
        ExoPlayer.Builder(context).build().apply {
            setMediaItem(MediaItem.fromUri(uri))
            prepare()
            playWhenReady = false
        }
    }

    DisposableEffect(exoPlayer) {
        onDispose { exoPlayer.release() }
    }

    AndroidView(
        factory = { ctx ->
            PlayerView(ctx).apply {
                player = exoPlayer
                useController = true
                setBackgroundColor(android.graphics.Color.parseColor("#0D0D1A"))
            }
        },
        modifier = modifier,
    )
}

@Composable
private fun SectionHeader(title: String) {
    Text(
        text = title.uppercase(),
        style = MaterialTheme.typography.labelLarge,
        color = SkeletonCyan,
        fontWeight = FontWeight.Bold,
    )
}

@Composable
private fun SectionChip(label: String, color: androidx.compose.ui.graphics.Color = SkeletonCyan) {
    Box(
        modifier = Modifier
            .background(color.copy(alpha = 0.1f), RoundedCornerShape(6.dp))
            .padding(horizontal = 10.dp, vertical = 5.dp)
    ) {
        Text(label.uppercase(), style = MaterialTheme.typography.labelSmall, color = color)
    }
}

@kotlin.OptIn(ExperimentalLayoutApi::class)
@Composable
private fun MuscleChipGroup(muscles: List<String>) {
    FlowRow(
        modifier = Modifier.padding(top = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        muscles.forEach { SectionChip(it) }
    }
}
