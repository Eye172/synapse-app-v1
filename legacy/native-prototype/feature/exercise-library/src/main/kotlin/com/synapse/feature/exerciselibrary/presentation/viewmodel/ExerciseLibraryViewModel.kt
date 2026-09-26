package com.synapse.feature.exerciselibrary.presentation.viewmodel

import androidx.lifecycle.viewModelScope
import com.synapse.core.common.BaseViewModel
import com.synapse.core.common.UiState
import com.synapse.feature.exerciselibrary.data.ExerciseRepository
import com.synapse.feature.exerciselibrary.domain.model.Exercise
import com.synapse.feature.exerciselibrary.domain.model.ExerciseCategory
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ExerciseLibraryState(
    val exercises: UiState<List<Exercise>> = UiState.Loading,
    val searchQuery: String = "",
    val selectedCategory: ExerciseCategory? = null,
    val showFavoritesOnly: Boolean = false,
)

sealed interface ExerciseLibraryAction {
    data class UpdateSearch(val query: String) : ExerciseLibraryAction
    data class SelectCategory(val category: ExerciseCategory?) : ExerciseLibraryAction
    data object ToggleFavoritesFilter : ExerciseLibraryAction
    data class ToggleFavorite(val exerciseId: String, val isFavorite: Boolean) : ExerciseLibraryAction
}

sealed interface ExerciseLibraryEffect {
    data class NavigateToDetail(val exerciseId: String) : ExerciseLibraryEffect
}

private data class FilterSpec(
    val query: String = "",
    val category: ExerciseCategory? = null,
    val favoritesOnly: Boolean = false,
)

@HiltViewModel
class ExerciseLibraryViewModel @Inject constructor(
    private val repository: ExerciseRepository,
) : BaseViewModel<ExerciseLibraryState, ExerciseLibraryAction, ExerciseLibraryEffect>(ExerciseLibraryState()) {

    private val filterSpec = MutableStateFlow(FilterSpec())

    init {
        viewModelScope.launch { repository.seedIfEmpty() }
        observeExercises()
    }

    @OptIn(FlowPreview::class, ExperimentalCoroutinesApi::class)
    private fun observeExercises() {
        filterSpec
            .debounce(300L)
            .flatMapLatest { spec ->
                val base = if (spec.query.isBlank()) repository.getAllExercises()
                           else repository.searchExercises(spec.query)
                base.map { exercises ->
                    exercises
                        .filter { spec.category == null || it.category == spec.category }
                        .filter { !spec.favoritesOnly || it.isFavorite }
                }
            }
            .onEach { exercises ->
                updateState {
                    copy(exercises = if (exercises.isEmpty()) UiState.Empty else UiState.Success(exercises))
                }
            }
            .launchIn(viewModelScope)
    }

    override fun handleAction(action: ExerciseLibraryAction) = when (action) {
        is ExerciseLibraryAction.UpdateSearch -> {
            updateState { copy(searchQuery = action.query) }
            filterSpec.value = filterSpec.value.copy(query = action.query)
        }
        is ExerciseLibraryAction.SelectCategory -> {
            updateState { copy(selectedCategory = action.category) }
            filterSpec.value = filterSpec.value.copy(category = action.category)
        }
        is ExerciseLibraryAction.ToggleFavoritesFilter -> {
            val newVal = !state.value.showFavoritesOnly
            updateState { copy(showFavoritesOnly = newVal) }
            filterSpec.value = filterSpec.value.copy(favoritesOnly = newVal)
        }
        is ExerciseLibraryAction.ToggleFavorite ->
            viewModelScope.launch { repository.toggleFavorite(action.exerciseId, action.isFavorite) }.let { }
    }
}
