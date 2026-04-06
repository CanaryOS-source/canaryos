package com.canaryos.shield

import android.content.Context
import android.util.Log
import java.io.BufferedReader
import java.io.InputStreamReader
import java.text.Normalizer

/**
 * WordPiece tokenizer that produces identical output to the JS TextTokenizer.ts.
 *
 * Pipeline: text -> lowercase -> NFC normalization -> homoglyph replacement ->
 * whitespace normalization -> whitespace+punctuation split -> WordPiece -> token IDs
 *
 * Special tokens: [CLS]=101, [SEP]=102, [PAD]=0, [UNK]=100
 */
class BertTokenizer private constructor(
    private val vocab: Map<String, Int>
) {
    val vocabSize: Int get() = vocab.size

    companion object {
        private const val TAG = "BertTokenizer"

        const val PAD_ID = 0
        const val UNK_ID = 100
        const val CLS_ID = 101
        const val SEP_ID = 102

        private const val CLS_TOKEN = "[CLS]"
        private const val SEP_TOKEN = "[SEP]"
        private const val UNK_TOKEN = "[UNK]"

        // Homoglyph mappings matching JS TextTokenizer.ts exactly
        private val HOMOGLYPH_MAP = mapOf(
            // Cyrillic homoglyphs
            '\u0430' to 'a', // а -> a
            '\u0435' to 'e', // е -> e
            '\u043E' to 'o', // о -> o
            '\u0440' to 'p', // р -> p
            '\u0441' to 'c', // с -> c
            '\u0443' to 'y', // у -> y
            '\u0445' to 'x', // х -> x
            '\u0455' to 's', // ѕ -> s
            '\u0456' to 'i', // і -> i
            '\u0458' to 'j', // ј -> j
            '\u0501' to 'd', // ԁ -> d
            '\u04BB' to 'h', // һ -> h
            '\u051D' to 'w', // ԝ -> w
            '\u028F' to 'y', // ʏ -> y
            // Greek homoglyphs
            '\u03B1' to 'a', // α -> a
            '\u03BF' to 'o', // ο -> o
            '\u03C1' to 'p', // ρ -> p
            '\u03C4' to 't', // τ -> t
            '\u03BD' to 'v', // ν -> v
        )

        // Zero-width characters to remove (matching JS)
        private val ZERO_WIDTH_CHARS = charArrayOf(
            '\u200B', // zero-width space
            '\u200C', // zero-width non-joiner
            '\u200D', // zero-width joiner
            '\uFEFF', // BOM / zero-width no-break space
        )

        // Punctuation characters matching JS whitespaceTokenize regex
        private val PUNCTUATION_CHARS = setOf(
            '.', ',', '!', '?', ';', ':', '\'', '"',
            '(', ')', '[', ']', '{', '}', '<', '>',
            '@', '#', '$', '%', '^', '&', '*', '+',
            '=', '-', '_', '/', '\\', '|', '`', '~'
        )

        /**
         * Load tokenizer from vocab.txt in Android assets.
         * Returns null if loading fails.
         */
        fun fromAssets(context: Context, vocabFileName: String = "vocab.txt"): BertTokenizer? {
            return try {
                val vocab = mutableMapOf<String, Int>()
                val reader = BufferedReader(
                    InputStreamReader(context.assets.open(vocabFileName), Charsets.UTF_8)
                )
                reader.useLines { lines ->
                    lines.forEachIndexed { index, line ->
                        val token = line.trim()
                        if (token.isNotEmpty()) {
                            vocab[token] = index
                        }
                    }
                }
                Log.d(TAG, "Loaded vocabulary with ${vocab.size} tokens")
                BertTokenizer(vocab)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to load vocabulary from $vocabFileName", e)
                null
            }
        }

        /**
         * Load tokenizer from a pre-built vocab map (for testing).
         */
        fun fromVocabMap(vocab: Map<String, Int>): BertTokenizer {
            return BertTokenizer(vocab)
        }
    }

    /**
     * Tokenize text and return padded/truncated token IDs + attention mask.
     *
     * @param text Input text to tokenize
     * @param maxLength Maximum sequence length including [CLS] and [SEP] (default 128)
     * @return TokenizedInput with inputIds and attentionMask arrays of length maxLength
     */
    fun tokenize(text: String, maxLength: Int = 128): TokenizedInput {
        val normalized = normalizeForTokenization(text)
        val words = whitespaceTokenize(normalized)

        val tokens = mutableListOf(CLS_TOKEN)
        for (word in words) {
            tokens.addAll(wordPieceTokenize(word))
        }
        tokens.add(SEP_TOKEN)

        // Truncate if necessary: keep [CLS] at start, replace last with [SEP]
        val truncated = if (tokens.size > maxLength) {
            tokens.subList(0, maxLength - 1).toMutableList().also {
                it.add(SEP_TOKEN)
            }
        } else {
            tokens
        }

        // Convert to IDs
        val ids = truncated.map { token ->
            vocab[token] ?: UNK_ID
        }

        // Build padded arrays
        val inputIds = IntArray(maxLength)
        val attentionMask = IntArray(maxLength)

        for (i in ids.indices) {
            inputIds[i] = ids[i]
            attentionMask[i] = 1
        }
        // Remaining positions stay 0 (PAD_ID and 0 attention)

        return TokenizedInput(
            inputIds = inputIds,
            attentionMask = attentionMask,
            tokenCount = truncated.size
        )
    }

    /**
     * Normalize text to match JS TextTokenizer.normalizeForTokenization exactly.
     * Lowercase -> NFC -> homoglyph replacement -> zero-width removal -> whitespace collapse
     */
    internal fun normalizeForTokenization(text: String): String {
        // Lowercase (MobileBERT uncased model)
        var result = text.lowercase()

        // Unicode NFC normalization
        result = Normalizer.normalize(result, Normalizer.Form.NFC)

        // Replace homoglyphs
        val sb = StringBuilder(result.length)
        for (ch in result) {
            val replacement = HOMOGLYPH_MAP[ch]
            if (replacement != null) {
                sb.append(replacement)
            } else if (ch in ZERO_WIDTH_CHARS) {
                // Remove zero-width characters (append nothing)
            } else {
                sb.append(ch)
            }
        }
        result = sb.toString()

        // Normalize whitespace: collapse runs of whitespace to single space, trim
        result = result.replace(Regex("\\s+"), " ").trim()

        return result
    }

    /**
     * Split text on whitespace, then separate punctuation from words.
     * Matches JS whitespaceTokenize behavior exactly.
     */
    internal fun whitespaceTokenize(text: String): List<String> {
        val tokens = mutableListOf<String>()
        val words = text.split(Regex("\\s+"))

        for (word in words) {
            if (word.isEmpty()) continue

            var current = StringBuilder()
            for (char in word) {
                if (char in PUNCTUATION_CHARS) {
                    if (current.isNotEmpty()) {
                        tokens.add(current.toString())
                        current = StringBuilder()
                    }
                    tokens.add(char.toString())
                } else {
                    current.append(char)
                }
            }
            if (current.isNotEmpty()) {
                tokens.add(current.toString())
            }
        }

        return tokens
    }

    /**
     * WordPiece tokenization: break unknown words into subword units using ## prefix.
     * Matches JS wordPieceTokenize behavior exactly.
     */
    internal fun wordPieceTokenize(word: String): List<String> {
        // Check if whole word is in vocabulary
        if (vocab.containsKey(word)) {
            return listOf(word)
        }

        val tokens = mutableListOf<String>()
        var start = 0

        while (start < word.length) {
            var end = word.length
            var foundSubword = false

            // Try to find longest matching subword
            while (start < end) {
                var substr = word.substring(start, end)

                // Add ## prefix for continuation subwords
                if (start > 0) {
                    substr = "##$substr"
                }

                if (vocab.containsKey(substr)) {
                    tokens.add(substr)
                    foundSubword = true
                    start = end
                    break
                }

                end -= 1
            }

            // If no subword found, mark as unknown and advance
            if (!foundSubword) {
                // Only add [UNK] once per unknown character sequence (matching JS)
                if (tokens.isEmpty() || tokens.last() != UNK_TOKEN) {
                    tokens.add(UNK_TOKEN)
                }
                start += 1
            }
        }

        return tokens
    }

    /**
     * Detect potential homoglyph attacks in text.
     * Returns true if Cyrillic/Greek characters are mixed with Latin, or zero-width chars present.
     */
    fun detectHomoglyphs(text: String): Boolean {
        var hasCyrillic = false
        var hasGreek = false
        var hasLatin = false
        var hasZeroWidth = false

        for (ch in text) {
            when {
                ch in '\u0400'..'\u04FF' -> hasCyrillic = true
                ch in '\u0370'..'\u03FF' -> hasGreek = true
                ch in 'a'..'z' || ch in 'A'..'Z' -> hasLatin = true
                ch in ZERO_WIDTH_CHARS -> hasZeroWidth = true
            }
        }

        return ((hasCyrillic || hasGreek) && hasLatin) || hasZeroWidth
    }
}

/**
 * Result of tokenizing a text input for model inference.
 *
 * @property inputIds Token ID array of length maxLength, padded with 0s
 * @property attentionMask Mask array: 1 for real tokens, 0 for padding
 * @property tokenCount Number of actual tokens (including [CLS] and [SEP])
 */
data class TokenizedInput(
    val inputIds: IntArray,
    val attentionMask: IntArray,
    val tokenCount: Int
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is TokenizedInput) return false
        return inputIds.contentEquals(other.inputIds) &&
            attentionMask.contentEquals(other.attentionMask) &&
            tokenCount == other.tokenCount
    }

    override fun hashCode(): Int {
        var result = inputIds.contentHashCode()
        result = 31 * result + attentionMask.contentHashCode()
        result = 31 * result + tokenCount
        return result
    }
}
