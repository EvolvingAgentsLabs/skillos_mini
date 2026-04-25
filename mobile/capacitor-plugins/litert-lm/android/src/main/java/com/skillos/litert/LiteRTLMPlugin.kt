package com.skillos.litert

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.ai.edge.litertlm.GraphOptions
import com.google.ai.edge.litertlm.LlmInference
import com.google.ai.edge.litertlm.LlmInferenceOptions
import com.google.ai.edge.litertlm.LlmInferenceSession
import com.google.ai.edge.litertlm.LlmInferenceSession.LlmInferenceSessionOptions
import com.google.mediapipe.framework.image.BitmapImageBuilder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.util.concurrent.ConcurrentHashMap
import java.util.UUID

/**
 * LiteRT-LM Capacitor plugin (Android).
 *
 * Drives the on-device LLM runtime — text generation and (with Gemma 4
 * E2B/E4B) vision-conditioned generation. The TS bridge in
 * `mobile/src/lib/llm/local/litert_backend.ts` calls into this.
 *
 * Versioning notes:
 *  - LiteRT-LM 0.2.0 (April 2026) introduced `LlmInferenceSession` with
 *    `setEnableVisionModality` for multimodal Gemma 4. We use the session
 *    API uniformly (text + vision both go through it) rather than the
 *    legacy `LlmInference.generateResponseAsync(prompt, callback)` shape.
 *  - The MediaPipe Tasks Vision artifact provides `MPImage` /
 *    `BitmapImageBuilder` — the canonical Android wrapper for image inputs.
 */
@CapacitorPlugin(name = "LiteRTLM")
class LiteRTLMPlugin : Plugin() {

    /**
     * Per-handle session bundle. We track both the long-lived
     * `LlmInference` (model weights + KV cache scaffolding) and the
     * per-request `LlmInferenceSession` (the conversation surface). One
     * session per handle is fine for our flow — every generate() call
     * either reuses or rebuilds the session as needed.
     */
    private data class Session(
        val inference: LlmInference,
        val visionEnabled: Boolean,
        val maxNumImages: Int,
    )

