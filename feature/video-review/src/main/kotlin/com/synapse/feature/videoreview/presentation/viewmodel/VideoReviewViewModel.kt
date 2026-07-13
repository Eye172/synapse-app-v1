package com.synapse.feature.videoreview.presentation.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.synapse.core.database.dao.SessionDao
import com.synapse.core.database.entity.SessionEntity
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.io.File
import javax.inject.Inject

@HiltViewModel
class VideoReviewViewModel @Inject constructor(
    private val sessionDao: SessionDao,
) : ViewModel() {

    private val _session = MutableStateFlow<SessionEntity?>(null)
    val session: StateFlow<SessionEntity?> = _session.asStateFlow()

    private var videoPath: String = ""

    fun loadSession(sessionId: String) {
        viewModelScope.launch {
            val s = sessionDao.getSessionById(sessionId)
            _session.value = s
            videoPath = s?.videoPath ?: ""
        }
    }

    fun deleteVideoOnExit() {
        if (videoPath.isBlank()) return
        viewModelScope.launch(Dispatchers.IO) {
            val file = File(videoPath)
            if (file.exists()) file.delete()
        }
    }
}
