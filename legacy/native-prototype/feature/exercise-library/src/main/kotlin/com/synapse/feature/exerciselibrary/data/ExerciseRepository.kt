package com.synapse.feature.exerciselibrary.data

import com.synapse.core.database.dao.ExerciseDao
import com.synapse.core.database.entity.ExerciseEntity
import com.synapse.feature.exerciselibrary.domain.model.Difficulty
import com.synapse.feature.exerciselibrary.domain.model.Exercise
import com.synapse.feature.exerciselibrary.domain.model.ExerciseCategory
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

interface ExerciseRepository {
    fun getAllExercises(): Flow<List<Exercise>>
    fun searchExercises(query: String): Flow<List<Exercise>>
    fun getFavorites(): Flow<List<Exercise>>
    suspend fun getExerciseById(id: String): Exercise?
    suspend fun toggleFavorite(exerciseId: String, isFavorite: Boolean)
    suspend fun seedIfEmpty()
}

@Singleton
class ExerciseRepositoryImpl @Inject constructor(
    private val dao: ExerciseDao,
) : ExerciseRepository {

    override fun getAllExercises(): Flow<List<Exercise>> =
        dao.getAllExercises().map { it.map(ExerciseEntity::toDomain) }

    override fun searchExercises(query: String): Flow<List<Exercise>> =
        dao.searchExercises(query).map { it.map(ExerciseEntity::toDomain) }

    override fun getFavorites(): Flow<List<Exercise>> =
        dao.getFavorites().map { it.map(ExerciseEntity::toDomain) }

    override suspend fun getExerciseById(id: String): Exercise? =
        dao.getExerciseById(id)?.toDomain()

    override suspend fun toggleFavorite(exerciseId: String, isFavorite: Boolean) =
        dao.setFavorite(exerciseId, isFavorite)

    override suspend fun seedIfEmpty() {
        if (dao.count() == 0) dao.insertAll(ExerciseSeeder.exercises)
    }
}

private fun ExerciseEntity.toDomain() = Exercise(
    id = id,
    name = name,
    category = ExerciseCategory.entries.find { it.name == category } ?: ExerciseCategory.STRENGTH,
    difficulty = Difficulty.entries.find { it.name == difficulty } ?: Difficulty.BEGINNER,
    description = description,
    muscles = kotlinx.serialization.json.Json.decodeFromString<List<String>>(muscles),
    equipment = kotlinx.serialization.json.Json.decodeFromString<List<String>>(equipment),
    videoUrl = videoUrl,
    thumbnailUrl = thumbnailUrl,
    targetAngleDeg = targetAngleDeg,
    isFavorite = isFavorite,
    safetyNotes = safetyNotes,
)
