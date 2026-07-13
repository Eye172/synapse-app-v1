package com.synapse.core.connectivity.model

sealed interface ConnectionState {
    data object Idle : ConnectionState
    data object WaitingForDevice : ConnectionState
    data class Connected(
        val deviceAddress: String,
        val packetCount: Long,
        val lastSeenMs: Long,
    ) : ConnectionState
    data object Timeout : ConnectionState
    data class Error(val message: String) : ConnectionState
}

val ConnectionState.isConnected get() = this is ConnectionState.Connected
val ConnectionState.isDisconnected get() = this is ConnectionState.Idle
        || this is ConnectionState.Timeout
        || this is ConnectionState.Error
