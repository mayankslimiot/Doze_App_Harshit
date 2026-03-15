import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import Checkbox from 'expo-checkbox';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { ComponentProps, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  KeyboardTypeOptions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiUrl } from '@/services/api';
import CustomAlert from '@/components/CustomAlert';

const { width } = Dimensions.get('window');

type CustomInputProps = {
  icon: ComponentProps<typeof Ionicons>['name'];
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
};

type FormErrors = {
  email?: string;
  name?: string;
  password?: string;
  confirmPassword?: string;
};


// Custom Input Component for consistent styling
const CustomInput = ({ icon, placeholder, value, onChangeText, secureTextEntry = false, keyboardType = 'default' }: CustomInputProps) => (
  <BlurView intensity={30} tint="dark" style={styles.inputContainer}>
    <Ionicons name={icon} size={22} color="rgba(255, 255, 255, 0.7)" style={styles.inputIcon} />
    <TextInput
      style={styles.input}
      placeholder={placeholder}
      placeholderTextColor="rgba(255, 255, 255, 0.5)"
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={secureTextEntry}
      keyboardType={keyboardType}
    />
  </BlurView>
);

export default function SignUpDetailsScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [showSuccessAlert, setShowSuccessAlert] = useState(false);

  const validateForm = () => {
    const newErrors:FormErrors = {};
    if (!email) newErrors.email = 'Email is required.';
    else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = 'Email is invalid.';
    if (!name || !name.trim()) newErrors.name = 'Name is required.';
    if (!password) newErrors.password = 'Password is required.';
    if (password !== confirmPassword) newErrors.confirmPassword = 'Passwords do not match.';
    if (!agreedToTerms) {
      Alert.alert('Terms Required', 'You must agree to the Terms and Conditions to register.');
      return false;
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    if (!validateForm()) return;

    setLoading(true);
    
    const userData = {
      email: email.trim(),
      password: password,
      name: name.trim(),
      role: 'user',
    };

    try {
      const url = apiUrl('/api/auth/register-simple');
      console.log('[Register] POST', url, 'payload:', { ...userData, password: '********' });

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      const result = await response.json();
      console.log('[Register] Response', response.status, result);

      if (response.ok && result.status === 'success') {
        setShowSuccessAlert(true);
      } else {
        const errorMessage = result.message || 'Registration failed. Please try again.';
        Alert.alert('Registration Failed', errorMessage);
      }
    } catch (error) {
      console.error('Registration Error:', error);
      Alert.alert('Error', 'Network error occurred. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSuccessAlertClose = () => {
    setShowSuccessAlert(false);
    router.replace('/(authentication)/signin');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <LinearGradient colors={['#1D244D', '#02041A', '#1A1D3E']} style={styles.gradientBackground} />

      <CustomAlert
        visible={showSuccessAlert}
        title="Success!"
        message="Registration successful! Please verify your email to complete your account setup. Check your inbox for the verification link."
        buttons={[
          {
            text: 'OK',
            onPress: handleSuccessAlertClose,
            style: 'primary'
          }
        ]}
        onClose={handleSuccessAlertClose}
      />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={28} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.title}>Create Your Account</Text>
        <Text style={styles.subtitle}>Enter your details to register</Text>
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
        bounces={true}
        scrollEnabled={true}
      >
        <CustomInput icon="person-outline" placeholder="Name" value={name} onChangeText={setName} />
        {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}

        <CustomInput icon="mail-outline" placeholder="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
        {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}

        <CustomInput icon="lock-closed-outline" placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />
        {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}

        <CustomInput icon="lock-closed-outline" placeholder="Confirm Password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
        {errors.confirmPassword && <Text style={styles.errorText}>{errors.confirmPassword}</Text>}

        <View style={styles.checkboxContainer}>
          <Checkbox 
            style={styles.checkbox} 
            value={agreedToTerms} 
            onValueChange={setAgreedToTerms} 
            color={agreedToTerms ? '#4A90E2' : undefined} 
          />
          <View style={styles.checkboxLabelContainer}>
            <Text style={styles.checkboxLabel}>I agree to the </Text>
            <TouchableOpacity onPress={() => router.push('/terms-of-service')}>
              <Text style={styles.termsLink}>Terms and Conditions</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={styles.registerButton} onPress={handleRegister} disabled={loading}>
          {loading ? <ActivityIndicator color="#1D244D" /> : <Text style={styles.registerButtonText}>Register</Text>}
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => router.push('/(authentication)/signin')}>
            <Text style={[styles.footerText, styles.footerLink]}>Log In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  gradientBackground: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  header: { paddingTop: Platform.OS === 'ios' ? 70 : 50, paddingHorizontal: 20, paddingBottom: 20, alignItems: 'center' },
  backButton: { position: 'absolute', top: Platform.OS === 'ios' ? 60 : 40, left: 20,  marginTop: Platform.OS === 'ios' ? 10 : 15, zIndex: 1 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#FFFFFF', textAlign: 'center', marginBottom: 10 },
  subtitle: { fontSize: 16, color: 'rgba(255, 255, 255, 0.7)', textAlign: 'center' },
  scrollView: {
    flex: 1,
  },
  scrollContent: { 
    paddingHorizontal: 20, 
    paddingTop: 10,
    paddingBottom: 120,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 55,
    borderRadius: 15,
    marginTop: 15,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, height: '100%', color: '#FFFFFF', fontSize: 16 },
  checkboxContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 20, paddingHorizontal: 5 },
  checkbox: { margin: 8 },
  checkboxLabelContainer: { flexDirection: 'row', alignItems: 'center', flex: 1, flexWrap: 'wrap' },
  checkboxLabel: { color: 'rgba(255, 255, 255, 0.8)', fontSize: 14 },
  termsLink: { color: '#7EA6FF', fontSize: 14, fontWeight: '600' },
  registerButton: {
    marginTop: 30,
    backgroundColor: '#FFFFFF',
    paddingVertical: 18,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    height: 60,
  },
  registerButtonText: { color: '#1D244D', fontSize: 18, fontWeight: 'bold' },
  errorText: { color: '#FF5A5F', fontSize: 12, paddingLeft: 15, paddingTop: 4 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 20,
    paddingVertical: 12,
  },
  footerText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 15,
  },
  footerLink: {
    fontWeight: 'bold',
    color: '#7EA6FF',
    textDecorationLine: 'underline',
    marginLeft: 4,
  },
  countryCodePrefix: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  countryCodeText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  rowContainer: {
    flexDirection: 'row',
    marginTop: 15,
  },
});