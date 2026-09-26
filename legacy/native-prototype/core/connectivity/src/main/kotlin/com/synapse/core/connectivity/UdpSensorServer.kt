package com.synapse.core.connectivity

import android.util.Log
import com.synapse.core.connectivity.model.ConnectionState
import com.synapse.core.connectivity.model.SensorPacket
import com.synapse.core.connectivity.model.SensorReading
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.SocketTimeoutException
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "UdpSensorServer"
private const val UDP_PORT = 1234
private const val BUFFER_SIZE = 512
private const val SOCKET_TIMEOUT_MS = 200
private const val DEVICE_TIMEOUT_MS = 3000L

@Singleton
class UdpSensorServer @Inject constructor() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var serverJob: Job? = null
    private var timeoutJob: Job? = null
    private var socket: DatagramSocket? = null

    private val _connectionState = MutableStateFlow<ConnectionState>(ConnectionState.Idle)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private val _sensorStream = MutableStateFlow<SensorReading?>(null)
    val sensorStream: StateFlow<SensorReading?> = _sensorStream.asStateFlow()

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private var packetCount = 0L
    private var lastPacketMs = 0L

    fun start() {
        if (serverJob?.isActive == true) return
        _connectionState.value = ConnectionState.WaitingForDevice
        serverJob = scope.launch { runServer() }
    }

    fun stop() {
        timeoutJob?.cancel()
        serverJob?.cancel()
        socket?.close()
        socket = null
        _connectionState.value = ConnectionState.Idle
        _sensorStream.value = null
        packetCount = 0L
        Log.d(TAG, "UDP server stopped")
    }

    private suspend fun runServer() {
        try {
            socket = DatagramSocket(UDP_PORT).also {
                it.soTimeout = SOCKET_TIMEOUT_MS
                Log.d(TAG, "UDP server listening on port $UDP_PORT")
            }
            val buf = ByteArray(BUFFER_SIZE)
            val datagram = DatagramPacket(buf, buf.size)

            while (scope.isActive) {
                try {
                    socket?.receive(datagram) ?: break
                    val raw = String(datagram.data, 0, datagram.length, Charsets.UTF_8)
                    processPacket(raw, datagram.address.hostAddress ?: "unknown")
                } catch (_: SocketTimeoutException) {
                    checkTimeout()
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "UDP server error", e)
            _connectionState.value = ConnectionState.Error(e.message ?: "Socket error")
        } finally {
            socket?.close()
            socket = null
        }
    }

    private fun processPacket(raw: String, sourceAddress: String) {
        try {
            val packet = json.decodeFromString<SensorPacket>(raw)
            val reading = SensorReading(
                angleDegs = packet.angle,
                isFormAlert = packet.alert,
            )
            if (!reading.isValid) return

            packetCount++
            lastPacketMs = System.currentTimeMillis()

            _sensorStream.value = reading
            _connectionState.value = ConnectionState.Connected(
                deviceAddress = sourceAddress,
                packetCount = packetCount,
                lastSeenMs = lastPacketMs,
            )
            resetTimeoutWatchdog()
        } catch (e: Exception) {
            Log.w(TAG, "Malformed packet: $raw", e)
        }
    }

    private fun resetTimeoutWatchdog() {
        timeoutJob?.cancel()
        timeoutJob = scope.launch {
            delay(DEVICE_TIMEOUT_MS)
            if (scope.isActive) {
                Log.w(TAG, "Device timeout – no packet for ${DEVICE_TIMEOUT_MS}ms")
                _connectionState.value = ConnectionState.Timeout
                _sensorStream.value = null
            }
        }
    }

    private fun checkTimeout() {
        val now = System.currentTimeMillis()
        if (lastPacketMs > 0 && now - lastPacketMs > DEVICE_TIMEOUT_MS) {
            if (_connectionState.value is ConnectionState.Connected) {
                _connectionState.value = ConnectionState.Timeout
            }
        }
    }
}
