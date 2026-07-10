import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { useSignup } from '../../contexts/SignupContext';
import { apiUrl } from '../../services/api';

type Org = { _id: string; name: string; organizationId?: string };

const CC_TO_COUNTRY: Record<string, string> = {
  '+91': 'India',
  '+1': 'United States',
  '+44': 'United Kingdom',
  '+61': 'Australia',
  '+81': 'Japan',
  '+971': 'United Arab Emirates',
};
const COUNTRY_CODE_OPTIONS = ['+91', '+1', '+44', '+61', '+81', '+971'];

export default function SignupStep1() {
  const router = useRouter();
  const { data, setField } = useSignup();

  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(false);

  // Floating modals
  const [orgModalVisible, setOrgModalVisible] = useState(false);
  const [ccModalVisible, setCcModalVisible] = useState(false);
  const [orgSearch, setOrgSearch] = useState('');
  const [ccSearch, setCcSearch] = useState('');

  // Fetch organizations once
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        setOrgsLoading(true);
        const r = await fetch(apiUrl('/api/public/organizations'));
        const j = await r.json().catch(() => ({}));
        if (!isMounted) return;
        const list: Org[] = j?.data?.organizations || [];
        setOrgs(Array.isArray(list) ? list : []);
      } catch (e) {
        console.warn('[Signup] Organizations fetch failed', e);
        setOrgs([]);
      } finally {
        setOrgsLoading(false);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  // Auto country on country code change
  useEffect(() => {
    const c = CC_TO_COUNTRY[data.countryCode];
    if (c) setField('country', c);
  }, [data.countryCode]);

  // Pincode → City (onBlur)
  const handlePincodeBlur = async () => {
    const pin = (data.pincode || '').trim();
    if (pin.length < 4) return;
    try {
      const res = await fetch(`https://api.postalpincode.in/pincode/${encodeURIComponent(pin)}`);
      const json = await res.json();
      const office = json?.[0]?.PostOffice?.[0];
      if (office?.District) setField('city', office.District);
    } catch {/* noop */}
  };

  // Validate required fields before continue
  const missingMsg = useMemo(() => {
    const missing: string[] = [];
    if (!data.firstName?.trim()) missing.push('First name');
    if (!data.email?.trim()) missing.push('Email');
    if (!data.countryCode?.trim()) missing.push('Country code');
    if (!data.mobile?.trim()) missing.push('Mobile');
    if (!data.country?.trim()) missing.push('Country');
    if (!data.pincode?.trim()) missing.push('Pincode');
    return missing.length ? `Missing: ${missing.join(', ')}` : '';
  }, [data]);

  const onContinue = () => {
    if (missingMsg) {
      Alert.alert('Incomplete', missingMsg);
      return;
    }
    router.push('/(authentication)/signup2');
  };

  const selectedOrgName = useMemo(() => {
    const f = orgs.find(o => o._id === data.organizationId);
    return f ? `${f.name}${f.organizationId ? ` (${f.organizationId})` : ''}` : '';
  }, [orgs, data.organizationId]);

  const filteredOrgs = useMemo(() => {
    const q = orgSearch.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter(o =>
      o.name?.toLowerCase().includes(q) ||
      o.organizationId?.toLowerCase().includes(q)
    );
  }, [orgs, orgSearch]);

  const filteredCC = useMemo(() => {
    const q = ccSearch.trim().toLowerCase();
    const list = COUNTRY_CODE_OPTIONS.map(code => ({
      code,
      label: CC_TO_COUNTRY[code] ? `${code} • ${CC_TO_COUNTRY[code]}` : code
    }));
    if (!q) return list;
    return list.filter(x =>
      x.code.toLowerCase().includes(q) || x.label.toLowerCase().includes(q)
    );
  }, [ccSearch]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <LinearGradient colors={['#1D244D', '#02041A', '#1A1D3E']} style={styles.gradient} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={28} color="#fff" />
        </TouchableOpacity>

        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>Step 1 of 2 • Basic details</Text>

        <BlurView intensity={25} tint="dark" style={styles.card}>
          {/* First / Last */}
          <View style={styles.row2}>
            <View style={styles.inputRow}>
              <MaterialCommunityIcons name="account-outline" size={22} color="#fff9" style={styles.icon} />
              <TextInput
                style={styles.input}
                placeholder="First name"
                placeholderTextColor="#fff8"
                value={data.firstName}
                onChangeText={(v) => setField('firstName', v)}
              />
            </View>
            <View style={styles.inputRow}>
              <MaterialCommunityIcons name="account-outline" size={22} color="#fff9" style={styles.icon} />
              <TextInput
                style={styles.input}
                placeholder="Last name  (optional)"
                placeholderTextColor="#fff8"
                value={data.lastName}
                onChangeText={(v) => setField('lastName', v)}
              />
            </View>
          </View>

          {/* Email */}
          <View style={styles.inputRow}>
            <MaterialCommunityIcons name="email-outline" size={22} color="#fff9" style={styles.icon} />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#fff8"
              keyboardType="email-address"
              autoCapitalize="none"
              value={data.email}
              onChangeText={(v) => setField('email', v)}
            />
          </View>

          {/* Organization (optional) — opens floating modal */}
          <TouchableOpacity
            onPress={() => setOrgModalVisible(true)}
            activeOpacity={0.8}
            style={[styles.inputRow, { marginBottom: 8 }]}
          >
            <MaterialCommunityIcons name="office-building-outline" size={22} color="#fff9" style={styles.icon} />
            <Text style={[styles.input, { paddingVertical: 16, color: selectedOrgName ? '#fff' : '#fff8' }]}>
              {selectedOrgName || (orgsLoading ? 'Loading organizations…' : 'Select Organization (optional)')}
            </Text>
            <Ionicons name="chevron-down" size={18} color="#fff" />
          </TouchableOpacity>

          {/* Country code + Mobile — code opens floating modal */}
          <View style={styles.row2}>
            <View style={[styles.inputRow, { flex: 1.0 }]}>
              <MaterialCommunityIcons name="cellphone" size={22} color="#fff9" style={styles.icon} />
              <TouchableOpacity style={styles.ccPill} onPress={() => setCcModalVisible(true)}>
                <Text style={styles.ccText}>{data.countryCode}</Text>
                <Ionicons name="chevron-down" size={16} color="#1D244D" />
              </TouchableOpacity>
              <TextInput
                style={[styles.input, { marginLeft: 8 }]}
                placeholder="Mobile"
                placeholderTextColor="#fff8"
                keyboardType="phone-pad"
                value={data.mobile}
                onChangeText={(v) => setField('mobile', v)}
              />
            </View>
          </View>

          {/* Country */}
          <View style={styles.inputRow}>
            <MaterialCommunityIcons name="map-marker-outline" size={22} color="#fff9" style={styles.icon} />
            <TextInput
              style={styles.input}
              placeholder="Country"
              placeholderTextColor="#fff8"
              value={data.country}
              onChangeText={(v) => setField('country', v)}
            />
          </View>

          {/* Pincode + City */}
          <View style={styles.row2}>
            <View style={styles.inputRow}>
              <MaterialCommunityIcons name="map-marker-outline" size={22} color="#fff9" style={styles.icon} />
              <TextInput
                style={styles.input}
                placeholder="Pincode"
                placeholderTextColor="#fff8"
                keyboardType="number-pad"
                value={data.pincode}
                onChangeText={(v) => setField('pincode', v)}
                onBlur={handlePincodeBlur}
              />
            </View>
            <View style={styles.inputRow}>
              <MaterialCommunityIcons name="city-variant-outline" size={22} color="#fff9" style={styles.icon} />
              <TextInput
                style={styles.input}
                placeholder="City"
                placeholderTextColor="#fff8"
                value={data.city || ''}
                onChangeText={(v) => setField('city', v)}
              />
            </View>
          </View>

          {/* Address: House / Street */}
          <View style={styles.inputRow}>
            <MaterialCommunityIcons name="home-outline" size={22} color="#fff9" style={styles.icon} />
            <TextInput
              style={styles.input}
              placeholder="House / Building (optional)"
              placeholderTextColor="#fff8"
              value={data.house || ''}
              onChangeText={(v) => setField('house', v)}
            />
          </View>
          <View style={styles.inputRow}>
            <MaterialCommunityIcons name="home-outline" size={22} color="#fff9" style={styles.icon} />
            <TextInput
              style={styles.input}
              placeholder="Street (optional)"
              placeholderTextColor="#fff8"
              value={data.street || ''}
              onChangeText={(v) => setField('street', v)}
            />
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, !!missingMsg && { opacity: 0.6 }]}
            onPress={onContinue}
          >
            <Text style={styles.primaryText}>Continue</Text>
          </TouchableOpacity>
        </BlurView>
      </ScrollView>

      {/* Floating Modal: Organization selector */}
      <Modal
        visible={orgModalVisible}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => setOrgModalVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setOrgModalVisible(false)}>
          {/* capture backdrop presses */}
        </Pressable>
        <View style={styles.modalCenter}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Organization</Text>
              <TouchableOpacity onPress={() => setOrgModalVisible(false)}>
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.searchRow}>
              <Ionicons name="search" size={18} color="#fff9" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search organizations"
                placeholderTextColor="#fff8"
                value={orgSearch}
                onChangeText={setOrgSearch}
              />
            </View>

            <FlatList
              data={filteredOrgs}
              keyExtractor={(o) => o._id}
              ListHeaderComponent={
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => {
                    setField('organizationId', undefined as any);
                    setOrgModalVisible(false);
                  }}
                >
                  <Text style={styles.modalItemText}>Select</Text>
                </TouchableOpacity>
              }
              ListEmptyComponent={
                <Text style={styles.dropdownMuted}>
                  {orgsLoading ? 'Loading…' : (orgSearch ? 'No matches' : 'No organizations')}
                </Text>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => {
                    setField('organizationId', item._id);
                    setOrgModalVisible(false);
                  }}
                >
                  <Text style={styles.modalItemText}>
                    {item.name}{item.organizationId ? ` (${item.organizationId})` : ''}
                  </Text>
                </TouchableOpacity>
              )}
              style={{ maxHeight: 320 }}
            />
          </View>
        </View>
      </Modal>

      {/* Floating Modal: Country code selector */}
      <Modal
        visible={ccModalVisible}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => setCcModalVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setCcModalVisible(false)} />
        <View style={styles.modalCenter}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Country Code</Text>
              <TouchableOpacity onPress={() => setCcModalVisible(false)}>
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.searchRow}>
              <Ionicons name="search" size={18} color="#fff9" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search codes or country"
                placeholderTextColor="#fff8"
                value={ccSearch}
                onChangeText={setCcSearch}
              />
            </View>

            <FlatList
              data={filteredCC}
              keyExtractor={(x) => x.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => {
                    setField('countryCode', item.code);
                    setCcModalVisible(false);
                  }}
                >
                  <Text style={styles.modalItemText}>{item.label}</Text>
                </TouchableOpacity>
              )}
              style={{ maxHeight: 320 }}
            />
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
  backBtn: { position: 'absolute', top: Platform.OS === 'ios' ? 60 : 64, left: 20, zIndex: 1. },
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
  primaryBtn: { width: '100%', backgroundColor: '#fff', paddingVertical: 16, borderRadius: 18, alignItems: 'center', marginTop: 8 },
  primaryText: { color: '#1D244D', fontWeight: 'bold', fontSize: 16 },

  // Country code pill
  ccPill: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ccText: { color: '#1D244D', fontWeight: '700' },

  // Dropdown (modal) shared styles
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
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10, paddingHorizontal: 10, height: 40, marginBottom: 10,
    gap: 8
  },
  searchInput: { flex: 1, color: '#fff' },
  modalItem: {
    paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)'
  },
  modalItemText: { color: '#fff', fontSize: 15 },
  dropdownMuted: { color: 'rgba(255,255,255,0.7)', fontSize: 14, padding: 12, textAlign: 'center' },
});