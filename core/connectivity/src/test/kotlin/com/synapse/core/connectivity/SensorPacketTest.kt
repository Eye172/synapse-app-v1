package com.synapse.core.connectivity

import com.synapse.core.connectivity.model.SensorPacket
import com.synapse.core.connectivity.model.SensorReading
import kotlinx.serialization.json.Json
import org.junit.Assert.*
import org.junit.Test

class SensorPacketTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    // ── JSON parsing ──────────────────────────────────────────────────────────

    @Test
    fun `parses firmware JSON packet correctly`() {
        val raw = """{"angle":45.3,"alert":false}"""
        val packet = json.decodeFromString<SensorPacket>(raw)
        assertEquals(45.3f, packet.angle, 0.01f)
        assertFalse(packet.alert)
    }

    @Test
    fun `parses alert packet`() {
        val raw = """{"angle":30.0,"alert":true}"""
        val packet = json.decodeFromString<SensorPacket>(raw)
        assertTrue(packet.alert)
    }

    @Test
    fun `tolerates extra fields in JSON`() {
        val raw = """{"angle":60.0,"alert":false,"extra_field":"ignored","fw_version":3}"""
        val packet = json.decodeFromString<SensorPacket>(raw)
        assertEquals(60.0f, packet.angle, 0.01f)
    }

    @Test
    fun `parses zero angle`() {
        val raw = """{"angle":0.0,"alert":false}"""
        val packet = json.decodeFromString<SensorPacket>(raw)
        assertEquals(0.0f, packet.angle, 0.001f)
    }

    @Test
    fun `parses maximum valid angle 180`() {
        val raw = """{"angle":180.0,"alert":false}"""
        val packet = json.decodeFromString<SensorPacket>(raw)
        assertEquals(180.0f, packet.angle, 0.001f)
    }

    @Test
    fun `fractional angle parsed with precision`() {
        val raw = """{"angle":37.583,"alert":false}"""
        val packet = json.decodeFromString<SensorPacket>(raw)
        assertEquals(37.583f, packet.angle, 0.001f)
    }

    // ── SensorReading validation ──────────────────────────────────────────────

    @Test
    fun `sensor reading — valid midrange angle`() {
        val reading = SensorReading(angleDegs = 45f, isFormAlert = false)
        assertTrue(reading.isValid)
    }

    @Test
    fun `sensor reading — zero angle is valid`() {
        val reading = SensorReading(angleDegs = 0f, isFormAlert = false)
        assertTrue(reading.isValid)
    }

    @Test
    fun `sensor reading — 180 degrees is valid boundary`() {
        val reading = SensorReading(angleDegs = 180f, isFormAlert = false)
        assertTrue(reading.isValid)
    }

    @Test
    fun `sensor reading — negative angle is invalid`() {
        val reading = SensorReading(angleDegs = -0.1f, isFormAlert = false)
        assertFalse(reading.isValid)
    }

    @Test
    fun `sensor reading — angle above 180 is invalid`() {
        val reading = SensorReading(angleDegs = 180.1f, isFormAlert = false)
        assertFalse(reading.isValid)
    }

    @Test
    fun `sensor reading — large negative angle is invalid`() {
        val reading = SensorReading(angleDegs = -45f, isFormAlert = false)
        assertFalse(reading.isValid)
    }

    @Test
    fun `form alert does not affect validity`() {
        val alertReading = SensorReading(angleDegs = 30f, isFormAlert = true)
        assertTrue(alertReading.isValid)
    }

    // ── Round-trip through pipeline ───────────────────────────────────────────

    @Test
    fun `packet angle maps correctly into sensor reading`() {
        val raw = """{"angle":72.5,"alert":true}"""
        val packet = json.decodeFromString<SensorPacket>(raw)
        val reading = SensorReading(angleDegs = packet.angle, isFormAlert = packet.alert)
        assertTrue(reading.isValid)
        assertTrue(reading.isFormAlert)
        assertEquals(72.5f, reading.angleDegs, 0.01f)
    }
}
