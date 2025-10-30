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
      adaptiveIcon: {
        backgroundColor: '#FFD300',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
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
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      googleApiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    },
  },
};
