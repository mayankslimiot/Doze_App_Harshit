require('dotenv').config();
const mqtt = require('mqtt');
const HealthData = require('../models/HealthData');
const HealthData180s = require('../models/HealthData180s');
const Device = require('../models/Device');
const { logger } = require('../utils/logger');
const { formatTimestampIST } = require('../utils/timezoneHelper');
const { broadcastHealthData, broadcastDeviceStatus, broadcastDeviceUpdate, broadcastHeartRateGraphUpdate } = require('./websocketService');

// Configuration from .env file
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://172.236.188.162:1883';
const MQTT_USERNAME = process.env.MQTT_USERNAME || 'doze';
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || 'bK67ZwBHSWkl';

// Topic pattern - subscribe to all devices
const TOPIC_PATTERN = 'device/+/data';

// Message buffer for incomplete messages (deviceId -> buffer)
const messageBuffers = new Map();

// Helper functions (same as http.js)
const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
function deriveTimestampSecondsFromAny(data) {
  // 1) TS (seconds)
  if (data?.TS !== undefined && data.TS !== null && data.TS !== "") {
    const n = Number(data.TS);
    if (Number.isFinite(n)) return n;
  }

  // 2) TS_ms (milliseconds)
  if (data?.TS_ms !== undefined && data.TS_ms !== null && data.TS_ms !== "") {
    const n = Number(data.TS_ms);
    if (Number.isFinite(n)) return Math.floor(n / 1000);
  }

  // 3) ts (seconds) - some payloads use lowercase
  if (data?.ts !== undefined && data.ts !== null && data.ts !== "") {
    const n = Number(data.ts);
    if (Number.isFinite(n)) return n;
  }

  // 4) ISO timestamp string
  if (data?.timestamp && typeof data.timestamp === "string") {
    const ms = Date.parse(data.timestamp);
    if (Number.isFinite(ms)) return Math.floor(ms / 1000);
  }

  // 5) fallback: server time
  return Math.floor(Date.now() / 1000);
}

function convertStringsToNumbers(obj) {
  if (!obj || typeof obj !== "object") return obj;
  
  const converted = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      converted[key] = value;
    } else if (typeof value === "string") {
      if (value === "") {
        converted[key] = null;
      } else {
        const num = Number(value);
        converted[key] = Number.isFinite(num) ? num : value;
      }
    } else if (typeof value === "object" && !Array.isArray(value)) {
      converted[key] = convertStringsToNumbers(value);
    } else if (Array.isArray(value)) {
      converted[key] = value.map(item => 
        typeof item === "string" && item !== "" && !isNaN(Number(item)) 
          ? Number(item) 
          : item
      );
    } else {
      converted[key] = value;
    }
  }
  return converted;
}

const fieldNameMapping = {
  'TS': 'timestampSeconds',
  'TS_ms': 'timestampMilliseconds',
  'T': 'temperature',
  'H': 'humidity',
  'MS': 'motionStart',
  'MST': 'motionStop',
  'AS': 'absenceStart',
  'MS_B': 'motionBoolean',
  'SN_B': 'snoreDetected',
  'L': 'batteryLevel',
  'HR_M': 'hr_median',
  'Res_M': 'respirationMedian',
  'HR_SD': 'heartRateSD',
  'RESSD': 'respirationSD',
  'SS': 'snoringStart',
  'SST': 'snoringStop',
  'SF': 'snoringFrequency',
  'RS': 'snoreCount',
  'V': 'voltage',
  'L': 'level',
  'S': 'status',
  'HR': 'heartRate',
  'RE': 'respiration',
  'IA': 'pm10',
  'AIR': 'iaq',
  'CO': 'co2',
  'VO': 'voc',
  'VOC': 'voc',
  'VR': 'vocRaw',
  'VS': 'vocStatus',
  'ALT': 'vocAlert',
  'VLT': 'vocAlert',
  'VEN': 'ventilationNeeded',
  'HV': 'heartRateValid',
  'ET': 'eventText'
};

function mapAbbreviatedToFullNames(data) {
  if (!data || typeof data !== "object") return data;
  
  const mapped = {};
  for (const [key, value] of Object.entries(data)) {
    const mappedKey = fieldNameMapping[key] || key;
    mapped[mappedKey] = value;
  }
  return mapped;
}

