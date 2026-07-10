const express = require("express");
const Device = require("../models/Device");
const User = require("../models/User");
const Account = require("../models/Account");
const MonitoringSession = require("../models/MonitoringSession");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const mongoose = require('mongoose');
const DevicePrefix = require('../models/DevicePrefix');
const Profile = require("../models/Profile");
const { logger } = require("../utils/logger");
const { getIO } = require("../services/websocketService");
const { sendCaretakerShareNotification } = require("../utils/mailer");
const router = express.Router();
const ID_RX = /^\d{4}-[0-9A-F]{12}$/i;; // 4 digits 12 hex chars
const pad5 = (n) => String(n).padStart(5, '0');
const deviceController = require('../controllers/deviceManagementController');

/**
 * Generate default device name (Dozemate_1, Dozemate_2, etc.)
 * @param {string} userId - User ID to count devices for
 * @param {string} excludeDeviceId - Optional device ID to exclude from count (for regenerating name)
 * @returns {Promise<string>} Default device name
 */
async function generateDefaultDeviceName(userId) {
  try {
    // Find all devices owned by this user
    const devices = await Device.find({ userId: new mongoose.Types.ObjectId(userId) }).select("customName defaultName").lean();

    // Set to track used indices
    const usedIndices = new Set();
    const nameRegex = /Dozemate_(\d+)/i;

    devices.forEach(d => {
      // Check defaultName
      if (d.defaultName) {
        const match = d.defaultName.match(nameRegex);
        if (match) usedIndices.add(parseInt(match[1], 10));
      }
      // Check customName (to avoid clashing if user manually named something "Dozemate_X")
      if (d.customName) {
        const match = d.customName.match(nameRegex);
        if (match) usedIndices.add(parseInt(match[1], 10));
      }
    });

    // Find the first available index starting from 1
    let nextIndex = 1;
    while (usedIndices.has(nextIndex)) {
      nextIndex++;
    }

    return `Dozemate_${nextIndex}`;
  } catch (error) {
    console.error('Error generating default device name:', error);
    return `Dozemate_${Date.now()}`;
  }
}

// --- local handlers so we don't need another controller import ---
// Allow access if owner or caretaker (sharedWith)
async function getByDeviceId(req, res) {
  try {
    const device = await Device.findOne({ deviceId: req.params.deviceId });
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }
    const uid = req.user.userId?.toString();
    const isOwner = device.userId && device.userId.toString() === uid;
    const isCaretaker = Array.isArray(device.sharedWith) &&
      device.sharedWith.some((e) => e.userId && e.userId.toString() === uid);
    if (!isOwner && !isCaretaker) {
      return res.status(403).json({ message: 'Device not found or access denied' });
    }
    res.json({ data: { device } });
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
}

