import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import RNSpeedometer from 'react-native-speedometer';

interface HealthGaugeProps {
  score: number; // 0-10
  size?: number;
}

export function HealthGauge({ score, size = 50 }: HealthGaugeProps) {
  // Speedometer expects value between minValue and maxValue (0-10)
  const value = useMemo(() => {
    return Math.max(0, Math.min(10, score));
  }, [score]);

  // Avoid a big sweep animation on first mount.
  // First render: draw at final value with no animation.
  // Later updates: animate smoothly.
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Define color zones for the gauge
  // More labels = smoother color transitions
  // Red (0-6), Yellow (6-8), Green (8-10)
  const labels = useMemo(() => [
    {
      name: 'Zone1',
      labelColor: '#FF5252',
      activeBarColor: '#FF5252',
    },
    {
      name: 'Zone2',
      labelColor: '#FF5252',
      activeBarColor: '#FF5252',
    },
    {
      name: 'Zone3',
      labelColor: '#FF5252',
      activeBarColor: '#FF5252',
    },
    {
      name: 'Zone4',
      labelColor: '#FFA500',
      activeBarColor: '#FFA500',
    },
    {
      name: 'Zone5',
      labelColor: '#FFA500',
      activeBarColor: '#FFA500',
    },
    {
      name: 'Zone6',
      labelColor: '#4CAF50',
      activeBarColor: '#4CAF50',
    },
    {
      name: 'Zone7',
      labelColor: '#4CAF50',
      activeBarColor: '#4CAF50',
    },
  ], []);

  return (
    <View style={[styles.container, { width: size, height: size * 0.6 }]}>
      <RNSpeedometer
        value={value}
        size={size}
        minValue={0}
        maxValue={10}
        allowedDecimals={1}
        // Slow down the gauge animation so it feels more like a real meter,
        // but don't animate on the very first render.
        easeDuration={hasMounted ? 1500 : 0}
        labels={labels}
        labelWrapperStyle={styles.labelWrapperStyle}
        labelStyle={styles.labelStyle}
        labelNoteStyle={styles.labelNoteStyle}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  wrapperStyle: {
    // Don't override - let the gauge render its background
  },
  outerCircleStyle: {
    // Don't override - let the gauge render its arc
  },
  halfCircleStyle: {
    // Don't override - let the gauge render its arc
  },
  innerCircleStyle: {
    // Don't override - let the gauge render its center
  },
  labelWrapperStyle: {
    // Keep transparent to hide label containers
    backgroundColor: 'transparent',
  },
  labelStyle: {
    fontSize: 1, // Minimum positive value (hidden with opacity)
    color: 'transparent',
    opacity: 0,
  },
  labelNoteStyle: {
    fontSize: 1, // Minimum positive value (hidden with opacity)
    color: 'transparent',
    opacity: 0,
  },
});
