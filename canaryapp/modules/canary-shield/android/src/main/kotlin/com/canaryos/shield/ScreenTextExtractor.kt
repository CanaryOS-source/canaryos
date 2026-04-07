package com.canaryos.shield

import android.view.accessibility.AccessibilityNodeInfo

/**
 * Extracts visible text from the accessibility node tree via recursive traversal.
 *
 * Collects both [AccessibilityNodeInfo.getText] and
 * [AccessibilityNodeInfo.getContentDescription] from every visible, non-password
 * node. Limits depth to [MAX_DEPTH] and total text length to [MAX_TEXT_LENGTH]
 * to prevent runaway traversal on malformed trees.
 *
 * Every [AccessibilityNodeInfo] obtained via [AccessibilityNodeInfo.getChild]
 * is recycled in a finally block to prevent memory leaks.
 */
object ScreenTextExtractor {

    private const val MAX_DEPTH = 30
    private const val MAX_TEXT_LENGTH = 4096

    /**
     * Extract all visible text from the accessibility node tree rooted at [rootNode].
     *
     * The caller retains ownership of [rootNode] -- this method does NOT recycle it.
     * All child nodes obtained during traversal ARE recycled before returning.
     *
     * @param rootNode Root of the accessibility node tree (typically from rootInActiveWindow)
     * @return Concatenated text from all visible nodes, space-separated, trimmed
     */
    fun extractText(rootNode: AccessibilityNodeInfo?): String {
        if (rootNode == null) return ""
        val builder = StringBuilder()
        traverseNode(rootNode, builder, 0)
        return builder.toString().trim()
    }

    private fun traverseNode(
        node: AccessibilityNodeInfo,
        builder: StringBuilder,
        depth: Int
    ) {
        if (depth > MAX_DEPTH) return
        if (builder.length >= MAX_TEXT_LENGTH) return

        // Skip invisible nodes
        if (!node.isVisibleToUser) return

        // Skip password fields to avoid capturing sensitive input
        if (node.isPassword) return

        // Collect text content
        node.text?.let { text ->
            if (text.isNotBlank() && builder.length < MAX_TEXT_LENGTH) {
                val remaining = MAX_TEXT_LENGTH - builder.length
                if (text.length <= remaining) {
                    builder.append(text).append(' ')
                } else {
                    builder.append(text, 0, remaining)
                }
            }
        }

        // Collect content description (accessibility labels, image alt text)
        node.contentDescription?.let { desc ->
            if (desc.isNotBlank() && builder.length < MAX_TEXT_LENGTH) {
                val remaining = MAX_TEXT_LENGTH - builder.length
                if (desc.length <= remaining) {
                    builder.append(desc).append(' ')
                } else {
                    builder.append(desc, 0, remaining)
                }
            }
        }

        // Recurse into children, recycling each child in a finally block
        for (i in 0 until node.childCount) {
            if (builder.length >= MAX_TEXT_LENGTH) break

            var child: AccessibilityNodeInfo? = null
            try {
                child = node.getChild(i) ?: continue
                traverseNode(child, builder, depth + 1)
            } finally {
                child?.recycle()
            }
        }
    }
}
