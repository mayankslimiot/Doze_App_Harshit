const mongoose = require("mongoose");

const TicketSchema = new mongoose.Schema({
  ticketType: {
    type: String,
    enum: ["Device Setup", "Participant/Session Setup", "Signal Quality Issue", "Dashboard Bug", "Report Export Error", "General Feedback"],
    required: true
  },
  priority: {
    type: String,
    enum: ["Low", "Medium", "High"],
    default: "Low"
  },
  sessionId: { type: String, default: "" },
  participantCode: { type: String, default: "" },
  deviceId: { type: String, default: "" },
  wardBedId: { type: String, default: "" },
  issueTime: { type: Date, default: Date.now },
  description: { type: String, required: true },
  screenshot: { type: String, default: "" }, // base64 or mock attachment text
  impact: {
    type: String,
    enum: ["Minimal", "Moderate", "Major"],
    default: "Minimal"
  },
  status: {
    type: String,
    enum: ["Open", "In Progress", "Resolved"],
    default: "Open"
  },
  assignedPerson: { type: String, default: "Unassigned" },
  resolutionNote: { type: String, default: "" },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null },
  resolvedAt: { type: Date }
}, {
  timestamps: true
});

module.exports = mongoose.model("Ticket", TicketSchema);
