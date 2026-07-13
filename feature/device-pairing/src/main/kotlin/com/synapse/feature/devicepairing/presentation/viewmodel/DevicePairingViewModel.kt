package com.synapse.feature.devicepairing.presentation.viewmodel

import androidx.lifecycle.ViewModel
import com.synapse.core.connectivity.IConnectivityRepository
import com.synapse.core.connectivity.model.ConnectionState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject

@HiltViewModel
class DevicePairingViewModel @Inject constructor(
    private val connectivityRepository: IConnectivityRepository,
) : ViewModel() {

    val connectionState: StateFlow<ConnectionState> = connectivityRepository.connectionState

    fun startListening() = connectivityRepository.startListening()

    override fun onCleared() {
        super.onCleared()
        // Don't stop listening here — sensor stream needs to persist across screens
    }
}
