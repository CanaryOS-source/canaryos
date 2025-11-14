# Family Member Analytics Feature

## Overview
Family members can now click on any member in the Family tab to view detailed analytics about their scam encounters, app usage, and risk rating.

## Features

### 1. **Member Profile Screen**
Location: `app/family/member/[userId].tsx`

Displays comprehensive analytics for each family member:
- **Member Info Header**: Shows name, email, and role
- **Risk Rating**: Visual risk score with color-coded levels
- **Scam Encounters**: Statistics on detected, blocked, and reported scams
- **App Usage**: Total scans, active days, and last activity
- **Protection Score**: Overall security score (0-100%)

### 2. **Risk Levels**
Based on risk score (0-100):
- **Protected** (0-19): Low exposure, blue badge
- **Low Risk** (20-49): Minimal threats, yellow badge  
- **Medium Risk** (50-79): Moderate exposure, orange badge
- **High Risk** (80-100): Frequent scam encounters, red badge

### 3. **Analytics Data Model**
```typescript
interface UserAnalytics {
  userId: string;
  scamsDetected: number;      // Total scams ever detected
  scamsBlocked: number;        // Scams successfully blocked
  scamsReported: number;       // User-reported scams
  recentScams: number;         // Last 30 days
  totalScans: number;          // Total scans performed
  activeDays: number;          // Days user has been active
  lastActive: Timestamp;       // Last app usage
  riskScore: number;           // 0-100 (higher = more risk)
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

## Analytics Service API

### Core Functions

#### `getUserAnalytics(userId: string)`
Retrieves analytics for a specific user. Returns default values if no data exists.

```typescript
const analytics = await getUserAnalytics(userId);
```

#### `initializeAnalytics(userId: string)`
Creates initial analytics record for a new user.

```typescript
await initializeAnalytics(userId);
```

#### `recordScan(userId: string, isScam: boolean)`
Records a scan and updates analytics. If scam detected:
- Increments `scamsDetected`, `scamsBlocked`, `recentScams`
- Increases risk score by 5 (max 100)

```typescript
await recordScan(userId, true); // Scam detected
await recordScan(userId, false); // Safe content
```

#### `recordScamReport(userId: string)`
Increments the reported scams counter.

```typescript
await recordScamReport(userId);
```

#### `updateActivity(userId: string)`
Updates last active timestamp and increments active days if it's a new day.

```typescript
await updateActivity(userId);
```

#### `updateProtectionScore(userId: string)` *(deprecated)*
This function is deprecated and no longer needed. Protection scoring has been merged into the risk score calculation.

```typescript
// No longer needed - this is now a no-op
await updateProtectionScore(userId);
```

#### `decayRecentScams(userId: string)`
Reduces recent scam count by 10% (should be run daily via scheduled task).

```typescript
await decayRecentScams(userId);
```

## Usage

### In Your Scam Analyzer
When analyzing content, record the scan:

```typescript
import { recordScan } from '@/services/analyticsService';

// After analyzing
const isScam = analysis.isScam;
await recordScan(userId, isScam);
```

### On App Launch
Track user activity:

```typescript
import { updateActivity, initializeAnalytics } from '@/services/analyticsService';

useEffect(() => {
  if (user?.uid) {
    // Initialize analytics if first time
    initializeAnalytics(user.uid).catch(console.error);
    
    // Update activity
    updateActivity(user.uid).catch(console.error);
  }
}, [user]);
```

## Navigation

### From Family List
Click any family member card to navigate to their profile:

```typescript
<Pressable onPress={() => router.push(`/family/member/${member.userId}`)}>
  {/* Member card content */}
</Pressable>
```

## Firestore Security Rules

Analytics data is protected:
- ✅ Users can read their own analytics
- ✅ Family members can view each other's analytics
- ✅ Users can only write to their own analytics
- ❌ Non-family members cannot access analytics

```firestore
match /analytics/{userId} {
  // Own analytics
  allow read: if isAuthenticated() && isOwner(userId);
  
  // Family member analytics
  allow read: if isAuthenticated() && 
                 sameFamily(request.auth.uid, userId);
  
  // Own analytics only
  allow write: if isAuthenticated() && isOwner(userId);
}
```

## UI Components

### Member Profile Screen
- **Responsive design** matching app theme
- **Dark mode support** with proper colors
- **Loading states** with spinners
- **Error handling** for missing data
- **Card-based sections** for each analytics category

### Risk Rating Display
- **Large visual score** (0-100)
- **Color-coded badges** for risk level
- **Descriptive text** explaining the risk
- **Icon indicators** for quick recognition

### Statistics Grid
Three-column layout showing:
- Total scams detected (red)
- Scams blocked (orange)
- Scams reported (blue)

## Future Enhancements

1. **Trends**: Show analytics over time (graphs/charts)
2. **Notifications**: Alert family admin of high-risk members
3. **Recommendations**: Suggest security improvements
4. **Comparison**: Compare family members' protection scores
5. **Export**: Download analytics as PDF/CSV
6. **Scheduled Tasks**: Automated daily decay of recent scams

## Testing

To test with sample data:

```typescript
// Create test analytics
await initializeAnalytics('user123');

// Simulate scam encounters
await recordScan('user123', true);
await recordScan('user123', true);
await recordScan('user123', false);

// Update scores
await updateProtectionScore('user123');

// View in app
// Navigate to /family/member/user123
```

## Deployment

1. Deploy updated Firestore rules:
   ```bash
   firebase deploy --only firestore:rules
   ```

2. Analytics will automatically initialize for users on first scan/activity

3. Existing users may show zero stats until they perform scans

## Notes

- Analytics persist across sessions
- Risk scores increase with scam exposure, decay over time
- Protection scores reward active usage and safe behavior
- All timestamps are server-side to prevent manipulation
