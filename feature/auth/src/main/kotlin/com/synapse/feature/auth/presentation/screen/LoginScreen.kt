package com.synapse.feature.auth.presentation.screen

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.synapse.core.designsystem.BackgroundDeep
import com.synapse.core.designsystem.BrandLime
import com.synapse.core.designsystem.SkeletonCyan
import com.synapse.core.designsystem.component.SynapsePrimaryButton
import com.synapse.core.designsystem.component.SynapseTextButton
import com.synapse.feature.auth.presentation.viewmodel.AuthAction
import com.synapse.feature.auth.presentation.viewmodel.AuthEffect
import com.synapse.feature.auth.presentation.viewmodel.AuthViewModel

@Composable
fun LoginScreen(
    onNavigateToRegister: () -> Unit,
    onNavigateToOnboarding: () -> Unit,
    onNavigateToDashboard: () -> Unit,
    viewModel: AuthViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val focusManager = LocalFocusManager.current
    var passwordVisible by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        viewModel.effect.collect { effect ->
            when (effect) {
                is AuthEffect.NavigateToDashboard -> onNavigateToDashboard()
                is AuthEffect.NavigateToOnboarding -> onNavigateToOnboarding()
                else -> {}
            }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(BackgroundDeep)
            .systemBarsPadding()
    ) {
        // ── Cyberpunk HUD background ─────────────────────────────────────────
        HudBackground(modifier = Modifier.fillMaxSize())

        // ── Corner crosshair markers ─────────────────────────────────────────
        CornerMarkers(modifier = Modifier.fillMaxSize())

        // ── Content ──────────────────────────────────────────────────────────
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(72.dp))

            // Brand wordmark
            Text(
                text = "SYNAPSE",
                style = MaterialTheme.typography.displaySmall,
                color = BrandLime,
                fontWeight = FontWeight.Black,
                letterSpacing = 10.sp,
            )
            Text(
                text = "SMART TRAINING",
                style = MaterialTheme.typography.labelLarge,
                color = SkeletonCyan,
                letterSpacing = 5.sp,
            )
            Spacer(Modifier.height(4.dp))
            // Scanning line accent under title
            Box(
                modifier = Modifier
                    .width(120.dp)
                    .height(1.dp)
                    .background(
                        Brush.horizontalGradient(
                            listOf(Color.Transparent, SkeletonCyan, Color.Transparent)
                        )
                    )
            )

            Spacer(Modifier.height(56.dp))

            // Glassmorphism login card
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .border(
                        width = 1.dp,
                        brush = Brush.verticalGradient(
                            listOf(SkeletonCyan.copy(0.4f), BrandLime.copy(0.1f))
                        ),
                        shape = RoundedCornerShape(20.dp),
                    )
                    .background(
                        Color(0xFF0D0D1A).copy(alpha = 0.85f),
                        RoundedCornerShape(20.dp),
                    )
                    .padding(horizontal = 24.dp, vertical = 28.dp),
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = "SIGN IN",
                        style = MaterialTheme.typography.titleLarge,
                        color = MaterialTheme.colorScheme.onBackground,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 2.sp,
                    )
                    Text(
                        text = "Enter your credentials to continue",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onBackground.copy(0.45f),
                        modifier = Modifier.padding(top = 4.dp),
                        textAlign = TextAlign.Center,
                    )

                    Spacer(Modifier.height(28.dp))

                    OutlinedTextField(
                        value = state.email,
                        onValueChange = { viewModel.handleAction(AuthAction.UpdateEmail(it)) },
                        label = { Text("Email") },
                        singleLine = true,
                        isError = state.emailError != null,
                        supportingText = state.emailError?.let { { Text(it) } },
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Email,
                            imeAction = ImeAction.Next,
                        ),
                        keyboardActions = KeyboardActions(
                            onNext = { focusManager.moveFocus(FocusDirection.Down) }
                        ),
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp),
                        colors = hudTextFieldColors(),
                    )

                    Spacer(Modifier.height(12.dp))

                    OutlinedTextField(
                        value = state.password,
                        onValueChange = { viewModel.handleAction(AuthAction.UpdatePassword(it)) },
                        label = { Text("Password") },
                        singleLine = true,
                        isError = state.passwordError != null,
                        supportingText = state.passwordError?.let { { Text(it) } },
                        visualTransformation = if (passwordVisible) VisualTransformation.None
                                               else PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Password,
                            imeAction = ImeAction.Done,
                        ),
                        keyboardActions = KeyboardActions(onDone = {
                            focusManager.clearFocus()
                            viewModel.handleAction(AuthAction.Login)
                        }),
                        trailingIcon = {
                            TextButton(onClick = { passwordVisible = !passwordVisible }) {
                                Text(
                                    if (passwordVisible) "HIDE" else "SHOW",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = SkeletonCyan,
                                )
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp),
                        colors = hudTextFieldColors(),
                    )

                    AnimatedVisibility(visible = state.generalError != null) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 12.dp)
                                .background(
                                    MaterialTheme.colorScheme.errorContainer,
                                    RoundedCornerShape(8.dp),
                                )
                                .padding(12.dp),
                        ) {
                            Text(
                                text = state.generalError ?: "",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onErrorContainer,
                            )
                        }
                    }

                    Spacer(Modifier.height(24.dp))

                    SynapsePrimaryButton(
                        text = "Sign In",
                        onClick = { viewModel.handleAction(AuthAction.Login) },
                        isLoading = state.isLoading,
                    )
                }
            }

            Spacer(Modifier.height(28.dp))

            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "No account?",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onBackground.copy(0.5f),
                )
                SynapseTextButton(text = "Sign Up", onClick = onNavigateToRegister)
            }

            Spacer(Modifier.height(32.dp))
        }
    }
}