async function validateDeviceId(req, res) {
  try {
    const { deviceId } = req.query;
    if (!deviceId) return res.status(400).json({ ok: false, message: 'deviceId required' });

    const d = await Device.findOne({ deviceId });
    if (!d) {
      return res.json({ ok: true, exists: false, assigned: false, device: null });
    }
    const uid = req.user.userId?.toString();
    const isOwner = d.userId && d.userId.toString() === uid;
    const isCaretaker = Array.isArray(d.sharedWith) &&
      d.sharedWith.some((e) => e.userId && e.userId.toString() === uid);
    const hasAccess = isOwner || isCaretaker;

    res.json({
      ok: true,
      exists: !!hasAccess,
      assigned: !!d.userId,
      device: hasAccess ? d : null
    });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
}


// Add Device
router.post("/add", authMiddleware, async (req, res) => {
  const {
    // legacy/manual fields (still supported)
    deviceId,
    deviceType,
    manufacturer,
    prefixId,
    firmwareVersion,
    location,
    status,
    validity,
    accountId,
    profileId,
  } = req.body;

  const now = new Date();
  const processedStatus = (status || 'inactive').toLowerCase();

  try {
    const userObj = await User.findById(req.user.userId).populate('account');
    let orgId = null;
    let finalAccountId = accountId;

    if (userObj) {
      if (!finalAccountId && userObj.accountId) finalAccountId = userObj.accountId;
      if (userObj.account && userObj.account.organizationId) {
        orgId = userObj.account.organizationId;
      }
    }

    const payload = {
      firmwareVersion,
      location,
      status: processedStatus,
      validity,
      createdAt: now,
      lastActiveAt: now,
      userId: req.user.userId,
      accountId: finalAccountId,
      organizationId: orgId,
      profileId
    };
    if (profileId) {
      payload.profileId = new mongoose.Types.ObjectId(profileId);
    }

    if (prefixId) {
      // --- New: server issues deviceId from prefix ---
      const p = await DevicePrefix.findByIdAndUpdate(
        prefixId,
        { $inc: { sequence: 1 } },
        { new: true, session }
      );
      if (!p) throw new Error("Invalid prefixId");

      const second = pad5(p.sequence);
      payload.deviceId = `${p.prefix}-${second}`;
      payload.deviceType = p.deviceName;
      payload.manufacturer = p.manufacturer;
    } else {

      if (!deviceId || !deviceType || !manufacturer) {
        throw new Error("deviceId, deviceType and manufacturer are required (or provide prefixId)");
      }
      if (!ID_RX.test(deviceId)) {
        throw new Error("deviceId must match ######-XXXXXXXXXXXX (4 digits, hyphen, 12 hex chars)");
      }
      payload.deviceId = deviceId.trim().toUpperCase();
      payload.deviceType = deviceType.trim();
      payload.manufacturer = manufacturer.trim();
    }

    // Generate default name if customName is not provided in payload
    if (!payload.customName) {
      const defaultName = await generateDefaultDeviceName(req.user.userId);
      payload.defaultName = defaultName;
      payload.customName = defaultName;
    } else {
      // If customName is provided, we still need a default slot name
      payload.defaultName = await generateDefaultDeviceName(req.user.userId);
    }

    console.log(">>> Creating device with payload:", payload);
    const [device] = await Device.create([payload]);
    console.log(">>> Device created:", device._id, "deviceId:", device.deviceId, "status:", device.status);

    // ✅ Audit log: Device ownership assigned (manual add)
    logger.info('Device ownership assigned', {
      deviceId: device.deviceId,
      userId: req.user.userId,
      timestamp: now.toISOString(),
      source: 'device-add',
      wasReassigned: false
    });

    const user = await User.findById(req.user.userId);
    console.log(">>> Found user:", req.user.userId, "=>", user ? "YES" : "NO");

    if (user) {
      console.log(">>> Before push, user.devices:", user.devices);

      user.devices.push(device._id);
      if (!user.ownedDevices) user.ownedDevices = [];
      if (!user.ownedDevices.includes(device.deviceId)) {
        user.ownedDevices.push(device.deviceId);
      }
      console.log(">>> After push, user.devices:", user.devices);

      if (!user.activeDevice && device.status === "active") {
        console.log(">>> No activeDevice set, assigning device:", device._id);
        user.activeDevice = new mongoose.Types.ObjectId(device._id);
      } else {
        console.log(">>> activeDevice already set or device not active:",
          "activeDevice:", user.activeDevice,
          "device.status:", device.status
        );
      }

      await user.save();
      console.log(">>> User saved with activeDevice:", user.activeDevice);
    } else {
      console.log(">>> No user found with ID:", req.user.userId);
    }


    return res.status(201).json({
      message: "Device added successfully",
      device,
      createdAt: device.createdAt,
      formattedDate: device.createdAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    });
  }
  catch (error) {

    // duplicate key (unique deviceId)
    if (error && error.code === 11000) {
      return res.status(409).json({
        status: "fail",
        message: "A device with this Device ID already exists."
      });
    }

    // validation / format errors
    if (error && (error.name === 'ValidationError' || error.message)) {
      return res.status(400).json({
        status: "fail",
        message: error.message || "Validation failed"
      });
    }

    console.error("Error adding device:", error);
    return res.status(500).json({
      status: "fail",
      message: "An internal server error occurred while adding the device."
    });
  }
});


// GET /devices/organization/:organizationId - Fetch devices by organizationId (Admin only)
router.get('/devices/organization/:organizationId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { organizationId } = req.params;

    // Convert organizationId string to ObjectId
    if (!mongoose.Types.ObjectId.isValid(organizationId)) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid organization ID format"
      });
    }

    const orgObjectId = new mongoose.Types.ObjectId(organizationId);

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Step 1: Find all accounts linked to this organization
    const accountsInOrg = await Account.find({ organizationId: orgObjectId }).select('_id accountId');
    const accountIds = accountsInOrg.map(a => a._id);
    const accountIdsStr = accountsInOrg.map(a => a.accountId).filter(Boolean);

    // Step 2: Find all users in this organization (either via Account link or via legacy organizationId on User)
    const usersInOrg = await User.find({
      $or: [
        { account: { $in: accountIds } },
        { organizationId: orgObjectId }
      ]
    }).select('devices');

    // Step 3: Extract all device IDs from users' devices arrays
    const deviceIds = [];
    usersInOrg.forEach(user => {
      if (user.devices && user.devices.length > 0) {
        deviceIds.push(...user.devices);
      }
    });

    // Step 4: Build filter for devices (either assigned to users in org, assigned directly to org, or matching organization accounts' accountIds)
    const filter = {
      $or: [
        { _id: { $in: deviceIds } },
        { organizationId: orgObjectId }
      ]
    };

    if (accountIdsStr.length > 0) {
      filter.$or.push({ accountId: { $in: accountIdsStr } });
    }

    // Additional filters
    if (req.query.status) {
      filter.status = req.query.status.toLowerCase().trim();
    }

    if (req.query.deviceType) {
      filter.deviceType = req.query.deviceType;
    }

    // Search by deviceId or manufacturer
    if (req.query.search) {
      filter.$or = [
        { deviceId: { $regex: req.query.search, $options: "i" } },
        { manufacturer: { $regex: req.query.search, $options: "i" } }
      ];
    }

    // Step 4: Fetch device details with pagination
    const devices = await Device.find(filter)
      .populate('userId', 'name email organizationId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Get total count for pagination
    const total = await Device.countDocuments(filter);

    res.status(200).json({
      status: "success",
      results: devices.length,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
      organizationId,
      data: devices
    });

  } catch (error) {
    console.error("Error fetching devices by organization:", error);
    res.status(500).json({
      status: "fail",
      message: "Server error",
      error: error.message
    });
  }
});

