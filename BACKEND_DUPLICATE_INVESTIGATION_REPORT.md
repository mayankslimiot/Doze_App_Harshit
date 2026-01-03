# Backend Investigation Report: Single seq Causing Data Skips

## Executive Summary

This investigation maps the exact duplicate-detection logic in the backend that causes only one record per `seq` to be saved, even when the device sends multiple messages with the same `seq` but different timestamps (`ts`).

---

## 1. MQTT Message Ingestion Location

**File**: `backend/services/mqttService.js`

**Entry Point**: `processAndSaveHealthData()` function (lines 677-726)

**Flow**:
1. MQTT client subscribes to topic pattern: `device/+/data` (line 15)
2. Message handler receives messages (lines 787-820)
3. Messages are buffered and parsed (line 799: `bufferMessage()`)
4. Each complete JSON message is processed via `processAndSaveHealthData()` (line 808)

**Key Finding**: No in-memory deduplication layer exists. The only Map in the codebase is `messageBuffers` (line 18), which is used for buffering incomplete JSON messages, NOT for tracking processed seq values.

---

## 2. Duplicate-Detection Logic

### 2.1 Primary Duplicate Check Function

**Location**: `backend/services/mqttService.js`, lines 248-274

**Function**: `checkDuplicate(deviceId, seq, ts, streamType)`

**Exact Condition**:
```javascript
// For LIVE stream:
const existing = await HealthData.findOne({
  deviceId: deviceId,
  seq: seq,
  ts: ts  // ⚠️ CRITICAL: ts is part of the duplicate check
});

// For 180S stream:
const existing = await HealthData180s.findOne({
  deviceId: deviceId,
  seq: seq,
  ts: ts  // ⚠️ CRITICAL: ts is part of the duplicate check
});
```

**Key Finding**: The duplicate check uses **`deviceId + seq + ts`** as a composite key. This means:
- ✅ Messages with same `seq` but **different `ts`** should NOT be considered duplicates
- ❌ Messages with same `seq` AND same `ts` WILL be considered duplicates

### 2.2 When Duplicate Check is Executed

**Location**: `backend/services/mqttService.js`, lines 697-709

**Execution Flow**:
```javascript
// STEP 3: Check for duplicates using deviceId + seq + ts
if (normalized.seq !== undefined && normalized.ts !== undefined) {
  const isDuplicate = await checkDuplicate(finalDeviceId, normalized.seq, normalized.ts, streamType);
  if (isDuplicate) {
    logger.info('⏭️ MQTT: Skipping duplicate data', {
      deviceId: finalDeviceId,
      seq: normalized.seq,
      ts: normalized.ts,
      streamType
    });
    return; // Skip duplicate
  }
}
```

**Key Finding**: The duplicate check happens **BEFORE** database insert. If a duplicate is found, the function returns early and never attempts to save.

---

## 3. Database Query Criteria

### 3.1 Duplicate Query Details

**Query Used**: `findOne({ deviceId, seq, ts })`

**Collections Checked**:
- **LIVE stream**: `HealthData` collection (healthdata_new)
- **180S stream**: `HealthData180s` collection (healthdata_180s)

**Key Finding**: The query checks for **all three fields** (`deviceId`, `seq`, `ts`) together. This means:
- If device sends: `{ seq: 123, ts: 1000 }` → saved
- If device sends: `{ seq: 123, ts: 1001 }` → should be saved (different ts)
- If device sends: `{ seq: 123, ts: 1000 }` → will be skipped (same seq + ts)

### 3.2 HTTP Ingest Endpoint (Alternative Path)

**Location**: `backend/routes/http.js`, line 226

**Finding**: The HTTP `/ingest` endpoint does **NOT** perform duplicate checking based on `seq` or `ts`. It only checks for device existence and saves data directly. This endpoint does not use the `checkDuplicate()` function.

---

## 4. Database Indexes & Constraints

### 4.1 HealthData Collection (LIVE stream)

**File**: `backend/models/HealthData.js`, lines 131-135

**Indexes Defined**:
```javascript
// Index 1: Query optimization
HealthDataSchema.index({ deviceId: 1, timestamp: -1 });

// Index 2: Legacy backward compatibility (sparse)
HealthDataSchema.index({ deviceId: 1, timestampSeconds: 1 }, { unique: true, sparse: true });

// Index 3: New wrapped stream format (sparse) ⚠️ CRITICAL
HealthDataSchema.index({ deviceId: 1, seq: 1, ts: 1 }, { unique: true, sparse: true });
```

