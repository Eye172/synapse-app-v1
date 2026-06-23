package com.synapse.feature.profile.presentation.viewmodel

import androidx.lifecycle.ViewModel
import com.synapse.core.database.dao.SessionDao
import com.synapse.core.database.entity.SessionEntity
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn

@HiltViewModel
class ProfileViewModel @Inject constructor(
    sessionDao: SessionDao,
) : ViewModel() {

    val sessions: StateFlow<List<SessionEntity>> = sessionDao.getAllSessions()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
}