router.get('/devices/by-deviceId/:deviceId', getByDeviceId);

router.get('/validate', validateDeviceId);

router.get("/history", authMiddleware, deviceController.getDeviceHistory);
router.get("/history/respiration", authMiddleware, deviceController.getRespirationLive);
router.get("/history/stress", authMiddleware, deviceController.getStressAggregates);

// in the same router that serves other /public routes

router.get('/public/available', async (req, res) => {
  try {
    const deviceId = String(req.query.deviceId || '').trim().toUpperCase();
    if (!deviceId) return res.status(400).json({ ok: false, message: 'deviceId required' });

    const d = await Device.findOne({ deviceId }).lean();
    return res.json({
      ok: true,
      exists: !!d,
      assigned: !!d?.userId,
      device: d || null
    });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// was: router.get('/users/suggest', ...
router.get('/users/suggest', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const limit = Math.min(parseInt(req.query.limit || '10', 10), 25);
    if (q.length < 2) return res.json({ data: [], note: 'q too short' });

    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const users = await User.find(
      { $or: [{ email: rx }, { name: rx }] },
      { _id: 1, email: 1, name: 1 }
    ).limit(limit).lean();

    res.json({ data: users });
  } catch (e) {
    console.error('users/suggest error:', e);
    res.status(500).json({ message: 'Server error' });
  }
});



// PUT /activate/:deviceId?profileId=xxxx
router.put("/activate/:deviceId", authMiddleware, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { profileId } = req.query;
    if (!profileId) return res.status(400).json({ message: "profileId required" });

    const device = await Device.findOne({ deviceId });
    if (!device) return res.status(404).json({ message: "Device not found" });

    // --- if already active under another profile
    if (device.status === "active" && device.profileId && device.profileId.toString() !== profileId) {
      const activeProfile = await Profile.findById(device.profileId).lean();
      return res.status(409).json({
        message: `Device ${deviceId} is already active on profile "${activeProfile?.identifier || device.profileId}"`
      });
    }

    // --- deactivate all devices for this profile
    await Device.updateMany({ profileId }, { $set: { status: "inactive" } });


    device.status = "active";
    device.profileId = new mongoose.Types.ObjectId(profileId);
    device.lastActiveAt = new Date();
    await device.save();
    await User.findByIdAndUpdate(
      device.userId,
      { $set: { activeDevice: new mongoose.Types.ObjectId(device._id) } },
      { new: true }
    );

    // --- get profile name for success message
    const newProfile = await Profile.findById(profileId).lean();

    return res.json({
      message: `Device ${deviceId} activated on profile "${newProfile?.identifier || profileId}"`,
      deviceId,
      profileId
    });

  } catch (e) {
    console.error("activate error:", e);
    res.status(500).json({ message: e.message });
  }
});


// GET /mapping/:profileId
router.get("/mapping/:profileId", authMiddleware, async (req, res) => {
  try {
    const { profileId } = req.params;
    const devices = await Device.find({ profileId }).lean();
    res.json({
      profileId,
      devices: devices.map(d => ({
        deviceId: d.deviceId,
        status: d.status,
        active: d.status === "active"
      }))
    });
  } catch (e) {
    console.error("mapping error:", e);
    res.status(500).json({ message: e.message });
  }
});


