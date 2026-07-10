const mongoose = require('mongoose');

const ManualEntrySchema = new mongoose.Schema({
  deviceId:    { type: String, required: true },
  room:        { type: String, required: true },
  bed:         { type: String, required: true },
  heartRate:   { type: Number, required: true },
  respiration: { type: Number, required: true },
  date:        { type: Date, required: true },
  time:        { type: String, required: true },
  deviceAvgHr: { type: Number, default: null },
  deviceAvgResp: { type: Number, default: null },
}, {
  timestamps: true
});

module.exports = mongoose.model('ManualEntry', ManualEntrySchema, 'manual_entry');
