import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Image, ScrollView, SafeAreaView, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useScanner, ScanState, OnDeviceAnalysisResult } from '../hooks/useScanner';
import { Ionicons } from '@expo/vector-icons';

export default function ScannerScreen() {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const { state, confidence, analysisResult, isOnDevice, isTextOnlyMode, scanImage, reset } = useScanner();

  const pickImage = async () => {
    // Request permissions first
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      alert('Sorry, we need camera roll permissions to make this work!');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false, // We want the full screenshot usually
      quality: 1,
    });

    if (!result.canceled) {
      reset();
      setImageUri(result.assets[0].uri);
    }
  };

  const handleScan = () => {
    if (imageUri) {
      scanImage(imageUri);
    }
  };

  // Render detailed analysis info
  const renderDetailedAnalysis = () => {
    if (!analysisResult) return null;
    
    return (
      <View style={styles.detailsContainer}>
        {/* On-device badge */}
        {isOnDevice && (
          <View style={styles.onDeviceBadge}>
            <Ionicons name="shield-checkmark" size={14} color="#34C759" />
            <Text style={styles.onDeviceText}>
              Analyzed on-device{isTextOnlyMode ? ' (Text AI)' : ' (Visual + Text AI)'}
            </Text>
          </View>
        )}
        
        {/* Red flags */}
        {analysisResult.redFlags.length > 0 && (
          <View style={styles.flagsContainer}>
            <Text style={styles.sectionTitle}>Warning Signs Detected:</Text>
            {analysisResult.redFlags.map((flag, index) => (
              <View key={index} style={styles.flagItem}>
                <Ionicons name="alert" size={16} color="#FF9500" />
                <Text style={styles.flagText}>{flag}</Text>
              </View>
            ))}
          </View>
        )}
        
        {/* Safety tips */}
        {analysisResult.safetyTips.length > 0 && (
          <View style={styles.tipsContainer}>
            <Text style={styles.sectionTitle}>Safety Tips:</Text>
            {analysisResult.safetyTips.map((tip, index) => (
              <View key={index} style={styles.tipItem}>
                <Ionicons name="bulb" size={16} color="#007AFF" />
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ))}
          </View>
        )}
        
        {/* Performance info */}
        <Text style={styles.latencyText}>
          Analysis completed in {analysisResult.totalLatencyMs}ms
        </Text>
      </View>
    );
  };

  const renderResult = () => {
    switch (state) {
      case ScanState.IDLE:
        return null;
      case ScanState.LOADING_MODEL:
        return <Text style={styles.statusText}>Initializing On-Device Analysis...</Text>;
      case ScanState.SCANNING:
        return (
          <View style={styles.resultContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.statusText}>Analyzing with on-device AI...</Text>
            <Text style={styles.subStatusText}>
              {isTextOnlyMode ? 'OCR + Text Analysis' : 'OCR + Visual + Text Analysis'}
            </Text>
          </View>
        );
      case ScanState.SAFE:
        return (
          <>
            <View style={[styles.resultCard, styles.cardSafe]}>
              <Ionicons name="checkmark-circle" size={48} color="#34C759" />
              <Text style={styles.resultTitle}>Likely Safe</Text>
              <Text style={styles.resultDesc}>
                {analysisResult?.explanation || 'No scam indicators detected.'}
              </Text>
              <Text style={styles.confidence}>Risk Score: {(confidence * 100).toFixed(1)}%</Text>
            </View>
            {renderDetailedAnalysis()}
          </>
        );
      case ScanState.SUSPICIOUS:
        return (
          <>
            <View style={[styles.resultCard, styles.cardSuspicious]}>
              <Ionicons name="warning" size={48} color="#FF9500" />
              <Text style={styles.resultTitle}>Suspicious</Text>
              <Text style={styles.resultDesc}>
                {analysisResult?.explanation || 'Contains elements common in scams.'}
              </Text>
              <Text style={styles.confidence}>Risk Score: {(confidence * 100).toFixed(1)}%</Text>
            </View>
            {renderDetailedAnalysis()}
          </>
        );
      case ScanState.DANGER:
        return (
          <>
            <View style={[styles.resultCard, styles.cardDanger]}>
              <Ionicons name="alert-circle" size={48} color="#FF3B30" />
              <Text style={styles.resultTitle}>High Risk - Likely Scam</Text>
              <Text style={styles.resultDesc}>
                {analysisResult?.explanation || 'Do not interact with this content.'}
              </Text>
              <Text style={styles.confidence}>Risk Score: {(confidence * 100).toFixed(1)}%</Text>
            </View>
            {renderDetailedAnalysis()}
          </>
        );
      case ScanState.ERROR:
        return <Text style={styles.errorText}>Error analyzing image. Please try again.</Text>;
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: 'Scam Scanner', headerBackTitle: 'Back' }} />
      
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.instructionContainer}>
          <Text style={styles.header}>Verify Screenshots</Text>
          <Text style={styles.subtext}>Upload a screenshot of a text message, email, or website to check for fraud.</Text>
        </View>

        <TouchableOpacity onPress={pickImage} style={styles.uploadArea}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="contain" />
          ) : (
            <View style={styles.uploadPlaceholder}>
              <Ionicons name="image-outline" size={48} color="#8E8E93" />
              <Text style={styles.uploadText}>Tap to select image</Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.actionContainer}>
           {imageUri && state !== ScanState.SCANNING && (
             <TouchableOpacity style={styles.scanButton} onPress={handleScan}>
               <Text style={styles.scanButtonText}>Analyze Screenshot</Text>
             </TouchableOpacity>
           )}
        </View>

        {renderResult()}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  content: {
    padding: 20,
    alignItems: 'center',
  },
  instructionContainer: {
    marginBottom: 24,
    width: '100%',
  },
  header: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  subtext: {
    fontSize: 16,
    color: '#636366',
    lineHeight: 22,
  },
  uploadArea: {
    width: '100%',
    height: 300,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  uploadPlaceholder: {
    alignItems: 'center',
  },
  uploadText: {
    marginTop: 12,
    color: '#8E8E93',
    fontSize: 16,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  actionContainer: {
    width: '100%',
    marginBottom: 24,
  },
  scanButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  scanButtonText: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '600',
  },
  statusText: {
    marginTop: 20,
    fontSize: 16,
    color: '#8E8E93',
  },
  resultContainer: {
    alignItems: 'center',
    width: '100%',
  },
  resultCard: {
    width: '100%',
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  cardSafe: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#A5D6A7',
  },
  cardSuspicious: {
    backgroundColor: '#FFF3E0',
    borderWidth: 1,
    borderColor: '#FFE0B2',
  },
  cardDanger: {
    backgroundColor: '#FFEBEE',
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  resultTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 4,
    color: '#000',
  },
  resultDesc: {
    fontSize: 16,
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  confidence: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 16,
  },
  subStatusText: {
    marginTop: 8,
    fontSize: 14,
    color: '#A0A0A0',
  },
  // Detailed analysis styles
  detailsContainer: {
    width: '100%',
    marginTop: 16,
  },
  onDeviceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: 'center',
    marginBottom: 16,
  },
  onDeviceText: {
    marginLeft: 6,
    fontSize: 13,
    color: '#2E7D32',
    fontWeight: '500',
  },
  flagsContainer: {
    backgroundColor: '#FFF8E1',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  flagItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  flagText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: '#5D4037',
    lineHeight: 20,
  },
  tipsContainer: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  tipText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: '#1565C0',
    lineHeight: 20,
  },
  latencyText: {
    textAlign: 'center',
    fontSize: 12,
    color: '#9E9E9E',
    marginTop: 8,
  },
});
