import { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Text,
  TouchableOpacity,
  Switch,
  Alert,
  Platform,
  useColorScheme,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { Colors, CanaryColors } from '@/constants/theme';
import { FloatingScanner } from '@/components/floating-scanner';
import { useAuth } from '@/contexts/AuthContext';
import { signOut, deleteAccount } from '@/services/firebase';

export default function SettingsScreen() {
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { user, userData } = useAuth();

  useEffect(() => {
    checkNotificationPermissions();
  }, []);

  const checkNotificationPermissions = async () => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      setNotificationsEnabled(status === 'granted');
    } catch (error) {
      console.error('Error checking notification permissions:', error);
    }
  };

  const toggleNotifications = async () => {
    try {
      if (notificationsEnabled) {
        // If currently enabled, show confirmation before disabling
        Alert.alert(
          'Disable Notifications',
          'You will no longer receive scam alerts and security updates. You can re-enable notifications in your device settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Disable',
              style: 'destructive',
              onPress: () => {
                setNotificationsEnabled(false);
                Alert.alert(
                  'Notifications Disabled',
                  'To re-enable, please go to your device settings.'
                );
              },
            },
          ]
        );
      } else {
        // Request permissions
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus === 'granted') {
          setNotificationsEnabled(true);
          Alert.alert(
            'Notifications Enabled',
            'You will now receive important scam alerts and security updates.'
          );
        } else {
          Alert.alert(
            'Permission Denied',
            'Please enable notifications in your device settings to receive scam alerts.'
          );
        }
      }
    } catch (error) {
      console.error('Error toggling notifications:', error);
      Alert.alert('Error', 'Failed to change notification settings');
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            setIsLoggingOut(true);
            try {
              await signOut();
            } catch (error) {
              console.error('Error signing out:', error);
              Alert.alert('Error', 'Failed to sign out. Please try again.');
            } finally {
              setIsLoggingOut(false);
            }
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? This action cannot be undone and all your data will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Confirm Deletion',
              'Please type "DELETE" to confirm account deletion',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Confirm',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await deleteAccount();
                      Alert.alert('Account Deleted', 'Your account has been permanently deleted.');
                    } catch (error: any) {
                      let errorMessage = 'Failed to delete account. Please try again.';
                      
                      if (error.code === 'auth/requires-recent-login') {
                        errorMessage = 'For security, please sign out and sign in again before deleting your account.';
                      }
                      
                      Alert.alert('Error', errorMessage);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.contentContainer}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
        <Text style={[styles.subtitle, { color: colors.icon }]}>
          Manage your Canary preferences
        </Text>
      </View>

      {/* Notifications Section */}
      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={[styles.settingTitle, { color: colors.text }]}>
              Notifications
            </Text>
            <Text style={[styles.settingDescription, { color: colors.icon }]}>
              Receive alerts about potential scams and security updates
            </Text>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={toggleNotifications}
            trackColor={{
              false: colors.border,
              true: CanaryColors.primary,
            }}
            thumbColor={notificationsEnabled ? '#fff' : '#f4f3f4'}
            ios_backgroundColor={colors.border}
          />
        </View>

        {notificationsEnabled && (
          <View style={[styles.infoBox, { backgroundColor: CanaryColors.trustBlue + '20' }]}>
            <Text style={[styles.infoText, { color: colors.text }]}>
              ✓ You'll be notified when:
            </Text>
            <Text style={[styles.infoItem, { color: colors.text }]}>
              • A potential scam is detected
            </Text>
            <Text style={[styles.infoItem, { color: colors.text }]}>
              • New scam patterns are identified
            </Text>
            <Text style={[styles.infoItem, { color: colors.text }]}>
              • Important security updates are available
            </Text>
          </View>
        )}
      </View>

      {/* Floating Scanner Section */}
      <View style={styles.scannerSection}>
        <FloatingScanner />
      </View>

      {/* Account Section */}
      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <Text style={[styles.sectionHeader, { color: colors.text }]}>Account</Text>
        
        {userData && (
          <View style={styles.accountInfo}>
            <Text style={[styles.accountLabel, { color: colors.icon }]}>Email</Text>
            <Text style={[styles.accountValue, { color: colors.text }]}>{userData.email}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: CanaryColors.trustBlue }]}
          onPress={handleLogout}
          disabled={isLoggingOut}
        >
          <Text style={styles.actionButtonText}>
            {isLoggingOut ? 'Signing Out...' : 'Sign Out'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.dangerButton, { backgroundColor: CanaryColors.alertRed }]}
          onPress={handleDeleteAccount}
          disabled={isLoggingOut}
        >
          <Text style={styles.actionButtonText}>Delete Account</Text>
        </TouchableOpacity>
      </View>

      {/* App Info */}
      <View style={[styles.appInfo, { borderTopColor: colors.border }]}>
        <Text style={[styles.appInfoText, { color: colors.icon }]}>
          Canary OS v1.0.0
        </Text>
        <Text style={[styles.appInfoText, { color: colors.icon }]}>
          Powered by Google Gemini AI
        </Text>
      </View>
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
    marginBottom: 30,
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
  section: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  infoBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
  },
  infoText: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  infoItem: {
    fontSize: 13,
    lineHeight: 20,
    marginLeft: 8,
  },
  scannerSection: {
    marginBottom: 30,
  },
  sectionHeader: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
  },
  accountInfo: {
    marginBottom: 20,
  },
  accountLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  accountValue: {
    fontSize: 16,
  },
  actionButton: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  dangerButton: {
    marginTop: 8,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  appInfo: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    alignItems: 'center',
    gap: 4,
  },
  appInfoText: {
    fontSize: 12,
  },
});
