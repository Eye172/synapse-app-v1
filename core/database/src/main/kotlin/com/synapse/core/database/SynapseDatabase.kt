package com.synapse.core.database

import androidx.room.Database
import androidx.room.RoomDatabase
import com.synapse.core.database.dao.ExerciseDao
import com.synapse.core.database.dao.SessionDao
import com.synapse.core.database.entity.ExerciseEntity
import com.synapse.core.database.entity.SessionEntity

@Database(
    entities = [ExerciseEntity::class, SessionEntity::class],
    version = 1,
    exportSchema = false,
)
abstract class SynapseDatabase : RoomDatabase() {
    abstract fun exerciseDao(): ExerciseDao
    abstract fun sessionDao(): SessionDao

    companion object {
        const val DATABASE_NAME = "synapse.db"
    }
}
