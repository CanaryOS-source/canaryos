// Family service implementation for iOS and Android
import auth from '@react-native-firebase/auth';
import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export interface FamilyData {
  id: string;
  adminId: string;
  name?: string;
  createdAt: FirebaseFirestoreTypes.Timestamp;
  inviteCode: string;
  memberIds: string[];
}

export interface FamilyMember {
  userId: string;
  role: 'admin' | 'member';
  joinedAt: FirebaseFirestoreTypes.Timestamp;
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
    const user = auth().currentUser;
    if (!user) throw new Error('No user logged in');

    // Check if user already has a family
    const userDoc = await firestore().collection('users').doc(user.uid).get();
    const userData = userDoc.data();
    if (userData?.familyId) {
      throw new Error('User already belongs to a family');
    }

    // Generate unique invite code
    let inviteCode = generateInviteCode();
    let isUnique = false;
    
    while (!isUnique) {
      const existingFamilies = await firestore()
        .collection('families')
        .where('inviteCode', '==', inviteCode)
        .get();
      if (existingFamilies.empty) {
        isUnique = true;
      } else {
        inviteCode = generateInviteCode();
      }
    }

    // Create family document
    const familyRef = firestore().collection('families').doc();
    const familyData: Omit<FamilyData, 'id' | 'createdAt'> & { createdAt: any } = {
      adminId: user.uid,
      name: name || `${userData?.displayName || 'My'}'s Family`,
      createdAt: firestore.FieldValue.serverTimestamp(),
      inviteCode,
      memberIds: [user.uid],
    };

    await familyRef.set(familyData);

    // Create admin member document
    await familyRef.collection('members').doc(user.uid).set({
      userId: user.uid,
      role: 'admin',
      joinedAt: firestore.FieldValue.serverTimestamp(),
      displayName: userData?.displayName || null,
      email: user.email,
    });

    // Update user document with familyId
    await firestore().collection('users').doc(user.uid).update({
      familyId: familyRef.id,
    });

    // Get the created document to return with proper timestamp
    const createdFamily = await familyRef.get();
    return { id: familyRef.id, ...createdFamily.data() } as FamilyData;
  } catch (error: any) {
    console.error('Error creating family:', error);
    throw error;
  }
};

