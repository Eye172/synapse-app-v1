package com.synapse.core.analytics

import javax.inject.Inject
import javax.inject.Singleton

/** Stub analytics logger — replace with Firebase Analytics or custom backend. */
@Singleton
class SynapseAnalytics @Inject constructor() {
    fun logEvent(name: String, params: Map<String, Any> = emptyMap()) {
        android.util.Log.d("Analytics", "[$name] ${params.entries.joinToString { "${it.key}=${it.value}" }}")
    }
    fun logScreenView(screenName: String) = logEvent("screen_view", mapOf("screen_name" to screenName))
    fun logSessionComplete(exerciseId: String, qualityScore: Int) =
        logEvent("session_complete", mapOf("exercise_id" to exerciseId, "quality_score" to qualityScore))
}
