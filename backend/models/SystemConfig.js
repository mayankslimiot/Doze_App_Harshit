const mongoose = require("mongoose");



const SystemConfigSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  hrMin: { type: Number, default: 40 },
  hrMax: { type: Number, default: 120 },
  respMin: { type: Number, default: 8 },
  respMax: { type: Number, default: 30 },
  globalTrigger: { type: Boolean, default: true },
  smsEnabled: { type: Boolean, default: true },
  popupEnabled: { type: Boolean, default: true },
  emailEnabled: { type: Boolean, default: false },
  pushEnabled: { type: Boolean, default: true },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("SystemConfig", SystemConfigSchema);
