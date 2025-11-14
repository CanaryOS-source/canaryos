import { useState } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Text,
  TouchableOpacity,
  Alert,
  useColorScheme,
  ActivityIndicator,
  TextInput,
  Share,
  Platform,
  Pressable,
} from 'react-native';
import { Colors, CanaryColors } from '@/constants/theme';
import { useFamily } from '@/contexts/FamilyContext';
import { useAuth } from '@/contexts/AuthContext';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { router } from 'expo-router';

export default function FamilyScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { user, userData } = useAuth();
  const {
    family,
    members,
    loading,
    isAdmin,
    hasFamily,
    createFamily,
    removeMember,
    leaveFamily,
    deleteFamily,
  } = useFamily();

  const [isCreating, setIsCreating] = useState(false);
  const [familyName, setFamilyName] = useState('');

  const handleCreateFamily = async () => {
    try {
      setIsCreating(true);
      await createFamily(familyName || undefined);
      setFamilyName('');
      Alert.alert('Success', 'Family created successfully!');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create family');
    } finally {
      setIsCreating(false);
    }
  };

  const handleShareInvite = async () => {
    if (!family?.inviteCode) return;

    const inviteLink = `canaryapp://family/join/${family.inviteCode}`;
    const message = `Join my family on Canary OS! Use code: ${family.inviteCode}\n\nOr click this link: ${inviteLink}`;

    try {
      if (Platform.OS === 'web') {
        // For web, copy to clipboard
        await navigator.clipboard.writeText(message);
        Alert.alert('Copied!', 'Invite code copied to clipboard');
      } else {
        // For native, use Share API
        await Share.share({
          message,
          title: 'Join my Canary OS Family',
        });
      }
    } catch (error) {
      console.error('Error sharing invite:', error);
      Alert.alert('Error', 'Failed to share invite');
    }
  };

  const handleRemoveMember = (memberId: string, memberName?: string) => {
    Alert.alert(
      'Remove Member',
      `Are you sure you want to remove ${memberName || 'this member'} from the family?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeMember(memberId);
              Alert.alert('Success', 'Member removed successfully');
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to remove member');
            }
          },
        },
      ]
    );
  };

  const handleLeaveFamily = () => {
    Alert.alert(
      'Leave Family',
      'Are you sure you want to leave this family? You will need a new invite to rejoin.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await leaveFamily();
              Alert.alert('Success', 'You have left the family');
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to leave family');
            }
          },
        },
      ]
    );
  };

  const handleDeleteFamily = () => {
    Alert.alert(
      'Delete Family',
      'Are you sure you want to delete this family? All members will be removed. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteFamily();
              Alert.alert('Success', 'Family deleted successfully');
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete family');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={CanaryColors.primary} />
          <Text style={[styles.loadingText, { color: colors.text }]}>Loading family...</Text>
        </View>
      </View>
    );
  }

  // No family - show create option
  if (!hasFamily) {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.contentContainer}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Family Protection</Text>
          <Text style={[styles.subtitle, { color: colors.icon }]}>
            Create a family to protect your loved ones from scams
          </Text>
        </View>

        {/* Create Family Section */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionHeader, { color: colors.text }]}>Create Your Family</Text>
          
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#f2f2f7',
                color: colors.text,
                borderColor: colors.border,
              },
            ]}
            placeholder="Family name (optional)"
            placeholderTextColor={colors.icon}
            value={familyName}
            onChangeText={setFamilyName}
          />

          <TouchableOpacity
            style={[styles.primaryButton, isCreating && styles.buttonDisabled]}
            onPress={handleCreateFamily}
            disabled={isCreating}
          >
            {isCreating ? (
              <ActivityIndicator color={CanaryColors.secondary} />
            ) : (
              <Text style={styles.primaryButtonText}>Create Family</Text>
            )}
          </TouchableOpacity>

          <Text style={[styles.helpText, { color: colors.icon }]}>
            Or ask a family member to share their invite code with you
          </Text>
        </View>
      </ScrollView>
    );
  }

  // Has family - show family members and management
  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.contentContainer}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>
          {family?.name || 'My Family'}
        </Text>
      </View>

      {/* Invite Code Section - Admin Only */}
      {isAdmin && (
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionHeader, { color: colors.text }]}>Invite Code</Text>
          <View style={styles.inviteCodeContainer}>
            <Text style={[styles.inviteCode, { color: colors.text }]}>
              {family?.inviteCode}
            </Text>
          </View>
          <TouchableOpacity style={styles.shareButton} onPress={handleShareInvite}>
            <IconSymbol name="square.and.arrow.up" size={20} color={CanaryColors.secondary} />
            <Text style={styles.shareButtonText}>Share Invite</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Members Section */}
      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <Text style={[styles.sectionHeader, { color: colors.text }]}>
          Family Members ({members.length})
        </Text>
        
        {members.map((member) => {
          const isCurrentUser = member.userId === user?.uid;
          const isMemberAdmin = member.role === 'admin';

          return (
            <Pressable
              key={member.userId}
              style={[
                styles.memberCard,
                { borderBottomColor: colors.border },
              ]}
              onPress={() => router.push(`/family/member/${member.userId}` as any)}
            >
              <View style={styles.memberInfo}>
                <IconSymbol
                  name="person.fill"
                  size={20}
                  color={isMemberAdmin ? CanaryColors.primary : colors.icon}
                />
                <View style={styles.memberDetails}>
                  <Text style={[styles.memberName, { color: colors.text }]}>
                    {member.displayName || member.email}
                    {isCurrentUser && ' (You)'}
                  </Text>
                  <Text style={[styles.memberEmail, { color: colors.icon }]}>
                    {isMemberAdmin ? 'Admin' : 'Member'}
                  </Text>
                </View>
              </View>

              <View style={styles.memberActions}>
                {isAdmin && !isCurrentUser && (
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleRemoveMember(member.userId, member.displayName);
                    }}
                  >
                    <IconSymbol name="trash" size={18} color={CanaryColors.alertRed} />
                  </TouchableOpacity>
                )}
                <IconSymbol name="chevron.forward" size={16} color={colors.icon} />
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Actions Section */}
      <View style={[styles.section, { backgroundColor: colors.card }]}>
        {isAdmin ? (
          <TouchableOpacity style={styles.dangerButton} onPress={handleDeleteFamily}>
            <Text style={styles.dangerButtonText}>Delete Family</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.dangerButton} onPress={handleLeaveFamily}>
            <Text style={styles.dangerButtonText}>Leave Family</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingTop: 60,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
  },
  header: {
    marginBottom: 30,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  section: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  sectionHeader: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
  },
  input: {
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: CanaryColors.primary,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: CanaryColors.secondary,
    fontSize: 16,
    fontWeight: '600',
  },
  helpText: {
    fontSize: 14,
    textAlign: 'center',
  },
  inviteCodeContainer: {
    backgroundColor: CanaryColors.primary + '20',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  inviteCode: {
    fontSize: 28,
    fontWeight: 'bold',
    letterSpacing: 4,
  },
  shareButton: {
    backgroundColor: CanaryColors.primary,
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  shareButtonText: {
    color: CanaryColors.secondary,
    fontSize: 16,
    fontWeight: '600',
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  memberDetails: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  memberEmail: {
    fontSize: 14,
  },
  memberActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  removeButton: {
    padding: 8,
  },
  dangerButton: {
    backgroundColor: CanaryColors.alertRed,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
