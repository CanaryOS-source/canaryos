# Family Protection Feature

## Overview
The Family Protection feature allows users to create and manage family groups within Canary OS. Family members can be added through shareable invite codes, with the family creator having full admin permissions.

## Architecture

### Data Model

#### Firestore Collections

1. **`families/{familyId}`**
   - `adminId`: string - User ID of the family creator/admin
   - `name`: string - Optional family name
   - `createdAt`: Timestamp - When the family was created
   - `inviteCode`: string - Unique 8-character invite code
   - `memberIds`: string[] - Array of all member user IDs

2. **`families/{familyId}/members/{memberId}`** (subcollection)
   - `userId`: string - User ID
   - `role`: 'admin' | 'member' - Member's role
   - `joinedAt`: Timestamp - When the member joined
   - `displayName`: string - Member's display name
   - `email`: string - Member's email

3. **`users/{userId}`** (updated)
   - Added field: `familyId`: string | null - Reference to family

### Services

#### Family Service (`services/familyService.ts`)
Platform-agnostic wrapper that delegates to web or native implementations.

**Available Functions:**
- `createFamily(name?)` - Create a new family
- `getFamilyData(familyId)` - Retrieve family information
- `getFamilyMembers(familyId)` - Get all family members
- `joinFamilyByInviteCode(code)` - Join family using invite code
- `removeFamilyMember(familyId, userId)` - Remove member (admin only)
- `leaveFamily(familyId)` - Leave family (member only)
- `deleteFamily(familyId)` - Delete entire family (admin only)
- `regenerateInviteCode(familyId)` - Generate new invite code (admin only)

### Context & State Management

#### FamilyContext (`contexts/FamilyContext.tsx`)
Provides family state and operations throughout the app.

**Exposed Values:**
- `family` - Current family data
- `members` - Array of family members
- `loading` - Loading state
- `isAdmin` - Whether current user is admin
- `hasFamily` - Whether user belongs to a family
- `currentUserRole` - User's role ('admin' | 'member' | null)

**Methods:**
- `createFamily(name?)` - Create new family
- `joinFamily(code)` - Join via invite code
- `removeMember(userId)` - Remove member
- `leaveFamily()` - Leave current family
- `deleteFamily()` - Delete family
- `regenerateInviteCode()` - Get new invite code
- `refreshFamily()` - Manually refresh family data

### UI Components

#### Family Tab (`app/(tabs)/family.tsx`)
Main family management screen with three states:

1. **No Family**: Shows option to create family or join existing one
2. **Has Family (Member)**: Shows family members, option to leave
3. **Has Family (Admin)**: Shows members, invite code, admin controls

#### Join Flow (`app/family/join/[code].tsx`)
Handles deep link navigation for invite codes:
- Checks authentication status
- Redirects to login/register if needed
- Validates invite code
- Adds user to family
- Redirects to family tab

### Hooks

#### `useFamilyRole()` (`hooks/useFamilyRole.ts`)
Convenience hook for checking permissions:
```typescript
const { role, isAdmin, isMember, permissions } = useFamilyRole();

// permissions includes:
// - canRemoveMembers
// - canDeleteFamily
// - canRegenerateInvite
// - canLeaveFamily
// - canInviteMembers
```

## Deep Linking

### Configuration
- **Scheme**: `canaryapp://`
- **Deep Link Format**: `canaryapp://family/join/{INVITE_CODE}`

### Flow
1. User receives invite link
2. Link opens app (or prompts to install)
3. If not authenticated → redirect to login/register
4. If already in family → show error
5. Otherwise → join family automatically

## User Flows

### Creating a Family
1. Navigate to Family tab
2. Enter optional family name
3. Tap "Create Family"
4. Receive unique invite code
5. Share invite code with family members

### Joining a Family
**Via Invite Code:**
1. Receive invite link: `canaryapp://family/join/ABC12345`
2. Click link (opens app)
3. Sign in if needed
4. Automatically join family
5. Redirected to Family tab

**Manual Entry:**
1. Navigate to Family tab
2. Enter invite code
3. Join family

### Managing Members (Admin)
1. View all family members
2. Share invite code to add new members
3. Remove individual members
4. Delete entire family

### Leaving Family (Member)
1. Navigate to Family tab
2. Tap "Leave Family"
3. Confirm action
4. Removed from family

## Security & Permissions

### Admin Permissions
- Create family
- Generate/regenerate invite codes
- Remove any member (except themselves)
- Delete entire family
- View all members

### Member Permissions
- View family members
- Leave family
- Cannot remove other members
- Cannot delete family

### Rules
- One user can only belong to one family at a time
- Users must leave current family before joining another
- Admin cannot leave family (must delete or transfer ownership)
- Admin cannot be removed by themselves
- Invite codes are unique and case-insensitive

## Share Functionality

### Native Apps (iOS/Android)
Uses `Share` API from React Native:
```typescript
Share.share({
  message: 'Join my family on Canary OS! Use code: ABC12345\n\nOr click: canaryapp://family/join/ABC12345',
  title: 'Join my Canary OS Family',
});
```

### Web
Uses Clipboard API:
```typescript
navigator.clipboard.writeText(inviteMessage);
```

## Error Handling

Common error scenarios:
- **Invalid invite code**: Show error, allow retry
- **User already in family**: Prompt to leave current family
- **Not authenticated**: Redirect to login/register
- **Permission denied**: Show appropriate error message
- **Network errors**: Display error, provide retry option

## Testing Scenarios

1. **Create Family**: Verify family created with unique code
2. **Join via Code**: Test successful join
3. **Invalid Code**: Verify error handling
4. **Already in Family**: Test rejection
5. **Admin Remove Member**: Verify member removed
6. **Member Leave**: Test leave functionality
7. **Delete Family**: Verify all members removed
8. **Deep Link**: Test link opens app correctly
9. **Unauthenticated Join**: Test redirect to auth
10. **Share Invite**: Test native share and web clipboard

## Future Enhancements

- Transfer admin ownership
- Multiple admins
- Invite code expiration
- Family activity feed
- Member roles/permissions customization
- Family-wide settings
- Scam alert sharing between family members
- Real-time presence indicators
- Push notifications for family events
