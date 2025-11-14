// Analytics service implementation for web platform
import { getFirestore, doc, getDoc, setDoc, updateDoc, increment, serverTimestamp, Timestamp } from 'firebase/firestore';
import { auth, db } from './firebaseWeb';

export interface UserAnalytics {
  userId: string;
  scamsDetected: number;
  scamsBlocked: number;
  scamsReported: number;
  recentScams: number; // Last 30 days
  totalScans: number;
  activeDays: number;
  lastActive: Timestamp;
  riskScore: number; // 0-100
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Get user analytics
export const getUserAnalytics = async (userId: string): Promise<UserAnalytics | null> => {
  try {
    const analyticsDoc = await getDoc(doc(db, 'analytics', userId));
    
    if (analyticsDoc.exists()) {
      return analyticsDoc.data() as UserAnalytics;
    }
    
    // Return default analytics if none exist
    return {
      userId,
      scamsDetected: 0,
      scamsBlocked: 0,
      scamsReported: 0,
      recentScams: 0,
      totalScans: 0,
      activeDays: 0,
      lastActive: serverTimestamp() as Timestamp,
      riskScore: 0,
      createdAt: serverTimestamp() as Timestamp,
      updatedAt: serverTimestamp() as Timestamp,
    };
  } catch (error: any) {
    console.error('Error getting user analytics:', error);
    throw error;
  }
};

// Initialize analytics for a new user
export const initializeAnalytics = async (userId: string): Promise<void> => {
  try {
    const analyticsRef = doc(db, 'analytics', userId);
    const analyticsDoc = await getDoc(analyticsRef);
    
    if (!analyticsDoc.exists()) {
      await setDoc(analyticsRef, {
        userId,
        scamsDetected: 0,
        scamsBlocked: 0,
        scamsReported: 0,
        recentScams: 0,
        totalScans: 0,
        activeDays: 1,
        lastActive: serverTimestamp(),
        riskScore: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error: any) {
    console.error('Error initializing analytics:', error);
    throw error;
  }
};

// Record a scan
export const recordScan = async (userId: string, isScam: boolean): Promise<void> => {
  try {
    const analyticsRef = doc(db, 'analytics', userId);
    const analyticsDoc = await getDoc(analyticsRef);
    
    if (!analyticsDoc.exists()) {
      await initializeAnalytics(userId);
      // Fetch again after initialization
      const freshDoc = await getDoc(analyticsRef);
      if (!freshDoc.exists()) {
        console.error('Failed to initialize analytics');
        return;
      }
    }
    
    // Refresh doc data after potential initialization
    const currentDoc = await getDoc(analyticsRef);
    const currentData = currentDoc.data();
    
    const updates: any = {
      totalScans: increment(1),
      lastActive: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    
    if (isScam) {
      updates.scamsDetected = increment(1);
      updates.recentScams = increment(1);
      updates.scamsBlocked = increment(1);
      
      // Update risk score (increase by 5 for each scam, max 100)
      const currentRiskScore = currentData?.riskScore || 0;
      updates.riskScore = Math.min(currentRiskScore + 5, 100);
    }
    
    await updateDoc(analyticsRef, updates);
  } catch (error: any) {
    console.error('Error recording scan:', error);
    // Don't throw - just log to avoid breaking scan flow
  }
};

// Record a reported scam
export const recordScamReport = async (userId: string): Promise<void> => {
  try {
    const analyticsRef = doc(db, 'analytics', userId);
    
    await updateDoc(analyticsRef, {
      scamsReported: increment(1),
      updatedAt: serverTimestamp(),
    });
  } catch (error: any) {
    console.error('Error recording scam report:', error);
    throw error;
  }
};

// Update activity (called when user opens app)
export const updateActivity = async (userId: string): Promise<void> => {
  try {
    const analyticsRef = doc(db, 'analytics', userId);
    const analyticsDoc = await getDoc(analyticsRef);
    
    if (!analyticsDoc.exists()) {
      // Initialize and we're done - initialization sets lastActive
      await initializeAnalytics(userId);
      return;
    }
    
    const data = analyticsDoc.data();
    const lastActive = data?.lastActive as Timestamp;
    const now = new Date();
    const lastActiveDate = lastActive?.toDate();
    
    // Check if this is a new day
    const isNewDay = lastActiveDate && 
                     (now.getDate() !== lastActiveDate.getDate() || 
                      now.getMonth() !== lastActiveDate.getMonth() || 
                      now.getFullYear() !== lastActiveDate.getFullYear());
    
    if (isNewDay) {
      await updateDoc(analyticsRef, {
        activeDays: increment(1),
        lastActive: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(analyticsRef, {
        lastActive: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error: any) {
    console.error('Error updating activity:', error);
    // Don't throw - just log the error to avoid breaking app launch
  }
};

// Update protection score - now deprecated, no-op function for backwards compatibility
export const updateProtectionScore = async (userId: string): Promise<void> => {
  // Protection score merged with risk score, no longer needed
  return;
};

// Decay recent scams count (should be run periodically, e.g., daily)
export const decayRecentScams = async (userId: string): Promise<void> => {
  try {
    const analyticsRef = doc(db, 'analytics', userId);
    const analyticsDoc = await getDoc(analyticsRef);
    
    if (!analyticsDoc.exists()) {
      return;
    }
    
    const data = analyticsDoc.data();
    const recentScams = data?.recentScams || 0;
    
    // Decay by 10% each day
    const newRecentScams = Math.max(0, Math.floor(recentScams * 0.9));
    
    await updateDoc(analyticsRef, {
      recentScams: newRecentScams,
      riskScore: Math.max(0, (data?.riskScore || 0) - 1), // Slowly decrease risk
      updatedAt: serverTimestamp(),
    });
  } catch (error: any) {
    console.error('Error decaying recent scams:', error);
    throw error;
  }
};
