import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Linking,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const REFERENCES = [
  { title: 'American Heart Association – Heart Rate Guidelines', url: 'https://www.heart.org' },
  { title: 'National Sleep Foundation', url: 'https://www.sleepfoundation.org' },
  { title: 'World Health Organization – Body Mass Index (BMI)', url: 'https://www.who.int/news-room/fact-sheets/detail/obesity-and-overweight' },
];

export default function HealthDisclaimerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const openLink = async (url: string) => {
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', 'Could not open link');
      }
    } catch {
      Alert.alert('Error', 'Could not open link');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#02041A" />
      <LinearGradient colors={['#1D244D', '#02041A', '#1A1D3E']} style={styles.gradientBackground} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerIconContainer}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerText}>Health Disclaimer & References</Text>
        <View style={styles.headerIconContainer} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.disclaimerText}>
            DozeMate is a wellness product designed to help users observe general heart rate and respiration trends during rest and sleep.
          </Text>
          <Text style={[styles.disclaimerText, { marginBottom: 0 }]}>
            This app is not a medical device and does not diagnose, treat, cure, or prevent any disease. The information provided by DozeMate is for general wellness and lifestyle purposes only and is not intended for medical use. Always consult a qualified healthcare professional for medical advice.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>References</Text>
        <View style={styles.card}>
          {REFERENCES.map((ref, index) => (
            <TouchableOpacity
              key={index}
              style={[styles.linkRow, index < REFERENCES.length - 1 && styles.linkRowBorder]}
              onPress={() => openLink(ref.url)}
              activeOpacity={0.8}
            >
              <Ionicons name="open-outline" size={18} color="#4A90E2" style={styles.linkIcon} />
              <View style={styles.linkContent}>
                <Text style={styles.linkTitle}>{ref.title}</Text>
                <Text style={styles.linkUrl}>{ref.url}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#02041A',
  },
  gradientBackground: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerIconContainer: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '800',
    flex: 1,
    textAlign: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  disclaimerText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#8F96C2',
    fontSize: 12,
    letterSpacing: 0.6,
    marginBottom: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  linkRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  linkIcon: {
    marginRight: 12,
  },
  linkContent: {
    flex: 1,
  },
  linkTitle: {
    color: '#4A90E2',
    fontSize: 15,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  linkUrl: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 4,
  },
});
