pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "Synapse"

include(":app")

// Core modules
include(":core:common")
include(":core:designsystem")
include(":core:connectivity")
include(":core:motion")
include(":core:camera")
include(":core:network")
include(":core:database")
include(":core:ai")
include(":core:analytics")

// Feature modules
include(":feature:auth")
include(":feature:onboarding")
include(":feature:device-pairing")
include(":feature:exercise-library")
include(":feature:workout")
include(":feature:live-session")
include(":feature:video-review")
include(":feature:profile")
include(":feature:settings")
