package com.synapse.feature.workout.presentation.screen

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.synapse.core.designsystem.BackgroundDeep
import com.synapse.core.designsystem.BackgroundSurface
import com.synapse.core.designsystem.BrandLime
import com.synapse.core.designsystem.SkeletonCyan
import androidx.compose.foundation.Canvas
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import com.synapse.core.designsystem.component.SynapsePrimaryButton
import com.synapse.core.designsystem.component.SynapseSecondaryButton
import com.synapse.core.designsystem.component.SynapseTopBar
import com.synapse.core.motion.model.Bone
import com.synapse.core.motion.model.Joint
import com.synapse.core.motion.model.JointId
import com.synapse.core.motion.model.SKELETON_BONES
import com.synapse.core.motion.model.SkeletonFrame
import com.synapse.core.motion.processor.SkeletalMapper
import com.synapse.feature.workout.presentation.viewmodel.WorkoutPrepViewModel

@Composable
fun WorkoutPrepScreen(
    exerciseId: String,
    onNavigateBack: () -> Unit,
    onStartSession: () -> Unit,
    viewModel: WorkoutPrepViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(exerciseId) { viewModel.loadExercise(exerciseId) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BackgroundDeep)
            .systemBarsPadding(),
    ) {
        SynapseTopBar(title = "Preparation", onNavigateBack = onNavigateBack)

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(16.dp))

            state.exercise?.let { exercise ->
                Text(
                    exercise.name.uppercase(),
                    style = MaterialTheme.typography.headlineSmall,
                    color = BrandLime,
                    fontWeight = FontWeight.Black,
                    textAlign = TextAlign.Center,
                )
            }

            Spacer(Modifier.height(8.dp))

            Text(
                "Position yourself to match the target pose",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onBackground.copy(0.6f),
                textAlign = TextAlign.Center,
            )

            Spacer(Modifier.height(24.dp))

            // Target skeleton guide
            val targetFrame = remember(exerciseId) {
                SkeletalMapper.buildTargetFrame(state.exercise?.name ?: "")
            }

            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(0.6f),
                colors = CardDefaults.cardColors(containerColor = BackgroundSurface),
                shape = RoundedCornerShape(20.dp),
            ) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    // Crosshair markers
                    repeat(4) { i ->
                        val corners = listOf(
                            Alignment.TopStart, Alignment.TopEnd,
                            Alignment.BottomStart, Alignment.BottomEnd
                        )
                        Box(
                            modifier = Modifier
                                .size(20.dp)
                                .align(corners[i])
                                .padding(8.dp)
                                .background(BrandLime.copy(alpha = 0.5f))
                        )
                    }

                    WorkoutTargetPoseGuide(
                        targetFrame = targetFrame,
                        modifier = Modifier.fillMaxSize().padding(24.dp),
                    )

                    Text(
                        "TARGET POSE",
                        style = MaterialTheme.typography.labelSmall,
                        color = SkeletonCyan.copy(0.6f),
                        modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 12.dp),
                    )
                }
            }

            Spacer(Modifier.height(24.dp))

            // Instructions
            state.exercise?.let { exercise ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = BackgroundSurface),
                    shape = RoundedCornerShape(16.dp),
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("BEFORE YOU START", style = MaterialTheme.typography.labelLarge, color = SkeletonCyan, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(12.dp))
                        listOf(
                            "Wear the Synapse exoskeleton correctly",
                            "Ensure phone hotspot 'Synapse' is active",
                            "Stand in an open space with 2m clearance",
                            "Check sensor connection status above",
                        ).forEachIndexed { i, step ->
                            Row(modifier = Modifier.padding(vertical = 4.dp)) {
                                Text(
                                    "·",
                                    style = MaterialTheme.typography.bodyLarge,
                                    color = SkeletonCyan,
                                    modifier = Modifier.padding(end = 8.dp),
                                )
                                Text(step, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onBackground.copy(0.8f))
                            }
                        }
                        if (exercise.safetyNotes.isNotBlank()) {
                            HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp), color = MaterialTheme.colorScheme.outline.copy(0.3f))
                            Text("⚠️ ${exercise.safetyNotes}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onBackground.copy(0.6f))
                        }
                    }
                }
            }

            Spacer(Modifier.height(32.dp))

            SynapsePrimaryButton(
                text = "I'm Ready – Start Session",
                onClick = onStartSession,
            )
            Spacer(Modifier.height(12.dp))
            SynapseSecondaryButton(text = "Go Back", onClick = onNavigateBack)
            Spacer(Modifier.height(24.dp).navigationBarsPadding())
        }
    }
}

/** Local skeleton guide composable — avoids cross-feature dependency on live-session. */
@Composable
private fun WorkoutTargetPoseGuide(targetFrame: SkeletonFrame, modifier: Modifier = Modifier) {
    Canvas(modifier = modifier) {
        val w = size.width
        val h = size.height
        SKELETON_BONES.forEach { bone ->
            val from = targetFrame.joints[bone.from] ?: return@forEach
            val to = targetFrame.joints[bone.to] ?: return@forEach
            val fromOff = Offset(from.position.x * w, from.position.y * h)
            val toOff = Offset(to.position.x * w, to.position.y * h)
            drawLine(
                brush = Brush.linearGradient(
                    colors = listOf(SkeletonCyan.copy(alpha = 0.7f), SkeletonCyan.copy(alpha = 0.7f)),
                    start = fromOff, end = toOff,
                ),
                start = fromOff, end = toOff,
                strokeWidth = 2.5.dp.toPx(),
            )
        }
        SKELETON_BONES.flatMap { listOf(it.from, it.to) }.distinct().forEach { jointId ->
            val joint = targetFrame.joints[jointId] ?: return@forEach
            drawCircle(
                color = SkeletonCyan.copy(alpha = 0.7f),
                radius = 5.dp.toPx(),
                center = Offset(joint.position.x * w, joint.position.y * h),
            )
        }
    }
}
