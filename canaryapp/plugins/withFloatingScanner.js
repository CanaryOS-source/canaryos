const { withAndroidManifest } = require('@expo/config-plugins');

const withFloatingScanner = (config) => {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const mainApplication = androidManifest.manifest.application[0];

    // Add the FloatingBubbleService to the manifest
    if (!mainApplication.service) {
      mainApplication.service = [];
    }

    // Check if service already exists
    const serviceExists = mainApplication.service.some(
      (service) => service.$['android:name'] === 'expo.modules.floatingscanner.FloatingBubbleService'
    );

    if (!serviceExists) {
      mainApplication.service.push({
        $: {
          'android:name': 'expo.modules.floatingscanner.FloatingBubbleService',
          'android:enabled': 'true',
          'android:exported': 'false',
          'android:foregroundServiceType': 'specialUse',
        },
        property: [
          {
            $: {
              'android:name': 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE',
              'android:value': 'Floating overlay for real-time scam detection. Provides always-accessible UI element for users to capture and analyze suspicious content from any app for safety.',
            },
          },
        ],
      });
    }

    // Add MediaProjectionActivity
    if (!mainApplication.activity) {
      mainApplication.activity = [];
    }

    const activityExists = mainApplication.activity.some(
      (activity) => activity.$['android:name'] === 'expo.modules.floatingscanner.MediaProjectionActivity'
    );

    if (!activityExists) {
      mainApplication.activity.push({
        $: {
          'android:name': 'expo.modules.floatingscanner.MediaProjectionActivity',
          'android:exported': 'false',
          'android:theme': '@android:style/Theme.Translucent.NoTitleBar',
        },
      });
    }

    return config;
  });
};

module.exports = withFloatingScanner;
