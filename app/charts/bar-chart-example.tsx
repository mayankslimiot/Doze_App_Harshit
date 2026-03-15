/**
 * Simple Example: Bar Chart with Bordered Bars
 * 
 * This example demonstrates how to add borders to bars in Victory Native
 * using the stroke and strokeWidth props directly on the Bar component.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { CartesianChart, Bar } from 'victory-native';
import { useFont } from '@shopify/react-native-skia';

export function BorderedBarChartExample() {
  const skiaFont = useFont(require('../../assets/fonts/SpaceMono-Regular.ttf'), 9);

  // Sample data
  const chartData = [
    { x: 0, y: 20 },
    { x: 1, y: 45 },
    { x: 2, y: 30 },
    { x: 3, y: 60 },
    { x: 4, y: 40 },
  ];

  return (
    <View style={styles.container}>
      <CartesianChart
        data={chartData}
        xKey="x"
        yKeys={['y']}
        padding={{ left: 40, right: 20, top: 20, bottom: 40 }}
        domain={{
          x: [-0.5, 4.5],
          y: [0, 100],
        }}
        xAxis={{
          font: skiaFont,
          tickCount: 5,
          labelColor: 'rgba(199,214,255,0.75)',
          lineColor: 'rgba(255,255,255,0.08)',
          labelOffset: 4,
        }}
        yAxis={[
          {
            font: skiaFont,
            tickCount: 5,
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

          return (
            <Bar
              points={points.y}
              chartBounds={chartBounds}
              // Fill color for the bar
              color="#7EE3A1"
              // Border color (stroke)
              stroke="#5BCA7A"
              // Border thickness
              strokeWidth={2}
              // Rounded corners
              roundedCorners={{ topLeft: 8, topRight: 8 }}
              // Spacing between bars
              innerPadding={0.3}
              // Total number of bars
              barCount={5}
            />
          );
        }}
      </CartesianChart>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 300,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    padding: 16,
  },
});
