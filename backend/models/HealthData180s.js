const mongoose = require("mongoose");

const HealthData180sSchema = new mongoose.Schema({
    deviceId: { type: String, required: true },
    seq: { type: Number, required: true },
    ts: { type: Number, required: true },
    TS: { type: Number },
    timestamp: { type: Date, default: Date.now },
    /** Same moment as timestamp in IST (e.g. "2025-02-13 18:30:00 IST") for CSV/export */
    timestampIST: { type: String, default: undefined },
    receivedAt: { type: Date, default: Date.now },
    streamType: { type: String, default: "180s" },
    streamVersion: { type: String, default: "v2" },
    isBuffered: { type: Boolean, default: false },
    
    // Store the full payload data
    payload: {
        type: Object,
        required: true
    }

}, {
    strict: false,  // Allow flexible payload structure
    collection: 'healthdata_180s'  // Use custom collection name
});

// Unique index to prevent duplicates based on deviceId + seq + ts
HealthData180sSchema.index({ deviceId: 1, seq: 1, ts: 1 }, { unique: true });

// Additional index for querying
HealthData180sSchema.index({ deviceId: 1, timestamp: -1 });

module.exports = mongoose.model("HealthData180s", HealthData180sSchema);

