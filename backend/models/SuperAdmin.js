const mongoose = require("mongoose");

const superAdminSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, "Please provide an email"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Please provide a password"],
      select: false,
    },
    isFirstLogin: {
      type: Boolean,
      default: true,
    },
    role: {
      type: String,
      default: "super_admin",
    },
    activeDevice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Device",
      default: null,
    },
    name: {
      type: String,
      default: "Super Admin",
    },
    mobile: {
      type: Number,
    },
    dateOfBirth: {
      type: Date,
    },
    gender: {
      type: String,
      enum: ["male", "female", "other", "prefer-not-to-say"],
    },
    weight: {
      type: Number,
    },
    weightUnit: {
      type: String,
      enum: ["kg", "lbs"],
      default: "kg",
    },
    height: {
      type: Number,
    },
    heightUnit: {
      type: String,
      enum: ["ft_in", "cm", "m"],
      default: "ft_in",
    },
    waist: {
      type: Number,
    },
    waistUnit: {
      type: String,
      enum: ["in", "cm"],
      default: "in",
    },
    profileImage: {
      type: String,
      default: "/uploads/defaults/default-profile.jpg",
    },
    address: {
      type: String,
      default: "",
    },
    pincode: {
      type: Number,
    },
  },
  {
    timestamps: true,
  }
);

const SuperAdmin = mongoose.model("SuperAdmin", superAdminSchema);

module.exports = SuperAdmin;