**Key Finding**: 
- **Unique index exists** on `{ deviceId: 1, seq: 1, ts: 1 }`
- Index is **sparse** (only applies when all three fields exist)
- This means MongoDB will **reject** any insert that violates this unique constraint

### 4.2 HealthData180s Collection (180S stream)

**File**: `backend/models/HealthData180s.js`, lines 24-25

**Indexes Defined**:
```javascript
// Unique index (NOT sparse - always enforced)
HealthData180sSchema.index({ deviceId: 1, seq: 1, ts: 1 }, { unique: true });

// Query optimization
HealthData180sSchema.index({ deviceId: 1, timestamp: -1 });
```

**Key Finding**:
- **Unique index exists** on `{ deviceId: 1, seq: 1, ts: 1 }`
- Index is **NOT sparse** (always enforced for 180S stream)
- MongoDB will **reject** any insert that violates this unique constraint

### 4.3 Database-Level Enforcement

**Behavior**: 
- If `checkDuplicate()` misses a duplicate (race condition), MongoDB's unique index will catch it
- Error code `11000` (MongoDB duplicate key error) is caught in save handlers (lines 452-459, 303-309)

**Key Finding**: There are **two layers** of duplicate prevention:
1. **Application-level**: `checkDuplicate()` query before insert
2. **Database-level**: Unique index constraint

---

## 5. Log Messages for Skip Reason

### 5.1 Log Messages When Data is Skipped

**Location**: `backend/services/mqttService.js`

**Log Message 1** (Application-level skip):
```javascript
// Line 701-706
logger.info('⏭️ MQTT: Skipping duplicate data', {
  deviceId: finalDeviceId,
  seq: normalized.seq,
  ts: normalized.ts,
  streamType
});
```

**Log Message 2** (Database-level skip - LIVE stream):
```javascript
// Line 453-457
logger.info('⏭️ MQTT: Duplicate live data detected, skipping', {
  deviceId: normalized.deviceId,
  seq: normalized.seq,
  ts: normalized.ts
});
```

**Log Message 3** (Database-level skip - 180S stream):
```javascript
// Line 304-308
logger.info('⏭️ MQTT: Duplicate 180s data detected, skipping', {
  deviceId: normalized.deviceId,
  seq: normalized.seq,
  ts: normalized.ts
});
```

**Key Finding**: 
- All log messages **explicitly log** `seq` and `ts` values
- Logs indicate whether skip happened at application-level (before DB insert) or database-level (after failed insert)
- No log message shows `existingRecordId` - only the incoming `seq` and `ts`

### 5.2 Skip Location

**Application-level skip**: Happens at line 707 (`return;`) - before any database operation
**Database-level skip**: Happens in catch blocks (lines 452-459, 303-309) - after failed insert due to unique constraint violation

---

## 6. Device Payload Parsing & Normalization

### 6.1 Payload Normalization

**Location**: `backend/services/mqttService.js`, lines 180-220

**Function**: `normalizePayload(payload)`

**New Wrapped Stream Format** (lines 188-209):
```javascript
if (payload.device_id && payload.seq !== undefined && payload.ts !== undefined && payload.data) {
  const normalized = {
    deviceId: payload.device_id,
    seq: Number(payload.seq),      // ⚠️ Converted to Number
    ts: Number(payload.ts),         // ⚠️ Converted to Number
    TS: payload.data.TS !== undefined ? Number(payload.data.TS) : undefined,
    payload: payload.data
  };
}
```

**Key Finding**:
- `seq` is converted to `Number` (line 192)
- `ts` is converted to `Number` (line 193)
- No normalization or overriding of `ts` occurs
- `ts` is preserved as-is from the device payload

### 6.2 Type Consistency

**Finding**: Both `seq` and `ts` are stored as `Number` type in the schema:
- `seq: { type: Number }` (HealthData.js, line 8)
- `ts: { type: Number }` (HealthData.js, line 9)

**Key Finding**: No type conversion issues that would cause `ts` to be discarded or normalized incorrectly.

---

## 7. Backend Assumptions About seq Semantics

### 7.1 Code Comments & Logic

**Location**: `backend/models/HealthData.js`, line 134-135

**Comment**:
```javascript
// Unique index for new wrapped stream format: deviceId + seq + ts
HealthDataSchema.index({ deviceId: 1, seq: 1, ts: 1 }, { unique: true, sparse: true });
```

**Location**: `backend/models/HealthData180s.js`, line 24

