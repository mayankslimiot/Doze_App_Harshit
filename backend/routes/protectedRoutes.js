const express = require("express");
const User = require("../models/User");
const Device = require("../models/Device");
const HealthData = require("../models/HealthData");
const HealthData180s = require("../models/HealthData180s");
const SleepSession = require("../models/SleepSession");
const {
  calculateSleepSession,
  storeSleepSession,
  getSleepSession,
  getSleepSessions
} = require("../services/sleepAnalyticsService");
// Adjust paths/file names to your project
const Manufacturer = require('../models/Manufacturer');
const DeviceModel = require('../models/DeviceModel');
const Technology = require('../models/Technology');
const Port = require('../models/Port');
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const mongoose = require("mongoose");
const deviceController = require("../controllers/deviceManagementController");

const router = express.Router();

// GET /devices/details/:deviceId - Fetch device details by deviceId
router.get('/devices/details/:deviceId', authMiddleware, async (req, res) => {
    try {
        const { deviceId } = req.params;
        const device = await Device.findOne({ deviceId });
        if (!device) {
            return res.status(404).json({ message: 'Device not found' });
        }


        // derive model code (first 2 chars or digits)
        const modelCode = device.deviceId?.slice(0, 2);

        // lookup model  manufacturer
        const model = modelCode
            ? await DeviceModel.findOne({ code: modelCode }).populate("manufacturerId", "code name").lean()
            : null;

        const modelName = model?.name || null;
        const manufacturerName = model?.manufacturerId?.name || null;

        res.json({
            data: {
                ...device.toObject(),
                modelCode,
                modelName,
                manufacturerName,
            }
        });


    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// ✅ Fetch Devices Assigned to Logged-in User
// NOTE: This route is handled by /api/devices/user in device.js to avoid conflicts
// The device.js version includes _id field which is needed for activeDevice matching
// router.get("/devices/user", authMiddleware, async (req, res) => {
//   try {
//     const user = await User.findById(req.user.userId).lean();
//     if (!user) return res.status(404).json({ message: "User not found" });

//     // fetch all devices that belong to this user
//     const devices = await Device.find(
//       { userId: req.user.userId },
//       "deviceId name deviceType manufacturer firmwareVersion location status"
//     ).lean();

//     console.log("📋 Returning devices for user:", req.user.userId, devices.map(d => d.deviceId));

//     res.json({
//       devices,
//       activeDevice: user.activeDevice
//     });
//   } catch (error) {
//     console.error("Error fetching devices:", error);
//     res.status(500).json({ message: "Server error" });
//   }
// });


// ✅ Assign a Device to User (resilient to legacy orgId values)
router.post('/devices/assign', authMiddleware, async (req, res) => {
    try {
        const { deviceId } = req.body;
        const userId = req.user.userId;

        if (!deviceId?.trim()) {
            return res.status(400).json({ status: 'fail', message: 'Device ID is required' });
        }

        const device = await Device.findOne({ deviceId });
        if (!device) {
            return res.status(404).json({ status: 'fail', message: 'Device not found' });
        }

        // 1) assign device to user
        await Device.updateOne({ _id: device._id }, { $set: { userId } });

        // 2) add to user's devices and set activeDevice (no full validation)
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            {
                $addToSet: { devices: device._id },
                $set: { activeDevice: device._id }
            },
            { new: true } // runValidators defaults to false -> we avoid orgId cast
        ).select('devices role');

        // 3) promote to admin if >1 device
        if (updatedUser?.devices?.length > 1 && updatedUser.role !== 'admin') {
            await User.updateOne({ _id: userId }, { $set: { role: 'admin' } });
        }

        return res.json({
            status: 'success',
            message: 'Device assigned to logged-in user',
            data: { deviceId: device.deviceId }
        });
    } catch (error) {
        return res.status(500).json({ status: 'fail', message: error.message });
    }
});


// ✅ Remove a Device from app (owner only)
// Deletes the Device document (and its customName) from the devices collection.
// Health data in healthdata_new is intentionally preserved.
router.delete("/devices/remove/:deviceId", authMiddleware, async (req, res) => {
  try {
    const deviceIdParam = String(req.params.deviceId || "").trim().toUpperCase();
    const device = await Device.findOne({ deviceId: deviceIdParam });

    if (!device) {
      return res.status(404).json({ message: "Device not found" });
    }

    if (device.userId && device.userId.toString() !== req.user.userId.toString()) {
      return res.status(403).json({ message: "Only the device owner can remove it" });
    }

    // Remove deviceId from every caretaker's sharedDevices
    if (device.sharedWith && device.sharedWith.length > 0) {
      const caretakerIds = device.sharedWith.map((e) => e.userId).filter(Boolean);
      await User.updateMany(
        { _id: { $in: caretakerIds } },
        { $pull: { sharedDevices: device.deviceId } }
      );
    }

    // Remove from owner's devices (ObjectId) and ownedDevices (deviceId string)
    await User.findByIdAndUpdate(req.user.userId, {
      $pull: { devices: device._id, ownedDevices: device.deviceId }
    });

    // Also clear this device from the owner's activeDevices if present
    await User.findByIdAndUpdate(req.user.userId, {
      $pull: { activeDevices: device._id }
    });

    // Delete the device document entirely (customName deleted with it).
    // HealthData (healthdata_new) is NOT touched — data is preserved.
    await Device.deleteOne({ _id: device._id });

    res.json({ message: `Device ${device.deviceId} removed from your account` });
  } catch (error) {
    console.error("Error removing device:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Get weekly aggregated health data (7 days, one per day)
// Supports both heart-rate (default) and respiration metrics via ?metric=respiration
// IMPORTANT: This route must come BEFORE /data/health/:deviceId to avoid route conflicts
router.get("/data/health/weekly/:deviceId", authMiddleware, async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { weekStart, metric } = req.query; // Optional: ISO date string for week start (defaults to current week), metric: 'heart-rate' (default) or 'respiration'

        // Import timezone helper for IST calendar math
        const {
            getWeekStartIST,
            getWeekEndIST,
            getDayStartIST,
            getDayEndIST,
            getCycleStartIST,
            getCycleEndIST,
            isTodayIST,
            formatISTDate
        } = require('../utils/timezoneHelper');

        // Calculate week boundaries in IST, then convert to UTC for MongoDB queries
        let weekStartUTC, weekEndUTC;
        try {
            weekStartUTC = weekStart 
                ? getWeekStartIST(weekStart)  // Parse weekStart as IST date
                : getWeekStartIST(new Date()); // Current week in IST
            
            // Validate weekStartUTC
            if (!weekStartUTC || isNaN(weekStartUTC.getTime())) {
                throw new Error(`Invalid weekStartUTC calculated from weekStart: ${weekStart}`);
            }
            
            weekEndUTC = getWeekEndIST(weekStartUTC);
            
            // Validate weekEndUTC
            if (!weekEndUTC || isNaN(weekEndUTC.getTime())) {
                throw new Error(`Invalid weekEndUTC calculated from weekStartUTC`);
            }
        } catch (error) {
            console.error(`[WeeklyHeartRate] Error calculating week boundaries:`, error);
            console.error(`  weekStart input: ${weekStart}`);
            throw error;
        }

        // Defensive logging: Log IST ranges and UTC conversions
        try {
            const weekStartISTStr = formatISTDate(weekStartUTC);
            const weekEndISTStr = formatISTDate(weekEndUTC);
            console.log(`[WeeklyHeartRate] Device: ${deviceId}`);
            console.log(`  IST Range: ${weekStartISTStr} (Mon 00:00 IST) to ${weekEndISTStr} (Sun 23:59 IST)`);
            console.log(`  UTC Range: ${weekStartUTC.toISOString()} to ${weekEndUTC.toISOString()}`);
        } catch (error) {
            console.error(`[WeeklyHeartRate] Error formatting dates for logging:`, error);
            console.log(`[WeeklyHeartRate] Device: ${deviceId}`);
            console.log(`  UTC Range: ${weekStartUTC?.toISOString()} to ${weekEndUTC?.toISOString()}`);
        }

        // Generate array of 7 days (Mon-Sun)
        const weekData = [];
        const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

        // Determine which metric to query based on metric parameter
        const isRespiration = metric === 'respiration';
        const isStress = metric === 'stress';
        const fieldNames = isRespiration 
            ? { primary: 'respiration', secondary: 'resp' }
            : { primary: 'heartRate', secondary: 'hr' };

        for (let i = 0; i < 7; i++) {
            // Calculate day boundaries using 12 PM - 12 PM cycles for all metrics
            const dayStartUTC = getCycleStartIST(weekStartUTC, i);
            const dayEndUTC = getCycleEndIST(weekStartUTC, i);

            // Check if this is today in IST (for isPartial flag)
            const isToday = isTodayIST(dayStartUTC);
            const isPartial = isToday && new Date() < dayEndUTC;

            // Aggregate health data for this day (using UTC Date objects)
            let dayData;
            if (isStress) {
                // For stress, query HealthData180s and extract payload.stress_level
                dayData = await HealthData180s.aggregate([
                    {
                        $match: {
                            deviceId: deviceId,
                            timestamp: { $gte: dayStartUTC, $lte: dayEndUTC },
                            "payload.stress_level": { $exists: true, $ne: null, $ne: "" }
                        }
                    },
                    {
                        $addFields: {
                            stressLevel: {
                                $convert: {
                                    input: "$payload.stress_level",
                                    to: "double",
                                    onError: null,
                                    onNull: null
                                }
                            }
                        }
                    },
                    {
                        $match: {
                            stressLevel: { $gte: 0, $lte: 100 }
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            avg: { $avg: { $cond: [{ $gt: ["$stressLevel", 5] }, "$stressLevel", null] } },
                            min: { $min: "$stressLevel" },
                            max: { $max: "$stressLevel" },
                            count: { $sum: 1 }
                        }
                    }
                ]);
            } else {
                // For heart-rate and respiration, use HealthData
                dayData = await HealthData.aggregate([
                {
                    $match: {
                        deviceId: deviceId,
                        timestamp: { $gte: dayStartUTC, $lte: dayEndUTC },
                        $or: [
                            { [fieldNames.primary]: { $gt: 0 } },
                            { [fieldNames.secondary]: { $gt: 0 } }
                        ]
                    }
                },
                {
                    $group: {
                        _id: null,
                        avg: {
                            $avg: {
                                $ifNull: [`$${fieldNames.primary}`, `$${fieldNames.secondary}`]
                            }
                        },
                        min: {
                            $min: {
                                $ifNull: [`$${fieldNames.primary}`, `$${fieldNames.secondary}`]
                            }
                        },
                        max: {
                            $max: {
                                $ifNull: [`$${fieldNames.primary}`, `$${fieldNames.secondary}`]
                            }
                        },
                        count: { $sum: 1 }
                    }
                }
                ]);
            }

            const result = dayData[0] || null;

            // Format date as IST date string (YYYY-MM-DD)
            const dateStr = formatISTDate(dayStartUTC);

            weekData.push({
                day: dayNames[i],
                dayIndex: i,
                date: dateStr, // YYYY-MM-DD in IST
                avg: result && result.avg != null ? Math.round(result.avg * 10) / 10 : null, // Round to 1 decimal (null when all stress ≤5)
                min: result ? Math.round(result.min) : null,
                max: result ? Math.round(result.max) : null,
                isPartial: isPartial,
                count: result ? result.count : 0
            });
        }

        // Log query results for validation
        const totalRecords = weekData.reduce((sum, day) => sum + day.count, 0);
        console.log(`  Records found: ${totalRecords} total across 7 days`);

        res.json({
            success: true,
            deviceId,
            weekStart: weekStartUTC.toISOString(),
            weekEnd: weekEndUTC.toISOString(),
            data: weekData
        });

    } catch (error) {
        console.error("Error fetching weekly heart rate data:", error);
        res.status(500).json({ 
            success: false,
            message: "Server error",
            error: error.message 
        });
    }
});

// ✅ Get monthly aggregated health data (30 days, one per day)
// Supports both heart-rate (default) and respiration metrics via ?metric=respiration
// IMPORTANT: This route must come BEFORE /data/health/:deviceId to avoid route conflicts
router.get("/data/health/monthly/:deviceId", authMiddleware, async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { monthStart, metric } = req.query; // Optional: ISO date string for month start (defaults to current month), metric: 'heart-rate' (default) or 'respiration'

        // Import timezone helper for IST calendar math
        const {
            getMonthStartIST,
            getMonthEndIST,
            getDaysInMonthIST,
            getDayStartIST,
            getDayEndIST,
            getCycleStartIST,
            getCycleEndIST,
            isTodayIST,
            formatISTDate
        } = require('../utils/timezoneHelper');

        // Calculate month boundaries in IST, then convert to UTC for MongoDB queries
        const monthStartUTC = monthStart
            ? getMonthStartIST(monthStart)  // Parse monthStart as IST date
            : getMonthStartIST(new Date()); // Current month in IST
        
        const monthEndUTC = getMonthEndIST(monthStartUTC);
        const daysInMonth = getDaysInMonthIST(monthStartUTC);

        // Defensive logging: Log IST ranges and UTC conversions
        const monthStartISTStr = formatISTDate(monthStartUTC);
        const monthEndISTStr = formatISTDate(monthEndUTC);
        console.log(`[MonthlyHeartRate] Device: ${deviceId}`);
        console.log(`  IST Range: ${monthStartISTStr} (1st 00:00 IST) to ${monthEndISTStr} (last 23:59 IST)`);
        console.log(`  UTC Range: ${monthStartUTC.toISOString()} to ${monthEndUTC.toISOString()}`);
        console.log(`  Days in month: ${daysInMonth}`);

        // Determine which metric to query based on metric parameter
        const isRespiration = metric === 'respiration';
        const isStress = metric === 'stress';
        const fieldNames = isRespiration 
            ? { primary: 'respiration', secondary: 'resp' }
            : { primary: 'heartRate', secondary: 'hr' };

        // Generate array of days in month
        const monthData = [];

        for (let i = 0; i < daysInMonth; i++) {
            // Calculate day boundaries using 12 PM - 12 PM cycles for all metrics
            const dayStartUTC = getCycleStartIST(monthStartUTC, i);
            const dayEndUTC = getCycleEndIST(monthStartUTC, i);

            // Check if this is today in IST (for isPartial flag)
            const isToday = isTodayIST(dayStartUTC);
            const isPartial = isToday && new Date() < dayEndUTC;

            // Aggregate health data for this day (using UTC Date objects)
            let dayData;
            if (isStress) {
                // For stress, query HealthData180s and extract payload.stress_level
                dayData = await HealthData180s.aggregate([
                    {
                        $match: {
                            deviceId: deviceId,
                            timestamp: { $gte: dayStartUTC, $lte: dayEndUTC },
                            "payload.stress_level": { $exists: true, $ne: null, $ne: "" }
                        }
                    },
                    {
                        $addFields: {
                            stressLevel: {
                                $convert: {
                                    input: "$payload.stress_level",
                                    to: "double",
                                    onError: null,
                                    onNull: null
                                }
                            }
                        }
                    },
                    {
                        $match: {
                            stressLevel: { $gte: 0, $lte: 100 }
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            avg: { $avg: { $cond: [{ $gt: ["$stressLevel", 5] }, "$stressLevel", null] } },
                            min: { $min: "$stressLevel" },
                            max: { $max: "$stressLevel" },
                            count: { $sum: 1 }
                        }
                    }
                ]);
            } else {
                // For heart-rate and respiration, use HealthData
                dayData = await HealthData.aggregate([
                {
                    $match: {
                        deviceId: deviceId,
                        timestamp: { $gte: dayStartUTC, $lte: dayEndUTC },
                        $or: [
                            { [fieldNames.primary]: { $gt: 0 } },
                            { [fieldNames.secondary]: { $gt: 0 } }
                        ]
                    }
                },
                {
                    $group: {
                        _id: null,
                        avg: {
                            $avg: {
                                $ifNull: [`$${fieldNames.primary}`, `$${fieldNames.secondary}`]
                            }
                        },
                        min: {
                            $min: {
                                $ifNull: [`$${fieldNames.primary}`, `$${fieldNames.secondary}`]
                            }
                        },
                        max: {
                            $max: {
                                $ifNull: [`$${fieldNames.primary}`, `$${fieldNames.secondary}`]
                            }
                        },
                        count: { $sum: 1 }
                    }
                }
                ]);
            }

            const result = dayData[0] || null;

            // Format date as IST date string (YYYY-MM-DD)
            const dateStr = formatISTDate(dayStartUTC);

            monthData.push({
                day: i + 1, // Day of month (1-31)
                dayIndex: i, // Index (0-30)
                date: dateStr, // YYYY-MM-DD in IST
                avg: result && result.avg != null ? Math.round(result.avg * 10) / 10 : null, // Round to 1 decimal (null when all stress ≤5)
                min: result ? Math.round(result.min) : null,
                max: result ? Math.round(result.max) : null,
                isPartial: isPartial,
                count: result ? result.count : 0
            });
        }

        // Log query results for validation
        const totalRecords = monthData.reduce((sum, day) => sum + day.count, 0);
        console.log(`  Records found: ${totalRecords} total across ${daysInMonth} days`);

        res.json({
            success: true,
            deviceId,
            monthStart: monthStartUTC.toISOString(),
            monthEnd: monthEndUTC.toISOString(),
            daysInMonth: daysInMonth,
            data: monthData
        });

    } catch (error) {
        console.error("Error fetching monthly heart rate data:", error);
        res.status(500).json({ 
            success: false,
            message: "Server error",
            error: error.message 
        });
    }
});

// ✅ Get raw health data for a specific device (no averaging/preprocessing)
// IMPORTANT: This route must come BEFORE /data/health/:deviceId to avoid route conflicts
router.get("/data/health/raw/:deviceId", authMiddleware, async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { start, end, limit, page } = req.query;
        const query = { deviceId: deviceId };
        if (start && end) {
            query.timestamp = {
                $gte: new Date(start),
                $lte: new Date(end)
            };
        } else if (start && end) {
            query.timestamp = { $gte: new Date(start), $lte: new Date(end) };
        } else if (start) {
            query.timestamp = { $gte: new Date(start) };
        } else if (end) {
            query.timestamp = { $lte: new Date(end) };
        }

        // Pagination
        const pageNumber = page ? parseInt(page) : 1;
        const limitNumber = limit ? parseInt(limit) : 1000;
        const skip = (pageNumber - 1) * limitNumber;

        // Fetch with UART fields
        const healthData = await HealthData.find(query)
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(limitNumber)
            .select("+metrics +signals +raw");

        const totalCount = await HealthData.countDocuments(query);

        res.json({
            status: "success",
            data: healthData,
            pagination: {
                currentPage: pageNumber,
                totalPages: Math.ceil(totalCount / limitNumber),
                totalRecords: totalCount,
                recordsPerPage: limitNumber,
                hasNextPage: pageNumber < Math.ceil(totalCount / limitNumber),
                hasPrevPage: pageNumber > 1
            },
            deviceId
        });

    } catch (error) {
        console.error("Error fetching raw health data:", error);
        res.status(500).json({
            status: "fail",
            message: "Server error",
            error: error.message
        });
    }
});

