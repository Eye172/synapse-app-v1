package com.synapse.core.ai.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class OpenAiRequest(
    val model: String = "gpt-4o-mini",
    val messages: List<ChatMessage>,
    @SerialName("max_tokens") val maxTokens: Int = 300,
    val temperature: Double = 0.7,
)

@Serializable
data class ChatMessage(
    val role: String,
    val content: String,
)

@Serializable
data class OpenAiResponse(
    val choices: List<Choice>,
) {
    val text: String get() = choices.firstOrNull()?.message?.content ?: ""
}

@Serializable
data class Choice(
    val message: ChatMessage,
)

data class CoachingRequest(
    val exerciseName: String,
    val qualityScore: Int,
    val symmetryScore: Int,
    val stabilityScore: Int,
    val riskScore: Int,
    val backAngleDeg: Float,
    val isFormAlert: Boolean,
    val errorDescriptions: List<String>,
)

data class CoachingResponse(
    val feedback: String,
    val isFromCache: Boolean = false,
    val isOfflineFallback: Boolean = false,
)
