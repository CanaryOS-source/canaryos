import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Image, ScrollView, SafeAreaView, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useScanner, ScanState } from '../hooks/useScanner';
import { Ionicons } from '@expo/vector-icons';

export default function ScannerScreen() {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const { state, confidence, scanImage, reset } = useScanner();

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

  const renderResult = () => {
    switch (state) {
      case ScanState.IDLE:
        return null;
      case ScanState.LOADING_MODEL:
        return <Text style={styles.statusText}>Initializing Neural Engine...</Text>;
      case ScanState.SCANNING:
        return (
          <View style={styles.resultContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.statusText}>Analyzing visual patterns...</Text>
          </View>
        );
      case ScanState.SAFE:
        return (
          <View style={[styles.resultCard, styles.cardSafe]}>
            <Ionicons name="checkmark-circle" size={48} color="#34C759" />
            <Text style={styles.resultTitle}>Likely Safe</Text>
            <Text style={styles.resultDesc}>No scam indicators detected.</Text>
            <Text style={styles.confidence}>Confidence: {(confidence * 100).toFixed(1)}%</Text>
          </View>
        );
      case ScanState.SUSPICIOUS:
        return (
          <View style={[styles.resultCard, styles.cardSuspicious]}>
            <Ionicons name="warning" size={48} color="#FF9500" />
            <Text style={styles.resultTitle}>Suspicious</Text>
            <Text style={styles.resultDesc}>Contains elements common in scams.</Text>
            <Text style={styles.confidence}>Confidence: {(confidence * 100).toFixed(1)}%</Text>
          </View>
        );
      case ScanState.DANGER:
        return (
          <View style={[styles.resultCard, styles.cardDanger]}>
            <Ionicons name="alert-circle" size={48} color="#FF3B30" />
            <Text style={styles.resultTitle}>High Risk Scam</Text>
            <Text style={styles.resultDesc}>Do not interact with this content.</Text>
            <Text style={styles.confidence}>Risk Score: {(confidence * 100).toFixed(1)}%</Text>
          </View>
        );
      case ScanState.ERROR:
        return <Text style={styles.errorText}>Error analyzing image.</Text>;
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
});
