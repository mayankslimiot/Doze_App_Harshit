import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  StatusBar,
  Linking,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useAuth } from '@/contexts/AuthContext';
import { useDevice } from '@/contexts/DeviceContext';
import { trackEvent } from '@/services/analytics';

export default function ContactSupportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { auth } = useAuth();
  const { activeDevice } = useDevice();

  // Track screen open
  React.useEffect(() => {
    trackEvent('contact_support_opened');
  }, []);

  // Get app version info
  const appVersionInfo = useMemo(() => {
    const version = Constants.expoConfig?.version || Constants.manifest2?.extra?.expoClient?.version || '1.0.0';
    let buildNumber = '';
    
    if (Platform.OS === 'ios') {
      buildNumber = Constants.expoConfig?.ios?.buildNumber || 
                    Constants.manifest2?.ios?.buildNumber || 
                    Constants.nativeBuildVersion || 
                    '';
    } else if (Platform.OS === 'android') {
      buildNumber = Constants.expoConfig?.android?.versionCode?.toString() || 
                    Constants.manifest2?.android?.versionCode?.toString() || 
                    Constants.nativeBuildVersion || 
                    '';
    }
    
    if (buildNumber) {
      return `Version ${version} (Build ${buildNumber})`;
    }
    return `Version ${version}`;
  }, []);

  // Get device info
  const deviceInfo = useMemo(() => {
    return {
      name: Platform.select({ ios: 'iPhone', android: 'Android', default: 'Unknown' }),
      model: Platform.select({ ios: 'iPhone', android: 'Android', default: 'Unknown' }),
      osVersion: Platform.Version.toString(),
    };
  }, []);

  // Get user email
  const userEmail = auth.user?.email || 'Not provided';

  // Get device ID
  const deviceId = activeDevice?.deviceId || 'Not available';

  // Build email body template
  const buildEmailBody = () => {
    return `Name: 
Registered Email: ${userEmail}
Device ID: ${deviceId}
Issue: 

App Version: ${appVersionInfo}
Phone Model: ${deviceInfo.model}
OS Version: ${deviceInfo.osVersion}`;
  };

  // Handle email support
  const handleEmailSupport = async () => {
    trackEvent('contact_support_email_clicked');
    
    const email = 'info@slimiot.com';
    const subject = 'Support Request - SlimIOT';
    const body = buildEmailBody();
    
    const mailtoUrl = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    
    try {
      const canOpen = await Linking.canOpenURL(mailtoUrl);
      if (canOpen) {
        await Linking.openURL(mailtoUrl);
      } else {
        Alert.alert(
          'Email Not Available',
          'Please contact us at info@slimiot.com',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Failed to open email:', error);
      Alert.alert(
        'Error',
        'Could not open email app. Please contact us at info@slimiot.com',
        [{ text: 'OK' }]
      );
    }
  };

  // Handle website link
  const handleWebsiteLink = async () => {
    trackEvent('contact_support_website_clicked');
    
    const url = 'https://www.slimiot.com/';
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', 'Could not open website');
      }
    } catch (error) {
      console.error('Failed to open website:', error);
      Alert.alert('Error', 'Could not open website');
    }
  };

  // Handle LinkedIn link
  const handleLinkedInLink = async () => {
    trackEvent('contact_support_linkedin_clicked');
    
    const url = 'https://in.linkedin.com/company/slimiot-technologies';
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', 'Could not open LinkedIn');
      }
    } catch (error) {
      console.error('Failed to open LinkedIn:', error);
      Alert.alert('Error', 'Could not open LinkedIn');
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
        <Text style={styles.headerText}>Contact Support</Text>
        <View style={styles.headerIconContainer} />
      </View>

      {/* Content */}
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Support Email Card */}
        <BlurView intensity={25} tint="dark" style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="mail-outline" size={24} color="#4A90E2" />
            <Text style={styles.cardTitle}>Email Support</Text>
          </View>
          
          <View style={styles.emailInfo}>
            <Text style={styles.emailLabel}>Email:</Text>
            <Text style={styles.emailValue}>info@slimiot.com</Text>
          </View>

          <TouchableOpacity
            style={styles.emailButton}
            onPress={handleEmailSupport}
            activeOpacity={0.8}
          >
            <Ionicons name="mail" size={20} color="#FFF" />
            <Text style={styles.emailButtonText}>Send Email</Text>
          </TouchableOpacity>
        </BlurView>

        {/* Official Links Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Official Links</Text>
          
          <TouchableOpacity
            style={styles.linkButton}
            onPress={handleWebsiteLink}
            activeOpacity={0.8}
          >
            <Ionicons name="globe-outline" size={24} color="#4A90E2" />
            <View style={styles.linkButtonContent}>
              <Text style={styles.linkButtonLabel}>Visit Website</Text>
              <Text style={styles.linkButtonUrl}>www.slimiot.com</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkButton}
            onPress={handleLinkedInLink}
            activeOpacity={0.8}
          >
            <Ionicons name="logo-linkedin" size={24} color="#4A90E2" />
            <View style={styles.linkButtonContent}>
              <Text style={styles.linkButtonLabel}>LinkedIn</Text>
              <Text style={styles.linkButtonUrl}>SlimIOT Technologies</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
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
    height: '100%',
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
    fontSize: 22,
    fontWeight: '800',
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 12,
  },
  emailInfo: {
    marginBottom: 20,
  },
  emailLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    marginBottom: 4,
  },
  emailValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  emailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4A90E2',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  emailButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#8F96C2',
    fontSize: 12,
    letterSpacing: 0.6,
    marginBottom: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  linkButtonContent: {
    flex: 1,
    marginLeft: 12,
  },
  linkButtonLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  linkButtonUrl: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
  },
});
