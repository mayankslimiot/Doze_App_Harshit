const mongoose = require("mongoose");

const OrganizationSchema = new mongoose.Schema({
  organizationId: { 
    type: String, 
    required: true, 
    unique: true 
  },
  name: { 
    type: String, 
    required: [true, "Organization name is required"] 
  },
  address: { 
    type: String, 
    required: [true, "Address is required"] 
  },
  contactNumber: { 
    type: String, 
    required: [true, "Contact number is required"] 
  },
  email: { 
    type: String, 
    required: [true, "Email is required"],
    match: [/.+@.+\..+/, "Please enter a valid email address"] 
  },
  pincode: { 
    type: String, 
    required: [true, "Pincode is required"] 
  },
  website: {
    type: String,
    default: ""
  },
  taxId: {
    type: String,
    default: ""
  },
  servicePlan: {
    type: String,
    default: "trial"
  },
  seatLimit: {
    type: Number,
    default: 100
  },
  // New fields
  contactPerson: {
    type: String,
    default: ""
  },
  description: {
    type: String,
    default: ""
  },
  logo: { 
    type: String,
    default: "/uploads/defaults/default-org-logo.png" 
  },
  accentColor: {
    type: String,
    default: "#007b90"
  },
  isActive: {
    type: Boolean,
    default: true
  },
  activeStartDate: {
    type: Date,
    default: Date.now
  },
  activeEndDate: {
    type: Date,
    default: null
  },
  suspendedAt: {
    type: Date,
    default: null
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  },
  organizationType: {
    type: String,
    enum: ["hospital", "other"],
    default: "hospital"
  },
  viewers: [{
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  }]
});

// Pre-save hook to update the updatedAt field
OrganizationSchema.pre("findOneAndUpdate", function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

module.exports = mongoose.model("Organization", OrganizationSchema);