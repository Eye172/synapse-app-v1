package com.synapse.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey
import java.util.UUID

@Entity(tableName = "sessions")
data class SessionEntity(
    @PrimaryKey val id: String = UUID.randomUUID().toString(),
    val exerciseId: String,
    val exerciseName: String,
    val startedAt: Long,
    val durationSeconds: Int,
    val qualityScore: Int,
    val symmetryScore: Int,
    val stabilityScore: Int,
    val riskScore: Int,
    val aiCoachingFeedback: String = "",
    val hasVideo: Boolean = false,
    val videoPath: String = "",
)
