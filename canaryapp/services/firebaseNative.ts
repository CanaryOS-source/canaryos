// Firebase Native SDK implementation for iOS and Android
import auth from '@react-native-firebase/auth';
import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { GOOGLE_WEB_CLIENT_ID } from '@/config/firebase';

// Configure Google Sign-In
GoogleSignin.configure({
  webClientId: GOOGLE_WEB_CLIENT_ID,
});

export interface UserData {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  createdAt: FirebaseFirestoreTypes.Timestamp;
  lastLoginAt: FirebaseFirestoreTypes.Timestamp;
  familyId?: string | null;
}

// Authentication functions
export const createAccount = async (email: string, password: string) => {
  try {
    const userCredential = await auth().createUserWithEmailAndPassword(email, password);
    const user = userCredential.user;

    // Create user document in Firestore
    await firestore().collection('users').doc(user.uid).set({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || null,
      photoURL: user.photoURL || null,
      createdAt: firestore.FieldValue.serverTimestamp(),
      lastLoginAt: firestore.FieldValue.serverTimestamp(),
    });

    return user;
  } catch (error: any) {
    console.error('Error creating account:', error);
    throw error;
  }
};

export const signIn = async (email: string, password: string) => {
  try {
    const userCredential = await auth().signInWithEmailAndPassword(email, password);
    const user = userCredential.user;

    // Update last login time
    await firestore().collection('users').doc(user.uid).set(
      { lastLoginAt: firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );

    return user;
  } catch (error: any) {
    console.error('Error signing in:', error);
    throw error;
  }
};

export const signInWithGoogle = async () => {
  try {
    // Check if device supports Google Play
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    // Get user info and ID token
    const userInfo = await GoogleSignin.signIn();
    const idToken = userInfo.data?.idToken;

    if (!idToken) {
      throw new Error('No ID token received from Google Sign-In');
    }

    // Create a Google credential with the token
    const googleCredential = auth.GoogleAuthProvider.credential(idToken);

    // Sign in with the credential
    const userCredential = await auth().signInWithCredential(googleCredential);
    const user = userCredential.user;

    // Check if user document exists
    const userDocRef = firestore().collection('users').doc(user.uid);
    const userDoc = await userDocRef.get();

    if (!userDoc.exists) {
      // Create new user document
      await userDocRef.set({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || null,
        photoURL: user.photoURL || null,
        createdAt: firestore.FieldValue.serverTimestamp(),
        lastLoginAt: firestore.FieldValue.serverTimestamp(),
      });
    } else {
      // Update last login time
      await userDocRef.set(
        { lastLoginAt: firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
    }

    return user;
  } catch (error: any) {
    console.error('Error signing in with Google:', error);
    throw error;
  }
};

export const signOut = async () => {
  try {
    // Sign out from Google if applicable
    try {
      await GoogleSignin.signOut();
    } catch (e) {
      // User may not be signed in with Google
    }
    await auth().signOut();
  } catch (error: any) {
    console.error('Error signing out:', error);
    throw error;
  }
};

export const deleteAccount = async () => {
  try {
    const user = auth().currentUser;
    if (!user) throw new Error('No user logged in');

    // Delete user document from Firestore
    await firestore().collection('users').doc(user.uid).delete();

    // Sign out from Google if applicable
    try {
      await GoogleSignin.signOut();
    } catch (e) {
      // User may not be signed in with Google
    }

    // Delete user authentication
    await user.delete();
  } catch (error: any) {
    console.error('Error deleting account:', error);
    throw error;
  }
};

export const getUserData = async (uid: string): Promise<UserData | null> => {
  try {
    const userDoc = await firestore().collection('users').doc(uid).get();
    if (userDoc.exists()) {
      return userDoc.data() as UserData;
    }
    return null;
  } catch (error: any) {
    console.error('Error getting user data:', error);
    throw error;
  }
};

export const subscribeToAuthState = (callback: (user: any) => void) => {
  return auth().onAuthStateChanged(callback);
};

export { auth, firestore };
