import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Switch, StatusBar, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { requestNotifications } from 'react-native-permissions';
import { sendTestNotification } from '@/services/Notifications';
import { 
  getHeartRateNotificationSettings, 
  saveHeartRateNotificationSettings,
  HeartRateNotificationSettings 
} from '@/services/heartRateNotifications';
import {
  getRespirationNotificationSettings,
  saveRespirationNotificationSettings,
  RespirationNotificationSettings
} from '@/services/respirationNotifications';
import {
  getStressNotificationSettings,
  saveStressNotificationSettings,
  StressNotificationSettings
} from '@/services/stressNotifications';
import {
  getTemperatureNotificationSettings,
  saveTemperatureNotificationSettings,
  TemperatureNotificationSettings
} from '@/services/temperatureNotifications';
import {
  getHumidityNotificationSettings,
  saveHumidityNotificationSettings,
  HumidityNotificationSettings
} from '@/services/humidityNotifications';

type RowProps = {
  title: string;
  subtitle?: string;
  showToggle?: boolean;
  toggleValue?: boolean;
  onToggle?: (next: boolean) => void;
  toggleDisabled?: boolean;
  onPress?: () => void;
  isLoading?: boolean;
  rightComponent?: React.ReactNode;
};

function SectionHeader({ label }: { label: string }) {
  return (
    <Text style={styles.sectionHeader}>{label}</Text>
  );
}

