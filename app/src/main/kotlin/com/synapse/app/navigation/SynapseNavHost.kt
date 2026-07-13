package com.synapse.app.navigation

import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.navigation
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import com.synapse.feature.auth.presentation.screen.LoginScreen
import com.synapse.feature.auth.presentation.screen.RegisterScreen
import com.synapse.feature.devicepairing.presentation.screen.DevicePairingScreen
import com.synapse.feature.exerciselibrary.presentation.screen.ExerciseDetailScreen
import com.synapse.feature.exerciselibrary.presentation.screen.ExerciseLibraryScreen
import com.synapse.feature.livesession.presentation.screen.LiveSessionScreen
import com.synapse.feature.onboarding.presentation.screen.OnboardingScreen
import com.synapse.feature.profile.presentation.screen.ProfileScreen
import com.synapse.feature.settings.presentation.screen.SettingsScreen
import com.synapse.feature.videoreview.presentation.screen.VideoReviewScreen
import com.synapse.feature.workout.presentation.screen.DashboardScreen
import com.synapse.feature.workout.presentation.screen.WorkoutPrepScreen

private const val ANIM_DURATION = 300

@Composable
fun SynapseNavHost(
    navController: NavHostController = rememberNavController(),
    startDestination: Route = Route.Auth,
) {
    NavHost(
        navController = navController,
        startDestination = startDestination,
        enterTransition = {
            slideInHorizontally(tween(ANIM_DURATION)) { it } + fadeIn(tween(ANIM_DURATION))
        },
        exitTransition = {
            slideOutHorizontally(tween(ANIM_DURATION)) { -it / 3 } + fadeOut(tween(ANIM_DURATION))
        },
        popEnterTransition = {
            slideInHorizontally(tween(ANIM_DURATION)) { -it / 3 } + fadeIn(tween(ANIM_DURATION))
        },
        popExitTransition = {
            slideOutHorizontally(tween(ANIM_DURATION)) { it } + fadeOut(tween(ANIM_DURATION))
        },
    ) {
        navigation<Route.Auth>(startDestination = Route.Login) {
            composable<Route.Login> {
                LoginScreen(
                    onNavigateToRegister = { navController.navigate(Route.Register) },
                    onNavigateToOnboarding = { navController.navigate(Route.Onboarding) { popUpTo(Route.Auth) { inclusive = true } } },
                    onNavigateToDashboard = { navController.navigate(Route.Dashboard) { popUpTo(Route.Auth) { inclusive = true } } },
                )
            }
            composable<Route.Register> {
                RegisterScreen(
                    onNavigateBack = { navController.popBackStack() },
                    onNavigateToOnboarding = { navController.navigate(Route.Onboarding) { popUpTo(Route.Auth) { inclusive = true } } },
                )
            }
        }

        composable<Route.Onboarding> {
            OnboardingScreen(
                onComplete = {
                    navController.navigate(Route.DevicePairing) {
                        popUpTo(Route.Onboarding) { inclusive = true }
                    }
                }
            )
        }

        composable<Route.DevicePairing> {
            DevicePairingScreen(
                onDeviceConnected = {
                    navController.navigate(Route.Dashboard) {
                        popUpTo(Route.DevicePairing) { inclusive = true }
                    }
                },
                onSkip = {
                    navController.navigate(Route.Dashboard) {
                        popUpTo(Route.DevicePairing) { inclusive = true }
                    }
                }
            )
        }

        composable<Route.Dashboard> {
            DashboardScreen(
                onNavigateToExerciseLibrary = { navController.navigate(Route.ExerciseLibrary) },
                onNavigateToDevicePairing = { navController.navigate(Route.DevicePairing) },
                onNavigateToProfile = { navController.navigate(Route.Profile) },
                onNavigateToSettings = { navController.navigate(Route.Settings) },
            )
        }

        composable<Route.ExerciseLibrary> {
            ExerciseLibraryScreen(
                onNavigateBack = { navController.popBackStack() },
                onNavigateToDetail = { exerciseId ->
                    navController.navigate(Route.ExerciseDetail(exerciseId))
                }
            )
        }

        composable<Route.ExerciseDetail> { backStack ->
            val exerciseId = backStack.toRoute<Route.ExerciseDetail>().exerciseId
            ExerciseDetailScreen(
                exerciseId = exerciseId,
                onNavigateBack = { navController.popBackStack() },
                onStartWorkout = { navController.navigate(Route.WorkoutPrep(exerciseId)) },
            )
        }

        composable<Route.WorkoutPrep> { backStack ->
            val exerciseId = backStack.toRoute<Route.WorkoutPrep>().exerciseId
            WorkoutPrepScreen(
                exerciseId = exerciseId,
                onNavigateBack = { navController.popBackStack() },
                onStartSession = { navController.navigate(Route.LiveSession(exerciseId)) },
            )
        }

        composable<Route.LiveSession> { backStack ->
            val exerciseId = backStack.toRoute<Route.LiveSession>().exerciseId
            LiveSessionScreen(
                exerciseId = exerciseId,
                onNavigateBack = { navController.popBackStack() },
                onSessionComplete = { sessionId ->
                    navController.navigate(Route.VideoReview(sessionId)) {
                        popUpTo(Route.LiveSession(exerciseId)) { inclusive = true }
                    }
                },
            )
        }

        composable<Route.VideoReview> { backStack ->
            val sessionId = backStack.toRoute<Route.VideoReview>().sessionId
            VideoReviewScreen(
                sessionId = sessionId,
                onNavigateBack = {
                    navController.navigate(Route.Dashboard) {
                        popUpTo(Route.Dashboard) { inclusive = false }
                    }
                },
            )
        }

        composable<Route.Profile> {
            ProfileScreen(onNavigateBack = { navController.popBackStack() })
        }

        composable<Route.Settings> {
            SettingsScreen(onNavigateBack = { navController.popBackStack() })
        }
    }
}
