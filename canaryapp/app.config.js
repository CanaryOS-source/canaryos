module.exports = {
  expo: {
    name: 'canaryapp',
    slug: 'canaryapp',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/apple-touch-icon.png',
    scheme: 'canaryapp',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
    },
    android: {
      package: 'com.canaryapp',
      googleServicesFile: './google-services.json',
      permissions: [
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.FOREGROUND_SERVICE',
        'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
        'android.permission.POST_NOTIFICATIONS',
      ],
      adaptiveIcon: {
        backgroundColor: '#FFD300',
        foregroundImage: './assets/images/android-chrome-192x192.png',
        backgroundImage: './assets/images/android-chrome-512x512.png',
        monochromeImage: './assets/images/android-chrome-192x192.png',
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
    },
    web: {
      output: 'static',
      favicon: './assets/images/favicon-32x32.png',
    },
    plugins: [
      'expo-router',
      [
        'expo-splash-screen',
        {
          image: './assets/images/apple-touch-icon.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#F5F5F5',
          dark: {
            backgroundColor: '#1C1C1C',
          },
        },
      ],
      './plugins/withFloatingScanner.js',
      '@react-native-firebase/app',
      '@react-native-firebase/auth',
      [
        'expo-build-properties',
        {
          ios: {
            useFrameworks: 'static',
          },
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      googleApiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      eas: {
        projectId: "44122a16-b5ac-4197-9644-a834f96b9a37"
      }
    },
  },
};
