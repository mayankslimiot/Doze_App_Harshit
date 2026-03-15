import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Image, StatusBar } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/services/api';

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value || '—'}</Text>
    </View>
  );
}

export default function UserInfoScreen() {
  const router = useRouter();
  const { auth, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const insets = useSafeAreaInsets();

  const profile = auth.user?.profile || {} as any;

  const ui = useMemo(() => {
    // Name
    const name = auth.user?.name || profile.name || '';
    const parts = name.trim().split(' ').filter(Boolean);
    const firstName = profile.firstName || parts[0] || '';
    const lastName = profile.lastName || parts.slice(1).join(' ') || '';

    // Helpers to read various backend shapes
    const pick = (...values: any[]) => values.find(v => v !== undefined && v !== null && v !== '');
    const parseDate = (val: any): string | undefined => {
      if (val === undefined || val === null || val === '') return undefined;
      try {
        if (typeof val === 'number') {
          // epoch seconds or ms
          const ms = val < 1e12 ? val * 1000 : val;
          const d = new Date(ms);
          if (!isNaN(d.getTime())) return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
        }
        if (typeof val === 'string') {
          // handle ISO or yyyy-mm-dd
          const n = Number(val);
          if (!Number.isNaN(n)) return parseDate(n);
          const d = new Date(val);
          if (!isNaN(d.getTime())) return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
        }
      } catch {}
      return undefined;
    };
    const composePhone = (): string | undefined => {
      const cc = pick(profile.countryCode, profile.dialCode, profile.phoneCountryCode, profile?.phone?.countryCode);
      const num = pick(profile.mobile, profile.phone, profile.phoneNumber, profile?.phone?.number);
      if (!cc && !num) return undefined;
      const ccStr = cc ? String(cc).replace(/^\+?/, '+') : '';
      const numStr = num ? String(num) : '';
      return [ccStr, numStr].filter(Boolean).join('-');
    };

    // Birthday
    const dobRaw: any = pick(profile.dateOfBirth, profile.dob, profile.birthDate, profile.birthday);
    const dob = parseDate(dobRaw) || (typeof dobRaw === 'string' ? dobRaw : undefined);

    // Login details (email, phone, joined)
    const email = pick(auth.user?.email, profile.email, profile.user?.email);
    const phone = composePhone();
    const joinedRaw: any = pick(
      profile.createdAt,
      profile.created_at,
      profile.createdDate,
      profile.created_on,
      profile.joinedOn,
      profile.joined_on,
      profile.dateJoined,
      profile.joinDate,
      profile.registrationDate,
      profile.registeredAt,
      profile.signupDate,
      auth.user && (auth.user as any).createdAt,
    );
    const joined = parseDate(joinedRaw) || (typeof joinedRaw === 'string' ? joinedRaw : undefined);

    return { firstName, lastName, dob, email, phone, joined };
  }, [auth.user, profile]);

  const onLogoutAll = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      const token = auth.token;
      if (token) {
        const url = apiUrl('/api/auth/logout-all'); // Assumes backend supports this
        try {
          await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
        } catch {}
      }
    } finally {
      await logout();
      // Redirect to login screen
      try { router.replace('/(authentication)/signin'); } catch {}
      setIsLoggingOut(false);
    }
  };

  const confirmLogoutAll = () => {
    Alert.alert(
      'Logout all devices',
      'Are you sure you want to logout from all devices?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: onLogoutAll },
      ],
    );
  };

  const onLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      // Redirect to login screen
      try { router.replace('/(authentication)/signin'); } catch {}
      setIsLoggingOut(false);
    }
  };

  const confirmLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: onLogout },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar barStyle="light-content" backgroundColor="#02041A" />
      <LinearGradient colors={["#1D244D", "#02041A", "#1A1D3E"]} style={StyleSheet.absoluteFill} />

      <View style={[styles.headerRow, { paddingTop: insets.top + 6 }]}> 
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Profile</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Avatar block (large, themed) */}
      <View style={styles.avatarWrap}>
        <LinearGradient colors={["#6E5BFA", "#4B7BFF"]} style={styles.avatarRing} />
        <BlurView intensity={30} tint="dark" style={styles.avatarInner}>
          <Ionicons name="person" size={56} color="#C7B9FF" />
        </BlurView>
      </View>
      <View style={styles.avatarButtonsRow}>
        <TouchableOpacity style={[styles.pillSecondary]} activeOpacity={0.9}>
          <Text style={styles.pillSecondaryText}>Change photo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.pillGhost]} activeOpacity={0.9}>
          <Text style={styles.pillGhostText}>Remove</Text>
        </TouchableOpacity>
      </View>

      <BlurView intensity={25} tint="dark" style={styles.infoCard}>
        <Row label="Username:" value={`${ui.firstName}    ${ui.lastName}`.trim() || '—'} />
        <View style={styles.divider} />
        <Row label="Birthday:" value={ui.dob || '—'} />
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Profile Image:</Text>
          <Ionicons name="image-outline" size={22} color="#C7B9FF" />
        </View>
      </BlurView>

      <BlurView intensity={25} tint="dark" style={styles.infoCard}>
        <Text style={styles.sectionTitle}>Login Details</Text>
        <Row label="Email:" value={ui.email || '—'} />
        <View style={styles.divider} />
        <Row label="Phone:" value={ui.phone || '—'} />
        <View style={styles.divider} />
        <Row label="Joined on:" value={ui.joined || '—'} />
      </BlurView>

      <TouchableOpacity style={styles.pillPrimary} activeOpacity={0.9}>
        <Text style={styles.pillText}>Add Caretaker</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.updateLink}>
        <Text style={styles.updateText}>Update</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.pillPrimary} activeOpacity={0.9}>
        <Text style={styles.pillText}>Set Alerts</Text>
      </TouchableOpacity>

      <View style={{ height: 8 }} />

      <BlurView intensity={20} tint="dark" style={styles.logoutCard}>
        <TouchableOpacity style={styles.logoutBtn} onPress={confirmLogout} disabled={isLoggingOut}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.logoutBtn, { marginTop: 8 }]} onPress={confirmLogoutAll} disabled={isLoggingOut}>
          <Text style={styles.logoutText}>Logout all devices</Text>
        </TouchableOpacity>
      </BlurView>

      <View style={{ height: insets.bottom + 24 }} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#02041A', paddingHorizontal: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  backBtn: { padding: 4 },
  title: { color: '#fff', fontSize: 20, fontWeight: '800' },
  avatarWrap: { alignItems: 'center', justifyContent: 'center', marginTop: 6, marginBottom: 10 },
  avatarRing: { position: 'absolute', width: 124, height: 124, borderRadius: 62, opacity: 0.35 },
  avatarInner: { width: 108, height: 108, borderRadius: 54, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(0,0,0,0.25)' },
  avatarButtonsRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 12 },
  pillSecondary: { backgroundColor: '#7B66FF', borderRadius: 22, paddingHorizontal: 14, paddingVertical: 10 },
  pillSecondaryText: { color: '#0F112B', fontWeight: '900' },
  pillGhost: { backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 22, paddingHorizontal: 14, paddingVertical: 10 },
  pillGhostText: { color: '#FFFFFF', fontWeight: '800' },
  infoCard: { borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 12 },
  sectionTitle: { color: '#C7B9FF', fontWeight: '700', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  rowLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 13 },
  rowValue: { color: '#fff', fontSize: 14, fontWeight: '700' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)' },

  pillPrimary: { backgroundColor: '#7B66FF', borderRadius: 24, alignItems: 'center', paddingVertical: 12, marginVertical: 6 },
  pillText: { color: '#fff', fontWeight: '800' },
  updateLink: { alignItems: 'center', marginVertical: 6 },
  updateText: { color: '#5BB0FF', fontWeight: '800', textDecorationLine: 'underline' },

  logoutCard: { borderRadius: 16, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  logoutBtn: { backgroundColor: 'rgba(255,255,255,0.10)', paddingVertical: 12, borderRadius: 14, alignItems: 'center' },
  logoutText: { color: '#fff', fontWeight: '800' },
});


