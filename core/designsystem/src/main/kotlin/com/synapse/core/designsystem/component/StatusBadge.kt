package com.synapse.core.designsystem.component

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.synapse.core.designsystem.Error
import com.synapse.core.designsystem.SkeletonCyan
import com.synapse.core.designsystem.Success

enum class DeviceStatus { Connected, Connecting, Disconnected }

@Composable
fun DeviceStatusBadge(status: DeviceStatus, modifier: Modifier = Modifier) {
    val (dotColor, label) = when (status) {
        DeviceStatus.Connected -> SkeletonCyan to "CONNECTED"
        DeviceStatus.Connecting -> Success.copy(alpha = 0.7f) to "CONNECTING…"
        DeviceStatus.Disconnected -> Error to "OFFLINE"
    }
    Row(
        modifier = modifier
            .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(20.dp))
            .border(1.dp, dotColor.copy(alpha = 0.3f), RoundedCornerShape(20.dp))
            .padding(horizontal = 10.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(6.dp)
                .background(dotColor, CircleShape)
        )
        Spacer(Modifier.width(6.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = dotColor,
        )
    }
}

@Composable
fun ScoreBadge(
    score: Int,
    modifier: Modifier = Modifier,
) {
    val color = when {
        score >= 80 -> SkeletonCyan
        score >= 60 -> Success
        score >= 40 -> Color(0xFFFFB800)
        else -> Error
    }
    Text(
        text = "$score",
        style = MaterialTheme.typography.headlineSmall,
        color = color,
        modifier = modifier,
    )
}