// Get family data by ID
export const getFamilyData = async (familyId: string): Promise<FamilyData | null> => {
  try {
    const familyDoc = await firestore().collection('families').doc(familyId).get();
    if (familyDoc.exists) {
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
    const membersSnapshot = await firestore()
      .collection('families')
      .doc(familyId)
      .collection('members')
      .get();
    return membersSnapshot.docs.map(doc => doc.data() as FamilyMember);
  } catch (error: any) {
    console.error('Error getting family members:', error);
    throw error;
  }
};

// Join family using invite code
export const joinFamilyByInviteCode = async (inviteCode: string): Promise<string> => {
  try {
    const user = auth().currentUser;
    if (!user) throw new Error('No user logged in');

    // Check if user already has a family
    const userDoc = await firestore().collection('users').doc(user.uid).get();
    const userData = userDoc.data();
    if (userData?.familyId) {
      throw new Error('User already belongs to a family');
    }

    // Find family with invite code
    const familiesSnapshot = await firestore()
      .collection('families')
      .where('inviteCode', '==', inviteCode.toUpperCase())
      .get();

    if (familiesSnapshot.empty) {
      throw new Error('Invalid invite code');
    }

    const familyDoc = familiesSnapshot.docs[0];
    const familyId = familyDoc.id;

    // Add member to family
    await firestore()
      .collection('families')
      .doc(familyId)
      .collection('members')
      .doc(user.uid)
      .set({
        userId: user.uid,
        role: 'member',
        joinedAt: firestore.FieldValue.serverTimestamp(),
        displayName: userData?.displayName || null,
        email: user.email,
      });

    // Update family memberIds array
    await firestore()
      .collection('families')
      .doc(familyId)
      .update({
        memberIds: firestore.FieldValue.arrayUnion(user.uid),
      });

    // Update user document with familyId
    await firestore().collection('users').doc(user.uid).update({
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
    const user = auth().currentUser;
    if (!user) throw new Error('No user logged in');

    // Check if current user is admin
    const familyDoc = await firestore().collection('families').doc(familyId).get();
    const familyData = familyDoc.data();
    
    if (familyData?.adminId !== user.uid) {
      throw new Error('Only admin can remove members');
    }

    if (targetUserId === user.uid) {
      throw new Error('Admin cannot remove themselves. Delete the family instead.');
    }

    // Remove member document
    await firestore()
      .collection('families')
      .doc(familyId)
      .collection('members')
      .doc(targetUserId)
      .delete();

    // Update family memberIds array
    await firestore()
      .collection('families')
      .doc(familyId)
      .update({
        memberIds: firestore.FieldValue.arrayRemove(targetUserId),
      });

    // Remove familyId from user document
    await firestore().collection('users').doc(targetUserId).update({
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
    const user = auth().currentUser;
    if (!user) throw new Error('No user logged in');

    // Check if user is admin
    const familyDoc = await firestore().collection('families').doc(familyId).get();
    const familyData = familyDoc.data();
    
    if (familyData?.adminId === user.uid) {
      throw new Error('Admin must delete the family or transfer ownership');
    }

    // Remove member document
    await firestore()
      .collection('families')
      .doc(familyId)
      .collection('members')
      .doc(user.uid)
      .delete();

    // Update family memberIds array
    await firestore()
      .collection('families')
      .doc(familyId)
      .update({
        memberIds: firestore.FieldValue.arrayRemove(user.uid),
      });

    // Remove familyId from user document
    await firestore().collection('users').doc(user.uid).update({
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
    const user = auth().currentUser;
    if (!user) throw new Error('No user logged in');

    // Check if current user is admin
    const familyDoc = await firestore().collection('families').doc(familyId).get();
    const familyData = familyDoc.data();
    
    if (familyData?.adminId !== user.uid) {
      throw new Error('Only admin can delete the family');
    }

    // Get all members
    const membersSnapshot = await firestore()
      .collection('families')
      .doc(familyId)
      .collection('members')
      .get();

    // Remove familyId from all user documents
    const updatePromises = membersSnapshot.docs.map(memberDoc =>
      firestore().collection('users').doc(memberDoc.id).update({ familyId: null })
    );
    await Promise.all(updatePromises);

    // Delete all member documents
    const deletePromises = membersSnapshot.docs.map(memberDoc =>
      firestore()
        .collection('families')
        .doc(familyId)
        .collection('members')
        .doc(memberDoc.id)
        .delete()
    );
    await Promise.all(deletePromises);

    // Delete family document
    await firestore().collection('families').doc(familyId).delete();
  } catch (error: any) {
    console.error('Error deleting family:', error);
    throw error;
  }
};

// Regenerate invite code (admin only)
export const regenerateInviteCode = async (familyId: string): Promise<string> => {
  try {
    const user = auth().currentUser;
    if (!user) throw new Error('No user logged in');

    // Check if current user is admin
    const familyDoc = await firestore().collection('families').doc(familyId).get();
    const familyData = familyDoc.data();
    
    if (familyData?.adminId !== user.uid) {
      throw new Error('Only admin can regenerate invite code');
    }

    // Generate new unique invite code
    let inviteCode = generateInviteCode();
    let isUnique = false;
    
    while (!isUnique) {
      const existingFamilies = await firestore()
        .collection('families')
        .where('inviteCode', '==', inviteCode)
        .get();
      if (existingFamilies.empty) {
        isUnique = true;
      } else {
        inviteCode = generateInviteCode();
      }
    }

    // Update family with new invite code
    await firestore().collection('families').doc(familyId).update({
      inviteCode,
    });

    return inviteCode;
  } catch (error: any) {
    console.error('Error regenerating invite code:', error);
    throw error;
  }
};