    private val sessions = ConcurrentHashMap<String, Session>()
    private val activeSessions = ConcurrentHashMap<String, LlmInferenceSession>()
    private val activeJobs = ConcurrentHashMap<String, Job>()
    private val scope = CoroutineScope(Dispatchers.Default)

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val result = JSObject()
        result.put("available", true)
        call.resolve(result)
    }

    @PluginMethod
    fun initModel(call: PluginCall) {
        val modelPath = call.getString("modelPath") ?: run {
            call.reject("modelPath required")
            return
        }
        val enableVision = call.getBoolean("enableVision", false) ?: false
        val maxNumImages = call.getInt("maxNumImages", 4) ?: 4

        scope.launch {
            try {
                val builder = LlmInferenceOptions.builder()
                    .setModelPath(modelPath)
                if (enableVision) {
                    // The maxNumImages cap shapes the KV-cache budget at
                    // model load time, not per-session.
                    builder.setMaxNumImages(maxNumImages)
                }
                val options = builder.build()
                val inference = LlmInference.createFromOptions(context, options)
                val handle = UUID.randomUUID().toString()
                sessions[handle] = Session(
                    inference = inference,
                    visionEnabled = enableVision,
                    maxNumImages = maxNumImages,
                )
                val result = JSObject()
                result.put("handle", handle)
                result.put("supportsVision", enableVision)
                call.resolve(result)
            } catch (e: Throwable) {
                call.reject("initModel failed: ${e.message}", e)
            }
        }
    }

    @PluginMethod
    fun generate(call: PluginCall) {
        val handle = call.getString("handle") ?: run {
            call.reject("handle required")
            return
        }
        val prompt = call.getString("prompt") ?: run {
            call.reject("prompt required")
            return
        }
        val session = sessions[handle] ?: run {
            call.reject("unknown handle: $handle")
            return
        }
        val temperature = call.getFloat("temperature") ?: 0.7f
        val imagesArray = call.getArray("images")

        val job = scope.launch {
            var inferenceSession: LlmInferenceSession? = null
            try {
                inferenceSession = buildSession(session, temperature)
                activeSessions[handle] = inferenceSession

                // Decode + attach images BEFORE adding the prompt chunk.
                // Per LiteRT 0.2 docs, images must be added before the
                // query chunk when the session has vision enabled.
                if (session.visionEnabled && imagesArray != null && imagesArray.length() > 0) {
                    val cap = minOf(imagesArray.length(), session.maxNumImages)
                    for (i in 0 until cap) {
                        val b64 = imagesArray.getString(i) ?: continue
                        val bitmap = decodeBase64Bitmap(b64) ?: continue
                        try {
                            val mpImage = BitmapImageBuilder(bitmap).build()
                            inferenceSession.addImage(mpImage)
                        } finally {
                            // The MPImage owns the underlying buffer once
                            // built; recycle ours to free graphics memory
                            // promptly after the session has consumed it.
                            if (!bitmap.isRecycled) bitmap.recycle()
                        }
                    }
                }

                inferenceSession.addQueryChunk(prompt)

                val builder = StringBuilder()
                inferenceSession.generateResponseAsync { partialResult, done ->
                    if (partialResult != null) {
                        builder.append(partialResult)
                        val evt = JSObject()
                        evt.put("handle", handle)
                        evt.put("delta", partialResult)
                        notifyListeners("token", evt)
                    }
                    if (done) {
                        val evt = JSObject()
                        evt.put("handle", handle)
                        evt.put("text", builder.toString())
                        evt.put("finishReason", "stop")
                        notifyListeners("done", evt)
                    }
                }
                call.resolve()
            } catch (e: Throwable) {
                val evt = JSObject()
                evt.put("handle", handle)
                evt.put("message", e.message ?: "error")
                notifyListeners("error", evt)
                call.reject("generate failed: ${e.message}", e)
            } finally {
                activeJobs.remove(handle)
                activeSessions.remove(handle)
                try { inferenceSession?.close() } catch (_: Throwable) { }
            }
        }
        activeJobs[handle] = job
    }

    @PluginMethod
    fun cancel(call: PluginCall) {
        val handle = call.getString("handle") ?: run {
            call.resolve()
            return
        }
        activeJobs[handle]?.cancel()
        activeJobs.remove(handle)
        // Also tear down any in-flight session so we don't leak GPU/CPU
        // resources if the user cancels mid-generation.
        try { activeSessions[handle]?.close() } catch (_: Throwable) { }
        activeSessions.remove(handle)
        call.resolve()
    }

    @PluginMethod
    fun unloadModel(call: PluginCall) {
        val handle = call.getString("handle") ?: run {
            call.resolve()
            return
        }
        activeJobs[handle]?.cancel()
        activeJobs.remove(handle)
        try { activeSessions[handle]?.close() } catch (_: Throwable) { }
        activeSessions.remove(handle)
        val session = sessions.remove(handle)
        try {
            session?.inference?.close()
        } catch (_: Throwable) { }
        call.resolve()
    }

    override fun handleOnPause() {
        // Cancel any in-flight inference so we don't leak across lifecycle.
        activeJobs.values.forEach { it.cancel() }
        activeJobs.clear()
        activeSessions.values.forEach {
            try { it.close() } catch (_: Throwable) { }
        }
        activeSessions.clear()
        super.handleOnPause()
    }

    override fun handleOnDestroy() {
        scope.cancel()
        activeSessions.values.forEach {
            try { it.close() } catch (_: Throwable) { }
        }
        activeSessions.clear()
        sessions.values.forEach {
            try { it.inference.close() } catch (_: Throwable) { }
        }
        sessions.clear()
        super.handleOnDestroy()
    }

    /**
     * Build a fresh session for a generate() call.
     *
     * Vision-capable sessions are flagged via `GraphOptions.setEnableVisionModality(true)`.
     * For text-only models we still go through the session API to keep
     * cancellation semantics uniform — the cost is negligible.
     */
    private fun buildSession(session: Session, temperature: Float): LlmInferenceSession {
        val sessionOptionsBuilder = LlmInferenceSessionOptions.builder()
            .setTemperature(temperature)
            .setTopK(40)
        if (session.visionEnabled) {
            sessionOptionsBuilder.setGraphOptions(
                GraphOptions.builder().setEnableVisionModality(true).build(),
            )
        }
        return LlmInferenceSession.createFromOptions(
            session.inference,
            sessionOptionsBuilder.build(),
        )
    }

    /**
     * Decode a base64 string (no `data:` prefix) into a Bitmap. Returns
     * null on any decoding failure so the caller can skip the bad image
     * rather than abort the whole generation.
     */
    private fun decodeBase64Bitmap(b64: String): Bitmap? {
        return try {
            val bytes = Base64.decode(b64, Base64.DEFAULT)
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        } catch (_: Throwable) {
            null
        }
    }
}
