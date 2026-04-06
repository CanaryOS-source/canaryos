package com.canaryos.shield

import android.content.Context
import android.os.SystemClock
import android.util.Log
import org.tensorflow.lite.Interpreter
import java.io.FileInputStream
import java.nio.MappedByteBuffer
import java.nio.channels.FileChannel

/**
 * Native TFLite scam classifier for on-device inference.
 *
 * Loads the .tflite model and vocab.txt from Android assets,
 * tokenizes input text using BertTokenizer (WordPiece), and runs
 * inference through a MobileBERT-based binary classifier.
 *
 * Model input:  [1, 128] inputIds + [1, 128] attentionMask
 * Model output: [1, 2] logits (safe, scam)
 *
 * Initialization is lazy: model and tokenizer load on first classify() call.
 */
class ScamClassifier(private val context: Context) {

    companion object {
        private const val TAG = "ScamClassifier"
        private const val MODEL_FILE = "mobilebert_scam_intent.tflite"
        private const val VOCAB_FILE = "vocab.txt"
        private const val NUM_THREADS = 2
        private const val MAX_SEQ_LENGTH = 128
    }

    private var interpreter: Interpreter? = null
    private var tokenizer: BertTokenizer? = null

    @Volatile
    private var isInitialized = false
    private var initError: String? = null

    /**
     * Lazy initialization of model and tokenizer.
     * Called automatically on first classify(). Safe to call multiple times.
     */
    @Synchronized
    private fun ensureInitialized() {
        if (isInitialized) return

        try {
            // Load tokenizer
            tokenizer = BertTokenizer.fromAssets(context, VOCAB_FILE)
            if (tokenizer == null) {
                initError = "Failed to load vocabulary from $VOCAB_FILE"
                Log.e(TAG, initError!!)
                return
            }
            Log.d(TAG, "Tokenizer loaded: ${tokenizer!!.vocabSize} tokens")

            // Load TFLite model
            val modelBuffer = loadModelFile(MODEL_FILE)
            val options = Interpreter.Options().apply {
                setNumThreads(NUM_THREADS)
            }
            interpreter = Interpreter(modelBuffer, options)
            Log.d(TAG, "TFLite model loaded: $MODEL_FILE")

            isInitialized = true
            initError = null
        } catch (e: Exception) {
            initError = "Initialization failed: ${e.message}"
            Log.e(TAG, initError!!, e)
            // Clean up partial init
            interpreter?.close()
            interpreter = null
            tokenizer = null
        }
    }

    /**
     * Load a TFLite model from assets as a memory-mapped buffer.
     * Memory mapping reduces RAM usage since the OS can page data in/out.
     */
    private fun loadModelFile(fileName: String): MappedByteBuffer {
        val fileDescriptor = context.assets.openFd(fileName)
        val inputStream = FileInputStream(fileDescriptor.fileDescriptor)
        val channel = inputStream.channel
        val startOffset = fileDescriptor.startOffset
        val declaredLength = fileDescriptor.declaredLength
        return channel.map(FileChannel.MapMode.READ_ONLY, startOffset, declaredLength)
    }

    /**
     * Classify text for scam content.
     *
     * Returns a safe verdict (isScam=false, confidence=0) if the model
     * is not loaded or inference fails, to avoid false positives.
     *
     * @param text Input text to classify
     * @return ClassificationResult with verdict, confidence, and latency
     */
    fun classify(text: String): ClassificationResult {
        val startTimeNs = SystemClock.elapsedRealtimeNanos()

        ensureInitialized()

        val currentInterpreter = interpreter
        val currentTokenizer = tokenizer

        if (currentInterpreter == null || currentTokenizer == null) {
            Log.w(TAG, "Classifier not initialized, returning safe verdict. Error: $initError")
            val latencyMs = (SystemClock.elapsedRealtimeNanos() - startTimeNs) / 1_000_000.0
            return ClassificationResult(
                isScam = false,
                confidence = 0f,
                latencyMs = latencyMs
            )
        }

        return try {
            // Tokenize
            val tokenized = currentTokenizer.tokenize(text, MAX_SEQ_LENGTH)

            // Prepare input tensors: [1, 128] for both inputIds and attentionMask
            val inputIds = Array(1) { tokenized.inputIds }
            val attentionMask = Array(1) { tokenized.attentionMask }

            // Prepare output tensor: [1, 2] logits
            val output = Array(1) { FloatArray(2) }

            // Run inference with multiple inputs
            currentInterpreter.runForMultipleInputsOutputs(
                arrayOf(inputIds, attentionMask),
                mapOf(0 to output)
            )

            // Apply softmax to convert logits to probabilities
            val scores = softmax(output[0])
            val latencyMs = (SystemClock.elapsedRealtimeNanos() - startTimeNs) / 1_000_000.0

            Log.d(TAG, "Inference complete: safe=${scores[0]}, scam=${scores[1]}, latency=${latencyMs}ms")

            ClassificationResult(
                isScam = scores[1] > 0.5f,
                confidence = scores[1],
                latencyMs = latencyMs
            )
        } catch (e: Exception) {
            Log.e(TAG, "Inference failed", e)
            val latencyMs = (SystemClock.elapsedRealtimeNanos() - startTimeNs) / 1_000_000.0
            ClassificationResult(
                isScam = false,
                confidence = 0f,
                latencyMs = latencyMs
            )
        }
    }

    /**
     * Get the current status of model and vocabulary loading.
     */
    fun getStatus(): ServiceStatus {
        return ServiceStatus(
            modelLoaded = interpreter != null,
            vocabLoaded = tokenizer != null
        )
    }

    /**
     * Release native resources. Call when the classifier is no longer needed.
     */
    fun close() {
        interpreter?.close()
        interpreter = null
        tokenizer = null
        isInitialized = false
    }

    /**
     * Softmax function: convert logits to probability distribution.
     */
    private fun softmax(logits: FloatArray): FloatArray {
        val maxLogit = logits.max()
        val exps = FloatArray(logits.size) { i ->
            Math.exp((logits[i] - maxLogit).toDouble()).toFloat()
        }
        val sumExps = exps.sum()
        return FloatArray(exps.size) { i -> exps[i] / sumExps }
    }
}
