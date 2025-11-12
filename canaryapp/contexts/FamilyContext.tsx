import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import {
  FamilyData,
  FamilyMember,
  getFamilyData,
  getFamilyMembers,
  createFamily as createFamilyService,
  joinFamilyByInviteCode as joinFamilyService,
  removeFamilyMember as removeFamilyMemberService,
  leaveFamily as leaveFamilyService,
  deleteFamily as deleteFamilyService,
  regenerateInviteCode as regenerateInviteCodeService,
} from '@/services/familyService';

interface FamilyContextType {
  family: FamilyData | null;
  members: FamilyMember[];
  loading: boolean;
  isAdmin: boolean;
  hasFamily: boolean;
  currentUserRole: 'admin' | 'member' | null;
  createFamily: (name?: string) => Promise<void>;
  joinFamily: (inviteCode: string) => Promise<void>;
  removeMember: (userId: string) => Promise<void>;
  leaveFamily: () => Promise<void>;
  deleteFamily: () => Promise<void>;
  regenerateInviteCode: () => Promise<string>;
  refreshFamily: () => Promise<void>;
}

const FamilyContext = createContext<FamilyContextType>({
  family: null,
  members: [],
  loading: true,
  isAdmin: false,
  hasFamily: false,
  currentUserRole: null,
  createFamily: async () => {},
  joinFamily: async () => {},
  removeMember: async () => {},
  leaveFamily: async () => {},
  deleteFamily: async () => {},
  regenerateInviteCode: async () => '',
  refreshFamily: async () => {},
});

export const useFamily = () => {
  const context = useContext(FamilyContext);
  if (!context) {
    throw new Error('useFamily must be used within a FamilyProvider');
  }
  return context;
};

interface FamilyProviderProps {
  children: ReactNode;
}

export const FamilyProvider: React.FC<FamilyProviderProps> = ({ children }) => {
  const { user, userData, isAuthenticated, refreshUserData } = useAuth();
  const [family, setFamily] = useState<FamilyData | null>(null);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);

  const familyId = userData?.familyId;
  const isAdmin = family?.adminId === user?.uid;
  const hasFamily = !!familyId;

  const currentUserRole: 'admin' | 'member' | null = hasFamily
    ? isAdmin
      ? 'admin'
      : 'member'
    : null;

  // Fetch family data when familyId changes
  const loadFamilyData = async () => {
    if (!familyId) {
      setFamily(null);
      setMembers([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const [familyData, familyMembers] = await Promise.all([
        getFamilyData(familyId),
        getFamilyMembers(familyId),
      ]);

      setFamily(familyData);
      setMembers(familyMembers);
    } catch (error) {
      console.error('Error loading family data:', error);
      setFamily(null);
      setMembers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadFamilyData();
    } else {
      setFamily(null);
      setMembers([]);
      setLoading(false);
    }
  }, [familyId, isAuthenticated]);

  // Create a new family
  const createFamily = async (name?: string) => {
    try {
      const newFamily = await createFamilyService(name);
      setFamily(newFamily);
      // Refresh user data to get updated familyId
      await refreshUserData();
      // Then load family data
      await loadFamilyData();
    } catch (error) {
      console.error('Error creating family:', error);
      throw error;
    }
  };

  // Join a family using invite code
  const joinFamily = async (inviteCode: string) => {
    try {
      await joinFamilyService(inviteCode);
      // Refresh user data to get updated familyId
      await refreshUserData();
      // Then load family data
      await loadFamilyData();
    } catch (error) {
      console.error('Error joining family:', error);
      throw error;
    }
  };

  // Remove a member from the family (admin only)
  const removeMember = async (userId: string) => {
    if (!familyId) throw new Error('No family to remove member from');
    try {
      await removeFamilyMemberService(familyId, userId);
      // Refresh members list
      await loadFamilyData();
    } catch (error) {
      console.error('Error removing member:', error);
      throw error;
    }
  };

  // Leave the family (member only)
  const leaveFamily = async () => {
    if (!familyId) throw new Error('No family to leave');
    try {
      await leaveFamilyService(familyId);
      // Refresh user data to clear familyId
      await refreshUserData();
      setFamily(null);
      setMembers([]);
    } catch (error) {
      console.error('Error leaving family:', error);
      throw error;
    }
  };

  // Delete the family (admin only)
  const deleteFamily = async () => {
    if (!familyId) throw new Error('No family to delete');
    try {
      await deleteFamilyService(familyId);
      // Refresh user data to clear familyId
      await refreshUserData();
      setFamily(null);
      setMembers([]);
    } catch (error) {
      console.error('Error deleting family:', error);
      throw error;
    }
  };

  // Regenerate invite code (admin only)
  const regenerateInviteCode = async (): Promise<string> => {
    if (!familyId) throw new Error('No family to regenerate code for');
    try {
      const newCode = await regenerateInviteCodeService(familyId);
      // Refresh family data to get the new code
      await loadFamilyData();
      return newCode;
    } catch (error) {
      console.error('Error regenerating invite code:', error);
      throw error;
    }
  };

  // Manual refresh function
  const refreshFamily = async () => {
    await loadFamilyData();
  };

  const value: FamilyContextType = {
    family,
    members,
    loading,
    isAdmin,
    hasFamily,
    currentUserRole,
    createFamily,
    joinFamily,
    removeMember,
    leaveFamily,
    deleteFamily,
    regenerateInviteCode,
    refreshFamily,
  };

  return <FamilyContext.Provider value={value}>{children}</FamilyContext.Provider>;
};
