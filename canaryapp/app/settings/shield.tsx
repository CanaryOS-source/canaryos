import { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Switch,
  ScrollView,
  Platform,
  useColorScheme,
  SafeAreaView,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Colors, CanaryColors } from '@/constants/theme';

// Conditionally import canary-shield (Android only)
const CanaryShield = Platform.OS === 'android'
  ? require('@/modules/canary-shield')
  : null;

// --- Types ---

interface PermissionInfo {
  readonly label: string;
  readonly granted: boolean;
  readonly openSettings: (() => void) | null;
}

interface Stats {
  readonly totalScreensProcessed: number;
  readonly totalScamsDetected: number;
  readonly averageLatencyMs: number;
}

// --- Constants ---

const MIN_THRESHOLD = 50;
const MAX_THRESHOLD = 95;
const DEFAULT_THRESHOLD = 70;

// --- Component ---

export default function ShieldSettingsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [shieldEnabled, setShieldEnabled] = useState(true);
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [permissions, setPermissions] = useState<readonly PermissionInfo[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalScreensProcessed: 0,
    totalScamsDetected: 0,
    averageLatencyMs: 0,
  });
  const [serviceAlive, setServiceAlive] = useState(true);

  // Refresh data on screen focus
  useFocusEffect(
    useCallback(() => {
      refreshData();
    }, [])
  );

  const refreshData = useCallback(async () => {
    if (!CanaryShield) return;

    // Check permissions
    const updatedPermissions: PermissionInfo[] = [
      {
        label: 'Accessibility Service',
        granted: CanaryShield.isAccessibilityServiceEnabled(),
        openSettings: () => CanaryShield.openAccessibilitySettings(),
      },
      {
        label: 'Overlay Permission',
        granted: CanaryShield.isOverlayPermissionGranted(),
        openSettings: () => CanaryShield.openOverlaySettings(),
      },
      {
        label: 'Notifications',
        granted: false, // Async check — simplified to false for sync rendering
        openSettings: null,
      },
      {
        label: 'Battery Optimization',
        granted: CanaryShield.isBatteryOptimizationExempt(),
        openSettings: () => CanaryShield.openBatteryOptimizationSettings(),
      },
    ];
    setPermissions(updatedPermissions);

    // Check service health
    const alive = CanaryShield.isServiceAlive();
    setServiceAlive(alive);

    // Fetch stats
    try {
      const detectionStats = await CanaryShield.getDetectionStats();
      setStats({
        totalScreensProcessed: detectionStats.totalScreensProcessed ?? 0,
        totalScamsDetected: detectionStats.totalScamsDetected ?? 0,
        averageLatencyMs: detectionStats.averageLatencyMs ?? 0,
      });
    } catch {
      // Stats unavailable — keep defaults
    }
  }, []);

  const handleToggleShield = useCallback((enabled: boolean) => {
    setShieldEnabled(enabled);
    if (CanaryShield) {
      CanaryShield.setShieldEnabled(enabled);
    }
  }, []);

  const handleThresholdChange = useCallback((value: number) => {
    const rounded = Math.round(value);
    setThreshold(rounded);
    if (CanaryShield) {
      CanaryShield.setConfidenceThreshold(rounded / 100);
    }
  }, []);

  const handleRerunSetup = useCallback(() => {
    router.push('/shield-setup');
  }, [router]);

  const handlePermissionTap = useCallback((permission: PermissionInfo) => {
    if (!permission.granted && permission.openSettings) {
      permission.openSettings();
    }
  }, []);

  // --- Render ---

  if (Platform.OS !== 'android') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.centered}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Shield is only available on Android
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <Text style={[styles.header, { color: colors.text }]}>Shield Settings</Text>

        {/* Service health warning */}
        {!serviceAlive && (
          <TouchableOpacity
            style={styles.warningBanner}
            onPress={() => {
              if (CanaryShield) {
                CanaryShield.openAccessibilitySettings();
              }
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.warningText}>
              Shield is not running. Tap to re-enable.
            </Text>
          </TouchableOpacity>
        )}

        {/* Shield toggle */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={[styles.toggleTitle, { color: colors.text }]}>
                Shield Protection
              </Text>
              <Text style={[styles.toggleDescription, { color: colors.icon }]}>
                System-wide scam detection
              </Text>
            </View>
            <Switch
              value={shieldEnabled}
              onValueChange={handleToggleShield}
              trackColor={{ false: colors.border, true: CanaryColors.primary }}
              thumbColor={shieldEnabled ? '#fff' : '#f4f3f4'}
            />
          </View>
        </View>

        {/* Permission Status */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Permission Status
          </Text>
          {permissions.map((perm, idx) => (
            <TouchableOpacity
              key={idx}
              style={styles.permissionRow}
              onPress={() => handlePermissionTap(perm)}
              disabled={perm.granted || !perm.openSettings}
              activeOpacity={0.7}
            >
              <Text style={[styles.permissionLabel, { color: colors.text }]}>
                {perm.label}
              </Text>
              <Text
                style={[
                  styles.permissionValue,
                  { color: perm.granted ? CanaryColors.trustBlue : CanaryColors.alertRed },
                ]}
              >
                {perm.granted ? 'Enabled' : 'Not set'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Sensitivity */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Sensitivity
          </Text>
          <Text style={[styles.sliderLabel, { color: colors.icon }]}>
            Detection Threshold
          </Text>
          <View style={styles.sliderRow}>
            <ThresholdSlider
              value={threshold}
              min={MIN_THRESHOLD}
              max={MAX_THRESHOLD}
              onValueChange={handleThresholdChange}
              accentColor={CanaryColors.primary}
              trackColor={colors.border}
            />
            <Text style={[styles.thresholdValue, { color: colors.text }]}>
              {threshold}%
            </Text>
          </View>
          <Text style={[styles.sliderHint, { color: colors.icon }]}>
            Higher = fewer false alarms
          </Text>
        </View>

        {/* Today's Activity */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Today's Activity
          </Text>
          <StatRow label="Screens analyzed" value={String(stats.totalScreensProcessed)} color={colors.text} />
          <StatRow label="Scams detected" value={String(stats.totalScamsDetected)} color={colors.text} />
          <StatRow
            label="Average detection time"
            value={`${Math.round(stats.averageLatencyMs)}ms`}
            color={colors.text}
          />
        </View>

        {/* About / Actions */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            About
          </Text>
          <StatRow label="Model version" value="v0.1 (dev)" color={colors.text} />
          <TouchableOpacity
            style={[styles.actionRow]}
            onPress={handleRerunSetup}
            activeOpacity={0.7}
          >
            <Text style={[styles.actionText, { color: CanaryColors.trustBlue }]}>
              Re-run Setup Wizard
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// --- Sub-components ---

interface StatRowProps {
  readonly label: string;
  readonly value: string;
  readonly color: string;
}

function StatRow({ label, value, color }: StatRowProps) {
  return (
    <View style={styles.statRow}>
      <Text style={[styles.statLabel, { color }]}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

interface ThresholdSliderProps {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly onValueChange: (value: number) => void;
  readonly accentColor: string;
  readonly trackColor: string;
}

function ThresholdSlider({ value, min, max, onValueChange, accentColor, trackColor }: ThresholdSliderProps) {
  // Use a simple touchable bar since RN doesn't have a built-in Slider on all platforms
  // For a production app, use @react-native-community/slider
  const percentage = ((value - min) / (max - min)) * 100;

  const handlePress = useCallback((event: { nativeEvent: { locationX: number } }) => {
    // Approximate width of slider track
    const trackWidth = 220;
    const x = Math.max(0, Math.min(event.nativeEvent.locationX, trackWidth));
    const newValue = min + (x / trackWidth) * (max - min);
    onValueChange(Math.round(newValue));
  }, [min, max, onValueChange]);

  return (
    <TouchableOpacity
      style={styles.sliderTrack}
      onPress={handlePress}
      activeOpacity={1}
    >
      <View style={[styles.sliderTrackBg, { backgroundColor: trackColor }]} />
      <View
        style={[
          styles.sliderFill,
          { backgroundColor: accentColor, width: `${percentage}%` },
        ]}
      />
      <View
        style={[
          styles.sliderThumb,
          { backgroundColor: accentColor, left: `${percentage}%` },
        ]}
      />
    </TouchableOpacity>
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
  content: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 24,
  },
  warningBanner: {
    backgroundColor: CanaryColors.alertRed,
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  warningText: {
    color: CanaryColors.white,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleInfo: {
    flex: 1,
    marginRight: 16,
  },
  toggleTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 2,
  },
  toggleDescription: {
    fontSize: 13,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 14,
  },
  permissionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  permissionLabel: {
    fontSize: 15,
  },
  permissionValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  sliderLabel: {
    fontSize: 14,
    marginBottom: 10,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sliderTrack: {
    flex: 1,
    height: 32,
    justifyContent: 'center',
    position: 'relative',
  },
  sliderTrackBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    borderRadius: 2,
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    height: 4,
    borderRadius: 2,
  },
  sliderThumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    marginLeft: -10,
    top: 6,
  },
  thresholdValue: {
    fontSize: 16,
    fontWeight: '600',
    minWidth: 40,
    textAlign: 'right',
  },
  sliderHint: {
    fontSize: 12,
    marginTop: 6,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  statLabel: {
    fontSize: 14,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  actionRow: {
    paddingVertical: 12,
  },
  actionText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
