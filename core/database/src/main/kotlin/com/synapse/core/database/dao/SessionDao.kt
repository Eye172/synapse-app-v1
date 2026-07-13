package com.synapse.core.database.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.synapse.core.database.entity.SessionEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface SessionDao {

    @Query("SELECT * FROM sessions ORDER BY startedAt DESC")
    fun getAllSessions(): Flow<List<SessionEntity>>

    @Query("SELECT * FROM sessions WHERE exerciseId = :exerciseId ORDER BY startedAt DESC")
    fun getSessionsForExercise(exerciseId: String): Flow<List<SessionEntity>>

    @Query("SELECT * FROM sessions WHERE id = :id")
    suspend fun getSessionById(id: String): SessionEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSession(session: SessionEntity)

    @Query("DELETE FROM sessions WHERE id = :id")
    suspend fun deleteSession(id: String)

    @Query("SELECT AVG(qualityScore) FROM sessions WHERE exerciseId = :exerciseId")
    suspend fun averageQualityForExercise(exerciseId: String): Float?

    @Query("SELECT COUNT(*) FROM sessions")
    suspend fun totalSessionCount(): Int
}
