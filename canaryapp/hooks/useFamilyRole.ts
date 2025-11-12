import { useFamily } from '@/contexts/FamilyContext';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Hook to check family role and permissions
 */
export function useFamilyRole() {
  const { family, currentUserRole, isAdmin, hasFamily } = useFamily();
  const { user } = useAuth();

  const canRemoveMembers = isAdmin;
  const canDeleteFamily = isAdmin;
  const canRegenerateInvite = isAdmin;
  const canLeaveFamily = hasFamily && !isAdmin;
  const canInviteMembers = isAdmin;

  return {
    role: currentUserRole,
    isAdmin,
    isMember: currentUserRole === 'member',
    hasFamily,
    permissions: {
      canRemoveMembers,
      canDeleteFamily,
      canRegenerateInvite,
      canLeaveFamily,
      canInviteMembers,
    },
  };
}
