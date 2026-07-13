package com.synapse.feature.exerciselibrary.data

import org.junit.Assert.*
import org.junit.Test

class ExerciseSeederTest {

    private val exercises = ExerciseSeeder.exercises

    @Test
    fun `seeder provides at least 11 exercises`() {
        assertTrue("Expected at least 11 exercises, got ${exercises.size}", exercises.size >= 11)
    }

    @Test
    fun `all exercise IDs are unique`() {
        val ids = exercises.map { it.id }
        assertEquals("Duplicate exercise IDs found", ids.size, ids.toSet().size)
    }

    @Test
    fun `all exercises have non-blank name and description`() {
        exercises.forEach { ex ->
            assertFalse("Exercise ${ex.id} has blank name", ex.name.isBlank())
            assertFalse("Exercise ${ex.id} has blank description", ex.description.isBlank())
        }
    }

    @Test
    fun `all exercises have valid category strings`() {
        val validCategories = setOf("STRENGTH", "MOBILITY", "POSTURE", "REHABILITATION", "CARDIO")
        exercises.forEach { ex ->
            assertTrue(
                "Exercise ${ex.id} has unknown category '${ex.category}'",
                ex.category in validCategories
            )
        }
    }

    @Test
    fun `all exercises have valid difficulty strings`() {
        val validDifficulties = setOf("BEGINNER", "INTERMEDIATE", "ADVANCED")
        exercises.forEach { ex ->
            assertTrue(
                "Exercise ${ex.id} has unknown difficulty '${ex.difficulty}'",
                ex.difficulty in validDifficulties
            )
        }
    }

    @Test
    fun `video-backed exercises have correct video resource names`() {
        val videoExercises = mapOf(
            "squat_back"      to "video_squat",
            "pullup"          to "video_pullup",
            "shoulder_press"  to "video_shoulder_press",
            "leg_raises"      to "video_leg_raises",
        )
        videoExercises.forEach { (exerciseId, expectedVideoUrl) ->
            val ex = exercises.find { it.id == exerciseId }
            assertNotNull("Exercise '$exerciseId' not found in seeder", ex)
            assertEquals(
                "Exercise '$exerciseId' has wrong videoUrl",
                expectedVideoUrl, ex!!.videoUrl
            )
        }
    }

    @Test
    fun `muscles JSON is non-empty for all exercises`() {
        exercises.forEach { ex ->
            assertFalse("Exercise ${ex.id} has blank muscles", ex.muscles.isBlank())
            assertNotEquals("[]", ex.muscles.trim())
        }
    }

    @Test
    fun `equipment JSON is non-empty for all exercises`() {
        exercises.forEach { ex ->
            assertFalse("Exercise ${ex.id} has blank equipment", ex.equipment.isBlank())
        }
    }

    @Test
    fun `target angle is non-negative for all exercises`() {
        exercises.forEach { ex ->
            assertTrue(
                "Exercise ${ex.id} has negative targetAngleDeg: ${ex.targetAngleDeg}",
                ex.targetAngleDeg >= 0f
            )
        }
    }

    @Test
    fun `back squat target angle is within expected lower-body range`() {
        val squat = exercises.find { it.id == "squat_back" }
        assertNotNull(squat)
        assertTrue("Squat target angle should be 0–90°", squat!!.targetAngleDeg in 0f..90f)
    }

    @Test
    fun `exercises without videos have blank videoUrl`() {
        val noVideoIds = setOf(
            "deadlift_conventional", "rdl", "posture_correction",
            "hip_hinge", "bird_dog", "barbell_row", "goodmorning"
        )
        noVideoIds.forEach { id ->
            val ex = exercises.find { it.id == id }
            assertNotNull("Exercise '$id' not found", ex)
            assertTrue("Exercise '$id' should have blank videoUrl", ex!!.videoUrl.isBlank())
        }
    }
}
