const express = require("express");
const router = express.Router();
const HealthData = require("../models/HealthData");
const SleepData = require("../models/SleepData");
const SleepEpoch = require("../models/SleepEpoch");
const Device = require("../models/Device");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");

/**
 * GET /api/history
 * Fetch health and sleep data for a date range
 * Query params: start (yyyy-mm-dd), end (yyyy-mm-dd)
 */
router.get("/history", authMiddleware, async (req, res) => {
  try {
    const { start, end, deviceId } = req.query;
    const userId = req.user.userId || req.user._id;

    if (!start || !end) {
      return res.status(400).json({
        status: "fail",
        message: "Start and end dates are required (format: yyyy-mm-dd)",
      });
    }

    // Validate date format - support both date-only and full datetime
    let startDate, endDate;
    if (start.includes('T') || start.includes(' ')) {
      // Full datetime provided
      startDate = new Date(start);
      endDate = new Date(end);
    } else {
      // Date only - use full day range
      startDate = new Date(start + "T00:00:00.000Z");
      endDate = new Date(end + "T23:59:59.999Z");
    }

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid date format. Use yyyy-mm-dd",
      });
    }

    if (startDate > endDate) {
      return res.status(400).json({
        status: "fail",
        message: "Start date must be before or equal to end date",
      });
    }

    // Get user's active device(s)
    const Account = require('../models/Account');
    const user = await User.findById(userId).populate('account');
    if (!user) {
      return res.status(404).json({
        status: "fail",
        message: "User not found",
      });
    }

    // Build a broad device filter that covers all access paths:
    // 1. userId ownership  2. accountId  3. organizationId
    const deviceFilter = { $or: [{ userId: userId }] };
    if (user.account) {
      const accountIdStr = user.account.accountId || String(user.account._id);
      deviceFilter.$or.push({ accountId: accountIdStr });
      if (user.account.organizationId) {
        deviceFilter.$or.push({ organizationId: user.account.organizationId });
      }
    }
    // Superadmin: allow access to all devices
    if (req.user.role === 'superadmin') {
      delete deviceFilter.$or;
    }

    // If specific deviceId is provided in query, verify access then use it directly
    if (deviceId) {
      const normalizedDeviceId = String(deviceId).trim().toUpperCase();

      // Build the access check query
      const accessQuery = req.user.role === 'superadmin'
        ? { deviceId: normalizedDeviceId }
        : { deviceId: normalizedDeviceId, ...deviceFilter };

      const matchedDevice = await Device.findOne(accessQuery);
      if (!matchedDevice) {
        return res.status(403).json({
          status: "fail",
          message: "Device not found or access denied",
        });
      }
      deviceIds = [normalizedDeviceId];
    } else {
      // No specific device — get all accessible devices
      const accessibleDevices = await Device.find(deviceFilter);
      deviceIds = accessibleDevices.map((d) => d.deviceId);
    }

    if (deviceIds.length === 0) {
      return res.json([]);
    }

    // Fetch health data for the date range
    const { getTimeFilter, getSanitizedEpochSeconds } = require('../utils/timeFilterHelper');
    const timeFilter = getTimeFilter(startDate.getTime(), endDate.getTime());
    const healthData = await HealthData.find({
      deviceId: { $in: deviceIds },
      ...timeFilter,
    })
      .sort({ timestampSeconds: 1, timestamp: 1 })
      .lean();

    // Fetch sleep data for the date range
    const sleepData = await SleepData.find({
      userId: userId,
      timestamp: {
        $gte: startDate,
        $lte: endDate,
      },
    })
      .sort({ timestamp: 1 })
      .lean();

    // Fetch sleep epochs (AWAKE/LIGHT/DEEP/REM) for this device and time period
    const sleepEpochs = await SleepEpoch.find({
      deviceId: { $in: deviceIds },
      timestamp: {
        $gte: Math.floor(startDate.getTime() / 1000),
        $lte: Math.floor(endDate.getTime() / 1000),
      },
    }).lean();

    const sleepStageMap = new Map();
    sleepEpochs.forEach((epoch) => {
      if (epoch.timestamp && epoch.stage) {
        sleepStageMap.set(epoch.timestamp, epoch.stage);
      }
    });

    // Return raw health data with all sensor fields for export
    const rawData = healthData.map((item) => {
      const sanitizedTimestamp = new Date(getSanitizedEpochSeconds(item) * 1000);
      
      return {
        deviceId: item.deviceId || '',
        time: sanitizedTimestamp.toISOString(),
        timestamp: sanitizedTimestamp.getTime(),
        // Core sensor data
        heartRate: item.heartRate || item.metrics?.mean_hr || null,
        respiration: item.respiration || null,
        temperature: item.temperature || null,
        humidity: item.humidity || null,
        // Motion and presence
        motionStart: item.motionStart || null,
        motionEndReason: item.motionEndReason || null,
        absenceStart: item.absenceStart || null,
        absenceEnd: item.absenceEnd || null,
        // Snoring
        snoringStart: item.snoringStart || null,
        snoringStop: item.snoringStop || null,
        snoringFrequency: item.snoringFrequency || null,
        maxSnoreScore: item.maxSnoreScore || null,
        snoreDuration: item.snoreDuration || null,
        snoreCount: item.snoreCount || null,
        // RMS signal strengths
        respirationRMS: item.respirationRMS || null,
        bcgRMS: item.bcgRMS || null,
        motionRMS: item.motionRMS || null,
        // Environmental sensors
        pm10: item.pm10 || null,
        co2: item.co2 || item.metrics?.co2 || null,
        voc: item.voc || item.metrics?.bvoc || null,
        vocTVOC: item.vocTVOC || null,
        vocRawResistance: item.vocRawResistance || null,
        vocStatus: item.vocStatus || null,
        eventText: item.eventText || null,
        voltage: item.voltage || null,
        level: item.level || null,
        status: item.status || null,
        // Metrics
        stressIndex: item.metrics?.stress_ind || null,
        sleepStage: (() => {
          const epochSeconds = getSanitizedEpochSeconds(item);
          const rawStage = sleepStageMap.get(epochSeconds);
          if (rawStage) {
            if (rawStage === 'REM') return 'REM';
            return rawStage.charAt(0).toUpperCase() + rawStage.slice(1).toLowerCase();
          }
          return item.metrics?.SleepStage || null;
        })(),
        sleepQuality: item.metrics?.SleepQuality || null,
        meanHR: item.metrics?.mean_hr || null,
        HRrest: item.metrics?.HRrest || null,
        HRmax: item.metrics?.HRmax || null,
        temperatureSkin: item.metrics?.TemperatureSkin || null,
        temperatureEnv: item.metrics?.TemperatureEnv || null,
        temperatureCore: item.metrics?.TemperatureCore || null,
        steps: item.metrics?.Steps || null,
        calories: item.metrics?.Calories || null,
        distance: item.metrics?.Distance || null,
        bloodPressureSys: item.metrics?.BloodPressureSys || null,
        bloodPressureDia: item.metrics?.BloodPressureDia || null,
        // HRV metrics
        sdnn: item.metrics?.sdnn || null,
        rmssd: item.metrics?.rmssd || null,
        pnn50: item.metrics?.pnn50 || null,
        lf: item.metrics?.lf || item.metrics?.lf_pow || null,
        hf: item.metrics?.hf || item.metrics?.hf_pow || null,
        lfHfRatio: item.metrics?.lfhf || item.metrics?.lf_hf_ratio || null,
        // Signals
        motion: item.signals?.motion || null,
        presence: item.signals?.presence || null,
        activity: item.signals?.activity || null,
        battery: item.signals?.battery || null,
      };
    });

    return res.json(rawData);
  } catch (error) {
    console.error("Error fetching history:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to fetch history data",
      error: error.message,
    });
  }
});

module.exports = router;

