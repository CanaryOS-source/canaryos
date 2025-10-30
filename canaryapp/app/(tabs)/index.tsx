import { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  useColorScheme,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { analyzeImageForScam, ScamAnalysisResult } from '@/services/scamAnalyzer';
import { Colors, CanaryColors } from '@/constants/theme';

export default function HomeScreen() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<ScamAnalysisResult | null>(null);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const pickImage = async () => {
    try {
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
        
        if (asset.base64) {
          await analyzeImage(asset.base64);
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  };

  const analyzeImage = async (base64Image: string) => {
    setIsAnalyzing(true);
    try {
      const result = await analyzeImageForScam(base64Image);
      setAnalysis(result);
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

  const resetAnalysis = () => {
    setSelectedImage(null);
    setAnalysis(null);
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

      {/* Main Action Button */}
      {!selectedImage && (
        <TouchableOpacity
          style={[styles.uploadButton, { backgroundColor: CanaryColors.primary }]}
          onPress={pickImage}
          activeOpacity={0.8}
        >
          <Text style={styles.uploadButtonText}>Upload Screenshot</Text>
        </TouchableOpacity>
      )}

      {/* Selected Image Preview */}
      {selectedImage && (
        <View style={[styles.imageContainer, { backgroundColor: colors.card }]}>
          <Image source={{ uri: selectedImage }} style={styles.previewImage} contentFit="contain" />
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
});
