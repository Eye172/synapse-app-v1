package com.synapse.feature.auth.presentation.viewmodel

import androidx.lifecycle.viewModelScope
import com.synapse.core.common.BaseViewModel
import com.synapse.feature.auth.domain.AuthRepository
import com.synapse.feature.auth.domain.AuthResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AuthState(
    val email: String = "",
    val password: String = "",
    val name: String = "",
    val isLoading: Boolean = false,
    val emailError: String? = null,
    val passwordError: String? = null,
    val generalError: String? = null,
)

sealed interface AuthAction {
    data class UpdateEmail(val value: String) : AuthAction
    data class UpdatePassword(val value: String) : AuthAction
    data class UpdateName(val value: String) : AuthAction
    data object Login : AuthAction
    data object Register : AuthAction
    data object ClearErrors : AuthAction
}

sealed interface AuthEffect {
    data class NavigateToOnboarding(val userId: String) : AuthEffect
    data class NavigateToDashboard(val userId: String) : AuthEffect
    data class ShowError(val message: String) : AuthEffect
}

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : BaseViewModel<AuthState, AuthAction, AuthEffect>(AuthState()) {

    override fun handleAction(action: AuthAction) = when (action) {
        is AuthAction.UpdateEmail    -> updateState { copy(email = action.value, emailError = null) }
        is AuthAction.UpdatePassword -> updateState { copy(password = action.value, passwordError = null) }
        is AuthAction.UpdateName     -> updateState { copy(name = action.value) }
        is AuthAction.ClearErrors    -> updateState { copy(emailError = null, passwordError = null, generalError = null) }
        is AuthAction.Login          -> doLogin()
        is AuthAction.Register       -> doRegister()
    }

    private fun doLogin() {
        val s = state.value
        if (!validate(requireName = false)) return
        viewModelScope.launch {
            updateState { copy(isLoading = true, generalError = null) }
            when (val result = authRepository.login(s.email.trim(), s.password)) {
                is AuthResult.Success -> {
                    updateState { copy(isLoading = false) }
                    emitEffect(AuthEffect.NavigateToDashboard(result.userId))
                }
                is AuthResult.Error -> updateState { copy(isLoading = false, generalError = result.message) }
            }
        }
    }

    private fun doRegister() {
        val s = state.value
        if (!validate(requireName = true)) return
        viewModelScope.launch {
            updateState { copy(isLoading = true, generalError = null) }
            when (val result = authRepository.register(s.name.trim(), s.email.trim(), s.password)) {
                is AuthResult.Success -> {
                    updateState { copy(isLoading = false) }
                    emitEffect(AuthEffect.NavigateToOnboarding(result.userId))
                }
                is AuthResult.Error -> updateState { copy(isLoading = false, generalError = result.message) }
            }
        }
    }

    private fun validate(requireName: Boolean): Boolean {
        val s = state.value
        var ok = true
        if (requireName && s.name.isBlank()) {
            updateState { copy(emailError = "Name is required") }; ok = false
        }
        if (!android.util.Patterns.EMAIL_ADDRESS.matcher(s.email.trim()).matches()) {
            updateState { copy(emailError = "Invalid email address") }; ok = false
        }
        if (s.password.length < 6) {
            updateState { copy(passwordError = "Password must be at least 6 characters") }; ok = false
        }
        return ok
    }
}