**Comment**:
```javascript
// Unique index to prevent duplicates based on deviceId + seq + ts
HealthData180sSchema.index({ deviceId: 1, seq: 1, ts: 1 }, { unique: true });
```

**Key Finding**: 
- Backend assumes `seq` is **NOT globally unique** - it's combined with `deviceId` and `ts`
- Backend assumes `seq` can be **reused** - uniqueness is enforced by `deviceId + seq + ts` combination
- **No assumption** that `seq` is monotonically increasing or unique per message

### 7.2 Mismatch Hypothesis

**If device reuses `seq` with different `ts`**:
- ✅ Backend should allow it (different `ts` = different composite key)
- ❌ But if device sends same `seq` AND same `ts`, backend will reject it

**If device reuses `seq` with same `ts`**:
- ❌ Backend will treat it as duplicate (correct behavior per current logic)

**Root Cause Hypothesis**: 
- Device may be sending multiple messages with **same `seq` AND same `ts`**
- OR device is sending same `seq` with different `ts`, but `ts` values are being normalized/rounded causing collisions

---

## 8. Ordering & Race Conditions

### 8.1 Concurrency Handling

**Location**: `backend/services/mqttService.js`, lines 787-820

**Message Processing**:
- MQTT messages are processed **asynchronously** (line 808: `processAndSaveHealthData(deviceId, data)`)
- No `await` on `processAndSaveHealthData()` - messages are processed in parallel
- Multiple messages with same `seq + ts` can arrive simultaneously

### 8.2 Race Condition Scenario

**Scenario**:
1. Message A arrives: `{ seq: 123, ts: 1000 }`
2. Message B arrives (simultaneously): `{ seq: 123, ts: 1000 }`
3. Both call `checkDuplicate()` at nearly the same time
4. Both queries return `null` (no existing record yet)
5. Both attempt to save
6. First save succeeds, second save fails with error code `11000`
7. Second save is caught and logged as "Duplicate live data detected, skipping"

**Key Finding**: 
- Race conditions are **handled** by MongoDB's unique index
- Database-level duplicate detection catches simultaneous inserts
- Application-level `checkDuplicate()` may miss duplicates in race conditions

### 8.3 In-Memory Tracking

**Finding**: 
- **NO** in-memory cache, Map, or Set tracking processed `seq` values
- Only `messageBuffers` Map exists (line 18), used for JSON buffering, NOT seq tracking
- No temporary buffers preventing repeat inserts

---

## 9. Timestamp Usage in Deduplication

### 9.1 Timestamp in Duplicate Check

**Location**: `backend/services/mqttService.js`, line 248-274

**Finding**: 
- `ts` **IS** part of the deduplication condition
- Query: `findOne({ deviceId, seq, ts })`
- All three fields must match for a record to be considered duplicate

### 9.2 Timestamp Conversion

**Location**: `backend/services/mqttService.js`, line 193

**Finding**:
- `ts` is converted to `Number(payload.ts)` - no rounding or normalization
- No conversion from seconds to milliseconds (or vice versa) that would cause collisions
- `ts` is stored as-is in the database

### 9.3 Timestamp in Database

**Schema**: `ts: { type: Number }` (HealthData.js, line 9)

**Finding**: 
- `ts` is stored as a Number (not Date)
- No timestamp conversion that would cause different `ts` values to collide

---

## 10. MQTT QoS & Re-delivery Handling

### 10.1 MQTT QoS Level

**Location**: `backend/services/mqttService.js`, line 775

**QoS Setting**:
```javascript
mqttClient.subscribe(TOPIC_PATTERN, { qos: 0 }, ...)
```

**Key Finding**: 
- QoS level is **0** (at most once delivery)
- No automatic re-delivery by MQTT broker
- Backend does not need to handle MQTT retransmissions

### 10.2 Re-delivery Logic

**Finding**: 
- **NO** logic assuming duplicate delivery when same `seq` appears
- Backend does **NOT** treat reused `seq` as MQTT retransmission
- Duplicate detection is based on `deviceId + seq + ts`, not just `seq`

---

## 11. Database Record Count Validation

### 11.1 Expected Behavior

**If device sends**:
- Message 1: `{ seq: 123, ts: 1000 }` → Should save ✅
- Message 2: `{ seq: 123, ts: 1001 }` → Should save ✅ (different ts)
- Message 3: `{ seq: 123, ts: 1000 }` → Should skip ❌ (same seq + ts as Message 1)

**Database should contain**: 2 records (Message 1 and Message 2)

### 11.2 Actual Behavior (Hypothesis)

