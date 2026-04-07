import { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  AppState,
  Platform,
  useColorScheme,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, CanaryColors } from '@/constants/theme';

// Conditionally import canary-shield (Android only)
const CanaryShield = Platform.OS === 'android'
  ? require('@/modules/canary-shield')
  : null;

// --- Types ---

interface PermissionStep {
  readonly key: string;
  readonly title: string;
  readonly body: string;
  readonly optional: boolean;
  readonly checkGranted: () => boolean;
  readonly requestPermission: () => void;
}

interface PermissionStatus {
  readonly notifications: boolean;
  readonly overlay: boolean;
  readonly accessibility: boolean;
  readonly battery: boolean;
}

// --- Constants ---

const STORAGE_KEY = 'shield_setup_complete';
const RECHECK_DELAY_MS = 500;

// --- Helpers ---

function requestNotificationPermission(): void {
  if (Platform.OS !== 'android') return;
  // Use PermissionsAndroid for POST_NOTIFICATIONS on Android 13+
  const { PermissionsAndroid } = require('react-native');
  PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
  ).catch(() => {});
}

function checkNotificationPermission(): boolean {
  // Notification permission check is async, but we use sync bridge checks
  // For step auto-skip, we rely on the bridge where available
  return false;
}

function buildSteps(): readonly PermissionStep[] {
  if (!CanaryShield) return [];

  return [
    {
      key: 'notifications',
      title: 'Stay Informed',
      body: 'CanaryOS needs to send you alerts when a potential scam is detected.',
      optional: false,
      checkGranted: checkNotificationPermission,
      requestPermission: requestNotificationPermission,
    },
    {
      key: 'overlay',
      title: 'See Warnings Instantly',
      body: 'CanaryOS shows a warning on top of any app when a scam is detected. This requires the "Display over other apps" permission.',
      optional: false,
      checkGranted: () => CanaryShield.isOverlayPermissionGranted(),
      requestPermission: () => CanaryShield.openOverlaySettings(),
    },
    {
      key: 'accessibility',
      title: 'System-Wide Protection',
      body: 'To scan screens across all apps, CanaryOS uses Android\'s Accessibility Service to read screen text. All processing is 100% on-device -- your data never leaves your phone.',
      optional: false,
      checkGranted: () => CanaryShield.isAccessibilityServiceEnabled(),
      requestPermission: () => CanaryShield.openAccessibilitySettings(),
    },
    {
      key: 'battery',
      title: 'Reliable Protection',
      body: 'For uninterrupted protection, allow CanaryOS to run without battery restrictions.',
      optional: true,
      checkGranted: () => CanaryShield.isBatteryOptimizationExempt(),
      requestPermission: () => CanaryShield.openBatteryOptimizationSettings(),
    },
  ] as const;
}

// --- Component ---

