import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  StatusBar, 
  TouchableOpacity, 
  ActivityIndicator, 
  FlatList,
  TextInput
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiUrl } from '@/services/api';
import { useProvisioning } from '@/contexts/ProvisioningContext';

interface Hospital {
  organizationId?: string;
  _id?: string;
  name: string;
}

export default function HospitalProvisionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isLightTheme } = useTheme();

  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedHospital, setSelectedHospital] = useState<Hospital | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

  useEffect(() => {
    const fetchHospitals = async () => {
      try {
        const token = await AsyncStorage.getItem('auth_token');
        const res = await fetch(apiUrl('/api/organizations/public'), {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        // Let's check if the response is actually JSON
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
          const data = await res.json();
          if (data.status === 'success') {
            setHospitals(data.data.organizations || []);
          } else {
            console.error("API Error:", data.message);
          }
        } else {
          const text = await res.text();
          console.error("Non-JSON response from server:", text);
        }
      } catch (err) {
        console.error("Failed to fetch hospitals:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchHospitals();
  }, []);

  // Debouncing logic for search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => {
      clearTimeout(handler);
    };
  }, [searchQuery]);

  const { setProvisionForHospitalId, setProvisionForHospitalName } = useProvisioning();

  const handleNext = () => {
    if (!selectedHospital) {
      alert("Please select an organization first.");
      return;
    }
    
    setProvisionForHospitalId(selectedHospital._id || null);
    setProvisionForHospitalName(selectedHospital.name);
    
    router.push('/(bluetooth)/ScanScreen');
  };

  const filteredHospitals = hospitals.filter(item => {
    const query = debouncedSearchQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      item.name?.toLowerCase().includes(query) ||
      item.organizationId?.toLowerCase().includes(query)
    );
  });

  return (
    <View style={[styles.container, isLightTheme && { backgroundColor: '#F8F9FA' }]}>
      <StatusBar 
        barStyle={isLightTheme ? 'dark-content' : 'light-content'} 
        backgroundColor={isLightTheme ? '#F8F9FA' : '#02041A'} 
      />
      {!isLightTheme && (
        <LinearGradient colors={['#1D244D', '#02041A', '#1A1D3E']} style={styles.gradientBackground} />
      )}

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}> 
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={isLightTheme ? '#111111' : '#FFFFFF'} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, isLightTheme && { color: '#111111' }]}>Assign to Organization</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) + 20 }]}>
        {/* Search Input Box */}
        <View style={[
          styles.searchContainer,
          isLightTheme && styles.searchContainerLight
        ]}>
          <Ionicons 
            name="search" 
            size={20} 
            color={isLightTheme ? '#666666' : 'rgba(255,255,255,0.6)'} 
            style={styles.searchIcon}
          />
          <TextInput
            style={[styles.searchInput, isLightTheme && { color: '#111111' }]}
            placeholder="Search organizations..."
            placeholderTextColor={isLightTheme ? '#999999' : 'rgba(255,255,255,0.4)'}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons 
                name="close-circle" 
                size={20} 
                color={isLightTheme ? '#999999' : 'rgba(255,255,255,0.4)'} 
              />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* inline List of Organizations */}
        <View style={[
          styles.listContainer,
          isLightTheme && styles.listContainerLight
        ]}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={isLightTheme ? '#0061A4' : '#4A90E2'} />
              <Text style={[styles.loadingText, isLightTheme && { color: '#666666' }]}>Loading organizations...</Text>
            </View>
          ) : filteredHospitals.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons 
                name="business-outline" 
                size={48} 
                color={isLightTheme ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)'} 
                style={{ marginBottom: 12 }}
              />
              <Text style={[styles.emptyText, isLightTheme && { color: '#666666' }]}>
                {searchQuery ? "No matching organizations found" : "No organizations found"}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredHospitals}
              keyExtractor={(item, index) => item.organizationId || item._id || index.toString()}
              renderItem={({ item }) => {
                const isSelected = selectedHospital?._id === item._id;
                return (
                  <TouchableOpacity 
                    style={[
                      styles.hospitalItem, 
                      isLightTheme && { borderBottomColor: 'rgba(0,0,0,0.05)' },
                      isSelected && (isLightTheme ? { backgroundColor: 'rgba(0,97,164,0.08)' } : { backgroundColor: 'rgba(74, 144, 226, 0.15)' })
                    ]}
                    onPress={() => setSelectedHospital(item)}
                  >
                    <View style={styles.hospitalItemLeft}>
                      <Ionicons 
                        name="business" 
                        size={20} 
                        color={isSelected ? (isLightTheme ? '#0061A4' : '#4A90E2') : (isLightTheme ? '#888888' : 'rgba(255,255,255,0.5)')} 
                        style={{ marginRight: 12 }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[
                          styles.hospitalName, 
                          isLightTheme && { color: '#111111' },
                          isSelected && { color: isLightTheme ? '#0061A4' : '#4A90E2', fontWeight: 'bold' }
                        ]}>
                          {item.name}
                        </Text>
                        {item.organizationId ? (
                          <Text style={[
                            styles.hospitalIdText,
                            isLightTheme && { color: '#888888' },
                            isSelected && { color: isLightTheme ? '#0061A4' : '#4A90E2' }
                          ]}>
                            ID: {item.organizationId}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={22} color={isLightTheme ? '#0061A4' : '#4A90E2'} />
                    )}
                  </TouchableOpacity>
                );
              }}
              keyboardShouldPersistTaps="handled"
            />
          )}
        </View>

        <TouchableOpacity 
          style={[
            styles.nextButton, 
            !selectedHospital && styles.nextButtonDisabled
          ]} 
          onPress={handleNext}
          disabled={!selectedHospital}
        >
          <Text style={styles.nextButtonText}>Next</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#02041A' },
  gradientBackground: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  header: { 
    paddingHorizontal: 16, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    paddingBottom: 16
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: { color: '#FFF', fontSize: 20, fontWeight: '700' },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
  },
  description: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 22,
    marginBottom: 32,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 54,
    marginBottom: 20,
  },
  searchContainerLight: {
    backgroundColor: 'transparent',
    borderColor: '#E4E6EB',
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    height: '100%',
  },
  listContainer: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
  },
  listContainerLight: {
    backgroundColor: 'transparent',
    borderColor: '#E4E6EB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  emptyText: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
  },
  hospitalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  hospitalItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  hospitalName: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  hospitalIdText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  nextButton: {
    backgroundColor: '#4A90E2',
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  nextButtonDisabled: {
    backgroundColor: 'rgba(74, 144, 226, 0.4)',
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  }
});
