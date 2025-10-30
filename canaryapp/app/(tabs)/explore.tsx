import { StyleSheet, View, ScrollView, useColorScheme } from 'react-native';
import { Image } from 'expo-image';
import { ThemedText } from '@/components/themed-text';
import { Colors, CanaryColors } from '@/constants/theme';

export default function InfoScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

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
          How Canary Works
        </ThemedText>
        <ThemedText style={[styles.tagline, { color: colors.icon }]}>
          Your Always-Running Scam Detector
        </ThemedText>
      </View>

      {/* Step 1 */}
      <View style={[styles.stepCard, { backgroundColor: colors.card }]}>
        <View style={[styles.stepNumber, { backgroundColor: CanaryColors.primary }]}>
          <ThemedText style={styles.stepNumberText}>1</ThemedText>
        </View>
        <ThemedText style={[styles.stepTitle, { color: colors.text }]}>
          Upload a Screenshot
        </ThemedText>
        <ThemedText style={[styles.stepDescription, { color: colors.icon }]}>
          Take a screenshot of any suspicious message, email, or content you receive across any app or device.
        </ThemedText>
      </View>

      {/* Step 2 */}
      <View style={[styles.stepCard, { backgroundColor: colors.card }]}>
        <View style={[styles.stepNumber, { backgroundColor: CanaryColors.primary }]}>
          <ThemedText style={styles.stepNumberText}>2</ThemedText>
        </View>
        <ThemedText style={[styles.stepTitle, { color: colors.text }]}>
          AI Analysis
        </ThemedText>
        <ThemedText style={[styles.stepDescription, { color: colors.icon }]}>
          Our advanced AI powered by Google Gemini analyzes the content for common scam patterns, phishing attempts, and fraudulent requests.
        </ThemedText>
      </View>

      {/* Step 3 */}
      <View style={[styles.stepCard, { backgroundColor: colors.card }]}>
        <View style={[styles.stepNumber, { backgroundColor: CanaryColors.primary }]}>
          <ThemedText style={styles.stepNumberText}>3</ThemedText>
        </View>
        <ThemedText style={[styles.stepTitle, { color: colors.text }]}>
          Get Instant Results
        </ThemedText>
        <ThemedText style={[styles.stepDescription, { color: colors.icon }]}>
          Receive a detailed analysis with confidence scores, red flags, and actionable safety recommendations within seconds.
        </ThemedText>
      </View>

      {/* Features Section */}
      <View style={styles.featuresSection}>
        <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>
          What We Detect
        </ThemedText>
        
        <View style={styles.featuresList}>
          {[
            'Phishing & Fake Login Pages',
            'Fraudulent Payment Requests',
            'Prize & Lottery Scams',
            'Romance Scams',
            'Tech Support Scams',
            'Investment & Crypto Scams',
            'Social Engineering Attempts',
          ].map((feature, index) => (
            <View key={index} style={styles.featureItem}>
              <View style={[styles.featureBullet, { backgroundColor: CanaryColors.trustBlue }]} />
              <ThemedText style={[styles.featureText, { color: colors.text }]}>
                {feature}
              </ThemedText>
            </View>
          ))}
        </View>
      </View>

      {/* Mission Statement */}
      <View style={[styles.missionCard, { backgroundColor: CanaryColors.primary + '20' }]}>
        <ThemedText style={[styles.missionTitle, { color: colors.text }]}>
          Our Mission
        </ThemedText>
        <ThemedText style={[styles.missionText, { color: colors.text }]}>
          To protect you and your family from scams across all apps and devices with AI-powered detection that's always watching out for you.
        </ThemedText>
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
    marginBottom: 40,
  },
  logo: {
    width: 100,
    height: 100,
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  tagline: {
    fontSize: 16,
    textAlign: 'center',
  },
  stepCard: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
  },
  stepNumber: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  stepNumberText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1C1C1C',
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  stepDescription: {
    fontSize: 15,
    lineHeight: 22,
  },
  featuresSection: {
    marginTop: 24,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  featuresList: {
    gap: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureBullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
  },
  featureText: {
    fontSize: 15,
    flex: 1,
  },
  missionCard: {
    padding: 24,
    borderRadius: 16,
    marginTop: 8,
  },
  missionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  missionText: {
    fontSize: 15,
    lineHeight: 22,
  },
});