// GET /profiles/:profileId/active-device
router.get("/profiles/:profileId/active-device", authMiddleware, async (req, res) => {
  try {
    const { profileId } = req.params;
    const active = await Device.findOne({ profileId, status: "active" }).lean();
    res.json({
      profileId,
      activeDevice: active ? { deviceId: active.deviceId } : null
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /devices/user - Fetch owned + shared devices for logged-in user
router.get("/user", authMiddleware, async (req, res) => {
  try {
    let user;
    const isSuperAdmin = req.user?.role === "superadmin";
    const isAdmin = req.user?.role === "admin";

    if (isSuperAdmin) {
      const SuperAdmin = require("../models/SuperAdmin");
      const adminUser = await SuperAdmin.findById(req.user.userId).lean();
      if (!adminUser) return res.status(404).json({ message: "SuperAdmin not found" });
      user = {
        _id: adminUser._id,
        email: adminUser.email,
        role: "superadmin",
        ownedDevices: [],
        sharedDevices: [],
        activeDevice: adminUser.activeDevice || null
      };
    } else {
      user = await User.findById(req.user.userId).lean();
    }
    if (!user) return res.status(404).json({ message: "User not found" });

    // Owned: by userId (owner) or by user.ownedDevices if set
    let ownedIds;
    if (isSuperAdmin) {
      ownedIds = (await Device.find().select("deviceId").lean()).map((d) => d.deviceId);
    } else if (isAdmin) {
      const adminUser = await User.findById(req.user.userId).populate('account').lean();
      if (adminUser && adminUser.account) {
        const accountIdStr = adminUser.account.accountId || String(adminUser.account._id);
        const filter = { $or: [{ accountId: accountIdStr }] };
        if (adminUser.account.organizationId) {
          filter.$or.push({ organizationId: adminUser.account.organizationId });
        }
        ownedIds = (await Device.find(filter).select("deviceId").lean()).map((d) => d.deviceId);
      } else {
        ownedIds = [];
      }
    } else {
      ownedIds = user.ownedDevices && user.ownedDevices.length
        ? user.ownedDevices
        : (await Device.find({ userId: req.user.userId }).select("deviceId").lean()).map((d) => d.deviceId);
    }

    const ownedDevices = await Device.find(
      { deviceId: { $in: ownedIds } },
      "deviceId name deviceType manufacturer firmwareVersion location status _id customName defaultName sharedWith bleMac organizationId hrMin hrMax respMin respMax"
    ).lean();
    const sharedIds = user.sharedDevices || [];
    const sharedDevicesRaw = sharedIds.length
      ? await Device.find(
        { deviceId: { $in: sharedIds } },
        "deviceId name deviceType manufacturer firmwareVersion location status _id customName defaultName bleMac organizationId hrMin hrMax respMin respMax"
      ).lean()
      : [];
    const sharedDevices = sharedDevicesRaw.map((d) => ({ ...d, isShared: true }));

    let deviceNamesMap = {};
    if (user.deviceNames) {
      deviceNamesMap = user.deviceNames instanceof Map ? Object.fromEntries(user.deviceNames) : user.deviceNames;
    }
    const withNames = (list) =>
      list.map((device) => ({
        ...device,
        customName: device.customName || deviceNamesMap[device.deviceId] || null
      }));
    const ownedWithNames = withNames(ownedDevices);
    const sharedWithNames = withNames(sharedDevices);

    // Backward compat: single "devices" list = owned first, then shared
    const devices = [...ownedWithNames, ...sharedWithNames];

    console.log("📋 Returning devices for user:", req.user.userId, "role:", req.user?.role, "owned:", ownedWithNames.length, "shared:", sharedWithNames.length);

    res.json({
      devices,
      ownedDevices: ownedWithNames,
      sharedDevices: sharedWithNames,
      activeDevice: isSuperAdmin ? (user.activeDevice || (ownedWithNames[0]?._id || null)) : user.activeDevice,
      deviceNames: deviceNamesMap
    });
  } catch (error) {
    console.error("Error fetching devices:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /devices/share - Owner shares device with caretaker (by email)
router.post("/share", authMiddleware, async (req, res) => {
  try {
    const { email, deviceId } = req.body;
    if (!email || !deviceId) {
      return res.status(400).json({ message: "email and deviceId required" });
    }
    const emailStr = String(email).trim().toLowerCase();
    const deviceIdNorm = String(deviceId).trim().toUpperCase();

    const device = await Device.findOne({ deviceId: deviceIdNorm });
    if (!device) return res.status(404).json({ message: "Device not found" });
    if (device.userId.toString() !== req.user.userId.toString()) {
      return res.status(403).json({ message: "Only the device owner can share it" });
    }

    const caretaker = await User.findOne({ email: emailStr }).select("_id email").lean();
    if (!caretaker) {
      return res.status(404).json({ message: "No user found with that email. They must register first." });
    }
    if (caretaker._id.toString() === req.user.userId.toString()) {
      return res.status(400).json({ message: "You cannot share a device with yourself" });
    }

    const alreadyShared = device.sharedWith && device.sharedWith.some(
      (e) => e.userId && e.userId.toString() === caretaker._id.toString()
    );
    if (alreadyShared) {
      return res.status(409).json({ message: "Device is already shared with this user" });
    }
    const caretakerHas = (await User.findById(caretaker._id).select("sharedDevices").lean())?.sharedDevices || [];
    if (caretakerHas.includes(deviceIdNorm)) {
      return res.status(409).json({ message: "Device is already shared with this user" });
    }

    device.sharedWith = device.sharedWith || [];
    device.sharedWith.push({ userId: caretaker._id, email: emailStr });
    await device.save();

    await User.findByIdAndUpdate(caretaker._id, {
      $addToSet: { sharedDevices: deviceIdNorm }
    });

    // Send email to caretaker with who shared and device details
    try {
      const owner = await User.findById(req.user.userId).select("name email").lean();
      const ownerName = owner?.name || null;
      const ownerEmail = owner?.email || null;
      const deviceName = device.customName || device.deviceId;
      await sendCaretakerShareNotification({
        to: emailStr,
        ownerName,
        ownerEmail,
        deviceName,
        deviceId: deviceIdNorm,
      });
    } catch (mailErr) {
      logger.error?.(mailErr, { where: "caretaker share email", to: emailStr });
      // Do not fail the request; sharing already succeeded
    }

    return res.status(200).json({ message: "Device shared successfully" });
  } catch (e) {
    console.error("Share device error:", e);
    return res.status(500).json({ message: e.message || "Server error" });
  }
});

// POST /devices/remove-shared - Caretaker removes device from their own account
router.post("/remove-shared", authMiddleware, async (req, res) => {
  try {
    const { deviceId } = req.body;
    if (!deviceId) return res.status(400).json({ message: "deviceId required" });
    const deviceIdNorm = String(deviceId).trim().toUpperCase();
    const device = await Device.findOne({ deviceId: deviceIdNorm });
    if (!device) return res.status(404).json({ message: "Device not found" });

    const uid = req.user.userId;
    const inShared = device.sharedWith && device.sharedWith.some(
      (e) => e.userId && e.userId.toString() === uid.toString()
    );
    if (!inShared) {
      return res.status(403).json({ message: "You do not have shared access to this device" });
    }

    await Device.updateOne(
      { deviceId: deviceIdNorm },
      { $pull: { sharedWith: { userId: uid } } }
    );
    await User.findByIdAndUpdate(uid, { $pull: { sharedDevices: deviceIdNorm } });
    return res.status(200).json({ message: "Device removed from your account" });
  } catch (e) {
    console.error("Remove shared error:", e);
    return res.status(500).json({ message: e.message || "Server error" });
  }
});

// POST /devices/remove-caretaker - Owner removes a caretaker from device
router.post("/remove-caretaker", authMiddleware, async (req, res) => {
  try {
    const { deviceId, caretakerId } = req.body;
    if (!deviceId || !caretakerId) {
      return res.status(400).json({ message: "deviceId and caretakerId required" });
    }
    const deviceIdNorm = String(deviceId).trim().toUpperCase();
    const device = await Device.findOne({ deviceId: deviceIdNorm });
    if (!device) return res.status(404).json({ message: "Device not found" });
    if (device.userId.toString() !== req.user.userId.toString()) {
      return res.status(403).json({ message: "Only the device owner can remove caretakers" });
    }

    await Device.updateOne(
      { deviceId: deviceIdNorm },
      { $pull: { sharedWith: { userId: caretakerId } } }
    );
    await User.findByIdAndUpdate(caretakerId, { $pull: { sharedDevices: deviceIdNorm } });
    return res.status(200).json({ message: "Caretaker removed" });
  } catch (e) {
    console.error("Remove caretaker error:", e);
    return res.status(500).json({ message: e.message || "Server error" });
  }
});

// Dashboard Device Renaming (Allowed for sub-admins/hospital admins)
router.patch("/dashboard-rename/:deviceId", authMiddleware, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { name, room, bed } = req.body;

    if (!deviceId || typeof deviceId !== 'string') {
      return res.status(400).json({ message: "Invalid device ID" });
    }
    const normalizedDeviceId = deviceId.trim().toUpperCase();

    const device = await Device.findOne({ deviceId: normalizedDeviceId });
    if (!device) return res.status(404).json({ message: "Device not found" });

    device.customName = name ? String(name).trim() : null;
    device.name = name ? String(name).trim() : device.defaultName;
    if (room !== undefined) {
      device.room = room ? String(room).trim().replace(/^Room\s+/i, '') : null;
    }
    if (bed !== undefined) {
      device.bed = bed ? String(bed).trim().replace(/^Bed\s+/i, '') : null;
    }
    await device.save();

    // Sync room and bed to any active monitoring session for this device
    if (room !== undefined || bed !== undefined) {
      // If either room or bed is explicitly cleared (set to null/empty string), the device is unassigned,
      // so we should auto-complete the active session.
      const isUnassigned = (room === null || room === '') || (bed === null || bed === '');
      
      if (isUnassigned) {
        await MonitoringSession.updateMany(
          { deviceId: normalizedDeviceId, status: 'active' },
          { $set: { status: 'completed', dischargeDate: new Date() } }
        );
      } else {
        const updateFields = {};
        if (room !== undefined) updateFields.room = device.room;
        if (bed !== undefined) updateFields.bed = device.bed;
        
        if (Object.keys(updateFields).length > 0) {
          await MonitoringSession.updateMany(
            { deviceId: normalizedDeviceId, status: 'active' },
            { $set: updateFields }
          );
        }
      }
    }

    res.json({ 
      success: true, 
      message: "Device updated successfully", 
      deviceId: normalizedDeviceId, 
      name: device.name,
      room: device.room,
      bed: device.bed
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// Dashboard Device Removal
router.delete("/dashboard-remove/:deviceId", authMiddleware, async (req, res) => {
  try {
    const { deviceId } = req.params;
    if (!deviceId) return res.status(400).json({ message: "Invalid device ID" });
    const normalizedDeviceId = deviceId.trim().toUpperCase();

    const device = await Device.findOne({ deviceId: normalizedDeviceId });
    if (!device) return res.status(404).json({ message: "Device not found" });

    // Remove deviceId from every caretaker's sharedDevices
    if (device.sharedWith && device.sharedWith.length > 0) {
      const caretakerIds = device.sharedWith.map((e) => e.userId).filter(Boolean);
      await User.updateMany(
        { _id: { $in: caretakerIds } },
        { $pull: { sharedDevices: device.deviceId } }
      );
    }

    if (device.userId) {
      await User.findByIdAndUpdate(device.userId, {
        $pull: {
          devices: device._id,
          ownedDevices: normalizedDeviceId,
          activeDevices: device._id
        }
      });
    }

    // Auto-complete any active monitoring sessions for this device
    await MonitoringSession.updateMany(
      { deviceId: normalizedDeviceId, status: 'active' },
      { $set: { status: 'completed', dischargeDate: new Date() } }
    );

    await Device.deleteOne({ deviceId: normalizedDeviceId });
    res.json({ success: true, message: "Device removed successfully" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// PATCH /devices/rename/:deviceId - Owner only: update device custom name
router.patch("/rename/:deviceId", authMiddleware, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { customName, room, bed } = req.body;
    const userId = req.user.userId;

    // Validate deviceId format
    if (!deviceId || typeof deviceId !== 'string') {
      return res.status(400).json({ message: "Invalid device ID" });
    }

    const normalizedDeviceId = deviceId.trim().toUpperCase();

    const device = await Device.findOne({ deviceId: normalizedDeviceId });
    if (!device) {
      return res.status(404).json({ message: "Device not found" });
    }
    // Only owner, org admin, or superadmin can rename
    const isSuperAdmin = req.user?.role === 'superadmin';
    let isOrgAdmin = false;
    let isOwner = false;
    let userObj = null;

    if (!isSuperAdmin) {
      userObj = await User.findById(userId).populate('account');
      isOwner = device.userId && device.userId.toString() === userId.toString();
      if (!isOwner && req.user?.role === 'admin' && device.organizationId) {
        if (userObj && userObj.account && userObj.account.organizationId && device.organizationId.toString() === userObj.account.organizationId.toString()) {
          isOrgAdmin = true;
        }
      }
    }

    if (!isOwner && !isOrgAdmin && !isSuperAdmin) {
      return res.status(403).json({ message: "Only the device owner, organization admin, or superadmin can rename it" });
    }

    // Validate customName (optional, but if provided must be non-empty string)
    let updatedName = null;
    if (customName !== undefined && customName !== null) {
      const trimmedName = String(customName).trim();
      if (trimmedName.length === 0) {
        // If empty string, clear custom name (UI should fallback to defaultName)
        device.customName = null;
        updatedName = device.defaultName; // For the response
      } else {
        // Set the custom name (max 50 characters)
        device.customName = trimmedName.substring(0, 50);
        updatedName = device.customName;
      }
    } else {
      // If null/undefined, clear custom name
      device.customName = null;
      updatedName = device.defaultName;
    }

    if (room !== undefined) {
      device.room = room ? String(room).trim().replace(/^Room\s+/i, '') : null;
    }
    if (bed !== undefined) {
      device.bed = bed ? String(bed).trim().replace(/^Bed\s+/i, '') : null;
    }

    // Save to Device collection
    await device.save();

    // Sync room and bed to any active monitoring session for this device
    if (room !== undefined || bed !== undefined) {
      // If either room or bed is explicitly cleared (set to null/empty string), the device is unassigned,
      // so we should auto-complete the active session.
      const isUnassigned = (room === null || room === '') || (bed === null || bed === '');
      
      if (isUnassigned) {
        await MonitoringSession.updateMany(
          { deviceId: normalizedDeviceId, status: 'active' },
          { $set: { status: 'completed', dischargeDate: new Date() } }
        );
      } else {
        const updateFields = {};
        if (room !== undefined) updateFields.room = device.room;
        if (bed !== undefined) updateFields.bed = device.bed;
        
        if (Object.keys(updateFields).length > 0) {
          await MonitoringSession.updateMany(
            { deviceId: normalizedDeviceId, status: 'active' },
            { $set: updateFields }
          );
        }
      }
    }

    // Also update User.deviceNames Map for backward compatibility
    const user = await User.findById(userId);
    if (user) {
      if (updatedName) {
        if (!user.deviceNames) {
          user.deviceNames = new Map();
        }
        user.deviceNames.set(normalizedDeviceId, updatedName);
      } else {
        // Remove from User.deviceNames if name is removed
        if (user.deviceNames) {
          user.deviceNames.delete(normalizedDeviceId);
        }
      }
      await user.save();
    }

    console.log(`✅ Device name updated for ${normalizedDeviceId}: ${updatedName || 'removed'}`);

    res.json({
      success: true,
      message: updatedName ? "Device name updated successfully" : "Device name removed",
      deviceId: normalizedDeviceId,
      customName: updatedName
    });
  } catch (error) {
    console.error("Error updating device name:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// PUT /devices/:deviceId/thresholds - Owner or admin updates device specific thresholds
router.put("/:deviceId/thresholds", authMiddleware, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { hrMin, hrMax, respMin, respMax, thresholdMode } = req.body;
    
    if (!deviceId) return res.status(400).json({ message: "deviceId required" });
    const normalizedDeviceId = deviceId.trim().toUpperCase();

    const device = await Device.findOne({ deviceId: normalizedDeviceId });
    if (!device) return res.status(404).json({ message: "Device not found" });

    // Ensure user has access
    const uid = req.user.userId?.toString();
    const isSuperAdmin = req.user?.role === 'superadmin';
    const isOwner = device.userId && device.userId.toString() === uid;
    
    let isOrgAdmin = false;
    if (!isSuperAdmin && !isOwner && req.user?.role === 'admin' && device.organizationId) {
      const userObj = await User.findById(uid).populate('account');
      if (userObj && userObj.account && userObj.account.organizationId && device.organizationId.toString() === userObj.account.organizationId.toString()) {
        isOrgAdmin = true;
      }
    }

    if (!isOwner && !isOrgAdmin && !isSuperAdmin) {
      return res.status(403).json({ message: "Access denied. You cannot modify thresholds for this device." });
    }

    // Handle thresholdMode switching
    if (thresholdMode === "global") {
      // Reset device thresholds to the organization's global SystemConfig values
      const SystemConfig = require("../models/SystemConfig");
      let globalConfig = null;

      if (device.organizationId) {
        // Find the admin user account linked to this organization
        const orgAccount = await Account.findOne({ organizationId: device.organizationId });
        if (orgAccount && orgAccount.defaultUser) {
          globalConfig = await SystemConfig.findOne({ userId: orgAccount.defaultUser });
        }
      }

      // Fall back to defaults if no SystemConfig found
      device.hrMin = globalConfig?.hrMin ?? 40;
      device.hrMax = globalConfig?.hrMax ?? 120;
      device.respMin = globalConfig?.respMin ?? 8;
      device.respMax = globalConfig?.respMax ?? 30;
      device.thresholdMode = "global";
    } else {
      // Individual mode — save custom values
      if (hrMin !== undefined) device.hrMin = hrMin;
      if (hrMax !== undefined) device.hrMax = hrMax;
      if (respMin !== undefined) device.respMin = respMin;
      if (respMax !== undefined) device.respMax = respMax;
      device.thresholdMode = "individual";
    }

    await device.save();

    return res.status(200).json({
      success: true,
      message: thresholdMode === "global"
        ? "Device thresholds reset to global organization values"
        : "Device thresholds updated successfully",
      device: {
        deviceId: device.deviceId,
        hrMin: device.hrMin,
        hrMax: device.hrMax,
        respMin: device.respMin,
        respMax: device.respMax,
        thresholdMode: device.thresholdMode
      }
    });

  } catch (error) {
    console.error("Error updating device thresholds:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// POST /devices/auto-register - Auto-register device to current user
// Called automatically when device connects to WiFi
router.post("/auto-register", authMiddleware, async (req, res) => {
  try {
    const { serialNumber, bleMac, organizationId } = req.body;
    const currentUserId = req.user.userId;

    // Validate serial number
    if (!serialNumber || typeof serialNumber !== 'string') {
      return res.status(400).json({
        success: false,
        message: "Serial number is required"
      });
    }

    const deviceId = serialNumber.trim().toUpperCase();
    const normalizedBleMac = (bleMac && typeof bleMac === 'string')
      ? bleMac.replace(/[:\-]/g, '').toUpperCase().slice(-12)
      : null;

    // Find device by deviceId (serialNumber)
    let device = await Device.findOne({ deviceId });

    const now = new Date();
    let wasReassigned = false;
    let previousUserId = null;

    if (device) {
      // Device exists - check if it needs reassignment
      previousUserId = device.userId ? device.userId.toString() : null;
      const currentUserIdStr = currentUserId.toString();

      // Transfer ownership if moving to a new user, OR moving from a user to an organization
      if (previousUserId && (organizationId || previousUserId !== currentUserIdStr)) {
        wasReassigned = true;

        // Remove device from previous user's devices array and ownedDevices
        const previousUser = await User.findById(previousUserId);
        if (previousUser) {
          previousUser.devices = previousUser.devices.filter(
            d => d.toString() !== device._id.toString()
          );
          if (previousUser.ownedDevices) {
            previousUser.ownedDevices = previousUser.ownedDevices.filter(
              id => id !== device.deviceId
            );
          }
          if (previousUser.activeDevice &&
            previousUser.activeDevice.toString() === device._id.toString()) {
            previousUser.activeDevice = null;
          }
          await previousUser.save();
        }
      }

      // Update device owner
      if (organizationId) {
        device.organizationId = new mongoose.Types.ObjectId(organizationId);
        device.userId = null;
      } else {
        // Personal user registration — NEVER inherit organizationId from the user's account.
        // Only explicitly-passed organizationId should link a device to an org.
        const userObj = await User.findById(currentUserId);
        device.userId = new mongoose.Types.ObjectId(currentUserId);
        device.organizationId = null; // Always clear org for personal registration
        if (userObj && userObj.accountId) {
          device.accountId = userObj.accountId;
        }
      }

      device.status = "active";
      device.wifiStatus = "CONNECTED";
      device.wifiConnectedAt = now;
      device.lastActiveAt = now;
      if (normalizedBleMac) device.bleMac = normalizedBleMac;

      // Regenerate default name if missing OR device was reassigned to a new owner
      if (!device.defaultName || wasReassigned) {
        const defaultName = await generateDefaultDeviceName(currentUserId);
        device.defaultName = defaultName;
        if (!device.customName || wasReassigned) {
          device.customName = defaultName;
        }
      }

      await device.save();

      // Mongoose .save() ignores `undefined` fields — use a raw $unset to guarantee
      // the old organizationId/accountId are wiped for personal registrations.
      if (!organizationId) {
        await Device.updateOne(
          { _id: device._id },
          { $unset: { organizationId: 1 } }
        );
      }

      // ✅ WebSocket cleanup and audit logging for ownership transfer
      if (wasReassigned && previousUserId) {
        const io = getIO();

        if (io) {
          try {
            // Find all sockets for old owner
            const sockets = await io.in(`user:${previousUserId}`).fetchSockets();

            sockets.forEach(socket => {
              // Force leave device room
              socket.leave(`device:${deviceId}`);

              // Emit ownership transfer event
              socket.emit('device_ownership_transferred', {
                deviceId,
                message: 'Device ownership has been transferred to another account'
              });
            });

            logger.info('WebSocket cleanup on ownership shift', {
              deviceId,
              previousUserId,
              currentUserId,
              socketsDisconnected: sockets.length
            });
          } catch (wsError) {
            logger.err(wsError, {
              where: 'auto-register: WebSocket cleanup',
              deviceId,
              previousUserId
            });
          }
        }

        // ✅ Audit log: Device ownership transferred
        logger.info('Device ownership transferred', {
          deviceId,
          fromUserId: previousUserId,
          toUserId: currentUserId,
          timestamp: now.toISOString(),
          source: 'auto-register',
          wasReassigned: true
        });
      }

    } else {
      // Device is new - create it
      // Extract device type and manufacturer from deviceId (first 2 chars)
      const deviceType = deviceId.substring(0, 2) || "01";
      const manufacturer = "02"; // Default manufacturer, adjust as needed

      // Generate default name if customName is not set
      const defaultName = await generateDefaultDeviceName(currentUserId);

      device = await Device.create({
        deviceId,
        deviceType,
        manufacturer,
        firmwareVersion: "1.0.0", // Default, can be updated later
        location: "Unknown", // Default, can be updated later
        status: "active",
        userId: organizationId ? null : new mongoose.Types.ObjectId(currentUserId),
        organizationId: organizationId ? new mongoose.Types.ObjectId(organizationId) : null,
        wifiStatus: "CONNECTED",
        wifiConnectedAt: now,
        lastActiveAt: now,
        createdAt: now,
        validity: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
        profileVersion: 1,
        defaultName: defaultName, // Set permanent slot name
        customName: defaultName,  // Initial custom name is the same as default
        bleMac: normalizedBleMac || undefined
      });

      // ✅ Audit log: Device ownership assigned (new device)
      logger.info('Device ownership assigned', {
        deviceId,
        userId: currentUserId,
        timestamp: now.toISOString(),
        source: 'auto-register',
        wasReassigned: false
      });
    }

    // Add device to current user's devices array (if not already present AND not assigning to org)
    if (!organizationId) {
      const currentUser = await User.findById(currentUserId);
      if (currentUser) {
        const deviceIdInArray = currentUser.devices.find(
          d => d.toString() === device._id.toString()
        );

        if (!deviceIdInArray) {
          currentUser.devices.push(device._id);
          currentUser.ownedDevices = currentUser.ownedDevices || [];
          if (!currentUser.ownedDevices.includes(device.deviceId)) {
            currentUser.ownedDevices.push(device.deviceId);
          }
          // Set as active device if user doesn't have one
          if (!currentUser.activeDevice && device.status === "active") {
            currentUser.activeDevice = device._id;
          }
          await currentUser.save();
        }
      }
    }

    // ✅ Notify new owner via WebSocket (if ownership was transferred)
    if (wasReassigned) {
      const io = getIO();
      if (io) {
        try {
          const newOwnerSockets = await io.in(`user:${currentUserId}`).fetchSockets();
          newOwnerSockets.forEach(socket => {
            socket.emit('device_added', {
              deviceId,
              message: 'Device has been added to your account'
            });
          });
        } catch (wsError) {
          logger.err(wsError, {
            where: 'auto-register: Notify new owner',
            deviceId,
            currentUserId
          });
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: wasReassigned
        ? "Device registered successfully (transferred from another user)"
        : "Device registered successfully",
      device: {
        deviceId: device.deviceId,
        _id: device._id,
        userId: device.userId,
        status: device.status,
        wifiStatus: device.wifiStatus,
        wifiConnectedAt: device.wifiConnectedAt,
        bleMac: device.bleMac,
        defaultName: device.defaultName || null,
        customName: device.customName || null
      },
      wasReassigned
    });

  } catch (error) {
    console.error("Error in auto-register device:", error);

    // Handle duplicate key error (shouldn't happen but just in case)
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Device already exists"
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to register device",
      error: error.message
    });
  }
});


module.exports = router;