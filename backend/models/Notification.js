const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null },
  deviceId: { type: String, required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, default: "alert" },
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

// Index for efficient querying by organization and unread status
NotificationSchema.index({ organizationId: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", NotificationSchema);
