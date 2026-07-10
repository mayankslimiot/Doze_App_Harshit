/**
 * SPARSE CATEGORICAL BAR CHART - Day View Implementation
 * 
 * This file contains the key implementation for the Day view sparse categorical bar chart.
 * Integrate this code into stress-insights.tsx in the Day view section.
 * 
 * Key Features:
 * - Only shows bars at timestamps where data exists (sparse)
 * - 10 bars visible at a time with horizontal scrolling
 * - Categorical X-axis (string labels, not continuous time)
 * - Auto-scrolls to latest when new data arrives (only if user is at latest)
 * - Handles device-off gaps cleanly (no empty bars)
 */

import React from 'react';
import { ScrollView, View, Text, TouchableOpacity } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { CartesianChart, Bar } from 'victory-native';
import { useFont } from '@shopify/react-native-skia';
import { normalizeSparseCategoricalData, getVisibleSlice, getScrollToLatestPosition, isAtLatestPosition } from '@/utils/sparseCategoricalData';

const CHART_HEIGHT = 320;
const CHART_PADDING = { left: 40, right: 20, top: 20, bottom: 40 };

/**
 * Sparse Categorical Bar Chart Component for Day View
 * 
 * Usage in stress-insights.tsx:
 * 
 * {selectedPeriod === 'Day' && (
 *   <SparseCategoricalBarChart
 *     graphData={graphData}
 *     skiaFont={skiaFont}
 *     onBarSelect={setSelectedBar}
 *   />
 * )}
 */
export function SparseCategoricalBarChart({
  graphData,
  skiaFont,
  onBarSelect,
}: {
  graphData: {
    points: Array<{ x: number; y: number }>;
    xDomain: [number, number];
    yDomain: [number, number];
  } | null;
  skiaFont: ReturnType<typeof useFont>;
  onBarSelect?: (bar: {
    x: number;
    y: number;
    value: number;
    timestamp: number;
    label: string;
  } | null) => void;
}) {
  const scrollViewRef = React.useRef<ScrollView>(null);
  const [scrollOffset, setScrollOffset] = React.useState(0);
  const [isUserScrolling, setIsUserScrolling] = React.useState(false);
  const [isAtLatest, setIsAtLatest] = React.useState(true);

  // Normalize raw data into sparse categorical dataset
  const sparseDataset = React.useMemo(() => {
    if (!graphData?.points || graphData.points.length === 0) {
      return { points: [], totalBars: 0, barWidth: 60, chartWidth: 600 };
    }
    return normalizeSparseCategoricalData(graphData.points);
  }, [graphData]);

  // Get visible slice (10 bars)
  const visibleSlice = React.useMemo(() => {
    return getVisibleSlice(sparseDataset, scrollOffset);
  }, [sparseDataset, scrollOffset]);

  // Auto-scroll to latest when new data arrives (only if user is at latest)
  React.useEffect(() => {
    if (sparseDataset.points.length > 0) {
      const atLatest = isAtLatestPosition(scrollOffset, sparseDataset);
      setIsAtLatest(atLatest);

      if (atLatest && !isUserScrolling) {
        // Auto-scroll to latest
        const latestPosition = getScrollToLatestPosition(sparseDataset);
        scrollViewRef.current?.scrollTo({
          x: latestPosition,
          animated: true,
        });
        setScrollOffset(latestPosition);
      }
    }
  }, [sparseDataset.points.length, scrollOffset, isUserScrolling]);

  // Scroll handlers
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset = event.nativeEvent.contentOffset.x;
    setScrollOffset(offset);
    const atLatest = isAtLatestPosition(offset, sparseDataset);
    setIsAtLatest(atLatest);
  };

  const handleScrollBeginDrag = () => {
    setIsUserScrolling(true);
  };

  const handleScrollEndDrag = () => {
    setIsUserScrolling(false);
  };

  // Chart data for Victory (categorical X-axis)
  const chartData = React.useMemo(() => {
    return visibleSlice.visiblePoints.map((point) => ({
      x: point.x, // Categorical label (e.g., "10:09 AM")
      y: point.y, // Stress value
      timestamp: point.timestamp, // For tooltip
      index: point.index,
    }));
  }, [visibleSlice]);

  // Categorical domain (only show labels for visible points)
  const xDomain = React.useMemo(() => {
    if (chartData.length === 0) return undefined;
    return {
      x: chartData.map((d) => d.x), // Array of categorical labels
      y: [0, 100] as [number, number],
    };
  }, [chartData]);

  if (!graphData || graphData.points.length === 0) {
    return (
      <View style={{ height: CHART_HEIGHT, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>
          No stress data available
        </Text>
      </View>
    );
  }

  return (
    <View style={{ height: CHART_HEIGHT }}>
      {/* Horizontal ScrollView wrapper */}
      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={handleScrollEndDrag}
        scrollEventThrottle={16}
        contentContainerStyle={{
          width: sparseDataset.chartWidth,
          height: CHART_HEIGHT,
        }}
      >
        <View style={{ width: sparseDataset.chartWidth, height: CHART_HEIGHT }}>
          <CartesianChart
            data={chartData}
            xKey="x"
            yKeys={['y']}
            padding={CHART_PADDING}
            domain={xDomain}
            xAxis={{
              font: skiaFont,
              tickCount: Math.min(10, chartData.length),
              labelColor: 'rgba(199,214,255,0.75)',
              lineColor: 'rgba(255,255,255,0.08)',
              labelOffset: 4,
              formatXLabel: (label) => label, // Already formatted as categorical
            }}
            yAxis={[
              {
                font: skiaFont,
                tickCount: 4,
                labelColor: 'rgba(199,214,255,0.75)',
                lineColor: 'rgba(255,255,255,0.08)',
                labelOffset: 4,
                formatYLabel: (label) => `${Math.round(Number(label))}`,
              },
            ]}
            transformConfig={{
              pinch: { enabled: false },
              pan: { enabled: false },
            }}
          >
            {({ points, chartBounds }) => {
              if (!points?.y || !chartBounds || !Array.isArray(points.y)) {
                return null;
              }

              // Filter points with valid data (y > 0)
              const pointsWithData = points.y.filter((p: any) => p && p.y > 0);

              if (pointsWithData.length === 0) {
                return null;
              }

              return (
                <Bar
                  points={pointsWithData}
                  chartBounds={chartBounds}
                  color="#7EA6FF"
                  roundedCorners={{ topLeft: 8, topRight: 8 }}
                  innerPadding={0.3}
                  barCount={pointsWithData.length}
                />
              );
            }}
          </CartesianChart>
        </View>
      </ScrollView>

      {/* "New data available" indicator (when user scrolls away from latest) */}
      {!isAtLatest && sparseDataset.points.length > 10 && (
        <TouchableOpacity
          style={{
            position: 'absolute',
            bottom: 20,
            right: 20,
            backgroundColor: '#7EA6FF',
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 20,
          }}
          onPress={() => {
            const latestPosition = getScrollToLatestPosition(sparseDataset);
            scrollViewRef.current?.scrollTo({
              x: latestPosition,
              animated: true,
            });
            setScrollOffset(latestPosition);
            setIsAtLatest(true);
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>
            New data →
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