export default function ShieldSetupScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const steps = useRef(buildSteps()).current;
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>({
    notifications: false,
    overlay: false,
    accessibility: false,
    battery: false,
  });

  const appStateRef = useRef(AppState.currentState);

  // Check all permission statuses
  const recheckPermissions = useCallback((): PermissionStatus => {
    if (!CanaryShield) {
      return { notifications: false, overlay: false, accessibility: false, battery: false };
    }
    return {
      notifications: false, // Notifications checked via async API separately
      overlay: CanaryShield.isOverlayPermissionGranted(),
      accessibility: CanaryShield.isAccessibilityServiceEnabled(),
      battery: CanaryShield.isBatteryOptimizationExempt(),
    };
  }, []);

  // Auto-detect permission grants when returning from Settings
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        // Delay recheck to let OS update permission state
        setTimeout(() => {
          const updated = recheckPermissions();
          setPermissionStatus(updated);

          // Auto-advance if current step's permission was granted
          if (!isComplete && currentStepIndex < steps.length) {
            const currentStep = steps[currentStepIndex];
            if (currentStep && currentStep.checkGranted()) {
              advanceToNextStep(currentStepIndex);
            }
          }
        }, RECHECK_DELAY_MS);
      }
      appStateRef.current = nextState;
    });

    return () => subscription.remove();
  }, [currentStepIndex, isComplete, recheckPermissions, steps]);

  // Skip already-granted permissions on mount
  useEffect(() => {
    if (steps.length === 0) return;
    let idx = 0;
    while (idx < steps.length && steps[idx].checkGranted()) {
      idx++;
    }
    if (idx >= steps.length) {
      setIsComplete(true);
    } else {
      setCurrentStepIndex(idx);
    }
    setPermissionStatus(recheckPermissions());
  }, [steps, recheckPermissions]);

  const advanceToNextStep = useCallback((fromIndex: number) => {
    let nextIdx = fromIndex + 1;
    // Skip already-granted steps
    while (nextIdx < steps.length && steps[nextIdx].checkGranted()) {
      nextIdx++;
    }
    if (nextIdx >= steps.length) {
      setIsComplete(true);
      setPermissionStatus(recheckPermissions());
    } else {
      setCurrentStepIndex(nextIdx);
    }
  }, [steps, recheckPermissions]);

  const handleGrant = useCallback(() => {
    if (currentStepIndex < steps.length) {
      steps[currentStepIndex].requestPermission();
    }
  }, [currentStepIndex, steps]);

  const handleSkip = useCallback(() => {
    advanceToNextStep(currentStepIndex);
  }, [currentStepIndex, advanceToNextStep]);

  const handleDone = useCallback(async () => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // Non-critical — worst case user sees setup again
    }
    router.replace('/(tabs)');
  }, [router]);

  // --- Render ---

  if (Platform.OS !== 'android') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.centered}>
          <Text style={[styles.title, { color: colors.text }]}>
            Shield is only available on Android
          </Text>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: CanaryColors.primary }]}
            onPress={() => router.replace('/(tabs)')}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (isComplete) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: CanaryColors.secondary }]}>
        <View style={styles.centered}>
          <Text style={[styles.completionTitle, { color: CanaryColors.white }]}>
            Shield Active
          </Text>
          <Text style={[styles.completionSubtitle, { color: '#999' }]}>
            Your phone is now protected
          </Text>

          <View style={styles.statusDashboard}>
            <PermissionRow
              label="Accessibility Service"
              granted={permissionStatus.accessibility}
            />
            <PermissionRow
              label="Overlay Permission"
              granted={permissionStatus.overlay}
            />
            <PermissionRow
              label="Notifications"
              granted={permissionStatus.notifications}
            />
            <PermissionRow
              label="Battery Optimization"
              granted={permissionStatus.battery}
              optional
            />
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: CanaryColors.primary }]}
            onPress={handleDone}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const currentStep = steps[currentStepIndex];
  if (!currentStep) return null;

  const stepNumber = currentStepIndex + 1;
  const totalSteps = steps.length;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: CanaryColors.secondary }]}>
      {/* Progress indicator */}
      <View style={styles.progressBar}>
        {steps.map((_, idx) => (
          <View
            key={idx}
            style={[
              styles.progressDot,
              {
                backgroundColor: idx <= currentStepIndex
                  ? CanaryColors.primary
                  : '#444',
              },
            ]}
          />
        ))}
      </View>

      <View style={styles.stepContent}>
        <Text style={styles.stepCounter}>
          Step {stepNumber} of {totalSteps}
        </Text>

        <Text style={[styles.title, { color: CanaryColors.white }]}>
          {currentStep.title}
        </Text>

        <Text style={styles.body}>
          {currentStep.body}
        </Text>

        {currentStep.optional && (
          <Text style={styles.optionalLabel}>
            This step is optional
          </Text>
        )}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: CanaryColors.primary }]}
          onPress={handleGrant}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryButtonText}>
            {currentStep.key === 'notifications' ? 'Allow Notifications' : 'Open Settings'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.skipButton}
          onPress={handleSkip}
          activeOpacity={0.7}
        >
          <Text style={styles.skipButtonText}>
            {currentStep.optional ? 'Skip' : 'Skip for now'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// --- Sub-component ---

interface PermissionRowProps {
  readonly label: string;
  readonly granted: boolean;
  readonly optional?: boolean;
}

function PermissionRow({ label, granted, optional = false }: PermissionRowProps) {
  return (
    <View style={styles.permissionRow}>
      <Text style={styles.permissionLabel}>{label}</Text>
      <Text
        style={[
          styles.permissionStatus,
          { color: granted ? CanaryColors.trustBlue : optional ? '#666' : CanaryColors.alertRed },
        ]}
      >
        {granted ? 'Enabled' : optional ? 'Not set' : 'Not granted'}
      </Text>
    </View>
  );
}

// --- Styles ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  progressBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 60,
    paddingBottom: 20,
  },
  progressDot: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  stepContent: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  stepCounter: {
    color: '#888',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  body: {
    color: '#CCC',
    fontSize: 16,
    lineHeight: 24,
  },
  optionalLabel: {
    color: CanaryColors.primary,
    fontSize: 13,
    fontWeight: '500',
    marginTop: 12,
  },
  actions: {
    paddingHorizontal: 32,
    paddingBottom: 40,
    gap: 16,
  },
  primaryButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: CanaryColors.secondary,
    fontSize: 17,
    fontWeight: '600',
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  skipButtonText: {
    color: '#888',
    fontSize: 15,
  },
  completionTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  completionSubtitle: {
    fontSize: 16,
    marginBottom: 40,
  },
  statusDashboard: {
    width: '100%',
    marginBottom: 40,
  },
  permissionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  permissionLabel: {
    color: '#CCC',
    fontSize: 15,
  },
  permissionStatus: {
    fontSize: 14,
    fontWeight: '600',
  },
});
