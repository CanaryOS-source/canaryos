// Platform-agnostic Firebase service wrapper
import { Platform } from 'react-native';

// Import the appropriate Firebase service based on platform
const firebaseService = Platform.select({
  web: () => require('./firebaseWeb'),
  default: () => require('./firebaseNative'),
})();

// Re-export all functions from the selected service
export const {
  createAccount,
  signIn,
  signInWithGoogle,
  signOut,
  deleteAccount,
  getUserData,
  subscribeToAuthState,
  auth,
} = firebaseService;

export type { UserData } from './firebaseWeb';
