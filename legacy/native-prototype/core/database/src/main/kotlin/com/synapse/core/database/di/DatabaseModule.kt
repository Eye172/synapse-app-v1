package com.synapse.core.database.di

import android.content.Context
import androidx.room.Room
import com.synapse.core.database.SynapseDatabase
import com.synapse.core.database.dao.ExerciseDao
import com.synapse.core.database.dao.SessionDao
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): SynapseDatabase =
        Room.databaseBuilder(context, SynapseDatabase::class.java, SynapseDatabase.DATABASE_NAME)
            .fallbackToDestructiveMigration()
            .build()

    @Provides fun provideExerciseDao(db: SynapseDatabase): ExerciseDao = db.exerciseDao()
    @Provides fun provideSessionDao(db: SynapseDatabase): SessionDao = db.sessionDao()
}
