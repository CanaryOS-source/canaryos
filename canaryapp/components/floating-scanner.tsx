import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { Colors, CanaryColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Floating Scanner Component
 * 
 * This component will manage the floating overlay scanner for Phase 2.
 * Currently provides UI controls for enabling/disabling the scanner.
 * 
 * Native implementation required for:
 * - SYSTEM_ALERT_WINDOW permission
 * - Floating bubble overlay
 * - MediaProjection for screenshots
 */

export function FloatingScanner() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  useEffect(() => {
    checkPermissions();
    setupScreenshotListener();
    
    return () => {
      // Cleanup listener on unmount
    };
  }, []);

  const setupScreenshotListener = () => {
    if (Platform.OS !== 'android') {
      return;
    }

    try {
      const FloatingScanner = require('@/modules/floating-scanner');
      const { analyzeImageForScam } = require('@/services/scamAnalyzer');
      
      const subscription = FloatingScanner.addScreenshotListener(async (event: any) => {
        console.log('Screenshot captured! Analyzing...');
        try {
          const result = await analyzeImageForScam(event.base64);
          
          // Show results in alert for now
          Alert.alert(
            result.isScam ? '⚠️ Potential Scam Detected!' : '✅ Looks Safe',
            `Confidence: ${result.confidence}%\n\n${result.explanation}`,
            [{ text: 'OK' }]
          );
        } catch (error) {
          console.error('Error analyzing screenshot:', error);
          Alert.alert('Error', 'Failed to analyze screenshot');
        }
      });
      
      return () => subscription?.remove();
    } catch (error) {
      console.error('Error setting up screenshot listener:', error);
    }
  };

  const checkPermissions = async () => {
    if (Platform.OS !== 'android') {
      return;
    }
    
    try {
      const FloatingScanner = require('@/modules/floating-scanner');
      const hasOverlay = await FloatingScanner.hasOverlayPermission();
      setHasPermission(hasOverlay);
      
      const running = await FloatingScanner.isFloatingScannerRunning();
      setIsEnabled(running);
    } catch (error) {
      console.error('Error checking permissions:', error);
    }
  };

  const requestPermissions = async () => {
    if (Platform.OS !== 'android') {
      Alert.alert('Not Supported', 'Floating scanner is only available on Android.');
      return;
    }

    try {
      const FloatingScanner = require('@/modules/floating-scanner');
      
      Alert.alert(
        'Permissions Required',
        'To use the floating scanner, you need to:\n\n' +
        '1. Allow "Display over other apps" permission\n' +
        '2. Allow screen capture permission when scanning\n\n' +
        'These permissions let Canary scan for scams from any app.',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Grant Permissions', 
            onPress: async () => {
              const granted = await FloatingScanner.requestOverlayPermission();
              if (granted) {
                setHasPermission(true);
                Alert.alert('Permission Granted', 'You can now enable the floating scanner.');
              } else {
                Alert.alert('Permission Required', 'Please grant overlay permission to use this feature.');
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error requesting permissions:', error);
      Alert.alert('Error', 'Failed to request permissions');
    }
  };

  const toggleScanner = async () => {
    if (!hasPermission) {
      await requestPermissions();
      return;
    }

    try {
      const FloatingScanner = require('@/modules/floating-scanner');
      
      if (isEnabled) {
        await FloatingScanner.stopFloatingScanner();
        setIsEnabled(false);
        Alert.alert('Scanner Disabled', 'The floating scanner has been turned off.');
      } else {
        await FloatingScanner.startFloatingScanner();
        setIsEnabled(true);
        Alert.alert(
          'Scanner Enabled', 
          'A floating yellow button will appear on your screen. Tap it anytime to scan for scams from any app!'
        );
      }
    } catch (error) {
      console.error('Error toggling scanner:', error);
      Alert.alert('Error', 'Failed to toggle scanner: ' + error);
    }
  };

  if (Platform.OS !== 'android') {
    return (
      <View style={[styles.container, { backgroundColor: colors.card }]}>
        <Text style={[styles.unavailableText, { color: colors.icon }]}>
          Floating scanner is only available on Android devices.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.card }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>
          Floating Scanner
        </Text>
        <View 
          style={[
            styles.statusBadge, 
            { backgroundColor: isEnabled ? CanaryColors.trustBlue : colors.border }
          ]}
        >
          <Text style={[styles.statusText, { color: isEnabled ? '#fff' : colors.icon }]}>
            {isEnabled ? 'Active' : 'Inactive'}
          </Text>
        </View>
      </View>

      <Text style={[styles.description, { color: colors.icon }]}>
        Enable the floating scanner to detect scams from any app. A button will appear on your screen
        that you can tap anytime to analyze what's currently displayed.
      </Text>

      <View style={styles.features}>
        <Text style={[styles.featureTitle, { color: colors.text }]}>Features:</Text>
        <View style={styles.featureItem}>
          <Text style={[styles.featureBullet, { color: CanaryColors.trustBlue }]}>•</Text>
          <Text style={[styles.featureText, { color: colors.text }]}>
            Scan from any app with one tap
          </Text>
        </View>
        <View style={styles.featureItem}>
          <Text style={[styles.featureBullet, { color: CanaryColors.trustBlue }]}>•</Text>
          <Text style={[styles.featureText, { color: colors.text }]}>
            Always accessible floating button
          </Text>
        </View>
        <View style={styles.featureItem}>
          <Text style={[styles.featureBullet, { color: CanaryColors.trustBlue }]}>•</Text>
          <Text style={[styles.featureText, { color: colors.text }]}>
            Instant scam analysis results
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[
          styles.toggleButton,
          { 
            backgroundColor: isEnabled ? colors.danger : CanaryColors.primary 
          }
        ]}
        onPress={toggleScanner}
        activeOpacity={0.8}
      >
        <Text style={styles.toggleButtonText}>
          {hasPermission 
            ? (isEnabled ? 'Disable Scanner' : 'Enable Scanner')
            : 'Grant Permissions'
          }
        </Text>
      </TouchableOpacity>

      {!hasPermission && (
        <Text style={[styles.permissionNote, { color: colors.icon }]}>
          Requires overlay and screen capture permissions
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  features: {
    marginBottom: 20,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  featureBullet: {
    fontSize: 18,
    marginRight: 8,
    marginTop: -2,
  },
  featureText: {
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  toggleButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  toggleButtonText: {
    color: '#1C1C1C',
    fontSize: 16,
    fontWeight: '600',
  },
  permissionNote: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
  },
  unavailableText: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});
