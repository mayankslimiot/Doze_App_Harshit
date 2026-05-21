import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/services/api';
import { GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID } from '@/services/googleAuth';
import { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StatusBar,
} from 'react-native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import CustomAlert from '../../components/CustomAlert';
import { useTheme } from '@/contexts/ThemeContext';

const { width } = Dimensions.get('window');

export default function SignInScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const { isLightTheme } = useTheme();
  const FormContainer = isLightTheme ? View : BlurView;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isAppleLoading, setIsAppleLoading] = useState(false);

  // State for the custom modal
  const [isModalVisible, setModalVisible] = useState(false);
  const [modalInfo, setModalInfo] = useState({ title: '', message: '', isSuccess: false });

  // API endpoint - using Render backend URL
  const LOGIN_URL = apiUrl('/api/auth/login');
  const GOOGLE_IDTOKEN_URL = apiUrl('/api/auth/google-idtoken');
  const APPLE_IDTOKEN_URL = apiUrl('/api/auth/apple-idtoken');
  // Role is required by API; keep UI unchanged, default to 'user'
  const USER_ROLE = 'user';

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID,
      iosClientId: Platform.OS === 'ios' ? GOOGLE_IOS_CLIENT_ID : undefined,
      offlineAccess: false,
      forceCodeForRefreshToken: false,
    });
  }, []);

  const triggerModal = (title: string, message: string, isSuccess = false) => {
    setModalInfo({ title, message, isSuccess });
    setModalVisible(true);
  };

  const handleSignIn = async () => {
    if (!email || !password) {
      triggerModal("Validation Error", "Email and password fields cannot be empty.");
      return;
    }

    setIsEmailLoading(true);

    // Payload per new format: { email, password, role }
    const payload = {
      email: email.trim(),
      password: password.trim(),
      role: USER_ROLE,
    };

    // Debug: outgoing request
    console.log("[Auth] Sending POST", LOGIN_URL, "with payload:", { ...payload, password: "********" });

    try {
      const response = await fetch(LOGIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result: any = await response.json();

      // Debug: incoming response
      console.log("[Auth] Response status:", response.status);
      console.log("[Auth] Response body:", result);

      if (response.ok && result?.status === 'success' && result?.token && result?.user) {
        // Extract required fields
        const token = String(result.token);
        const userId = String(result.user?.id ?? '');
        const userEmail = String(result.user?.email ?? '');
        const userName = String(result.user?.name ?? '');

        // Persist to AsyncStorage (Android local storage)
        await AsyncStorage.multiSet([
          ['auth_token', token],
          ['user_id', userId],
          ['user_email', userEmail],
          ['user_name', userName],
        ]);

        if (rememberMe) {
          await AsyncStorage.setItem('remember_me', 'true');
        } else {
          await AsyncStorage.removeItem('remember_me');
        }

        // Debug: what was saved
        console.log("[Auth] Saved to storage:", {
          auth_token: token,
          user_id: userId,
          user_email: userEmail,
          user_name: userName,
          remember_me: rememberMe ? 'true' : 'false',
        });

        // Update AuthContext and trigger profile fetch
        await login(token, { id: userId, email: userEmail, name: userName });

        // Navigate to PostLoginResolver - it will handle device check and routing
        router.replace('/PostLoginResolver');
      } else {
        const msg = result?.message || "Invalid credentials or server error.";
        triggerModal("Login Failed", msg);
      }
    } catch (error: any) {
      console.error("[Auth] Network/Error:", error);
      triggerModal("Network Error", "An unexpected error occurred. Please try again.");
    } finally {
      setIsEmailLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      // hasPlayServices() is Android-only, skip on iOS
      if (Platform.OS === 'android') {
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      }

      // Revoke access and sign out of any previously signed-in account to force the account picker and consent screen
      try {
        await GoogleSignin.revokeAccess();
        await GoogleSignin.signOut();
      } catch (err) {
        console.log('No previous sign-in to revoke or clear');
      }

      // Now sign in - this will show the account picker
      const result = await GoogleSignin.signIn();
      if (result.type === 'cancelled' || !result.data) {
        setIsGoogleLoading(false);
        return;
      }
      let idToken = result.data.idToken ?? null;
      if (!idToken) {
        const tokens = await GoogleSignin.getTokens();
        idToken = tokens?.idToken ?? null;
      }
      if (!idToken) {
        triggerModal('Google sign-in', 'Could not get credentials. Ensure Google Sign-In is configured with webClientId.');
        setIsGoogleLoading(false);
        return;
      }
      const response = await fetch(GOOGLE_IDTOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      const data: any = await response.json();
      if (response.ok && data?.status === 'success' && data?.token && data?.user) {
        const token = String(data.token);
        const user = data.user;
        const userId = String(user?.id ?? '');
        const userEmail = String(user?.email ?? '');
        const userName = String(user?.name ?? '');
        await AsyncStorage.multiSet([
          ['auth_token', token],
          ['user_id', userId],
          ['user_email', userEmail],
          ['user_name', userName],
          ['last_active_at', String(Date.now())],
        ]);
        if (rememberMe) await AsyncStorage.setItem('remember_me', 'true');
        else await AsyncStorage.removeItem('remember_me');
        await login(token, { id: userId, email: userEmail, name: userName });
        router.replace('/PostLoginResolver');
      } else {
        triggerModal('Google sign-in failed', data?.message || 'Could not sign in with Google.');
      }
    } catch (err: any) {
      console.warn('[Auth] Google sign-in error:', err);
      triggerModal('Google sign-in error', err?.message || 'An error occurred. Please try again.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    setIsAppleLoading(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      const identityToken = credential.identityToken;
      if (!identityToken) {
        triggerModal('Apple sign-in', 'Could not get credentials.');
        setIsAppleLoading(false);
        return;
      }

      const response = await fetch(APPLE_IDTOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identityToken,
          fullName: credential.fullName,
        }),
      });

      const data: any = await response.json();
      if (response.ok && data?.status === 'success' && data?.token && data?.user) {
        const token = String(data.token);
        const user = data.user;
        const userId = String(user?.id ?? '');
        const userEmail = String(user?.email ?? '');
        const userName = String(user?.name ?? '');
        await AsyncStorage.multiSet([
          ['auth_token', token],
          ['user_id', userId],
          ['user_email', userEmail],
          ['user_name', userName],
          ['last_active_at', String(Date.now())],
        ]);
        if (rememberMe) await AsyncStorage.setItem('remember_me', 'true');
        else await AsyncStorage.removeItem('remember_me');
        await login(token, { id: userId, email: userEmail, name: userName });
        router.replace('/PostLoginResolver');
      } else {
        triggerModal('Apple sign-in failed', data?.message || 'Could not sign in with Apple.');
      }
    } catch (err: any) {
      if (err.code === 'ERR_REQUEST_CANCELED') {
        console.log('Apple sign-in cancelled by user');
      } else {
        console.warn('[Auth] Apple sign-in error:', err);
        triggerModal('Apple sign-in error', err?.message || 'An error occurred. Please try again.');
      }
    } finally {
      setIsAppleLoading(false);
    }
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    if (modalInfo.isSuccess) {
      router.replace('/setup'); // Adjust this to your main app route
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.container, isLightTheme && { backgroundColor: '#F8F9FA' }]}
    >
      <StatusBar barStyle={isLightTheme ? 'dark-content' : 'light-content'} backgroundColor={isLightTheme ? '#F8F9FA' : '#02041A'} />
      {isLightTheme ? null : (
        <LinearGradient
          colors={['#1D244D', '#02041A', '#1A1D3E']}
          style={styles.gradientBackground}
        />
      )}

      <CustomAlert
        visible={isModalVisible}
        title={modalInfo.title}
        message={modalInfo.message}
        onClose={handleCloseModal}
      />

      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={28} color={isLightTheme ? '#333333' : '#FFFFFF'} />
        </TouchableOpacity>

        <Image
          source={require('../../assets/images/login.png')}
          style={styles.headerImage}
          resizeMode="contain"
        />

        <Text style={[styles.title, isLightTheme && { color: '#111111' }]}>Welcome Back!</Text>
        <Text style={[styles.subtitle, isLightTheme && { color: '#666666' }]}>Log in to continue your journey.</Text>

        <FormContainer
          intensity={25}
          tint="dark"
          style={[
            styles.formContainer,
            isLightTheme && {
              backgroundColor: '#FFFFFF',
              borderColor: 'rgba(0,0,0,0.06)',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.05,
              shadowRadius: 10,
              elevation: 2,
            }
          ]}
        >
          {/* Email Input */}
          <View
            style={[
              styles.inputContainer,
              isLightTheme && {
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: 'rgba(0, 0, 0, 0.08)',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.03,
                shadowRadius: 4,
                elevation: 1,
              }
            ]}
          >
            <MaterialCommunityIcons name="email-outline" size={22} color={isLightTheme ? '#666666' : 'rgba(255,255,255,0.7)'} style={styles.icon} />
            <TextInput
              style={[styles.input, isLightTheme && { color: '#111111' }]}
              placeholder="Email or Username"
              placeholderTextColor={isLightTheme ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.5)'}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          {/* Password Input */}
          <View
            style={[
              styles.inputContainer,
              isLightTheme && {
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: 'rgba(0, 0, 0, 0.08)',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.03,
                shadowRadius: 4,
                elevation: 1,
              }
            ]}
          >
            <MaterialCommunityIcons name="lock-outline" size={22} color={isLightTheme ? '#666666' : 'rgba(255,255,255,0.7)'} style={styles.icon} />
            <TextInput
              style={[styles.input, isLightTheme && { color: '#111111' }]}
              placeholder="Password"
              placeholderTextColor={isLightTheme ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.5)'}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!isPasswordVisible}
            />
            <TouchableOpacity onPress={() => setIsPasswordVisible(!isPasswordVisible)}>
              <Ionicons name={isPasswordVisible ? "eye-off-outline" : "eye-outline"} size={24} color={isLightTheme ? '#666666' : "rgba(255,255,255,0.7)"} />
            </TouchableOpacity>
          </View>

          <View style={styles.optionsContainer}>
            <TouchableOpacity style={styles.checkboxContainer} onPress={() => setRememberMe(!rememberMe)}>
              <MaterialCommunityIcons
                name={rememberMe ? 'checkbox-marked' : 'checkbox-blank-outline'}
                size={24}
                color={isLightTheme ? (rememberMe ? '#0061A4' : '#666666') : '#FFFFFF'}
              />
              <Text style={[styles.checkboxLabel, isLightTheme && { color: '#666666' }]}>Remember Me</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.signInButton, isLightTheme && { backgroundColor: '#0061A4' }]}
            onPress={handleSignIn}
            disabled={isEmailLoading || isGoogleLoading}
          >
            {isEmailLoading ? (
              <ActivityIndicator size="small" color={isLightTheme ? '#FFFFFF' : '#1D244D'} />
            ) : (
              <Text style={[styles.signInButtonText, isLightTheme && { color: '#FFFFFF' }]}>Log In</Text>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.dividerContainer}>
            <View style={[styles.divider, isLightTheme && { backgroundColor: 'rgba(0, 0, 0, 0.1)' }]} />
            <Text style={[styles.dividerText, isLightTheme && { color: '#666666' }]}>or</Text>
            <View style={[styles.divider, isLightTheme && { backgroundColor: 'rgba(0, 0, 0, 0.1)' }]} />
          </View>

          {/* Social Login Button - Platform Specific */}
          {Platform.OS === 'android' && (
            <TouchableOpacity
              style={[
                styles.socialButton,
                isLightTheme && {
                  backgroundColor: '#FFFFFF',
                  borderColor: 'rgba(0, 0, 0, 0.15)',
                }
              ]}
              onPress={handleGoogleSignIn}
              disabled={isEmailLoading || isGoogleLoading}
            >
              {isGoogleLoading ? (
                <ActivityIndicator size="small" color={isLightTheme ? '#000000' : '#FFFFFF'} />
              ) : (
                <>
                  <Image
                    source={require('../../assets/images/icons8-google-96.png')}
                    style={styles.googleIcon}
                    resizeMode="contain"
                  />
                  <Text style={[styles.socialButtonText, isLightTheme && { color: '#111111' }]}>Continue with Google</Text>
                </>
              )}
            </TouchableOpacity>
          )}
          {Platform.OS === 'ios' && (
            <TouchableOpacity
              style={[
                styles.socialButton,
                isLightTheme && {
                  backgroundColor: '#FFFFFF',
                  borderColor: 'rgba(0, 0, 0, 0.15)',
                }
              ]}
              onPress={handleAppleSignIn}
              disabled={isEmailLoading || isAppleLoading}
            >
              {isAppleLoading ? (
                <ActivityIndicator size="small" color={isLightTheme ? '#000000' : '#FFFFFF'} />
              ) : (
                <>
                  <Ionicons name="logo-apple" size={22} color={isLightTheme ? '#000000' : '#FFFFFF'} />
                  <Text style={[styles.socialButtonText, isLightTheme && { color: '#111111' }]}>Continue with Apple</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </FormContainer>

        <View style={styles.forgotPasswordContainer}>
          <Text style={[styles.forgotPasswordLabel, isLightTheme && { color: '#666666' }]}>Don't remember the password? </Text>
          <TouchableOpacity onPress={() => router.push('/(authentication)/forgotpassword')}>
            <Text style={[styles.forgotPasswordText, isLightTheme && { color: '#0061A4' }]}>Forgot Password</Text>
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
    bottom: 0,
  },
  scrollContainer: {
    flexGrow: 1,
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  backButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 20,
    zIndex: 1,
  },
  headerImage: {
    width: width * 0.6,
    height: width * 0.5,
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 30,
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
    marginBottom: 15,
    height: 55,
  },
  icon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
  },
  optionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 25,
    paddingHorizontal: 5,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkboxLabel: {
    color: '#FFFFFF',
    marginLeft: 8,
    fontSize: 14,
  },
  forgotPasswordContainer: {
    flexDirection: 'row',
    marginTop: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  forgotPasswordLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
  },
  forgotPasswordText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  signInButton: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    paddingVertical: 18,
    borderRadius: 20,
    alignItems: 'center',
  },
  signInButtonText: {
    color: '#1D244D',
    fontSize: 16,
    fontWeight: 'bold',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginVertical: 20,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  dividerText: {
    color: 'rgba(255, 255, 255, 0.5)',
    marginHorizontal: 10,
    fontSize: 14,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 20,
    gap: 10,
  },
  socialButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  googleIcon: {
    width: 22,
    height: 22,
  },
  footer: {
    flexDirection: 'row',
    marginTop: 30,
  },
  footerText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
  },
});