function parseAbbreviatedFormat(data) {
  if (!data || typeof data !== "object") return null;
  
  const patch = {};
  const metrics = {};
  const signals = {};
  const raw = {};
  
  const toNumLocal = (v) => {
    if (v === "" || v === null || v === undefined) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  
  // Note: Using abbreviated names here, will be mapped to full names later
  if (data.T !== undefined && data.T !== "") patch.temp = toNumLocal(data.T);
  if (data.H !== undefined && data.H !== "") patch.humidity = toNumLocal(data.H);
  if (data.HR !== undefined && data.HR !== "") patch.heartRate = toNumLocal(data.HR);
  if (data.RE !== undefined && data.RE !== "") patch.respiration = toNumLocal(data.RE);
  if (data.S !== undefined && data.S !== "") patch.stress = toNumLocal(data.S);
  if (data.IA !== undefined && data.IA !== "") patch.iaq = toNumLocal(data.IA);
  if (data.AIR !== undefined && data.AIR !== "") patch.iaq = toNumLocal(data.AIR);
  if (data.CO !== undefined && data.CO !== "") patch.eco2 = toNumLocal(data.CO);
  if (data.VO !== undefined && data.VO !== "") patch.tvoc = toNumLocal(data.VO);
  if (data.VOC !== undefined && data.VOC !== "") patch.tvoc = toNumLocal(data.VOC);
  if (data.VR !== undefined && data.VR !== "") patch.vocRaw = toNumLocal(data.VR);
  if (data.VS !== undefined && data.VS !== "") patch.vocStatus = toNumLocal(data.VS);
  if (data.ALT !== undefined && data.ALT !== "") patch.vocAlert = toNumLocal(data.ALT);
  if (data.VLT !== undefined && data.VLT !== "") patch.vocAlert = toNumLocal(data.VLT);
  if (data.VEN !== undefined && data.VEN !== "") patch.ventilationNeeded = toNumLocal(data.VEN);
  if (data.HV !== undefined && data.HV !== "") patch.heartRateValid = toNumLocal(data.HV);
  if (data.ET !== undefined && data.ET !== "") patch.eventText = data.ET;
            if (data.RS !== undefined && data.RS !== "") patch.snoreCount = toNumLocal(data.RS);
  if (data.V !== undefined && data.V !== "") signals.battery = toNumLocal(data.V);
  if (data.L !== undefined && data.L !== "") patch.level = toNumLocal(data.L);
  if (data.TS !== undefined && data.TS !== "") patch.timestampSeconds = toNumLocal(data.TS);
  if (data.TS_ms !== undefined && data.TS_ms !== "") patch.timestampMilliseconds = toNumLocal(data.TS_ms);
  
  Object.assign(raw, data);
  
  return { patch, metrics, signals, raw };
}

/**
 * Buffer incomplete messages and reconstruct complete JSON
 */
function bufferMessage(deviceId, messageChunk) {
  const prev = messageBuffers.get(deviceId) || "";
  let working = prev + messageChunk.toString("utf8");

  const completeMessages = [];
  let remainingBuffer = working;

  while (remainingBuffer.length > 0) {
    const startIdx = remainingBuffer.indexOf("{");
    if (startIdx === -1) {
      // No JSON start found; drop garbage
      remainingBuffer = "";
      break;
    }

    // Find matching closing brace
    let braceCount = 0;
    let endIdx = -1;

    for (let i = startIdx; i < remainingBuffer.length; i++) {
      if (remainingBuffer[i] === "{") braceCount++;
      if (remainingBuffer[i] === "}") braceCount--;

      if (braceCount === 0) {
        endIdx = i;
        break;
      }
    }

    if (endIdx !== -1) {
      // Found complete JSON
      const jsonStr = remainingBuffer.substring(startIdx, endIdx + 1);
      completeMessages.push(jsonStr);

      // Continue scanning after this object
      remainingBuffer = remainingBuffer.substring(endIdx + 1);
      continue;
    }

    // Incomplete JSON: keep from startIdx onward for next chunk
    remainingBuffer = remainingBuffer.substring(startIdx);
    break;
  }

  // ✅ CRITICAL: persist only the leftover (usually "")
  messageBuffers.set(deviceId, remainingBuffer);

  return completeMessages;
}

/**
 * Normalize payload - Extract and validate required fields
 * Returns normalized object or null if invalid
 */
function normalizePayload(payload) {
  if (!payload) {
    logger.warn("MQTT: Payload is missing", {});
    return null;
  }

  // ✅ If payload wraps actual sensor fields under `.data`, unwrap it
  // Supports shapes like:
  //   { deviceId, timestamp, topic, data: { TS, T, H, HR, ... } }
  //   { device_id, seq, ts, data: { ... } } (already handled below)
  const hasInnerDataObject =
    payload.data && typeof payload.data === "object" && !Array.isArray(payload.data);

  // New wrapped stream format
  if (payload.device_id && payload.seq !== undefined && payload.ts !== undefined && hasInnerDataObject) {
    const normalized = {
      deviceId: payload.device_id,
      seq: Number(payload.seq),
      ts: Number(payload.ts),
      TS: payload.data.TS !== undefined ? Number(payload.data.TS) : undefined,
      payload: payload.data,
    };

    if (!normalized.deviceId || normalized.seq === undefined || normalized.ts === undefined || !normalized.payload) {
      logger.warn("MQTT: Missing required fields in wrapped stream", {
        hasDeviceId: !!normalized.deviceId,
        hasSeq: normalized.seq !== undefined,
        hasTs: normalized.ts !== undefined,
        hasPayload: !!normalized.payload,
      });
      return null;
    }

    return normalized;
  }

  // Legacy / other formats (including wrapper-with-data)
  const inner = hasInnerDataObject ? payload.data : payload;

  return {
    deviceId: payload.deviceId || payload.device_id,
    seq: payload.seq !== undefined ? Number(payload.seq) : undefined,
    ts: payload.ts !== undefined ? Number(payload.ts) : undefined,
    TS: inner?.TS !== undefined ? Number(inner.TS) : (payload.TS !== undefined ? Number(payload.TS) : undefined),
    payload: inner,
  };
}

/**
 * Detect stream type based on payload data fields
 * Returns: 'LIVE', '180S', or 'INVALID'
 * Note: payload is already the data object (not wrapped) after normalization
 */
function detectStreamType(payload) {
  if (!payload || typeof payload !== 'object') {
    return 'INVALID';
  }

  // 180-second stream indicators
  if (payload.RR_mean !== undefined || payload.pNN50 !== undefined) {
    return '180S';
  }

  // LIVE stream indicators
  // Check for full stream (has HR or V or other sensor data)
  if (payload.HR !== undefined || payload.V !== undefined) {
    return 'LIVE';
  }

  // ✅ Short stream / Status stream:
  // If it has at least TS, treat it as a LIVE stream.
  // This allows short streams that may contain extra fields like A, B, C.
  if (payload.TS !== undefined || payload.AS !== undefined || payload.HV !== undefined) {
    return 'LIVE';
  }

  return 'INVALID';
}

/**
 * Check for duplicate using deviceId + seq + ts
 */
async function checkDuplicate(deviceId, seq, ts, streamType) {
  if (seq === undefined || ts === undefined) {
    return false; // Can't check duplicate without seq and ts
  }

  try {
    if (streamType === '180S') {
      const existing = await HealthData180s.findOne({
        deviceId: deviceId,
        seq: seq,
        ts: ts
      });
      return !!existing;
    } else {
      // LIVE stream uniqueness is (deviceId, seq, ts)
      const existing = await HealthData.findOne({
        deviceId: deviceId,
        seq: seq,
        ts: ts
      });
      return !!existing;
    }
  } catch (error) {
    logger.err(error, { where: 'checkDuplicate', deviceId, seq, ts });
    return false; // On error, allow save (let DB unique index handle it)
  }
}

/**
 * Save 180-second data to healthdata_180s collection
 */
async function save180sData(normalized, deviceId) {
  try {
    const now = new Date();
    const doc = new HealthData180s({
      deviceId: deviceId,
      seq: normalized.seq,
      ts: normalized.ts,
      TS: normalized.TS,
      timestamp: now,
      timestampIST: formatTimestampIST(now),
      receivedAt: new Date(),
      streamVersion: 'v2',
      isBuffered: normalized.TS ? Math.abs(now.getTime() - (normalized.TS * 1000)) > 18000 : false,
      payload: normalized.payload
    });

    const saved = await doc.save();
    logger.info('✅ MQTT: Saved 180s data to healthdata_180s', {
      deviceId: deviceId,
      documentId: saved._id,
      seq: normalized.seq,
      ts: normalized.ts,
      hasStressLevel: !!saved.payload?.stress_level
    });

    // ✅ Broadcast via WebSocket (so frontend receives stress data in real-time)
    // ONLY broadcast if it's live data. Buffered/old data should not jump to the front of the live graph.
    if (!saved.isBuffered) {
      try {
        const savedDocObject = saved.toObject();
        // Log stress_level for debugging
        if (savedDocObject.payload?.stress_level) {
          logger.info('📊 MQTT: Broadcasting 180s data with stress_level', {
            deviceId: deviceId,
            stress_level: savedDocObject.payload.stress_level
          });
        }
        broadcastHealthData(deviceId, savedDocObject);
      } catch (wsError) {
        logger.err(wsError, { where: 'MQTT: broadcastHealthData (180s)' });
      }
    } else {
      logger.info('🔇 MQTT: Skipped broadcasting 180s data because it is buffered/old', { deviceId, ts: normalized.ts });
    }

    return saved;
  } catch (saveError) {
    // Handle duplicate key error (race condition or retry)
    if (saveError && saveError.code === 11000) {
      logger.info('⏭️ MQTT: Duplicate 180s data detected, skipping', {
        deviceId: normalized.deviceId,
        seq: normalized.seq,
        ts: normalized.ts
      });
      return null;
    }
    throw saveError;
  }
}

/**
 * Save live data to existing healthdata_new collection
 */
async function saveLiveData(normalized, deviceId, legacyData) {
  try {
    // ✅ If legacy path, do it first (legacy function already updates status + broadcasts)
    if (normalized.seq === undefined || normalized.ts === undefined) {
      return await processLegacyLiveData(deviceId, legacyData);
    }

    // Verify device exists
    const device = await Device.findOne({ deviceId });
    if (!device) {
      logger.warn(`Device ${deviceId} not found in database, skipping MQTT message`);
      return null;
    }

    // --- v2 wrapped stream save logic ---
    const convertedData = convertStringsToNumbers(normalized.payload);
    const cleanData = { ...convertedData };
    delete cleanData.temperature;

    // ✅ CHECK IF BUFFERED FIRST
    const packetTS = normalized.TS || normalized.ts;
    const now = new Date();
    const isBuffered = packetTS ? Math.abs(now.getTime() - (packetTS * 1000)) > 18000 : false;

    // ✅ Always update lastActiveAt since the device is currently talking to us
    const updateData = {
      status: "active",
      lastActiveAt: now,
    };

    let bedStatusChanged = false;
    let previousBedStatus = device.bedStatus || "Vacant";

    // ✅ Only update live states (bedStatus, HV, absenceStart) if data is live!
    if (!isBuffered) {
      updateData.isLive = true;

      // Extract AS (absenceStart) and HV (Human Validity) for bedStatus computation
      const absenceStart = cleanData.AS !== undefined ? toNum(cleanData.AS) : null;
      const hv = cleanData.HV !== undefined ? toNum(cleanData.HV) : null;

      let bedStatus = "Vacant"; // Default
      if (absenceStart === 0 || absenceStart === "0") {
        bedStatus = "Vacant";
      } else if (absenceStart === 1 || absenceStart === "1") {
        bedStatus = "Occupied";
      }

      bedStatusChanged = previousBedStatus !== bedStatus;

      // Only update bedStatus if AS is present (don't overwrite with null)
      if (absenceStart !== null && absenceStart !== undefined) {
        updateData.bedStatus = bedStatus;
        updateData.absenceStart = absenceStart;
      }

      // Only update HV if present
      if (hv !== null && hv !== undefined) {
        updateData.HV = hv;
      }
    }

    const updatedDevice = await Device.findByIdAndUpdate(
      device._id,
      { $set: updateData },
      { new: true }
    );

    // ✅ Broadcast device_update if bedStatus changed or device recovered from Waiting (ONLY for live data)
    if (!isBuffered && (bedStatusChanged || previousBedStatus === "Waiting")) {
      try {
        broadcastDeviceUpdate(deviceId, {
          bedStatus: updatedDevice.bedStatus,
          motionBoolean: null,
        snoreDetected: null,
        batteryLevel: null,
        absenceStart: updatedDevice.absenceStart,
          HV: updatedDevice.HV,
          isLive: updatedDevice.isLive,
          source: "packet"
        });
        logger.info('MQTT: Device update broadcasted (bedStatus changed)', {
          deviceId,
          previousBedStatus,
          newBedStatus: updatedDevice.bedStatus,
          motionBoolean: null,
        snoreDetected: null,
        batteryLevel: null,
        absenceStart: updatedDevice.absenceStart,
          HV: updatedDevice.HV
        });
      } catch (wsError) {
        logger.err(wsError, { where: 'MQTT: broadcastDeviceUpdate' });
      }
    }

    // Also broadcast legacy device status for backward compatibility
    try {
      broadcastDeviceStatus(deviceId, { status: "active", lastActiveAt: new Date() });
    } catch (wsError) {
      logger.err(wsError, { where: "MQTT: broadcastDeviceStatus" });
    }

    // --- v2 wrapped stream save logic ---
    // Note: convertedData and cleanData are already declared above for bedStatus computation
    // Reuse them here

    // ✅ Check if this is a short stream (e.g. only TS, AS, HV, and optionally other non-sensor fields like A, B, C)
    const payloadKeys = Object.keys(cleanData);
    const hasStatusFields = cleanData.TS !== undefined || cleanData.AS !== undefined || cleanData.HV !== undefined;
    const hasSensorFields = cleanData.HR !== undefined || cleanData.V !== undefined;
    const isShortStream = hasStatusFields && !hasSensorFields;

    // Check if data is in abbreviated format
    const isAbbreviatedFormat =
      cleanData.hasOwnProperty("TS") ||
      cleanData.hasOwnProperty("T") ||
      cleanData.hasOwnProperty("H") ||
      cleanData.hasOwnProperty("HR");

    if (!isAbbreviatedFormat && !isShortStream) {
      logger.warn('MQTT: Live data payload is not in abbreviated format', { deviceId });
      return null;
    }

    // ✅ If short stream, save all fields as NULL
    if (isShortStream) {
      logger.info('MQTT: Short stream detected (no human detected), saving all fields as NULL', {
        deviceId,
        payloadKeys,
        seq: normalized.seq,
        ts: normalized.ts,
        timestamp: new Date().toISOString()
      });

      // now is already defined at the top
      const newHealthData = new HealthData();
      const fieldsToSet = {
        deviceId: deviceId,
        seq: normalized.seq,
        ts: normalized.ts,
        TS: normalized.TS,
        timestamp: now,
        timestampIST: formatTimestampIST(now),
        receivedAt: new Date(),
        streamVersion: 'v2',
        isBuffered: normalized.TS ? Math.abs(now.getTime() - (normalized.TS * 1000)) > 18000 : false,
        metrics: {},
        signals: {},
        raw: cleanData, // Store original short stream payload in raw
        // Set all metric fields to null explicitly
        timestampSeconds: normalized.TS || null,
        timestampMilliseconds: null,
        temperature: null,
        humidity: null,
        motionStart: null,
        motionStop: null,
        motionBoolean: null,
        snoreDetected: null,
        batteryLevel: null,
        absenceStart: cleanData.AS !== undefined ? toNum(cleanData.AS) : null,
        snoringStart: null,
        snoringStop: null,
        snoringFrequency: null,
        snoreCount: null,
        voltage: null,
        level: null,
        status: null,
        heartRate: null,
        respiration: null,
        pm10: null,
        iaq: null,
        co2: null,
        voc: null,
        vocRaw: null,
        vocStatus: null,
        vocAlert: null,
        ventilationNeeded: null,
        heartRateValid: cleanData.HV !== undefined ? toNum(cleanData.HV) : null,
        eventText: null
      };

      newHealthData.set(fieldsToSet);

      try {
        const savedDoc = await newHealthData.save();
        logger.info('✅ MQTT: Saved short stream (NULL data) to healthdata_new collection', {
          deviceId: deviceId,
          documentId: savedDoc._id,
          seq: normalized.seq,
          ts: normalized.ts,
        });

        // Broadcast via WebSocket (ONLY for live data)
        if (!savedDoc.isBuffered) {
          try {
            broadcastHealthData(deviceId, savedDoc.toObject());
          } catch (wsError) {
            logger.err(wsError, { where: 'MQTT: broadcastHealthData (short stream)' });
          }
        } else {
          logger.info('🔇 MQTT: Skipped broadcasting short stream because it is buffered/old', { deviceId, ts: normalized.ts });
        }

        return savedDoc;
      } catch (saveError) {
        if (saveError && saveError.code === 11000) {
          logger.info('⏭️ MQTT: Duplicate short stream data detected, skipping', {
            deviceId: normalized.deviceId,
            seq: normalized.seq,
            ts: normalized.ts,
          });
          return null;
        }
        throw saveError;
      }
    }

    // Map abbreviated fields to full names
    const mappedData = mapAbbreviatedToFullNames(cleanData);

    // Define all valid top-level schema fields
    const validSchemaFields = [
      'timestampSeconds', 'timestampMilliseconds', 'temperature', 'humidity',
      'motionStart', 'motionStop', 'absenceStart', 
      'snoringStart', 'snoringStop', 'snoringFrequency', 'snoreCount',
      'motionBoolean', 'snoreDetected', 'batteryLevel',
      'voltage', 'level', 'status', 'heartRate', 'respiration',
      'pm10', 'iaq', 'co2', 'voc', 'vocRaw', 'vocStatus', 'vocAlert', 'ventilationNeeded', 'heartRateValid', 'eventText'
    ];

    // Fields that belong under the nested `metrics` sub-document in the HealthData schema
    const metricsSchemaFields = ['hr_median', 'respirationMedian', 'heartRateSD', 'respirationSD'];

    // Extract only valid mapped fields
    const validMappedFields = {};
    const metricsFields = {};
    const extraFields = {};

    // String fields that should NOT be coerced to Number
    const stringFields = ['eventText'];

    Object.keys(mappedData).forEach((key) => {
      if (validSchemaFields.includes(key)) {
        if (stringFields.includes(key)) {
          // Keep as string (e.g. eventText: "APNEA_MODERATE:18000")
          if (mappedData[key] !== undefined && mappedData[key] !== null && mappedData[key] !== '') {
            validMappedFields[key] = mappedData[key];
          }
        } else {
          const coerced = toNum(mappedData[key]);
          if (coerced !== undefined) {
            validMappedFields[key] = coerced;
          }
        }
      } else if (metricsSchemaFields.includes(key)) {
        const coerced = toNum(mappedData[key]);
        if (coerced !== undefined) {
          metricsFields[key] = coerced;
        }
      } else {
        extraFields[key] = mappedData[key];
      }
    });

    // Extract signals (voltage goes to signals.battery)
    const signals = {};
    if (validMappedFields.voltage !== undefined) {
      signals.battery = validMappedFields.voltage;
      delete validMappedFields.voltage;
    }

    // Preserve original abbreviated metric keys in raw for backward compatibility
    // (sleepStageService falls back to raw.HR_M, raw.Res_M, raw.HR_SD, raw.RESSD)
    const rawMetrics = {};
    ['HR_M', 'Res_M', 'HR_SD', 'RESSD'].forEach(abbr => {
      if (cleanData[abbr] !== undefined && cleanData[abbr] !== null && cleanData[abbr] !== '') {
        rawMetrics[abbr] = toNum(cleanData[abbr]) ?? cleanData[abbr];
      }
    });

    // now is already defined at the top
    const newHealthData = new HealthData();
    const fieldsToSet = {
      deviceId: deviceId,
      seq: normalized.seq,
      ts: normalized.ts,
      TS: normalized.TS,
      timestamp: now,
      timestampIST: formatTimestampIST(now),
      receivedAt: new Date(),
      streamVersion: 'v2',
      isBuffered: normalized.TS ? Math.abs(now.getTime() - (normalized.TS * 1000)) > 18000 : false,
      metrics: { ...metricsFields },
      signals,
      raw: { ...extraFields, ...rawMetrics },
    };

    // ✅ CRITICAL: Handle heartRate gaps (HV=0 only, NOT AS)
    // Rule: Heart rate validity depends ONLY on HV (Heart Validity), not AS (Absence Start)
    // AS = Human presence (1 = present, 0 = absent) - used for bed status only
    // HV = Heart rate validity (1 = valid, 0 = invalid/no heart rate)
    // If HV=0 OR HR=0, save heartRate = null (gap indicator)
    // Check original payload for HV field (before mapping)
    const hvValue = cleanData.HV !== undefined ? Number(cleanData.HV) : undefined;
    const hrValue = mappedData.heartRate !== undefined ? Number(mappedData.heartRate) : undefined;
    
    // If HV=0 or HR=0, set heartRate to null (gap)
    // NOTE: AS is NOT checked - heart rate works independently of human presence
    if ((hvValue === 0) || (hrValue === 0) || (hrValue === null)) {
      // Explicitly set heartRate to null for gaps
      fieldsToSet.heartRate = null;
      // Remove heartRate from validMappedFields so it doesn't get overwritten
      delete validMappedFields.heartRate;
    }

    // Add all valid mapped schema fields
    validSchemaFields.forEach((field) => {
      if (validMappedFields[field] !== undefined && validMappedFields[field] !== null && validMappedFields[field] !== '') {
        fieldsToSet[field] = validMappedFields[field];
      }
    });

    // Ensure no abbreviated keys remain
    Object.keys(fieldNameMapping).forEach((abbr) => {
      if (fieldsToSet[abbr] !== undefined) {
        delete fieldsToSet[abbr];
      }
    });

    newHealthData.set(fieldsToSet);

    try {
      const savedDoc = await newHealthData.save();
      logger.info('✅ MQTT: Saved live data to healthdata_new collection', {
        deviceId: deviceId,
        documentId: savedDoc._id,
        seq: normalized.seq,
        ts: normalized.ts,
      });

      // Broadcast via WebSocket (ONLY for live data)
      // Frontend now handles graph aggregation from raw health_data_update events
      // No need to send zoom-specific graph updates - reduces latency and complexity
      if (!savedDoc.isBuffered) {
        try {
          broadcastHealthData(deviceId, savedDoc.toObject());
        } catch (wsError) {
          logger.err(wsError, { where: 'MQTT: broadcastHealthData' });
        }
      } else {
        logger.info('🔇 MQTT: Skipped broadcasting live data because it is buffered/old', { deviceId, ts: normalized.ts });
      }

      return savedDoc;
    } catch (saveError) {
      if (saveError && saveError.code === 11000) {
        logger.info('⏭️ MQTT: Duplicate live data detected, skipping', {
          deviceId: normalized.deviceId,
          seq: normalized.seq,
          ts: normalized.ts,
        });
        return null;
      }
      throw saveError;
    }
  } catch (error) {
    logger.err(error, { where: "MQTT: saveLiveData", deviceId });
    return null;
  }
}


/**
 * Process legacy live data format (backward compatibility)
 */
async function processLegacyLiveData(deviceId, data) {
  try {
    // Verify device exists
    const device = await Device.findOne({ deviceId });
    if (!device) {
      logger.warn(`Device ${deviceId} not found in database, skipping MQTT message`);
      return null;
    }

    const convertedData = convertStringsToNumbers(data);

    // ✅ Ensure we always have a usable TS for the unique index (deviceId + timestampSeconds)
    const derivedTS = deriveTimestampSecondsFromAny(convertedData);

    // Use derivedTS for duplicate checking and saving
    const deviceTimestampSeconds = Number.isFinite(derivedTS) ? derivedTS : null;

    if (deviceTimestampSeconds !== null) {
      const existingRecord = await HealthData.findOne({
        deviceId: deviceId,
        timestampSeconds: deviceTimestampSeconds
      });

      if (existingRecord) {
        logger.info(`⏭️ MQTT: Skipping duplicate legacy data`, {
          deviceId,
          timestampSeconds: deviceTimestampSeconds,
          existingRecordId: existingRecord._id
        });
        return null;
      }
    }

    const cleanData = { ...convertedData };
    delete cleanData.temperature;

    // ✅ CHECK IF BUFFERED FIRST
    const now = new Date();
    const isBuffered = deviceTimestampSeconds ? Math.abs(now.getTime() - (deviceTimestampSeconds * 1000)) > 18000 : false;

    // ✅ Always update lastActiveAt since the device is currently talking to us
    const updateData = {
      status: "active",
      lastActiveAt: now,
    };

    let bedStatusChanged = false;
    let previousBedStatus = device.bedStatus || "Vacant";

    // ✅ Only update live states (bedStatus, HV, absenceStart) if data is live!
    if (!isBuffered) {
      updateData.isLive = true;

      // Extract AS (absenceStart) and HV (Human Validity) for bedStatus computation
      const absenceStart = cleanData.AS !== undefined ? toNum(cleanData.AS) : null;
      const hv = cleanData.HV !== undefined ? toNum(cleanData.HV) : null;

      let bedStatus = "Vacant"; // Default
      if (absenceStart === 0 || absenceStart === "0") {
        bedStatus = "Vacant";
      } else if (absenceStart === 1 || absenceStart === "1") {
        bedStatus = "Occupied";
      }

      bedStatusChanged = previousBedStatus !== bedStatus;

      // Only update bedStatus if AS is present (don't overwrite with null)
      if (absenceStart !== null && absenceStart !== undefined) {
        updateData.bedStatus = bedStatus;
        updateData.absenceStart = absenceStart;
      }

      // Only update HV if present
      if (hv !== null && hv !== undefined) {
        updateData.HV = hv;
      }
    }

    const updatedDevice = await Device.findByIdAndUpdate(
      device._id,
      { $set: updateData },
      { new: true }
    );

    // ✅ Broadcast device_update if bedStatus changed or device recovered from Waiting (ONLY for live data)
    if (!isBuffered && (bedStatusChanged || previousBedStatus === "Waiting")) {
      try {
        broadcastDeviceUpdate(deviceId, {
          bedStatus: updatedDevice.bedStatus,
          motionBoolean: null,
        snoreDetected: null,
        batteryLevel: null,
        absenceStart: updatedDevice.absenceStart,
          HV: updatedDevice.HV,
          isLive: updatedDevice.isLive,
          source: "packet"
        });
        logger.info('MQTT: Device update broadcasted (legacy, bedStatus changed)', {
          deviceId,
          previousBedStatus,
          newBedStatus: updatedDevice.bedStatus,
          motionBoolean: null,
        snoreDetected: null,
        batteryLevel: null,
        absenceStart: updatedDevice.absenceStart,
          HV: updatedDevice.HV
        });
      } catch (wsError) {
        logger.err(wsError, { where: "MQTT: broadcastDeviceUpdate (legacy)" });
      }
    }

    // Also broadcast legacy device status for backward compatibility
    try {
      broadcastDeviceStatus(deviceId, { status: "active", lastActiveAt: new Date() });
    } catch (wsError) {
      logger.err(wsError, { where: "MQTT: broadcastDeviceStatus" });
    }

    // ✅ Inject TS if missing so mapping produces timestampSeconds (prevents null in unique index)
    if (cleanData.TS === undefined || cleanData.TS === null || cleanData.TS === "") {
      cleanData.TS = deviceTimestampSeconds;
    }

    // ✅ Check if this is a short stream (e.g. only TS, AS, HV, and optionally other non-sensor fields like A, B, C)
    const payloadKeys = Object.keys(cleanData);
    const hasStatusFields = cleanData.TS !== undefined || cleanData.AS !== undefined || cleanData.HV !== undefined;
    const hasSensorFields = cleanData.HR !== undefined || cleanData.V !== undefined;
    const isShortStream = hasStatusFields && !hasSensorFields;

    const isAbbreviatedFormat =
      cleanData.hasOwnProperty("TS") ||
      cleanData.hasOwnProperty("T") ||
      cleanData.hasOwnProperty("H") ||
      cleanData.hasOwnProperty("HR");

    if (!isAbbreviatedFormat && !isShortStream) {
      return null;
    }

    // ✅ If short stream, save all fields as NULL (legacy format)
    if (isShortStream) {
      logger.info('MQTT: Short stream detected (legacy format, no human detected), saving all fields as NULL', {
        deviceId,
        payloadKeys,
        timestampSeconds: deviceTimestampSeconds,
        timestamp: new Date().toISOString()
      });

      // now is already defined at the top
      const newHealthData = new HealthData();
      const fieldsToSet = {
        deviceId: deviceId,
        timestamp: now,
        timestampIST: formatTimestampIST(now),
        timestampSeconds: deviceTimestampSeconds,
        metrics: {},
        signals: {},
        raw: cleanData, // Store original short stream payload in raw
        // Set all metric fields to null explicitly
        timestampMilliseconds: null,
        temperature: null,
        humidity: null,
        motionStart: null,
        motionStop: null,
        motionBoolean: null,
        snoreDetected: null,
        batteryLevel: null,
        absenceStart: cleanData.AS !== undefined ? toNum(cleanData.AS) : null,
        snoringStart: null,
        snoringStop: null,
        snoringFrequency: null,
        snoreCount: null,
        voltage: null,
        level: null,
        status: null,
        heartRate: null,
        respiration: null,
        pm10: null,
        co2: null,
        voc: null,
        vocRaw: null,
        vocStatus: null,
        eventText: null
      };

      newHealthData.set(fieldsToSet);

      try {
        const savedDoc = await newHealthData.save();
        logger.info(`✅ MQTT: Saved short stream (NULL data, legacy format) to healthdata_new collection`, {
          deviceId,
          documentId: savedDoc._id,
          timestampSeconds: deviceTimestampSeconds || 'N/A'
        });

        // Broadcast via WebSocket
        try {
          broadcastHealthData(deviceId, savedDoc.toObject());
        } catch (wsError) {
          logger.err(wsError, { where: "MQTT: broadcastHealthData (short stream legacy)" });
        }

        return savedDoc;
      } catch (saveError) {
        // Handle duplicate key error
        if (saveError && saveError.code === 11000) {
          logger.info(`⏭️ MQTT: Duplicate short stream detected (legacy format), skipping save`, {
            deviceId,
            timestampSeconds: deviceTimestampSeconds || 'N/A',
            error: saveError.message
          });
          return null;
        }
        throw saveError;
      }
    }

    // Map abbreviated fields to full names FIRST
    const mappedData = mapAbbreviatedToFullNames(cleanData);
    
    // Define all valid top-level schema fields
    const validSchemaFields = [
      'timestampSeconds', 'timestampMilliseconds', 'temperature', 'humidity',
      'motionStart', 'motionStop', 'absenceStart', 
      'snoringStart', 'snoringStop', 'snoringFrequency', 'snoreCount',
      'motionBoolean', 'snoreDetected', 'batteryLevel',
      'voltage', 'level', 'status', 'heartRate', 'respiration',
      'pm10', 'iaq', 'co2', 'voc', 'vocRaw', 'vocStatus', 'vocAlert', 'ventilationNeeded', 'heartRateValid', 'eventText'
    ];

    // Fields that belong under the nested `metrics` sub-document in the HealthData schema
    const metricsSchemaFields = ['hr_median', 'respirationMedian', 'heartRateSD', 'respirationSD'];
    
    // Extract only valid mapped fields
    const validMappedFields = {};
    const metricsFields = {};
    const extraFields = {}; // Fields not in schema - will go to raw
    
    Object.keys(mappedData).forEach(key => {
      if (validSchemaFields.includes(key)) {
        // Only include non-null/non-empty values
        if (mappedData[key] !== null && mappedData[key] !== undefined && mappedData[key] !== '') {
          validMappedFields[key] = mappedData[key];
        }
      } else if (metricsSchemaFields.includes(key)) {
        if (mappedData[key] !== null && mappedData[key] !== undefined && mappedData[key] !== '') {
          const coerced = toNum(mappedData[key]);
          if (coerced !== undefined) {
            metricsFields[key] = coerced;
          }
        }
      } else {
        // Extra fields that don't map to schema
        extraFields[key] = mappedData[key];
      }
    });

    // Extract signals (voltage goes to signals.battery, not top-level)
    const signals = {};
    if (validMappedFields.voltage !== undefined) {
      signals.battery = validMappedFields.voltage;
      // Remove voltage from top-level fields (it's stored in signals.battery)
      delete validMappedFields.voltage;
    }

    // Preserve original abbreviated metric keys in raw for backward compatibility
    // (sleepStageService falls back to raw.HR_M, raw.Res_M, raw.HR_SD, raw.RESSD)
    const rawMetrics = {};
    ['HR_M', 'Res_M', 'HR_SD', 'RESSD'].forEach(abbr => {
      if (cleanData[abbr] !== undefined && cleanData[abbr] !== null && cleanData[abbr] !== '') {
        rawMetrics[abbr] = toNum(cleanData[abbr]) ?? cleanData[abbr];
      }
    });

    // Build final document with ONLY mapped fields
    const finalDoc = {
      deviceId,
      timestamp: new Date(),
      metrics: { ...metricsFields },
      signals: signals,
      raw: { ...extraFields, ...rawMetrics }
    };

    // Add all valid mapped fields to finalDoc
    Object.assign(finalDoc, validMappedFields);

    // Create and save document - only with mapped fields
    const newHealthData = new HealthData();
    
    const ts = finalDoc.timestamp ? new Date(finalDoc.timestamp) : new Date();
    // Build fieldsToSet with only valid schema fields
    const fieldsToSet = {
      deviceId: finalDoc.deviceId,
      timestamp: ts,
      timestampIST: formatTimestampIST(ts),
      metrics: finalDoc.metrics || {},
      signals: finalDoc.signals || {},
      raw: Object.keys(finalDoc.raw || {}).length > 0 ? finalDoc.raw : {} // Only extra fields
    };

    // ✅ CRITICAL: Handle heartRate gaps (HV=0 only, NOT AS) for legacy data
    // Rule: Heart rate validity depends ONLY on HV (Heart Validity), not AS (Absence Start)
    // AS = Human presence (1 = present, 0 = absent) - used for bed status only
    // HV = Heart rate validity (1 = valid, 0 = invalid/no heart rate)
    // If HV=0 OR HR=0, save heartRate = null (gap indicator)
    // Check original cleanData for HV field (before mapping)
    const hvValue = cleanData.HV !== undefined ? Number(cleanData.HV) : undefined;
    const hrValue = mappedData.heartRate !== undefined ? Number(mappedData.heartRate) : undefined;
    
    // If HV=0 or HR=0, set heartRate to null (gap)
    // NOTE: AS is NOT checked - heart rate works independently of human presence
    if ((hvValue === 0) || (hrValue === 0) || (hrValue === null)) {
      // Explicitly set heartRate to null for gaps
      fieldsToSet.heartRate = null;
      // Remove heartRate from finalDoc so it doesn't get overwritten
      delete finalDoc.heartRate;
    }

    // Add all valid mapped schema fields
    validSchemaFields.forEach(field => {
      if (finalDoc[field] !== undefined && finalDoc[field] !== null && finalDoc[field] !== '') {
        fieldsToSet[field] = finalDoc[field];
      }
    });

    // Ensure no abbreviated keys remain
    Object.keys(fieldNameMapping).forEach(abbr => {
      if (fieldsToSet[abbr] !== undefined) {
        delete fieldsToSet[abbr];
      }
    });
    
    // Log what we're saving
    logger.info(`📊 MQTT: Mapped legacy data for saving`, {
      deviceId,
      mappedFields: Object.keys(validMappedFields),
      extraFields: Object.keys(extraFields),
      timestampSeconds: deviceTimestampSeconds
    });

    newHealthData.set(fieldsToSet);
    
    try {
      const savedDoc = await newHealthData.save();
      logger.info(`✅ MQTT: Saved legacy health data to healthdata_new collection`, {
        deviceId,
        documentId: savedDoc._id,
        timestampSeconds: deviceTimestampSeconds || 'N/A'
      });
      
      // Broadcast via WebSocket
      // Frontend now handles graph aggregation from raw health_data_update events
      // No need to send zoom-specific graph updates - reduces latency and complexity
      try {
        broadcastHealthData(deviceId, savedDoc.toObject());
      } catch (wsError) {
        logger.err(wsError, { where: "MQTT: broadcastHealthData" });
      }
      
      return savedDoc;
    } catch (saveError) {
      // Handle duplicate key error (race condition - another process saved same data)
      if (saveError && saveError.code === 11000) {
        logger.info(`⏭️ MQTT: Duplicate detected (race condition), skipping save`, {
          deviceId,
          timestampSeconds: deviceTimestampSeconds || 'N/A',
          error: saveError.message
        });
        return null; // Skip - duplicate already exists
      }
      throw saveError; // Re-throw other errors
    }

  } catch (error) {
    logger.err(error, { where: "MQTT: processLegacyLiveData", deviceId });
    return null;
  }
}

/**
 * Process and save health data to MongoDB
 * This is the main entry point - handles normalization, stream detection, and routing
 */
async function processAndSaveHealthData(deviceId, data) {
  try {
    const normalized = normalizePayload(data);
    if (!normalized) return;

    const finalDeviceId = normalized.deviceId || deviceId;

    // Ensure we use ONE deviceId everywhere (dedupe + insert) so uniqueness is truly
    // (deviceId, seq, ts). This also avoids false cross-device duplicates if the topic
    // deviceId and payload device_id ever disagree.
    normalized.deviceId = finalDeviceId;

    const streamType = detectStreamType(normalized.payload);
    if (streamType === "INVALID") {
      // ✅ Make this visible while debugging
      logger.warn("MQTT: Stream type INVALID (skipping)", {
        deviceId: finalDeviceId,
        payloadKeys: normalized.payload && typeof normalized.payload === "object" ? Object.keys(normalized.payload) : typeof normalized.payload,
      });
      return;
    }

    if (normalized.seq !== undefined && normalized.ts !== undefined) {
      const isDuplicate = await checkDuplicate(finalDeviceId, normalized.seq, normalized.ts, streamType);
      if (isDuplicate) {
        logger.info("⏭️ MQTT: Skipping duplicate data", {
          deviceId: finalDeviceId,
          seq: normalized.seq,
          ts: normalized.ts,
          streamType,
        });
        return;
      }
    }

    if (streamType === "180S") {
      await save180sData(normalized, finalDeviceId);
    } else if (streamType === "LIVE") {
      // ✅ IMPORTANT: pass the unwrapped payload to legacy path
      await saveLiveData(normalized, finalDeviceId, normalized.payload);
    }
  } catch (error) {
    logger.err(error, { where: "MQTT: processAndSaveHealthData", deviceId });
  }
}

/**
 * Initialize MQTT client and subscribe to topics
 */
let mqttClient = null;

function initializeMQTT() {
  if (mqttClient && mqttClient.connected) {
    logger.info('MQTT client already connected');
    return mqttClient;
  }

  // Parse broker URL
  let brokerUrl = MQTT_BROKER_URL;
  if (!brokerUrl.startsWith('mqtt://') && !brokerUrl.startsWith('mqtts://') && 
      !brokerUrl.startsWith('ws://') && !brokerUrl.startsWith('wss://')) {
    brokerUrl = `mqtt://${brokerUrl}`;
  }

  // MQTT client options
  const clientOptions = {
    clientId: `backend_mqtt_${Math.random().toString(16).substring(2, 10)}`,
    clean: true,
    reconnectPeriod: 5000,
    connectTimeout: 30000,
    keepalive: 60,
  };

  if (MQTT_USERNAME) {
    clientOptions.username = MQTT_USERNAME;
  }
  if (MQTT_PASSWORD) {
    clientOptions.password = MQTT_PASSWORD;
  }

  logger.info('🔌 Connecting to MQTT broker...', {
    url: brokerUrl,
    username: MQTT_USERNAME || '(not set)',
    topic: TOPIC_PATTERN
  });

  mqttClient = mqtt.connect(brokerUrl, clientOptions);

  // Connection event handlers
  mqttClient.on('connect', (connack) => {
    logger.info('✅ MQTT: Connected to broker successfully', { connack });
    
    // Subscribe to all device topics
    mqttClient.subscribe(TOPIC_PATTERN, { qos: 0 }, (err, granted) => {
      if (err) {
        logger.err(err, { where: "MQTT: Subscription error" });
      } else {
        logger.info('✅ MQTT: Subscribed to topics', {
          topics: granted.map(g => ({ topic: g.topic, qos: g.qos }))
        });
      }
    });
  });

  // Message event handler
  mqttClient.on('message', async (topic, message) => {
    try {
      const topicParts = topic.split('/');
      if (topicParts.length < 3) {
        logger.warn('Invalid MQTT topic format', { topic });
        return;
      }

      const deviceId = topicParts[1];

      const completeMessages = bufferMessage(deviceId, message);

      // ✅ Process sequentially to reduce race-condition duplicates
      for (const jsonStr of completeMessages) {
        try {
          const data = JSON.parse(jsonStr);
          logger.info('📨 MQTT: Received message', { deviceId, topic });

          await processAndSaveHealthData(deviceId, data);

          // ✅ Publish ACK to device/{device_id}/data/ack so device can confirm receipt
          const seq = data.seq !== undefined ? Number(data.seq) : undefined;
          const ackTopic = `device/${deviceId}/data/ack`;
          const ackPayload = JSON.stringify({
            status: 'received',
            last_seq: seq,
            server_time: new Date().toISOString()
          });
          if (mqttClient && mqttClient.connected) {
            mqttClient.publish(ackTopic, ackPayload, { qos: 0 }, (err) => {
              if (err) {
                logger.err(err, { where: 'MQTT: ACK publish failed', deviceId, ackTopic });
              } else {
                logger.info('✅ MQTT: ACK sent', { deviceId, ackTopic, last_seq: seq });
              }
            });
          }
        } catch (parseError) {
          logger.warn('Failed to parse MQTT message as JSON', {
            deviceId,
            error: parseError.message,
            message: jsonStr.substring(0, 100)
          });
        }
      }
    } catch (error) {
      logger.err(error, { where: "MQTT: message handler", topic });
    }
  });

  // Error event handler
  mqttClient.on('error', (error) => {
    logger.err(error, { where: "MQTT: Connection error" });
  });

  // Reconnect event handler
  mqttClient.on('reconnect', () => {
    logger.info('🔄 MQTT: Reconnecting to broker...');
  });

  // Offline event handler
  mqttClient.on('offline', () => {
    logger.warn('⚠️ MQTT: Client is offline');
  });

  // Close event handler
  mqttClient.on('close', () => {
    logger.info('🔌 MQTT: Connection closed');
  });

  return mqttClient;
}

/**
 * Disconnect MQTT client
 */
function disconnectMQTT() {
  if (mqttClient) {
    mqttClient.end();
    mqttClient = null;
    logger.info('🔌 MQTT: Disconnected');
  }
}

module.exports = {
  initializeMQTT,
  disconnectMQTT
};