// ✅ Get heart rate graph data (backend-owned aggregation)
// IMPORTANT: This route must come BEFORE /data/health/:deviceId to avoid route conflicts
router.get("/data/health/heart-rate/graph/:deviceId", authMiddleware, async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { zoomLevel = '0', raw = 'false', start, end } = req.query; // start/end = ms for date range (e.g. previous day)

        const zoomIndex = parseInt(zoomLevel, 10);
        if (isNaN(zoomIndex) || zoomIndex < 0 || zoomIndex > 7) {
            return res.status(400).json({
                success: false,
                message: "Invalid zoomLevel. Must be between 0 and 7"
            });
        }

        // Verify device access
        const device = await Device.findOne({ deviceId });
        if (!device) {
            return res.status(404).json({
                success: false,
                message: "Device not found"
            });
        }

        // Check user access (owner, account, admin, devices array, OR shared/caretaker)
        const user = await User.findById(req.user.userId).select("devices accountId sharedDevices");
        const deviceIdUpper = deviceId.trim().toUpperCase();
        const hasAccess = 
            (device.userId && device.userId.toString() === req.user.userId) ||
            (device.accountId && user?.accountId && device.accountId === user.accountId) ||
            req.user.role === "admin" ||
            req.user.role === "superadmin" ||
            (user && user.devices && user.devices.some(d => d.toString() === device._id.toString())) ||
            (user && user.sharedDevices && user.sharedDevices.some(id => String(id).trim().toUpperCase() === deviceIdUpper)) ||
            (Array.isArray(device.sharedWith) && device.sharedWith.some(e => e.userId && String(e.userId) === String(req.user.userId)));

        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                message: "Access denied to this device"
            });
        }

        const now = Date.now();
        let queryStart, queryEnd;
        
        if (start != null && end != null) {
            queryStart = parseInt(start, 10);
            queryEnd = parseInt(end, 10);
        } else {
            // Default: Show the CURRENT CYCLE (12:00 PM to 12:00 PM)
            const { getCycleStartIST, getCycleEndIST, getISTComponents } = require('../utils/timezoneHelper');
            const nowUTC = new Date();
            const ist = getISTComponents(nowUTC);
            
            // If it's before 12 PM IST, we are in the cycle ending today at 12 PM
            // If it's after 12 PM IST, we are in the cycle ending tomorrow at 12 PM
            const offset = ist.hours >= 12 ? 1 : 0;
            queryStart = getCycleStartIST(nowUTC, offset).getTime();
            queryEnd = getCycleEndIST(nowUTC, offset).getTime();
        }

        // ✅ CRITICAL: Fetch raw health data including null values (gaps)
        // Include records with heartRate=null (gaps) AND valid heartRate values
        // Exclude only invalid values (heartRate=0)
        const rawData = await HealthData.find({
            deviceId: deviceId,
            timestamp: {
                $gte: new Date(queryStart),
                $lte: new Date(queryEnd)
            },
            $or: [
                { heartRate: null }, // Include null gaps
                { heartRate: { $gt: 0, $lt: 250 } }, // Include valid heart rates
                { hr: { $gt: 0, $lt: 250 } }, // Legacy field
                { bpm: { $gt: 0, $lt: 250 } } // Legacy field
            ]
        })
        .sort({ timestamp: 1 }) // Oldest first
        .select("timestamp heartRate hr bpm")
        .lean();

        // ✅ If raw=true, return raw data points without aggregation (for buffer hydration)
        if (raw === 'true') {
            // Convert raw data to graph format (x: timestamp, y: heartRate value)
            const rawPoints = rawData.map(item => {
                const timestamp = new Date(item.timestamp).getTime();
                // Use heartRate, hr, or bpm (in that order)
                const value = item.heartRate !== undefined ? item.heartRate : 
                             (item.hr !== undefined ? item.hr : 
                             (item.bpm !== undefined ? item.bpm : null));
                
                return {
                    x: timestamp,
                    y: value // Can be null for gaps
                };
            });

            // Calculate domain from raw data
            const timestamps = rawPoints.map(p => p.x).filter(t => Number.isFinite(t));
            const values = rawPoints.map(p => p.y).filter(v => v !== null && v > 0 && v < 250);
            
            const xDomain = timestamps.length > 0 
                ? [Math.min(...timestamps), Math.max(...timestamps)]
                : [queryStart, queryEnd];
            
            const yDomain = values.length > 0
                ? [Math.max(40, Math.min(...values) - 10), Math.min(150, Math.max(...values) + 10)]
                : [40, 150];

            const { getZoomLevel } = require('../config/zoomLevels');
            const zoomLevelConfig = getZoomLevel(zoomIndex);

            return res.json({
                success: true,
                data: {
                    points: rawPoints,
                    xDomain: xDomain,
                    yDomain: yDomain,
                    zoomLevel: {
                        index: zoomIndex,
                        label: zoomLevelConfig.label,
                        rangeSec: zoomLevelConfig.rangeSec
                    }
                }
            });
        }

        // ✅ Default: Aggregate data using backend logic (for graph display)
        const { getTimeWindow } = require('../config/zoomLevels');
        const viewportWindow = getTimeWindow(zoomIndex);
        const { aggregateHeartRateGraph } = require('../utils/graphAggregation');
        const graphData = aggregateHeartRateGraph(rawData, zoomIndex, null, viewportWindow);

        res.json({
            success: true,
            data: graphData
        });
    } catch (error) {
        console.error("Error fetching heart rate graph data:", error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
});

