import { StyleSheet, View, ScrollView, useColorScheme } from 'react-native';
import { Image } from 'expo-image';
import { ThemedText } from '@/components/themed-text';
import { Colors, CanaryColors } from '@/constants/theme';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

export default function InfoScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const scamTypes = [
    { icon: 'security', label: 'Phishing' },
    { icon: 'payment', label: 'Payment Fraud' },
    { icon: 'card-giftcard', label: 'Lottery Scams' },
    { icon: 'favorite', label: 'Romance' },
    { icon: 'support-agent', label: 'Tech Support' },
    { icon: 'trending-up', label: 'Investment' },
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.contentContainer}
    >
      {/* Header with Logo */}
      <View style={styles.header}>
        <Image
          source={require('@/assets/images/apple-touch-icon.png')}
          style={styles.logo}
          contentFit="contain"
        />
        <ThemedText style={[styles.title, { color: colors.text }]}>
          AI Analysis
        </ThemedText>
        <ThemedText style={[styles.subtitle, { color: colors.icon }]}>
          Powered by Google Gemini
        </ThemedText>
      </View>

      {/* How It Works - Compact */}
      <View style={styles.stepsContainer}>
        {/* Step 1 */}
        <View style={styles.stepRow}>
          <View style={[styles.iconCircle, { backgroundColor: CanaryColors.primary }]}>
            <MaterialIcons name="upload-file" size={24} color="#1C1C1C" />
          </View>
          <View style={styles.stepContent}>
            <ThemedText style={[styles.stepTitle, { color: colors.text }]}>
              Upload Screenshot
            </ThemedText>
            <ThemedText style={[styles.stepDesc, { color: colors.icon }]}>
              Scan any suspicious content
            </ThemedText>
          </View>
        </View>

        {/* Connector */}
        <View style={[styles.connector, { backgroundColor: colors.border }]} />

        {/* Step 2 */}
        <View style={styles.stepRow}>
          <View style={[styles.iconCircle, { backgroundColor: CanaryColors.primary }]}>
            <MaterialIcons name="psychology" size={24} color="#1C1C1C" />
          </View>
          <View style={styles.stepContent}>
            <ThemedText style={[styles.stepTitle, { color: colors.text }]}>
              AI Analysis
            </ThemedText>
            <ThemedText style={[styles.stepDesc, { color: colors.icon }]}>
              Detect scam patterns instantly
            </ThemedText>
          </View>
        </View>

        {/* Connector */}
        <View style={[styles.connector, { backgroundColor: colors.border }]} />

        {/* Step 3 */}
        <View style={styles.stepRow}>
          <View style={[styles.iconCircle, { backgroundColor: CanaryColors.primary }]}>
            <MaterialIcons name="verified-user" size={24} color="#1C1C1C" />
          </View>
          <View style={styles.stepContent}>
            <ThemedText style={[styles.stepTitle, { color: colors.text }]}>
              Get Results
            </ThemedText>
            <ThemedText style={[styles.stepDesc, { color: colors.icon }]}>
              Safety scores & recommendations
            </ThemedText>
          </View>
        </View>
      </View>

      {/* What We Detect - Grid */}
      <View style={styles.detectSection}>
        <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>
          What We Detect
        </ThemedText>
        
        <View style={styles.scamGrid}>
          {scamTypes.map((item, index) => (
            <View 
              key={index} 
              style={[styles.scamCard, { backgroundColor: colors.card }]}
            >
              <MaterialIcons 
                name={item.icon as any} 
                size={28} 
                color={CanaryColors.trustBlue} 
              />
              <ThemedText style={[styles.scamLabel, { color: colors.text }]}>
                {item.label}
              </ThemedText>
            </View>
          ))}
        </View>
      </View>

      {/* Mission - Simplified */}
      <View style={[styles.missionBanner, { backgroundColor: CanaryColors.primary }]}>
        <MaterialIcons name="shield" size={32} color="#1C1C1C" />
        <View style={styles.missionText}>
          <ThemedText style={styles.missionTitle}>
            Always Protecting You
          </ThemedText>
          <ThemedText style={styles.missionSubtitle}>
            AI-powered scam detection for all your apps
          </ThemedText>
        </View>
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
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logo: {
    width: 80,
    height: 80,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
  },
  stepsContainer: {
    marginBottom: 32,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepContent: {
    flex: 1,
    marginLeft: 16,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  stepDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  connector: {
    width: 2,
    height: 24,
    marginLeft: 23,
    marginVertical: 4,
  },
  detectSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  scamGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  scamCard: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  scamLabel: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 6,
  },
  missionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 16,
    gap: 16,
  },
  missionText: {
    flex: 1,
  },
  missionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1C1C1C',
    marginBottom: 4,
  },
  missionSubtitle: {
    fontSize: 13,
    color: '#1C1C1C',
  },
});
