// Family service implementation for web platform
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  updateDoc,
  serverTimestamp,
  Timestamp,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { auth, db } from './firebaseWeb';

export interface FamilyData {
  id: string;
  adminId: string;
  name?: string;
  createdAt: Timestamp;
  inviteCode: string;
  memberIds: string[];
}

export interface FamilyMember {
  userId: string;
  role: 'admin' | 'member';
  joinedAt: Timestamp;
  displayName?: string;
  email?: string;
}

// Generate a unique invite code
const generateInviteCode = (): string => {
  const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return code;
};

// Create a new family
export const createFamily = async (name?: string): Promise<FamilyData> => {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('No user logged in');

    // Check if user already has a family
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const userData = userDoc.data();
    if (userData?.familyId) {
      throw new Error('User already belongs to a family');
    }

    // Generate unique invite code
    let inviteCode = generateInviteCode();
    let isUnique = false;
    
    while (!isUnique) {
      const familiesQuery = query(
        collection(db, 'families'),
        where('inviteCode', '==', inviteCode)
      );
      const existingFamilies = await getDocs(familiesQuery);
      if (existingFamilies.empty) {
        isUnique = true;
      } else {
        inviteCode = generateInviteCode();
      }
    }

    // Create family document
    const familyRef = doc(collection(db, 'families'));
    const familyData: Omit<FamilyData, 'id'> = {
      adminId: user.uid,
      name: name || `${userData?.displayName || 'My'}'s Family`,
      createdAt: serverTimestamp() as Timestamp,
      inviteCode,
      memberIds: [user.uid],
    };

    await setDoc(familyRef, familyData);

    // Create admin member document
    await setDoc(doc(db, 'families', familyRef.id, 'members', user.uid), {
      userId: user.uid,
      role: 'admin',
      joinedAt: serverTimestamp(),
      displayName: userData?.displayName || null,
      email: user.email,
    });

    // Update user document with familyId
    await updateDoc(doc(db, 'users', user.uid), {
      familyId: familyRef.id,
    });

    return { id: familyRef.id, ...familyData };
  } catch (error: any) {
    console.error('Error creating family:', error);
    throw error;
  }
};

// Get family data by ID
export const getFamilyData = async (familyId: string): Promise<FamilyData | null> => {
  try {
    const familyDoc = await getDoc(doc(db, 'families', familyId));
    if (familyDoc.exists()) {
      return { id: familyDoc.id, ...familyDoc.data() } as FamilyData;
    }
    return null;
  } catch (error: any) {
    console.error('Error getting family data:', error);
    throw error;
  }
};

// Get all family members
export const getFamilyMembers = async (familyId: string): Promise<FamilyMember[]> => {
  try {
    const membersSnapshot = await getDocs(
      collection(db, 'families', familyId, 'members')
    );
    return membersSnapshot.docs.map(doc => doc.data() as FamilyMember);
  } catch (error: any) {
    console.error('Error getting family members:', error);
    throw error;
  }
};

// Join family using invite code
export const joinFamilyByInviteCode = async (inviteCode: string): Promise<string> => {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('No user logged in');

    // Check if user already has a family
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const userData = userDoc.data();
    if (userData?.familyId) {
      throw new Error('User already belongs to a family');
    }

    // Find family with invite code
    const familiesQuery = query(
      collection(db, 'families'),
      where('inviteCode', '==', inviteCode.toUpperCase())
    );
    const familiesSnapshot = await getDocs(familiesQuery);

    if (familiesSnapshot.empty) {
      throw new Error('Invalid invite code');
    }

    const familyDoc = familiesSnapshot.docs[0];
    const familyId = familyDoc.id;

    // Add member to family
    await setDoc(doc(db, 'families', familyId, 'members', user.uid), {
      userId: user.uid,
      role: 'member',
      joinedAt: serverTimestamp(),
      displayName: userData?.displayName || null,
      email: user.email,
    });

    // Update family memberIds array
    await updateDoc(doc(db, 'families', familyId), {
      memberIds: arrayUnion(user.uid),
    });

    // Update user document with familyId
    await updateDoc(doc(db, 'users', user.uid), {
      familyId,
    });

    return familyId;
  } catch (error: any) {
    console.error('Error joining family:', error);
    throw error;
  }
};