// ✅ Get respiration graph data for a specific device (optimized endpoint for pre-loading)
router.get("/data/health/respiration/graph/:deviceId", authMiddleware, async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { zoomLevel = '0', raw = 'false', start, end } = req.query; // start/end = ms for date range (e.g. previous day)

        const zoomIndex = parseInt(zoomLevel, 10);
        if (isNaN(zoomIndex) || zoomIndex < 0 || zoomIndex > 7) {
            return res.status(400).json({
                success: false,
                message: "Invalid zoomLevel. Must be between 0 and 7"
            });
        }

        // Verify device access
        const device = await Device.findOne({ deviceId });
        if (!device) {
            return res.status(404).json({
                success: false,
                message: "Device not found"
            });
        }

        // Check user access (owner, account, admin, devices array, OR shared/caretaker)
        const user = await User.findById(req.user.userId).select("devices accountId sharedDevices");
        const deviceIdUpper = deviceId.trim().toUpperCase();
        const hasAccess = 
            (device.userId && device.userId.toString() === req.user.userId) ||
            (device.accountId && user?.accountId && device.accountId === user.accountId) ||
            req.user.role === "admin" ||
            req.user.role === "superadmin" ||
            (user && user.devices && user.devices.some(d => d.toString() === device._id.toString())) ||
            (user && user.sharedDevices && user.sharedDevices.some(id => String(id).trim().toUpperCase() === deviceIdUpper)) ||
            (Array.isArray(device.sharedWith) && device.sharedWith.some(e => e.userId && String(e.userId) === String(req.user.userId)));

        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                message: "Access denied to this device"
            });
        }

        const now = Date.now();
        let queryStart, queryEnd;
        
        if (start != null && end != null) {
            const startMs = parseInt(start, 10);
            const endMs = parseInt(end, 10);
            if (Number.isFinite(startMs) && Number.isFinite(endMs) && startMs < endMs) {
                queryStart = startMs;
                queryEnd = endMs;
            } else {
                queryStart = now - (24 * 60 * 60 * 1000);
                queryEnd = now;
            }
        } else {
            // Default: Show the CURRENT CYCLE (12:00 PM to 12:00 PM) — matching heart rate
            const { getCycleStartIST, getCycleEndIST, getISTComponents } = require('../utils/timezoneHelper');
            const nowUTC = new Date();
            const ist = getISTComponents(nowUTC);
            
            // If it's before 12 PM IST, we are in the cycle ending today at 12 PM
            // If it's after 12 PM IST, we are in the cycle ending tomorrow at 12 PM
            const offset = ist.hours >= 12 ? 1 : 0;
            queryStart = getCycleStartIST(nowUTC, offset).getTime();
            queryEnd = getCycleEndIST(nowUTC, offset).getTime();
        }

        // ✅ CRITICAL: Fetch raw health data including null values (gaps)
        // Include records with respiration=null (gaps) AND valid respiration values
        const rawData = await HealthData.find({
            deviceId: deviceId,
            timestamp: {
                $gte: new Date(queryStart),
                $lte: new Date(queryEnd)
            },
            $or: [
                { respiration: null }, // Include null gaps
                { respiration: { $gt: 0, $lt: 50 } }, // Include valid respiration rates
                { resp: { $gt: 0, $lt: 50 } } // Legacy field
            ]
        })
        .sort({ timestamp: 1 }) // Oldest first
        .select("timestamp respiration resp")
        .lean();

        // ✅ If raw=true, return raw data points without aggregation (for buffer hydration)
        if (raw === 'true') {
            // Convert raw data to graph format (x: timestamp, y: respiration value)
            const rawPoints = rawData.map(item => {
                const timestamp = new Date(item.timestamp).getTime();
                // Use respiration or resp (in that order)
                const value = item.respiration !== undefined ? item.respiration : 
                             (item.resp !== undefined ? item.resp : null);
                
                return {
                    x: timestamp,
                    y: value // Can be null for gaps
                };
            });

            // Calculate domain from raw data
            const timestamps = rawPoints.map(p => p.x).filter(t => Number.isFinite(t));
            const values = rawPoints.map(p => p.y).filter(v => v !== null && v > 0 && v < 50);
            
            const xDomain = timestamps.length > 0 
                ? [Math.min(...timestamps), Math.max(...timestamps)]
                : [queryStart, queryEnd];
            
            const yDomain = values.length > 0
                ? [Math.max(0, Math.min(...values) - 2), Math.min(20, Math.max(...values) + 2)]
                : [0, 20];

            const { getZoomLevel } = require('../config/zoomLevels');
            const zoomLevelConfig = getZoomLevel(zoomIndex);

            return res.json({
                success: true,
                data: {
                    points: rawPoints,
                    xDomain: xDomain,
                    yDomain: yDomain,
                    zoomLevel: {
                        index: zoomIndex,
                        label: zoomLevelConfig.label,
                        rangeSec: zoomLevelConfig.rangeSec
                    }
                }
            });
        }

        // ✅ Default: Aggregate data using backend logic (for graph display)
        const { getTimeWindow } = require('../config/zoomLevels');
        const viewportWindow = getTimeWindow(zoomIndex);
        const { aggregateRespirationGraph } = require('../utils/graphAggregation');
        const graphData = aggregateRespirationGraph(rawData, zoomIndex, null, viewportWindow);

        res.json({
            success: true,
            data: graphData
        });
    } catch (error) {
        console.error("Error fetching respiration graph data:", error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
});

