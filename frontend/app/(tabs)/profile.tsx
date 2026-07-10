import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, Alert, TextInput, Image, Modal, Platform, Pressable, useColorScheme } from 'react-native';
import { BlurView } from 'expo-blur';
import DateTimePicker from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useProvisioning } from '@/contexts/ProvisioningContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { apiUrl } from '@/services/api';
import { HealthGauge } from '@/components/HealthGauge';
import {
  calculateBMI,
  calculateWaistHeightRatio,
  calculateABSI,
  getBMIScore,
  getWaistHeightRatioScore,
  getABSIScore,
  calculateOverallBodyIndex,
  calculateAge,
  HINTS,
} from '@/utils/bodyMetrics';

function UnitDropdown({ 
  value, 
  options, 
  onSelect,
  isLight
}: { 
  value: string; 
  options: string[]; 
  onSelect: (value: string) => void;
  isLight?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <View style={styles.unitDropdownContainer}>
      <TouchableOpacity 
        onPress={() => setIsOpen(!isOpen)} 
        style={styles.unitDropdownButton}
        activeOpacity={0.8}
      >
        <Text style={[styles.unitDropdownText, isLight && { color: '#666666' }]}>{value}</Text>
        <Ionicons 
          name={isOpen ? 'chevron-up' : 'chevron-down'} 
          size={16} 
          color={isLight ? '#0061A4' : 'rgba(255,255,255,0.7)'} 
        />
      </TouchableOpacity>
      {isOpen && (
        <View style={[styles.unitDropdownMenu, isLight && { backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.06)', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 5, elevation: 4 }]}>
          {options.map((option, index) => (
            <TouchableOpacity
              key={option}
              style={[
                styles.unitDropdownItem,
                index === options.length - 1 && styles.unitDropdownItemLast,
                isLight && { borderBottomColor: 'rgba(0,0,0,0.06)' }
              ]}
              onPress={() => {
                onSelect(option);
                setIsOpen(false);
              }}
            >
              <Text style={[styles.unitDropdownItemText, isLight && { color: '#111111' }]}>{option}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

function MeasurementRow({ 
  label, 
  value, 
  unit, 
  unitOptions,
  onChangeValue,
  onChangeUnit,
  onInfoPress,
  isLight
}: { 
  label: string; 
  value: string; 
  unit: string;
  unitOptions: string[];
  onChangeValue: (value: string) => void;
  onChangeUnit: (unit: string) => void;
  onInfoPress?: () => void;
  isLight?: boolean;
}) {
  // Get placeholder based on selected unit
  const getPlaceholder = () => {
    if (label === 'Weight') {
      return unit === 'Kg' ? 'Enter weight (kg)' : 'Enter weight (lbs)';
    } else if (label === 'Waist') {
      return unit === 'In' ? 'Enter waist (in)' : 'Enter waist (cm)';
    }
    return 'Enter value';
  };

  return (
    <View style={styles.measurementRow}>
      <View style={styles.measurementLabelRow}>
        <Text style={[styles.measurementLabel, isLight && { color: '#666666' }]}>{label}</Text>
        {onInfoPress && (
          <TouchableOpacity onPress={onInfoPress} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Ionicons name="information-circle-outline" size={16} color={isLight ? '#0061A4' : 'rgba(255,255,255,0.5)'} style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.measurementInputContainer}>
          <TextInput
            style={[styles.measurementInput, isLight && { color: '#111111' }]}
            value={value}
            onChangeText={onChangeValue}
            placeholder={getPlaceholder()}
            placeholderTextColor={isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)'}
            keyboardType="numeric"
            textAlign="left"
          />
        <UnitDropdown
          value={unit}
          options={unitOptions}
          onSelect={onChangeUnit}
          isLight={isLight}
        />
      </View>
    </View>
  );
}

function HeightRow({ 
  label, 
  feet, 
  inches,
  unit, 
  unitOptions,
  onChangeFeet,
  onChangeInches,
  onChangeUnit,
  onInfoPress,
  isLight
}: { 
  label: string; 
  feet: string; 
  inches: string;
  unit: string;
  unitOptions: string[];
  onChangeFeet: (value: string) => void;
  onChangeInches: (value: string) => void;
  onChangeUnit: (unit: string) => void;
  onInfoPress?: () => void;
  isLight?: boolean;
}) {
  // Get placeholder based on selected unit
  const getPlaceholder = () => {
    if (unit === 'Ft & In') {
      return 'Feet';
    } else if (unit === 'Cm') {
      return 'Enter height (cm)';
    } else if (unit === 'M') {
      return 'Enter height (m)';
    }
    return 'Feet';
  };

  const getInchesPlaceholder = () => {
    if (unit === 'Ft & In') {
      return 'Inches';
    }
    return '';
  };

  // If not Ft & In, show single input
  if (unit !== 'Ft & In') {
    return (
      <View style={styles.measurementRow}>
        <View style={styles.measurementLabelRow}>
          <Text style={[styles.measurementLabel, isLight && { color: '#666666' }]}>{label}</Text>
          {onInfoPress && (
            <TouchableOpacity onPress={onInfoPress} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Ionicons name="information-circle-outline" size={16} color={isLight ? '#0061A4' : 'rgba(255,255,255,0.5)'} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.measurementInputContainer}>
          <TextInput
            style={[styles.measurementInput, isLight && { color: '#111111' }]}
            value={feet}
            onChangeText={onChangeFeet}
            placeholder={getPlaceholder()}
            placeholderTextColor={isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)'}
            keyboardType="numeric"
            textAlign="left"
          />
          <UnitDropdown
            value={unit}
            options={unitOptions}
            onSelect={onChangeUnit}
            isLight={isLight}
          />
        </View>
      </View>
    );
  }

  // Show two inputs for Feet & Inches
  return (
    <View style={styles.measurementRow}>
      <View style={styles.measurementLabelRow}>
        <Text style={[styles.measurementLabel, isLight && { color: '#666666' }]}>{label}</Text>
        {onInfoPress && (
          <TouchableOpacity onPress={onInfoPress} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Ionicons name="information-circle-outline" size={16} color={isLight ? '#0061A4' : 'rgba(255,255,255,0.5)'} style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.measurementInputContainer}>
        <View style={styles.heightInputsContainer}>
          <TextInput
            style={[styles.heightInput, isLight && { color: '#111111' }]}
            value={feet}
            onChangeText={(val) => {
              onChangeFeet(val);
              if (val && !inches) onChangeInches('0');
            }}
            placeholder={getPlaceholder()}
            placeholderTextColor={isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)'}
            keyboardType="numeric"
            textAlign="left"
          />
          <TextInput
            style={[styles.heightInput, isLight && { color: '#111111' }]}
            value={inches}
            onChangeText={onChangeInches}
            placeholder={getInchesPlaceholder()}
            placeholderTextColor={isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)'}
            keyboardType="numeric"
            textAlign="left"
          />
        </View>
        <UnitDropdown
          value={unit}
          options={unitOptions}
          onSelect={onChangeUnit}
          isLight={isLight}
        />
      </View>
    </View>
  );
}

function CalculatedIndexRow({ 
  label, 
  subtitle,
  value, 
  score, 
  onInfoPress,
  isLight
}: { 
  label: string; 
  subtitle?: string;
  value: string; 
  score: number; 
  onInfoPress?: () => void;
  isLight?: boolean;
}) {
  return (
    <View style={[
      styles.calculatedIndexCard, 
      { backgroundColor: 'transparent' }, // Override default background
      isLight && { 
        borderColor: 'rgba(0, 0, 0, 0.1)', // Slightly darker border for visibility
      }
    ]}>
      <View style={styles.calculatedIndexHeader}>
        <View style={styles.calculatedIndexLabelContainer}>
          <Text style={[styles.calculatedIndexLabel, isLight && { color: '#666666' }]}>{label}</Text>
          {subtitle ? <Text style={[styles.calculatedIndexSubtitle, isLight && { color: '#888888' }]}>{subtitle}</Text> : null}
        </View>
        <TouchableOpacity onPress={onInfoPress} style={styles.infoIcon}>
          <Ionicons name="information-circle-outline" size={18} color={isLight ? '#0061A4' : 'rgba(255,255,255,0.7)'} />
        </TouchableOpacity>
      </View>
      <View style={styles.calculatedIndexContent}>
        <View style={styles.calculatedIndexGaugeContainer}>
          <HealthGauge score={score} size={80} />
          <Text style={[styles.calculatedIndexScore, isLight && { color: '#111111' }]}>{score.toFixed(1)}</Text>
        </View>
        <Text style={[styles.calculatedIndexValue, isLight && { color: '#111111' }]}>{value}</Text>
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { auth, fetchProfile, saveLocalProfile, saveProfileToServer } = useAuth();
  const [isPhotoModalVisible, setIsPhotoModalVisible] = useState(false);

  const { isLightTheme } = useTheme();
  const { setProvisionForHospitalId, setProvisionForHospitalName } = useProvisioning();
  
  const initial = useMemo(() => {
    const p: any = auth.user?.profile || {};
    const name: string = auth.user?.name || p.name || '';
    const parts = name.split(' ');
    const firstName = p.firstName || parts[0] || '';
    const lastName = p.lastName || parts.slice(1).join(' ') || '';
    const profileImage = p.profileImage || null;
    
    // Handle height: if server has height in cm, convert to feet/inches for display
    let heightDisplay = String(p.height ?? '');
    const heightUnitFromServer = String(p.heightUnit ?? 'ft_in');
    
    // If height is a number (cm from server) and we're using ft_in unit, convert to feet/inches string
    // Backend stores height in cm, but if unit is ft_in, we need to convert cm to feet/inches for display
    if (heightDisplay && !isNaN(parseFloat(heightDisplay))) {
      const heightCm = parseFloat(heightDisplay);
      if (heightUnitFromServer === 'ft_in' && heightCm > 0) {
        // Convert cm to feet/inches for display
        const totalInches = heightCm / 2.54;
        const feet = Math.floor(totalInches / 12);
        const inches = Math.round(totalInches % 12);
        heightDisplay = `${feet}'${inches}"`;
      } else if (heightUnitFromServer === 'cm' && heightCm > 0) {
        // Keep as cm value
        heightDisplay = String(heightCm);
      } else if (heightUnitFromServer === 'm' && heightCm > 0) {
        // Convert cm to meters for display
        heightDisplay = String(heightCm / 100);
      }
    }
    
    // Handle waist: Backend stores waist in cm, convert back to inches if unit is 'in'
    let waistDisplay = String(p.waist ?? '');
    const waistUnitFromServer = String(p.waistUnit ?? 'in');
    if (waistDisplay && !isNaN(parseFloat(waistDisplay))) {
      const waistCm = parseFloat(waistDisplay);
      if (waistUnitFromServer === 'in' && waistCm > 0) {
        // Convert cm back to inches for display
        waistDisplay = String(Math.round((waistCm / 2.54) * 10) / 10); // Round to 1 decimal
      } else if (waistUnitFromServer === 'cm' && waistCm > 0) {
        // Keep as cm value
        waistDisplay = String(waistCm);
      }
    }
    
    // Handle weight: Backend stores weight in kg, convert back to lbs if unit is 'lbs'
    let weightDisplay = String(p.weight ?? '');
    const weightUnitFromServer = String(p.weightUnit ?? 'kg');
    if (weightDisplay && !isNaN(parseFloat(weightDisplay))) {
      const weightKg = parseFloat(weightDisplay);
      if (weightUnitFromServer === 'lbs' && weightKg > 0) {
        // Convert kg back to lbs for display
        weightDisplay = String(Math.round((weightKg / 0.453592) * 10) / 10); // Round to 1 decimal
      } else if (weightUnitFromServer === 'kg' && weightKg > 0) {
        // Keep as kg value
        weightDisplay = String(weightKg);
      }
    }
    
    return {
      firstName,
      lastName,
      dateOfBirth: p.dateOfBirth || p.dob || '',
      gender: (p.gender || '').toLowerCase() as string,
      mobile: String(p.mobile || (auth.user as any)?.mobile || ''),
      waist: waistDisplay,
      waistUnit: waistUnitFromServer,
      weight: weightDisplay,
      weightUnit: weightUnitFromServer,
      height: heightDisplay,
      heightUnit: heightUnitFromServer,
      profileImage,
    };
  }, [auth.user]);

  const [isEditingDetails, setIsEditingDetails] = useState(false);
  
  const formattedName = [initial.firstName, initial.lastName].filter(Boolean).join(' ') || '—';
  const [editName, setEditName] = useState(formattedName);
  const [editMobile, setEditMobile] = useState(initial.mobile || '');
  const [editGender, setEditGender] = useState(initial.gender || '');
  const [editDob, setEditDob] = useState(initial.dateOfBirth || '');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateObject, setDateObject] = useState(() => new Date());
  const [sexModalVisible, setSexModalVisible] = useState(false);

  useEffect(() => {
    setEditName([initial.firstName, initial.lastName].filter(Boolean).join(' ') || '—');
    setEditMobile(initial.mobile || '');
    setEditGender(initial.gender || '');
    setEditDob(initial.dateOfBirth || '');
    if (initial.dateOfBirth) {
       const d = new Date(initial.dateOfBirth);
       if (!isNaN(d.getTime())) setDateObject(d);
    }
  }, [initial]);

  const formatDisplayDate = (dString: string) => {
    if (!dString) return '';
    const match = dString.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[3]}-${match[2]}-${match[1]}`;
    return dString;
  };

  const handleSaveProfileDetails = async () => {
    const payload = {
       name: editName.trim(),
       mobile: editMobile.trim(),
       gender: editGender,
       dateOfBirth: editDob, 
    };
    
    // Auth context's saveProfileToServer handles the PUT request
    const res = await saveProfileToServer(payload);
    if(res.success){
       setIsEditingDetails(false);
    } else {
       Alert.alert("Error", res.error || "Failed to save details");
    }
  };

  const profileImageUri = useMemo(() => {
    if (!initial.profileImage) return null;
    return initial.profileImage.startsWith('data:') ? initial.profileImage : apiUrl(initial.profileImage);
  }, [initial.profileImage]);

  // Handle Photo Picker
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'We need permission to access your photos to change your profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled) {
      const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
      const nextProfile = {
        ...auth.user?.profile,
        profileImage: base64Image,
      };
      await saveLocalProfile(nextProfile);
      await saveProfileToServer({ profileImage: base64Image });
      setIsPhotoModalVisible(false);
    }
  };

  const removeImage = async () => {
    const nextProfile = {
      ...auth.user?.profile,
      profileImage: null,
    };
    await saveLocalProfile(nextProfile);
    await saveProfileToServer({ profileImage: null });
    setIsPhotoModalVisible(false);
  };

  const initials = useMemo(() => {
    const name = [initial.firstName, initial.lastName].filter(Boolean).join(' ') || auth.user?.email || 'U';
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0][0].toUpperCase();
  }, [initial.firstName, initial.lastName, auth.user?.email]);

  // Parse initial height to feet and inches (only for ft_in unit) or use value directly for other units
  const parseHeight = (heightStr: string, heightUnit: string) => {
    if (!heightStr) return { feet: '', inches: '' };
    
    // If unit is Feet & Inches, parse the feet/inches format
    if (heightUnit === 'ft_in') {
      const match = heightStr.match(/(\d+)'(\d+)"/);
      if (match) {
        return {
          feet: match[1],
          inches: match[2],
        };
      }
      // If it's a number and unit is ft_in, assume it's cm from backend and convert
      const numValue = parseFloat(heightStr);
      if (!isNaN(numValue) && numValue > 0) {
        const totalInches = numValue / 2.54; // Backend stores in cm, convert to inches
        const feet = Math.floor(totalInches / 12);
        const inches = Math.round(totalInches % 12);
        return {
          feet: String(feet),
          inches: String(inches),
        };
      }
    } else {
      // For cm or m units, use the value directly in feet field (which acts as the main input)
      const numValue = parseFloat(heightStr);
      if (!isNaN(numValue) && numValue > 0) {
        return {
          feet: String(numValue), // Use the actual value (cm or m)
          inches: '', // No inches for cm/m units
        };
      }
    }
    return { feet: '', inches: '' };
  };

  const initialHeight = parseHeight(initial.height, initial.heightUnit);

  const [waist, setWaist] = useState<string>(initial.waist || '');
  const [waistUnit, setWaistUnit] = useState<string>(initial.waistUnit === 'in' ? 'In' : 'Cm');
  const [weight, setWeight] = useState<string>(initial.weight || '');
  const [weightUnit, setWeightUnit] = useState<string>(initial.weightUnit === 'kg' ? 'Kg' : 'Lbs');
  const [heightFeet, setHeightFeet] = useState<string>(initialHeight.feet || '');
  const [heightInches, setHeightInches] = useState<string>(initialHeight.inches || '');
  const [heightUnit, setHeightUnit] = useState<string>(
    initial.heightUnit === 'ft_in' ? 'Ft & In' : 
    initial.heightUnit === 'cm' ? 'Cm' : 
    initial.heightUnit === 'm' ? 'M' : 
    'Ft & In'
  );
  
  // Combine feet and inches into height string format for calculations
  const height = useMemo(() => {
    if (heightUnit === 'Ft & In') {
      return `${heightFeet}'${heightInches}"`;
    }
    // For other units, use feet field as the main value
    return heightFeet || "6'0\"";
  }, [heightFeet, heightInches, heightUnit]);

  useEffect(() => {
    // Refresh profile from server if we don't have one
    if (!auth.user?.profile) {
      fetchProfile();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Helper function to convert weight to kg
  const convertWeightToKg = (value: string, unit: string): number | null => {
    if (!value || value.trim() === '') return null;
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue <= 0) return null;
    
    if (unit === 'Lbs') {
      return numValue * 0.453592; // lbs to kg
    }
    return numValue; // already in kg
  };

  // Helper function to convert height to cm
  const convertHeightToCm = (feet: string, inches: string, unit: string): number | null => {
    if (unit === 'Ft & In') {
      const feetNum = parseFloat(feet || '0');
      const inchesNum = parseFloat(inches || '0');
      if (isNaN(feetNum) || feetNum < 0 || isNaN(inchesNum) || inchesNum < 0) return null;
      const totalInches = feetNum * 12 + inchesNum;
      return totalInches * 2.54; // inches to cm
    } else if (unit === 'Cm') {
      const cm = parseFloat(feet); // using feet field for cm value
      if (isNaN(cm) || cm <= 0) return null;
      return cm;
    } else if (unit === 'M') {
      const m = parseFloat(feet); // using feet field for m value
      if (isNaN(m) || m <= 0) return null;
      return m * 100; // meters to cm
    }
    return null;
  };

  // Helper function to convert waist to cm
  const convertWaistToCm = (value: string, unit: string): number | null => {
    if (!value || value.trim() === '') return null;
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue <= 0) return null;
    
    if (unit === 'In') {
      return numValue * 2.54; // inches to cm
    }
    return numValue; // already in cm
  };

  // Auto-save when measurements change
  useEffect(() => {
    const saveProfile = async () => {
      // Save to local storage first (for immediate UI update)
      const nextProfile = {
        ...auth.user?.profile,
        waist,
        waistUnit: waistUnit === 'In' ? 'in' : 'cm',
        weight,
        weightUnit: weightUnit === 'Kg' ? 'kg' : 'lbs',
        height,
        heightUnit: heightUnit === 'Ft & In' ? 'ft_in' : heightUnit === 'Cm' ? 'cm' : 'm',
      };
      await saveLocalProfile(nextProfile);

      // Convert and save to server
      const weightKg = convertWeightToKg(weight, weightUnit);
      const heightCm = convertHeightToCm(heightFeet, heightInches, heightUnit);
      const waistCm = convertWaistToCm(waist, waistUnit);

      // Build server payload (only include fields that have valid values)
      const serverPayload: any = {};
      
      if (weightKg !== null) {
        serverPayload.weight = weightKg;
        serverPayload.weightUnit = weightUnit === 'Kg' ? 'kg' : 'lbs';
      }
      
      if (heightCm !== null) {
        serverPayload.height = heightCm;
        serverPayload.heightUnit = heightUnit === 'Ft & In' ? 'ft_in' : heightUnit === 'Cm' ? 'cm' : 'm';
      }
      
      if (waistCm !== null) {
        serverPayload.waist = waistCm;
        serverPayload.waistUnit = waistUnit === 'In' ? 'in' : 'cm';
      }

      // Only send to server if we have at least one valid measurement
      if (Object.keys(serverPayload).length > 0) {
        await saveProfileToServer(serverPayload);
      }
    };
    
    // Debounce saves to avoid too many updates
    const timeoutId = setTimeout(saveProfile, 1000);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waist, weight, heightFeet, heightInches, waistUnit, weightUnit, heightUnit]);

  // Check if all required fields are filled
  const hasProfileInfo = useMemo(() => {
    const hasDob = editDob && editDob.trim() !== '';
    const hasGender = editGender && editGender.trim() !== '';
    return hasDob && hasGender;
  }, [editDob, editGender]);

  const allFieldsFilled = useMemo(() => {
    const hasWeight = weight && weight.trim() !== '' && !isNaN(parseFloat(weight)) && parseFloat(weight) > 0;
    const hasWaist = waist && waist.trim() !== '' && !isNaN(parseFloat(waist)) && parseFloat(waist) > 0;
    
    let hasHeight = false;
    if (heightUnit === 'Ft & In') {
      hasHeight = Boolean(
        heightFeet && heightFeet.trim() !== '' && !isNaN(parseFloat(heightFeet)) && parseFloat(heightFeet) > 0 &&
        heightInches && heightInches.trim() !== '' && !isNaN(parseFloat(heightInches))
      );
    } else {
      hasHeight = Boolean(heightFeet && heightFeet.trim() !== '' && !isNaN(parseFloat(heightFeet)) && parseFloat(heightFeet) > 0);
    }
    
    return hasWeight && hasWaist && hasHeight && hasProfileInfo;
  }, [weight, waist, heightFeet, heightInches, heightUnit, hasProfileInfo]);

  // Calculate all metrics
  const metrics = useMemo(() => {
    if (!allFieldsFilled) {
      return {
        bmi: '—',
        waistHeightRatio: '—',
        absi: '—',
        bmiScore: 0,
        waistHeightScore: 0,
        absiScore: 0,
        overallScore: 0,
      };
    }

    // Convert all values to standard units for calculations
    // 1. Weight: Convert to kg (BMI needs kg)
    const weightKg = convertWeightToKg(weight, weightUnit);
    if (weightKg === null) {
      return {
        bmi: '—',
        waistHeightRatio: '—',
        absi: '—',
        bmiScore: 0,
        waistHeightScore: 0,
        absiScore: 0,
        overallScore: 0,
      };
    }

    // 2. Height: Convert to meters (BMI needs meters) and inches (Waist-Height Ratio needs inches)
    const heightCm = convertHeightToCm(heightFeet, heightInches, heightUnit);
    if (heightCm === null) {
      return {
        bmi: '—',
        waistHeightRatio: '—',
        absi: '—',
        bmiScore: 0,
        waistHeightScore: 0,
        absiScore: 0,
        overallScore: 0,
      };
    }
    const heightM = heightCm / 100; // cm to meters
    const heightInchesValue = heightCm / 2.54; // cm to inches

    // 3. Waist: Convert to inches (Waist-Height Ratio needs inches) and meters (ABSI needs meters)
    const waistCm = convertWaistToCm(waist, waistUnit);
    if (waistCm === null) {
      return {
        bmi: '—',
        waistHeightRatio: '—',
        absi: '—',
        bmiScore: 0,
        waistHeightScore: 0,
        absiScore: 0,
        overallScore: 0,
      };
    }
    const waistInches = waistCm / 2.54; // cm to inches
    const waistM = waistCm / 100; // cm to meters

    // 4. Age: Calculate from DOB (use live edited DOB value)
    const age = calculateAge(editDob);

    // Now calculate metrics with converted values
    const bmi = calculateBMI(weightKg, heightM);
    const waistHeightRatio = calculateWaistHeightRatio(waistM, heightM);
    const absi = calculateABSI(waistM, weightKg, heightM);

    const bmiScore = getBMIScore(bmi, age, editGender);
    const waistHeightScore = getWaistHeightRatioScore(waistHeightRatio, editGender);
    const absiScore = getABSIScore(absi);
    const overallScore = calculateOverallBodyIndex(waistHeightScore, bmiScore.score, absiScore);

    return {
      bmi: bmi.toFixed(2),
      waistHeightRatio: waistHeightRatio.toFixed(2),
      absi: absi.toFixed(2),
      bmiScore: bmiScore.score,
      waistHeightScore,
      absiScore,
      overallScore,
    };
  }, [weight, waist, heightFeet, heightInches, weightUnit, waistUnit, heightUnit, editGender, editDob, allFieldsFilled]);


  const showInfo = (title: string, description: string) => {
    Alert.alert(title, description, [{ text: 'OK' }]);
  };

  return (
    <View style={[styles.container, isLightTheme && { backgroundColor: '#F8F9FA' }]}>
      <StatusBar 
        barStyle={isLightTheme ? 'dark-content' : 'light-content'} 
        backgroundColor={isLightTheme ? '#F8F9FA' : '#02041A'} 
      />
      {isLightTheme ? null : (
        <LinearGradient colors={['#1D244D', '#02041A', '#1A1D3E']} style={styles.gradientBackground} />
      )}

      {/* Header (match History style) */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}> 
        <Text style={[styles.headerTitle, isLightTheme && { color: '#111111' }]}>Profile</Text>
        <View style={styles.headerActions}>
            <TouchableOpacity style={[styles.connectNow, isLightTheme && { backgroundColor: 'rgba(0, 97, 164, 0.08)' }]} onPress={() => {
              setProvisionForHospitalId(null);
              setProvisionForHospitalName(null);
              router.push('/(bluetooth)/ScanScreen');
            }}>
              <Text style={[styles.connectText, isLightTheme && { color: '#0061A4' }]}>Connect Now</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => (require('expo-router').router.push('/(tabs)/settings'))}>
              <Ionicons name="settings-outline" size={24} color={isLightTheme ? '#0061A4' : '#fff'} style={{ marginLeft: 14 }} />
            </TouchableOpacity>
          </View>
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 100 }]} showsVerticalScrollIndicator={false}>

        {/* Identity compact card */}
        <BlurView 
          intensity={0} 
          tint={isLightTheme ? 'light' : 'dark'} 
          style={[
            styles.identityCard, 
            { flexDirection: 'column', alignItems: 'stretch', backgroundColor: 'transparent' }, 
            isLightTheme && { 
              borderColor: 'rgba(0, 0, 0, 0.1)' 
            }
          ]}
        >
            {/* Top row */}
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity 
                  activeOpacity={0.8} 
                  onPress={() => isEditingDetails ? null : setIsPhotoModalVisible(true)}
                  style={styles.avatarContainer}
                >
                  {profileImageUri ? (
                    <Image source={{ uri: profileImageUri }} style={styles.avatarImage} />
                  ) : (
                    <View style={[styles.avatarInitialsContainer, isLightTheme && { backgroundColor: 'rgba(0, 97, 164, 0.08)', borderColor: 'rgba(0, 97, 164, 0.15)' }]}>
                      <Text style={[styles.avatarInitialsText, isLightTheme && { color: '#0061A4' }]}>{initials}</Text>
                    </View>
                  )}
                </TouchableOpacity>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  {!isEditingDetails ? (
                    <>
                      <Text style={[styles.identityName, isLightTheme && { color: '#111111' }]}>{formattedName}</Text>
                      {auth.user?.email ? <Text style={[styles.identitySub, isLightTheme && { color: '#666666' }]}>{auth.user.email}</Text> : null}
                    </>
                  ) : (
                    <>
                      <TextInput 
                        style={[styles.inputField, { fontSize: 20, fontWeight: 'bold', marginBottom: 4, marginRight: 10 }, isLightTheme && { backgroundColor: '#F8F9FA', borderColor: 'rgba(0,0,0,0.06)', color: '#111111' }]} 
                        value={editName} 
                        onChangeText={setEditName} 
                        placeholder="Name"
                        placeholderTextColor={isLightTheme ? 'rgba(0,0,0,0.4)' : "rgba(255,255,255,0.4)"}
                      />
                      {auth.user?.email ? <Text style={[styles.identitySub, { opacity: 0.6 }, isLightTheme && { color: '#666666' }]}>{auth.user.email}</Text> : null}
                    </>
                  )}
                </View>
                {/* Edit Actions */}
                <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                  {!isEditingDetails ? (
                    <TouchableOpacity onPress={() => setIsEditingDetails(true)} style={{ padding: 4 }}>
                      <Ionicons name="pencil" size={20} color={isLightTheme ? '#0061A4' : "rgba(255,255,255,0.7)"} />
                    </TouchableOpacity>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <TouchableOpacity onPress={handleSaveProfileDetails} style={{ marginRight: 6 }}>
                        <Ionicons name="checkmark-circle" size={28} color="#4CAF50" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => { setIsEditingDetails(false); setEditName(formattedName); setEditMobile(initial.mobile || ''); setEditGender(initial.gender || ''); setEditDob(initial.dateOfBirth || ''); }}>
                        <Ionicons name="close-circle" size={28} color="#FF5252" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
            </View>

            {/* Personal Details Content */}
            <View style={{ marginTop: 20, borderTopWidth: 1, borderTopColor: isLightTheme ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.1)', paddingTop: 15 }}>
                  <Text style={{ color: isLightTheme ? '#888888' : 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 4 }}>Phone Number</Text>
                  {!isEditingDetails ? (
                    <Text style={{ color: isLightTheme ? '#111111' : '#fff', fontSize: 16, marginBottom: 15 }}>{editMobile || '—'}</Text>
                  ) : (
                    <TextInput 
                      style={[styles.inputField, { marginBottom: 15 }, isLightTheme && { backgroundColor: '#F8F9FA', borderColor: 'rgba(0,0,0,0.06)', color: '#111111' }]} 
                      value={editMobile} 
                      onChangeText={setEditMobile} 
                      placeholder="Phone Number"
                      placeholderTextColor={isLightTheme ? 'rgba(0,0,0,0.4)' : "rgba(255,255,255,0.4)"}
                      keyboardType="phone-pad"
                    />
                  )}

                  <View style={{ flexDirection: 'row', gap: 15 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: isLightTheme ? '#888888' : 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 4 }}>Date of Birth</Text>
                        {!isEditingDetails ? (
                          <Text style={{ color: isLightTheme ? '#111111' : '#fff', fontSize: 16 }}>{formatDisplayDate(editDob) || '—'}</Text>
                        ) : (
                          <TouchableOpacity onPress={() => setShowDatePicker(true)} style={[styles.inputField, isLightTheme && { backgroundColor: '#F8F9FA', borderColor: 'rgba(0,0,0,0.06)' }]}>
                            <Text style={{ color: editDob ? (isLightTheme ? '#111111' : '#fff') : (isLightTheme ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)') }}>
                              {formatDisplayDate(editDob) || 'DD-MM-YYYY'}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={{ color: isLightTheme ? '#888888' : 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 4 }}>Sex</Text>
                        {!isEditingDetails ? (
                          <Text style={{ color: isLightTheme ? '#111111' : '#fff', fontSize: 16, textTransform: 'capitalize' }}>{editGender || '—'}</Text>
                        ) : (
                          <TouchableOpacity onPress={() => setSexModalVisible(true)} style={[styles.inputField, isLightTheme && { backgroundColor: '#F8F9FA', borderColor: 'rgba(0,0,0,0.06)' }]}>
                            <Text style={{ color: editGender ? (isLightTheme ? '#111111' : '#fff') : (isLightTheme ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)'), textTransform: 'capitalize' }}>
                              {editGender || 'Select Sex'}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                  </View>
            </View>
        </BlurView>

        {/* Photo Management Modal */}
        <Modal
          visible={isPhotoModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setIsPhotoModalVisible(false)}
        >
          <TouchableOpacity 
            style={styles.modalOverlay} 
            activeOpacity={1} 
            onPress={() => setIsPhotoModalVisible(false)}
          >
            <View style={[styles.photoMenuContent, isLightTheme && { backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.06)' }]}>
              {/* Large Avatar Display */}
              <View style={[styles.largeAvatarContainer, isLightTheme && { backgroundColor: 'rgba(0, 97, 164, 0.08)', borderColor: 'rgba(0, 97, 164, 0.15)' }]}>
                {profileImageUri ? (
                  <Image source={{ uri: profileImageUri }} style={styles.largeAvatarImage} />
                ) : (
                  <View style={[styles.largeAvatarInitials, isLightTheme && { backgroundColor: 'rgba(0, 97, 164, 0.08)' }]}>
                    <Text style={[styles.largeAvatarText, isLightTheme && { color: '#0061A4' }]}>{initials}</Text>
                  </View>
                )}
              </View>

              <Text style={[styles.photoMenuTitle, isLightTheme && { color: '#111111' }]}>Profile Photo</Text>
              
              <TouchableOpacity style={[styles.photoOption, isLightTheme && { backgroundColor: '#F0F2F5' }]} onPress={pickImage}>
                <Ionicons name="image-outline" size={20} color={isLightTheme ? '#0061A4' : "#fff"} />
                <Text style={[styles.photoOptionText, isLightTheme && { color: '#666666' }]}>
                  {initial.profileImage ? 'Change Photo' : 'Add Profile Photo'}
                </Text>
              </TouchableOpacity>

              {initial.profileImage && (
                <TouchableOpacity style={[styles.photoOption, styles.photoOptionRemove]} onPress={removeImage}>
                  <Ionicons name="trash-outline" size={20} color="#FF5252" />
                  <Text style={[styles.photoOptionText, { color: '#FF5252' }]}>Remove Profile</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity 
                style={styles.photoOptionCancel} 
                onPress={() => setIsPhotoModalVisible(false)}
              >
                <Text style={[styles.photoOptionCancelText, isLightTheme && { color: '#888888' }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Body Measurement Section */}
        <BlurView 
          intensity={0} 
          tint={isLightTheme ? 'light' : 'dark'} 
          style={[
            styles.bodyMeasurementCard, 
            { backgroundColor: 'transparent' }, 
            isLightTheme && { borderColor: 'rgba(0, 0, 0, 0.1)' }
          ]}
        >
          <Text style={[styles.sectionTitle, isLightTheme && { color: '#111111' }]}>Body Measurement</Text>

          {/* Basic Measurements */}
          <View style={styles.basicMeasurementsSection}>
            <MeasurementRow
              label="Weight"
              value={weight}
              unit={weightUnit}
              unitOptions={['Kg', 'Lbs']}
              onChangeValue={setWeight}
              onChangeUnit={setWeightUnit}
              onInfoPress={() => showInfo(
                'How to Measure Weight',
                'Use a digital scale on a flat, hard surface.\n\n• Weigh yourself in the morning, before eating or drinking.\n• Stand still in the center of the scale.\n• Wear minimal clothing for an accurate reading.\n• Record the value shown on the display.'
              )}
              isLight={isLightTheme}
            />
            <View style={[styles.measurementDivider, isLightTheme && { backgroundColor: 'rgba(0, 0, 0, 0.06)' }]} />
            <HeightRow
              label="Height"
              feet={heightFeet}
              inches={heightInches}
              unit={heightUnit}
              unitOptions={['Ft & In', 'Cm', 'M']}
              onChangeFeet={setHeightFeet}
              onChangeInches={setHeightInches}
              onChangeUnit={setHeightUnit}
              onInfoPress={() => showInfo(
                'How to Measure Height',
                'Stand barefoot against a flat wall.\n\n• Stand straight with heels, back, and head touching the wall.\n• Keep your chin parallel to the floor.\n• Place a flat object (like a book) on top of your head, touching the wall.\n• Mark that point on the wall and measure from the floor to the mark.\n\nFor Feet & Inches: enter whole feet in the first box and remaining inches in the second (e.g. 5 ft 8 in).'
              )}
              isLight={isLightTheme}
            />
            <View style={[styles.measurementDivider, isLightTheme && { backgroundColor: 'rgba(0, 0, 0, 0.06)' }]} />
            <MeasurementRow
              label="Waist"
              value={waist}
              unit={waistUnit}
              unitOptions={['In', 'Cm']}
              onChangeValue={setWaist}
              onChangeUnit={setWaistUnit}
              onInfoPress={() => showInfo(
                'How to Measure Waist',
                'Use a soft measuring tape around your bare waist.\n\n• Find the narrowest part of your torso, usually just above the belly button.\n• Wrap the tape snugly but not tight — it should not dig into your skin.\n• Breathe out naturally and take the measurement.\n• Keep the tape parallel to the floor all the way around.'
              )}
              isLight={isLightTheme}
            />
          </View>

          {/* Calculated Indices - 2x2 Grid */}
          <View style={{ position: 'relative' }}>
            <View style={styles.calculatedIndicesGrid}>
              <CalculatedIndexRow
                label="Waist Height ratio"
                value={metrics.waistHeightRatio}
                score={metrics.waistHeightScore}
                onInfoPress={() => showInfo('Waist-to-height ratio', HINTS.WHR)}
                isLight={isLightTheme}
              />
              <CalculatedIndexRow
                label="BMI"
                value={metrics.bmi}
                score={metrics.bmiScore}
                onInfoPress={() => showInfo('BMI', HINTS.BMI)}
                isLight={isLightTheme}
              />
              <CalculatedIndexRow
                label="ABSI"
                value={metrics.absi}
                score={metrics.absiScore}
                onInfoPress={() => showInfo('ABSI', HINTS.ABSI)}
                isLight={isLightTheme}
              />
              <CalculatedIndexRow
                label="Overall Body Index"
                value={allFieldsFilled ? metrics.overallScore.toFixed(1) : '—'}
                score={metrics.overallScore}
                onInfoPress={() => showInfo('Overall Body Index', HINTS.OBI)}
                isLight={isLightTheme}
              />
            </View>

            {/* Blur overlay when DOB or Sex is missing */}
            {!hasProfileInfo && (
              <View style={styles.gaugeOverlay}>
                <BlurView intensity={80} tint={isLightTheme ? 'light' : 'dark'} style={[styles.gaugeBlur, isLightTheme && { backgroundColor: 'rgba(255, 255, 255, 0.85)' }]}>
                  <Ionicons name="person-circle-outline" size={36} color={isLightTheme ? '#0061A4' : 'rgba(199, 185, 255, 0.8)'} />
                  <Text style={[styles.gaugeOverlayTitle, isLightTheme && { color: '#111111' }]}>Complete Your Profile</Text>
                  <Text style={[styles.gaugeOverlayMessage, isLightTheme && { color: '#666666' }]}>
                    {!editDob && !editGender
                      ? 'Please add your Date of Birth and Sex to see your body metrics.'
                      : !editDob
                      ? 'Please add your Date of Birth to see your body metrics.'
                      : 'Please select your Sex to see your body metrics.'}
                  </Text>
                </BlurView>
              </View>
            )}
          </View>
        </BlurView>

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Floating Modal: Sex selector */}
      <Modal
        visible={sexModalVisible}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => setSexModalVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setSexModalVisible(false)} />
        <View style={styles.modalCenter}>
          <View style={[styles.modalCard, isLightTheme && { backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.06)' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, isLightTheme && { color: '#111111' }]}>Select Sex</Text>
              <TouchableOpacity onPress={() => setSexModalVisible(false)}>
                <Ionicons name="close" size={22} color={isLightTheme ? '#0061A4' : "#fff"} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.modalItem, isLightTheme && { borderBottomColor: 'rgba(0,0,0,0.06)' }]}
              onPress={() => { setEditGender(''); setSexModalVisible(false); }}
            >
              <Text style={[styles.modalItemText, isLightTheme && { color: '#111111' }]}>Select</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalItem, isLightTheme && { borderBottomColor: 'rgba(0,0,0,0.06)' }]}
              onPress={() => { setEditGender('female'); setSexModalVisible(false); }}
            >
              <Text style={[styles.modalItemText, isLightTheme && { color: '#111111' }]}>Female</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalItem, isLightTheme && { borderBottomColor: 'rgba(0,0,0,0.06)' }]}
              onPress={() => { setEditGender('male'); setSexModalVisible(false); }}
            >
              <Text style={[styles.modalItemText, isLightTheme && { color: '#111111' }]}>Male</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalItem, isLightTheme && { borderBottomColor: 'rgba(0,0,0,0.06)' }]}
              onPress={() => { setEditGender('other'); setSexModalVisible(false); }}
            >
              <Text style={[styles.modalItemText, isLightTheme && { color: '#111111' }]}>Other / Undisclosed</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* DatePicker Modals/Views */}
      {showDatePicker && (
        Platform.OS === 'ios' ? (
          <Modal transparent visible={showDatePicker} animationType="slide">
            <Pressable style={styles.modalBackdrop} onPress={() => setShowDatePicker(false)} />
            <View style={{ position: 'absolute', bottom: 0, width: '100%', backgroundColor: '#fff', paddingBottom: 30, paddingTop: 10, borderTopRightRadius: 20, borderTopLeftRadius: 20 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, marginBottom: 10 }}>
                <TouchableOpacity onPress={() => {
                  const d = dateObject.getDate().toString().padStart(2, '0');
                  const m = (dateObject.getMonth() + 1).toString().padStart(2, '0');
                  const y = dateObject.getFullYear();
                  setEditDob(`${y}-${m}-${d}`);
                  setShowDatePicker(false);
                }}>
                  <Text style={{ color: '#007AFF', fontWeight: 'bold', fontSize: 18 }}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={dateObject}
                mode="date"
                display="spinner"
                maximumDate={new Date()}
                onChange={(e, d) => d && setDateObject(d)}
                textColor="#000"
              />
            </View>
          </Modal>
        ) : (
          <DateTimePicker
            value={dateObject}
            mode="date"
            display="default"
            maximumDate={new Date()}
            onChange={(event, selectedDate) => {
              setShowDatePicker(false);
              if (event.type === 'set' && selectedDate) {
                setDateObject(selectedDate);
                const d = selectedDate.getDate().toString().padStart(2, '0');
                const m = (selectedDate.getMonth() + 1).toString().padStart(2, '0');
                const y = selectedDate.getFullYear();
                setEditDob(`${y}-${m}-${d}`);
              }
            }}
          />
        )
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#02041A' },
  gradientBackground: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  scroll: { paddingHorizontal: 16, paddingTop: 12 },
  header: { paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: '#FFF', fontSize: 22, fontWeight: '800' },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  connectNow: { backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14 },
  connectText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  identityCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 12 },
  identityName: { color: '#fff', fontSize: 16, fontWeight: '800' },
  identitySub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },

  avatarContainer: {
    position: 'relative',
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarInitialsContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(199, 185, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(199, 185, 255, 0.3)',
  },
  avatarInitialsText: {
    color: '#C7B9FF',
    fontSize: 18,
    fontWeight: '800',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  photoMenuContent: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#1A1D3E',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  largeAvatarContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(199, 185, 255, 0.3)',
  },
  largeAvatarImage: {
    width: '100%',
    height: '100%',
  },
  largeAvatarInitials: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(199, 185, 255, 0.15)',
  },
  largeAvatarText: {
    color: '#C7B9FF',
    fontSize: 42,
    fontWeight: '800',
  },
  photoMenuTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 24,
    textAlign: 'center',
  },
  photoOption: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginBottom: 12,
  },
  photoOptionRemove: {
    backgroundColor: 'rgba(255,82,82,0.1)',
  },
  photoOptionText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 12,
  },
  photoOptionCancel: {
    paddingVertical: 12,
    marginTop: 10,
  },
  photoOptionCancelText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },

  bodyMeasurementCard: { borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 12 },
  sectionTitle: { color: '#FFF', fontSize: 20, fontWeight: '800', marginBottom: 20 },

  // Basic Measurements
  basicMeasurementsSection: { marginBottom: 24 },
  measurementRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  measurementLabelRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  measurementLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },
  measurementInputContainer: { flexDirection: 'row', alignItems: 'center', flex: 2, gap: 8, justifyContent: 'flex-start' },
  measurementInput: { 
    flex: 1, 
    backgroundColor: 'transparent', 
    borderRadius: 0, 
    paddingHorizontal: 0, 
    paddingVertical: 0,
    color: '#fff', 
    fontSize: 14, 
    fontWeight: '700',
    borderWidth: 0,
    minHeight: 20,
    height: 20,
    textAlign: 'left',
  },
  heightInputsContainer: { flexDirection: 'row', alignItems: 'center', gap: 0, flex: 1, justifyContent: 'flex-start' },
  heightInput: { 
    width: 45,
    backgroundColor: 'transparent', 
    borderRadius: 0, 
    paddingHorizontal: 0, 
    paddingVertical: 0,
    color: '#fff', 
    fontSize: 14, 
    fontWeight: '700',
    borderWidth: 0,
    minHeight: 20,
    height: 20,
    textAlign: 'left',
    marginRight: -8,
  },
  unitDropdownContainer: { position: 'relative', minWidth: 100, alignItems: 'flex-end' },
  unitDropdownButton: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'flex-end',
    backgroundColor: 'transparent', 
    borderRadius: 0, 
    paddingHorizontal: 0, 
    paddingVertical: 0,
    borderWidth: 0,
    gap: 6,
    minHeight: 20,
    height: 20,
  },
  unitDropdownText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600' },
  unitDropdownMenu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 4,
    backgroundColor: 'rgba(0,0,0,0.9)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    minWidth: 140,
    zIndex: 1000,
    elevation: 10,
  },
  unitDropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  unitDropdownItemLast: {
    borderBottomWidth: 0,
  },
  unitDropdownItemText: { color: '#fff', fontSize: 14 },
  measurementDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 4 },

  // Calculated Indices - 2x2 Grid
  calculatedIndicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    justifyContent: 'space-between',
  },
  calculatedIndexCard: {
    width: '48%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 12,
  },
  calculatedIndexHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  calculatedIndexLabelContainer: {
    flex: 1,
  },
  calculatedIndexLabel: { 
    color: 'rgba(255,255,255,0.7)', 
    fontSize: 12, 
    fontWeight: '600',
  },
  calculatedIndexSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    marginTop: 2,
  },
  calculatedIndexContent: {
    alignItems: 'center',
    gap: 8,
  },
  calculatedIndexGaugeContainer: {
    alignItems: 'center',
    gap: 6,
  },
  calculatedIndexScore: { 
    color: '#fff', 
    fontSize: 16, 
    fontWeight: '700',
  },
  calculatedIndexValue: { 
    color: '#fff', 
    fontSize: 18, 
    fontWeight: '700',
    marginTop: 4,
  },
  infoIcon: { 
    padding: 4,
  },
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
  inputField: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 16
  },

  // Gauge blur overlay (when DOB/Sex missing)
  gaugeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 12,
    overflow: 'hidden',
    zIndex: 10,
  },
  gaugeBlur: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 10,
    backgroundColor: 'rgba(2, 4, 26, 0.55)',
  },
  gaugeOverlayTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  gaugeOverlayMessage: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  gaugeOverlayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(199, 185, 255, 0.25)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(199, 185, 255, 0.4)',
    marginTop: 4,
  },
  gaugeOverlayButtonText: {
    color: '#C7B9FF',
    fontSize: 14,
    fontWeight: '700',
  },
});
