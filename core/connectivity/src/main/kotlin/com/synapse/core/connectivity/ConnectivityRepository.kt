package com.synapse.core.connectivity

import com.synapse.core.connectivity.model.ConnectionState
import com.synapse.core.connectivity.model.SensorReading
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject
import javax.inject.Singleton

interface IConnectivityRepository {
    val connectionState: StateFlow<ConnectionState>
    val sensorStream: StateFlow<SensorReading?>
    fun startListening()
    fun stopListening()
}

@Singleton
class ConnectivityRepository @Inject constructor(
    private val server: UdpSensorServer,
) : IConnectivityRepository {

    override val connectionState: StateFlow<ConnectionState> = server.connectionState
    override val sensorStream: StateFlow<SensorReading?> = server.sensorStream

    override fun startListening() = server.start()
    override fun stopListening() = server.stop()
}
