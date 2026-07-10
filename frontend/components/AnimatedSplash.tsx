import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import Svg, { Circle } from 'react-native-svg';

const CIRCLE_SIZE = 220; // outer ring size
const LOGO_SIZE = 160;   // logo size inside ring

export default function AnimatedSplash() {
  const { auth } = useAuth();
  const { isLightTheme } = useTheme();
  const [isDone, setIsDone] = useState(false);

  // Animation values
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.96)).current;
  const strokeOffset = useRef(new Animated.Value(1)).current; // 1 => full hidden, 0 => fully drawn

  const radius = (CIRCLE_SIZE - 12) / 2; // circle minus stroke width
  const circumference = useMemo(() => 2 * Math.PI * radius, [radius]);

  // Draw ring then reveal logo + glow pulse
  useEffect(() => {
    // 1) Draw the circular outline (stroke-dash animation)
    const draw = Animated.timing(strokeOffset, {
      toValue: 0,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });

    // 2) Fade in logo
    const fadeInLogo = Animated.timing(logoOpacity, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });

    // 3) Subtle glow pulse
    const glow = Animated.sequence([
      Animated.timing(logoScale, {
        toValue: 1.04,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(logoScale, {
        toValue: 1.0,
        duration: 360,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    Animated.sequence([draw, fadeInLogo, glow]).start();
  }, [logoOpacity, logoScale, strokeOffset]);

  // Hide overlay once auth finished loading (and ensure minimum display time)
  useEffect(() => {
    let minTimeOk = false;
    let readyOk = false;

    const tryHide = () => {
      if (minTimeOk && readyOk && !isDone) {
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 350,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start(() => setIsDone(true));
      }
    };

    const minTimer = setTimeout(() => {
      minTimeOk = true;
      tryHide();
    }, 2500);

    if (!auth.isLoading) {
      readyOk = true;
      tryHide();
    }

    return () => clearTimeout(minTimer);
  }, [auth.isLoading, isDone, overlayOpacity]);

  if (isDone) return null;

  const strokeDasharray = [circumference, circumference];
  const strokeDashoffset = strokeOffset.interpolate({
    inputRange: [0, 1],
    outputRange: [0, circumference],
  });

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: overlayOpacity, zIndex: 999 }] }>
      <LinearGradient
        colors={isLightTheme ? ['#FFFFFF', '#F5F7FB', '#EAEFF8'] : ['#1D244D', '#02041A', '#1A1D3E']}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.centerWrap}>
        {/* Subtle backdrop glow */}
        <Animated.View
          style={{
            position: 'absolute',
            width: CIRCLE_SIZE * 1.15,
            height: CIRCLE_SIZE * 1.15,
            borderRadius: (CIRCLE_SIZE * 1.15) / 2,
            backgroundColor: isLightTheme ? 'rgba(0, 97, 164, 0.08)' : 'rgba(199, 185, 255, 0.10)',
            transform: [{ scale: logoScale }],
          }}
        />

        {/* Outline ring (line-draw effect) */}
        <Svg width={CIRCLE_SIZE} height={CIRCLE_SIZE}>
          <Circle
            cx={CIRCLE_SIZE / 2}
            cy={CIRCLE_SIZE / 2}
            r={radius}
            fill="none"
            stroke={isLightTheme ? '#0061A4' : '#C7B9FF'}
            strokeOpacity={0.9}
            strokeWidth={2.5}
            strokeDasharray={strokeDasharray as any}
            strokeDashoffset={strokeDashoffset as any}
            strokeLinecap="round"
          />
        </Svg>

        {/* App logo */}
        <Animated.Image
          source={require('../assets/images/dozemate_transparent.png')}
          style={{
            position: 'absolute',
            width: LOGO_SIZE,
            height: LOGO_SIZE,
            opacity: logoOpacity,
            transform: [{ scale: logoScale }],
            resizeMode: 'contain',
          }}
        />
      </View>

      {/* Subtle bottom gradient sheen */}
      <LinearGradient
        colors={isLightTheme ? ['transparent', 'rgba(0,97,164,0.03)', 'transparent'] : ['transparent', 'rgba(199,185,255,0.06)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { opacity: Platform.OS === 'ios' ? 0.9 : 0.7 } ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});


