const mongoose = require("mongoose");

const HospitalSchema = new mongoose.Schema({
  hospitalId: { 
    type: String, 
    required: true, 
    unique: true 
  },
  name: { 
    type: String, 
    required: [true, "Hospital name is required"] 
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
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Pre-save hook to update the updatedAt field
HospitalSchema.pre("findOneAndUpdate", function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

module.exports = mongoose.model("Hospital", HospitalSchema);
