import { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ActivityIndicator,
  Alert,
  useColorScheme,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, CanaryColors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useFamily } from '@/contexts/FamilyContext';

export default function JoinFamilyScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { joinFamily, hasFamily } = useFamily();
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated) {
      // Store the invite code in AsyncStorage or state management
      // and redirect to login
      Alert.alert(
        'Sign In Required',
        'Please sign in or create an account to join this family.',
        [
          {
            text: 'Sign In',
            onPress: () => {
              // Store code for after auth
              router.replace(`/(auth)/login?redirect=/family/join/${code}`);
            },
          },
          {
            text: 'Create Account',
            onPress: () => {
              router.replace(`/(auth)/register?redirect=/family/join/${code}`);
            },
          },
        ]
      );
      return;
    }

    // User is authenticated, check if they already have a family
    if (hasFamily) {
      Alert.alert(
        'Already in a Family',
        'You are already part of a family. Leave your current family before joining a new one.',
        [
          {
            text: 'OK',
            onPress: () => router.replace('/(tabs)/family'),
          },
        ]
      );
      return;
    }

    // Attempt to join the family
    handleJoinFamily();
  }, [isAuthenticated, authLoading, hasFamily, code]);

  const handleJoinFamily = async () => {
    if (!code) {
      setError('Invalid invite code');
      return;
    }

    setIsJoining(true);
    setError(null);

    try {
      await joinFamily(code as string);
      Alert.alert(
        'Success!',
        'You have joined the family.',
        [
          {
            text: 'OK',
            onPress: () => router.replace('/(tabs)/family'),
          },
        ]
      );
    } catch (err: any) {
      console.error('Error joining family:', err);
      const errorMessage = err.message || 'Failed to join family. Please check the invite code.';
      setError(errorMessage);
      
      Alert.alert(
        'Error',
        errorMessage,
        [
          {
            text: 'Try Again',
            onPress: () => handleJoinFamily(),
          },
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => router.replace('/(tabs)/family'),
          },
        ]
      );
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        {isJoining || authLoading ? (
          <>
            <ActivityIndicator size="large" color={CanaryColors.primary} />
            <Text style={[styles.message, { color: colors.text }]}>
              {authLoading ? 'Loading...' : 'Joining family...'}
            </Text>
          </>
        ) : error ? (
          <>
            <Text style={[styles.errorIcon, { color: CanaryColors.alertRed }]}>✕</Text>
            <Text style={[styles.errorText, { color: colors.text }]}>
              {error}
            </Text>
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    gap: 16,
  },
  message: {
    fontSize: 18,
    textAlign: 'center',
  },
  errorIcon: {
    fontSize: 64,
    fontWeight: 'bold',
  },
  errorText: {
    fontSize: 18,
    textAlign: 'center',
    marginTop: 8,
  },
});