// Remove a member from family (admin only)
export const removeFamilyMember = async (familyId: string, targetUserId: string): Promise<void> => {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('No user logged in');

    // Check if current user is admin
    const familyDoc = await getDoc(doc(db, 'families', familyId));
    const familyData = familyDoc.data();
    
    if (familyData?.adminId !== user.uid) {
      throw new Error('Only admin can remove members');
    }

    if (targetUserId === user.uid) {
      throw new Error('Admin cannot remove themselves. Delete the family instead.');
    }

    // Remove member document
    await deleteDoc(doc(db, 'families', familyId, 'members', targetUserId));

    // Update family memberIds array
    await updateDoc(doc(db, 'families', familyId), {
      memberIds: arrayRemove(targetUserId),
    });

    // Remove familyId from user document
    await updateDoc(doc(db, 'users', targetUserId), {
      familyId: null,
    });
  } catch (error: any) {
    console.error('Error removing family member:', error);
    throw error;
  }
};

// Leave family (member only)
export const leaveFamily = async (familyId: string): Promise<void> => {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('No user logged in');

    // Check if user is admin
    const familyDoc = await getDoc(doc(db, 'families', familyId));
    const familyData = familyDoc.data();
    
    if (familyData?.adminId === user.uid) {
      throw new Error('Admin must delete the family or transfer ownership');
    }

    // Remove member document
    await deleteDoc(doc(db, 'families', familyId, 'members', user.uid));

    // Update family memberIds array
    await updateDoc(doc(db, 'families', familyId), {
      memberIds: arrayRemove(user.uid),
    });

    // Remove familyId from user document
    await updateDoc(doc(db, 'users', user.uid), {
      familyId: null,
    });
  } catch (error: any) {
    console.error('Error leaving family:', error);
    throw error;
  }
};

// Delete entire family (admin only)
export const deleteFamily = async (familyId: string): Promise<void> => {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('No user logged in');

    // Check if current user is admin
    const familyDoc = await getDoc(doc(db, 'families', familyId));
    const familyData = familyDoc.data();
    
    if (familyData?.adminId !== user.uid) {
      throw new Error('Only admin can delete the family');
    }

    // Get all members
    const membersSnapshot = await getDocs(
      collection(db, 'families', familyId, 'members')
    );

    // Remove familyId from all user documents
    const updatePromises = membersSnapshot.docs.map(memberDoc =>
      updateDoc(doc(db, 'users', memberDoc.id), { familyId: null })
    );
    await Promise.all(updatePromises);

    // Delete all member documents
    const deletePromises = membersSnapshot.docs.map(memberDoc =>
      deleteDoc(doc(db, 'families', familyId, 'members', memberDoc.id))
    );
    await Promise.all(deletePromises);

    // Delete family document
    await deleteDoc(doc(db, 'families', familyId));
  } catch (error: any) {
    console.error('Error deleting family:', error);
    throw error;
  }
};

// Regenerate invite code (admin only)
export const regenerateInviteCode = async (familyId: string): Promise<string> => {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('No user logged in');

    // Check if current user is admin
    const familyDoc = await getDoc(doc(db, 'families', familyId));
    const familyData = familyDoc.data();
    
    if (familyData?.adminId !== user.uid) {
      throw new Error('Only admin can regenerate invite code');
    }

    // Generate new unique invite code
    let inviteCode = generateInviteCode();
    let isUnique = false;
    
    while (!isUnique) {
      const familiesQuery = query(
        collection(db, 'families'),
        where('inviteCode', '==', inviteCode)
      );
      const existingFamilies = await getDocs(familiesQuery);
      if (existingFamilies.empty) {
        isUnique = true;
      } else {
        inviteCode = generateInviteCode();
      }
    }

    // Update family with new invite code
    await updateDoc(doc(db, 'families', familyId), {
      inviteCode,
    });

    return inviteCode;
  } catch (error: any) {
    console.error('Error regenerating invite code:', error);
    throw error;
  }
};
