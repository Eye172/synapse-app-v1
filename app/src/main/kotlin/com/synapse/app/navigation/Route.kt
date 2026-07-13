package com.synapse.app.navigation

import kotlinx.serialization.Serializable

sealed interface Route {

    @Serializable data object Auth : Route
    @Serializable data object Login : Route
    @Serializable data object Register : Route

    @Serializable data object Onboarding : Route

    @Serializable data object Main : Route
    @Serializable data object Dashboard : Route
    @Serializable data object DevicePairing : Route

    @Serializable data object ExerciseLibrary : Route
    @Serializable data class ExerciseDetail(val exerciseId: String) : Route

    @Serializable data class WorkoutPrep(val exerciseId: String) : Route

    @Serializable data class LiveSession(val exerciseId: String) : Route

    @Serializable data class VideoReview(val sessionId: String) : Route

    @Serializable data object Profile : Route

    @Serializable data object Settings : Route
}
