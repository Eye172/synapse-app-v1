package com.synapse.feature.auth.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.synapse.feature.auth.domain.AuthRepository
import com.synapse.feature.auth.domain.AuthResult
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

private val Context.authDataStore by preferencesDataStore("auth")

@Singleton
class AuthRepositoryImpl @Inject constructor(
    @ApplicationContext private val context: Context,
) : AuthRepository {

    private val dataStore: DataStore<Preferences> = context.authDataStore
    private val keyUserId = stringPreferencesKey("user_id")
    private val keyIsLoggedIn = booleanPreferencesKey("is_logged_in")

    override suspend fun login(email: String, password: String): AuthResult {
        // Stub: real impl would call backend API
        if (email.isBlank() || password.length < 6) {
            return AuthResult.Error("Invalid credentials")
        }
        val userId = UUID.randomUUID().toString()
        dataStore.edit {
            it[keyUserId] = userId
            it[keyIsLoggedIn] = true
        }
        return AuthResult.Success(userId)
    }

    override suspend fun register(name: String, email: String, password: String): AuthResult {
        if (name.isBlank() || email.isBlank() || password.length < 6) {
            return AuthResult.Error("Please fill all fields. Password must be 6+ characters.")
        }
        val userId = UUID.randomUUID().toString()
        dataStore.edit {
            it[keyUserId] = userId
            it[keyIsLoggedIn] = true
        }
        return AuthResult.Success(userId)
    }

    override suspend fun logout() {
        dataStore.edit {
            it[keyIsLoggedIn] = false
            it.remove(keyUserId)
        }
    }

    override fun isLoggedIn(): Boolean = runBlocking {
        dataStore.data.first()[keyIsLoggedIn] == true
    }
}