// ✅ Get stress graph data for a specific device (Day view - returns raw points, no aggregation)
router.get("/data/health/stress/graph/:deviceId", authMiddleware, async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { from, to } = req.query; // Date range: from and to ISO strings
        
        // Verify device access
        const device = await Device.findOne({ deviceId });
        if (!device) {
            return res.status(404).json({
                success: false,
                message: "Device not found"
            });
        }

        // Check user access (owner, account, admin, devices array, OR shared/caretaker)
        const user = await User.findById(req.user.userId).select("devices accountId sharedDevices");
        const deviceIdUpper = deviceId.trim().toUpperCase();
        const hasAccess = 
            (device.userId && device.userId.toString() === req.user.userId) ||
            (device.accountId && user?.accountId && device.accountId === user.accountId) ||
            req.user.role === "admin" ||
            req.user.role === "superadmin" ||
            (user && user.devices && user.devices.some(d => d.toString() === device._id.toString())) ||
            (user && user.sharedDevices && user.sharedDevices.some(id => String(id).trim().toUpperCase() === deviceIdUpper)) ||
            (Array.isArray(device.sharedWith) && device.sharedWith.some(e => e.userId && String(e.userId) === String(req.user.userId)));

        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                message: "Access denied to this device"
            });
        }

        // Build query for HealthData180s collection
        const query = {
            deviceId: deviceId,
            "payload.stress_level": { $exists: true, $ne: null, $ne: "" } // Only documents with stress_level
        };

        // Add timestamp filter if from/to provided
        if (from && to) {
            query.timestamp = {
                $gte: new Date(from),
                $lte: new Date(to)
            };
        } else {
            // Default: Show the CURRENT CYCLE (12:00 PM to 12:00 PM) — matching heart rate and respiration
            const { getCycleStartIST, getCycleEndIST, getISTComponents } = require('../utils/timezoneHelper');
            const nowUTC = new Date();
            const ist = getISTComponents(nowUTC);
            
            // If it's before 12 PM IST, we are in the cycle ending today at 12 PM
            // If it's after 12 PM IST, we are in the cycle ending tomorrow at 12 PM
            const offset = ist.hours >= 12 ? 1 : 0;
            const cycleStart = getCycleStartIST(nowUTC, offset);
            const cycleEnd = getCycleEndIST(nowUTC, offset);
            
            query.timestamp = {
                $gte: cycleStart,
                $lte: cycleEnd
            };
        }

        // Fetch raw stress data from healthdata_180s collection
        const rawData = await HealthData180s.find(query)
            .sort({ timestamp: 1 }) // Oldest first
            .select("timestamp payload.stress_level")
            .lean();

        // Transform to API response format: [{timestamp, stress_level}, ...]
        const points = rawData
            .map(doc => {
                const stressLevel = doc.payload?.stress_level;
                // Only include if stress_level exists and is not empty
                if (stressLevel == null || stressLevel === "") {
                    return null;
                }
                return {
                    timestamp: doc.timestamp, // ISO date string
                    stress_level: stressLevel // String like "51.05"
                };
            })
            .filter(p => p !== null); // Remove null entries

        console.log(`[Stress Graph API] Device: ${deviceId}, Points: ${points.length}, From: ${from || '24h ago'}, To: ${to || 'now'}`);

        res.json({
            success: true,
            points: points
        });
    } catch (error) {
        console.error("Error fetching stress graph data:", error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
});

