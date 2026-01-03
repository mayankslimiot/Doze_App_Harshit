require('dotenv').config();
const mqtt = require('mqtt');
const HealthData = require('../models/HealthData');
const HealthData180s = require('../models/HealthData180s');
const Device = require('../models/Device');
const { logger } = require('../utils/logger');
const { broadcastHealthData, broadcastDeviceStatus, broadcastHeartRateGraphUpdate } = require('./websocketService');

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
  'MST': 'motionEndReason',
  'AS': 'absenceStart',
  'AST': 'absenceEnd',
  'SS': 'snoringStart',
  'SST': 'snoringStop',
  'SF': 'snoringFrequency',
  'RST': 'respirationStop',
  'RS': 'respirationStart',
  'V': 'voltage',
  'L': 'level',
  'S': 'status',
  'HR': 'heartRate',
  'RE': 'respiration',
  'IA': 'pm10',
  'CO': 'co2',
  'VO': 'voc',
  'ET': 'etoh'
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
  if (data.CO !== undefined && data.CO !== "") patch.eco2 = toNumLocal(data.CO);
  if (data.VO !== undefined && data.VO !== "") patch.tvoc = toNumLocal(data.VO);
  if (data.ET !== undefined && data.ET !== "") patch.etoh = toNumLocal(data.ET);
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
  if (!messageBuffers.has(deviceId)) {
    messageBuffers.set(deviceId, '');
  }
  
  const buffer = messageBuffers.get(deviceId) + messageChunk.toString();
  messageBuffers.set(deviceId, buffer);
  
  // Try to find complete JSON objects in buffer
  const completeMessages = [];
  let remainingBuffer = buffer;
  
  // Look for JSON objects (starting with { and ending with })
  while (remainingBuffer.length > 0) {
    const startIdx = remainingBuffer.indexOf('{');
    if (startIdx === -1) {
      // No more JSON objects, clear buffer
      messageBuffers.set(deviceId, '');
      break;
    }
    
    // Find matching closing brace
    let braceCount = 0;
    let endIdx = -1;
    for (let i = startIdx; i < remainingBuffer.length; i++) {
      if (remainingBuffer[i] === '{') braceCount++;
      if (remainingBuffer[i] === '}') braceCount--;
      if (braceCount === 0) {
        endIdx = i;
        break;
      }
    }
    
    if (endIdx !== -1) {
      // Found complete JSON
      const jsonStr = remainingBuffer.substring(startIdx, endIdx + 1);
      completeMessages.push(jsonStr);
      remainingBuffer = remainingBuffer.substring(endIdx + 1);
    } else {
      // Incomplete JSON, keep in buffer
      messageBuffers.set(deviceId, remainingBuffer);
      break;
    }
  }
  
  return completeMessages;
}

/**
 * Normalize payload - Extract and validate required fields
 * Returns normalized object or null if invalid
 */
