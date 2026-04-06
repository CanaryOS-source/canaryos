/**
 * Expo config plugin for canary-shield module.
 *
 * 1. Injects additional permissions into the host AndroidManifest.
 * 2. Adds a Gradle snippet that copies model and vocab assets from
 *    canaryapp/assets/models/ into the Android app assets directory
 *    so native Kotlin code can access them via context.assets.open().
 */
const {
  withAndroidManifest,
  withAppBuildGradle,
  withPlugins,
} = require("expo/config-plugins");

function addPermissionIfMissing(androidManifest, permission) {
  const { manifest } = androidManifest;
  if (!manifest["uses-permission"]) {
    manifest["uses-permission"] = [];
  }
  const existing = manifest["uses-permission"].find(
    (p) => p.$?.["android:name"] === permission
  );
  if (!existing) {
    manifest["uses-permission"].push({
      $: { "android:name": permission },
    });
  }
}

function withCanaryShieldPermissions(config) {
  return withAndroidManifest(config, (modConfig) => {
    const androidManifest = modConfig.modResults;

    const requiredPermissions = [
      "android.permission.SYSTEM_ALERT_WINDOW",
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_SPECIAL_USE",
      "android.permission.POST_NOTIFICATIONS",
      "android.permission.VIBRATE",
      "android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
    ];

    for (const perm of requiredPermissions) {
      addPermissionIfMissing(androidManifest, perm);
    }

    return modConfig;
  });
}

function withCanaryShieldAssets(config) {
  return withAppBuildGradle(config, (modConfig) => {
    const buildGradle = modConfig.modResults.contents;

    // Inject a Gradle snippet that adds the models directory as an Android
    // assets source. This makes vocab.txt and .tflite files available via
    // context.assets.open() in native Kotlin code.
    const assetSnippet = `
// [canary-shield] Make ML model assets available to native code
android.sourceSets.main.assets.srcDirs += new File(projectDir, "../assets/models")
`;

    if (!buildGradle.includes("[canary-shield]")) {
      modConfig.modResults.contents = buildGradle + assetSnippet;
    }

    return modConfig;
  });
}

function withCanaryShield(config) {
  return withPlugins(config, [
    withCanaryShieldPermissions,
    withCanaryShieldAssets,
  ]);
}

module.exports = withCanaryShield;