// ✅ Get health data for a specific device
// NOTE: This general route must come AFTER specific routes (weekly, monthly, raw, graph) to avoid conflicts
router.get("/data/health/:deviceId", authMiddleware, async (req, res) => {
    try {
        // Get query parameters for filtering
        const { start, end, limit, fields, order } = req.query;

        // Build query
        const query = { deviceId: req.params.deviceId };
        if (start && end) {
            query.timestamp = {
                $gte: new Date(start),
                $lte: new Date(end)
            };
        }

        const parsedLimit = Number.parseInt(limit, 10);
        const limitNumber = Number.isFinite(parsedLimit) && parsedLimit > 0
            ? Math.min(parsedLimit, 10000)
            : 1000;

        const requestedFields = typeof fields === "string" ? fields.toLowerCase() : "";
        const isMotionOnly = requestedFields === "motion";
        const projection = isMotionOnly
            ? "timestamp motionStart motionEndReason"
            : "+metrics +signals +raw";

        // Determine sort order: 'asc' for chronological (oldest first), default is 'desc' (newest first)
        // Motion data needs ASC order for proper pairing
        const sortOrder = order === "asc" ? 1 : -1;

        // Query with optional limit and sorting
        const healthData = await HealthData.find(query)
            .sort({ timestamp: sortOrder }) // ASC for motion pairing, DESC for general queries
            .limit(limitNumber)
            .select(projection)
            .lean();

        res.json(healthData);
    } catch (error) {
        console.error("Error fetching health data:", error);
        res.status(500).json({ message: "Server error" });
    }
});

// ✅ Get sleep session for a specific device and date
router.get("/sleep/session/:deviceId", authMiddleware, async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { date } = req.query; // YYYY-MM-DD format

        // Verify device access
        const device = await Device.findOne({ deviceId });
        if (!device) {
            return res.status(404).json({
                success: false,
                message: "Device not found"
            });
        }

        // Check user access (owner, account, admin, devices array, OR shared/caretaker)
        const user = await User.findById(req.user.userId).select("devices accountId sharedDevices");
        const hasAccess = 
            (device.userId && device.userId.toString() === req.user.userId) ||
            (device.accountId && user?.accountId && device.accountId === user.accountId) ||
            req.user.role === "admin" ||
            req.user.role === "superadmin" ||
            (user && user.devices && user.devices.some(d => d.toString() === device._id.toString())) ||
            (user && user.sharedDevices && user.sharedDevices.some(id => String(id).trim().toUpperCase() === device.deviceId)) ||
            (Array.isArray(device.sharedWith) && device.sharedWith.some(e => e.userId && String(e.userId) === String(req.user.userId)));

        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                message: "Access denied to this device"
            });
        }

        // Use provided date or default to today (IST)
        // Sleep spans 2 days: for "date D" we want sleep that ends on D (night of D-1 → morning of D).
        // Query window: (D-1) 12:00 IST (noon) → D 23:59:59.999 IST (end of D) so we include all of 12th and 13th.
        const { formatISTDate, getISTComponents, createFromISTComponents, parseISTDate, getDayEndIST } = require('../utils/timezoneHelper');
        // Interpret query date as IST calendar date
        const targetDate = date ? parseISTDate(date) : new Date();

        // Start: (selectedDate - 1 day) 12:00 PM IST (noon of previous day)
        const previousDay = new Date(targetDate.getTime() - 24 * 60 * 60 * 1000);
        const previousDayComponents = getISTComponents(previousDay);
        const dayStartUTC = createFromISTComponents(
            previousDayComponents.year,
            previousDayComponents.month,
            previousDayComponents.date,
            12, 0, 0  // 12:00 PM (noon)
        );

        // End: end of selected date in IST (23:59:59.999) so we get full 13th including sleep that ends after noon
        const dayEndUTC = getDayEndIST(targetDate, 0);

        const sessionDate = date || formatISTDate(new Date());
        const resolvedDeviceId = device.deviceId;

        // For "today" (IST), always recalculate so we get fresh data (e.g. after wake-up).
        // Past dates use cache to avoid redundant work.
        const todayIST = formatISTDate(new Date());
        const isToday = sessionDate === todayIST;

        let session = null;
        if (!isToday) {
            session = await getSleepSession(resolvedDeviceId, sessionDate);
        }

        // If no session (past date cache miss) or requested date is today, calculate and store/update
        if (!session) {
            const calculatedSession = await calculateSleepSession(resolvedDeviceId, dayStartUTC, dayEndUTC, sessionDate);

            if (calculatedSession) {
                session = await storeSleepSession(calculatedSession, req.user.userId);
            }
        }

        if (!session) {
            return res.json({
                success: true,
                data: null,
                message: "No valid sleep session found for this date"
            });
        }

        res.json({
            success: true,
            data: session
        });
    } catch (error) {
        console.error("Error fetching sleep session:", error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
});

