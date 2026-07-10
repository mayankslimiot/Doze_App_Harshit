# Heart Rate Graph — Gap Detection Logic

> **Purpose:** This document is the single source of truth for how the Slimtrack / Doze app detects, stores, propagates, and renders **gaps** in the heart rate graph.  
> Every layer — hardware → MQTT → database → API → WebSocket → frontend buffer → aggregation → chart rendering — is described **exactly** as implemented.  
> If any AI or developer reads this document, they must be able to reproduce the behaviour with zero ambiguity.

---

## Table of Contents

1. [Glossary](#1-glossary)
2. [Architecture Overview](#2-architecture-overview)
3. [Layer 1 — Hardware Signals (MQTT Ingestion)](#3-layer-1--hardware-signals-mqtt-ingestion)
4. [Layer 2 — Database Storage](#4-layer-2--database-storage)
5. [Layer 3 — Backend Aggregation (Graph API)](#5-layer-3--backend-aggregation-graph-api)
6. [Layer 4 — WebSocket Broadcast (Live Updates)](#6-layer-4--websocket-broadcast-live-updates)
7. [Layer 5 — Frontend Raw Data Buffer](#7-layer-5--frontend-raw-data-buffer)
8. [Layer 6 — Frontend Aggregation (Bucketing + Gap Fill)](#8-layer-6--frontend-aggregation-bucketing--gap-fill)
9. [Layer 7 — DayGraphManager (Orchestration)](#9-layer-7--daygraphmanager-orchestration)
10. [Layer 8 — Chart Rendering (Victory Native)](#10-layer-8--chart-rendering-victory-native)
11. [Zoom Levels & Interval Configuration](#11-zoom-levels--interval-configuration)
12. [End-to-End Data Flow Diagram](#12-end-to-end-data-flow-diagram)
13. [Rules & Invariants (NEVER VIOLATE)](#13-rules--invariants-never-violate)
14. [Common Mistakes & Anti-Patterns](#14-common-mistakes--anti-patterns)

---

## 1. Glossary

| Term | Meaning |
|------|---------|
| **HV** | Heart Validity flag from hardware sensor. `1` = valid heart rate reading. `0` = sensor cannot determine heart rate (gap). |
| **AS** | Absence Start (human presence flag). `1` = person present on bed. `0` = person absent. Used **only** for bed status, **NOT** for heart rate gap logic. |
| **HR** | Heart Rate value from sensor (in BPM). `0` = invalid/unavailable. |
| **Gap** | A period where no valid heart rate data exists. Represented as `null` in all layers. |
| **Gap Bucket** | An aggregation bucket where all raw points have `value: null`. The bucket itself outputs `y: null`. |
| **Short Stream** | An MQTT packet containing only `{ TS, AS, HV }` fields — no sensor data. All health fields saved as `null`. |
| **Zoom Level** | A predefined time range + aggregation interval configuration. 8 levels from 10m to 24h. |
| **Buffer** | Frontend in-memory 24-hour sliding window of raw heart rate points (`heartRateBuffer.ts`). |
| **Bucket** | A time interval used for aggregation. Points within the same bucket are averaged. |

---

## 2. Architecture Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                        HARDWARE SENSOR                             │
│  Sends: { TS, T, H, HR, HV, AS, V, ... } via MQTT                │
│  Gap condition: HV=0 OR HR=0 OR short stream (only TS/AS/HV)     │
└──────────────────────┬─────────────────────────────────────────────┘
                       │ MQTT
                       ▼
┌────────────────────────────────────────────────────────────────────┐
│                  BACKEND (mqttService.js)                           │
│  Rule: If HV=0 OR HR=0 → save heartRate = null                    │
│  Rule: Short stream → ALL health fields = null                     │
│  Rule: AS is NOT checked for heart rate gaps                       │
│  Saves to: MongoDB (HealthData collection)                         │
│  Broadcasts: health_data_update via WebSocket (null preserved)     │
└──────────────────────┬─────────────────────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          │ API Fetch   │ WebSocket  │
          ▼             ▼            │
┌─────────────────┐ ┌───────────────┴──┐
│ Graph API       │ │ Live WS Events   │
│ (history.js)    │ │ heart_data_update │
│ Returns raw     │ │ heartRate: null   │
│ points with     │ │ preserved as-is   │
│ y: null gaps    │ │                   │
└────────┬────────┘ └────────┬─────────┘
         │                   │
         ▼                   ▼
┌────────────────────────────────────────────────────────────────────┐
│              FRONTEND RAW BUFFER (heartRateBuffer.ts)              │
│  24-hour sliding window. Stores { timestamp, value: number|null }  │
│  null = gap. Value range: (0, 250) exclusive. 0 rejected.         │
│  Deduplication on (timestamp, value). Sorted by timestamp.         │
└──────────────────────┬─────────────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────────────┐
│       FRONTEND AGGREGATION (heartRateAggregation.ts)               │
│  Groups raw points into buckets based on zoom-level intervalSec    │
│  Bucket rule:                                                      │
│    - ≥1 valid HR → y = average of valid values                     │
│    - ALL null    → y = null (gap bucket)                           │
│  Gap filling:                                                      │
│    - If gap between consecutive buckets > (intervalMs × 2)         │
│    - Insert null buckets at intervalMs spacing to fill the gap      │
│  Output: { x: bucketCenterMs, y: number|null }[]                  │
└──────────────────────┬─────────────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────────────┐
│           CHART RENDERING (Victory Native CartesianChart)           │
│  Line component with connectMissingData: false                     │
│  null y-values → line breaks (visual gap in chart)                 │
│  Only non-null values used for Y-axis domain calculation           │
└────────────────────────────────────────────────────────────────────┘
```

---

## 3. Layer 1 — Hardware Signals (MQTT Ingestion)

**File:** `backend/services/mqttService.js`

### 3.1 Gap Detection Conditions

Heart rate is set to `null` (gap) when **ANY** of these conditions is true:

| Condition | Meaning |
|-----------|---------|
| `HV === 0` | Sensor cannot validate a heart rate reading |
| `HR === 0` | Heart rate value is zero (invalid) |
| `HR === null` | Heart rate field is explicitly null |
| **Short stream** | MQTT packet contains only `{ TS, AS, HV }` — no sensor data at all |

### 3.2 Critical Rule: AS Is NOT Checked

```
// ✅ CORRECT: Only HV and HR determine gaps
if ((hvValue === 0) || (hrValue === 0) || (hrValue === null)) {
    fieldsToSet.heartRate = null;  // GAP
}

// ❌ WRONG: Never check AS for heart rate gaps
// AS is ONLY for bed status (Occupied/Vacant), NOT heart rate validity
```

**Why:** AS (Absence Start) indicates whether a person is on the bed. A person can be absent from bed (AS=0) but the sensor may still have residual readings. Conversely, a person can be on bed (AS=1) but the sensor cannot lock onto a heart rate (HV=0). These are independent signals.

### 3.3 Short Stream Handling

When the MQTT payload contains only `{ TS, AS, HV }` (no HR, T, H, V, etc.):
- **All health fields** are saved as `null` — including `heartRate: null`
- This happens when no human is detected by the sensor
- The document is still saved to the database (it's not skipped)

### 3.4 Code References (mqttService.js)

**v2 wrapped stream (lines 634–650):**
```javascript
// ✅ CRITICAL: Handle heartRate gaps (HV=0 only, NOT AS)
const hvValue = cleanData.HV !== undefined ? Number(cleanData.HV) : undefined;
const hrValue = mappedData.heartRate !== undefined ? Number(mappedData.heartRate) : undefined;

// If HV=0 or HR=0, set heartRate to null (gap)
if ((hvValue === 0) || (hrValue === 0) || (hrValue === null)) {
    fieldsToSet.heartRate = null;    // Explicitly set heartRate to null for gaps
    delete validMappedFields.heartRate; // Prevent overwrite
}
```

**Short stream (lines 502–581):**
```javascript
if (isShortStream) {
    // Save ALL fields as null
    const fieldsToSet = {
        heartRate: null,
        respiration: null,
        temperature: null,
        humidity: null,
        // ... all other health fields = null
    };
}
```

---

## 4. Layer 2 — Database Storage

**Collection:** `HealthData` (MongoDB)

### 4.1 Schema Representation

```javascript
{
    deviceId: "DEVICE_001",
    timestamp: ISODate("2026-03-25T14:00:00Z"),
    heartRate: null,          // ← GAP: stored as null, NOT 0, NOT missing
    respiration: null,
    absenceStart: 0,          // AS field (for bed status)
    // ... other fields
}
```

### 4.2 Critical Rules

| Rule | Details |
|------|---------|
| `heartRate: null` | MUST be explicitly `null`, never `0`, never missing/undefined |
| `heartRate: 0` | Is **never** saved. `0` is converted to `null` at ingestion |
| Valid range | `0 < heartRate < 250` (exclusive). Anything outside → rejected or null |
| Gap records ARE saved | Short streams and HV=0 packets create real DB documents with `heartRate: null` |

---

## 5. Layer 3 — Backend Aggregation (Graph API)

**File:** `backend/utils/graphAggregation.js`

### 5.1 API Fetch Query

When the frontend requests graph data (initial load or historical day):

```javascript
// Fetch last 24 hours INCLUDING null values (gaps)
const rawData = await HealthData.find({
    deviceId: deviceId,
    timestamp: { $gte: twentyFourHoursAgo, $lte: now },
    $or: [
        { heartRate: null },              // ← Include gap records
        { heartRate: { $gt: 0, $lt: 250 } }, // Include valid HR
    ]
}).sort({ timestamp: 1 }).lean().limit(10000);
```

**Key:** The query **explicitly includes** `heartRate: null` documents. Gaps are NOT filtered out.

### 5.2 Backend Downsampling (Aggregation)

```javascript
function downsampleData(dataPoints, intervalSec) {
    const intervalMs = intervalSec * 1000;
    const buckets = new Map();

    // Group into time buckets
    dataPoints.forEach((point) => {
        const bucketKey = Math.floor(point.timestamp / intervalMs) * intervalMs;
        buckets.get(bucketKey).push(point.value); // value can be null
    });

    // Aggregate each bucket with GAP HANDLING
    return Array.from(buckets.entries()).map(([timestamp, values]) => {
        const validValues = values.filter(v => v !== null && v > 0);
        
        if (validValues.length > 0) {
            // ≥1 valid HR → compute average
            return {
                timestamp: timestamp + intervalMs / 2, // Bucket center
                value: validValues.reduce((s, v) => s + v, 0) / validValues.length,
            };
        } else {
            // ALL null → gap bucket
            return {
                timestamp: timestamp + intervalMs / 2,
                value: null, // ← EXPLICIT GAP
            };
        }
    });
}
```

### 5.3 Bucket Aggregation Rule (CRITICAL)

| Bucket Contents | Output |
|----------------|--------|
| 1+ valid HR values (e.g., `[72, null, 75]`) | `y = average of valid values` (73.5) |
| ALL null values (e.g., `[null, null, null]`) | `y = null` (gap bucket) |
| Empty bucket (no points fall in this interval) | Bucket does not exist in output |

### 5.4 API Response Format

```json
{
    "points": [
        { "x": 1711360800000, "y": 72 },
        { "x": 1711360806000, "y": null },
        { "x": 1711360812000, "y": null },
        { "x": 1711360818000, "y": 68 }
    ],
    "xDomain": [1711357200000, 1711360800000],
    "yDomain": [40, 150],
    "zoomLevel": { "index": 0, "label": "10m", "rangeSec": 600 }
}
```

- `y: null` points are included in the response — they represent gaps
- `yDomain` is calculated from **non-null values only**

---

## 6. Layer 4 — WebSocket Broadcast (Live Updates)

**File:** `backend/services/websocketService.js`

### 6.1 Null Preservation Rule

```javascript
const clientData = {
    deviceId: healthData.deviceId,
    timestamp: healthData.timestamp,
    heartRate: healthData.heartRate, // ✅ null values preserved (gaps)
    // ...
};
io.to(roomName).emit("health_data_update", clientData);
```

**Rule:** `heartRate: null` is forwarded **exactly as-is** to the frontend. It is **never** converted to `0`, never omitted, never replaced.

### 6.2 Frontend WebSocket Handler

**File:** `hooks/useHeartRateRingBuffer.ts`

```javascript
// Handle null values (gaps) and valid heart rate values
let processedValue: number | null = null;

if (heartRateValue === null) {
    processedValue = null;        // Explicit null from backend = gap
} else if (heartRateValue === 0) {
    processedValue = null;        // 0 is invalid, treat as gap
} else if (Number.isFinite(heartRateValue) && heartRateValue > 0 && heartRateValue < 250) {
    processedValue = Number(heartRateValue); // Valid heart rate
} else {
    return; // Invalid value, skip entirely (don't even store)
}
```

| Received Value | Action |
|---------------|--------|
| `null` | Store as `null` (gap) |
| `0` | Convert to `null` (gap) — 0 is invalid HR |
| `1–249` | Store as valid number |
| `≥ 250` or negative | Skip entirely (don't store) |
| Non-finite (NaN, Infinity) | Skip entirely |

---

## 7. Layer 5 — Frontend Raw Data Buffer

**File:** `services/heartRateBuffer.ts`

### 7.1 Buffer Design

```typescript
interface RawHeartRatePoint {
    timestamp: number;      // Unix timestamp in milliseconds
    value: number | null;   // Heart rate in BPM, null = gap (HV=0 or AS=0)
}
```

| Property | Details |
|----------|---------|
| Window | 24-hour sliding window (`BUFFER_WINDOW_MS = 86,400,000 ms`) |
| Storage | In-memory `Map<string, RawHeartRatePoint[]>` per device |
| Ordering | Always sorted by timestamp (binary search insertion) |
| Dedup | Skip if `(timestamp === last.timestamp && value === last.value)` |
| Cleanup | Points older than 24h auto-removed on each `addRawPoint()` call |

### 7.2 addRawPoint Validation

```typescript
export function addRawPoint(deviceId: string, timestamp: number, value: number | null): void {
    // Reject invalid timestamps
    if (!deviceId || !Number.isFinite(timestamp)) return;
    
    // null is valid (gap), but reject invalid numbers
    if (value !== null && (!Number.isFinite(value) || value <= 0 || value >= 250)) return;
    
    // ... insert into sorted buffer, deduplicate, notify subscribers
}
```

### 7.3 Buffer Population Sources

| Source | When | Method |
|--------|------|--------|
| **API hydration** | App launch / screen focus | `dayGraphManager.prepareDayGraph()` fetches 24h from API, calls `addRawPoint()` for each |
| **WebSocket live** | Real-time | `useHeartRateRingBuffer` hook processes `health_data_update` events, calls `addRawPoint()` |
| **Background resume** | App comes to foreground | `dayGraphManager.backfillFromApi()` clears buffer, re-fetches 24h, calls `addRawPoint()` for each |

---

## 8. Layer 6 — Frontend Aggregation (Bucketing + Gap Fill)

**File:** `utils/heartRateAggregation.ts`

This is the **most critical** layer for gap rendering. It takes raw buffer points and produces chart-ready data.

### 8.1 Step-by-Step Algorithm

#### Step 1: Filter to 24-Hour Window

```typescript
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const dataEndTime = rawPoints[rawPoints.length - 1].timestamp;
const dataStartTime = dataEndTime - TWENTY_FOUR_HOURS_MS;
const windowPoints = rawPoints.filter(p => p.timestamp >= dataStartTime && p.timestamp <= dataEndTime);
```

#### Step 2: Group into Time Buckets

Each raw point is placed into a bucket based on the zoom level's `intervalSec`:

```typescript
const intervalMs = zoomLevel.intervalSec * 1000;

for (const point of windowPoints) {
    const bucketStart = Math.floor(point.timestamp / intervalMs) * intervalMs;
    buckets.get(bucketStart).push(point.value); // value can be null
}
```

#### Step 3: Aggregate Each Bucket

```typescript
for (const [bucketStart, values] of sortedBuckets) {
    const validPoints = values.filter(v => v !== null); // Get non-null values
    
    if (validPoints.length > 0) {
        // Bucket has ≥1 valid HR → average of valid values only
        const avg = validPoints.reduce((sum, v) => sum + v, 0) / validPoints.length;
        aggregatedPoints.push({
            x: bucketStart + intervalMs / 2,  // Bucket CENTER timestamp
            y: Math.round(avg),
        });
    } else {
        // Bucket has ONLY null values → gap bucket
        aggregatedPoints.push({
            x: bucketStart + intervalMs / 2,
            y: null, // ← EXPLICIT GAP INDICATOR
        });
    }
}
```

#### Step 4: Gap Filling Between Consecutive Buckets (CRITICAL)

After aggregation, there may be **empty** time ranges where no buckets exist at all (e.g., device was off for 2 hours). These are detected and filled with null buckets.

```typescript
const gapThreshold = intervalMs * 2; // Gap = 2× bucket interval

for (let i = 0; i < sortedPoints.length; i++) {
    filledPoints.push(sortedPoints[i]); // Add current point
    
    if (i < sortedPoints.length - 1) {
        const gap = sortedPoints[i + 1].x - sortedPoints[i].x;
        
        if (gap > gapThreshold) {
            // Gap detected! Fill with null buckets at regular intervals
            const bucketsToFill = Math.floor(gap / intervalMs) - 1;
            
            for (let j = 1; j <= bucketsToFill; j++) {
                const nullBucketX = sortedPoints[i].x + (j * intervalMs);
                if (nullBucketX < sortedPoints[i + 1].x) {
                    filledPoints.push({
                        x: nullBucketX,
                        y: null, // ← Gap fill bucket
                    });
                }
            }
        }
    }
}
```

### 8.2 Gap Detection Summary

| Gap Type | How Detected | How Handled |
|----------|-------------|-------------|
| **Raw null values** (HV=0, HR=0) | Raw buffer point has `value: null` | Bucket with only nulls → `y: null` |
| **Missing time ranges** (device offline) | Gap between consecutive buckets > `intervalMs × 2` | Insert null-valued buckets at `intervalMs` spacing to fill |
| **Mixed bucket** (some null, some valid) | Bucket has both null and valid values | Average of **valid values only** → `y: average` (NOT null) |

### 8.3 Y-Domain Calculation

```typescript
// Only non-null values contribute to Y-axis domain
const allValues = filledPoints.map(p => p.y).filter(v => v !== null && v > 0);
let yMin = 40, yMax = 150; // Default range

if (allValues.length > 0) {
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const padding = Math.max(10, (max - min) * 0.1);
    yMin = Math.max(40, Math.floor(min - padding));
    yMax = Math.min(150, Math.ceil(max + padding));
}
```

---

## 9. Layer 7 — DayGraphManager (Orchestration)

**File:** `services/dayGraphManager.ts`

### 9.1 Responsibilities

| Responsibility | Details |
|---------------|---------|
| Buffer hydration | Fetches 24h from API, populates `heartRateBuffer` |
| Aggregation trigger | Calls `aggregateHeartRate()` whenever buffer changes or zoom changes |
| Subscriber notification | Pushes graph data to UI subscribers |
| Graph-NULL handling | If ALL aggregated points are null → `graphData = null` (don't form graph) |
| Zoom state | Tracks current zoom index per device, re-aggregates on change |

### 9.2 Graph Formation Rule

```typescript
// Check if there are any valid (non-null) points
const hasValidPoints = aggregated.points.some(p => p.y !== null && p.y !== undefined);

if (!hasValidPoints) {
    // Only NULL values exist → don't form the graph
    state.graphData = null;  // UI shows "No data" instead of empty chart
    return;
}
```

### 9.3 X-Domain Anchoring (Live Mode)

```typescript
// Use latest VALID (non-null) heart rate timestamp
// This prevents the graph viewport from advancing when receiving null values
let latestTimestamp: number;
for (let i = rawPoints.length - 1; i >= 0; i--) {
    if (rawPoints[i].value !== null && rawPoints[i].value !== undefined) {
        latestTimestamp = rawPoints[i].timestamp;
        break;
    }
}
```

**Why:** If the device starts sending null values (person left), the graph viewport should NOT keep scrolling right. It freezes at the last valid data point.

### 9.4 Background Resume

```typescript
export async function backfillFromApi(deviceId: string): Promise<void> {
    clearBufferData(deviceId);  // Clear buffer but keep subscribers
    const result = await getHeartRateGraph(deviceId, 0, true); // Fetch 24h raw
    
    for (const point of result.data.points) {
        const y = point.y;
        addRawPoint(deviceId, point.x, typeof y === 'number' ? y : null);
        // ↑ null values from API are properly inserted as gaps
    }
    
    notifyBufferState(deviceId); // Trigger graph re-aggregation
}
```

---

## 10. Layer 8 — Chart Rendering (Victory Native)

**File:** `app/charts/heart-rate-insights.tsx`

### 10.1 Chart Data Format

```typescript
const chartData = graphData.points;
// Format: [{ x: timestamp, y: heartRate|null }, ...]
```

### 10.2 How Null Values Render

Victory Native's `<Line>` component with `connectMissingData: false` (default behavior):

- When `y: null` is encountered → the line **breaks** at that point
- The chart shows a visible **gap** (empty space) where null values exist
- The line resumes when the next non-null value appears

### 10.3 Tooltip Behavior on Gaps

```typescript
// Get latest point for tooltip — skip null values
const latestPoint = React.useMemo(() => {
    if (graphData?.points) {
        // Find the last NON-NULL point (skip gaps)
        for (let i = graphData.points.length - 1; i >= 0; i--) {
            if (graphData.points[i].y !== null && graphData.points[i].y !== undefined) {
                return { timestamp: graphData.points[i].x, value: graphData.points[i].y };
            }
        }
    }
    return null;
}, [graphData]);
```

**Rule:** Tooltip always shows the last **valid** heart rate, not "null" or "--" for the latest reading.

### 10.4 Metrics Calculation (Min/Avg/Max)

```typescript
// Only non-null, non-zero values are used for metrics
const filtered = rawPoints.filter(
    p => p.timestamp >= windowStart && p.timestamp <= windowEnd 
      && p.value != null && p.value > 0
);
const values = filtered.map(p => p.value);
```

Null values are **excluded** from min/average/max calculations.

---

## 11. Zoom Levels & Interval Configuration

**Files:** `utils/zoomLevels.ts` (frontend), `backend/config/zoomLevels.js` (backend)

Both files MUST stay in sync. They are the single source of truth for aggregation intervals.

| Index | Label | Range (sec) | Interval (sec) | Max Points | Gap Threshold |
|-------|-------|-------------|-----------------|------------|---------------|
| 0 | 10m | 600 | 6 | 120 | 12s (2 × 6s) |
| 1 | 30m | 1,800 | 18 | 120 | 36s (2 × 18s) |
| 2 | 1h | 3,600 | 36 | 120 | 72s (2 × 36s) |
| 3 | 2h | 7,200 | 72 | 120 | 144s (2 × 72s) |
| 4 | 4h | 14,400 | 144 | 120 | 288s (2 × 144s) |
| 5 | 8h | 28,800 | 288 | 120 | 576s (2 × 288s) |
| 6 | 12h | 43,200 | 432 | 120 | 864s (2 × 432s) |
| 7 | 24h | 86,400 | 864 | 120 | 1,728s (2 × 864s) |

**Gap Threshold** = `intervalSec × 2`. If the gap between two consecutive aggregated buckets exceeds this, null buckets are inserted to fill it.

**Bucket Timestamp** = `bucketStartMs + (intervalMs / 2)` — always the **center** of the bucket.

---

## 12. End-to-End Data Flow Diagram

```
[Sensor] HV=0, HR=0
    │
    ▼
[MQTT] mqttService.js
    │  Rule: HV=0 || HR=0 || shortStream → heartRate = null
    │
    ▼
[MongoDB] HealthData { heartRate: null }
    │
    ├──────────────────────────────┐
    │                              │
    ▼                              ▼
[API Fetch]                    [WebSocket]
getHeartRateGraph()           health_data_update
Returns points with           { heartRate: null }
y: null                       forwarded as-is
    │                              │
    └──────────────┬───────────────┘
                   │
                   ▼
[heartRateBuffer.ts] addRawPoint(deviceId, ts, null)
    │  24h sliding window, null = gap marker
    │
    ▼
[heartRateAggregation.ts]
    │  Step 1: Group into buckets by intervalSec
    │  Step 2: All-null bucket → y: null
    │  Step 3: Gap > 2×interval → insert null fill buckets
    │
    ▼
[dayGraphManager.ts]
    │  If ALL points null → graphData = null (no chart)
    │  X-domain anchored to last VALID (non-null) point
    │
    ▼
[Victory Native <Line>]
    │  y: null → line breaks (visual gap)
    │  connectMissingData = false (default)
    │
    ▼
[User sees gaps in heart rate chart]
```

---

## 13. Rules & Invariants (NEVER VIOLATE)

### Backend Rules

1. **HV determines HR validity, NOT AS.** AS is only for bed status (`Occupied`/`Vacant`).
2. **HR=0 is always converted to null.** The value `0` is never stored for `heartRate`.
3. **Short streams (only TS/AS/HV) save ALL health fields as null**, including `heartRate: null`.
4. **Null values are included in API queries.** The MongoDB query uses `$or: [{ heartRate: null }, { heartRate: { $gt: 0, $lt: 250 } }]`.
5. **WebSocket broadcasts null heartRate as-is.** Never convert null to 0 during broadcast.

### Frontend Buffer Rules

6. **`value: null` is a valid buffer entry** — it represents a gap, not missing data.
7. **HR=0 from WebSocket is converted to null** at the handler level (`useHeartRateRingBuffer.ts`).
8. **Valid HR range is `(0, 250)` exclusive.** Values ≤ 0 or ≥ 250 are rejected (never stored).
9. **Buffer is sorted by timestamp.** New points use binary search for insertion.
10. **Deduplication:** Skip if last point has identical `(timestamp, value)`.

### Aggregation Rules

11. **Bucket with ≥1 valid HR → average of valid values.** Null values in the bucket are ignored for averaging.
12. **Bucket with ALL null → `y: null`.** This is a gap bucket.
13. **Gap threshold = `intervalMs × 2`.** If gap between consecutive buckets exceeds this, fill with null buckets.
14. **Fill buckets have `y: null`** and are spaced at `intervalMs` intervals.
15. **Bucket timestamp = bucket center** (`bucketStartMs + intervalMs / 2`).
16. **Y-domain uses only non-null values.** Null points never affect yMin/yMax calculation.

### Chart Rendering Rules

17. **`y: null` → line break in Victory Native.** The line does not connect across null points.
18. **Latest tooltip shows last VALID (non-null) HR.** Gaps are skipped when finding the latest value.
19. **Metrics (min/avg/max) exclude null values.** Only valid HR values contribute.
20. **X-domain anchored to last valid HR** in live mode. Null values don't advance the viewport.
21. **If ALL aggregated points are null → `graphData = null`** → UI shows "No data" state, not empty chart.

---

## 14. Common Mistakes & Anti-Patterns

### ❌ NEVER DO

| Mistake | Why It's Wrong |
|---------|---------------|
| Check `AS` to determine HR gap | AS is for bed status only. HR validity depends only on HV. |
| Store `heartRate: 0` in database | 0 is converted to null. 0 BPM is physically impossible. |
| Filter out `heartRate: null` from API query | Gaps must be returned to frontend for correct rendering. |
| Convert `null` to `0` in WebSocket broadcast | Frontend interprets 0 as invalid and converts to null anyway, but the intent is lost. |
| Skip null values in `addRawPoint()` | Null values are valid gap markers that must be buffered. |
| Average a bucket including null values | `[72, null, 68]` → average of `[72, 68]` = 70. The null is **excluded**, not treated as 0. |
| Use `intervalMs × 1` as gap threshold | Too aggressive — normal jitter could cause false gaps. Use `intervalMs × 2`. |
| Connect line across null values in chart | Must use `connectMissingData: false` (or null-aware rendering). Gaps must be visible. |
| Advance X-domain on null values in live mode | The viewport should freeze at the last valid HR, not scroll into gap territory. |
| Show null as `"0 BPM"` in tooltip | Null values should display as `"--"` or be skipped. Never show as 0. |

### ✅ ALWAYS DO

| Practice | Reason |
|----------|--------|
| Preserve null through every layer | Gap detection is only useful if gaps reach the chart renderer. |
| Use bucket center for point timestamp | `bucketStart + intervalMs/2` ensures consistent positioning within each bucket. |
| Keep backend and frontend zoom levels in sync | `backend/config/zoomLevels.js` and `utils/zoomLevels.ts` must have identical values. |
| Re-aggregate on zoom change (don't re-fetch) | Raw points are cached in buffer. Only re-bucket, don't re-call API. |
| Backfill buffer on app resume | WebSocket events missed during background → refetch 24h from API. |

---

## File Reference Index

| File | Layer | Role |
|------|-------|------|
| `backend/services/mqttService.js` | Ingestion | MQTT → DB, gap detection (HV/HR), short stream handling |
| `backend/utils/graphAggregation.js` | Backend Aggregation | Downsampling, bucket averaging, gap bucket emission |
| `backend/config/zoomLevels.js` | Config | Zoom level definitions (backend) |
| `backend/services/websocketService.js` | Broadcast | WebSocket emit with null preservation |
| `services/heartRateBuffer.ts` | Frontend Buffer | 24h sliding window, null = gap |
| `utils/heartRateAggregation.ts` | Frontend Aggregation | Bucketing, gap fill, Y-domain calculation |
| `utils/zoomLevels.ts` | Config | Zoom level definitions (frontend) |
| `services/dayGraphManager.ts` | Orchestration | Buffer hydration, aggregation triggers, graph state |
| `hooks/useHeartRateRingBuffer.ts` | WebSocket Handler | Live data processing, null conversion |
| `app/charts/heart-rate-insights.tsx` | UI | Chart rendering, tooltip, metrics display |
