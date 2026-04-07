package com.canaryos.shield

import android.content.Context
import android.view.accessibility.AccessibilityEvent
import androidx.test.core.app.ApplicationProvider
import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.util.concurrent.CountDownLatch
import java.util.concurrent.atomic.AtomicInteger

// ---------------------------------------------------------------------------
// ContentChangeDetector Tests (pure JVM, no Android dependencies)
// ---------------------------------------------------------------------------

class ContentChangeDetectorTest {

    private lateinit var detector: ContentChangeDetector

    @Before
    fun setUp() {
        // Use very short cooldowns for fast tests
        detector = ContentChangeDetector(
            windowStateCooldownMs = 50,
            contentChangeCooldownMs = 100
        )
    }

    @Test
    fun `short text is rejected`() {
        val shortText = "Hello world" // 11 chars, below 20 threshold
        assertFalse(
            detector.hasSignificantChange(shortText, AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED)
        )
    }

    @Test
    fun `exactly 19 chars is rejected`() {
        val text = "a".repeat(19)
        assertFalse(
            detector.hasSignificantChange(text, AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED)
        )
    }

    @Test
    fun `exactly 20 chars is accepted`() {
        val text = "a".repeat(20)
        assertTrue(
            detector.hasSignificantChange(text, AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED)
        )
    }

    @Test
    fun `first submission of valid text returns true`() {
        val text = "This is a scam message that needs classification now"
        assertTrue(
            detector.hasSignificantChange(text, AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED)
        )
    }

    @Test
    fun `duplicate content returns false`() {
        val text = "This is a scam message that needs classification now"
        assertTrue(
            detector.hasSignificantChange(text, AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED)
        )
        // Same content again -- should be rejected (in ring buffer)
        assertFalse(
            detector.hasSignificantChange(text, AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED)
        )
    }

    @Test
    fun `different content after cooldown returns true`() {
        val text1 = "First screen content that is long enough"
        val text2 = "Second screen content that is different"

        assertTrue(
            detector.hasSignificantChange(text1, AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED)
        )

        // Wait for cooldown to expire
        Thread.sleep(60)

        assertTrue(
            detector.hasSignificantChange(text2, AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED)
        )
    }

    @Test
    fun `different content within cooldown is rejected`() {
        val text1 = "First screen content that is long enough"
        val text2 = "Second screen content that is different"

        assertTrue(
            detector.hasSignificantChange(text1, AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED)
        )

        // No wait -- should be within cooldown
        assertFalse(
            detector.hasSignificantChange(text2, AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED)
        )
    }

    @Test
    fun `content change cooldown is longer than window state cooldown`() {
        val text1 = "First screen content that is long enough for test"
        val text2 = "Second screen content that is long enough for test"

        // Submit with WINDOW_STATE type
        assertTrue(
            detector.hasSignificantChange(text1, AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED)
        )

        // Wait past window state cooldown (50ms) but within content change cooldown (100ms)
        Thread.sleep(60)

        // WINDOW_STATE should work (past 50ms cooldown)
        assertTrue(
            detector.hasSignificantChange(text2, AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED)
        )
    }

    @Test
    fun `content change event respects longer cooldown`() {
        val text1 = "First screen content that is long enough for test"
        val text2 = "Second screen content different enough for test"

        assertTrue(
            detector.hasSignificantChange(text1, AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED)
        )

        // Wait past window state cooldown but within content change cooldown
        Thread.sleep(60)

        // CONTENT_CHANGED should be rejected (100ms cooldown not elapsed)
        assertFalse(
            detector.hasSignificantChange(text2, AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED)
        )
    }

    @Test
    fun `ring buffer catches back-and-forth navigation`() {
        val pageA = "Page A content that is long enough to pass"
        val pageB = "Page B content that is long enough to pass"

        // Visit page A
        assertTrue(
            detector.hasSignificantChange(pageA, AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED)
        )
        Thread.sleep(60)

        // Visit page B
        assertTrue(
            detector.hasSignificantChange(pageB, AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED)
        )
        Thread.sleep(60)

        // Go back to page A -- hash is still in ring buffer, so rejected
        assertFalse(
            detector.hasSignificantChange(pageA, AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED)
        )
    }

    @Test
    fun `ring buffer evicts old entries after filling`() {
        // Create detector with ring buffer size of 3
        val smallDetector = ContentChangeDetector(
            windowStateCooldownMs = 10,
            contentChangeCooldownMs = 10,
            ringBufferSize = 3
        )

        val pages = (1..4).map { "Page $it content that is sufficiently long for the test" }

        // Fill the ring buffer with 3 pages
        for (page in pages.take(3)) {
            assertTrue(smallDetector.hasSignificantChange(page, AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED))
            Thread.sleep(15)
        }

        // Page 1 should have been evicted from the ring buffer (size 3, wrote indices 0,1,2)
        // Now index wraps to 0, so pages[0] hash was overwritten by pages[3] next:
        assertTrue(
            smallDetector.hasSignificantChange(pages[3], AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED)
        )
        Thread.sleep(15)

        // Page 1 hash should now be evicted (overwritten at index 0 by page 4)
        assertTrue(
            smallDetector.hasSignificantChange(pages[0], AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED)
        )
    }

    @Test
    fun `reset clears all state`() {
        val text = "Some content that is long enough for classification"
        assertTrue(
            detector.hasSignificantChange(text, AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED)
        )

        detector.reset()

        // Same content should be accepted again after reset
        assertTrue(
            detector.hasSignificantChange(text, AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED)
        )
    }

