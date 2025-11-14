import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { subscribeToAuthState, getUserData, UserData } from '@/services/firebase';
import { initializeAnalytics, updateActivity } from '@/services/analyticsService';

interface AuthContextType {
  user: any | null;
  userData: UserData | null;
  loading: boolean;
  isAuthenticated: boolean;
  refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userData: null,
  loading: true,
  isAuthenticated: false,
  refreshUserData: async () => {},
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  // Function to manually refresh user data
  const refreshUserData = async () => {
    if (user) {
      try {
        const data = await getUserData(user.uid);
        setUserData(data);
      } catch (error) {
        console.error('Error refreshing user data:', error);
      }
    }
  };

  useEffect(() => {
    const unsubscribe = subscribeToAuthState(async (authUser: any) => {
      setUser(authUser);
      
      if (authUser) {
        try {
          const data = await getUserData(authUser.uid);
          setUserData(data);
          
          // Initialize analytics and track activity
          // Run async without blocking auth flow
          initializeAnalytics(authUser.uid)
            .then(() => updateActivity(authUser.uid))
            .catch((analyticsError: any) => {
              console.error('Error with analytics:', analyticsError);
            });
        } catch (error) {
          console.error('Error fetching user data:', error);
          setUserData(null);
        }
      } else {
        setUserData(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const value = {
    user,
    userData,
    loading,
    isAuthenticated: !!user,
    refreshUserData,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
