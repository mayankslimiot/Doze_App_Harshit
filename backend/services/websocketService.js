const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const Device = require("../models/Device");
const User = require("../models/User");
const { logger } = require("../utils/logger");

let io = null;

/**
 * Initialize WebSocket server
 * @param {http.Server} server - HTTP server instance
 * @returns {Server} Socket.IO server instance
 */
function initializeWebSocket(server) {
  io = new Server(server, {
    cors: {
      origin: "*", // In production, specify your React Native app origin
      methods: ["GET", "POST"],
      credentials: true
    },
    transports: ["websocket", "polling"], // Support both for better compatibility
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // Authentication middleware for WebSocket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      
      if (!token) {
        logger.err(new Error("WebSocket: No token provided"), { socketId: socket.id });
        return next(new Error("Authentication error: No token provided"));
      }

      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Attach user info to socket
      socket.userId = decoded.userId || decoded.id;
      socket.userRole = decoded.role;
      socket.accountId = decoded.accountId;
      
      logger.info("WebSocket: User authenticated", { 
        socketId: socket.id, 
        userId: socket.userId,
        role: socket.userRole 
      });
      
      next();
    } catch (error) {
      logger.err(error, { where: "WebSocket: Authentication failed", socketId: socket.id });
      next(new Error("Authentication error: Invalid token"));
    }
  });

  // Handle client connections
  io.on("connection", async (socket) => {
    logger.info("WebSocket: Client connected", { 
      socketId: socket.id, 
      userId: socket.userId 
    });

    // Get user's devices (owned + shared) and auto-subscribe to device rooms
    try {
      const user = await User.findById(socket.userId)
        .select("devices sharedDevices")
        .populate("devices");
      const verifiedDeviceIds = [];

      // 1) Auto-subscribe to owned devices
      if (user && user.devices && user.devices.length > 0) {
        const deviceIds = user.devices.map(device => device.deviceId || device._id.toString());
        for (const deviceId of deviceIds) {
          const device = await Device.findOne({ deviceId });
          if (device && device.userId && device.userId.toString() === socket.userId) {
            const roomName = `device:${device.deviceId}`;
            socket.join(roomName);
            verifiedDeviceIds.push(device.deviceId);
            logger.info("WebSocket: Auto-subscribed to device room (owner)", {
              socketId: socket.id,
              userId: socket.userId,
              deviceId: device.deviceId,
              room: roomName
            });
          } else {
            logger.warn("WebSocket: Skipped auto-subscribe - ownership mismatch", {
              socketId: socket.id,
              userId: socket.userId,
              deviceId,
              deviceExists: !!device,
              deviceOwnerId: device?.userId?.toString() || null
            });
          }
        }
      }

      // 2) Auto-subscribe to shared devices (caretaker) so they receive live data
      const sharedIds = user?.sharedDevices || [];
      for (const rawId of sharedIds) {
        const deviceIdNorm = String(rawId).trim().toUpperCase();
        const device = await Device.findOne({ deviceId: deviceIdNorm }) || await Device.findOne({ deviceId: rawId });
        if (!device) continue;
        const isCaretaker = Array.isArray(device.sharedWith) &&
          device.sharedWith.some(e => e.userId && String(e.userId) === String(socket.userId));
        if (isCaretaker) {
          const roomName = `device:${device.deviceId}`;
          socket.join(roomName);
          if (!verifiedDeviceIds.includes(device.deviceId)) {
            verifiedDeviceIds.push(device.deviceId);
          }
          logger.info("WebSocket: Auto-subscribed to device room (caretaker)", {
            socketId: socket.id,
            userId: socket.userId,
            deviceId: device.deviceId,
            room: roomName
          });
        }
      }

      // User-specific room
      socket.join(`user:${socket.userId}`);

      socket.emit("connected", {
        success: true,
        message: "Connected to WebSocket server",
        subscribedDevices: verifiedDeviceIds,
        userId: socket.userId
      });
    } catch (error) {
      logger.err(error, { where: "WebSocket: Error fetching user devices", socketId: socket.id });
      socket.emit("connected", {
        success: true,
        message: "Connected to WebSocket server",
        subscribedDevices: [],
        userId: socket.userId
      });
    }

    // Handle manual device subscription
    socket.on("subscribe_device", async (data) => {
      try {
        const { deviceId } = data;
        console.log(`📡 [WebSocket Backend] subscribe_device received for deviceId: ${deviceId}, socketId: ${socket.id}`);
        
        if (!deviceId) {
          console.log(`❌ [WebSocket Backend] subscribe_device failed: deviceId is required`);
          socket.emit("error", { message: "deviceId is required" });
          return;
        }

        const deviceIdNorm = String(deviceId).trim().toUpperCase();

        // Verify device exists (try normalized id first, then raw)
        let device = await Device.findOne({ deviceId: deviceIdNorm });
        if (!device) {
          device = await Device.findOne({ deviceId });
        }
        if (!device) {
          console.log(`❌ [WebSocket Backend] subscribe_device failed: Device not found: ${deviceId}`);
          socket.emit("error", { message: "Device not found" });
          return;
        }

        const user = await User.findById(socket.userId).select("devices accountId ownedDevices sharedDevices").lean();
        const accountId = (user && user.accountId) || socket.accountId;

        // Check if user owns this device, has it shared, or is admin (match logic in protectedRoutes and device.js)
        const hasAccess =
          socket.userRole === "admin" ||
          socket.userRole === "superadmin" ||
          (device.userId && String(device.userId) === String(socket.userId)) ||
          (device.accountId && accountId && device.accountId === accountId) ||
          (user && user.devices && user.devices.some(d => String(d) === String(device._id))) ||
          (user && user.ownedDevices && user.ownedDevices.some(id => String(id).trim().toUpperCase() === deviceIdNorm)) ||
          (user && user.sharedDevices && user.sharedDevices.some(id => String(id).trim().toUpperCase() === deviceIdNorm));

        if (!hasAccess) {
          console.log(`❌ [WebSocket Backend] subscribe_device failed: Access denied for device: ${deviceId}`, {
            userId: socket.userId,
            deviceUserId: device.userId ? String(device.userId) : null,
            userAccountId: accountId || null,
            deviceAccountId: device.accountId || null
          });
          socket.emit("error", { message: "Access denied to this device" });
          return;
        }

        const roomName = `device:${device.deviceId}`;
        socket.join(roomName);
        const roomSize = io.sockets.adapter.rooms.get(roomName)?.size || 0;
        
        console.log(`✅ [WebSocket Backend] Subscribed to device room: ${roomName}, Total clients in room: ${roomSize}`);
        
        logger.info("WebSocket: Manually subscribed to device", { 
          socketId: socket.id, 
          userId: socket.userId,
          deviceId: device.deviceId,
          room: roomName,
          roomSize
        });

        socket.emit("subscribed", { deviceId: device.deviceId, room: roomName });
      } catch (error) {
        console.error(`❌ [WebSocket Backend] subscribe_device error:`, error);
        logger.err(error, { where: "WebSocket: Subscribe device error", socketId: socket.id });
        socket.emit("error", { message: "Failed to subscribe to device" });
      }
    });

    // Handle device unsubscription
    socket.on("unsubscribe_device", (data) => {
      try {
        const { deviceId } = data;
        if (deviceId) {
          const roomName = `device:${deviceId}`;
          socket.leave(roomName);
          logger.info("WebSocket: Unsubscribed from device", { 
            socketId: socket.id, 
            userId: socket.userId,
            deviceId 
          });
          socket.emit("unsubscribed", { deviceId });
        }
      } catch (error) {
        logger.err(error, { where: "WebSocket: Unsubscribe device error", socketId: socket.id });
      }
    });

    // Handle ping/pong for connection health
    socket.on("ping", () => {
      socket.emit("pong");
    });

    // Handle disconnection
    socket.on("disconnect", (reason) => {
      logger.info("WebSocket: Client disconnected", { 
        socketId: socket.id, 
        userId: socket.userId,
        reason 
      });
    });
  });

  logger.info("✅ WebSocket server initialized");
  return io;
}

