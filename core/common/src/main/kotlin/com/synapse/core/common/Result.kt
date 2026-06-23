package com.synapse.core.common

sealed class AppResult<out T> {
    data class Success<T>(val data: T) : AppResult<T>()
    data class Error(val exception: Throwable, val message: String = exception.message ?: "Unknown error") : AppResult<Nothing>()

    val isSuccess get() = this is Success
    val isError get() = this is Error

    fun getOrNull(): T? = if (this is Success) data else null
    fun exceptionOrNull(): Throwable? = if (this is Error) exception else null
}

suspend fun <T> safeCall(block: suspend () -> T): AppResult<T> = try {
    AppResult.Success(block())
} catch (e: Exception) {
    AppResult.Error(e)
}

fun <T, R> AppResult<T>.map(transform: (T) -> R): AppResult<R> = when (this) {
    is AppResult.Success -> AppResult.Success(transform(data))
    is AppResult.Error -> this
}
