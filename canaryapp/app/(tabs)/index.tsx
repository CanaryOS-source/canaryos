import { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  useColorScheme,
  TextInput,
  Keyboard,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { analyzeImageForScam, analyzeTextForScam, analyzeAudioForScam, ScamAnalysisResult } from '@/services/scamAnalyzer';
import { Colors, CanaryColors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { recordScan } from '@/services/analyticsService';
import {
  initialize as initializeOnDevice,
  analyzeImage as analyzeImageOnDevice,
  getStatus as getOnDeviceStatus,
  isAvailable as isOnDeviceAvailable,
  isRunningTextOnlyMode,
  OnDeviceAnalysisResult,
} from '@/services/ondevice';
import { classifyWithModel } from '@/services/ondevice/TextClassifierService';

// Conditionally import canary-shield (Android only)
const CanaryShield = Platform.OS === 'android'
  ? require('@/modules/canary-shield')
  : null;

const SHIELD_SETUP_KEY = 'shield_setup_complete';

export default function HomeScreen() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedAudio, setSelectedAudio] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<ScamAnalysisResult | null>(null);
  // On-device analysis state
  const [onDeviceAnalysis, setOnDeviceAnalysis] = useState<OnDeviceAnalysisResult | null>(null);
  const [isOnDeviceReady, setIsOnDeviceReady] = useState(false);
  const [isOnDeviceMode, setIsOnDeviceMode] = useState(false);
  const [isTextOnlyMode, setIsTextOnlyMode] = useState(false);
  const [onDeviceInitializing, setOnDeviceInitializing] = useState(false);
  
  // Debug text model state
  const [debugText, setDebugText] = useState<string>('');
  const [debugModelScore, setDebugModelScore] = useState<number | null>(null);
  const [debugTesting, setDebugTesting] = useState(false);

  // Shield status state
  const [shieldActive, setShieldActive] = useState(false);
  const [showSetupPrompt, setShowSetupPrompt] = useState(false);
  const router = useRouter();

  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { user } = useAuth();

  // Initialize on-device analysis on mount (native platforms only)
  useEffect(() => {
    const initOnDevice = async () => {
      if (Platform.OS === 'web') {
        console.log('[HomeScreen] Web platform - on-device analysis unavailable');
        return;
      }

      setOnDeviceInitializing(true);
      try {
        console.log('[HomeScreen] Initializing on-device analysis...');
        await initializeOnDevice();
        const status = getOnDeviceStatus();
        const textOnly = isRunningTextOnlyMode();
        setIsOnDeviceReady(status.isAvailable);
        setIsTextOnlyMode(textOnly);
        console.log('[HomeScreen] On-device ready:', status.isAvailable, 'Mode:', textOnly ? 'TEXT-ONLY' : 'FULL');
      } catch (error) {
        console.error('[HomeScreen] On-device initialization failed:', error);
        setIsOnDeviceReady(false);
      } finally {
        setOnDeviceInitializing(false);
      }
    };

    initOnDevice();
  }, []);

  // Check shield status and first-time setup prompt
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const checkShieldStatus = async () => {
      // Check if shield setup was completed
      try {
        const setupDone = await AsyncStorage.getItem(SHIELD_SETUP_KEY);
        if (!setupDone) {
          setShowSetupPrompt(true);
        }
      } catch {
        // Non-critical
      }

      // Check if accessibility service is alive
      if (CanaryShield) {
        try {
          const alive = CanaryShield.isServiceAlive();
          setShieldActive(alive);
        } catch {
          setShieldActive(false);
        }
      }
    };

    checkShieldStatus();
  }, []);

  const dismissSetupPrompt = useCallback(async () => {
    setShowSetupPrompt(false);
    try {
      await AsyncStorage.setItem(SHIELD_SETUP_KEY, 'dismissed');
    } catch {
      // Non-critical
    }
  }, []);

  const pickImage = async () => {
    try {
      setIsOnDeviceMode(false); // Using Gemini
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please grant permission to access your photos to analyze screenshots.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setSelectedImage(asset.uri);
        setAnalysis(null);
        setOnDeviceAnalysis(null);
        
        if (asset.base64) {
          await analyzeImage(asset.base64);
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  };

  /**
   * Pick image for ON-DEVICE analysis (no cloud API calls)
   * Uses MobileBERT + OCR for scam detection
   */
  const pickImageOnDevice = async () => {
    try {
      setIsOnDeviceMode(true);
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please grant permission to access your photos to analyze screenshots.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1.0, // Higher quality for OCR
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setSelectedImage(asset.uri);
        setAnalysis(null);
        setOnDeviceAnalysis(null);
        
        // Analyze with on-device model
        await analyzeImageWithOnDevice(asset.uri);
      }
    } catch (error) {
      console.error('Error picking image for on-device:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  };

  /**
   * Analyze image using on-device TFLite model
   */
  const analyzeImageWithOnDevice = async (imageUri: string) => {
    setIsAnalyzing(true);
    try {
      console.log('[HomeScreen] Starting on-device analysis...');
      const result = await analyzeImageOnDevice(imageUri);
      setOnDeviceAnalysis(result);
      
      // Track analytics
      if (user?.uid) {
        try {
          await recordScan(user.uid, result.isScam);
        } catch (analyticsError) {
          console.error('Error tracking analytics:', analyticsError);
        }
      }
      
      console.log('[HomeScreen] On-device analysis complete:', result.isScam ? 'SCAM' : 'SAFE');
    } catch (error) {
      console.error('On-device analysis error:', error);
      Alert.alert(
        'Analysis Failed',
        'On-device analysis failed. Please ensure models are properly loaded and try again.'
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  /**
   * DEBUG: Test text model directly with raw input
   * This bypasses OCR and tests the MobileBERT model's inference
   */
  const testTextModelDirectly = async () => {
    if (!debugText.trim()) {
      Alert.alert('Input Required', 'Please enter text to test the model.');
      return;
    }

    setDebugTesting(true);
    setDebugModelScore(null);

    try {
      console.log('[DEBUG] Testing text model with input:', debugText);
      console.log('[DEBUG] Input length:', debugText.length, 'chars');
      
      // Call the model directly
      const rawScore = await classifyWithModel(debugText);
      
      console.log('[DEBUG] Raw model output (risk score):', rawScore);
      console.log('[DEBUG] As percentage:', (rawScore * 100).toFixed(2) + '%');
      
      setDebugModelScore(rawScore);
      
      if (rawScore < 0) {
        Alert.alert(
          'Model Error',
          'Text model inference failed. Model may not be loaded properly.'
        );
      }
    } catch (error) {
      console.error('[DEBUG] Model test error:', error);
      Alert.alert(
        'Test Failed',
        `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      setDebugTesting(false);
    }
  };

  const analyzeImage = async (base64Image: string) => {
    setIsAnalyzing(true);
    try {
      const result = await analyzeImageForScam(base64Image);
      setAnalysis(result);
      
      // Track analytics
      if (user?.uid) {
        try {
          await recordScan(user.uid, result.isScam);
        } catch (analyticsError) {
          console.error('Error tracking analytics:', analyticsError);
        }
      }
    } catch (error) {
      console.error('Analysis error:', error);
      Alert.alert(
        'Analysis Failed',
        'Failed to analyze the image. Please check your API key configuration and try again.'
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const pickAudio = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setSelectedAudio(asset.uri);
        setSelectedImage(null);
        setAnalysis(null);
        
        await analyzeAudio(asset.uri, asset.mimeType || 'audio/mpeg');
      }
    } catch (error) {
      console.error('Error picking audio:', error);
      Alert.alert('Error', 'Failed to pick audio file. Please try again.');
    }
  };

  const analyzeAudio = async (audioUri: string, mimeType: string) => {
    setIsAnalyzing(true);
    try {
      const result = await analyzeAudioForScam(audioUri, mimeType);
      setAnalysis(result);
      
      // Track analytics
      if (user?.uid) {
        try {
          await recordScan(user.uid, result.isScam);
        } catch (analyticsError) {
          console.error('Error tracking analytics:', analyticsError);
        }
      }
    } catch (error) {
      console.error('Audio analysis error:', error);
      Alert.alert(
        'Analysis Failed',
        'Failed to analyze the audio. Please check your API key configuration and try again.'
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const analyzeSearch = async () => {
    if (!searchQuery.trim()) {
      Alert.alert('Input Required', 'Please enter a website URL or text to analyze.');
      return;
    }

    Keyboard.dismiss();
    setIsAnalyzing(true);
    setSelectedImage(null);
    setSelectedAudio(null);
    setAnalysis(null);

    try {
      const result = await analyzeTextForScam(searchQuery.trim());
      setAnalysis(result);
      
      // Track analytics
      if (user?.uid) {
        try {
          await recordScan(user.uid, result.isScam);
        } catch (analyticsError) {
          console.error('Error tracking analytics:', analyticsError);
        }
      }
    } catch (error) {
      console.error('Search analysis error:', error);
      Alert.alert(
        'Analysis Failed',
        'Failed to analyze the query. Please check your API key configuration and try again.'
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const resetAnalysis = () => {
    setSelectedImage(null);
    setSelectedAudio(null);
    setSearchQuery('');
    setAnalysis(null);
    setOnDeviceAnalysis(null);
    setIsOnDeviceMode(false);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.contentContainer}
    >
      {/* Header */}
      <View style={styles.header}>
        <Image
          source={require('@/assets/images/apple-touch-icon.png')}
          style={styles.logoIcon}
          contentFit="contain"
        />
        <Text style={[styles.title, { color: colors.text }]}>Canary OS</Text>
        <Text style={[styles.subtitle, { color: colors.icon }]}>
          Scam Detection
        </Text>
      </View>

      {/* Shield Status Indicator (Android only) */}
      {Platform.OS === 'android' && (
        <TouchableOpacity
          style={styles.shieldStatus}
          onPress={() => router.push('/settings/shield')}
          activeOpacity={0.7}
        >
          <View
            style={[
              styles.shieldDot,
              { backgroundColor: shieldActive ? CanaryColors.trustBlue : '#888' },
            ]}
          />
          <Text style={[styles.shieldStatusText, { color: colors.icon }]}>
            Shield: {shieldActive ? 'Active' : 'Inactive'}
          </Text>
        </TouchableOpacity>
      )}

      {/* First-time Shield Setup Prompt */}
      {showSetupPrompt && Platform.OS === 'android' && (
        <View style={[styles.setupCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.setupCardTitle, { color: colors.text }]}>
            Protect your entire phone from scams
          </Text>
          <Text style={[styles.setupCardBody, { color: colors.icon }]}>
            Enable system-wide protection to detect scams across all apps.
          </Text>
          <View style={styles.setupCardActions}>
            <TouchableOpacity
              style={[styles.setupCardButton, { backgroundColor: CanaryColors.primary }]}
              onPress={() => router.push('/shield-setup')}
              activeOpacity={0.8}
            >
              <Text style={styles.setupCardButtonText}>Set up Shield</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={dismissSetupPrompt}
              activeOpacity={0.7}
            >
              <Text style={[styles.setupCardDismiss, { color: colors.icon }]}>
                Not now
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Main Action Buttons */}
      {!selectedImage && !selectedAudio && !analysis && !onDeviceAnalysis && (
        <>
          <TouchableOpacity
            style={[styles.uploadButton, { backgroundColor: CanaryColors.primary }]}
            onPress={pickImage}
            activeOpacity={0.8}
          >
            <Text style={styles.uploadButtonText}>Upload Screenshot</Text>
          </TouchableOpacity>

          {/* On-Device Upload Button - Only on native platforms */}
          {Platform.OS !== 'web' && (
            <TouchableOpacity
              style={[
                styles.uploadButton, 
                { 
                  backgroundColor: isOnDeviceReady ? CanaryColors.primary : colors.border,
                  marginTop: 12,
                }
              ]}
              onPress={pickImageOnDevice}
              activeOpacity={0.8}
              disabled={!isOnDeviceReady || onDeviceInitializing}
            >
              <Text style={[
                styles.uploadButtonText,
                !isOnDeviceReady && { color: colors.icon }
              ]}>
                {onDeviceInitializing 
                  ? 'Initializing On-Device AI...' 
                  : isOnDeviceReady 
                    ? `Upload Screenshot (On-Device${isTextOnlyMode ? ' - Text AI' : ''})` 
                    : 'On-Device Unavailable'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Divider */}
          <View style={styles.dividerContainer}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerText, { color: colors.icon }]}>OR</Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>

          <TouchableOpacity
            style={[styles.uploadButton, { backgroundColor: CanaryColors.primary }]}
            onPress={pickAudio}
            activeOpacity={0.8}
          >
            <Text style={styles.uploadButtonText}>Scan Voicemail</Text>
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.dividerContainer}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerText, { color: colors.icon }]}>OR</Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>

          {/* Search Section */}
          <View style={styles.searchSection}>
            <Text style={[styles.searchTitle, { color: colors.text }]}>Search for Scams</Text>
            <Text style={[styles.searchSubtitle, { color: colors.icon }]}>
              Enter a website URL or keywords to check
            </Text>
            <TextInput
              style={[styles.searchInput, { 
                backgroundColor: colors.card, 
                color: colors.text,
                borderColor: colors.border 
              }]}
              placeholder="Enter URL or search terms..."
              placeholderTextColor={colors.icon}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={analyzeSearch}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.searchButton, { backgroundColor: CanaryColors.primary }]}
              onPress={analyzeSearch}
              activeOpacity={0.8}
            >
              <Text style={styles.searchButtonText}>Analyze</Text>
            </TouchableOpacity>
          </View>

          {/* DEBUG: Direct Text Model Testing - Only on native platforms */}
          {Platform.OS !== 'web' && isOnDeviceReady && (
            <>
              {/* Divider */}
              <View style={styles.dividerContainer}>
                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                <Text style={[styles.dividerText, { color: colors.icon }]}>DEBUG</Text>
                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              </View>

              <View style={[styles.debugSection, { backgroundColor: colors.card }]}>
                <Text style={[styles.debugTitle, { color: colors.text }]}>
                  🔬 Test Text Model Directly
                </Text>
                <Text style={[styles.debugSubtitle, { color: colors.icon }]}>
                  Get raw risk score (0-1) from MobileBERT model{'\n'}
                  Try: "URGENT! Wire $500 now or account suspended!"
                </Text>
                
                <TextInput
                  style={[styles.debugInput, { 
                    backgroundColor: colors.background, 
                    color: colors.text,
                    borderColor: colors.border 
                  }]}
                  placeholder="Enter text to test the model..."
                  placeholderTextColor={colors.icon}
                  value={debugText}
                  onChangeText={setDebugText}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                
                <TouchableOpacity
                  style={[
                    styles.debugButton, 
                    { backgroundColor: debugTesting ? colors.border : '#FF6B35' }
                  ]}
                  onPress={testTextModelDirectly}
                  activeOpacity={0.8}
                  disabled={debugTesting}
                >
                  {debugTesting ? (
                    <ActivityIndicator size="small" color="#1C1C1C" />
                  ) : (
                    <Text style={styles.debugButtonText}>Test Model</Text>
                  )}
                </TouchableOpacity>

                {/* Display Raw Score */}
                {debugModelScore !== null && (
                  <View style={[styles.debugResult, { backgroundColor: colors.background }]}>
                    <Text style={[styles.debugResultLabel, { color: colors.icon }]}>
                      Raw Model Output:
                    </Text>
                    <Text style={[styles.debugResultValue, { color: colors.text }]}>
                      {debugModelScore.toFixed(6)}
                    </Text>
                    <Text style={[styles.debugResultPercent, { 
                      color: debugModelScore > 0.5 ? colors.danger : colors.success 
                    }]}>
                      {(debugModelScore * 100).toFixed(2)}% Risk
                    </Text>
                  </View>
                )}
              </View>
            </>
          )}
        </>
      )}

      {/* Selected Image Preview */}
      {selectedImage && (
        <View style={[styles.imageContainer, { backgroundColor: colors.card }]}>
          <Image source={{ uri: selectedImage }} style={styles.previewImage} contentFit="contain" />
        </View>
      )}

      {/* Selected Audio Preview */}
      {selectedAudio && (
        <View style={[styles.audioContainer, { backgroundColor: colors.card }]}>
          <Text style={[styles.audioText, { color: colors.text }]}>🎵 Audio File Selected</Text>
          <Text style={[styles.audioSubtext, { color: colors.icon }]}>Analyzing voicemail...</Text>
        </View>
      )}

      {/* Loading State */}
      {isAnalyzing && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={CanaryColors.primary} />
          <Text style={[styles.loadingText, { color: colors.text }]}>
            Analyzing for scams...
          </Text>
        </View>
      )}

      {/* Analysis Results */}
      {analysis && !isAnalyzing && (
        <View style={styles.resultsContainer}>
          {/* Status Badge */}
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor: analysis.isScam
                  ? colors.danger + '20'
                  : colors.success + '20',
              },
            ]}
          >
            <Text
              style={[
                styles.statusText,
                { color: analysis.isScam ? colors.danger : colors.success },
              ]}
            >
              {analysis.isScam ? '⚠️ SCAM DETECTED' : '✓ APPEARS SAFE'}
            </Text>
            <Text style={[styles.confidenceText, { color: colors.icon }]}>
              Confidence: {analysis.confidence}%
            </Text>
          </View>

          {/* Explanation */}
          <View style={[styles.section, { backgroundColor: colors.card }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Analysis
            </Text>
            <Text style={[styles.explanationText, { color: colors.text }]}>
              {analysis.explanation}
            </Text>
          </View>

          {/* Red Flags */}
          {analysis.redFlags && analysis.redFlags.length > 0 && (
            <View style={[styles.section, { backgroundColor: colors.card }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Warning Signs
              </Text>
              {analysis.redFlags.map((flag, index) => (
                <View key={index} style={styles.listItem}>
                  <Text style={{ color: colors.danger }}>•</Text>
                  <Text style={[styles.listItemText, { color: colors.text }]}>
                    {flag}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Safety Tips */}
          {analysis.safetyTips && analysis.safetyTips.length > 0 && (
            <View style={[styles.section, { backgroundColor: colors.card }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Safety Tips
              </Text>
              {analysis.safetyTips.map((tip, index) => (
                <View key={index} style={styles.listItem}>
                  <Text style={{ color: colors.success }}>•</Text>
                  <Text style={[styles.listItemText, { color: colors.text }]}>
                    {tip}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.secondaryButton, { borderColor: colors.border }]}
              onPress={resetAnalysis}
            >
              <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
                Analyze Another
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* On-Device Analysis Results */}
      {onDeviceAnalysis && !isAnalyzing && (
        <View style={styles.resultsContainer}>
          {/* On-Device Badge */}
          <View style={[styles.onDeviceBadge, { backgroundColor: colors.success + '20' }]}>
            <Text style={[styles.onDeviceBadgeText, { color: colors.success }]}>
              🔒 Analyzed On-Device {isTextOnlyMode ? '(Text AI)' : '(Visual + Text AI)'}
            </Text>
          </View>

          {/* Status Badge */}
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor: onDeviceAnalysis.isScam
                  ? colors.danger + '20'
                  : colors.success + '20',
              },
            ]}
          >
            <Text
              style={[
                styles.statusText,
                { color: onDeviceAnalysis.isScam ? colors.danger : colors.success },
              ]}
            >
              {onDeviceAnalysis.isScam ? '⚠️ SCAM DETECTED' : '✓ APPEARS SAFE'}
            </Text>
            <Text style={[styles.confidenceText, { color: colors.icon }]}>
              Risk Score: {(onDeviceAnalysis.fusedScore * 100).toFixed(1)}%
            </Text>
            <Text style={[styles.latencyText, { color: colors.icon }]}>
              Analyzed in {onDeviceAnalysis.totalLatencyMs}ms
            </Text>
          </View>

          {/* Explanation */}
          <View style={[styles.section, { backgroundColor: colors.card }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Analysis
            </Text>
            <Text style={[styles.explanationText, { color: colors.text }]}>
              {onDeviceAnalysis.explanation}
            </Text>
          </View>

          {/* Red Flags */}
          {onDeviceAnalysis.redFlags && onDeviceAnalysis.redFlags.length > 0 && (
            <View style={[styles.section, { backgroundColor: colors.card }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Warning Signs
              </Text>
              {onDeviceAnalysis.redFlags.map((flag, index) => (
                <View key={index} style={styles.listItem}>
                  <Text style={{ color: colors.danger }}>•</Text>
                  <Text style={[styles.listItemText, { color: colors.text }]}>
                    {flag}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Safety Tips */}
          {onDeviceAnalysis.safetyTips && onDeviceAnalysis.safetyTips.length > 0 && (
            <View style={[styles.section, { backgroundColor: colors.card }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Safety Tips
              </Text>
              {onDeviceAnalysis.safetyTips.map((tip, index) => (
                <View key={index} style={styles.listItem}>
                  <Text style={{ color: colors.success }}>•</Text>
                  <Text style={[styles.listItemText, { color: colors.text }]}>
                    {tip}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.secondaryButton, { borderColor: colors.border }]}
              onPress={resetAnalysis}
            >
              <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
                Analyze Another
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingTop: 60,
  },
  header: {
    marginBottom: 40,
    alignItems: 'center',
  },
  logoIcon: {
    width: 80,
    height: 80,
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  uploadButton: {
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  uploadButtonText: {
    color: '#1C1C1C',
    fontSize: 18,
    fontWeight: '600',
  },
  imageContainer: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: 300,
    borderRadius: 8,
  },
  audioContainer: {
    borderRadius: 12,
    padding: 24,
    marginBottom: 20,
    alignItems: 'center',
  },
  audioText: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  audioSubtext: {
    fontSize: 14,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  resultsContainer: {
    gap: 16,
  },
  statusBadge: {
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  statusText: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  confidenceText: {
    fontSize: 14,
    fontWeight: '500',
  },
  latencyText: {
    fontSize: 12,
    marginTop: 4,
  },
  onDeviceBadge: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  onDeviceBadgeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    padding: 16,
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  explanationText: {
    fontSize: 15,
    lineHeight: 22,
  },
  listItem: {
    flexDirection: 'row',
    marginBottom: 8,
    paddingLeft: 4,
  },
  listItemText: {
    fontSize: 14,
    lineHeight: 20,
    marginLeft: 8,
    flex: 1,
  },
  actionButtons: {
    marginTop: 8,
  },
  secondaryButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    paddingHorizontal: 16,
    fontSize: 14,
    fontWeight: '600',
  },
  searchSection: {
    marginBottom: 20,
  },
  searchTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  searchSubtitle: {
    fontSize: 14,
    marginBottom: 12,
  },
  searchInput: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 12,
  },
  searchButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
  },
  searchButtonText: {
    color: '#1C1C1C',
    fontSize: 16,
    fontWeight: '600',
  },
  debugSection: {
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
  },
  debugTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  debugSubtitle: {
    fontSize: 13,
    marginBottom: 16,
  },
  debugInput: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 15,
    marginBottom: 16,
    minHeight: 100,
  },
  debugButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  debugButtonText: {
    color: '#1C1C1C',
    fontSize: 16,
    fontWeight: '600',
  },
  debugResult: {
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  debugResultLabel: {
    fontSize: 13,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  debugResultValue: {
    fontSize: 32,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    marginBottom: 4,
  },
  debugResultPercent: {
    fontSize: 18,
    fontWeight: '600',
  },
  shieldStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  shieldDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  shieldStatusText: {
    fontSize: 13,
    fontWeight: '500',
  },
  setupCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  setupCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  setupCardBody: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  setupCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  setupCardButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  setupCardButtonText: {
    color: '#1C1C1C',
    fontSize: 14,
    fontWeight: '600',
  },
  setupCardDismiss: {
    fontSize: 14,
  },
});
