package com.synapse.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "exercises")
data class ExerciseEntity(
    @PrimaryKey val id: String,
    val name: String,
    val category: String,
    val difficulty: String,
    val description: String,
    val muscles: String,          // JSON array string
    val equipment: String,        // JSON array string
    val videoUrl: String,
    val thumbnailUrl: String,
    val targetAngleDeg: Float,
    val isFavorite: Boolean = false,
    val safetyNotes: String = "",
)
