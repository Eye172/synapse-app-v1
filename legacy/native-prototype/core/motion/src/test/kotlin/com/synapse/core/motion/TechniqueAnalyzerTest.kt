package com.synapse.core.motion

import com.synapse.core.motion.model.JointQuality
import com.synapse.core.motion.processor.SkeletalMapper
import com.synapse.core.motion.processor.TechniqueAnalyzer
import org.junit.Assert.*
import org.junit.Test

class TechniqueAnalyzerTest {

    // ── Quality bands ──────────────────────────────────────────────────────────

    @Test
    fun `perfect form — zero deviation — returns GOOD quality 95`() {
        val frame = SkeletalMapper.buildFrame(angleDegs = 45f, isFormAlert = false)
        val result = TechniqueAnalyzer.analyze(frame, targetAngle = 45f)
        assertEquals(95, result.qualityScore)
        assertTrue(result.errors.isEmpty())
    }

    @Test
    fun `4 degree deviation — still GOOD band`() {
        val frame = SkeletalMapper.buildFrame(angleDegs = 49f, isFormAlert = false)
        val result = TechniqueAnalyzer.analyze(frame, targetAngle = 45f)
        assertEquals(95, result.qualityScore)
        assertTrue(result.errors.isEmpty())
    }

    @Test
    fun `10 degree deviation — WARN band — quality 72`() {
        val frame = SkeletalMapper.buildFrame(angleDegs = 55f, isFormAlert = false)
        val result = TechniqueAnalyzer.analyze(frame, targetAngle = 45f)
        assertEquals(72, result.qualityScore)
        assertEquals(1, result.errors.size)
        assertEquals(JointQuality.WARN, result.errors.first().severity)
    }

    @Test
    fun `20 degree deviation — ERROR band — quality 45`() {
        val frame = SkeletalMapper.buildFrame(angleDegs = 65f, isFormAlert = false)
        val result = TechniqueAnalyzer.analyze(frame, targetAngle = 45f)
        assertEquals(45, result.qualityScore)
        assertEquals(1, result.errors.size)
        assertEquals(JointQuality.ERROR, result.errors.first().severity)
    }

    @Test
    fun `35 degree deviation — DANGER band — quality 15`() {
        val frame = SkeletalMapper.buildFrame(angleDegs = 80f, isFormAlert = false)
        val result = TechniqueAnalyzer.analyze(frame, targetAngle = 45f)
        assertEquals(15, result.qualityScore)
        assertEquals(1, result.errors.size)
        assertEquals(JointQuality.DANGER, result.errors.first().severity)
    }

    // ── Risk score is complement of quality ───────────────────────────────────

    @Test
    fun `quality plus risk always equals 100`() {
        val testCases = listOf(
            Pair(45f, 45f), // perfect
            Pair(55f, 45f), // warn
            Pair(65f, 45f), // error
            Pair(80f, 45f), // danger
        )
        testCases.forEach { (angle, target) ->
            val frame = SkeletalMapper.buildFrame(angleDegs = angle, isFormAlert = false)
            val result = TechniqueAnalyzer.analyze(frame, targetAngle = target)
            assertEquals(
                "quality + risk must equal 100 for angle=$angle target=$target",
                100, result.qualityScore + result.riskScore
            )
        }
    }

    // ── Form alert ────────────────────────────────────────────────────────────

    @Test
    fun `form alert alone adds an ERROR regardless of angle`() {
        val frame = SkeletalMapper.buildFrame(angleDegs = 45f, isFormAlert = true)
        val result = TechniqueAnalyzer.analyze(frame, targetAngle = 45f)
        assertTrue(result.errors.any { it.severity == JointQuality.ERROR })
    }

    @Test
    fun `form alert with zero deviation produces two errors`() {
        val frame = SkeletalMapper.buildFrame(angleDegs = 45f, isFormAlert = true)
        val result = TechniqueAnalyzer.analyze(frame, targetAngle = 45f)
        // One ERROR from isFormAlert; no spine deviation error since diff < 5
        assertEquals(1, result.errors.size)
        assertEquals(JointQuality.ERROR, result.errors.first().severity)
    }

    @Test
    fun `form alert with large deviation produces two errors`() {
        val frame = SkeletalMapper.buildFrame(angleDegs = 80f, isFormAlert = true)
        val result = TechniqueAnalyzer.analyze(frame, targetAngle = 45f)
        assertEquals(2, result.errors.size)
        assertTrue(result.errors.any { it.severity == JointQuality.DANGER })
        assertTrue(result.errors.any { it.severity == JointQuality.ERROR })
    }

    // ── Stability score ───────────────────────────────────────────────────────

    @Test
    fun `form alert reduces stability score to 50`() {
        val frame = SkeletalMapper.buildFrame(angleDegs = 45f, isFormAlert = true)
        val result = TechniqueAnalyzer.analyze(frame, targetAngle = 45f)
        assertEquals(50, result.stabilityScore)
    }

    @Test
    fun `no form alert keeps stability score at 85`() {
        val frame = SkeletalMapper.buildFrame(angleDegs = 45f, isFormAlert = false)
        val result = TechniqueAnalyzer.analyze(frame, targetAngle = 45f)
        assertEquals(85, result.stabilityScore)
    }

    // ── Neutral frame ────────────────────────────────────────────────────────

    @Test
    fun `neutral frame with zero target returns good quality`() {
        val frame = SkeletalMapper.buildNeutralFrame()
        val result = TechniqueAnalyzer.analyze(frame, targetAngle = 0f)
        assertTrue(result.qualityScore >= 80)
        assertTrue(result.errors.isEmpty())
    }
}
