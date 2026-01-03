const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add tflite and txt to asset extensions so they are bundled
// tflite: TensorFlow Lite models for on-device ML
// txt: Vocabulary files for text tokenization (MobileBERT)
config.resolver.assetExts.push('tflite', 'txt');

module.exports = config;
