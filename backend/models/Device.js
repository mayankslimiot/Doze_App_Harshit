const mongoose = require("mongoose");

const DeviceSchema = new mongoose.Schema({
  deviceId: { type: String, unique: true, required: true },  // Unique device identifier
  deviceType: { type: String, required: true },             // Device Type
  manufacturer: { type: String, required: true },           // Manufacturer Name
  // NEW
  accountId: { type: String }, // ties back to account/email
  profileId: { type: mongoose.Schema.Types.ObjectId, ref: "Profile"},
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null },

  firmwareVersion: { type: String, required: true },        // Firmware Version
  location: { type: String, required: true },               // Device Location
  status: {
    type: String,
    enum: ["active", "inactive", "under maintenance"],
    default: "inactive"
  },  // Device Status
  lastActiveAt: { type: Date },                              // Last Active Date
  createdAt: { type: Date, default: Date.now },              // Created Date
  validity: { type: Date, required: true },                 // Validity Date
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, // User who owns the device
  profileVersion: { type: Number, default: 1 },
  // WiFi Status fields
  wifiStatus: {
    type: String,
    enum: ["CONNECTED", "FAILED", null],
    default: null
  },                                                          // WiFi Connection Status
  wifiConnectedAt: { type: Date },                          // Last successful WiFi connection timestamp
  wifiLastAttempt: { type: Date },                          // Last WiFi connection attempt timestamp
  customName: { type: String, trim: true, maxlength: 50 },   // User-defined custom name for the device
  defaultName: { type: String, trim: true, maxlength: 50 },  // Permanent default name (e.g. Dozemate_1)
  bleMac: { type: String, trim: true },                    // BLE MAC address (e.g. CF5585A050D2) for device matching during scan
  // Bed Status fields (real-time bed occupancy state)
  bedStatus: {
    type: String,
    enum: ["Vacant", "Occupied", "Waiting"],
    default: "Vacant"
  },                                                          // Bed occupancy status
  absenceStart: { type: Number },                            // AS field from device stream (0 = Vacant, 1 = Occupied)
  HV: { type: Number },                                      // Human Validity field from device stream
  isLive: { type: Boolean, default: false },                // Whether device is actively sending data
  // Caretaker / shared device: one owner (userId), multiple read-only caretakers
  sharedWith: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    email: { type: String }
  }],
  room: { type: String, default: null },
  bed: { type: String, default: null },
  // Per-Device Clinical Thresholds
  hrMin: { type: Number, default: 40 },
  hrMax: { type: Number, default: 120 },
  respMin: { type: Number, default: 8 },
  respMax: { type: Number, default: 30 },
  thresholdMode: { type: String, enum: ["global", "individual"], default: "global" }
});

DeviceSchema.index({ profileId: 1 });

module.exports = mongoose.model("Device", DeviceSchema);
