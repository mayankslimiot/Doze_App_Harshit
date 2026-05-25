/**
 * One-time migration for Caretaker / Shared Device feature.
 * - For every Device: set sharedWith = [] if missing.
 * - For every User: set ownedDevices = deviceIds from user.devices, sharedDevices = [] if missing.
 * Run once: node backend/scripts/migrateDevices.js (from project root).
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Device = require("../models/Device");
const User = require("../models/User");
const connectDB = require("../config/db");

async function run() {
  await connectDB();

  // 1) Devices: ensure sharedWith exists
  const devices = await Device.find({});
  let deviceUpdates = 0;
  for (const d of devices) {
    if (!Array.isArray(d.sharedWith)) {
      await Device.updateOne({ _id: d._id }, { $set: { sharedWith: [] } });
      deviceUpdates++;
    }
  }
  console.log(`Devices: ensured sharedWith on ${deviceUpdates} documents`);

  // 2) Users: set ownedDevices from devices[], sharedDevices = [] if missing
  const users = await User.find({});
  let userUpdates = 0;
  for (const u of users) {
    const updates = {};
    if (!Array.isArray(u.ownedDevices)) {
      updates.ownedDevices = [];
    }
    if (!Array.isArray(u.sharedDevices)) {
      updates.sharedDevices = [];
    }
    if (u.devices && u.devices.length > 0) {
      const deviceDocs = await Device.find({ _id: { $in: u.devices } }).select("deviceId").lean();
      const deviceIds = deviceDocs.map((d) => d.deviceId).filter(Boolean);
      if (deviceIds.length > 0) {
        updates.ownedDevices = [...new Set([...(u.ownedDevices || []), ...deviceIds])];
      }
    }
    if (Object.keys(updates).length) {
      await User.updateOne({ _id: u._id }, { $set: updates });
      userUpdates++;
    }
  }
  console.log(`Users: updated ownedDevices/sharedDevices on ${userUpdates} documents`);

  console.log("Migration complete.");
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
