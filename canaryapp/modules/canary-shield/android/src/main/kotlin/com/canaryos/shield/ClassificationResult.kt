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
