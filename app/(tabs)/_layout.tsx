import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { isLightTheme } = useTheme();
  
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: isLightTheme ? '#0061A4' : '#C7B9FF',
        tabBarInactiveTintColor: isLightTheme ? '#666666' : '#FFFFFF',
        tabBarStyle: {
          backgroundColor: isLightTheme ? '#FFFFFF' : 'rgba(30, 25, 60, 0.95)',
          borderTopWidth: isLightTheme ? 1 : 0,
          borderTopColor: isLightTheme ? 'rgba(0, 0, 0, 0.06)' : 'transparent',
          elevation: isLightTheme ? 2 : 0,
          shadowOpacity: isLightTheme ? 0.05 : 0,
          shadowOffset: { width: 0, height: -2 },
          shadowRadius: isLightTheme ? 3 : 0,
          height: 70 + insets.bottom,
          paddingBottom: 10 + insets.bottom,
          paddingTop: 10,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        tabBarButton: (props) => (
          <TouchableOpacity
            {...props}
            activeOpacity={0.92}
          />
        ),
      }}
    >
      <Tabs.Screen 
        name="home" 
        options={{ 
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen 
        name="history" 
        options={{ 
          title: 'History',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="time-outline" size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen 
        name="profile" 
        options={{ 
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen 
        name="settings" 
        options={{ 
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen 
        name="all-devices" 
        options={{ href: null, title: 'All Devices' }}
      />
      <Tabs.Screen 
        name="logout" 
        options={{ href: null, title: 'Logout' }}
      />
    </Tabs>
  );
}
