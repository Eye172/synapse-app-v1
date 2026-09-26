package com.synapse.core.designsystem.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import com.synapse.core.designsystem.AccentBlue
import com.synapse.core.designsystem.BackgroundDeep
import com.synapse.core.designsystem.BackgroundElevated
import com.synapse.core.designsystem.BackgroundOverlay
import com.synapse.core.designsystem.BackgroundSurface
import com.synapse.core.designsystem.BorderBright
import com.synapse.core.designsystem.BorderDefault
import com.synapse.core.designsystem.BorderSubtle
import com.synapse.core.designsystem.BrandLime
import com.synapse.core.designsystem.BrandLimeContainer
import com.synapse.core.designsystem.BrandLimeDim
import com.synapse.core.designsystem.Error
import com.synapse.core.designsystem.SkeletonCyan
import com.synapse.core.designsystem.SkeletonCyanGlow
import com.synapse.core.designsystem.SkeletonDanger
import com.synapse.core.designsystem.SkeletonError
import com.synapse.core.designsystem.SkeletonGood
import com.synapse.core.designsystem.SkeletonWarn
import com.synapse.core.designsystem.Success
import com.synapse.core.designsystem.SynapseTypography
import com.synapse.core.designsystem.TextOnBrand
import com.synapse.core.designsystem.TextPrimary
import com.synapse.core.designsystem.TextSecondary
import com.synapse.core.designsystem.Warning

private val SynapseDarkColorScheme = darkColorScheme(
    primary = BrandLime,
    onPrimary = TextOnBrand,
    primaryContainer = BrandLimeContainer,
    onPrimaryContainer = BrandLime,
    secondary = SkeletonCyan,
    onSecondary = BackgroundDeep,
    secondaryContainer = Color(0xFF001F1C),
    onSecondaryContainer = SkeletonCyan,
    tertiary = AccentBlue,
    onTertiary = TextPrimary,
    background = BackgroundDeep,
    onBackground = TextPrimary,
    surface = BackgroundSurface,
    onSurface = TextPrimary,
    surfaceVariant = BackgroundElevated,
    onSurfaceVariant = TextSecondary,
    error = Error,
    onError = TextPrimary,
    errorContainer = Color(0xFF2A0011),
    onErrorContainer = Error,
    outline = BorderDefault,
    outlineVariant = BorderSubtle,
    scrim = BackgroundOverlay,
    inverseSurface = TextPrimary,
    inverseOnSurface = BackgroundDeep,
    inversePrimary = BrandLimeDim,
)

data class SynapseExtendedColors(
    val skeletonCyan: Color,
    val skeletonCyanGlow: Color,
    val skeletonGood: Color,
    val skeletonWarn: Color,
    val skeletonError: Color,
    val skeletonDanger: Color,
    val brandLime: Color,
    val textSecondary: Color,
    val backgroundDeep: Color,
    val backgroundSurface: Color,
    val backgroundElevated: Color,
    val borderDefault: Color,
    val borderBright: Color,
    val success: Color,
    val warning: Color,
)

private val DefaultSynapseColors = SynapseExtendedColors(
    skeletonCyan = SkeletonCyan,
    skeletonCyanGlow = SkeletonCyanGlow,
    skeletonGood = SkeletonGood,
    skeletonWarn = SkeletonWarn,
    skeletonError = SkeletonError,
    skeletonDanger = SkeletonDanger,
    brandLime = BrandLime,
    textSecondary = TextSecondary,
    backgroundDeep = BackgroundDeep,
    backgroundSurface = BackgroundSurface,
    backgroundElevated = BackgroundElevated,
    borderDefault = BorderDefault,
    borderBright = BorderBright,
    success = Success,
    warning = Warning,
)

val LocalSynapseColors = staticCompositionLocalOf { DefaultSynapseColors }

@Composable
fun SynapseTheme(content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalSynapseColors provides DefaultSynapseColors) {
        MaterialTheme(
            colorScheme = SynapseDarkColorScheme,
            typography = SynapseTypography,
            content = content,
        )
    }
}

val MaterialTheme.synapseColors: SynapseExtendedColors
    @Composable get() = LocalSynapseColors.current
