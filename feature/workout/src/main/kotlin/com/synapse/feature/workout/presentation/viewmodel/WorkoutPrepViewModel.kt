package com.synapse.feature.workout.presentation.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.synapse.feature.exerciselibrary.data.ExerciseRepository
import com.synapse.feature.exerciselibrary.domain.model.Exercise
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class WorkoutPrepState(val exercise: Exercise? = null)

@HiltViewModel
class WorkoutPrepViewModel @Inject constructor(
    private val repository: ExerciseRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(WorkoutPrepState())
    val state: StateFlow<WorkoutPrepState> = _state.asStateFlow()

    fun loadExercise(exerciseId: String) {
        viewModelScope.launch {
            val exercise = repository.getExerciseById(exerciseId)
            _state.update { it.copy(exercise = exercise) }
        }
    }
}
