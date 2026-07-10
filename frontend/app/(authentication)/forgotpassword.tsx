import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { apiUrl } from '@/services/api';
import { useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import CustomAlert from '../../components/CustomAlert';

const { width } = Dimensions.get('window');

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isModalVisible, setModalVisible] = useState(false);
  const [modalInfo, setModalInfo] = useState({ title: '', message: '', isSuccess: false });

  const triggerModal = (title: string, message: string, isSuccess = false) => {
    setModalInfo({ title, message, isSuccess });
    setModalVisible(true);
  };

  const handleSendCode = async () => {
    if (!email || !email.trim()) {
      triggerModal("Validation Error", "Please enter your email address.");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      triggerModal("Validation Error", "Please enter a valid email address.");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(apiUrl('/api/auth/forgot-mobile'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      let result: any;
      
      if (contentType && contentType.includes('application/json')) {
        result = await response.json();
      } else {
        // If not JSON, read as text to see what we got
        const text = await response.text();
        console.error("[ForgotPassword] Non-JSON response:", text.substring(0, 200));
        throw new Error(`Server returned non-JSON response (${response.status}). The endpoint may not be available.`);
      }

      if (response.ok && result?.status === 'success') {
        triggerModal(
          "Code Sent",
          "A 6-digit reset code has been sent to your email. Please check your inbox.",
          true
        );
        // Navigate to verify code screen after a short delay
        setTimeout(() => {
          router.push({
            pathname: '/(authentication)/verifycode',
            params: { email: email.trim() }
          });
        }, 2000);
      } else {
        // Handle 404 (email not found) or other errors
        const msg = result?.message || "Failed to send reset code. Please try again.";
        triggerModal("Error", msg);
      }
    } catch (error: any) {
      console.error("[ForgotPassword] Error:", error);
      const errorMsg = error?.message || "An unexpected error occurred. Please check your connection and try again.";
      triggerModal("Network Error", errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    if (modalInfo.isSuccess) {
      // Navigation handled in setTimeout above
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <LinearGradient
        colors={['#1D244D', '#02041A', '#1A1D3E']}
        style={styles.gradientBackground}
      />

      <CustomAlert
        visible={isModalVisible}
        title={modalInfo.title}
        message={modalInfo.message}
        onClose={handleCloseModal}
      />

      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={28} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={styles.contentContainer}>
          <MaterialCommunityIcons name="lock-reset" size={64} color="#C7B9FF" style={styles.icon} />
          
          <Text style={styles.title}>Forgot Password?</Text>
          <Text style={styles.subtitle}>
            Enter your email address and we'll send you a 6-digit code to reset your password.
          </Text>

          <BlurView intensity={25} tint="dark" style={styles.formContainer}>
            {/* Email Input */}
            <View style={styles.inputContainer}>
              <MaterialCommunityIcons name="email-outline" size={22} color="rgba(255,255,255,0.7)" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Email address"
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                editable={!isLoading}
              />
            </View>

            <TouchableOpacity 
              style={[styles.sendButton, isLoading && styles.sendButtonDisabled]} 
              onPress={handleSendCode} 
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#1D244D" />
              ) : (
                <Text style={styles.sendButtonText}>Send Reset Code</Text>
              )}
            </TouchableOpacity>
          </BlurView>

          <TouchableOpacity 
            style={styles.backToLoginButton} 
            onPress={() => router.back()}
            disabled={isLoading}
          >
            <Text style={styles.backToLoginText}>Back to Login</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
  scrollContainer: {
    flexGrow: 1,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  backButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 20,
    zIndex: 1,
  },
  contentContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40,
  },
  icon: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 32,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  formContainer: {
    width: '100%',
    padding: 20,
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 15,
    paddingHorizontal: 15,
    marginBottom: 20,
    height: 55,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
  },
  sendButton: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    paddingVertical: 18,
    borderRadius: 20,
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    color: '#1D244D',
    fontSize: 16,
    fontWeight: 'bold',
  },
  backToLoginButton: {
    marginTop: 24,
    paddingVertical: 12,
  },
  backToLoginText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
  },
});
