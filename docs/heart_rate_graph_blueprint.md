# Blueprint: Advanced Heart Rate Tracking System
## (Day, Week, Month Support)

This blueprint contains the complete architecture and code snippets required to implement an enterprise-grade vitals tracking system.

---

## 1. Data Processing Logic (The "Brain")

The most critical part of the Day view is **Aggregation**. You cannot render 86,400 points (1 per second) directly on a chart. This utility buckets data into intervals.

### `aggregateHeartRate.ts`
```typescript
interface RawPoint { timestamp: number; value: number | null; }
interface AggregatedPoint { x: number; y: number | null; }

/**
 * Aggregates raw heart rate points into buckets for visualization.
 * Handles gaps (null values) and dynamic time ranges.
 */
export function aggregateData(
  points: RawPoint[],
  intervalSec: number,
  rangeSec: number
): { points: AggregatedPoint[]; xDomain: [number, number] } {
  const now = Date.now();
  const startTime = now - rangeSec * 1000;
  
  // 1. Filter points in range
  const validPoints = points.filter(p => p.timestamp >= startTime);
  
  // 2. Group into buckets
  const buckets = new Map<number, number[]>();
  validPoints.forEach(p => {
    const bucketStart = Math.floor(p.timestamp / (intervalSec * 1000)) * (intervalSec * 1000);
    if (!buckets.has(bucketStart)) buckets.set(bucketStart, []);
    if (p.value !== null) buckets.get(bucketStart)!.push(p.value);
  });

  // 3. Calculate Averages
  const aggregatedPoints = Array.from(buckets.entries()).map(([time, vals]) => ({
    x: time + (intervalSec * 1000) / 2,
    y: vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b) / vals.length) : null
  })).sort((a, b) => a.x - b.x);

  return { points: aggregatedPoints, xDomain: [startTime, now] };
}
```

---

## 2. Frontend UI (Victory Native V2)

### Day View: Line/Area Chart
Uses `skia-based` rendering for smooth anti-aliased lines and gradients.

```tsx
<CartesianChart
  data={data}
  xKey="x"
  yKeys={["y"]}
  domain={{ x: xDomain, y: [40, 180] }}
  padding={{ left: 5, right: 10, top: 10, bottom: 30 }}
>
  {({ points, chartBounds }) => (
    <>
      <Area 
        points={points.y} 
        y0={chartBounds.bottom} 
        curveType="natural"
        connectMissingData={false}
      >
        <LinearGradient
          start={vec(0, 0)}
          end={vec(0, chartBounds.bottom)}
          colors={["#0097B240", "#0097B200"]}
        />
      </Area>
      <Line 
        points={points.y} 
        color="#0097B2" 
        strokeWidth={2.5} 
        curveType="natural" 
        connectMissingData={false}
      />
    </>
  )}
</CartesianChart>
```

### Week/Month View: Bar Chart
Used for historical comparisons (7-day or 30-day).

```tsx
<CartesianChart
  data={weeklyData}
  xKey="day"
  yKeys={["avg"]}
  domainPadding={{ x: 10 }}
>
  {({ points, chartBounds }) => (
    <Bar
      points={points.avg}
      chartBounds={chartBounds}
      color="#0097B2"
      roundedCorners={{ topLeft: 6, topRight: 6 }}
      innerPadding={0.4}
      barCount={weeklyData.length}
    />
  )}
</CartesianChart>
```

---

## 3. Backend Implementation (Node.js + MongoDB)

### Weekly Aggregation Strategy
This pipeline calculates one average point per day for a 7-day period.

```javascript
router.get('/weekly/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const start = new Date(req.query.startDate);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);

    const weeklyData = await Vitals.aggregate([
      {
        $match: {
          babyId: id,
          timestamp: { $gte: start, $lt: end },
          heartRate: { $gt: 0 }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
          avgHeartRate: { $avg: "$heartRate" },
          minHeartRate: { $min: "$heartRate" },
          maxHeartRate: { $max: "$heartRate" }
        }
      },
      { $sort: { "_id": 1 } }
    ]);

    res.json({ success: true, data: weeklyData });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});
```

---

## 4. Key Performance Guidelines

1.  **Indexing**: Always index `{ deviceId: 1, timestamp: -1 }`. Without this, history queries will time out after 1 month of data.
2.  **Lean Queries**: In Node.js, use `.lean().select('heartRate timestamp -_id')` to reduce JSON payload size by up to 60%.
3.  **Hot-Buffer Architecture**: Instead of updating state on every WebSocket packet, push data to a non-reactive buffer array. Use a `throttle` or `requestAnimationFrame` to update the chart state every 300-500ms to maintain 60 FPS UI performance.
4.  **Gap Handling**: Ensure your aggregation code adds `null` points for gaps in data (e.g., when the device is off). This prevents the Line chart from "jumping" across missing time periods.
