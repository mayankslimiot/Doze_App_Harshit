const express = require("express");
const dotenv = require("dotenv");
const HealthData = require("../models/HealthData");
const SleepData = require("../models/SleepData");
const Device = require("../models/Device");
const deviceApiKeyMiddleware = require("../middleware/deviceApiKeyMiddleware");
const { broadcastHealthData, broadcastDeviceStatus, broadcastNotification } = require("../services/websocketService");
const Notification = require("../models/Notification");
const SystemConfig = require("../models/SystemConfig");
const Account = require("../models/Account");
const Profile = require("../models/Profile");
const { formatTimestampIST } = require("../utils/timezoneHelper");

dotenv.config();

const router = express.Router();

// --- UART helpers (keep inline to avoid new files)
const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

// Helper function to convert all string values in an object to numbers
function convertStringsToNumbers(obj) {
  if (!obj || typeof obj !== "object") return obj;
  
  const converted = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      converted[key] = value;
    } else if (typeof value === "string") {
      // Convert string to number if it's a valid number
      if (value === "") {
        converted[key] = null; // Empty strings become null
      } else {
        const num = Number(value);
        converted[key] = Number.isFinite(num) ? num : value; // Keep original if not a number
      }
    } else if (typeof value === "object" && !Array.isArray(value)) {
      // Recursively convert nested objects
      converted[key] = convertStringsToNumbers(value);
    } else if (Array.isArray(value)) {
      // Convert array elements if they are strings
      converted[key] = value.map(item => 
        typeof item === "string" && item !== "" && !isNaN(Number(item)) 
          ? Number(item) 
          : item
      );
    } else {
      converted[key] = value; // Keep other types as is
    }
  }
  return converted;
}