/**
 * Broadcast health data update to all clients subscribed to a device
 * @param {string} deviceId - Device ID
 * @param {Object} healthData - Health data object
 */
function broadcastHealthData(deviceId, healthData) {
  if (!io) {
    logger.err(new Error("WebSocket server not initialized"), { where: "broadcastHealthData" });
    return;
  }

  try {
    const roomName = `device:${deviceId}`;
    
    // Extract stress_level from payload (for 180s stream data)
    // Stress data comes from HealthData180s collection with payload.stress_level
    let stressValue = null;
    if (healthData.stress !== undefined && healthData.stress !== null) {
      stressValue = healthData.stress;
    } else if (healthData.stress_level !== undefined && healthData.stress_level !== null) {
      stressValue = healthData.stress_level;
    } else if (healthData.payload?.stress_level !== undefined && healthData.payload?.stress_level !== null) {
      stressValue = healthData.payload.stress_level;
    }
    
    // Prepare data for client (remove sensitive/internal fields)
    // ✅ CRITICAL: Forward null values as-is (null = gap indicator, don't convert to 0)
    const clientData = {
      deviceId: healthData.deviceId,
      timestamp: healthData.timestamp,
      timestampSeconds: healthData.timestampSeconds, // Include timestampSeconds for accurate timestamp extraction
      temperature: healthData.temperature,
      humidity: healthData.humidity,
      heartRate: healthData.heartRate, // ✅ null values preserved (gaps when HV=0 or AS=0)
      respiration: healthData.respiration,
      stress: stressValue, // ✅ Add stress field
      stress_level: stressValue, // ✅ Also include stress_level for compatibility
      pm10: healthData.pm10,
      co2: healthData.co2,
      voc: healthData.voc,
      etoh: healthData.etoh,
      voltage: healthData.voltage,
      level: healthData.level,
      status: healthData.status,
      absenceStart: healthData.absenceStart, // ✅ Include absenceStart for bed status (1 = Occupied, 0 = Vacant)
      metrics: healthData.metrics || {},
      signals: healthData.signals || {},
      // ✅ Include payload if it exists (for 180s stream data with payload.stress_level)
      payload: healthData.payload ? { stress_level: healthData.payload.stress_level } : undefined
    };

    // Broadcast to device room
    const roomSize = io.sockets.adapter.rooms.get(roomName)?.size || 0;
    console.log(`📡 [WebSocket] Broadcasting health_data_update to room: ${roomName}, Clients: ${roomSize}, Respiration: ${clientData.respiration}, Stress: ${clientData.stress}`);
    io.to(roomName).emit("health_data_update", clientData);
    
    logger.info("WebSocket: Health data broadcasted", { 
      deviceId, 
      room: roomName,
      timestamp: healthData.timestamp,
      clients: roomSize,
      respiration: clientData.respiration
    });
  } catch (error) {
    logger.err(error, { where: "broadcastHealthData", deviceId });
  }
}

