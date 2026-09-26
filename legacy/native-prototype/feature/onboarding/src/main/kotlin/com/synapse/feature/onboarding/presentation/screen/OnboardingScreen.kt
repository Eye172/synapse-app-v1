package com.synapse.feature.onboarding.presentation.screen

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.synapse.core.designsystem.BackgroundDeep
import com.synapse.core.designsystem.BrandLime
import com.synapse.core.designsystem.SkeletonCyan
import com.synapse.core.designsystem.TextSecondary
import com.synapse.core.designsystem.component.SynapsePrimaryButton
import com.synapse.core.designsystem.component.SynapseTextButton

private data class OnboardingPage(
    val title: String,
    val subtitle: String,
    val description: String,
)

private val PAGES = listOf(
    OnboardingPage(
        title = "REAL-TIME\nANALYSIS",
        subtitle = "Biomechanical precision",
        description = "Your Synapse exoskeleton streams sensor data at 10Hz, providing instant feedback on every movement.",
    ),
    OnboardingPage(
        title = "TECHNIQUE\nCORRECTION",
        subtitle = "AI-powered coaching",
        description = "Our AI coach analyzes your form against optimal biomechanical models and guides you to perfect technique.",
    ),
    OnboardingPage(
        title = "INJURY\nPREVENTION",
        subtitle = "Train smarter, stay safe",
        description = "Real-time risk assessment flags dangerous movements before they cause harm. Your safety is our priority.",
    ),
    OnboardingPage(
        title = "TRACK\nPROGRESS",
        subtitle = "Measurable improvement",
        description = "Every session is scored and saved. Watch your technique scores improve over time with detailed analytics.",
    ),
)

@Composable
fun OnboardingScreen(onComplete: () -> Unit) {
    var currentPage by remember { mutableIntStateOf(0) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(BackgroundDeep)
            .systemBarsPadding(),
    ) {
        Column(
            modifier = Modifier.fillMaxSize().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
            ) {
                SynapseTextButton(text = "Skip", onClick = onComplete, color = TextSecondary)
            }

            Spacer(Modifier.weight(0.5f))

            AnimatedContent(
                targetState = currentPage,
                transitionSpec = { fadeIn(tween(300)) togetherWith fadeOut(tween(300)) },
                label = "page",
            ) { page ->
                val p = PAGES[page]
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    // Visual placeholder – replace with Lottie animation
                    Box(
                        modifier = Modifier
                            .size(180.dp)
                            .background(MaterialTheme.colorScheme.surfaceVariant, CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = (page + 1).toString(),
                            style = MaterialTheme.typography.displayMedium,
                            color = SkeletonCyan,
                        )
                    }

                    Spacer(Modifier.height(40.dp))

                    Text(
                        text = p.title,
                        style = MaterialTheme.typography.displaySmall,
                        color = BrandLime,
                        textAlign = TextAlign.Center,
                    )
                    Text(
                        text = p.subtitle,
                        style = MaterialTheme.typography.labelLarge,
                        color = SkeletonCyan,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                    Text(
                        text = p.description,
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.65f),
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = 20.dp, start = 16.dp, end = 16.dp),
                    )
                }
            }

            Spacer(Modifier.weight(1f))

            // Page indicator
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                repeat(PAGES.size) { i ->
                    Box(
                        modifier = Modifier
                            .size(if (i == currentPage) 24.dp else 8.dp, 8.dp)
                            .clip(CircleShape)
                            .background(if (i == currentPage) BrandLime else SkeletonCyan.copy(alpha = 0.3f))
                    )
                }
            }

            Spacer(Modifier.height(32.dp))

            SynapsePrimaryButton(
                text = if (currentPage == PAGES.lastIndex) "Get Started" else "Next",
                onClick = {
                    if (currentPage == PAGES.lastIndex) onComplete()
                    else currentPage++
                },
            )

            Spacer(Modifier.height(24.dp))
        }
    }
}
