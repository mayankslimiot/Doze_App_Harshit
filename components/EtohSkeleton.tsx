import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

interface SkeletonBoxProps {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: any;
}

function SkeletonBox({ width, height, borderRadius = 8, style }: SkeletonBoxProps) {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const shimmer = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    );
    shimmer.start();
    return () => shimmer.stop();
  }, [shimmerAnim]);

  const numericWidth = typeof width === 'number' ? width : Dimensions.get('window').width;

  const translateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-numericWidth * 2, numericWidth * 2],
  });

  const opacity = shimmerAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 0.6, 0.3],
  });

  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: 'rgba(255, 255, 255, 0.06)',
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Animated.View
        style={{
          flex: 1,
          transform: [{ translateX }],
          opacity,
        }}
      >
        <LinearGradient
          colors={[
            'transparent',
            'rgba(255, 255, 255, 0.1)',
            'transparent',
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

export default function ETOHSkeleton() {
  return (
    <View style={styles.container}>
      <View style={styles.metricsRow}>
        <View style={styles.metricCard}>
          <SkeletonBox width="100" height={12} borderRadius={4} style={styles.metricLabelSkeleton} />
          <SkeletonBox width={60} height={24} borderRadius={6} style={styles.metricValueSkeleton} />
          <SkeletonBox width={40} height={10} borderRadius={4} style={styles.metricUnitSkeleton} />
        </View>
        <View style={styles.metricCard}>
          <SkeletonBox width="100" height={12} borderRadius={4} style={styles.metricLabelSkeleton} />
          <SkeletonBox width={60} height={24} borderRadius={6} style={styles.metricValueSkeleton} />
          <SkeletonBox width={40} height={10} borderRadius={4} style={styles.metricUnitSkeleton} />
        </View>
        <View style={styles.metricCard}>
          <SkeletonBox width="100" height={12} borderRadius={4} style={styles.metricLabelSkeleton} />
          <SkeletonBox width={60} height={24} borderRadius={6} style={styles.metricValueSkeleton} />
          <SkeletonBox width={40} height={10} borderRadius={4} style={styles.metricUnitSkeleton} />
        </View>
      </View>

      <View style={styles.healthyRangeContainer}>
        <View style={styles.healthyRangeRow}>
          <SkeletonBox width={180} height={14} borderRadius={4} />
          <SkeletonBox width={16} height={16} borderRadius={8} />
        </View>
        <SkeletonBox width={100} height={18} borderRadius={4} style={styles.outOfRangeSkeleton} />
      </View>

      <SkeletonBox width={120} height={12} borderRadius={4} style={styles.lastSyncSkeleton} />

      <View style={styles.chartContainer}>
        <View style={styles.legendContainer}>
          <View style={styles.legendItem}>
            <SkeletonBox width={16} height={12} borderRadius={2} />
            <SkeletonBox width={120} height={12} borderRadius={4} style={styles.legendTextSkeleton} />
          </View>
          <View style={styles.zoomButtonsSkeleton}>
            <SkeletonBox width={24} height={24} borderRadius={6} />
            <SkeletonBox width={40} height={12} borderRadius={4} />
            <SkeletonBox width={24} height={24} borderRadius={6} />
          </View>
        </View>

        <View style={styles.chartWrapper}>
          <View style={styles.yAxisContainer}>
            {[0, 1, 2, 3].map((i) => (
              <SkeletonBox key={i} width={28} height={10} borderRadius={4} style={styles.yAxisLabel} />
            ))}
          </View>

          <View style={styles.chartArea}>
            <View style={styles.graphLineContainer}>
              {Array.from({ length: 20 }).map((_, i) => (
                <SkeletonBox
                  key={i}
                  width={2}
                  height={Math.random() * 100 + 50}
                  borderRadius={1}
                  style={[
                    styles.graphBar,
                    {
                      left: `${(i / 19) * 100}`,
                      bottom: 0,
                    },
                  ]}
                />
              ))}
            </View>
          </View>

          <View style={styles.xAxisContainer}>
            {[0, 1, 2, 3, 4].map((i) => (
              <SkeletonBox key={i} width={40} height={10} borderRadius={4} />
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 12,
  },
  metricCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  metricLabelSkeleton: {
    marginBottom: 6,
  },
  metricValueSkeleton: {
    marginBottom: 2,
  },
  metricUnitSkeleton: {
    marginTop: 2,
  },
  healthyRangeContainer: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  healthyRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 6,
  },
  outOfRangeSkeleton: {
    marginTop: 4,
  },
  lastSyncSkeleton: {
    marginBottom: 20,
  },
  chartContainer: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 6,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
  },
  legendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    width: '100',
    paddingHorizontal: 14,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendTextSkeleton: {
    marginLeft: 8,
  },
  zoomButtonsSkeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  chartWrapper: {
    width: '100',
    height: 320,
    marginTop: 8,
    position: 'relative',
  },
  yAxisContainer: {
    position: 'absolute',
    left: 0,
    top: 18,
    bottom: 40,
    width: 28,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingRight: 4,
  },
  yAxisLabel: {
    marginVertical: 2,
  },
  chartArea: {
    marginLeft: 28,
    marginRight: 8,
    marginTop: 18,
    marginBottom: 40,
    height: 262,
    position: 'relative',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 4,
  },
  graphLineContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '100',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  graphBar: {
    position: 'absolute',
  },
  xAxisContainer: {
    position: 'absolute',
    bottom: 0,
    left: 28,
    right: 8,
    height: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
  },
});