function normalizePayload(payload) {
  // Validate required fields
  if (!payload) {
    logger.warn('MQTT: Payload is missing', {});
    return null;
  }

  // Check if this is the new wrapped stream format
  if (payload.device_id && payload.seq !== undefined && payload.ts !== undefined && payload.data) {
    // New wrapped stream format
    const normalized = {
      deviceId: payload.device_id,
      seq: Number(payload.seq),
      ts: Number(payload.ts),
      TS: payload.data.TS !== undefined ? Number(payload.data.TS) : undefined,
      payload: payload.data
    };

    // Validate required fields
    if (!normalized.deviceId || normalized.seq === undefined || normalized.ts === undefined || !normalized.payload) {
      logger.warn('MQTT: Missing required fields in wrapped stream', {
        hasDeviceId: !!normalized.deviceId,
        hasSeq: normalized.seq !== undefined,
        hasTs: normalized.ts !== undefined,
        hasPayload: !!normalized.payload
      });
      return null;
    }

    return normalized;
  }

  // Legacy format - return as-is for backward compatibility
  return {
    deviceId: payload.deviceId || payload.device_id,
    seq: payload.seq,
    ts: payload.ts,
    TS: payload.TS,
    payload: payload
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

  // LIVE stream indicators
  if (payload.HR !== undefined || payload.V !== undefined) {
    return 'LIVE';
  }

  // 180-second stream indicators
  if (payload.RR_mean !== undefined || payload.pNN50 !== undefined) {
    return '180S';
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
      // For LIVE stream, check both collections (in case of migration)
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
    const doc = new HealthData180s({
      deviceId: normalized.deviceId,
      seq: normalized.seq,
      ts: normalized.ts,
      TS: normalized.TS,
      timestamp: new Date(),
      receivedAt: new Date(),
      streamType: '180s',
      streamVersion: 'v2',
      payload: normalized.payload
    });

    const saved = await doc.save();
    logger.info('✅ MQTT: Saved 180s data to healthdata_180s', {
      deviceId: normalized.deviceId,
      documentId: saved._id,
      seq: normalized.seq,
      ts: normalized.ts
    });
    return saved;
  } catch (saveError) {
    // Handle duplicate key error (race condition or retry)
    if (saveError.code === 11000 || saveError.name === 'MongoServerError') {
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
    // Verify device exists
    const device = await Device.findOne({ deviceId });
    if (!device) {
      logger.warn(`Device ${deviceId} not found in database, skipping MQTT message`);
      return null;
    }

    // Update device status
    await Device.findByIdAndUpdate(device._id, {
      status: "active",
      lastActiveAt: new Date(),
    }, { new: true });
    
    // Broadcast device status update
    try {
      broadcastDeviceStatus(deviceId, {
        status: "active",
        lastActiveAt: new Date()
      });
    } catch (wsError) {
      logger.err(wsError, { where: "MQTT: broadcastDeviceStatus" });
    }

    // Handle new wrapped stream format
    if (normalized.seq !== undefined && normalized.ts !== undefined) {
      // New wrapped stream format - map payload data
      const convertedData = convertStringsToNumbers(normalized.payload);
      const cleanData = { ...convertedData };
      delete cleanData.temperature;

      // Check if data is in abbreviated format
      const isAbbreviatedFormat = cleanData.hasOwnProperty("TS") || cleanData.hasOwnProperty("T") || 
                                  cleanData.hasOwnProperty("H") || cleanData.hasOwnProperty("HR");
      
      if (!isAbbreviatedFormat) {
        logger.warn('MQTT: Live data payload is not in abbreviated format', { deviceId });
        return null;
      }

      // Map abbreviated fields to full names
      const mappedData = mapAbbreviatedToFullNames(cleanData);
      
      // Define all valid schema fields
      const validSchemaFields = [
        'timestampSeconds', 'timestampMilliseconds', 'temperature', 'humidity',
        'motionStart', 'motionEndReason', 'absenceStart', 'absenceEnd',
        'snoringStart', 'snoringStop', 'snoringFrequency', 'respirationStop', 'respirationStart',
        'voltage', 'level', 'status', 'heartRate', 'respiration',
        'pm10', 'co2', 'voc', 'etoh'
      ];
      
      // Extract only valid mapped fields
      const validMappedFields = {};
      const extraFields = {};
      
      Object.keys(mappedData).forEach(key => {
        if (validSchemaFields.includes(key)) {
          if (mappedData[key] !== null && mappedData[key] !== undefined && mappedData[key] !== '') {
            validMappedFields[key] = mappedData[key];
          }
        } else {
          extraFields[key] = mappedData[key];
        }
      });

      // Extract signals
      const signals = {};
      if (validMappedFields.voltage !== undefined) {
        signals.battery = validMappedFields.voltage;
        delete validMappedFields.voltage;
      }

      // Build final document
      const newHealthData = new HealthData();
      const fieldsToSet = {
        deviceId: normalized.deviceId,
        seq: normalized.seq,
        ts: normalized.ts,
        TS: normalized.TS,
        timestamp: new Date(),
        receivedAt: new Date(),
        streamType: 'live',
        streamVersion: 'v2',
        metrics: {},
        signals: signals,
        raw: Object.keys(extraFields).length > 0 ? extraFields : {}
      };

      // Add all valid mapped schema fields
      validSchemaFields.forEach(field => {
        if (validMappedFields[field] !== undefined && validMappedFields[field] !== null && validMappedFields[field] !== '') {
          fieldsToSet[field] = validMappedFields[field];
        }
      });

      // Ensure no abbreviated keys remain
      Object.keys(fieldNameMapping).forEach(abbr => {
        if (fieldsToSet[abbr] !== undefined) {
          delete fieldsToSet[abbr];
        }
      });

      newHealthData.set(fieldsToSet);
      
      try {
        const savedDoc = await newHealthData.save();
        logger.info('✅ MQTT: Saved live data to healthdata_new collection', {
          deviceId: normalized.deviceId,
          documentId: savedDoc._id,
          seq: normalized.seq,
          ts: normalized.ts
        });
        
        // Broadcast via WebSocket (ONLY for live data)
        try {
          broadcastHealthData(deviceId, savedDoc.toObject());
          
          // If heart rate data exists, also broadcast graph update
          if (savedDoc.heartRate || savedDoc.hr || savedDoc.bpm) {
            setImmediate(() => {
              broadcastHeartRateGraphUpdate(deviceId, 0).catch((err) => {
                logger.err(err, { where: "MQTT: broadcastHeartRateGraphUpdate" });
              });
            });
          }
        } catch (wsError) {
          logger.err(wsError, { where: "MQTT: broadcastHealthData" });
        }
        
        return savedDoc;
      } catch (saveError) {
        // Handle duplicate key error
        if (saveError.code === 11000 || saveError.name === 'MongoServerError') {
          logger.info('⏭️ MQTT: Duplicate live data detected, skipping', {
            deviceId: normalized.deviceId,
            seq: normalized.seq,
            ts: normalized.ts
          });
          return null;
        }
        throw saveError;
      }
    } else {
      // Legacy format - use existing logic
      return await processLegacyLiveData(deviceId, legacyData);
    }
  } catch (error) {
    logger.err(error, { 
      where: "MQTT: saveLiveData",
      deviceId 
    });
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

    // Convert strings to numbers first to extract timestampSeconds
    const convertedData = convertStringsToNumbers(data);
    
    // Extract device timestamp for duplicate checking
    const deviceTimestampSeconds = convertedData.TS !== undefined && convertedData.TS !== "" 
      ? Number(convertedData.TS) 
      : null;
    
    // Check for duplicate: if deviceTimestampSeconds exists, check if we already have this data
    if (deviceTimestampSeconds !== null && Number.isFinite(deviceTimestampSeconds)) {
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

    // Update device status
    await Device.findByIdAndUpdate(device._id, {
      status: "active",
      lastActiveAt: new Date(),
    }, { new: true });
    
    // Broadcast device status update
    try {
      broadcastDeviceStatus(deviceId, {
        status: "active",
        lastActiveAt: new Date()
      });
    } catch (wsError) {
      logger.err(wsError, { where: "MQTT: broadcastDeviceStatus" });
    }
    
    // Remove temperature if present (use T field only)
    const cleanData = { ...convertedData };
    delete cleanData.temperature;

    // Check if data is in abbreviated format
    const isAbbreviatedFormat = cleanData.hasOwnProperty("TS") || cleanData.hasOwnProperty("T") || 
                                cleanData.hasOwnProperty("H") || cleanData.hasOwnProperty("HR");
    
    if (!isAbbreviatedFormat) {
      // Legacy format warning removed - just skip silently
      return null;
    }

    // Map abbreviated fields to full names FIRST
    const mappedData = mapAbbreviatedToFullNames(cleanData);
    
    // Define all valid schema fields
    const validSchemaFields = [
      'timestampSeconds', 'timestampMilliseconds', 'temperature', 'humidity',
      'motionStart', 'motionEndReason', 'absenceStart', 'absenceEnd',
      'snoringStart', 'snoringStop', 'snoringFrequency', 'respirationStop', 'respirationStart',
      'voltage', 'level', 'status', 'heartRate', 'respiration',
      'pm10', 'co2', 'voc', 'etoh'
    ];
    
    // Extract only valid mapped fields
    const validMappedFields = {};
    const extraFields = {}; // Fields not in schema - will go to raw
    
    Object.keys(mappedData).forEach(key => {
      if (validSchemaFields.includes(key)) {
        // Only include non-null/non-empty values
        if (mappedData[key] !== null && mappedData[key] !== undefined && mappedData[key] !== '') {
          validMappedFields[key] = mappedData[key];
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

    // Build final document with ONLY mapped fields
    const finalDoc = {
      deviceId,
      timestamp: new Date(),
      metrics: {},
      signals: signals,
      raw: extraFields // Only store extra/unmapped fields in raw
    };

    // Add all valid mapped fields to finalDoc
    Object.assign(finalDoc, validMappedFields);

    // Create and save document - only with mapped fields
    const newHealthData = new HealthData();
    
    // Build fieldsToSet with only valid schema fields
    const fieldsToSet = {
      deviceId: finalDoc.deviceId,
      timestamp: finalDoc.timestamp,
      metrics: finalDoc.metrics || {},
      signals: finalDoc.signals || {},
      raw: Object.keys(finalDoc.raw || {}).length > 0 ? finalDoc.raw : {} // Only extra fields
    };

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
      try {
        broadcastHealthData(deviceId, savedDoc.toObject());
        
        // If heart rate data exists, also broadcast graph update (default zoom level 0 = 10m)
        if (savedDoc.heartRate || savedDoc.hr || savedDoc.bpm) {
          // Use setImmediate to avoid blocking the save operation
          setImmediate(() => {
            broadcastHeartRateGraphUpdate(deviceId, 0).catch((err) => {
              logger.err(err, { where: "MQTT: broadcastHeartRateGraphUpdate" });
            });
          });
        }
      } catch (wsError) {
        logger.err(wsError, { where: "MQTT: broadcastHealthData" });
      }
      
      return savedDoc;
    } catch (saveError) {
      // Handle duplicate key error (race condition - another process saved same data)
      if (saveError.code === 11000 || saveError.name === 'MongoServerError') {
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
    logger.err(error, { 
      where: "MQTT: processLegacyLiveData",
      deviceId 
    });
    return null;
  }
}

/**
 * Process and save health data to MongoDB
 * This is the main entry point - handles normalization, stream detection, and routing
 */
async function processAndSaveHealthData(deviceId, data) {
  try {
    // STEP 1: Normalize payload (MANDATORY - before any business logic)
    const normalized = normalizePayload(data);
    if (!normalized) {
      // Invalid payload - skip silently (no warning for new stream format)
      return;
    }

    // Use deviceId from normalized payload if available, otherwise use topic deviceId
    const finalDeviceId = normalized.deviceId || deviceId;

    // STEP 2: Detect stream type
    const streamType = detectStreamType(normalized.payload);
    
    if (streamType === 'INVALID') {
      // Invalid stream type - skip silently
      return;
    }

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

    // STEP 4: Route to appropriate collection based on stream type
    if (streamType === '180S') {
      // Save to healthdata_180s collection (NO WebSocket broadcast)
      await save180sData(normalized, finalDeviceId);
    } else if (streamType === 'LIVE') {
      // Save to existing live collection (WITH WebSocket broadcast)
      await saveLiveData(normalized, finalDeviceId, data);
    }

  } catch (error) {
    logger.err(error, { 
      where: "MQTT: processAndSaveHealthData",
      deviceId 
    });
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
  mqttClient.on('message', (topic, message) => {
    try {
      // Extract device ID from topic (device/{deviceId}/data)
      const topicParts = topic.split('/');
      if (topicParts.length < 3) {
        logger.warn('Invalid MQTT topic format', { topic });
        return;
      }
      
      const deviceId = topicParts[1];
      
      // Buffer message chunks and get complete JSON messages
      const completeMessages = bufferMessage(deviceId, message);
      
      // Process each complete message
      for (const jsonStr of completeMessages) {
        try {
          const data = JSON.parse(jsonStr);
          logger.info('📨 MQTT: Received message', { deviceId, topic });
          
          // Process and save to database
          processAndSaveHealthData(deviceId, data);
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

