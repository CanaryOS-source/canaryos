package com.canaryos.shield

/**
 * Result of running the scam classification pipeline on input text.
 *
 * @property isScam Whether the text was classified as a scam
 * @property confidence Probability score for the scam class (0.0 to 1.0)
 * @property latencyMs Total pipeline latency in milliseconds (tokenization + inference)
 */
data class ClassificationResult(
    val isScam: Boolean,
    val confidence: Float,
    val latencyMs: Double
)

/**
 * Status of the native classifier components.
 *
 * @property modelLoaded Whether the TFLite model file is loaded and the interpreter is ready
 * @property vocabLoaded Whether vocab.txt has been parsed into the tokenizer vocabulary
 */
data class ServiceStatus(
    val modelLoaded: Boolean,
    val vocabLoaded: Boolean
)

/**
 * A single scam detection event for stats and bridge retrieval.
 *
 * @property timestamp Epoch millis when the detection occurred
 * @property appPackage Package name of the app where scam content was found
 * @property confidence Model confidence score (0.0 to 1.0)
 * @property snippetPreview First 100 characters of the classified text
 */
data class DetectionEntry(
    val timestamp: Long,
    val appPackage: String,
    val confidence: Float,
    val snippetPreview: String
)
