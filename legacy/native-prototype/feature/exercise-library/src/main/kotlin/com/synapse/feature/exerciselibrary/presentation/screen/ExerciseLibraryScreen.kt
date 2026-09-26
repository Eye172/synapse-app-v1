package com.synapse.feature.exerciselibrary.presentation.screen

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.synapse.core.common.UiState
import com.synapse.core.designsystem.BackgroundDeep
import com.synapse.core.designsystem.BackgroundSurface
import com.synapse.core.designsystem.BrandLime
import com.synapse.core.designsystem.Error
import com.synapse.core.designsystem.SkeletonCyan
import com.synapse.core.designsystem.component.SynapseLoadingScreen
import com.synapse.core.designsystem.component.SynapseTopBar
import com.synapse.feature.exerciselibrary.domain.model.Difficulty
import com.synapse.feature.exerciselibrary.domain.model.Exercise
import com.synapse.feature.exerciselibrary.domain.model.ExerciseCategory
import com.synapse.feature.exerciselibrary.presentation.viewmodel.ExerciseLibraryAction
import com.synapse.feature.exerciselibrary.presentation.viewmodel.ExerciseLibraryViewModel

@Composable
fun ExerciseLibraryScreen(
    onNavigateBack: () -> Unit,
    onNavigateToDetail: (String) -> Unit,
    viewModel: ExerciseLibraryViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val focusManager = LocalFocusManager.current

    Column(
        modifier = Modifier.fillMaxSize().background(BackgroundDeep).systemBarsPadding(),
    ) {
        SynapseTopBar(
            title = "Exercise Library",
            onNavigateBack = onNavigateBack,
            actions = {
                IconButton(onClick = { viewModel.handleAction(ExerciseLibraryAction.ToggleFavoritesFilter) }) {
                    Icon(
                        imageVector = if (state.showFavoritesOnly) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                        contentDescription = "Favorites",
                        tint = if (state.showFavoritesOnly) Error else MaterialTheme.colorScheme.onBackground,
                    )
                }
            }
        )

        // Search bar
        OutlinedTextField(
            value = state.searchQuery,
            onValueChange = { viewModel.handleAction(ExerciseLibraryAction.UpdateSearch(it)) },
            placeholder = { Text("Search exercises…") },
            leadingIcon = { Icon(Icons.Default.Search, null, tint = SkeletonCyan.copy(alpha = 0.6f)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { focusManager.clearFocus() }),
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            shape = RoundedCornerShape(12.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = SkeletonCyan,
                unfocusedBorderColor = MaterialTheme.colorScheme.outline,
            ),
        )

        // Category filter chips
        Row(
            modifier = Modifier
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            CategoryChip(
                label = "All",
                selected = state.selectedCategory == null,
                onClick = { viewModel.handleAction(ExerciseLibraryAction.SelectCategory(null)) },
            )
            ExerciseCategory.entries.forEach { cat ->
                CategoryChip(
                    label = cat.displayName,
                    selected = state.selectedCategory == cat,
                    onClick = { viewModel.handleAction(ExerciseLibraryAction.SelectCategory(cat)) },
                )
            }
        }

        Spacer(Modifier.height(8.dp))

        AnimatedContent(
            targetState = state.exercises,
            transitionSpec = { fadeIn() togetherWith fadeOut() },
            label = "exercises",
        ) { uiState ->
            when (uiState) {
                is UiState.Loading -> SynapseLoadingScreen("Loading exercises…")
                is UiState.Empty   -> EmptyExercisesState()
                is UiState.Success -> ExerciseList(
                    exercises = uiState.data,
                    onExerciseClick = onNavigateToDetail,
                    onFavoriteToggle = { ex ->
                        viewModel.handleAction(ExerciseLibraryAction.ToggleFavorite(ex.id, !ex.isFavorite))
                    },
                )
                else -> Unit
            }
        }
    }
}

@Composable
private fun CategoryChip(label: String, selected: Boolean, onClick: () -> Unit) {
    FilterChip(
        selected = selected,
        onClick = onClick,
        label = {
            Text(label.uppercase(), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold)
        },
        colors = FilterChipDefaults.filterChipColors(
            selectedContainerColor = SkeletonCyan.copy(alpha = 0.15f),
            selectedLabelColor = SkeletonCyan,
        ),
        border = FilterChipDefaults.filterChipBorder(
            enabled = true,
            selected = selected,
            selectedBorderColor = SkeletonCyan.copy(alpha = 0.5f),
        ),
    )
}

@Composable
private fun ExerciseList(
    exercises: List<Exercise>,
    onExerciseClick: (String) -> Unit,
    onFavoriteToggle: (Exercise) -> Unit,
) {
    LazyColumn(
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items(exercises, key = { it.id }) { exercise ->
            ExerciseCard(exercise = exercise, onClick = { onExerciseClick(exercise.id) }, onFavorite = { onFavoriteToggle(exercise) })
        }
        item { Spacer(Modifier.navigationBarsPadding()) }
    }
}

@Composable
private fun ExerciseCard(exercise: Exercise, onClick: () -> Unit, onFavorite: () -> Unit) {
    val diffColor = when (exercise.difficulty) {
        Difficulty.BEGINNER     -> SkeletonCyan
        Difficulty.INTERMEDIATE -> BrandLime
        Difficulty.ADVANCED     -> MaterialTheme.colorScheme.error
        Difficulty.EXPERT       -> Error
    }

    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = BackgroundSurface),
        shape = RoundedCornerShape(16.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Category icon / thumbnail placeholder
            Box(
                modifier = Modifier
                    .size(64.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = exercise.category.displayName.first().toString(),
                    style = MaterialTheme.typography.headlineMedium,
                    color = SkeletonCyan,
                )
            }

            Spacer(Modifier.width(16.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = exercise.name,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onBackground,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(4.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    CategoryPill(text = exercise.category.displayName)
                    DifficultyPill(text = exercise.difficulty.displayName, color = diffColor)
                }
                if (exercise.muscles.isNotEmpty()) {
                    Text(
                        text = exercise.muscles.take(3).joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.5f),
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }

            IconButton(onClick = onFavorite) {
                Icon(
                    imageVector = if (exercise.isFavorite) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                    contentDescription = "Favorite",
                    tint = if (exercise.isFavorite) Error else MaterialTheme.colorScheme.onBackground.copy(0.4f),
                )
            }
        }
    }
}

@Composable
private fun CategoryPill(text: String) {
    Box(
        modifier = Modifier
            .background(SkeletonCyan.copy(alpha = 0.1f), RoundedCornerShape(4.dp))
            .padding(horizontal = 6.dp, vertical = 2.dp)
    ) {
        Text(text = text.uppercase(), style = MaterialTheme.typography.labelSmall, color = SkeletonCyan.copy(alpha = 0.8f))
    }
}

@Composable
private fun DifficultyPill(text: String, color: androidx.compose.ui.graphics.Color) {
    Box(
        modifier = Modifier
            .background(color.copy(alpha = 0.1f), RoundedCornerShape(4.dp))
            .padding(horizontal = 6.dp, vertical = 2.dp)
    ) {
        Text(text = text.uppercase(), style = MaterialTheme.typography.labelSmall, color = color.copy(alpha = 0.9f))
    }
}

@Composable
private fun EmptyExercisesState() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("No exercises found", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onBackground.copy(0.5f))
            Text("Try a different search or category", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onBackground.copy(0.3f))
        }
    }
}
