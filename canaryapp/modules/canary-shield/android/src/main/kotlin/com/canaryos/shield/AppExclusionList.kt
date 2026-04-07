package com.canaryos.shield

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import org.json.JSONArray
import org.json.JSONException

/**
 * Manages the set of app package names excluded from scam classification.
 *
 * Combines a hardcoded default list of system/utility apps with user-configured
 * exclusions stored in SharedPreferences as a JSON string array.
 *
 * Lookups are O(1) via [HashSet]. Call [reload] when SharedPreferences change
 * to pick up new user exclusions.
 */
class AppExclusionList(private val context: Context) {

    companion object {
        private const val TAG = "AppExclusionList"
        private const val PREFS_NAME = "canary_shield_prefs"
        private const val KEY_EXCLUDED_APPS = "shield_excluded_apps"

        /** System and utility apps that should never trigger classification. */
        val DEFAULT_EXCLUDED: Set<String> = setOf(
            "com.android.launcher3",
            "com.google.android.apps.nexuslauncher",
            "com.android.systemui",
            "com.android.settings",
            "com.android.dialer",
            "com.google.android.dialer",
            "com.android.camera2",
            "com.google.android.camera",
            "com.canaryapp"
        )
    }

    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    @Volatile
    private var excludedSet: Set<String> = buildExclusionSet()

    /**
     * Check whether the given [packageName] is excluded from classification.
     * O(1) lookup.
     */
    fun isExcluded(packageName: String): Boolean {
        return excludedSet.contains(packageName)
    }

    /**
     * Re-read user exclusions from SharedPreferences and rebuild the merged set.
     * Call this when the user updates their exclusion preferences.
     */
    fun reload() {
        excludedSet = buildExclusionSet()
    }

    /**
     * Get the current full set of excluded packages (defaults + user).
     * Returns an immutable copy.
     */
    fun getExcludedPackages(): Set<String> {
        return excludedSet
    }

    private fun buildExclusionSet(): Set<String> {
        val merged = HashSet<String>(DEFAULT_EXCLUDED)
        val userExclusions = loadUserExclusions()
        merged.addAll(userExclusions)
        return merged.toSet()
    }

    private fun loadUserExclusions(): List<String> {
        val jsonString = prefs.getString(KEY_EXCLUDED_APPS, null)
            ?: return emptyList()

        return try {
            val jsonArray = JSONArray(jsonString)
            val result = mutableListOf<String>()
            for (i in 0 until jsonArray.length()) {
                val pkg = jsonArray.optString(i, "")
                if (pkg.isNotBlank()) {
                    result.add(pkg)
                }
            }
            result
        } catch (e: JSONException) {
            Log.e(TAG, "Failed to parse user exclusion list from SharedPreferences", e)
            emptyList()
        }
    }
}
