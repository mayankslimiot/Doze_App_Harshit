const mongoose = require('mongoose');

const FeedbackSchema = new mongoose.Schema({
  sessionCode: {
    type: String,
    required: false
  },
  nameOfSubmitter: {
    type: String
  },
  subject: {
    type: String
  },
  severity: {
    type: String,
    enum: ['High', 'Medium', 'Low'],
    default: 'Low'
  },
  problemDetails: {
    type: String
  },
  submittedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User submitting the feedback is required']
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    default: null
  },
  isRead: {
    type: Boolean,
    default: false
  },
  technicianFeedback: {
    setupEase: { type: Number, min: 0, max: 5, default: 0 },
    placementClarity: { type: Number, min: 0, max: 5, default: 0 },
    usability: { type: Number, min: 0, max: 5, default: 0 },
    signalIssues: { type: Boolean, default: null },
    alertUnderstanding: { type: Boolean, default: null },
    comments: { type: String, default: '' }
  },
  doctorFeedback: {
    clinicalUtility: { type: Number, min: 0, max: 5, default: 0 },
    reportClarity: { type: Number, min: 0, max: 5, default: 0 },
    diagnosticConfidence: { type: Boolean, default: null },
    comments: { type: String, default: '' }
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Feedback', FeedbackSchema);