**If device sends**:
- Message 1: `{ seq: 123, ts: 1000 }` → Saved ✅
- Message 2: `{ seq: 123, ts: 1000 }` → Skipped ❌ (same seq + ts)
- Message 3: `{ seq: 123, ts: 1000 }` → Skipped ❌ (same seq + ts)

**Database contains**: 1 record (only Message 1)

**Root Cause**: Device is sending **same `seq` AND same `ts`** for multiple messages, causing all subsequent messages to be skipped as duplicates.

---

## 12. Root-Cause Isolation

### 12.1 Exact Condition Causing Skips

**Location**: `backend/services/mqttService.js`, lines 697-709

**Condition**:
```javascript
if (normalized.seq !== undefined && normalized.ts !== undefined) {
  const isDuplicate = await checkDuplicate(finalDeviceId, normalized.seq, normalized.ts, streamType);
  if (isDuplicate) {
    // Skip - return early
    return;
  }
}
```

**Query Used** (line 263-267):
```javascript
const existing = await HealthData.findOne({
  deviceId: deviceId,
  seq: seq,
  ts: ts  // ⚠️ Both seq AND ts must match
});
```

### 12.2 Root Cause Summary

**Primary Root Cause**: 
- Backend treats `deviceId + seq + ts` as a **composite unique key**
- If device sends multiple messages with **same `seq` AND same `ts`**, all subsequent messages are skipped
- This is **correct behavior** per the current design, but may not match device expectations

**Secondary Root Cause (if device sends different `ts`)**:
- If device sends same `seq` with different `ts`, but messages are still being skipped, possible causes:
  1. `ts` values are being normalized/rounded causing collisions
  2. Race condition where first message creates record, subsequent messages check before first save completes
  3. Device is actually sending same `ts` (timestamp not updating between messages)

### 12.3 The Exact Line Causing Skips

**Line 707**: `return;` - Early return when duplicate is detected
**Line 699**: `checkDuplicate()` - The function that determines if data is duplicate
**Line 263-267**: The database query that checks for existing records

**Database Constraint**: 
- Line 135 (HealthData.js): Unique index `{ deviceId: 1, seq: 1, ts: 1 }`
- Line 25 (HealthData180s.js): Unique index `{ deviceId: 1, seq: 1, ts: 1 }`

---

## 13. Investigation Conclusions

### 13.1 Key Findings

1. ✅ **Duplicate detection uses `deviceId + seq + ts`** - not just `seq`
2. ✅ **No in-memory deduplication layer** - only database queries and unique indexes
3. ✅ **Two-layer duplicate prevention** - application-level check + database unique index
4. ✅ **`ts` is preserved as-is** - no normalization or conversion causing collisions
5. ✅ **Race conditions are handled** - MongoDB unique index catches simultaneous inserts

### 13.2 Most Likely Root Cause

**Hypothesis**: Device is sending multiple messages with **same `seq` AND same `ts`** values. The backend correctly identifies these as duplicates and skips them, resulting in only one record per `seq + ts` combination.

**To Confirm**: 
- Check device logs to verify if `ts` values are actually different between messages with same `seq`
- Check backend logs to see the exact `seq` and `ts` values being skipped
- Verify if `ts` is being updated by the device between messages

### 13.3 Design Intent vs. Device Behavior

**Backend Design Intent**:
- `seq` can be reused
- Uniqueness is enforced by `deviceId + seq + ts` combination
- Same `seq + ts` = duplicate (correct behavior)

**Device Behavior (Hypothesis)**:
- Device reuses `seq` for multiple data points
- Device may not be updating `ts` between messages with same `seq`
- Device expects multiple records with same `seq` but different timestamps

**Mismatch**: If device sends same `seq` with same `ts`, backend will correctly reject duplicates. If device sends same `seq` with different `ts`, backend should accept them, but may be skipping due to `ts` not actually being different.

---

## 14. Recommended Next Steps (Investigation Only)

1. **Verify Device Payload**: Check actual MQTT messages to confirm if `ts` values are different for messages with same `seq`
2. **Check Backend Logs**: Extract exact `seq` and `ts` values from skip logs to confirm if `ts` is actually different
3. **Database Query**: Run query to count records with same `seq` but different `ts` to verify if any are being saved
4. **Timestamp Precision**: Verify if `ts` precision (seconds vs milliseconds) matches between device and backend expectations
5. **Race Condition Test**: Send controlled test messages with same `seq` but different `ts` to verify behavior

---

**End of Investigation Report**

