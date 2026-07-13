package com.synapse.core.common

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Base ViewModel enforcing MVI: ViewState + UserAction + UiEffect.
 *
 * [S] = ViewState  — immutable snapshot of screen data
 * [A] = UserAction — intents from the UI
 * [E] = UiEffect   — one-shot side-effects (navigation, toast, etc.)
 */
abstract class BaseViewModel<S, A, E>(initialState: S) : ViewModel() {

    private val _state = MutableStateFlow(initialState)
    val state: StateFlow<S> = _state.asStateFlow()

    private val _effect = Channel<E>(Channel.BUFFERED)
    val effect = _effect.receiveAsFlow()

    protected fun updateState(block: S.() -> S) {
        _state.update { it.block() }
    }

    protected fun emitEffect(effect: E) {
        viewModelScope.launch { _effect.send(effect) }
    }

    abstract fun handleAction(action: A)
}
