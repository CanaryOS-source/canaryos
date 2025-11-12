// Platform-agnostic Family service wrapper
import { Platform } from 'react-native';

// Import the appropriate Family service based on platform
const familyService = Platform.select({
  web: () => require('./familyServiceWeb'),
  default: () => require('./familyServiceNative'),
})();

// Re-export all functions from the selected service
export const {
  createFamily,
  getFamilyData,
  getFamilyMembers,
  joinFamilyByInviteCode,
  removeFamilyMember,
  leaveFamily,
  deleteFamily,
  regenerateInviteCode,
} = familyService;

export type { FamilyData, FamilyMember } from './familyServiceWeb';
