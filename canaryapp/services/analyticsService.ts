// Platform-agnostic Analytics service wrapper
import { Platform } from 'react-native';

// Import the appropriate Analytics service based on platform
const analyticsService = Platform.select({
  web: () => require('./analyticsServiceWeb'),
  default: () => require('./analyticsServiceNative'),
})();

// Re-export all functions from the selected service
export const {
  getUserAnalytics,
  initializeAnalytics,
  recordScan,
  recordScamReport,
  updateActivity,
  updateProtectionScore,
  decayRecentScams,
} = analyticsService;

export type { UserAnalytics } from './analyticsServiceWeb';
