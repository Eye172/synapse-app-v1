package com.synapse.feature.exerciselibrary.domain.model

data class Exercise(
    val id: String,
    val name: String,
    val category: ExerciseCategory,
    val difficulty: Difficulty,
    val description: String,
    val muscles: List<String>,
    val equipment: List<String>,
    val videoUrl: String,
    val thumbnailUrl: String,
    val targetAngleDeg: Float,
    val isFavorite: Boolean = false,
    val safetyNotes: String = "",
)

enum class ExerciseCategory(val displayName: String) {
    STRENGTH("Strength"),
    MOBILITY("Mobility"),
    REHABILITATION("Rehabilitation"),
    POSTURE("Posture"),
    CARDIO("Cardio"),
    CORE("Core"),
}

enum class Difficulty(val displayName: String, val level: Int) {
    BEGINNER("Beginner", 1),
    INTERMEDIATE("Intermediate", 2),
    ADVANCED("Advanced", 3),
    EXPERT("Expert", 4),
}
