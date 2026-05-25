require("dotenv").config();

// 🔑 sanitize JWT secret early (before routes/controllers use it)
if (process.env.JWT_SECRET) {
  process.env.JWT_SECRET = process.env.JWT_SECRET.trim();
} else {
  console.error("❌ JWT_SECRET is missing!");
}

const express = require("express");
const http = require("http");
const cors = require("cors");
const cron = require("node-cron");

const connectDB = require("./config/db");
const { logger } = require("./utils/logger");
const { updateAllDeviceStatuses } = require("./utils/deviceStatusManagement");
const { verifySmtp } = require('./utils/mailer');
const { initializeWebSocket, broadcastDeviceUpdate } = require("./services/websocketService");
const { initializeMQTT } = require("./services/mqttService");
const Device = require("./models/Device");

// routes
const publicPendingRoutes = require("./routes/publicPending");
const authRoutes = require("./routes/auth");
const deviceRoutes = require("./routes/device");
const protectedRoutes = require("./routes/protectedRoutes");
const userRoutes = require("./routes/userProfileRoutes");
const organizationRoutes = require("./routes/organizationRoutes");
const adminRoutes = require("./routes/adminRoutes");
const userManagementRoutes = require("./routes/userManagementRoutes");
const deviceManagementRoutes = require("./routes/deviceManagementRoutes");
const httpRoutes = require("./routes/http");
const devicePrefixesRouter = require('./routes/devicePrefixes');
const profileRoutes = require("./routes/profileRoutes");
const app = express();

/* ───────────────────────── Middleware ───────────────────────── */
app.use(cors());
app.use(express.json());

// Disable caching for all API routes
app.use("/api", (req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  next();
});

// request log (after json, before routes)
app.use((req, res, next) => {
  res.on("finish", () => {
    logger.req(req, { status: res.statusCode });
  });
  next();
});

app.use("/uploads", express.static("uploads"));

/* ───────────────────────── Routes ───────────────────────── */
// mount PUBLIC routes before protected if they share /api prefix


app.use("/api/public", publicPendingRoutes);
app.use("/api/auth", authRoutes);            // ← keep only this one
app.use("/api/devices", deviceRoutes);
app.use("/api/user", userRoutes);
app.use("/api/organizations", organizationRoutes);
app.use("/api/admins", adminRoutes);
app.use("/api/manage/users", userManagementRoutes);
app.use("/api/manage/devices", deviceManagementRoutes);
app.use("/api/http", httpRoutes);
app.use("/api", profileRoutes);
app.use("/api", require("./routes/history"));

// keep protected catch-all last
app.use("/api/graph-settings", require("./routes/graphSettings"));
app.use("/api/device-prefixes", devicePrefixesRouter);
app.use("/api", protectedRoutes);

/* 404 */
app.use((req, res) => {
  const err = new Error("Route not found");
  err.statusCode = 404;
  logger.err(err, { route: req.originalUrl, method: req.method });
  res.status(404).json({ status: "fail", message: "Route not found" });
});

/* ─────────────────────── Error handling ─────────────────────── */
app.use((err, req, res, next) => {
  logger.err(err, {
    route: req.originalUrl,
    body: { ...req.body, password: undefined, newPassword: undefined, currentPassword: undefined },
    params: req.params,
    query: req.query,
    userId: req.user?.userId,
  });
  if (res.headersSent) return next(err);
  res.status(err.statusCode || 500).json({ status: "error", message: err.message || "Internal Server Error" });
});

// process-level safety nets
process.on("uncaughtException", (err) => logger.err(err, { scope: "uncaughtException" }));
process.on("unhandledRejection", (reason) =>
  logger.err(reason instanceof Error ? reason : new Error(String(reason)), { scope: "unhandledRejection" })
);

/* ───────────────────────── Boot ───────────────────────── */
const PORT = process.env.PORT || 5001;

