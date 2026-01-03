import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
    Alert, KeyboardAvoidingView, Linking,
    Modal,
    Platform,
    Pressable,
    ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View
} from 'react-native';
import { useSignup } from '../../contexts/SignupContext';
import { apiUrl } from '../../services/api';

export default function SignupStep2() {
  const router = useRouter();
  const { data, setField, reset } = useSignup();
  const [loading, setLoading] = useState(false);
  const [genderModalVisible, setGenderModalVisible] = useState(false);
  

  const address = useMemo(() => [data.house, data.street].filter(Boolean).join(', '), [data.house, data.street]);

  const canSubmit =
    data.password.trim().length > 0 &&
    data.agree === true;

  const submit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    const payload: any = {
      name: [data.firstName, data.lastName].filter(Boolean).join(' ').trim(),
      email: data.email.trim(),
      countryCode: data.countryCode.trim(),
      mobile: data.mobile.replace(/\D/g, '').replace(/^0+/, ''),
      country: data.country.trim(),
      pincode: data.pincode.trim(),
      city: data.city?.trim() || undefined,
      address: address || undefined,
      password: data.password,
      role: 'user',
      organizationId: data.organizationId || undefined,
      weightProfile: {
        height: data.height ? Number(data.height) : undefined,
        heightUnit: data.heightUnit || 'cm',
        weight: data.weight ? Number(data.weight) : undefined,
        weightUnit: data.weightUnit || 'kg',
        waist: data.waist ? Number(data.waist) : undefined,
        waistUnit: data.waistUnit || 'cm',
        dob: data.dob || undefined,
        gender: data.gender || undefined,
      },
      signupMeta: { source: 'mobile', version: 'v1' },
    };

    const url = apiUrl('/api/auth/register');
    console.log('[Signup] POST', url, 'payload:', { ...payload, password: '********' });

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      console.log('[Signup] Response', res.status, json);

      if (!res.ok) {
        const msg = json?.message || 'Registration failed';
        Alert.alert('Signup Failed', msg);
        return;
      }

      // On success → go to result page (loading → success UI)
      reset();
      router.replace('/(authentication)/signupResult?ok=1');
      return;
    } catch (e: any) {
      console.error('[Signup] Network error:', e);
      Alert.alert('Network Error', e?.message || 'Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <LinearGradient colors={['#1D244D', '#02041A', '#1A1D3E']} style={styles.gradient} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={28} color="#fff" />
        </TouchableOpacity>

        <Text style={styles.title}>Profile details</Text>
        <Text style={styles.subtitle}>Step 2 of 2 • Health profile</Text>

        <BlurView intensity={25} tint="dark" style={styles.card}>
          {/* Password */}
          <View style={styles.inputRow}>
            <MaterialCommunityIcons name="lock-outline" size={22} color="#fff9" style={styles.icon} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#fff8"
              secureTextEntry
              value={data.password}
              onChangeText={(v) => setField('password', v)}
            />
          </View>

          {/* Height */}
          <View style={styles.row2}>
            <View style={styles.inputRow}>
              <MaterialCommunityIcons name="human-male-height-variant" size={22} color="#fff9" style={styles.icon} />
              <TextInput
                style={styles.input}
                placeholder="Height"
                placeholderTextColor="#fff8"
                keyboardType="decimal-pad"
                value={data.height || ''}
                onChangeText={(v) => setField('height', v)}
              />
              <TouchableOpacity onPress={() => setField('heightUnit', (data.heightUnit === 'cm' ? 'inch' : 'cm'))}>
                <Text style={styles.unitText}>{data.heightUnit}</Text>
              </TouchableOpacity>
            </View>

            {/* Weight */}
            <View style={styles.inputRow}>
              <MaterialCommunityIcons name="weight-kilogram" size={22} color="#fff9" style={styles.icon} />
              <TextInput
                style={styles.input}
                placeholder="Weight"
                placeholderTextColor="#fff8"
                keyboardType="decimal-pad"
                value={data.weight || ''}
                onChangeText={(v) => setField('weight', v)}
              />
              <TouchableOpacity onPress={() => setField('weightUnit', (data.weightUnit === 'kg' ? 'lb' : 'kg'))}>
                <Text style={styles.unitText}>{data.weightUnit}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Waist */}
          <View style={styles.inputRow}>
            <MaterialCommunityIcons name="tape-measure" size={22} color="#fff9" style={styles.icon} />
            <TextInput
              style={styles.input}
              placeholder="Waist"
              placeholderTextColor="#fff8"
              keyboardType="decimal-pad"
              value={data.waist || ''}
              onChangeText={(v) => setField('waist', v)}
            />
            <TouchableOpacity onPress={() => setField('waistUnit', (data.waistUnit === 'cm' ? 'inch' : 'cm'))}>
              <Text style={styles.unitText}>{data.waistUnit}</Text>
            </TouchableOpacity>
          </View>

          {/* DOB */}
          <View style={styles.inputRow}>
            <MaterialCommunityIcons name="calendar-month-outline" size={22} color="#fff9" style={styles.icon} />
            <TextInput
              style={styles.input}
              placeholder="DOB (YYYY-MM-DD)"
              placeholderTextColor="#fff8"
              value={data.dob || ''}
              onChangeText={(v) => setField('dob', v)}
            />
          </View>

          {/* Gender */}
          {/* Gender (dropdown) */}
          <TouchableOpacity style={styles.inputRow} onPress={() => setGenderModalVisible(true)}>
            <MaterialCommunityIcons name="account-outline" size={22} color="#fff9" style={styles.icon} />
            <Text style={[styles.input, { paddingVertical: 16, color: (data.gender ? '#fff' : '#fff8') }]}>
              {data.gender ? (data.gender.charAt(0).toUpperCase() + data.gender.slice(1)) : 'Select gender'}
            </Text>
            <Ionicons name="chevron-down" size={18} color="#fff" />
          </TouchableOpacity>

          {/* Terms */}
          <View style={styles.termsRow}>
            <TouchableOpacity onPress={() => setField('agree', !data.agree)}>
              <Ionicons name={data.agree ? 'checkbox-outline' : 'square-outline'} size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.termsText}>
              I agree to the{' '}
              <Text style={styles.link} onPress={() => Linking.openURL('https://dozemate.com/terms')}>Terms and Conditions</Text>
              {' '}and{' '}
              <Text style={styles.link} onPress={() => Linking.openURL('https://dozemate.com/privacy')}>Privacy Policy</Text>.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, !canSubmit && { opacity: 0.6 }]}
            disabled={!canSubmit || loading}
            onPress={submit}
          >
            <Text style={styles.primaryText}>{loading ? 'Submitting…' : 'Submit'}</Text>
          </TouchableOpacity>
        </BlurView>
        
      </ScrollView>
      {/* Floating Modal: Gender selector */}
      <Modal
        visible={genderModalVisible}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => setGenderModalVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setGenderModalVisible(false)} />
        <View style={styles.modalCenter}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Gender</Text>
              <TouchableOpacity onPress={() => setGenderModalVisible(false)}>
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.modalItem}
              onPress={() => { setField('gender', '' as any); setGenderModalVisible(false); }}
            >
              <Text style={styles.modalItemText}>Select</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalItem}
              onPress={() => { setField('gender', 'female' as any); setGenderModalVisible(false); }}
            >
              <Text style={styles.modalItemText}>Female</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalItem}
              onPress={() => { setField('gender', 'male' as any); setGenderModalVisible(false); }}
            >
              <Text style={styles.modalItemText}>Male</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalItem}
              onPress={() => { setField('gender', 'undisclosed' as any); setGenderModalVisible(false); }}
            >
              <Text style={styles.modalItemText}>Undisclosed</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
    
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  gradient: { position: 'absolute', left: 0, right: 0, top: 0, height: '100%' },
  scroll: { flexGrow: 1, alignItems: 'center', paddingTop: 60, paddingBottom: 40, paddingHorizontal: 20 },
  backBtn: { position: 'absolute', top: Platform.OS === 'ios' ? 60 : 64, left: 20, zIndex: 1 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 16, color: 'rgba(255,255,255,0.75)', marginBottom: 20 },
  card: { width: '100%', padding: 20, borderRadius: 30, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  row2: { flexDirection: 'row', gap: 10 },
  inputRow: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 15, paddingHorizontal: 15,
    marginBottom: 12, height: 55
  },
  icon: { marginRight: 10 },
  input: { flex: 1, color: '#fff', fontSize: 16 },
  unitText: { color: '#fff', fontWeight: '700', paddingHorizontal: 8 },
  termsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, marginBottom: 12 },
  termsText: { color: 'rgba(255,255,255,0.9)', flex: 1, flexWrap: 'wrap' },
  link: { color: '#7EB6FF', textDecorationLine: 'underline' },
  primaryBtn: { width: '100%', backgroundColor: '#fff', paddingVertical: 16, borderRadius: 18, alignItems: 'center', marginTop: 4 },
  primaryText: { color: '#1D244D', fontWeight: 'bold', fontSize: 16 },

  modalBackdrop: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)'
  },
  modalCenter: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: 'rgba(20,24,60,0.95)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 14,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  modalItem: {
    paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)'
  },
  modalItemText: { color: '#fff', fontSize: 15 },
});