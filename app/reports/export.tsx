import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, StatusBar, TouchableOpacity, ScrollView, ActivityIndicator, Pressable, Modal, FlatList } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { useDevice } from '@/contexts/DeviceContext';

import type { DateRange, DailySummary } from '@/types/Reports';
import { ensureRangeLimit, exportSelectedDataCsv, mergeExportData } from '@/services/ReportsService';
import { apiUrl } from '@/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function ExportScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { devices, activeDevice } = useDevice();

  const [selectedDevice, setSelectedDevice] = useState<typeof activeDevice>(null);
  // Initialize with default: last 12 hours (from: now - 12 hours, to: now)
  const getDefaultDates = () => {
    const now = new Date();
    const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
    return { from: twelveHoursAgo, to: now };
  };
  const [fromDate, setFromDate] = useState<Date | null>(getDefaultDates().from);
  const [toDate, setToDate] = useState<Date | null>(getDefaultDates().to);
  const [isDeviceDropdownOpen, setIsDeviceDropdownOpen] = useState(false);
  const [isFromDatePickerVisible, setIsFromDatePickerVisible] = useState(false);
  const [isToDatePickerVisible, setIsToDatePickerVisible] = useState(false);
  const [isFromTimePickerVisible, setIsFromTimePickerVisible] = useState(false);
  const [isToTimePickerVisible, setIsToTimePickerVisible] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [status, setStatus] = useState<string>('');
  
  // Data selection state - using array of selected field keys
  const [selectedDataFields, setSelectedDataFields] = useState<string[]>([]);
  
  // Available data fields
  const dataFields = [
    { key: 'ALL', label: 'ALL' },
    { key: 'heartRate', label: 'Heart Rate' },
    { key: 'respiration', label: 'Respiration' },
    { key: 'stressLevel', label: 'Stress Level' },
    { key: 'temperature', label: 'Temperature' },
    { key: 'humidity', label: 'Humidity' },
    { key: 'co2', label: 'CO2' },
    { key: 'voc', label: 'VOC' },
    { key: 'etoh', label: 'ETOH' },
  ];

  // Sync selectedDevice when devices list changes (e.g., after renaming)
  useEffect(() => {
    if (selectedDevice && devices) {
      // Find the updated device in the devices array to get latest name changes
      const updatedDevice = devices.find(d => d._id === selectedDevice._id || d.deviceId === selectedDevice.deviceId);
      if (updatedDevice) {
        setSelectedDevice(updatedDevice);
      }
    }
  }, [devices]);

  // Format date for display (DD/MM/YYYY)
  const formatDate = (date: Date | null): string => {
    if (!date) return 'Select date';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // Format time for display (HH:MM AM/PM)
  const formatTime = (date: Date | null): string => {
    if (!date) return 'Select time';
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMinutes = String(minutes).padStart(2, '0');
    return `${displayHours}:${displayMinutes} ${ampm}`;
  };

  // Get device display name (matches All Devices screen logic)
  const getDeviceDisplayName = (device: typeof activeDevice): string => {
    if (!device) return 'No device selected';
    return device.customName || device.deviceId;
  };

  // Helper function to check if a date is today
  const isToday = (date: Date): boolean => {
    const today = new Date();
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  };

  // Helper function to get minimum date (15 days ago from now)
  const getMinimumDate = (): Date => {
    const now = new Date();
    const fifteenDaysAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
    return fifteenDaysAgo;
  };

  // Handle data field selection
  const handleDataFieldToggle = (fieldKey: string) => {
    if (fieldKey === 'ALL') {
      if (selectedDataFields.includes('ALL')) {
        setSelectedDataFields([]);
      } else {
        setSelectedDataFields(['ALL']);
      }
    } else {
      const newFields = [...selectedDataFields];
      const allIndex = newFields.indexOf('ALL');
      if (allIndex > -1) {
        newFields.splice(allIndex, 1);
      }
      
      const fieldIndex = newFields.indexOf(fieldKey);
      if (fieldIndex > -1) {
        newFields.splice(fieldIndex, 1);
      } else {
        newFields.push(fieldKey);
      }
      
      // If all individual fields are selected, add ALL
      const individualFields = dataFields.filter(f => f.key !== 'ALL').map(f => f.key);
      if (individualFields.every(key => newFields.includes(key))) {
        setSelectedDataFields(['ALL']);
      } else {
        setSelectedDataFields(newFields);
      }
    }
  };

  const handleExport = async () => {
    if (!selectedDevice) {
      setStatus('Please select a device');
      return;
    }

    if (!fromDate || !toDate) {
      setStatus('Please select both start and end date/time');
      return;
    }

    // Validate that dates are not in the future
    const now = new Date();
    if (fromDate.getTime() > now.getTime()) {
      setStatus('Start date/time cannot be in the future');
      return;
    }
    if (toDate.getTime() > now.getTime()) {
      setStatus('End date/time cannot be in the future');
      return;
    }
    if (fromDate.getTime() > toDate.getTime()) {
      setStatus('Start date/time must be before end date/time');
      return;
    }

    // Validate that fromDate is not more than 15 days ago
    const minimumDate = getMinimumDate();
    if (fromDate.getTime() < minimumDate.getTime()) {
      setStatus('Start date/time cannot be more than 15 days before the current date');
      return;
    }

    // Check if at least one data field is selected
    if (selectedDataFields.length === 0) {
      setStatus('Please select at least one data field to export');
      return;
    }

    try {
      setIsExporting(true);
      setStatus('');

      // Convert dates to ISO format (yyyy-mm-dd) - use selected times
      const startDate = new Date(fromDate);
      const endDate = new Date(toDate);

      const startISO = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
      const endISO = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

      const range: DateRange = { start: startISO, end: endISO };
      ensureRangeLimit(range, 15);

      const deviceId = selectedDevice.deviceId;
      const startTimeISO = startDate.toISOString();
      const endTimeISO = endDate.toISOString();
      const token = await AsyncStorage.getItem('auth_token');

      // Determine which data types to fetch
      const isAllSelected = selectedDataFields.includes('ALL');
      const fetchHeartRate = isAllSelected || selectedDataFields.includes('heartRate');
      const fetchRespiration = isAllSelected || selectedDataFields.includes('respiration');
      const fetchStress = isAllSelected || selectedDataFields.includes('stressLevel');

      // Fetch data from different sources
      setStatus('Fetching data from server...');
      let historyData: any[] = [];
      let stressData: any[] = [];

      try {
        // Fetch heart rate and respiration from /api/history
        if (fetchHeartRate || fetchRespiration) {
          const url = apiUrl(`/api/history?start=${encodeURIComponent(startTimeISO)}&end=${encodeURIComponent(endTimeISO)}&deviceId=${encodeURIComponent(deviceId)}`);
          const res = await fetch(url, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            },
          });
          
          if (!res.ok) throw new Error(`Failed to fetch history: ${res.status}`);
          historyData = await res.json().catch(() => []);
          
          if (!Array.isArray(historyData)) {
            historyData = [];
          }
        }

        // Fetch stress level from /api/data/health/stress/graph/:deviceId
        if (fetchStress) {
          setStatus('Fetching stress data...');
          const normalizedDeviceId = deviceId.trim().toUpperCase();
          const stressUrl = apiUrl(`/api/data/health/stress/graph/${normalizedDeviceId}?from=${encodeURIComponent(startTimeISO)}&to=${encodeURIComponent(endTimeISO)}`);
          const stressRes = await fetch(stressUrl, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            },
          });
          
          if (stressRes.ok) {
            const stressResponse = await stressRes.json().catch(() => ({}));
            const points = stressResponse.points || stressResponse.data?.points || [];
            // Transform stress data to match history data format
            stressData = points.map((point: any) => ({
              timestamp: point.timestamp,
              stress_level: point.stress_level,
              deviceId: deviceId,
            }));
          }
        }

        // Merge data based on timestamps
        let mergedData = mergeExportData(
          historyData,
          stressData,
          deviceId,
          selectedDataFields
        );

        // Filter data by time range (in case API doesn't filter correctly)
        // Get UTC milliseconds from Date objects (Date.getTime() always returns UTC milliseconds since epoch)
        // The Date objects represent local timezone times selected by user, but getTime() converts to UTC correctly
        const startTime = startDate.getTime(); // UTC milliseconds since epoch
        const endTime = endDate.getTime(); // UTC milliseconds since epoch
        
        mergedData = mergedData.filter((item: any) => {
          // Ensure item timestamp is in UTC milliseconds
          let itemTime: number;
          if (item.timestamp) {
            // If timestamp is already a number (milliseconds), use it directly
            // If it's a string (ISO), convert to milliseconds
            itemTime = typeof item.timestamp === 'string' 
              ? new Date(item.timestamp).getTime() 
              : item.timestamp;
          } else if (item.time) {
            // Convert ISO string to UTC milliseconds
            itemTime = new Date(item.time).getTime();
          } else {
            return false; // Skip items without timestamp
          }
          
          // Compare UTC timestamps - both sides are now in UTC milliseconds
          return itemTime >= startTime && itemTime <= endTime;
        });

        if (mergedData.length === 0) {
          setStatus('No data available for the selected device and date range.');
          setIsExporting(false);
          return;
        }

        setStatus('Generating CSV...');
        await exportSelectedDataCsv(range, mergedData, selectedDataFields, deviceId);
        
        setStatus('File Downloaded');
      } catch (error: any) {
        console.error('Error fetching data:', error);
        setStatus('Failed to fetch data from server. Please check your connection and try again.');
        setIsExporting(false);
        return;
      }
    } catch (e: any) {
      setStatus(e?.message || 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar barStyle="light-content" backgroundColor="#02041A" />
      <LinearGradient colors={['#1D244D', '#02041A', '#1A1D3E']} style={styles.gradientBackground} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Text style={styles.headerTitle}>Export</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView 
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!isDeviceDropdownOpen}
      >
        {/* SELECT DEVICE Section */}
        <View style={styles.deviceSection}>
          <Text style={styles.sectionLabel}>SELECT DEVICE</Text>
          <TouchableOpacity 
            style={styles.deviceSelector}
            onPress={() => setIsDeviceDropdownOpen(!isDeviceDropdownOpen)}
            activeOpacity={0.8}
          >
            <Ionicons name="phone-portrait-outline" size={20} color="#4A90E2" style={styles.deviceIcon} />
            <Text style={styles.deviceText} numberOfLines={1}>
              {getDeviceDisplayName(selectedDevice)}
            </Text>
            <Ionicons 
              name={isDeviceDropdownOpen ? "chevron-up" : "chevron-down"} 
              size={20} 
              color="#FFFFFF" 
            />
          </TouchableOpacity>
          {isDeviceDropdownOpen && (
            <View style={styles.deviceDropdown}>
              <ScrollView 
                style={styles.dropdownScrollView}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                {devices && devices.length > 0 ? (
                  devices.map((device) => (
                    <TouchableOpacity
                      key={device._id}
                      style={[
                        styles.dropdownItem,
                        selectedDevice?._id === device._id && styles.dropdownItemSelected
                      ]}
                      onPress={() => {
                        setSelectedDevice(device);
                        setIsDeviceDropdownOpen(false);
                      }}
                    >
                      <Ionicons name="phone-portrait-outline" size={18} color="#4A90E2" />
                      <Text style={styles.dropdownText}>{getDeviceDisplayName(device)}</Text>
                      {selectedDevice?._id === device._id && (
                        <Ionicons name="checkmark-circle" size={18} color="#4A90E2" />
                      )}
                    </TouchableOpacity>
                  ))
                ) : (
                  <View style={styles.dropdownItem}>
                    <Text style={styles.dropdownEmptyText}>No devices available</Text>
                  </View>
                )}
              </ScrollView>
            </View>
          )}
        </View>

        {/* DATA SELECTION Section */}
        <Text style={[styles.sectionLabel, { marginTop: 24 }]}>SELECT DATA</Text>
        <View style={styles.dataSelectionContainer}>
          {dataFields.map((field) => {
            const isAllSelected = selectedDataFields.includes('ALL');
            const isFieldSelected = field.key === 'ALL' 
              ? isAllSelected 
              : (isAllSelected || selectedDataFields.includes(field.key));
            
            return (
              <TouchableOpacity
                key={field.key}
                style={styles.dataFieldChip}
                onPress={() => handleDataFieldToggle(field.key)}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, isFieldSelected && styles.checkboxChecked]}>
                  {isFieldSelected && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
                </View>
                <Text style={styles.dataFieldLabel}>{field.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* DATE RANGE Section */}
        <Text style={[styles.sectionLabel, { marginTop: 24 }]}>DATE RANGE</Text>
        <View style={styles.dateRangeContainer}>
          {/* From Date & Time */}
          <View style={styles.dateTimeRow}>
            <TouchableOpacity
              style={[styles.dateTimeInput, styles.dateInput]}
              onPress={() => setIsFromDatePickerVisible(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.dateLabel}>From</Text>
              <View style={styles.dateValueContainer}>
                <Text style={[styles.dateValue, !fromDate && styles.dateValuePlaceholder]}>
                  {formatDate(fromDate)}
                </Text>
                <Ionicons name="calendar-outline" size={20} color="#4A90E2" />
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.dateTimeInput, styles.timeInput]}
              onPress={() => setIsFromTimePickerVisible(true)}
              activeOpacity={0.8}
            >
              <View style={styles.dateValueContainer}>
                <Text style={[styles.dateValue, !fromDate && styles.dateValuePlaceholder]}>
                  {formatTime(fromDate)}
                </Text>
                <Ionicons name="time-outline" size={20} color="#4A90E2" />
              </View>
            </TouchableOpacity>
          </View>

          {/* To Date & Time */}
          <View style={styles.dateTimeRow}>
            <TouchableOpacity
              style={[styles.dateTimeInput, styles.dateInput]}
              onPress={() => setIsToDatePickerVisible(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.dateLabel}>To</Text>
              <View style={styles.dateValueContainer}>
                <Text style={[styles.dateValue, !toDate && styles.dateValuePlaceholder]}>
                  {formatDate(toDate)}
                </Text>
                <Ionicons name="calendar-outline" size={20} color="#4A90E2" />
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.dateTimeInput, styles.timeInput]}
              onPress={() => setIsToTimePickerVisible(true)}
              activeOpacity={0.8}
            >
              <View style={styles.dateValueContainer}>
                <Text style={[styles.dateValue, !toDate && styles.dateValuePlaceholder]}>
                  {formatTime(toDate)}
                </Text>
                <Ionicons name="time-outline" size={20} color="#4A90E2" />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Status Message */}
        {!!status && (
          <View style={styles.statusContainer}>
            <Text style={styles.statusText}>{status}</Text>
          </View>
        )}
      </ScrollView>

      {/* Export Data Button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[styles.exportButton, isExporting && styles.exportButtonDisabled]}
          onPress={handleExport}
          disabled={isExporting}
          activeOpacity={0.8}
        >
          {isExporting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="download-outline" size={20} color="#FFFFFF" />
              <Text style={styles.exportButtonText}>Export Data</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Date Pickers */}
      <DateTimePickerModal
        isVisible={isFromDatePickerVisible}
        mode="date"
        date={fromDate || new Date()}
        minimumDate={getMinimumDate()}
        maximumDate={(() => {
          const now = new Date();
          const toDateMax = toDate ? new Date(toDate) : now;
          // Return the earlier of: toDate or current date (to prevent future dates)
          return toDateMax > now ? now : toDateMax;
        })()}
        onConfirm={(date) => {
          // If time already exists, preserve it; otherwise use current time
          if (fromDate) {
            const updatedDate = new Date(fromDate);
            updatedDate.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
            // If the date is today and the time is in the future, reset to current time
            if (isToday(updatedDate)) {
              const now = new Date();
              if (updatedDate.getTime() > now.getTime()) {
                updatedDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
              }
            }
            // Ensure fromDate is not more than 15 days ago
            const minimumDate = getMinimumDate();
            if (updatedDate.getTime() < minimumDate.getTime()) {
              updatedDate.setTime(minimumDate.getTime());
            }
            setFromDate(updatedDate);
          } else {
            // Use current time when setting date for first time
            const newDate = new Date(date);
            const now = new Date();
            newDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
            // Ensure fromDate is not more than 15 days ago
            const minimumDate = getMinimumDate();
            if (newDate.getTime() < minimumDate.getTime()) {
              newDate.setTime(minimumDate.getTime());
            }
            setFromDate(newDate);
          }
          setIsFromDatePickerVisible(false);
        }}
        onCancel={() => setIsFromDatePickerVisible(false)}
      />

      <DateTimePickerModal
        isVisible={isToDatePickerVisible}
        mode="date"
        date={toDate || new Date()}
        minimumDate={fromDate || undefined}
        maximumDate={new Date()}
        onConfirm={(date) => {
          // If time already exists, preserve it; otherwise use current time
          if (toDate) {
            const updatedDate = new Date(toDate);
            updatedDate.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
            // If the date is today and the time is in the future, reset to current time
            if (isToday(updatedDate)) {
              const now = new Date();
              if (updatedDate.getTime() > now.getTime()) {
                updatedDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
              }
            }
            setToDate(updatedDate);
          } else {
            // Use current time when setting date for first time
            const newDate = new Date(date);
            const now = new Date();
            newDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
            setToDate(newDate);
          }
          setIsToDatePickerVisible(false);
        }}
        onCancel={() => setIsToDatePickerVisible(false)}
      />

      {/* Time Pickers */}
      <DateTimePickerModal
        isVisible={isFromTimePickerVisible}
        mode="time"
        date={fromDate || new Date()}
        onConfirm={(date) => {
          if (fromDate) {
            // Update time on existing date
            const updatedDate = new Date(fromDate);
            updatedDate.setHours(date.getHours());
            updatedDate.setMinutes(date.getMinutes());
            // Ensure the time is not in the future if date is today
            if (isToday(updatedDate)) {
              const now = new Date();
              if (updatedDate.getTime() > now.getTime()) {
                updatedDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
              }
            }
            // Ensure fromDate is not more than 15 days ago
            const minimumDate = getMinimumDate();
            if (updatedDate.getTime() < minimumDate.getTime()) {
              updatedDate.setTime(minimumDate.getTime());
            }
            // Ensure fromDate is not after toDate
            if (toDate && updatedDate.getTime() > toDate.getTime()) {
              updatedDate.setTime(toDate.getTime());
            }
            setFromDate(updatedDate);
          } else {
            // If no date selected, create new date with today's date and selected time
            const newDate = new Date();
            newDate.setHours(date.getHours());
            newDate.setMinutes(date.getMinutes());
            // Ensure the time is not in the future
            const now = new Date();
            if (newDate.getTime() > now.getTime()) {
              newDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
            }
            // Ensure fromDate is not more than 15 days ago (shouldn't happen with today's date, but just in case)
            const minimumDate = getMinimumDate();
            if (newDate.getTime() < minimumDate.getTime()) {
              newDate.setTime(minimumDate.getTime());
            }
            setFromDate(newDate);
          }
          setIsFromTimePickerVisible(false);
        }}
        onCancel={() => setIsFromTimePickerVisible(false)}
      />

      <DateTimePickerModal
        isVisible={isToTimePickerVisible}
        mode="time"
        date={toDate || new Date()}
        onConfirm={(date) => {
          if (toDate) {
            // Update time on existing date
            const updatedDate = new Date(toDate);
            updatedDate.setHours(date.getHours());
            updatedDate.setMinutes(date.getMinutes());
            // Ensure the time is not in the future if date is today
            if (isToday(updatedDate)) {
              const now = new Date();
              if (updatedDate.getTime() > now.getTime()) {
                updatedDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
              }
            }
            // Ensure toDate is not before fromDate
            if (fromDate && updatedDate.getTime() < fromDate.getTime()) {
              updatedDate.setTime(fromDate.getTime());
            }
            setToDate(updatedDate);
          } else {
            // If no date selected, create new date with today's date and selected time
            const newDate = new Date();
            newDate.setHours(date.getHours());
            newDate.setMinutes(date.getMinutes());
            // Ensure the time is not in the future
            const now = new Date();
            if (newDate.getTime() > now.getTime()) {
              newDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
            }
            setToDate(newDate);
          }
          setIsToTimePickerVisible(false);
        }}
        onCancel={() => setIsToTimePickerVisible(false)}
      />
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
    width: '100%',
    height: '100%',
  },
  header: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  sectionLabel: {
    color: '#8F96C2',
    fontSize: 12,
    letterSpacing: 0.6,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  deviceSection: {
    position: 'relative',
    zIndex: 11,
  },
  deviceSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(74, 144, 226, 0.15)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(74, 144, 226, 0.3)',
  },
  deviceIcon: {
    marginRight: 12,
  },
  deviceText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  deviceDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 8,
    backgroundColor: 'rgba(0,0,0,0.9)',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(74, 144, 226, 0.3)',
    zIndex: 100,
    elevation: 6,
    maxHeight: 200,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  dropdownItemSelected: {
    backgroundColor: 'rgba(74, 144, 226, 0.15)',
  },
  dropdownText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  dropdownEmptyText: {
    color: '#8F96C2',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 8,
  },
  dateRangeContainer: {
    gap: 12,
  },
  dateTimeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dateTimeInput: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  dateInput: {
    flex: 1.2,
  },
  timeInput: {
    flex: 1,
    justifyContent: 'center',
  },
  dateLabel: {
    color: '#8F96C2',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  dateValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  dateValuePlaceholder: {
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '400',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(74, 144, 226, 0.15)',
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(74, 144, 226, 0.3)',
  },
  infoText: {
    flex: 1,
    color: '#C7D6FF',
    fontSize: 14,
    lineHeight: 20,
  },
  statusContainer: {
    marginTop: 16,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
  },
  statusText: {
    color: '#C7D6FF',
    fontSize: 14,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 16,
    backgroundColor: 'rgba(2, 4, 26, 0.95)',
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4A90E2',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 8,
  },
  exportButtonDisabled: {
    opacity: 0.6,
  },
  exportButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  dataSelectionContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  dataFieldChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(74, 144, 226, 0.15)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(74, 144, 226, 0.3)',
    minWidth: 80,
  },
  dataFieldLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  checkboxChecked: {
    backgroundColor: '#4A90E2',
    borderColor: '#4A90E2',
  },
});
