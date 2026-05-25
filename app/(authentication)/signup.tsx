import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { PRIVACY_POLICY, TERMS_AND_CONDITIONS } from '../../constants/legal';

const { width } = Dimensions.get('window');

export default function SignUpScreen() {
  const router = useRouter();
  const currentYear = new Date().getFullYear();

  const handleAgree = () => {
    // Navigate to the next step of the sign-up process
    // You will need to create this file: signupdetails.tsx
    router.push('/(authentication)/signupdetails');
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#1D244D', '#02041A', '#1A1D3E']}
        style={styles.gradientBackground}
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={28} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.title}>Create Your Account</Text>
        <Text style={styles.subtitle}>
          To continue, please read and agree to the Terms of Service and Privacy Notice.
        </Text>
      </View>

      {/* Scrollable Legal Text */}
      <BlurView intensity={25} tint="dark" style={styles.legalContainer}>
        <ScrollView nestedScrollEnabled={true} contentContainerStyle={styles.legalContent}>
          <Text style={styles.legalHeading}>Terms of Use Agreement</Text>
          <Text style={styles.legalText}>{TERMS_AND_CONDITIONS}</Text>
          <Text style={styles.legalHeading}>Privacy Policy</Text>
          <Text style={styles.legalText}>{PRIVACY_POLICY}</Text>
        </ScrollView>
      </BlurView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.agreeButton} onPress={handleAgree}>
          <Text style={styles.agreeButtonText}>Agree & Continue</Text>
        </TouchableOpacity>
        <Text style={styles.footerText} numberOfLines={1} adjustsFontSizeToFit={true}>Slimiot Dozemate Account</Text>
        <Text style={styles.copyrightText}>Copyright © {currentYear}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradientBackground: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '100%',
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 70 : 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
    alignItems: 'center',
  },
  backButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 20,
    zIndex: 1,
    marginTop: Platform.OS === 'ios' ? 10 : 25,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 15,
    marginTop: 10,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
  },
  legalContainer: {
    flex: 1,
    marginHorizontal: 20,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  legalContent: {
    padding: 20,
  },
  legalHeading: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 10,
    marginTop: 15,
  },
  legalText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    lineHeight: 18,
  },
  footer: {
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    alignItems: 'center',
  },
  agreeButton: {
    width: width * 0.7,
    backgroundColor: '#FFFFFF',
    paddingVertical: 18,
    borderRadius: 25,
    alignItems: 'center',
    marginBottom: 20,
  },
  agreeButtonText: {
    color: '#1D244D',
    fontSize: 16,
    fontWeight: 'bold',
  },
  footerText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 8,
  },
  copyrightText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
  },
});