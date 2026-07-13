package com.synapse.core.connectivity.di

import com.synapse.core.connectivity.ConnectivityRepository
import com.synapse.core.connectivity.IConnectivityRepository
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class ConnectivityModule {

    @Binds
    @Singleton
    abstract fun bindConnectivityRepository(
        impl: ConnectivityRepository,
    ): IConnectivityRepository
}
