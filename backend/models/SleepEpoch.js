const mongoose = require("mongoose");

const SleepEpochSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, index: true },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "SleepSession", index: true },
  sessionDate: { type: String, required: true, index: true },
  
  // Timestamps
  timestamp: { type: Number, required: true }, // UNIX seconds
  timestampIST: { type: String, required: true }, // e.g., "2026-05-26 23:30:00 IST"
  
  // Classification
  stage: { type: String, required: true }, // 'AWAKE' | 'LIGHT' | 'DEEP' | 'REM'
  rawStage: { type: String }, // pre-smoothing stage
  tLastTurn: { type: Number }, // seconds since last motion stop
  
  // Raw Data (30-sec medians/SDs)
  hr: { type: Number },
  rr: { type: Number },
  hr_sd_5m: { type: Number },
  rr_sd_5m: { type: Number },
  
  // Categorical States (Manager Database)
  hr_state: { type: Number },
  resp_state: { type: Number },
  hr_stability: { type: Number },
  
  // Metadata
  createdAt: { type: Date, default: Date.now }
});

// Compound index for efficient queries
SleepEpochSchema.index({ deviceId: 1, timestamp: 1 });
SleepEpochSchema.index({ sessionId: 1, timestamp: 1 });

module.exports = mongoose.model("SleepEpoch", SleepEpochSchema);
