import { GoogleSignin } from '@react-native-google-signin/google-signin';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Image, StyleSheet, Text, TouchableOpacity, View, ScrollView, Platform, ActivityIndicator, StatusBar } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/services/api';
import { GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID } from '@/services/googleAuth';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';

const { width, height } = Dimensions.get('window');
const isTablet = width >= 768;

WebBrowser.maybeCompleteAuthSession();

/**
 * Index Screen - Login/Signup Entry Point
 * 
 * Navigation is handled by NavigationGuard component.
 * This screen only displays the login/signup UI.
 */
export default function Index() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const { isLightTheme } = useTheme();
  const ActionsContainer = isLightTheme ? View : BlurView;

  const titleStyle = [styles.title, isLightTheme && { color: '#111111' }];
  const taglineStyle = [styles.tagline, isLightTheme && { color: '#666666' }];
  const actionsContainerStyle = [
    styles.actionsContainer, 
    isLightTheme && { 
      backgroundColor: '#FFFFFF', 
      borderColor: 'rgba(0,0,0,0.06)',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05,
      shadowRadius: 10,
      elevation: 2 
    }
  ];
  const primaryButtonStyle = [styles.primaryButton, isLightTheme && { backgroundColor: '#0061A4' }];
  const primaryButtonTextStyle = [styles.primaryButtonText, isLightTheme && { color: '#FFFFFF' }];
  const dividerStyle = [styles.divider, isLightTheme && { backgroundColor: 'rgba(0, 0, 0, 0.1)' }];
  const dividerTextStyle = [styles.dividerText, isLightTheme && { color: '#666666' }];
  
  const socialButtonStyle = [
    styles.socialButton, 
    isLightTheme && { 
      backgroundColor: '#FFFFFF', 
      borderColor: 'rgba(0, 0, 0, 0.15)' 
    }
  ];
  const socialButtonTextStyle = [styles.socialButtonText, isLightTheme && { color: '#111111' }];
  const signInTextStyle = [styles.signInText, isLightTheme && { color: '#666666' }];

  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isAppleLoading, setIsAppleLoading] = useState(false);

  // Animations
  const contentFadeAnim = useRef(new Animated.Value(0)).current;
  const logoFloatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Configure Google Sign-In
    GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID,
      iosClientId: Platform.OS === 'ios' ? GOOGLE_IOS_CLIENT_ID : undefined,
      offlineAccess: false,
      forceCodeForRefreshToken: false, // Set to true if you want to force account selection
    });

    // Initial fade-in for all content
    Animated.timing(contentFadeAnim, {
      toValue: 1,
      duration: 1200,
      useNativeDriver: true,
    }).start();

    // Gentle floating animation for the logo
    Animated.loop(
      Animated.sequence([
        Animated.timing(logoFloatAnim, {
          toValue: 10,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(logoFloatAnim, {
          toValue: 0,
          duration: 3000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  // Handlers
  const handleSignUp = () => router.push('/(authentication)/signupdetails');
  const handleSignIn = () => router.push('/(authentication)/signin');

  const handleGoogleLogin = async () => {
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
        console.warn('Could not get Google idToken');
        setIsGoogleLoading(false);
        return;
      }

      const GOOGLE_IDTOKEN_URL = apiUrl('/api/auth/google-idtoken');
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

        await login(token, { id: userId, email: userEmail, name: userName });
        router.replace('/PostLoginResolver');
      } else {
        console.warn('Google sign-in failed:', data?.message);
        setIsGoogleLoading(false);
      }
    } catch (err: any) {
      console.warn('[Index] Google sign-in error:', err);
      setIsGoogleLoading(false);
    }
  };

  const handleAppleLogin = async () => {
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
        console.warn('Could not get Apple identityToken');
        setIsAppleLoading(false);
        return;
      }

      const APPLE_IDTOKEN_URL = apiUrl('/api/auth/apple-idtoken');
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

        await login(token, { id: userId, email: userEmail, name: userName });
        router.replace('/PostLoginResolver');
      } else {
        console.warn('Apple sign-in failed:', data?.message);
        setIsAppleLoading(false);
      }
    } catch (err: any) {
      if (err.code === 'ERR_REQUEST_CANCELED') {
        // User cancelled Apple Sign-In
        console.log('Apple sign-in cancelled by user');
      } else {
        console.warn('[Index] Apple sign-in error:', err);
      }
      setIsAppleLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, isLightTheme && { backgroundColor: '#F8F9FA' }]} edges={Platform.OS === 'ios' ? ['top'] : ['top', 'bottom']}>
      <StatusBar barStyle={isLightTheme ? 'dark-content' : 'light-content'} backgroundColor={isLightTheme ? '#F8F9FA' : '#02041A'} />
      {isLightTheme ? null : (
        <LinearGradient
          colors={['#1D244D', '#02041A', '#1A1D3E']}
          style={styles.gradientBackground}
        />
      )}

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Main content with fade-in animation */}
        <Animated.View style={[styles.content, { opacity: contentFadeAnim }]}>

          {/* Logo Section */}
          <Animated.View style={[styles.logoContainer, { transform: [{ translateY: logoFloatAnim }] }]}>
            <Image
              source={require("../assets/images/dozemate_transparent.png")}
              style={styles.logo}
              resizeMode="contain"
            />
          </Animated.View>

          {/* Text Section */}
          <View style={styles.textContainer}>
            <Text style={titleStyle}>Dozemate</Text>
            <Text style={taglineStyle}>"bio-sense for smart beds"</Text>
          </View>

          {/* Actions Section */}
          <ActionsContainer intensity={25} tint="dark" style={actionsContainerStyle}>
            <TouchableOpacity style={primaryButtonStyle} onPress={handleSignUp}>
              <Text style={primaryButtonTextStyle}>Create Account</Text>
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.dividerContainer}>
              <View style={dividerStyle} />
              <Text style={dividerTextStyle}>or</Text>
              <View style={dividerStyle} />
            </View>

            {/* Social Login Buttons - Platform Specific */}
            <View style={styles.socialLoginContainer}>
              {Platform.OS === 'android' && (
                <TouchableOpacity
                  style={socialButtonStyle}
                  onPress={handleGoogleLogin}
                  disabled={isGoogleLoading}
                >
                  {isGoogleLoading ? (
                    <ActivityIndicator size="small" color={isLightTheme ? '#000000' : '#FFFFFF'} />
                  ) : (
                    <>
                      <Image
                        source={require("../assets/images/icons8-google-96.png")}
                        style={styles.googleIcon}
                        resizeMode="contain"
                      />
                      <Text style={socialButtonTextStyle}>Continue with Google</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
              {Platform.OS === 'ios' && (
                <TouchableOpacity
                  style={socialButtonStyle}
                  onPress={handleAppleLogin}
                  disabled={isAppleLoading}
                >
                  {isAppleLoading ? (
                    <ActivityIndicator size="small" color={isLightTheme ? '#000000' : '#FFFFFF'} />
                  ) : (
                    <>
                      <Ionicons name="logo-apple" size={22} color={isLightTheme ? '#000000' : '#FFFFFF'} />
                      <Text style={socialButtonTextStyle}>Continue with Apple</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity onPress={handleSignIn}>
              <Text style={signInTextStyle}>Already have an account? <Text style={[{ fontWeight: 'bold' }, isLightTheme && { color: '#0061A4' }]}>Log In</Text></Text>
            </TouchableOpacity>

          </ActionsContainer>

        </Animated.View>
      </ScrollView>
    </SafeAreaView>
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
  scrollContent: {
    flexGrow: 1,
    minHeight: height,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: isTablet ? Math.min(width * 0.15, 100) : 20,
    paddingTop: isTablet ? 40 : 20,
    paddingBottom: 20,
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: isTablet ? 20 : 10,
  },
  logo: {
    width: isTablet ? Math.min(width * 0.5, 400) : Math.min(width * 0.8, 350),
    height: isTablet ? Math.min(width * 0.5, 400) : Math.min(width * 0.8, 350),
    maxWidth: 400,
    maxHeight: 400,
  },
  textContainer: {
    alignItems: 'center',
    marginBottom: isTablet ? 30 : 20,
    marginTop: isTablet ? 20 : 10,
  },
  title: {
    fontSize: isTablet ? 48 : 36,
    fontWeight: 'black',
    fontStyle: 'normal',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  tagline: {
    fontSize: isTablet ? 22 : 18,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 12,
    fontStyle: 'italic',
  },
  actionsContainer: {
    width: '100%',
    maxWidth: isTablet ? 500 : '100%',
    alignSelf: 'center',
    padding: isTablet ? 30 : 20,
    borderRadius: 30,
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 20,
  },
  primaryButton: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    paddingVertical: 18,
    borderRadius: 20,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#1D244D',
    fontSize: 16,
    fontWeight: 'bold',
  },
  socialLoginContainer: {
    width: '100%',
    gap: 15,
    marginBottom: 20,
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
  },
  signInText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
  },
  testBluetoothContainer: {
    paddingTop: 15,
  },
});