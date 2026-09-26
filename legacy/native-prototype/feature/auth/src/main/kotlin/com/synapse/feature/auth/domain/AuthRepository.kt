package com.synapse.feature.auth.domain

interface AuthRepository {
    suspend fun login(email: String, password: String): AuthResult
    suspend fun register(name: String, email: String, password: String): AuthResult
    suspend fun logout()
    fun isLoggedIn(): Boolean
}

sealed interface AuthResult {
    data class Success(val userId: String) : AuthResult
    data class Error(val message: String) : AuthResult
}
