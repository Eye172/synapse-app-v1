package com.synapse.feature.livesession.presentation.component

import androidx.camera.view.PreviewView
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.viewinterop.AndroidView
import com.synapse.core.camera.CameraManager

@Composable
fun CameraPreviewView(
    cameraManager: CameraManager,
    useFrontCamera: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val lifecycleOwner = LocalLifecycleOwner.current

    AndroidView(
        factory = { context ->
            PreviewView(context).apply {
                scaleType = PreviewView.ScaleType.FILL_CENTER
                cameraManager.bindCamera(lifecycleOwner, this, useFrontCamera)
            }
        },
        update = { previewView ->
            // Rebind whenever useFrontCamera changes
            cameraManager.bindCamera(lifecycleOwner, previewView, useFrontCamera)
        },
        modifier = modifier,
    )
}