// Mapping from abbreviated codes to full field names
const fieldNameMapping = {
  'TS': 'timestampSeconds',
  'TS_ms': 'timestampMilliseconds',
  'T': 'temperature',
  'H': 'humidity',
  'MS': 'motionStart',
  'MST': 'motionEndReason',
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

// Function to convert abbreviated field names to full names
function mapAbbreviatedToFullNames(data) {
  if (!data || typeof data !== "object") return data;
  
  const mapped = {};
  for (const [key, value] of Object.entries(data)) {
    // If key exists in mapping, use full name; otherwise keep original key
    const mappedKey = fieldNameMapping[key] || key;
    mapped[mappedKey] = value;
  }
  return mapped;
}

// Parse abbreviated JSON format -> { patch, metrics, signals, raw }
function parseAbbreviatedFormat(data) {
  if (!data || typeof data !== "object") return null;
  
  const patch = {};
  const metrics = {};
  const signals = {};
  const raw = {};
  
  // Helper to convert string to number
  const toNum = (v) => {
    if (v === "" || v === null || v === undefined) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  
  // Map abbreviated fields to database fields
  if (data.T !== undefined && data.T !== "") patch.temp = toNum(data.T);
  if (data.H !== undefined && data.H !== "") patch.humidity = toNum(data.H);
  if (data.HR !== undefined && data.HR !== "") patch.heartRate = toNum(data.HR);
  if (data.RE !== undefined && data.RE !== "") patch.respiration = toNum(data.RE);
  if (data.S !== undefined && data.S !== "") patch.stress = toNum(data.S);
  if (data.IA !== undefined && data.IA !== "") patch.iaq = toNum(data.IA);
  if (data.CO !== undefined && data.CO !== "") patch.eco2 = toNum(data.CO);
  if (data.VO !== undefined && data.VO !== "") patch.tvoc = toNum(data.VO);
  if (data.ET !== undefined && data.ET !== "") patch.etoh = toNum(data.ET);
  
  // Battery/Voltage
  if (data.V !== undefined && data.V !== "") signals.battery = toNum(data.V);
  
  // Store all fields in raw for reference
  Object.assign(raw, data);
  
  return { patch, metrics, signals, raw };
}

// Parse one UART CSV line -> { patch, metrics, signals }
function parseUartLine(line) {
  if (!line || typeof line !== "string") return null;
  const parts = line.trim().split(",").map(s => s.trim());
  const tag = (parts[0] || "").toUpperCase();

  const patch = {};    // goes to flat fields (temp, heartRate, respiration, hrv, stress…)
  const metrics = {};  // goes to HealthData.metrics (HRV detail)
  const signals = {};  // goes to HealthData.signals (flags)

  switch (tag) {
    case "HRV_DATA": {
      // Expected order (17 values after tag):
      // mean_rr, sdnn, rmssd, pnn50, hr_median, rr_tri_index, tin_rmssd,
      // sd1, sd2, lf, hf, lfhf, sample_entropy, sd1sd2, sns_index, pns_index
      if (parts.length >= 17) {
        const [
          _,
          mean_rr, sdnn, rmssd, pnn50, hr_median, rr_tri_index, tin_rmssd,
          sd1, sd2, lf, hf, lfhf, sample_entropy, sd1sd2, sns_index, pns_index
        ] = parts;

        Object.assign(metrics, {
          mean_rr: toNum(mean_rr),
          sdnn: toNum(sdnn),
          rmssd: toNum(rmssd),
          pnn50: toNum(pnn50),
          hr_median: toNum(hr_median),
          rr_tri_index: toNum(rr_tri_index),
          tin_rmssd: toNum(tin_rmssd),
          sd1: toNum(sd1),
          sd2: toNum(sd2),
          lf: toNum(lf),
          hf: toNum(hf),
          lfhf: toNum(lfhf),
          sample_entropy: toNum(sample_entropy),
          sd1sd2: toNum(sd1sd2),
          sns_index: toNum(sns_index),
          pns_index: toNum(pns_index),
        });

        // Optional: keep legacy flats filled if present
        if (metrics.rmssd !== undefined) patch.hrv = metrics.rmssd;
        if (metrics.hr_median !== undefined) patch.heartRate = metrics.hr_median;
      }
      break;
    }

    case "TEMP_HUM":
      patch.temp = toNum(parts[1]);
      patch.humidity = toNum(parts[2]);
      break;

    case "HR":
      patch.heartRate = toNum(parts[1]);
      break;

    case "RES":
      patch.respiration = toNum(parts[1]);
      break;

    case "STRESS":
      patch.stress = toNum(parts[1]);
      break;

    case "RR":
      // optional raw RR sample (not always present)
      if (!("sample_entropy" in metrics)) metrics.sample_entropy = undefined;
      break;

    case "MOTION":
      signals.motion = parts[1] !== undefined ? Number(parts[1]) === 1 : undefined;
      break;

    case "PRESENCE":
      signals.presence = parts[1] !== undefined ? Number(parts[1]) === 1 : undefined;
      break;

    case "ACT":
    case "ACTIVITY":
      signals.activity = toNum(parts[1]);
      break;

    case "BAT":
      signals.battery = toNum(parts[1]);
      break;

    case "MIC":
      signals.mic = toNum(parts[1]);
      break;

    default:
      // leave unrecognized as raw only
      break;
  }

  return { patch, metrics, signals, raw: line };
}

// Map to throttle notifications per device and parameter (e.g., "DEV1_HR")
const notificationThrottleCache = new Map();
const THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

router.post("/ingest", deviceApiKeyMiddleware, async (req, res) => {
  try {
    const { deviceId, type, data } = req.body;

    if (!deviceId || !type || !data) {
      return res.status(400).json({ message: "deviceId, type, and data are required" });
    }

    const device = await Device.findOne({ deviceId });
    if (!device) {
      return res.status(404).json({ message: `Device ${deviceId} not found` });
    }

    const updatedDevice = await Device.findByIdAndUpdate(device._id, {
      status: "active",
      lastActiveAt: new Date(),
    }, { new: true });
    
    // Broadcast device status update via WebSocket
    try {
      broadcastDeviceStatus(deviceId, {
        status: updatedDevice.status,
        lastActiveAt: updatedDevice.lastActiveAt
      });
    } catch (wsError) {
      // Don't fail the request if WebSocket broadcast fails
      console.error("⚠️ WebSocket device status broadcast error (non-fatal):", wsError.message);
    }

    if (type === "health") {

      console.log("Incoming data:", JSON.stringify(data, null, 2));

      // Convert all string values in data to numbers
      const convertedData = convertStringsToNumbers(data);
      console.log("Converted data (strings to numbers):", JSON.stringify(convertedData, null, 2));

      // CRITICAL: Remove temperature from data if present, use temp only
      // Store original data for raw field (but remove temperature)
      const originalDataForRaw = { ...convertedData };
      delete originalDataForRaw.temperature;
      
      const cleanData = { ...convertedData };
      delete cleanData.temperature;
      
      const now = new Date();
      // Base document - only essential fields, no mapped fields
      const base = {
        deviceId,
        timestamp: now,
        timestampIST: formatTimestampIST(now),
        metrics: {
          ...(data.metrics || {})
        },
        signals: {
          motion: data.signals?.motion ?? null,
          presence: data.signals?.presence ?? null,
          battery: data.signals?.battery ?? null,
          activity: data.signals?.activity ?? null,
          mic: data.signals?.mic ?? null,
          rrIntervals: data.signals?.rrIntervals || [],
          rawWaveform: data.signals?.rawWaveform || []
        },
        raw: {}  // Empty for abbreviated format
      };


      // NEW: accept a single UART line or an array of lines and fold into the same doc
      // Also handle abbreviated JSON format (TS, T, H, HR, RE, etc.)
      let mergedPatch = {};
      let mergedMetrics = {};
      let mergedSignals = {};
      let raws = [];
      let isAbbreviatedFormat = false;

      // Check if data is in abbreviated format (has TS, T, H, HR, etc.)
      isAbbreviatedFormat = cleanData.hasOwnProperty("TS") || cleanData.hasOwnProperty("T") || 
                            cleanData.hasOwnProperty("H") || cleanData.hasOwnProperty("HR");
      
      if (isAbbreviatedFormat) {
        const parsed = parseAbbreviatedFormat(cleanData);
        if (parsed) {
          Object.assign(mergedPatch, parsed.patch);
          Object.assign(mergedMetrics, parsed.metrics);
          Object.assign(mergedSignals, parsed.signals);
          // Store ALL original fields in raw (including empty strings)
          // Use originalDataForRaw which has all fields except temperature
          raws.push(JSON.stringify(originalDataForRaw));
        }
      }

      // Also handle UART CSV lines if present
      const lines = Array.isArray(data.lines) ? data.lines : (data.line ? [data.line] : []);
      for (const ln of lines) {
        const parsed = parseUartLine(String(ln));
        if (!parsed) continue;
        Object.assign(mergedPatch, parsed.patch);
        Object.assign(mergedMetrics, parsed.metrics);
        Object.assign(mergedSignals, parsed.signals);
        raws.push(parsed.raw);
      }

      // Final document (legacy fields preserved, UART merged if present)
      // Remove 'temperature' if present and ensure only 'temp' is used
      const { temperature, ...mergedPatchClean } = mergedPatch;
      
      // For abbreviated format, don't store in raw (fields are top-level)
      // Only store raw for UART CSV lines
      let finalRaw = {};
      if (isAbbreviatedFormat) {
        // Don't store abbreviated fields in raw - they're top-level fields
        finalRaw = {};
      } else if (raws.length > 0) {
        finalRaw = raws.join("\n");
      } else {
        finalRaw = base.raw || {};
      }
      
      // Build final document - only abbreviated fields and essential fields
      // Removed mapped fields: temp, humidity, iaq, eco2, tvoc, etoh, hrv, stress, respiration, heartRate
      const finalDoc = {
        deviceId: base.deviceId,
        timestamp: base.timestamp,
        timestampIST: base.timestampIST,
        metrics: { ...base.metrics, ...mergedMetrics },
        signals: { ...base.signals, ...mergedSignals },
        raw: finalRaw
      };
      
      // Map abbreviated fields to full names and add to document
      if (isAbbreviatedFormat && originalDataForRaw) {
        // Map all abbreviated fields to full names
        const mappedData = mapAbbreviatedToFullNames(originalDataForRaw);
        // Fields that belong under the nested `metrics` sub-document in the HealthData schema
        const metricsSchemaFields = ['hr_median', 'respirationMedian', 'heartRateSD', 'respirationSD'];
        // Add mapped fields to finalDoc (exclude base fields)
        Object.keys(mappedData).forEach(key => {
          if (!['deviceId', 'timestamp', 'metrics', 'signals', 'raw'].includes(key)) {
            if (metricsSchemaFields.includes(key)) {
              // Route to metrics sub-document instead of top-level (where Mongoose strict:true drops them)
              const coerced = toNum(mappedData[key]);
              if (coerced !== undefined) {
                finalDoc.metrics[key] = coerced;
              }
            } else {
              finalDoc[key] = mappedData[key];
            }
          }
        });

        // Preserve original abbreviated metric keys in raw for backward compatibility
        // (sleepStageService falls back to raw.HR_M, raw.Res_M, raw.HR_SD, raw.RESSD)
        const rawMetrics = {};
        ['HR_M', 'Res_M', 'HR_SD', 'RESSD'].forEach(abbr => {
          if (originalDataForRaw[abbr] !== undefined && originalDataForRaw[abbr] !== null && originalDataForRaw[abbr] !== '') {
            rawMetrics[abbr] = toNum(originalDataForRaw[abbr]) ?? originalDataForRaw[abbr];
          }
        });
        if (Object.keys(rawMetrics).length > 0) {
          finalDoc.raw = { ...(typeof finalDoc.raw === 'object' ? finalDoc.raw : {}), ...rawMetrics };
        }
      }
      
      // Create document using set() method to ensure only valid fields
      const newHealthData = new HealthData();
      
      // Base fields
      const fieldsToSet = {
        deviceId: finalDoc.deviceId,
        timestamp: finalDoc.timestamp,
        timestampIST: finalDoc.timestampIST || formatTimestampIST(finalDoc.timestamp),
        isBuffered: finalDoc.timestampSeconds ? Math.abs(finalDoc.timestamp.getTime() - (finalDoc.timestampSeconds * 1000)) > 18000 : false,
        metrics: finalDoc.metrics || {},
        signals: finalDoc.signals || {},
        raw: finalDoc.raw || {}
      };
      
      // Add all mapped fields (full names) from finalDoc
      // Only add fields that are in the schema (full names)
      const schemaFields = [
        'timestampSeconds', 'timestampMilliseconds', 'temperature', 'humidity',
        'motionStart', 'motionEndReason', 'absenceStart', 
        'snoringStart', 'snoringStop', 'snoringFrequency', 'respirationStop', 'respirationStart',
        'voltage', 'level', 'status', 'heartRate', 'respiration',
        'pm10', 'co2', 'voc', 'etoh',
        'motionBoolean', 'snoreDetected', 'batteryLevel', 'motionStop', 'snoreCount',
        'iaq', 'vocRaw', 'vocStatus', 'vocAlert', 'ventilationNeeded', 'heartRateValid', 'eventText'
      ];
      
      schemaFields.forEach(field => {
        if (finalDoc[field] !== undefined) {
          fieldsToSet[field] = finalDoc[field];
        }
      });
      
      // Remove any abbreviated keys that might still be present
      Object.keys(fieldNameMapping).forEach(abbr => {
        if (fieldsToSet[abbr] !== undefined) {
          delete fieldsToSet[abbr];
        }
      });
      
      newHealthData.set(fieldsToSet);
      
      try {
        const savedDoc = await newHealthData.save();
        console.log("✅ Saved to healthdata_new collection. Document ID:", savedDoc._id);
        console.log("📊 Collection name:", savedDoc.collection.name);
        
        // Broadcast health data via WebSocket to all subscribed clients
        try {
          broadcastHealthData(deviceId, savedDoc.toObject());
          
          // --- THRESHOLD CHECKS & NOTIFICATIONS ---
          if (device.organizationId) {
            const hr = finalDoc.heartRate;
            const resp = finalDoc.respiration;
            const nowTime = Date.now();
            let alertMsg = null;
            let paramType = null;

            // Resolve thresholds: global (from org SystemConfig) or individual (from device)
            let effectiveHrMin = device.hrMin;
            let effectiveHrMax = device.hrMax;
            let effectiveRespMin = device.respMin;
            let effectiveRespMax = device.respMax;

            if (device.thresholdMode !== "individual") {
              // Global mode — fetch org's SystemConfig
              try {
                const orgAccount = await Account.findOne({ organizationId: device.organizationId });
                if (orgAccount && orgAccount.defaultUser) {
                  const globalConfig = await SystemConfig.findOne({ userId: orgAccount.defaultUser });
                  if (globalConfig) {
                    effectiveHrMin = globalConfig.hrMin ?? 40;
                    effectiveHrMax = globalConfig.hrMax ?? 120;
                    effectiveRespMin = globalConfig.respMin ?? 8;
                    effectiveRespMax = globalConfig.respMax ?? 30;
                  }
                }
              } catch (cfgErr) {
                console.error("⚠️ Failed to fetch global SystemConfig, using device defaults:", cfgErr.message);
              }
            }

            // Resolve patient name from Profile
            let patientName = "Patient";
            if (device.profileId) {
              try {
                const profile = await Profile.findById(device.profileId).lean();
                if (profile && profile.identifier) {
                  patientName = profile.identifier;
                }
              } catch (pErr) {
                // Non-fatal — fall back to "Patient"
              }
            }

            // Check HR
            if (hr !== undefined && hr !== null && hr > 0) {
              if (hr < effectiveHrMin) {
                alertMsg = `In Room ${device.room || 'N/A'} on Bed ${device.bed || 'N/A'}, ${patientName}'s Heart Rate is ${hr} (below min ${effectiveHrMin})`;
                paramType = "HR";
              } else if (hr > effectiveHrMax) {
                alertMsg = `In Room ${device.room || 'N/A'} on Bed ${device.bed || 'N/A'}, ${patientName}'s Heart Rate is ${hr} (above max ${effectiveHrMax})`;
                paramType = "HR";
              }
            }

            // Check Respiration if no HR alert
            if (!alertMsg && resp !== undefined && resp !== null && resp > 0) {
              if (resp < effectiveRespMin) {
                alertMsg = `In Room ${device.room || 'N/A'} on Bed ${device.bed || 'N/A'}, ${patientName}'s Respiration is ${resp} (below min ${effectiveRespMin})`;
                paramType = "RESP";
              } else if (resp > effectiveRespMax) {
                alertMsg = `In Room ${device.room || 'N/A'} on Bed ${device.bed || 'N/A'}, ${patientName}'s Respiration is ${resp} (above max ${effectiveRespMax})`;
                paramType = "RESP";
              }
            }

            if (alertMsg && paramType) {
              const cacheKey = `${deviceId}_${paramType}`;
              const lastAlert = notificationThrottleCache.get(cacheKey) || 0;

              if (nowTime - lastAlert > THROTTLE_MS) {
                notificationThrottleCache.set(cacheKey, nowTime);

                // Create Notification in DB
                const notification = new Notification({
                  organizationId: device.organizationId,
                  deviceId: deviceId,
                  title: `${paramType} Alert`,
                  message: alertMsg,
                  type: "alert"
                });

                await notification.save();

                // Broadcast to organization
                broadcastNotification(device.organizationId.toString(), notification.toObject());
                console.log(`⚠️ Alert Triggered: ${alertMsg}`);
              }
            }
          }
          // --- END THRESHOLD CHECKS ---
          
        } catch (wsError) {
          // Don't fail the request if WebSocket broadcast fails
          console.error("⚠️ WebSocket broadcast error (non-fatal):", wsError.message);
        }
        
        return res.json({ 
          message: "Health data saved via http",
          collection: "healthdata_new",
          documentId: savedDoc._id
        });
      } catch (saveError) {
        console.error("❌ Error saving to healthdata_new:", saveError);
        throw saveError;
      }
    }

    if (type === "sleep") {
      const newSleepData = new SleepData({
        deviceId,
        timestamp: new Date(),
        sleepQuality: data.sleepQuality || "Unknown",
        duration: data.duration || 0,
      });

      await newSleepData.save();
      return res.json({ message: "Sleep data saved" });
    }

    return res.status(400).json({ message: "Invalid type. Use 'health' or 'sleep'" });

  } catch (err) {
    console.error("❌ Error saving data via HTTP:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// WiFi Status Endpoint - Check if device got network/internet or not
router.post("/wifi-status", deviceApiKeyMiddleware, async (req, res) => {
  try {
    const { deviceId, status } = req.body;

    // Validate required fields
    if (!deviceId) {
      return res.status(400).json({ 
        success: false,
        message: "deviceId is required" 
      });
    }

    if (!status) {
      return res.status(400).json({ 
        success: false,
        message: "status is required" 
      });
    }

    // Validate status value
    const validStatuses = ["CONNECTED", "FAILED"];
    const upperStatus = status.toUpperCase();
    if (!validStatuses.includes(upperStatus)) {
      return res.status(400).json({ 
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}` 
      });
    }

    // Find device
    const device = await Device.findOne({ deviceId });
    if (!device) {
      return res.status(404).json({ 
        success: false,
        message: `Device ${deviceId} not found` 
      });
    }

    // Prepare update data
    const updateData = {
      wifiStatus: upperStatus,
      wifiLastAttempt: new Date()
    };

    // If connected, also update wifiConnectedAt and device status
    if (upperStatus === "CONNECTED") {
      updateData.wifiConnectedAt = new Date();
      updateData.status = "active";
      updateData.lastActiveAt = new Date();
    }

    // Update device with WiFi status
    const updatedDevice = await Device.findByIdAndUpdate(
      device._id,
      updateData,
      { new: true }
    );

    console.log(`✅ WiFi status updated for device ${deviceId}: ${upperStatus}`);

    // Broadcast device status update via WebSocket
    try {
      broadcastDeviceStatus(deviceId, {
        status: updatedDevice.status,
        wifiStatus: updatedDevice.wifiStatus,
        wifiConnectedAt: updatedDevice.wifiConnectedAt,
        wifiLastAttempt: updatedDevice.wifiLastAttempt,
        lastActiveAt: updatedDevice.lastActiveAt
      });
    } catch (wsError) {
      console.error("⚠️ WebSocket device status broadcast error (non-fatal):", wsError.message);
    }

    return res.json({
      success: true,
      message: `WiFi status updated: ${upperStatus}`,
      deviceId: updatedDevice.deviceId,
      wifiStatus: updatedDevice.wifiStatus,
      wifiConnectedAt: updatedDevice.wifiConnectedAt,
      wifiLastAttempt: updatedDevice.wifiLastAttempt
    });

  } catch (err) {
    console.error("❌ Error updating WiFi status:", err);
    res.status(500).json({ 
      success: false,
      message: "Internal server error",
      error: err.message 
    });
  }
});

// GET WiFi Status Endpoint - Frontend can check device WiFi connection status
router.get("/wifi-status/:deviceId", async (req, res) => {
  try {
    const { deviceId } = req.params;

    if (!deviceId) {
      return res.status(400).json({ 
        success: false,
        message: "deviceId is required" 
      });
    }

    // Find device
    const device = await Device.findOne({ deviceId }).select('deviceId wifiStatus wifiConnectedAt wifiLastAttempt status');
    
    if (!device) {
      return res.status(404).json({ 
        success: false,
        message: `Device ${deviceId} not found` 
      });
    }

    return res.json({
      success: true,
      deviceId: device.deviceId,
      wifiStatus: device.wifiStatus || null,
      wifiConnectedAt: device.wifiConnectedAt || null,
      wifiLastAttempt: device.wifiLastAttempt || null,
      deviceStatus: device.status,
      isConnected: device.wifiStatus === "CONNECTED"
    });

  } catch (err) {
    console.error("❌ Error fetching WiFi status:", err);
    res.status(500).json({ 
      success: false,
      message: "Internal server error",
      error: err.message 
    });
  }
});

module.exports = router;