@Composable
private fun HudBackground(modifier: Modifier = Modifier) {
    val infiniteTransition = rememberInfiniteTransition(label = "hud")
    val rotation by infiniteTransition.animateFloat(
        initialValue = 0f, targetValue = 360f,
        animationSpec = infiniteRepeatable(tween(18000, easing = LinearEasing)),
        label = "ring_rotation",
    )
    val pulse by infiniteTransition.animateFloat(
        initialValue = 0.3f, targetValue = 0.7f,
        animationSpec = infiniteRepeatable(tween(2400), RepeatMode.Reverse),
        label = "pulse",
    )

    Canvas(modifier = modifier) {
        val cx = size.width * 0.5f
        val cy = size.height * 0.38f

        // Outer glow ring
        drawCircle(
            color = SkeletonCyan.copy(alpha = pulse * 0.06f),
            radius = size.width * 0.72f,
            center = Offset(cx, cy),
        )

        // Dashed scan ring 1
        drawCircle(
            color = SkeletonCyan.copy(alpha = 0.12f),
            radius = size.width * 0.48f,
            center = Offset(cx, cy),
            style = Stroke(
                width = 1.dp.toPx(),
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(12f, 8f), rotation),
            ),
        )

        // Dashed scan ring 2 (counter-rotate via phase offset)
        drawCircle(
            color = BrandLime.copy(alpha = 0.08f),
            radius = size.width * 0.35f,
            center = Offset(cx, cy),
            style = Stroke(
                width = 1.dp.toPx(),
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 14f), 360f - rotation),
            ),
        )

        // Solid thin ring
        drawCircle(
            color = SkeletonCyan.copy(alpha = 0.06f),
            radius = size.width * 0.60f,
            center = Offset(cx, cy),
            style = Stroke(width = 0.5.dp.toPx()),
        )

        // Crosshair lines through center
        val crossLen = size.width * 0.08f
        val lineAlpha = pulse * 0.18f
        // horizontal
        drawLine(SkeletonCyan.copy(lineAlpha), Offset(cx - crossLen, cy), Offset(cx + crossLen, cy), 1.dp.toPx())
        // vertical
        drawLine(SkeletonCyan.copy(lineAlpha), Offset(cx, cy - crossLen), Offset(cx, cy + crossLen), 1.dp.toPx())
    }
}

@Composable
private fun CornerMarkers(modifier: Modifier = Modifier) {
    Canvas(modifier = modifier) {
        val armLen = 20.dp.toPx()
        val pad = 16.dp.toPx()
        val stroke = Stroke(width = 1.5.dp.toPx())
        val color = BrandLime.copy(alpha = 0.5f)

        // Top-left
        drawLine(color, Offset(pad, pad), Offset(pad + armLen, pad), 1.5.dp.toPx())
        drawLine(color, Offset(pad, pad), Offset(pad, pad + armLen), 1.5.dp.toPx())
        // Top-right
        drawLine(color, Offset(size.width - pad, pad), Offset(size.width - pad - armLen, pad), 1.5.dp.toPx())
        drawLine(color, Offset(size.width - pad, pad), Offset(size.width - pad, pad + armLen), 1.5.dp.toPx())
        // Bottom-left
        drawLine(color, Offset(pad, size.height - pad), Offset(pad + armLen, size.height - pad), 1.5.dp.toPx())
        drawLine(color, Offset(pad, size.height - pad), Offset(pad, size.height - pad - armLen), 1.5.dp.toPx())
        // Bottom-right
        drawLine(color, Offset(size.width - pad, size.height - pad), Offset(size.width - pad - armLen, size.height - pad), 1.5.dp.toPx())
        drawLine(color, Offset(size.width - pad, size.height - pad), Offset(size.width - pad, size.height - pad - armLen), 1.5.dp.toPx())
    }
}

@Composable
private fun hudTextFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = SkeletonCyan,
    unfocusedBorderColor = SkeletonCyan.copy(0.25f),
    focusedLabelColor = SkeletonCyan,
    unfocusedLabelColor = MaterialTheme.colorScheme.onBackground.copy(0.4f),
    cursorColor = SkeletonCyan,
    focusedTextColor = MaterialTheme.colorScheme.onBackground,
    unfocusedTextColor = MaterialTheme.colorScheme.onBackground,
)
