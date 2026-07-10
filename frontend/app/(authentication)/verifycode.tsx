import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { apiUrl } from '@/services/api';
import { useState, useRef, useEffect } from 'react';
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

export default function VerifyCodeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const email = params.email as string || '';

  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [isModalVisible, setModalVisible] = useState(false);
  const [modalInfo, setModalInfo] = useState({ title: '', message: '', isSuccess: false });
  
  const inputRefs = useRef<(TextInput | null)[]>([]);

  const triggerModal = (title: string, message: string, isSuccess = false) => {
    setModalInfo({ title, message, isSuccess });
    setModalVisible(true);
  };

  const handleCodeChange = (value: string, index: number) => {
    // Only allow digits
    if (value && !/^\d$/.test(value)) {
      return;
    }

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits are entered
    if (value && index === 5) {
      const fullCode = newCode.join('');
      if (fullCode.length === 6) {
        handleVerifyCode(fullCode);
      }
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyCode = async (codeToVerify?: string) => {
    const codeString = codeToVerify || code.join('');
    
    if (codeString.length !== 6) {
      triggerModal("Validation Error", "Please enter the complete 6-digit code.");
      return;
    }

    if (!email) {
      triggerModal("Error", "Email address is missing. Please start over.");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(apiUrl('/api/auth/verify-reset-code'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: email.trim(),
          code: codeString 
        }),
      });

      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      let result: any;
      
      if (contentType && contentType.includes('application/json')) {
        result = await response.json();
      } else {
        const text = await response.text();
        console.error("[VerifyCode] Non-JSON response:", text.substring(0, 200));
        throw new Error(`Server returned non-JSON response (${response.status}). The endpoint may not be available.`);
      }

      if (response.ok && result?.status === 'success') {
        triggerModal(
          "Code Verified",
          "Your code has been verified successfully.",
          true
        );
        // Navigate to reset password screen
        setTimeout(() => {
          router.replace({
            pathname: '/(authentication)/resetpassword',
            params: { email: email.trim(), code: codeString }
          });
        }, 1500);
      } else {
        const msg = result?.message || "Invalid code. Please try again.";
        triggerModal("Verification Failed", msg);
        // Clear code inputs on failure
        setCode(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
      }
    } catch (error: any) {
      console.error("[VerifyCode] Error:", error);
      const errorMsg = error?.message || "An unexpected error occurred. Please check your connection and try again.";
      triggerModal("Network Error", errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (!email) {
      triggerModal("Error", "Email address is missing.");
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
        const text = await response.text();
        console.error("[VerifyCode] Resend - Non-JSON response:", text.substring(0, 200));
        throw new Error(`Server returned non-JSON response (${response.status}). The endpoint may not be available.`);
      }

      if (response.ok && result?.status === 'success') {
        triggerModal(
          "Code Resent",
          "A new 6-digit code has been sent to your email.",
          true
        );
        // Clear current code
        setCode(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
      } else {
        const msg = result?.message || "Failed to resend code. Please try again.";
        triggerModal("Error", msg);
      }
    } catch (error: any) {
      console.error("[VerifyCode] Resend Error:", error);
      const errorMsg = error?.message || "Failed to resend code. Please try again.";
      triggerModal("Network Error", errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseModal = () => {
    setModalVisible(false);
  };

  useEffect(() => {
    // Focus first input on mount
    setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 100);
  }, []);

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
          <MaterialCommunityIcons name="shield-check" size={64} color="#C7B9FF" style={styles.icon} />
          
          <Text style={styles.title}>Enter Verification Code</Text>
          <Text style={styles.subtitle}>
            We've sent a 6-digit code to{'\n'}
            <Text style={styles.emailText}>{email || 'your email'}</Text>
          </Text>

          <BlurView intensity={25} tint="dark" style={styles.formContainer}>
            {/* Code Input Fields */}
            <View style={styles.codeContainer}>
              {code.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={(ref) => {
                    inputRefs.current[index] = ref;
                  }}
                  style={[styles.codeInput, digit && styles.codeInputFilled]}
                  value={digit}
                  onChangeText={(value) => handleCodeChange(value, index)}
                  onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, index)}
                  keyboardType="number-pad"
                  maxLength={1}
                  selectTextOnFocus
                  editable={!isLoading}
                />
              ))}
            </View>

            <TouchableOpacity 
              style={[styles.verifyButton, isLoading && styles.verifyButtonDisabled]} 
              onPress={() => handleVerifyCode()} 
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#1D244D" />
              ) : (
                <Text style={styles.verifyButtonText}>Verify Code</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.resendButton} 
              onPress={handleResendCode}
              disabled={isLoading}
            >
              <Text style={styles.resendButtonText}>Didn't receive code? Resend</Text>
            </TouchableOpacity>
          </BlurView>
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
  emailText: {
    color: '#C7B9FF',
    fontWeight: '600',
  },
  formContainer: {
    width: '100%',
    padding: 20,
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  codeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    gap: 10,
  },
  codeInput: {
    flex: 1,
    height: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  codeInputFilled: {
    borderColor: '#C7B9FF',
    backgroundColor: 'rgba(199, 185, 255, 0.1)',
  },
  verifyButton: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    paddingVertical: 18,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  verifyButtonDisabled: {
    opacity: 0.6,
  },
  verifyButtonText: {
    color: '#1D244D',
    fontSize: 16,
    fontWeight: 'bold',
  },
  resendButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  resendButtonText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