function Row({ title, subtitle, showToggle, toggleValue, onToggle, toggleDisabled, onPress, isLoading, rightComponent }: RowProps) {
  return (
    <TouchableOpacity activeOpacity={onPress ? 0.8 : 1} onPress={onPress} style={styles.row} disabled={isLoading || !onPress}>
      <View style={styles.rowTextContainer}>
        <Text style={styles.rowTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
      {showToggle ? (
        <Switch
          value={!!toggleValue}
          onValueChange={onToggle}
          disabled={!!toggleDisabled}
          trackColor={{ false: '#3A3F65', true: '#4A90E2' }}
          thumbColor={'#FFFFFF'}
        />
      ) : isLoading ? (
        <ActivityIndicator size="small" color="#4A90E2" />
      ) : rightComponent ? (
        rightComponent
      ) : (
        <Text style={styles.chevron}>›</Text>
      )}
    </TouchableOpacity>
  );
}

export default function NotificationSettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [settings, setSettings] = useState<HeartRateNotificationSettings>({
    enabled: false,
    highThreshold: 120,
    lowThreshold: 60,
    cooldownMinutes: 10,
  });
  const [respirationSettings, setRespirationSettings] = useState<RespirationNotificationSettings>({
    enabled: false,
    highThreshold: 20,
    lowThreshold: 3,
    cooldownMinutes: 10,
  });
  const [stressSettings, setStressSettings] = useState<StressNotificationSettings>({
    enabled: false,
    highThreshold: 80,
    lowThreshold: 20,
    cooldownMinutes: 10,
  });
  const [temperatureSettings, setTemperatureSettings] = useState<TemperatureNotificationSettings>({
    enabled: false,
    highThreshold: 30,
    lowThreshold: 15,
    cooldownMinutes: 10,
  });
  const [humiditySettings, setHumiditySettings] = useState<HumidityNotificationSettings>({
    enabled: false,
    highThreshold: 70,
    lowThreshold: 30,
    cooldownMinutes: 10,
  });
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [isEditingHigh, setIsEditingHigh] = useState(false);
  const [isEditingLow, setIsEditingLow] = useState(false);
  const [highInput, setHighInput] = useState('120');
  const [lowInput, setLowInput] = useState('60');
  const [isEditingRespirationHigh, setIsEditingRespirationHigh] = useState(false);
  const [isEditingRespirationLow, setIsEditingRespirationLow] = useState(false);
  const [respirationHighInput, setRespirationHighInput] = useState('20');
  const [respirationLowInput, setRespirationLowInput] = useState('3');
  const [isEditingStressHigh, setIsEditingStressHigh] = useState(false);
  const [isEditingStressLow, setIsEditingStressLow] = useState(false);
  const [stressHighInput, setStressHighInput] = useState('80');
  const [stressLowInput, setStressLowInput] = useState('20');
  const [isEditingTemperatureHigh, setIsEditingTemperatureHigh] = useState(false);
  const [isEditingTemperatureLow, setIsEditingTemperatureLow] = useState(false);
  const [temperatureHighInput, setTemperatureHighInput] = useState('30');
  const [temperatureLowInput, setTemperatureLowInput] = useState('15');
  const [isEditingHumidityHigh, setIsEditingHumidityHigh] = useState(false);
  const [isEditingHumidityLow, setIsEditingHumidityLow] = useState(false);
  const [humidityHighInput, setHumidityHighInput] = useState('70');
  const [humidityLowInput, setHumidityLowInput] = useState('30');

  useEffect(() => {
    loadSettings();
  }, []);


  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const savedSettings = await getHeartRateNotificationSettings();
      setSettings(savedSettings);
      setHighInput(savedSettings.highThreshold.toString());
      setLowInput(savedSettings.lowThreshold.toString());
      
      const savedRespirationSettings = await getRespirationNotificationSettings();
      setRespirationSettings(savedRespirationSettings);
      setRespirationHighInput(savedRespirationSettings.highThreshold.toString());
      setRespirationLowInput(savedRespirationSettings.lowThreshold.toString());
      
      const savedStressSettings = await getStressNotificationSettings();
      setStressSettings(savedStressSettings);
      setStressHighInput(savedStressSettings.highThreshold.toString());
      setStressLowInput(savedStressSettings.lowThreshold.toString());
      
      const savedTemperatureSettings = await getTemperatureNotificationSettings();
      setTemperatureSettings(savedTemperatureSettings);
      setTemperatureHighInput(savedTemperatureSettings.highThreshold.toString());
      setTemperatureLowInput(savedTemperatureSettings.lowThreshold.toString());
      
      const savedHumiditySettings = await getHumidityNotificationSettings();
      setHumiditySettings(savedHumiditySettings);
      setHumidityHighInput(savedHumiditySettings.highThreshold.toString());
      setHumidityLowInput(savedHumiditySettings.lowThreshold.toString());
      
      // Check notification permissions
      const saved = await AsyncStorage.getItem('notifications_enabled');
      const isEnabled = saved === 'true';
      setNotificationsEnabled(isEnabled);
      
      // If main notifications are disabled, disable all metric notifications too
      if (!isEnabled) {
        if (savedSettings.enabled) {
          const newSettings = { ...savedSettings, enabled: false };
          setSettings(newSettings);
          await saveHeartRateNotificationSettings(newSettings);
        }
        if (savedRespirationSettings.enabled) {
          const newRespirationSettings = { ...savedRespirationSettings, enabled: false };
          setRespirationSettings(newRespirationSettings);
          await saveRespirationNotificationSettings(newRespirationSettings);
        }
        if (savedStressSettings.enabled) {
          const newStressSettings = { ...savedStressSettings, enabled: false };
          setStressSettings(newStressSettings);
          await saveStressNotificationSettings(newStressSettings);
        }
        if (savedTemperatureSettings.enabled) {
          const newTemperatureSettings = { ...savedTemperatureSettings, enabled: false };
          setTemperatureSettings(newTemperatureSettings);
          await saveTemperatureNotificationSettings(newTemperatureSettings);
        }
        if (savedHumiditySettings.enabled) {
          const newHumiditySettings = { ...savedHumiditySettings, enabled: false };
          setHumiditySettings(newHumiditySettings);
          await saveHumidityNotificationSettings(newHumiditySettings);
        }
      }
    } catch (error) {
      console.error('Error loading notification settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleAppNotifications = async (next: boolean) => {
    if (next) {
      try {
        const { status } = await requestNotifications(['alert', 'badge', 'sound']);
        const granted = status === 'granted' || status === 'limited';
        if (!granted) {
          Alert.alert('Permission required', 'Enable notifications in Settings to receive updates.');
          setNotificationsEnabled(false);
          await AsyncStorage.setItem('notifications_enabled', 'false');
          return;
        }
        setNotificationsEnabled(true);
        await AsyncStorage.setItem('notifications_enabled', 'true');
        // Fire a test local notification to verify configuration
        await sendTestNotification('Hello, how was your sleep?');
      } catch (e) {
        Alert.alert('Error', 'Could not request notification permission.');
        setNotificationsEnabled(false);
        await AsyncStorage.setItem('notifications_enabled', 'false');
      }
    } else {
      setNotificationsEnabled(false);
      await AsyncStorage.setItem('notifications_enabled', 'false');
      
      // Also disable all metric notifications when app notifications are disabled
      if (settings.enabled) {
        const newSettings = { ...settings, enabled: false };
        setSettings(newSettings);
        await saveHeartRateNotificationSettings(newSettings);
      }
      if (respirationSettings.enabled) {
        const newRespirationSettings = { ...respirationSettings, enabled: false };
        setRespirationSettings(newRespirationSettings);
        await saveRespirationNotificationSettings(newRespirationSettings);
      }
      if (stressSettings.enabled) {
        const newStressSettings = { ...stressSettings, enabled: false };
        setStressSettings(newStressSettings);
        await saveStressNotificationSettings(newStressSettings);
      }
      if (temperatureSettings.enabled) {
        const newTemperatureSettings = { ...temperatureSettings, enabled: false };
        setTemperatureSettings(newTemperatureSettings);
        await saveTemperatureNotificationSettings(newTemperatureSettings);
      }
      if (humiditySettings.enabled) {
        const newHumiditySettings = { ...humiditySettings, enabled: false };
        setHumiditySettings(newHumiditySettings);
        await saveHumidityNotificationSettings(newHumiditySettings);
      }
    }
  };

  const handleToggleHeartRateNotifications = async (next: boolean) => {
    const newSettings = { ...settings, enabled: next };
    setSettings(newSettings);
    await saveHeartRateNotificationSettings(newSettings);
  };

  const handleToggleRespirationNotifications = async (next: boolean) => {
    const newSettings = { ...respirationSettings, enabled: next };
    setRespirationSettings(newSettings);
    await saveRespirationNotificationSettings(newSettings);
  };

  const handleToggleStressNotifications = async (next: boolean) => {
    const newSettings = { ...stressSettings, enabled: next };
    setStressSettings(newSettings);
    await saveStressNotificationSettings(newSettings);
  };

  const handleToggleTemperatureNotifications = async (next: boolean) => {
    const newSettings = { ...temperatureSettings, enabled: next };
    setTemperatureSettings(newSettings);
    await saveTemperatureNotificationSettings(newSettings);
  };

  const handleToggleHumidityNotifications = async (next: boolean) => {
    const newSettings = { ...humiditySettings, enabled: next };
    setHumiditySettings(newSettings);
    await saveHumidityNotificationSettings(newSettings);
  };

  const handleSaveRespirationThreshold = async (type: 'high' | 'low', value: number) => {
    if (value < 1 || value > 50) {
      Alert.alert('Invalid Value', 'Respiration rate must be between 1 and 50 RPM.');
      return;
    }

    if (type === 'high' && value <= respirationSettings.lowThreshold) {
      Alert.alert('Invalid Value', `High threshold must be greater than low threshold (${respirationSettings.lowThreshold} RPM).`);
      return;
    }

    if (type === 'low' && value >= respirationSettings.highThreshold) {
      Alert.alert('Invalid Value', `Low threshold must be less than high threshold (${respirationSettings.highThreshold} RPM).`);
      return;
    }

    const newSettings = {
      ...respirationSettings,
      [type === 'high' ? 'highThreshold' : 'lowThreshold']: value,
    };
    setRespirationSettings(newSettings);
    await saveRespirationNotificationSettings(newSettings);
    
    if (type === 'high') {
      setIsEditingRespirationHigh(false);
    } else {
      setIsEditingRespirationLow(false);
    }
  };

  const handleSaveThreshold = async (type: 'high' | 'low', value: number) => {
    if (value < 30 || value > 250) {
      Alert.alert('Invalid Value', 'Heart rate must be between 30 and 250 BPM.');
      return;
    }

    if (type === 'high' && value <= settings.lowThreshold) {
      Alert.alert('Invalid Value', `High threshold must be greater than low threshold (${settings.lowThreshold} BPM).`);
      return;
    }

    if (type === 'low' && value >= settings.highThreshold) {
      Alert.alert('Invalid Value', `Low threshold must be less than high threshold (${settings.highThreshold} BPM).`);
      return;
    }

    const newSettings = {
      ...settings,
      [type === 'high' ? 'highThreshold' : 'lowThreshold']: value,
    };
    setSettings(newSettings);
    await saveHeartRateNotificationSettings(newSettings);
    
    if (type === 'high') {
      setIsEditingHigh(false);
    } else {
      setIsEditingLow(false);
    }
  };

  const handleSaveStressThreshold = async (type: 'high' | 'low', value: number) => {
    if (value < 0 || value > 100) {
      Alert.alert('Invalid Value', 'Stress level must be between 0 and 100.');
      return;
    }

    if (type === 'high' && value <= stressSettings.lowThreshold) {
      Alert.alert('Invalid Value', `High threshold must be greater than low threshold (${stressSettings.lowThreshold}).`);
      return;
    }

    if (type === 'low' && value >= stressSettings.highThreshold) {
      Alert.alert('Invalid Value', `Low threshold must be less than high threshold (${stressSettings.highThreshold}).`);
      return;
    }

    const newSettings = {
      ...stressSettings,
      [type === 'high' ? 'highThreshold' : 'lowThreshold']: value,
    };
    setStressSettings(newSettings);
    await saveStressNotificationSettings(newSettings);
    
    if (type === 'high') {
      setIsEditingStressHigh(false);
    } else {
      setIsEditingStressLow(false);
    }
  };

  const handleSaveTemperatureThreshold = async (type: 'high' | 'low', value: number) => {
    if (value < -10 || value > 50) {
      Alert.alert('Invalid Value', 'Temperature must be between -10 and 50°C.');
      return;
    }

    if (type === 'high' && value <= temperatureSettings.lowThreshold) {
      Alert.alert('Invalid Value', `High threshold must be greater than low threshold (${temperatureSettings.lowThreshold}°C).`);
      return;
    }

    if (type === 'low' && value >= temperatureSettings.highThreshold) {
      Alert.alert('Invalid Value', `Low threshold must be less than high threshold (${temperatureSettings.highThreshold}°C).`);
      return;
    }

    const newSettings = {
      ...temperatureSettings,
      [type === 'high' ? 'highThreshold' : 'lowThreshold']: value,
    };
    setTemperatureSettings(newSettings);
    await saveTemperatureNotificationSettings(newSettings);
    
    if (type === 'high') {
      setIsEditingTemperatureHigh(false);
    } else {
      setIsEditingTemperatureLow(false);
    }
  };

  const handleSaveHumidityThreshold = async (type: 'high' | 'low', value: number) => {
    if (value < 0 || value > 100) {
      Alert.alert('Invalid Value', 'Humidity must be between 0 and 100%.');
      return;
    }

    if (type === 'high' && value <= humiditySettings.lowThreshold) {
      Alert.alert('Invalid Value', `High threshold must be greater than low threshold (${humiditySettings.lowThreshold}%).`);
      return;
    }

    if (type === 'low' && value >= humiditySettings.highThreshold) {
      Alert.alert('Invalid Value', `Low threshold must be less than high threshold (${humiditySettings.highThreshold}%).`);
      return;
    }

    const newSettings = {
      ...humiditySettings,
      [type === 'high' ? 'highThreshold' : 'lowThreshold']: value,
    };
    setHumiditySettings(newSettings);
    await saveHumidityNotificationSettings(newSettings);
    
    if (type === 'high') {
      setIsEditingHumidityHigh(false);
    } else {
      setIsEditingHumidityLow(false);
    }
  };


  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#02041A" />
      <LinearGradient colors={['#1D244D', '#02041A', '#1A1D3E']} style={styles.gradientBackground} />

      {/* Header (match Settings style) */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView 
        contentContainerStyle={[styles.content, { paddingBottom: 80 }]} 
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4A90E2" />
          </View>
        ) : (
          <>
            {/* App Notifications */}
            <SectionHeader label="App Notifications" />
            <View style={styles.card}>
              <Row
                title="Enable App Notifications"
                subtitle="Enable app alerts and updates"
                showToggle
                toggleValue={notificationsEnabled}
                onToggle={handleToggleAppNotifications}
              />
            </View>

            {/* Heart Rate Notifications - Only show when app notifications are enabled */}
            {notificationsEnabled && (
              <>
                <SectionHeader label="Heart Rate Trends" />
                <View style={styles.card}>
                  <Row
                    title="Enable Heart Rate Notifications"
                    subtitle="Get notified when your heart rate trend goes above or below your set thresholds"
                    showToggle
                    toggleValue={settings.enabled}
                    onToggle={handleToggleHeartRateNotifications}
                  />
                  {settings.enabled && (
                    <>
                      <View style={styles.divider} />
                      {/* High Threshold */}
                      <View style={styles.row}>
                        <View style={styles.rowTextContainer}>
                          <Text style={styles.rowTitle}>High Threshold</Text>
                          <Text style={styles.rowSubtitle}>
                            Notify when heart rate exceeds this value (BPM)
                          </Text>
                        </View>
                        {isEditingHigh ? (
                          <View style={styles.inputContainer}>
                            <TextInput
                              style={styles.input}
                              value={highInput}
                              onChangeText={setHighInput}
                              keyboardType="numeric"
                              autoFocus
                              selectTextOnFocus
                              onSubmitEditing={() => {
                                const value = parseInt(highInput, 10);
                                if (!isNaN(value)) {
                                  handleSaveThreshold('high', value);
                                } else {
                                  setIsEditingHigh(false);
                                  setHighInput(settings.highThreshold.toString());
                                }
                              }}
                              onBlur={() => {
                                const value = parseInt(highInput, 10);
                                if (!isNaN(value)) {
                                  handleSaveThreshold('high', value);
                                } else {
                                  setIsEditingHigh(false);
                                  setHighInput(settings.highThreshold.toString());
                                }
                              }}
                            />
                            <Text style={styles.inputUnit}>BPM</Text>
                          </View>
                        ) : (
                          <TouchableOpacity
                            onPress={() => setIsEditingHigh(true)}
                            style={styles.valueButton}
                          >
                            <Text style={styles.valueText}>{settings.highThreshold}</Text>
                            <Text style={styles.valueUnit}> BPM</Text>
                            <Ionicons name="pencil" size={16} color="rgba(255,255,255,0.5)" style={{ marginLeft: 4 }} />
                          </TouchableOpacity>
                        )}
                      </View>
                      <View style={styles.divider} />
                      
                      {/* Low Threshold */}
                      <View style={styles.row}>
                        <View style={styles.rowTextContainer}>
                          <Text style={styles.rowTitle}>Low Threshold</Text>
                          <Text style={styles.rowSubtitle}>
                            Notify when heart rate falls below this value (BPM)
                          </Text>
                        </View>
                        {isEditingLow ? (
                          <View style={styles.inputContainer}>
                            <TextInput
                              style={styles.input}
                              value={lowInput}
                              onChangeText={setLowInput}
                              keyboardType="numeric"
                              autoFocus
                              selectTextOnFocus
                              onSubmitEditing={() => {
                                const value = parseInt(lowInput, 10);
                                if (!isNaN(value)) {
                                  handleSaveThreshold('low', value);
                                } else {
                                  setIsEditingLow(false);
                                  setLowInput(settings.lowThreshold.toString());
                                }
                              }}
                              onBlur={() => {
                                const value = parseInt(lowInput, 10);
                                if (!isNaN(value)) {
                                  handleSaveThreshold('low', value);
                                } else {
                                  setIsEditingLow(false);
                                  setLowInput(settings.lowThreshold.toString());
                                }
                              }}
                            />
                            <Text style={styles.inputUnit}>BPM</Text>
                          </View>
                        ) : (
                          <TouchableOpacity
                            onPress={() => setIsEditingLow(true)}
                            style={styles.valueButton}
                          >
                            <Text style={styles.valueText}>{settings.lowThreshold}</Text>
                            <Text style={styles.valueUnit}> BPM</Text>
                            <Ionicons name="pencil" size={16} color="rgba(255,255,255,0.5)" style={{ marginLeft: 4 }} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </>
                  )}
                </View>

                <SectionHeader label="Breathing Trends" />
                <View style={styles.card}>
                  <Row
                    title="Enable Respiration Notifications"
                    subtitle="Get notified when your breathing rate trend goes above or below your set thresholds"
                    showToggle
                    toggleValue={respirationSettings.enabled}
                    onToggle={handleToggleRespirationNotifications}
                  />
                  {respirationSettings.enabled && (
                    <>
                      <View style={styles.divider} />
                      {/* High Threshold */}
                      <View style={styles.row}>
                        <View style={styles.rowTextContainer}>
                          <Text style={styles.rowTitle}>High Threshold</Text>
                          <Text style={styles.rowSubtitle}>
                            Notify when breathing rate exceeds this value (RPM)
                          </Text>
                        </View>
                        {isEditingRespirationHigh ? (
                          <View style={styles.inputContainer}>
                            <TextInput
                              style={styles.input}
                              value={respirationHighInput}
                              onChangeText={setRespirationHighInput}
                              keyboardType="numeric"
                              autoFocus
                              selectTextOnFocus
                              onSubmitEditing={() => {
                                const value = parseFloat(respirationHighInput);
                                if (!isNaN(value)) {
                                  handleSaveRespirationThreshold('high', value);
                                } else {
                                  setIsEditingRespirationHigh(false);
                                  setRespirationHighInput(respirationSettings.highThreshold.toString());
                                }
                              }}
                              onBlur={() => {
                                const value = parseFloat(respirationHighInput);
                                if (!isNaN(value)) {
                                  handleSaveRespirationThreshold('high', value);
                                } else {
                                  setIsEditingRespirationHigh(false);
                                  setRespirationHighInput(respirationSettings.highThreshold.toString());
                                }
                              }}
                            />
                            <Text style={styles.inputUnit}>RPM</Text>
                          </View>
                        ) : (
                          <TouchableOpacity
                            onPress={() => setIsEditingRespirationHigh(true)}
                            style={styles.valueButton}
                          >
                            <Text style={styles.valueText}>{respirationSettings.highThreshold}</Text>
                            <Text style={styles.valueUnit}> RPM</Text>
                            <Ionicons name="pencil" size={16} color="rgba(255,255,255,0.5)" style={{ marginLeft: 4 }} />
                          </TouchableOpacity>
                        )}
                      </View>
                      <View style={styles.divider} />
                      
                      {/* Low Threshold */}
                      <View style={styles.row}>
                        <View style={styles.rowTextContainer}>
                          <Text style={styles.rowTitle}>Low Threshold</Text>
                          <Text style={styles.rowSubtitle}>
                            Notify when breathing rate falls below this value (RPM)
                          </Text>
                        </View>
                        {isEditingRespirationLow ? (
                          <View style={styles.inputContainer}>
                            <TextInput
                              style={styles.input}
                              value={respirationLowInput}
                              onChangeText={setRespirationLowInput}
                              keyboardType="numeric"
                              autoFocus
                              selectTextOnFocus
                              onSubmitEditing={() => {
                                const value = parseFloat(respirationLowInput);
                                if (!isNaN(value)) {
                                  handleSaveRespirationThreshold('low', value);
                                } else {
                                  setIsEditingRespirationLow(false);
                                  setRespirationLowInput(respirationSettings.lowThreshold.toString());
                                }
                              }}
                              onBlur={() => {
                                const value = parseFloat(respirationLowInput);
                                if (!isNaN(value)) {
                                  handleSaveRespirationThreshold('low', value);
                                } else {
                                  setIsEditingRespirationLow(false);
                                  setRespirationLowInput(respirationSettings.lowThreshold.toString());
                                }
                              }}
                            />
                            <Text style={styles.inputUnit}>RPM</Text>
                          </View>
                        ) : (
                          <TouchableOpacity
                            onPress={() => setIsEditingRespirationLow(true)}
                            style={styles.valueButton}
                          >
                            <Text style={styles.valueText}>{respirationSettings.lowThreshold}</Text>
                            <Text style={styles.valueUnit}> RPM</Text>
                            <Ionicons name="pencil" size={16} color="rgba(255,255,255,0.5)" style={{ marginLeft: 4 }} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </>
                  )}
                </View>

                <SectionHeader label="Stress Level Trends" />
                <View style={styles.card}>
                  <Row
                    title="Enable Stress Notifications"
                    subtitle="Get notified when your stress level trend goes above or below your set thresholds"
                    showToggle
                    toggleValue={stressSettings.enabled}
                    onToggle={handleToggleStressNotifications}
                  />
                  {stressSettings.enabled && (
                    <>
                      <View style={styles.divider} />
                      {/* High Threshold */}
                      <View style={styles.row}>
                        <View style={styles.rowTextContainer}>
                          <Text style={styles.rowTitle}>High Threshold</Text>
                          <Text style={styles.rowSubtitle}>
                            Notify when stress level exceeds this value
                          </Text>
                        </View>
                        {isEditingStressHigh ? (
                          <View style={styles.inputContainer}>
                            <TextInput
                              style={styles.input}
                              value={stressHighInput}
                              onChangeText={setStressHighInput}
                              keyboardType="numeric"
                              autoFocus
                              selectTextOnFocus
                              onSubmitEditing={() => {
                                const value = parseInt(stressHighInput, 10);
                                if (!isNaN(value)) {
                                  handleSaveStressThreshold('high', value);
                                } else {
                                  setIsEditingStressHigh(false);
                                  setStressHighInput(stressSettings.highThreshold.toString());
                                }
                              }}
                              onBlur={() => {
                                const value = parseInt(stressHighInput, 10);
                                if (!isNaN(value)) {
                                  handleSaveStressThreshold('high', value);
                                } else {
                                  setIsEditingStressHigh(false);
                                  setStressHighInput(stressSettings.highThreshold.toString());
                                }
                              }}
                            />
                          </View>
                        ) : (
                          <TouchableOpacity
                            onPress={() => setIsEditingStressHigh(true)}
                            style={styles.valueButton}
                          >
                            <Text style={styles.valueText}>{stressSettings.highThreshold}</Text>
                            <Ionicons name="pencil" size={16} color="rgba(255,255,255,0.5)" style={{ marginLeft: 4 }} />
                          </TouchableOpacity>
                        )}
                      </View>
                      <View style={styles.divider} />
                      
                      {/* Low Threshold */}
                      <View style={styles.row}>
                        <View style={styles.rowTextContainer}>
                          <Text style={styles.rowTitle}>Low Threshold</Text>
                          <Text style={styles.rowSubtitle}>
                            Notify when stress level falls below this value
                          </Text>
                        </View>
                        {isEditingStressLow ? (
                          <View style={styles.inputContainer}>
                            <TextInput
                              style={styles.input}
                              value={stressLowInput}
                              onChangeText={setStressLowInput}
                              keyboardType="numeric"
                              autoFocus
                              selectTextOnFocus
                              onSubmitEditing={() => {
                                const value = parseInt(stressLowInput, 10);
                                if (!isNaN(value)) {
                                  handleSaveStressThreshold('low', value);
                                } else {
                                  setIsEditingStressLow(false);
                                  setStressLowInput(stressSettings.lowThreshold.toString());
                                }
                              }}
                              onBlur={() => {
                                const value = parseInt(stressLowInput, 10);
                                if (!isNaN(value)) {
                                  handleSaveStressThreshold('low', value);
                                } else {
                                  setIsEditingStressLow(false);
                                  setStressLowInput(stressSettings.lowThreshold.toString());
                                }
                              }}
                            />
                          </View>
                        ) : (
                          <TouchableOpacity
                            onPress={() => setIsEditingStressLow(true)}
                            style={styles.valueButton}
                          >
                            <Text style={styles.valueText}>{stressSettings.lowThreshold}</Text>
                            <Ionicons name="pencil" size={16} color="rgba(255,255,255,0.5)" style={{ marginLeft: 4 }} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </>
                  )}
                </View>

                <SectionHeader label="Temperature Alerts" />
                <View style={styles.card}>
                  <Row
                    title="Enable Temperature Notifications"
                    subtitle="Get notified when room temperature goes above or below your set thresholds"
                    showToggle
                    toggleValue={temperatureSettings.enabled}
                    onToggle={handleToggleTemperatureNotifications}
                  />
                  {temperatureSettings.enabled && (
                    <>
                      <View style={styles.divider} />
                      {/* High Threshold */}
                      <View style={styles.row}>
                        <View style={styles.rowTextContainer}>
                          <Text style={styles.rowTitle}>High Threshold</Text>
                          <Text style={styles.rowSubtitle}>
                            Alert when temperature exceeds this value (°C)
                          </Text>
                        </View>
                        {isEditingTemperatureHigh ? (
                          <View style={styles.inputContainer}>
                            <TextInput
                              style={styles.input}
                              value={temperatureHighInput}
                              onChangeText={setTemperatureHighInput}
                              keyboardType="numeric"
                              autoFocus
                              selectTextOnFocus
                              onSubmitEditing={() => {
                                const value = parseFloat(temperatureHighInput);
                                if (!isNaN(value)) {
                                  handleSaveTemperatureThreshold('high', value);
                                } else {
                                  setIsEditingTemperatureHigh(false);
                                  setTemperatureHighInput(temperatureSettings.highThreshold.toString());
                                }
                              }}
                              onBlur={() => {
                                const value = parseFloat(temperatureHighInput);
                                if (!isNaN(value)) {
                                  handleSaveTemperatureThreshold('high', value);
                                } else {
                                  setIsEditingTemperatureHigh(false);
                                  setTemperatureHighInput(temperatureSettings.highThreshold.toString());
                                }
                              }}
                            />
                            <Text style={styles.inputUnit}>°C</Text>
                          </View>
                        ) : (
                          <TouchableOpacity
                            onPress={() => setIsEditingTemperatureHigh(true)}
                            style={styles.valueButton}
                          >
                            <Text style={styles.valueText}>{temperatureSettings.highThreshold}</Text>
                            <Text style={styles.valueUnit}> °C</Text>
                            <Ionicons name="pencil" size={16} color="rgba(255,255,255,0.5)" style={{ marginLeft: 4 }} />
                          </TouchableOpacity>
                        )}
                      </View>
                      <View style={styles.divider} />
                      
                      {/* Low Threshold */}
                      <View style={styles.row}>
                        <View style={styles.rowTextContainer}>
                          <Text style={styles.rowTitle}>Low Threshold</Text>
                          <Text style={styles.rowSubtitle}>
                            Alert when temperature falls below this value (°C)
                          </Text>
                        </View>
                        {isEditingTemperatureLow ? (
                          <View style={styles.inputContainer}>
                            <TextInput
                              style={styles.input}
                              value={temperatureLowInput}
                              onChangeText={setTemperatureLowInput}
                              keyboardType="numeric"
                              autoFocus
                              selectTextOnFocus
                              onSubmitEditing={() => {
                                const value = parseFloat(temperatureLowInput);
                                if (!isNaN(value)) {
                                  handleSaveTemperatureThreshold('low', value);
                                } else {
                                  setIsEditingTemperatureLow(false);
                                  setTemperatureLowInput(temperatureSettings.lowThreshold.toString());
                                }
                              }}
                              onBlur={() => {
                                const value = parseFloat(temperatureLowInput);
                                if (!isNaN(value)) {
                                  handleSaveTemperatureThreshold('low', value);
                                } else {
                                  setIsEditingTemperatureLow(false);
                                  setTemperatureLowInput(temperatureSettings.lowThreshold.toString());
                                }
                              }}
                            />
                            <Text style={styles.inputUnit}>°C</Text>
                          </View>
                        ) : (
                          <TouchableOpacity
                            onPress={() => setIsEditingTemperatureLow(true)}
                            style={styles.valueButton}
                          >
                            <Text style={styles.valueText}>{temperatureSettings.lowThreshold}</Text>
                            <Text style={styles.valueUnit}> °C</Text>
                            <Ionicons name="pencil" size={16} color="rgba(255,255,255,0.5)" style={{ marginLeft: 4 }} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </>
                  )}
                </View>

                <SectionHeader label="Humidity Alerts" />
                <View style={styles.card}>
                  <Row
                    title="Enable Humidity Notifications"
                    subtitle="Get notified when room humidity goes above or below your set thresholds"
                    showToggle
                    toggleValue={humiditySettings.enabled}
                    onToggle={handleToggleHumidityNotifications}
                  />
                  {humiditySettings.enabled && (
                    <>
                      <View style={styles.divider} />
                      {/* High Threshold */}
                      <View style={styles.row}>
                        <View style={styles.rowTextContainer}>
                          <Text style={styles.rowTitle}>High Threshold</Text>
                          <Text style={styles.rowSubtitle}>
                            Alert when humidity exceeds this value (%)
                          </Text>
                        </View>
                        {isEditingHumidityHigh ? (
                          <View style={styles.inputContainer}>
                            <TextInput
                              style={styles.input}
                              value={humidityHighInput}
                              onChangeText={setHumidityHighInput}
                              keyboardType="numeric"
                              autoFocus
                              selectTextOnFocus
                              onSubmitEditing={() => {
                                const value = parseFloat(humidityHighInput);
                                if (!isNaN(value)) {
                                  handleSaveHumidityThreshold('high', value);
                                } else {
                                  setIsEditingHumidityHigh(false);
                                  setHumidityHighInput(humiditySettings.highThreshold.toString());
                                }
                              }}
                              onBlur={() => {
                                const value = parseFloat(humidityHighInput);
                                if (!isNaN(value)) {
                                  handleSaveHumidityThreshold('high', value);
                                } else {
                                  setIsEditingHumidityHigh(false);
                                  setHumidityHighInput(humiditySettings.highThreshold.toString());
                                }
                              }}
                            />
                            <Text style={styles.inputUnit}>%</Text>
                          </View>
                        ) : (
                          <TouchableOpacity
                            onPress={() => setIsEditingHumidityHigh(true)}
                            style={styles.valueButton}
                          >
                            <Text style={styles.valueText}>{humiditySettings.highThreshold}</Text>
                            <Text style={styles.valueUnit}> %</Text>
                            <Ionicons name="pencil" size={16} color="rgba(255,255,255,0.5)" style={{ marginLeft: 4 }} />
                          </TouchableOpacity>
                        )}
                      </View>
                      <View style={styles.divider} />
                      
                      {/* Low Threshold */}
                      <View style={styles.row}>
                        <View style={styles.rowTextContainer}>
                          <Text style={styles.rowTitle}>Low Threshold</Text>
                          <Text style={styles.rowSubtitle}>
                            Alert when humidity falls below this value (%)
                          </Text>
                        </View>
                        {isEditingHumidityLow ? (
                          <View style={styles.inputContainer}>
                            <TextInput
                              style={styles.input}
                              value={humidityLowInput}
                              onChangeText={setHumidityLowInput}
                              keyboardType="numeric"
                              autoFocus
                              selectTextOnFocus
                              onSubmitEditing={() => {
                                const value = parseFloat(humidityLowInput);
                                if (!isNaN(value)) {
                                  handleSaveHumidityThreshold('low', value);
                                } else {
                                  setIsEditingHumidityLow(false);
                                  setHumidityLowInput(humiditySettings.lowThreshold.toString());
                                }
                              }}
                              onBlur={() => {
                                const value = parseFloat(humidityLowInput);
                                if (!isNaN(value)) {
                                  handleSaveHumidityThreshold('low', value);
                                } else {
                                  setIsEditingHumidityLow(false);
                                  setHumidityLowInput(humiditySettings.lowThreshold.toString());
                                }
                              }}
                            />
                            <Text style={styles.inputUnit}>%</Text>
                          </View>
                        ) : (
                          <TouchableOpacity
                            onPress={() => setIsEditingHumidityLow(true)}
                            style={styles.valueButton}
                          >
                            <Text style={styles.valueText}>{humiditySettings.lowThreshold}</Text>
                            <Text style={styles.valueUnit}> %</Text>
                            <Ionicons name="pencil" size={16} color="rgba(255,255,255,0.5)" style={{ marginLeft: 4 }} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </>
                  )}
                </View>
              </>
            )}
          </>
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
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
  },
  backButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: { color: '#FFF', fontSize: 22, fontWeight: '800', flex: 1, textAlign: 'center' },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 200,
  },
  sectionHeader: { 
    color: '#8F96C2', 
    fontSize: 12, 
    letterSpacing: 0.6, 
    marginTop: 16, 
    marginBottom: 8, 
    fontWeight: '600' 
  },
  card: { 
    backgroundColor: 'rgba(255,255,255,0.04)', 
    borderRadius: 12, 
    overflow: 'hidden', 
    borderWidth: StyleSheet.hairlineWidth, 
    borderColor: 'rgba(255,255,255,0.08)' 
  },
  row: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 16, 
    paddingVertical: 14 
  },
  rowTextContainer: { flexShrink: 1, paddingRight: 12 },
  rowTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  rowSubtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2 },
  valueText: { color: 'rgba(255,255,255,0.9)', fontSize: 16, fontWeight: '600' },
  valueUnit: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  valueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    minWidth: 100,
  },
  input: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'right',
    minWidth: 50,
    paddingVertical: 4,
  },
  inputUnit: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    marginLeft: 4,
  },
  chevron: { color: 'rgba(255,255,255,0.5)', fontSize: 22, marginLeft: 8 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.08)', marginLeft: 16 },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(74, 144, 226, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(74, 144, 226, 0.2)',
  },
  infoText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    lineHeight: 18,
    marginLeft: 12,
    flex: 1,
  },
  warningBanner: {
    backgroundColor: 'rgba(255, 193, 7, 0.15)',
    borderLeftWidth: 3,
    borderLeftColor: '#FFC107',
    padding: 12,
    margin: 16,
    marginBottom: 8,
    borderRadius: 8,
  },
  warningText: {
    color: '#FFC107',
    fontSize: 13,
    lineHeight: 18,
  },
});