// ✅ Get sleep sessions for a date range
router.get("/sleep/sessions/:deviceId", authMiddleware, async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { start, end } = req.query; // ISO date strings

        // Verify device access
        const device = await Device.findOne({ deviceId });
        if (!device) {
            return res.status(404).json({
                success: false,
                message: "Device not found"
            });
        }

        // Check user access (owner, account, admin, devices array, OR shared/caretaker)
        const user = await User.findById(req.user.userId).select("devices accountId sharedDevices");
        const hasAccess = 
            (device.userId && device.userId.toString() === req.user.userId) ||
            (device.accountId && user?.accountId && device.accountId === user.accountId) ||
            req.user.role === "admin" ||
            req.user.role === "superadmin" ||
            (user && user.devices && user.devices.some(d => d.toString() === device._id.toString())) ||
            (user && user.sharedDevices && user.sharedDevices.some(id => String(id).trim().toUpperCase() === device.deviceId)) ||
            (Array.isArray(device.sharedWith) && device.sharedWith.some(e => e.userId && String(e.userId) === String(req.user.userId)));

        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                message: "Access denied to this device"
            });
        }

        // Default to last 7 days if no range provided
        const endDate = end ? new Date(end) : new Date();
        const startDate = start ? new Date(start) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const sessions = await getSleepSessions(deviceId, startDate, endDate);

        res.json({
            success: true,
            data: sessions,
            count: sessions.length
        });
    } catch (error) {
        console.error("Error fetching sleep sessions:", error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
});

// ✅ Calculate and store sleep session for a specific date
router.post("/sleep/calculate/:deviceId", authMiddleware, async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { date } = req.body; // YYYY-MM-DD format (optional, defaults to today)

        // Verify device access
        const device = await Device.findOne({ deviceId });
        if (!device) {
            return res.status(404).json({
                success: false,
                message: "Device not found"
            });
        }

        // Check user access (owner, account, admin, devices array, OR shared/caretaker)
        const user = await User.findById(req.user.userId).select("devices accountId sharedDevices");
        const hasAccess = 
            (device.userId && device.userId.toString() === req.user.userId) ||
            (device.accountId && user?.accountId && device.accountId === user.accountId) ||
            req.user.role === "admin" ||
            req.user.role === "superadmin" ||
            (user && user.devices && user.devices.some(d => d.toString() === device._id.toString())) ||
            (user && user.sharedDevices && user.sharedDevices.some(id => String(id).trim().toUpperCase() === device.deviceId)) ||
            (Array.isArray(device.sharedWith) && device.sharedWith.some(e => e.userId && String(e.userId) === String(req.user.userId)));

        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                message: "Access denied to this device"
            });
        }

        // Calculate date range for sleep session
        // Changed to 12 noon to 12 noon: For selected date, query (previous day 12 PM) to (selected date 12 PM)
        // Example: For date Feb 11, query Feb 10 12:00 PM → Feb 11 12:00 PM (sleep that ends on Feb 11)
        const { getISTComponents, createFromISTComponents } = require('../utils/timezoneHelper');
        const targetDate = date ? new Date(date + 'T00:00:00') : new Date();
        
        // Get IST components of target date
        const istComponents = getISTComponents(targetDate);
        
        // Start: (selectedDate - 1 day) 12:00 PM IST (noon of previous day)
        const previousDay = new Date(targetDate.getTime() - 24 * 60 * 60 * 1000);
        const previousDayComponents = getISTComponents(previousDay);
        const noonStartUTC = createFromISTComponents(
            previousDayComponents.year,
            previousDayComponents.month,
            previousDayComponents.date,
            12, 0, 0  // 12:00 PM (noon)
        );
        
        // End: selectedDate 12:00 PM IST (noon of selected date)
        const noonEndUTC = createFromISTComponents(
            istComponents.year,
            istComponents.month,
            istComponents.date,
            12, 0, 0  // 12:00 PM (noon)
        );
        
        const dayStartUTC = noonStartUTC;
        const dayEndUTC = noonEndUTC;
        
        // Use provided date or default to today (IST) as sessionDate
        const { formatISTDate } = require('../utils/timezoneHelper');
        const sessionDate = date || formatISTDate(new Date());

        // Calculate sleep session
        // Pass sessionDate (query date) to use as sessionDate - sleep end date, not sleep start date
        const calculatedSession = await calculateSleepSession(deviceId, dayStartUTC, dayEndUTC, sessionDate);

        if (!calculatedSession) {
            return res.json({
                success: false,
                message: "No valid sleep session found. Sleep must be at least 3 hours with 90% data quality."
            });
        }

        // Store the session
        const session = await storeSleepSession(calculatedSession, req.user.userId);

        res.json({
            success: true,
            data: session,
            message: "Sleep session calculated and stored successfully"
        });
    } catch (error) {
        console.error("Error calculating sleep session:", error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
});

// ✅ Get sleep data for a specific device (legacy route - kept for backward compatibility)
router.get("/data/sleep/:deviceId", authMiddleware, async (req, res) => {
    try {
        // Get query parameters for filtering
        const { start, end, limit } = req.query;

        // Build query
        const query = { deviceId: req.params.deviceId };
        if (start && end) {
            query.timestamp = {
                $gte: new Date(start),
                $lte: new Date(end)
            };
        }

        // Query sleep sessions instead of SleepData
        const sleepSessions = await SleepSession.find(query)
            .sort({ tibStart: -1 }) // Newest first
            .limit(limit ? parseInt(limit) : 100)
            .lean();

        res.json(sleepSessions);
    } catch (error) {
        console.error("Error fetching sleep data:", error);
        res.status(500).json({ message: "Server error" });
    }
});

