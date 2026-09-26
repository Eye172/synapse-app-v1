package com.synapse.app.di

import com.synapse.app.BuildConfig
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Named
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    @Named("openai_api_key")
    fun provideOpenAiApiKey(): String = BuildConfig.OPENAI_API_KEY
}
