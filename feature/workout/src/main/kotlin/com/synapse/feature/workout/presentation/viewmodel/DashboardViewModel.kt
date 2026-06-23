package com.synapse.feature.workout.presentation.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.synapse.core.connectivity.IConnectivityRepository
import com.synapse.core.connectivity.model.ConnectionState
import com.synapse.core.database.dao.SessionDao
import com.synapse.core.database.entity.SessionEntity
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class DashboardState(
    val connectionState: ConnectionState = ConnectionState.Idle,
    val recentSessions: List<SessionEntity> = emptyList(),
)

@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val connectivityRepository: IConnectivityRepository,
    private val sessionDao: SessionDao,
) : ViewModel() {

    private val _state = MutableStateFlow(DashboardState())
    val state: StateFlow<DashboardState> = _state.asStateFlow()

    init {
        connectivityRepository.connectionState
            .onEach { cs -> _state.update { it.copy(connectionState = cs) } }
            .launchIn(viewModelScope)

        sessionDao.getAllSessions()
            .onEach { sessions -> _state.update { it.copy(recentSessions = sessions) } }
            .launchIn(viewModelScope)
    }
}