/**
 * Broadcast device update (bedStatus, absenceStart, HV, isLive)
 * Used for real-time bed status updates
 * @param {string} deviceId - Device ID
 * @param {Object} deviceUpdate - Device update object with bedStatus, absenceStart, HV, isLive
 */
function broadcastDeviceUpdate(deviceId, deviceUpdate) {
  if (!io) {
    logger.err(new Error("WebSocket server not initialized"), { where: "broadcastDeviceUpdate" });
    return;
  }

  try {
    const roomName = `device:${deviceId}`;
    
    const clientData = {
      deviceId: deviceId,
      bedStatus: deviceUpdate.bedStatus, // "Vacant" | "Occupied" | "Waiting"
      absenceStart: deviceUpdate.absenceStart, // AS field (0 or 1)
      HV: deviceUpdate.HV, // Human Validity field
      isLive: deviceUpdate.isLive, // Boolean
      source: deviceUpdate.source || "packet" // "packet" | "timeout"
    };

    // Broadcast to device room
    const roomSize = io.sockets.adapter.rooms.get(roomName)?.size || 0;
    logger.info("WebSocket: Device update broadcasted", { 
      deviceId, 
      room: roomName,
      bedStatus: clientData.bedStatus,
      isLive: clientData.isLive,
      clients: roomSize
    });
    
    io.to(roomName).emit("device_update", clientData);
  } catch (error) {
    logger.err(error, { where: "broadcastDeviceUpdate", deviceId });
  }
}