    @Test
    fun `thread safety under concurrent access`() {
        val concurrentDetector = ContentChangeDetector(
            windowStateCooldownMs = 0,
            contentChangeCooldownMs = 0
        )
        val threadCount = 10
        val latch = CountDownLatch(threadCount)
        val acceptedCount = AtomicInteger(0)

        // All threads submit the same text -- only one should be accepted
        val text = "Identical content submitted by multiple threads concurrently"

        val threads = (1..threadCount).map { i ->
            Thread {
                try {
                    // Small stagger to increase contention window
                    if (i % 2 == 0) Thread.sleep(1)
                    val accepted = concurrentDetector.hasSignificantChange(
                        text,
                        AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
                    )
                    if (accepted) acceptedCount.incrementAndGet()
                } finally {
                    latch.countDown()
                }
            }
        }

        threads.forEach { it.start() }
        latch.await()

        // Exactly one thread should have been accepted (the first to acquire the lock)
        assertEquals("Only one thread should accept identical content", 1, acceptedCount.get())
    }
}

// ---------------------------------------------------------------------------
// AppExclusionList Tests (requires Robolectric for Context/SharedPreferences)
// ---------------------------------------------------------------------------

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class AppExclusionListTest {

    private lateinit var context: Context
    private lateinit var exclusionList: AppExclusionList

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        // Clear any existing prefs
        context.getSharedPreferences("canary_shield_prefs", Context.MODE_PRIVATE)
            .edit()
            .clear()
            .commit()
        exclusionList = AppExclusionList(context)
    }

    @Test
    fun `default packages are excluded`() {
        for (pkg in AppExclusionList.DEFAULT_EXCLUDED) {
            assertTrue("Expected $pkg to be excluded", exclusionList.isExcluded(pkg))
        }
    }

    @Test
    fun `launcher is excluded`() {
        assertTrue(exclusionList.isExcluded("com.android.launcher3"))
        assertTrue(exclusionList.isExcluded("com.google.android.apps.nexuslauncher"))
    }

    @Test
    fun `canaryapp is excluded`() {
        assertTrue(exclusionList.isExcluded("com.canaryapp"))
    }

    @Test
    fun `unknown package is not excluded`() {
        assertFalse(exclusionList.isExcluded("com.suspicious.scam.app"))
    }

    @Test
    fun `user exclusions from SharedPreferences are loaded`() {
        val userExclusions = JSONArray(listOf("com.custom.app1", "com.custom.app2"))
        context.getSharedPreferences("canary_shield_prefs", Context.MODE_PRIVATE)
            .edit()
            .putString("shield_excluded_apps", userExclusions.toString())
            .commit()

        // Need to reload to pick up new prefs
        exclusionList.reload()

        assertTrue(exclusionList.isExcluded("com.custom.app1"))
        assertTrue(exclusionList.isExcluded("com.custom.app2"))
        // Defaults still present
        assertTrue(exclusionList.isExcluded("com.android.systemui"))
    }

    @Test
    fun `reload picks up new values`() {
        assertFalse(exclusionList.isExcluded("com.new.app"))

        val userExclusions = JSONArray(listOf("com.new.app"))
        context.getSharedPreferences("canary_shield_prefs", Context.MODE_PRIVATE)
            .edit()
            .putString("shield_excluded_apps", userExclusions.toString())
            .commit()

        // Before reload -- still not excluded
        assertFalse(exclusionList.isExcluded("com.new.app"))

        exclusionList.reload()

        assertTrue(exclusionList.isExcluded("com.new.app"))
    }

    @Test
    fun `malformed JSON in SharedPreferences is handled gracefully`() {
        context.getSharedPreferences("canary_shield_prefs", Context.MODE_PRIVATE)
            .edit()
            .putString("shield_excluded_apps", "not valid json [[[")
            .commit()

        exclusionList.reload()

        // Should still have defaults, no crash
        assertTrue(exclusionList.isExcluded("com.android.systemui"))
        assertFalse(exclusionList.isExcluded("com.should.not.exist"))
    }

    @Test
    fun `empty JSON array in SharedPreferences is handled`() {
        context.getSharedPreferences("canary_shield_prefs", Context.MODE_PRIVATE)
            .edit()
            .putString("shield_excluded_apps", "[]")
            .commit()

        exclusionList.reload()

        // Only defaults present
        assertEquals(AppExclusionList.DEFAULT_EXCLUDED.size, exclusionList.getExcludedPackages().size)
    }

    @Test
    fun `blank entries in JSON array are ignored`() {
        val userExclusions = JSONArray(listOf("com.valid.app", "", "  ", "com.also.valid"))
        context.getSharedPreferences("canary_shield_prefs", Context.MODE_PRIVATE)
            .edit()
            .putString("shield_excluded_apps", userExclusions.toString())
            .commit()

        exclusionList.reload()

        assertTrue(exclusionList.isExcluded("com.valid.app"))
        assertTrue(exclusionList.isExcluded("com.also.valid"))
        assertFalse(exclusionList.isExcluded(""))
    }

    @Test
    fun `getExcludedPackages returns merged defaults and user additions`() {
        val userExclusions = JSONArray(listOf("com.user.app"))
        context.getSharedPreferences("canary_shield_prefs", Context.MODE_PRIVATE)
            .edit()
            .putString("shield_excluded_apps", userExclusions.toString())
            .commit()

        exclusionList.reload()

        val all = exclusionList.getExcludedPackages()
        assertEquals(AppExclusionList.DEFAULT_EXCLUDED.size + 1, all.size)
        assertTrue(all.contains("com.user.app"))
        assertTrue(all.containsAll(AppExclusionList.DEFAULT_EXCLUDED))
    }
}
