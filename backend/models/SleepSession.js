const mongoose = require("mongoose");

const SleepSessionSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  
  // Sleep timing
  tibStart: { type: Date, required: true }, // Time in Bed start (first AS=1)
  sleepOnsetTime: { type: Date, required: true }, // Actual sleep start (AS=1 AND HV=1 for 30 min)
  sleepEndTime: { type: Date, required: true }, // Last sleep point (before 30-min gap)
  finalWakeUpTime: { type: Date, required: true }, // Confirmed wake-up (sleepEnd + 30 min)
  tibEnd: { type: Date, required: true }, // Time in Bed end (final out of bed)
  
  // Sleep metrics
  sleepLatency: { type: Number, required: true }, // Minutes from TIB start to sleep onset
  totalSleepTime: { type: Number, required: true }, // TST in minutes (sum of AS=1 AND HV=1 periods)
  timeInBed: { type: Number, required: true }, // TIB in minutes
  sleepEfficiency: { type: Number, required: true }, // Percentage (TST/TIB * 100)
  
  // Awakenings
  awakenings: { type: Number, default: 0 }, // Number of wake periods during sleep
  wakeTime: { type: Number, default: 0 }, // Total wake time in minutes (AS=1 but HV=0)
  outOfBedTime: { type: Number, default: 0 }, // Total out-of-bed time in minutes (AS=0 during sleep)
  
  // Heart rate metrics
  restingHeartRate: { type: Number }, // Average HR during stable sleep
  minHeartRate: { type: Number }, // Minimum HR during sleep
  
  // Data quality
  dataQuality: { type: Number, required: true }, // Percentage of valid data (0-100)
  validDataPoints: { type: Number, required: true }, // Count of valid sleep points
  expectedDataPoints: { type: Number, required: true }, // Expected data points for sleep duration
  
  // Sleep score (only if TST >= 3 hours)
  sleepScore: { type: Number }, // 0-100 score
  
  // Session date (IST date for the sleep session)
  sessionDate: { type: String, required: true, index: true }, // YYYY-MM-DD format
  
  // Metadata
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// Compound index for efficient queries
SleepSessionSchema.index({ deviceId: 1, sessionDate: -1 });
SleepSessionSchema.index({ userId: 1, sessionDate: -1 });
SleepSessionSchema.index({ deviceId: 1, tibStart: -1 });

module.exports = mongoose.model("SleepSession", SleepSessionSchema);