/**
 * Broadcast heart rate graph update (backend-owned aggregation)
 * Fetches recent data, aggregates it, and emits graph-ready payload
 * @param {string} deviceId - Device ID
 * @param {number} zoomIndex - Zoom level index (default: 0 = 10m)
 */
async function broadcastHeartRateGraphUpdate(deviceId, zoomIndex = 0) {
  if (!io) {
    return;
  }

  try {
    const HealthData = require("../models/HealthData");
    const { getTimeWindow } = require("../config/zoomLevels");
    const { aggregateHeartRateGraph } = require("../utils/graphAggregation");

    // Get viewport window for zoom level (controls what's visible)
    const viewportWindow = getTimeWindow(zoomIndex);
    
    // Always fetch last 24 hours of data for live updates
    // This ensures graph shows full historical context even when device was offline
    const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
    const now = Date.now();

    // ✅ CRITICAL: Fetch last 24 hours including null values (gaps)
    const rawData = await HealthData.find({
      deviceId: deviceId,
      timestamp: {
        $gte: new Date(twentyFourHoursAgo),
        $lte: new Date(now)
      },
      $or: [
        { heartRate: null }, // Include null gaps
        { heartRate: { $gt: 0, $lt: 250 } }, // Include valid heart rates
        { hr: { $gt: 0, $lt: 250 } }, // Legacy field
        { bpm: { $gt: 0, $lt: 250 } } // Legacy field
      ]
    })
    .sort({ timestamp: 1 })
    .select("timestamp heartRate hr bpm")
    .lean()
    .limit(10000); // Limit to prevent excessive data

    // Aggregate data - process all 24h but use zoom level for viewport
    const graphData = aggregateHeartRateGraph(rawData, zoomIndex, null, viewportWindow);

    // Broadcast to device room
    const roomName = `device:${deviceId}`;
    const roomSize = io.sockets.adapter.rooms.get(roomName)?.size || 0;
    
    io.to(roomName).emit("heart_rate_graph_update", {
      deviceId,
      ...graphData
    });

    logger.info("WebSocket: Heart rate graph update broadcasted", {
      deviceId,
      room: roomName,
      clients: roomSize,
      zoomIndex,
      points: graphData.points.length
    });
  } catch (error) {
    logger.err(error, { where: "broadcastHeartRateGraphUpdate", deviceId });
  }
}

/**
 * Broadcast device status update
 * @param {string} deviceId - Device ID
 * @param {Object} deviceStatus - Device status object
 */
function broadcastDeviceStatus(deviceId, deviceStatus) {
  if (!io) {
    return;
  }

  try {
    const roomName = `device:${deviceId}`;
    io.to(roomName).emit("device_status_update", {
      deviceId,
      ...deviceStatus
    });
    
    logger.info("WebSocket: Device status broadcasted", { deviceId, room: roomName });
  } catch (error) {
    logger.err(error, { where: "broadcastDeviceStatus", deviceId });
  }
}

/**
 * Get WebSocket server instance
 * @returns {Server|null} Socket.IO server instance
 */
function getIO() {
  return io;
}

module.exports = {
  initializeWebSocket,
  broadcastHealthData,
  broadcastDeviceStatus,
  broadcastDeviceUpdate,
  broadcastHeartRateGraphUpdate,
  getIO
};




