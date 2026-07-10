const mongoose = require('mongoose');

const MonitoringSessionSchema = new mongoose.Schema({
  // ── Core patient info ────────────────────────────────────────────────────
  name:          { type: String },
  patientId:     { type: String, required: true },
  room:          { type: String, required: true },
  bed:           { type: String, required: true },
  age:           { type: Number },
  sex:           { type: String },
  admissionDate: { type: Date, required: true },
  dischargeDate: { type: Date },

  // Optional Contact Info
  patientPhone:   { type: String },
  patientEmail:   { type: String },
  caretakerPhone: { type: String },
  caretakerEmail: { type: String },

  // ── Device & session ─────────────────────────────────────────────────────
  deviceId:        { type: String, required: true },
  technicianNotes: { type: String },
  consentVerified: { type: Boolean, required: true },
  status: {
    type: String,
    enum: ['scheduled', 'active', 'completed', 'cancelled'],
    default: 'active'
  },

  // ── Review fields ────────────────────────────────────────────────────────
  isReviewed:     { type: Boolean, default: false },
  reviewedAt:     { type: Date },
  flagged:        { type: Boolean, default: false },
  reviewedEvents: { type: [String], default: [] },

  // ── Legacy fields (kept optional for old documents) ──────────────────────
  patientCode:     { type: String },
  bedId:           { type: String },
  startTime:       { type: Date },
  expectedEndTime: { type: Date },
}, {
  timestamps: true
});

module.exports = mongoose.model('MonitoringSession', MonitoringSessionSchema, 'patients');
