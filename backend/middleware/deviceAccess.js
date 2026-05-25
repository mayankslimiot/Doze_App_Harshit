/**
 * Device access: allow if user is owner (device.userId) or caretaker (in device.sharedWith).
 * Attaches device to req.device and req.deviceRole = 'owner' | 'caretaker'.
 * Use for: graph APIs, history APIs, live data APIs.
 * Caretakers: read-only (block delete, share, rename in route handlers).
 */
const Device = require("../models/Device");
const mongoose = require("mongoose");

async function deviceAccess(req, res, next) {
  try {
    const deviceId = req.params.deviceId || req.query.deviceId || req.body?.deviceId;
    if (!deviceId) {
      return res.status(400).json({ message: "deviceId required" });
    }
    const device = await Device.findOne({ deviceId: String(deviceId).trim().toUpperCase() });
    if (!device) {
      return res.status(404).json({ message: "Device not found" });
    }
    const userId = req.user?.userId ? new mongoose.Types.ObjectId(req.user.userId) : null;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const isOwner = device.userId && device.userId.toString() === userId.toString();
    const isCaretaker = Array.isArray(device.sharedWith) &&
      device.sharedWith.some((e) => e.userId && e.userId.toString() === userId.toString());
    if (!isOwner && !isCaretaker) {
      return res.status(403).json({ message: "Access denied to this device" });
    }
    req.device = device;
    req.deviceRole = isOwner ? "owner" : "caretaker";
    next();
  } catch (e) {
    return res.status(500).json({ message: "Server error" });
  }
}

/** Require owner only (block caretakers). Use for delete, share, remove-caretaker, rename. */
function requireOwner(req, res, next) {
  if (req.deviceRole !== "owner") {
    return res.status(403).json({ message: "Only the device owner can perform this action" });
  }
  next();
}

module.exports = { deviceAccess, requireOwner };
