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
import { useTheme } from '@/contexts/ThemeContext';

const REFERENCES = [
  { title: 'American Heart Association – Heart Rate Guidelines', url: 'https://www.heart.org' },
  { title: 'National Sleep Foundation', url: 'https://www.sleepfoundation.org' },
  { title: 'World Health Organization – Body Mass Index (BMI)', url: 'https://www.who.int/news-room/fact-sheets/detail/obesity-and-overweight' },
];

export default function HealthDisclaimerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isLightTheme } = useTheme();

  const cardStyle = [styles.card, isLightTheme && { backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.06)' }];
  const disclaimerTextStyle = [styles.disclaimerText, isLightTheme && { color: '#333333' }];
  const linkRowBorderStyle = isLightTheme ? { borderBottomColor: 'rgba(0,0,0,0.05)' } : styles.linkRowBorder;
  const linkTitleStyle = [styles.linkTitle, isLightTheme && { color: '#0061A4' }];
  const linkUrlStyle = [styles.linkUrl, isLightTheme && { color: '#666666' }];

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
    <View style={[styles.container, isLightTheme && { backgroundColor: '#F8F9FA' }]}>
      <StatusBar barStyle={isLightTheme ? 'dark-content' : 'light-content'} backgroundColor={isLightTheme ? '#F8F9FA' : '#02041A'} />
      {isLightTheme ? null : (
        <LinearGradient colors={['#1D244D', '#02041A', '#1A1D3E']} style={styles.gradientBackground} />
      )}

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerIconContainer}>
          <Ionicons name="arrow-back" size={24} color={isLightTheme ? '#333333' : '#FFF'} />
        </TouchableOpacity>
        <Text style={[styles.headerText, isLightTheme && { color: '#111111' }]}>Health Disclaimer & References</Text>
        <View style={styles.headerIconContainer} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={cardStyle}>
          <Text style={disclaimerTextStyle}>
            DozeMate is a wellness product designed to help users observe general heart rate and respiration trends during rest and sleep.
          </Text>
          <Text style={[disclaimerTextStyle, { marginBottom: 0 }]}>
            This app is not a medical device and does not diagnose, treat, cure, or prevent any disease. The information provided by DozeMate is for general wellness and lifestyle purposes only and is not intended for medical use. Always consult a qualified healthcare professional for medical advice.
          </Text>
        </View>

        <Text style={[styles.sectionTitle, isLightTheme && { color: '#666666' }]}>References</Text>
        <View style={cardStyle}>
          {REFERENCES.map((ref, index) => (
            <TouchableOpacity
              key={index}
              style={[styles.linkRow, index < REFERENCES.length - 1 && linkRowBorderStyle]}
              onPress={() => openLink(ref.url)}
              activeOpacity={0.8}
            >
              <Ionicons name="open-outline" size={18} color={isLightTheme ? '#0061A4' : '#4A90E2'} style={styles.linkIcon} />
              <View style={styles.linkContent}>
                <Text style={linkTitleStyle}>{ref.title}</Text>
                <Text style={linkUrlStyle}>{ref.url}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={isLightTheme ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)'} />
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