// ✅ Get historical data with aggregation - using only HealthData model
router.get("/data/history/:deviceId", authMiddleware, async (req, res) => {
    try {
        const { period = '24h' } = req.query; // Default to 24 hours
        const deviceId = req.params.deviceId;

        // Calculate time periods and aggregation intervals
        const endDate = new Date();
        let startDate, aggregationMinutes;

        switch (period) {
            case '24h':
                startDate = new Date(endDate - 24 * 60 * 60 * 1000);
                aggregationMinutes = 5; // 5-minute intervals
                break;
            case '48h':
                startDate = new Date(endDate - 48 * 60 * 60 * 1000);
                aggregationMinutes = 10; // 10-minute intervals
                break;
            case '72h':
                startDate = new Date(endDate - 72 * 60 * 60 * 1000);
                aggregationMinutes = 15; // 15-minute intervals
                break;
            case '7d':
                startDate = new Date(endDate - 7 * 24 * 60 * 60 * 1000);
                aggregationMinutes = 60; // 1-hour intervals
                break;
            case '30d':
                startDate = new Date(endDate - 30 * 24 * 60 * 60 * 1000);
                aggregationMinutes = 360; // 6-hour intervals
                break;
            default:
                startDate = new Date(endDate - 24 * 60 * 60 * 1000);
                aggregationMinutes = 5;
        }

        console.log(`Fetching historical data for ${deviceId} from ${startDate} to ${endDate} with ${aggregationMinutes}min intervals`);

        // Comprehensive aggregation pipeline for health data including all metrics
        const healthData = await HealthData.aggregate([
            {
                $match: {
                    deviceId: deviceId,
                    timestamp: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: {
                        // Group by time interval (truncate to nearest aggregationMinutes)
                        year: { $year: "$timestamp" },
                        month: { $month: "$timestamp" },
                        day: { $dayOfMonth: "$timestamp" },
                        hour: { $hour: "$timestamp" },
                        interval: {
                            $subtract: [
                                { $minute: "$timestamp" },
                                { $mod: [{ $minute: "$timestamp" }, aggregationMinutes] }
                            ]
                        }
                    },
                    timestamp: { $first: "$timestamp" },
                    // Use temperature field (from schema) with fallback to temp for backward compatibility
                    temp: { 
                        $avg: {
                            $ifNull: ["$temperature", "$temp"]
                        }
                    },
                    temperature: { 
                        $avg: {
                            $ifNull: ["$temperature", "$temp"]
                        }
                    },
                    humidity: { $avg: "$humidity" },
                    iaq: { $avg: "$iaq" },
                    eco2: { $avg: "$eco2" },
                    tvoc: { $avg: "$tvoc" },
                    etoh: { $avg: "$etoh" },
                    hrv: { $avg: "$hrv" },
                    stress: { $avg: "$stress" },
                    // Use heartRate field with fallback to hr for backward compatibility
                    heartRate: { 
                        $avg: {
                            $ifNull: ["$heartRate", "$hr"]
                        }
                    },
                    hr: { 
                        $avg: {
                            $ifNull: ["$heartRate", "$hr"]
                        }
                    },
                    respiration: { $avg: "$respiration" },
                    resp: { $avg: "$respiration" },

                    // ✅ HRV UART Metrics
                    sdnn: { $avg: "$metrics.sdnn" },
                    rmssd: { $avg: "$metrics.rmssd" },
                    lf: { $avg: "$metrics.lf" },
                    hf: { $avg: "$metrics.hf" },
                    lfhf: { $avg: "$metrics.lfhf" }
                }
            },
            {
                $project: {
                    _id: 0,
                    timestamp: 1,
                    // Round all values to nearest integer
                    // Use temperature if available, fallback to temp
                    temp: { 
                        $round: [
                            { $ifNull: ["$temperature", "$temp"] }, 
                            0
                        ] 
                    },
                    temperature: { 
                        $round: [
                            { $ifNull: ["$temperature", "$temp"] }, 
                            0
                        ] 
                    },
                    humidity: { $round: ["$humidity", 0] },
                    iaq: { $round: ["$iaq", 0] },
                    eco2: { $round: ["$eco2", 0] },
                    tvoc: { $round: ["$tvoc", 0] },
                    etoh: { $round: ["$etoh", 2] },
                    hrv: { $round: [{ $ifNull: ["$hrv", 0] }, 0] },
                    stress: { $round: [{ $ifNull: ["$stress", 0] }, 0] },
                    // Use heartRate with fallback to hr, handle null values
                    heartRate: { 
                        $round: [
                            { $ifNull: [{ $ifNull: ["$heartRate", "$hr"] }, 0] }, 
                            0
                        ] 
                    },
                    hr: { 
                        $round: [
                            { $ifNull: [{ $ifNull: ["$heartRate", "$hr"] }, 0] }, 
                            0
                        ] 
                    },
                    respiration: { 
                        $round: [
                            { $ifNull: [{ $ifNull: ["$respiration", "$resp"] }, 0] }, 
                            0
                        ] 
                    },
                    resp: { 
                        $round: [
                            { $ifNull: [{ $ifNull: ["$respiration", "$resp"] }, 0] }, 
                            0
                        ] 
                    },
                    sdnn: { $round: ["$sdnn", 0] },
                    rmssd: { $round: ["$rmssd", 0] },
                    lf: { $round: ["$lf", 0] },
                    hf: { $round: ["$hf", 0] },
                    lfhf: { $round: ["$lfhf", 2] }
                }
            },
            {
                $sort: { "timestamp": 1 }
            }
        ]);

        res.json({
            period,
            aggregationMinutes,
            data: healthData
        });

    } catch (error) {
        console.error("Error fetching historical data:", error);
        res.status(500).json({ message: "Server error" });
    }
});

// ✅ Manually update device statuses (for testing)
router.post("/devices/update-status", authMiddleware, async (req, res) => {
    try {
        // Only admins can manually trigger status updates
        const user = await User.findById(req.user.userId);
        if (user.role !== "admin") {
            return res.status(403).json({ message: "Unauthorized. Admin access required." });
        }

        const { updateAllDeviceStatuses } = require('../utils/deviceStatusManagement');
        const result = await updateAllDeviceStatuses();
        res.json(result);
    } catch (error) {
        console.error("Error updating device statuses:", error);
        res.status(500).json({ message: "Server error" });
    }
});

// ✅ Fetch Active Device ID by User Email (Admin/Superadmin only)
router.get("/devices/active-device/:userEmail", adminMiddleware, async (req, res) => {
    try {
        const { userEmail } = req.params;
        console.log("Fetching active device for user email:", userEmail);

        // Validate email format (basic validation)
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(userEmail)) {
            return res.status(400).json({
                status: "fail",
                message: "Invalid email format"
            });
        }

        // Get the user by email and populate activeDevice to get deviceId
        const user = await User.findOne({ email: userEmail })
            .select('activeDevice email name')
            .populate('activeDevice', 'deviceId');

        if (!user) {
            return res.status(404).json({
                status: "fail",
                message: "User not found"
            });
        }

        console.log("User found:", user.email, "Active device:", user.activeDevice);

        // Extract deviceId from populated device or return null if no active device
        const activeDeviceId = user.activeDevice ? user.activeDevice.deviceId : null;

        res.json({
            status: "success",
            data: {
                activeDeviceId: activeDeviceId,
                user: {
                    email: user.email,
                    name: user.name
                }
            }
        });
    } catch (error) {
        console.error("Error fetching active device:", error);
        res.status(500).json({
            status: "fail",
            message: "Server error",
            error: error.message
        });
    }
});

// GET /api/public/codes
// returns { manufacturersByCode, modelsByCode, technologiesByCode, portsByCode }
router.get('/public/codes', async (req, res, next) => {
    try {
        // --- fetch all in parallel ---
        const [manufacturers, models, technologies, ports] = await Promise.all([
            Manufacturer.find({}, 'code name').lean(),
            DeviceModel.aggregate([
                {
                    $lookup: {
                        from: "manufacturers",
                        localField: "manufacturerId",
                        foreignField: "_id",
                        as: "manufacturer"
                    }
                },
                { $unwind: { path: "$manufacturer", preserveNullAndEmptyArrays: true } },
                { $project: { code: 1, name: 1, manufacturer: { _id: 1, code: 1, name: 1 } } }
            ]),
            Technology.find({}, 'code name').lean(),
            Port.find({}, 'code name').lean(),
        ]);

        // --- build maps ---
        const byCode = (arr, pad = 0) =>
            Object.fromEntries(
                (arr || [])
                    .filter(x => x.code != null && x.name)
                    .map(x => {
                        const key = pad ? String(x.code).padStart(pad, '0') : String(x.code);
                        return [key, { id: String(x._id), name: x.name }];
                    })
            );

        const manufacturersByCode = byCode(manufacturers, 2);

        const modelsByCode = Object.fromEntries(
            (models || [])
                .filter(x => x.code != null && x.name)
                .map(x => {
                    const key = String(x.code).padStart(2, '0');
                    return [
                        key,
                        {
                            id: String(x._id),
                            name: x.name,
                            manufacturer: x.manufacturer
                                ? {
                                    id: String(x.manufacturer._id),
                                    code: x.manufacturer.code,
                                    name: x.manufacturer.name
                                }
                                : null
                        }
                    ];
                })
        );

        const technologiesByCode = Object.fromEntries(
            (technologies || [])
                .filter(x => x.code != null && x.name)
                .map(x => [String(x.code), x.name])
        );

        const portsByCode = Object.fromEntries(
            (ports || [])
                .filter(x => x.code != null && x.name)
                .map(x => [String(x.code), x.name])
        );

        res.json({ manufacturersByCode, modelsByCode, technologiesByCode, portsByCode });
    } catch (err) {
        console.error("[public/codes] error:", err.message);
        next(err);
    }
});

