package com.synapse.feature.exerciselibrary.presentation.viewmodel

import androidx.lifecycle.viewModelScope
import com.synapse.core.common.BaseViewModel
import com.synapse.core.common.UiState
import com.synapse.feature.exerciselibrary.data.ExerciseRepository
import com.synapse.feature.exerciselibrary.domain.model.Exercise
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ExerciseDetailState(
    val exercise: UiState<Exercise> = UiState.Loading,
)

sealed interface ExerciseDetailAction {
    data class Load(val exerciseId: String) : ExerciseDetailAction
    data object ToggleFavorite : ExerciseDetailAction
}

sealed interface ExerciseDetailEffect

@HiltViewModel
class ExerciseDetailViewModel @Inject constructor(
    private val repository: ExerciseRepository,
) : BaseViewModel<ExerciseDetailState, ExerciseDetailAction, ExerciseDetailEffect>(ExerciseDetailState()) {

    override fun handleAction(action: ExerciseDetailAction) = when (action) {
        is ExerciseDetailAction.Load -> load(action.exerciseId)
        is ExerciseDetailAction.ToggleFavorite -> toggleFavorite()
    }

    private fun load(exerciseId: String) {
        viewModelScope.launch {
            val exercise = repository.getExerciseById(exerciseId)
            updateState {
                copy(exercise = if (exercise != null) UiState.Success(exercise) else UiState.Empty)
            }
        }
    }

    private fun toggleFavorite() {
        val current = (state.value.exercise as? UiState.Success)?.data ?: return
        viewModelScope.launch {
            repository.toggleFavorite(current.id, !current.isFavorite)
            updateState { copy(exercise = UiState.Success(current.copy(isFavorite = !current.isFavorite))) }
        }
    }
}
