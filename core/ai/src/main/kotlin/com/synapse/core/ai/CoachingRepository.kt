package com.synapse.core.ai

import android.util.Log
import com.synapse.core.ai.model.ChatMessage
import com.synapse.core.ai.model.CoachingRequest
import com.synapse.core.ai.model.CoachingResponse
import com.synapse.core.ai.model.OpenAiRequest
import com.synapse.core.ai.model.OpenAiResponse
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "CoachingRepository"

@Singleton
class CoachingRepository @Inject constructor(
    private val okHttpClient: OkHttpClient,
    private val json: Json,
) {
    private val cache = LinkedHashMap<String, CoachingResponse>(16, 0.75f, true)

    suspend fun getCoachingFeedback(
        request: CoachingRequest,
        apiKey: String,
    ): CoachingResponse = withContext(Dispatchers.IO) {
        val cacheKey = buildCacheKey(request)
        cache[cacheKey]?.let { return@withContext it.copy(isFromCache = true) }

        try {
            val prompt = buildPrompt(request)
            val aiRequest = OpenAiRequest(
                messages = listOf(
                    ChatMessage("system", SYSTEM_PROMPT),
                    ChatMessage("user", prompt),
                ),
            )
            val body = json.encodeToString(aiRequest)
                .toRequestBody("application/json".toMediaType())

            val httpRequest = Request.Builder()
                .url("https://api.openai.com/v1/chat/completions")
                .addHeader("Authorization", "Bearer $apiKey")
                .addHeader("Content-Type", "application/json")
                .post(body)
                .build()

            val response = okHttpClient.newCall(httpRequest).execute()
            if (response.isSuccessful) {
                val responseBody = response.body?.string() ?: ""
                val aiResponse = json.decodeFromString<OpenAiResponse>(responseBody)
                val coaching = CoachingResponse(feedback = aiResponse.text)
                cache[cacheKey] = coaching
                coaching
            } else {
                Log.w(TAG, "AI API error ${response.code}: ${response.message}")
                offlineFallback(request)
            }
        } catch (e: Exception) {
            Log.e(TAG, "AI request failed", e)
            offlineFallback(request)
        }
    }

    private fun buildCacheKey(req: CoachingRequest): String =
        "${req.exerciseName}_${req.qualityScore / 10}_${req.isFormAlert}"

    private fun buildPrompt(req: CoachingRequest): String = buildString {
        appendLine("Exercise: ${req.exerciseName}")
        appendLine("Quality: ${req.qualityScore}/100 | Symmetry: ${req.symmetryScore}/100")
        appendLine("Stability: ${req.stabilityScore}/100 | Risk: ${req.riskScore}/100")
        appendLine("Back angle: ${req.backAngleDeg}°")
        if (req.isFormAlert) appendLine("⚠️ Form alert triggered by sensor.")
        if (req.errorDescriptions.isNotEmpty()) {
            appendLine("Detected issues:")
            req.errorDescriptions.forEach { appendLine("- $it") }
        }
        appendLine("Give 2-3 sentence coaching feedback. Be specific, encouraging, safety-focused.")
    }

    private fun offlineFallback(req: CoachingRequest) = CoachingResponse(
        feedback = when {
            req.riskScore > 70 -> "Stop and reset your position. Your back alignment needs correction before continuing."
            req.qualityScore < 50 -> "Focus on maintaining proper form. Slow down and concentrate on alignment."
            req.qualityScore < 75 -> "Good effort on ${req.exerciseName}. Minor adjustments will improve your score."
            else -> "Excellent form on ${req.exerciseName}. Keep up the consistent technique."
        },
        isOfflineFallback = true,
    )

    private companion object {
        const val SYSTEM_PROMPT = """You are Synapse AI Coach, an expert biomechanics and sports science coach.
Analyze the athlete's movement data and provide precise, professional feedback.
Be concise (2-3 sentences max), safety-focused, and encouraging.
Reference specific body positions when possible."""
    }
}