connectDB()
  .then(async () => {
    verifySmtp()
      .then(() => logger.info('📧 SMTP verify OK'))
      .catch((err) => logger.err(err, { where: 'smtp-verify-startup' }));

    // Create HTTP server
    const server = http.createServer(app);
    
    // Initialize WebSocket server
    initializeWebSocket(server);

    // Initialize MQTT client to receive device data
    initializeMQTT();

    // Start server
    server.listen(PORT, () => {
      logger.info(`✅ Server running on port ${PORT}`);
      logger.info(`✅ WebSocket server ready for connections`);
      logger.info(`✅ MQTT subscriber initialized`);
    });

    // ✅ 30s Watchdog Timer: Check for devices that haven't sent data for 30 seconds
    // Runs every 3 seconds to catch devices going silent
    cron.schedule("*/3 * * * * *", async () => {
      try {
        const now = new Date();
        const thirtySecondsAgo = new Date(now.getTime() - 30000); // 30 seconds in milliseconds

        // Find devices that:
        // 1. Have lastActiveAt older than 30 seconds
        // 2. Are currently live (isLive: true) - so we don't process already handled devices
        const silentDevices = await Device.find({
          lastActiveAt: { $lt: thirtySecondsAgo },
          isLive: true
        });

        if (silentDevices.length > 0) {
          let updatedCount = 0;

          for (const device of silentDevices) {
            const absenceStart = device.absenceStart;
            const hv = device.HV;
            
            // Determine bedStatus based on AS and HV values (no data for 30s):
            // - If AS = 0 → Always "Vacant" (regardless of HV)
            // - If AS = 1 and HV = 1 → "Waiting" (no data for 30s)
            // - If AS = 1 and HV = 0 → "Waiting" (no data for 30s)
            let newBedStatus;
            if (absenceStart === 0 || absenceStart === "0") {
              // AS = 0 → Always Vacant
              newBedStatus = "Vacant";
            } else if (absenceStart === 1 || absenceStart === "1") {
              // AS = 1 and no data for 30s → Waiting (both HV=1 and HV=0)
              newBedStatus = "Waiting";
            } else {
              // AS is null/undefined → Keep current status
              newBedStatus = device.bedStatus || "Vacant";
            }

            // Update device: Set bedStatus and isLive=false for all silent devices
            // (mqttService will set isLive=true again when data arrives)
            if (newBedStatus !== device.bedStatus || device.isLive !== false) {
              await Device.findByIdAndUpdate(
                device._id,
                {
                  $set: {
                    bedStatus: newBedStatus,
                    isLive: false // Set isLive=false for all silent devices to prevent spam
                  }
                },
                { new: true }
              );

              // Broadcast device_update immediately
              try {
                broadcastDeviceUpdate(device.deviceId, {
                  bedStatus: newBedStatus,
                  absenceStart: device.absenceStart,
                  HV: device.HV,
                  isLive: false,
                  source: "timeout"
                });
                updatedCount++;
                logger.info(`⏰ Watchdog: Updated device ${device.deviceId} to ${newBedStatus} (AS=${absenceStart}, HV=${hv})`);
              } catch (wsError) {
                logger.err(wsError, { where: "watchdog:broadcastDeviceUpdate", deviceId: device.deviceId });
              }
            }
          }

          // Only log if we actually updated devices
          if (updatedCount > 0) {
            logger.info(`⏰ Watchdog: Updated ${updatedCount} device(s) silent for >30s`);
          }
        }
      } catch (error) {
        logger.err(error, { where: "watchdog:30sTimer" });
      }
    });

    // hourly device status updates
    cron.schedule("0 * * * *", async () => {
      logger.info("📊 Running scheduled device status update...");
      try {
        const result = await updateAllDeviceStatuses();
        logger.info("✅ Device status update complete", { result });
      } catch (error) {
        logger.err(error, { where: "cron:updateAllDeviceStatuses" });
      }
    });

    // run once on startup
    updateAllDeviceStatuses()
      .then((result) => logger.info("✅ Initial device status update complete", { result }))
      .catch((error) => logger.err(error, { where: "initial:updateAllDeviceStatuses" }));
  })
  .catch((err) => {
    logger.err(err, { where: "connectDB" });
    process.exit(1);
  });

module.exports = app;