// GET /api/public/device-models/:code
router.get('/public/device-models/:code', async (req, res, next) => {
    try {
        const raw = String(req.params.code || '');
        const code = raw.padStart(2, '0'); // accept "2" or "02"

        const model = await DeviceModel.aggregate([
            { $match: { code } },
            {
                $lookup: {
                    from: "manufacturers",
                    localField: "manufacturerId",
                    foreignField: "_id",
                    as: "manufacturer"
                }
            },
            { $unwind: { path: "$manufacturer", preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 1,
                    code: 1,
                    name: 1,
                    manufacturer: { _id: 1, code: 1, name: 1 },
                    metrics: 1
                }
            }
        ]);

        if (!model || !model.length) {
            return res.status(404).json({ status: 'fail', message: 'Device model not found' });
        }

        const m = model[0];
        res.json({
            data: {
                _id: String(m._id),
                code: m.code,
                name: m.name,
                manufacturer: m.manufacturer ? {
                    id: String(m.manufacturer._id),
                    code: m.manufacturer.code,
                    name: m.manufacturer.name
                } : null,
                metrics: (m.metrics || []).map(metric => ({
                    key: metric.key || metric.label,
                    label: metric.label,
                    graphType: String(metric.graphType || 'line').toLowerCase(),
                    averagingSec: (Number.isFinite(metric.averagingSec) ? metric.averagingSec
                        : Number.isFinite(metric.averagingSeconds) ? metric.averagingSeconds
                            : Number.isFinite(metric.avgSec) ? metric.avgSec : null),
                    min: metric.min,
                    max: metric.max,
                    alertMin: metric.alertMin,
                    alertMax: metric.alertMax,
                }))
            }
        });
    } catch (err) {
        console.error("[public/device-models] error:", err.message);
        next(err);
    }
});

// POST /api/device-models
router.post('/device-models', async (req, res, next) => {
    try {
        const { code, name, manufacturerCode, metrics } = req.body;
        if (!code || !name) {
            return res.status(400).json({ ok: false, message: "code and name are required" });
        }

        const DeviceModel = require('../models/DeviceModel');
        const doc = await DeviceModel.findOneAndUpdate(
            { code },
            { $set: { name, manufacturerCode, metrics } },
            { new: true, upsert: true }
        );

        console.info("[device-models] saved:", doc.code, doc.name);
        res.json({ ok: true, data: doc });
    } catch (err) {
        console.error("[device-models] error:", err.message);
        next(err);
    }
});

// ✅ Set an Active Device for User
router.patch("/devices/activate/:deviceId", authMiddleware, async (req, res) => {
    try {
        const { deviceId } = req.params;
        const userId = req.user.userId;
        const userObjectId = new mongoose.Types.ObjectId(userId);

        console.log("🔑 Activate device route called");
        console.log("👉 Requested deviceId:", deviceId);
        console.log("👉 UserId (string):", userId);
        console.log("👉 UserId (ObjectId):", userObjectId);

        // 1) Find the device
        const device = await Device.findOne({ deviceId });
        if (!device) {
            console.log("❌ Device not found:", deviceId);
            return res.status(404).json({ message: "Device not found" });
        }

        console.log("✅ Found device:", device.deviceId, "status:", device.status, "userId:", device.userId);

        // 2) Allow owner or caretaker (shared access) to set device as active for viewing
        const isOwner = device.userId && String(device.userId) === String(userId);
        const isCaretaker = Array.isArray(device.sharedWith) &&
            device.sharedWith.some((e) => e.userId && String(e.userId) === String(userId));
        if (!isOwner && !isCaretaker) {
            console.log("⚠️ Device not owned or shared with this user.");
            return res.status(403).json({ message: "Device does not belong to this user" });
        }

        // 3) Log all devices for user before update
        const beforeDevices = await Device.find({ userId: userObjectId }).lean();
        console.log("📋 Devices BEFORE update:", beforeDevices.map(d => ({
            deviceId: d.deviceId, status: d.status
        })));

        // 4) Deactivate others
        const updateResult = await Device.updateMany(
            { userId: userObjectId, deviceId: { $ne: deviceId } },
            { $set: { status: "inactive" } }
        );
        console.log("🔄 updateMany result:", updateResult);

        // 5) Activate current device
        device.status = "active";
        device.lastActiveAt = new Date();
        await device.save();
        console.log("✅ Activated device:", device.deviceId);

        // 6) Update user's activeDevice
        const user = await User.findByIdAndUpdate(
            userId,
            { activeDevice: device._id },
            { new: true }
        );

        console.log("👤 User updated activeDevice:", user?.activeDevice);

        // 7) Log all devices after update
        const afterDevices = await Device.find({ userId: userObjectId }).lean();
        console.log("📋 Devices AFTER update:", afterDevices.map(d => ({
            deviceId: d.deviceId, status: d.status
        })));

        res.json({
            message: `Device ${deviceId} set as active`,
            activeDevice: device.deviceId
        });
    } catch (error) {
        console.error("❌ Error in activate route:", error);
        res.status(500).json({ message: "Server error" });
    }
});

router.patch("/devices/deactivate/:deviceId", authMiddleware, deviceController.setInactiveDevice);

// POST /api/user/devices/save
router.post('/user/devices/save', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId;

        // normalize incoming ids
        const raw = [
            ...(Array.isArray(req.body.deviceIds) ? req.body.deviceIds : []),
            ...(Array.isArray(req.body.devices) ? req.body.devices.map(d => d.deviceId) : []),
            ...(req.body.deviceId ? [req.body.deviceId] : []),
        ];

        const ids = [...new Set(
            raw.map(s => String(s || '').trim().toUpperCase()).filter(Boolean)
        )];

        if (!ids.length) {
            return res.status(400).json({ status: 'fail', message: 'deviceId(s) required' });
        }

        const results = [];

        // assign each device to this user & add to user's devices[]
        for (const deviceId of ids) {
            const device = await Device.findOne({ deviceId });

            if (!device) {
                results.push({ deviceId, ok: false, status: 404, message: 'Device not found' });
                continue;
            }

            // Generate default name if customName is not set
            let updateData = { userId };
            if (!device.customName) {
                // Count existing devices for this user (excluding current device if already assigned)
                const deviceCount = await Device.countDocuments({ 
                    userId: new mongoose.Types.ObjectId(userId),
                    _id: { $ne: device._id } // Exclude current device from count
                });
                const nextNumber = deviceCount + 1;
                updateData.customName = `Dozemate_${nextNumber}`;
            }

            // set userId on device (idempotent)
            if (!device.userId || String(device.userId) !== String(userId)) {
                await Device.updateOne({ _id: device._id }, { $set: updateData });
            } else if (!device.customName && updateData.customName) {
                // Device already assigned to user but no customName - update name only
                await Device.updateOne({ _id: device._id }, { $set: { customName: updateData.customName } });
            }

            // push into user's devices (no duplicates)
            await User.updateOne(
                { _id: userId },
                { $addToSet: { devices: device._id } }
            );

            results.push({ deviceId, ok: true, status: 200 });
        }

        // fetch user to finalize activeDevice + role
        const updatedUser = await User.findById(userId).select('devices role activeDevice');
        if (updatedUser && !updatedUser.activeDevice && updatedUser.devices?.length) {
            await User.updateOne({ _id: userId }, { $set: { activeDevice: updatedUser.devices[0] } });
        }
        if (updatedUser && updatedUser.devices?.length > 1 && updatedUser.role !== 'admin') {
            await User.updateOne({ _id: userId }, { $set: { role: 'admin' } });
        }

        const allOk = results.every(r => r.ok);
        return res.status(200).json({
            status: allOk ? 'success' : 'partial',
            saved: results.filter(r => r.ok).map(r => r.deviceId),
            failed: results.filter(r => !r.ok),
            count: { requested: ids.length, saved: results.filter(r => r.ok).length }
        });
    } catch (err) {
        console.error('save devices error:', err);
        return res.status(500).json({ status: 'fail', message: err.message });
    }
});

module.exports = router;


