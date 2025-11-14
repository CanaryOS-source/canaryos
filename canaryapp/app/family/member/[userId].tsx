import { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Text,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { Colors, CanaryColors } from '@/constants/theme';
import { useFamily } from '@/contexts/FamilyContext';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { getUserAnalytics, UserAnalytics } from '@/services/analyticsService';

export default function MemberProfileScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { members } = useFamily();
  const [analytics, setAnalytics] = useState<UserAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  const member = members.find(m => m.userId === userId);

  useEffect(() => {
    if (userId) {
      loadAnalytics();
    }
  }, [userId]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const data = await getUserAnalytics(userId as string);
      setAnalytics(data);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRiskLevel = (riskScore: number): { level: string; color: string; icon: string } => {
    if (riskScore >= 80) {
      return { level: 'High Risk', color: CanaryColors.alertRed, icon: 'exclamationmark.triangle.fill' };
    } else if (riskScore >= 50) {
      return { level: 'Medium Risk', color: '#FF9500', icon: 'exclamationmark.circle.fill' };
    } else if (riskScore >= 20) {
      return { level: 'Low Risk', color: CanaryColors.primary, icon: 'checkmark.shield.fill' };
    } else {
      return { level: 'Protected', color: CanaryColors.trustBlue, icon: 'checkmark.shield.fill' };
    }
  };

  if (!member) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: 'Member Not Found' }} />
        <View style={styles.centerContent}>
          <Text style={[styles.errorText, { color: colors.text }]}>Member not found</Text>
        </View>
      </View>
    );
  }

  const risk = analytics ? getRiskLevel(analytics.riskScore) : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen 
        options={{ 
          title: member.displayName || member.email || 'Member Profile',
          headerBackTitle: 'Family'
        }} 
      />
      
      <ScrollView contentContainerStyle={styles.contentContainer}>
        {loading ? (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={CanaryColors.primary} />
            <Text style={[styles.loadingText, { color: colors.text }]}>Loading analytics...</Text>
          </View>
        ) : analytics ? (
          <>
            {/* Member Info Header */}
            <View style={[styles.section, { backgroundColor: colors.card }]}>
              <View style={styles.memberHeader}>
                <View style={styles.memberHeaderLeft}>
                  <View style={[styles.avatarCircle, { backgroundColor: member.role === 'admin' ? CanaryColors.primary + '20' : colors.border }]}>
                    <IconSymbol 
                      name="person.fill" 
                      size={24} 
                      color={member.role === 'admin' ? CanaryColors.primary : colors.icon} 
                    />
                  </View>
                  <View>
                    <Text style={[styles.memberName, { color: colors.text }]}>
                      {member.displayName || 'Family Member'}
                    </Text>
                    <Text style={[styles.memberEmail, { color: colors.icon }]}>
                      {member.email}
                    </Text>
                    <Text style={[styles.memberRole, { color: colors.icon }]}>
                      {member.role === 'admin' ? 'Admin' : 'Member'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Risk Rating */}
            {risk && (
              <View style={[styles.section, { backgroundColor: colors.card }]}>
                <Text style={[styles.sectionHeader, { color: colors.text }]}>Risk Rating</Text>
                <View style={[styles.riskCard, { backgroundColor: risk.color + '15' }]}>
                  <IconSymbol name={risk.icon as any} size={48} color={risk.color} />
                  <Text style={[styles.riskLevel, { color: risk.color }]}>
                    {risk.level}
                  </Text>
                  <View style={styles.riskScoreContainer}>
                    <Text style={[styles.riskScore, { color: colors.text }]}>
                      {analytics.riskScore}
                    </Text>
                    <Text style={[styles.riskScoreLabel, { color: colors.icon }]}>
                      / 100
                    </Text>
                  </View>
                  <Text style={[styles.riskDescription, { color: colors.icon }]}>
                    {analytics.riskScore >= 80
                      ? 'Frequent encounters with scam attempts. Consider reviewing security practices.'
                      : analytics.riskScore >= 50
                      ? 'Moderate exposure to scam attempts. Stay vigilant.'
                      : analytics.riskScore >= 20
                      ? 'Low exposure to scams. Keep up the safe practices.'
                      : 'Well protected with minimal scam exposure.'}
                  </Text>
                </View>
              </View>
            )}

            {/* Scam Encounters */}
            <View style={[styles.section, { backgroundColor: colors.card }]}>
              <Text style={[styles.sectionHeader, { color: colors.text }]}>Scam Encounters</Text>
              
              <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                  <Text style={[styles.statValue, { color: CanaryColors.alertRed }]}>
                    {analytics.scamsDetected}
                  </Text>
                  <Text style={[styles.statLabel, { color: colors.icon }]}>
                    Total Detected
                  </Text>
                </View>

                <View style={styles.statCard}>
                  <Text style={[styles.statValue, { color: '#FF9500' }]}>
                    {analytics.scamsBlocked}
                  </Text>
                  <Text style={[styles.statLabel, { color: colors.icon }]}>
                    Blocked
                  </Text>
                </View>

                <View style={styles.statCard}>
                  <Text style={[styles.statValue, { color: CanaryColors.trustBlue }]}>
                    {analytics.scamsReported}
                  </Text>
                  <Text style={[styles.statLabel, { color: colors.icon }]}>
                    Reported
                  </Text>
                </View>
              </View>

              <View style={[styles.infoBox, { backgroundColor: colors.background }]}>
                <Text style={[styles.infoText, { color: colors.text }]}>
                  <Text style={{ fontWeight: '600' }}>Last 30 days: </Text>
                  {analytics.recentScams} scam attempts detected
                </Text>
              </View>
            </View>

            {/* App Usage */}
            <View style={[styles.section, { backgroundColor: colors.card }]}>
              <Text style={[styles.sectionHeader, { color: colors.text }]}>App Usage</Text>
              
              <View style={styles.usageRow}>
                <View style={styles.usageItem}>
                  <IconSymbol name="magnifyingglass" size={24} color={CanaryColors.primary} />
                  <View style={styles.usageDetails}>
                    <Text style={[styles.usageValue, { color: colors.text }]}>
                      {analytics.totalScans}
                    </Text>
                    <Text style={[styles.usageLabel, { color: colors.icon }]}>
                      Total Scans
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.usageRow}>
                <View style={styles.usageItem}>
                  <IconSymbol name="calendar" size={24} color={CanaryColors.trustBlue} />
                  <View style={styles.usageDetails}>
                    <Text style={[styles.usageValue, { color: colors.text }]}>
                      {analytics.activeDays}
                    </Text>
                    <Text style={[styles.usageLabel, { color: colors.icon }]}>
                      Active Days
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.usageRow}>
                <View style={styles.usageItem}>
                  <IconSymbol name="clock" size={24} color={colors.icon} />
                  <View style={styles.usageDetails}>
                    <Text style={[styles.usageValue, { color: colors.text }]}>
                      {analytics.lastActive?.toDate 
                        ? analytics.lastActive.toDate().toLocaleDateString()
                        : 'Recently'}
                    </Text>
                    <Text style={[styles.usageLabel, { color: colors.icon }]}>
                      Last Active
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </>
        ) : (
          <View style={[styles.section, { backgroundColor: colors.card }]}>
            <Text style={[styles.noDataText, { color: colors.icon }]}>
              No analytics data available for this member yet.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
  },
  errorText: {
    fontSize: 16,
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
  memberHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  memberHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberName: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4,
  },
  memberEmail: {
    fontSize: 14,
    marginBottom: 2,
  },
  memberRole: {
    fontSize: 12,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  riskCard: {
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    gap: 8,
  },
  riskLevel: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 8,
  },
  riskScoreContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  riskScore: {
    fontSize: 48,
    fontWeight: 'bold',
  },
  riskScoreLabel: {
    fontSize: 20,
  },
  riskDescription: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
  },
  statValue: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    textAlign: 'center',
  },
  infoBox: {
    padding: 12,
    borderRadius: 8,
  },
  infoText: {
    fontSize: 14,
  },
  usageRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  usageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  usageDetails: {
    flex: 1,
  },
  usageValue: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 2,
  },
  usageLabel: {
    fontSize: 14,
  },
  noDataText: {
    fontSize: 16,
    textAlign: 'center',
  },
});
