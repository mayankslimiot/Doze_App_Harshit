const express = require("express");
const fs = require("fs");
const mongoose = require("mongoose");
const User = require("../models/User");
const SuperAdmin = require("../models/SuperAdmin");
const Device = require("../models/Device");
const Account = require("../models/Account");
const Organization = require("../models/Organization");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const authMiddleware = require("../middleware/authMiddleware");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const { sendEmail } = require("../utils/mailer");

const UPLOADS_PROFILES_DIR = path.join(__dirname, "..", "uploads", "profiles");

// Configure multer for profile image uploads
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, 'uploads/profiles/');
  },
  filename: function(req, file, cb) {
    cb(null, `user-${req.user.userId}-${Date.now()}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function(req, file, cb) {
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
      return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
  }
});

// Get current user profile
router.get("/profile", authMiddleware, async (req, res) => {
  try {
    // Ensure we have userId from the decoded token
    const userId = req.user?.userId || req.user?.id;
    console.log("[PROFILE] Request received, userId:", userId);
    
    if (!userId) {
      console.error("[PROFILE] No userId found in token:", req.user);
      return res.status(401).json({ message: "User ID not found in token" });
    }

    let user;
    let isSuperAdmin = req.user?.role === "superadmin";

    if (isSuperAdmin) {
      const adminUser = await SuperAdmin.findById(userId).select("-password").lean();
      if (adminUser) {
        user = {
          ...adminUser,
          role: "superadmin",
          isVerified: true,
          devices: [],
          activeDevices: []
        };
      }
    } else {
      user = await User.findById(userId).select("-password");
    }
    
    if (!user) {
      console.error("[PROFILE] User not found with userId:", userId);
      return res.status(404).json({ message: "User not found" });
    }

    if (!isSuperAdmin) {
      console.log("[PROFILE] User found, populating devices...");
      // Populate devices - handle errors gracefully
      try {
        user = await User.findById(userId)
          .select("-password")
          .populate({
            path: "devices",
            select: "deviceId deviceType manufacturer status lastActiveAt",
            options: { strictPopulate: false }
          })
          .populate({
            path: "activeDevices",
            select: "deviceId deviceType manufacturer status lastActiveAt",
            options: { strictPopulate: false }
          })
          .populate({
            path: "account",
            populate: {
              path: "organizationId",
              model: "Organization",
              select: "name logo accentColor address contactNumber email pincode servicePlan seatLimit organizationType"
            }
          });
      } catch (populateError) {
        console.warn("[PROFILE] Populate error, returning user without populated devices:", populateError.message);
        // Return user without populated devices if populate fails
        user = await User.findById(userId).select("-password").populate({
          path: "account",
          populate: { path: "organizationId", model: "Organization", select: "name logo accentColor address contactNumber email pincode servicePlan seatLimit organizationType" }
        });
      }
    }

    console.log("[PROFILE] Successfully fetched profile for user:", user.email);
    // Return user data directly (not wrapped in data property for consistency with frontend)
    res.json(user);
  } catch (error) {
    console.error("[PROFILE] Error fetching user profile:", error);
    console.error("[PROFILE] Error stack:", error.stack);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Update user profile
router.put("/profile", authMiddleware, async (req, res) => {
  try {
    const { 
      name, 
      email, 
      address, 
      pincode, 
      mobile, 
      dateOfBirth, 
      gender, 
      weight, 
      weightUnit,
      height, 
      heightUnit,
      waist,
      waistUnit,
      profileImage
    } = req.body;
    
    const isSuperAdmin = req.user?.role === "superadmin";

    // Check if email is already in use by another user
    if (email && email.trim() !== '') {
      const Model = isSuperAdmin ? SuperAdmin : User;
      const existingUser = await Model.findOne({ email, _id: { $ne: req.user.userId } });
      if (existingUser) {
        return res.status(400).json({ message: "Email already in use" });
      }
    }

    // Build update object only with valid values
    const updateData = {};
    
    // Only add fields that are not null, undefined, or empty strings
    if (name && name.trim() !== '') updateData.name = name.trim();
    if (email && email.trim() !== '') updateData.email = email.trim();
    if (address && address.trim() !== '') updateData.address = address.trim();
    if (pincode && pincode.toString().trim() !== '') updateData.pincode = pincode;
    if (mobile && mobile.toString().trim() !== '') updateData.mobile = mobile;
    
    // Handle date field
    if (dateOfBirth && dateOfBirth !== null) updateData.dateOfBirth = dateOfBirth;
    
    // Handle enum field
    if (gender && gender.trim() !== '') updateData.gender = gender.trim();
    
    // Handle numeric fields (allow 0 as valid value)
    if (weight !== null && weight !== undefined && weight !== '') updateData.weight = weight;
    if (weightUnit && weightUnit.trim() !== '') updateData.weightUnit = weightUnit.trim();
    if (height !== null && height !== undefined && height !== '') updateData.height = height;
    if (heightUnit && heightUnit.trim() !== '') updateData.heightUnit = heightUnit.trim();
    if (waist !== null && waist !== undefined && waist !== '') updateData.waist = waist;
    if (waistUnit && waistUnit.trim() !== '') updateData.waistUnit = waistUnit.trim();

    // Profile image: save base64 to file in uploads/profiles/, or null to clear
    if (profileImage !== undefined) {
      const userId = req.user.userId;
      const Model = isSuperAdmin ? SuperAdmin : User;
      const currentUser = await Model.findById(userId).select("profileImage").lean();

      if (profileImage === null || profileImage === "") {
        updateData.profileImage = null;
        if (currentUser?.profileImage && currentUser.profileImage.startsWith("/uploads/profiles/")) {
          const oldPath = path.join(UPLOADS_PROFILES_DIR, path.basename(currentUser.profileImage));
          try { fs.unlinkSync(oldPath); } catch (_) {}
        }
      } else if (typeof profileImage === "string" && profileImage.startsWith("data:image")) {
        const base64 = profileImage.includes(",") ? profileImage.split(",")[1] : profileImage;
        if (!base64) {
          return res.status(400).json({ message: "Invalid profile image data" });
        }
        const buffer = Buffer.from(base64, "base64");
        fs.mkdirSync(UPLOADS_PROFILES_DIR, { recursive: true });
        const filename = `user-${userId}-${Date.now()}.jpg`;
        const filePath = path.join(UPLOADS_PROFILES_DIR, filename);
        fs.writeFileSync(filePath, buffer);
        if (currentUser?.profileImage && currentUser.profileImage.startsWith("/uploads/profiles/")) {
          const oldPath = path.join(UPLOADS_PROFILES_DIR, path.basename(currentUser.profileImage));
          try { fs.unlinkSync(oldPath); } catch (_) {}
        }
        updateData.profileImage = `/uploads/profiles/${filename}`;
      } else {
        updateData.profileImage = profileImage;
      }
    }

    // Check if there's anything to update
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    // Update profile with only the valid fields
    const Model = isSuperAdmin ? SuperAdmin : User;
    const updatedUser = await Model.findByIdAndUpdate(
      req.user.userId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      status: "success",
      message: "Profile updated successfully",
      data: isSuperAdmin ? {
        ...(updatedUser.toObject ? updatedUser.toObject() : updatedUser),
        role: "superadmin",
        isVerified: true,
        devices: [],
        activeDevices: []
      } : updatedUser,
      updatedFields: Object.keys(updateData) // Show which fields were updated
    });
  } catch (error) {
    console.error("Error updating user profile:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Update profile image
router.put("/profile/image", [authMiddleware, upload.single('profileImage')], async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No image uploaded" });
    }

    // Get profile image path
    const profileImage = `/uploads/profiles/${req.file.filename}`;

    const isSuperAdmin = req.user?.role === "superadmin";
    const Model = isSuperAdmin ? SuperAdmin : User;

    const updatedUser = await Model.findByIdAndUpdate(
      req.user.userId,
      { $set: { profileImage } },
      { new: true }
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      status: "success",
      message: "Profile image updated successfully",
      data: {
        profileImage: updatedUser.profileImage
      }
    });
  } catch (error) {
    console.error("Error updating profile image:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Update password
router.put("/profile/password", authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Both current and new password are required" });
    }

    // Find the user and check current password
    const isSuperAdmin = req.user?.role === "superadmin";
    const Model = isSuperAdmin ? SuperAdmin : User;
    const user = await Model.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    
    // Update password
    await Model.findByIdAndUpdate(
      req.user.userId,
      { $set: { password: hashedPassword } }
    );

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({
      status: "success",
      message: "Password updated successfully",
      token
    });
  } catch (error) {
    console.error("Error updating password:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Delete user account (works for both email and Google/OAuth users)
// Device data is preserved; only the User record is removed from DB
router.delete("/profile", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { password } = req.body || {};

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Verify password only for email users (who have a password)
    const isOAuthUser = user.oauth && user.oauth.length > 0;
    if (!isOAuthUser && user.password) {
      if (password) {
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
          return res.status(401).json({ message: "Password is incorrect" });
        }
      }
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);

    // 1. Remove user from sharedWith on any devices they're shared with
    await Device.updateMany(
      { "sharedWith.userId": userObjectId },
      { $pull: { sharedWith: { userId: userObjectId } } }
    );

    // 2. Unlink owned devices (set userId to null) - device data stays intact
    await Device.updateMany(
      { userId: userObjectId },
      { $set: { userId: null } }
    );

    // 3. Delete user account
    await User.findByIdAndDelete(userId);

    // 4. Send account deletion email
    if (user.email) {
      try {
        await sendEmail({
          to: user.email,
          subject: "Account Deleted",
          text: "Your Doze account has been successfully deleted.",
          html: "<p>Your Doze account has been successfully deleted. We're sorry to see you go!</p>"
        });
      } catch (emailError) {
        console.error("Error sending account deletion email:", emailError);
        // Continue, don't fail the deletion if email fails
      }
    }

    res.json({
      status: "success",
      message: "Account deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting account:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /user/organization-id - Fetch organizationId of the logged-in user
router.get('/user/organization-id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user && (req.user.userId || req.user.id);
    if (!userId) {
      return res.status(401).json({ status: 'fail', message: 'Unauthorized: User not found in request' });
    }

    const user = await User.findById(userId).select('organizationId');
    if (!user) {
      return res.status(404).json({ status: 'fail', message: 'User not found' });
    }

    res.json({ status: 'success', organizationId: user.organizationId });
  } catch (error) {
    res.status(500).json({ status: 'fail', message: error.message });
  }
});

// ─────────────── FCM Token Registration ───────────────

/**
 * POST /user/fcm-token
 * Register or update an FCM push-notification token for the authenticated user.
 * Body: { token: string, device?: string, platform?: 'ios' | 'android' }
 */
router.post("/fcm-token", authMiddleware, async (req, res) => {
  try {
    if (req.user?.role === "superadmin") {
      return res.json({ status: "success", message: "FCM token registration bypassed for SuperAdmin" });
    }
    const userId = req.user?.userId || req.user?.id;
    const { token, device, platform } = req.body;

    if (!token || typeof token !== "string") {
      return res.status(400).json({ message: "FCM token is required" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Upsert: if a token for the same device already exists, update it
    const existingIdx = user.fcmTokens.findIndex(
      (t) => (device && t.device === device) || t.token === token
    );

    if (existingIdx >= 0) {
      user.fcmTokens[existingIdx].token = token;
      user.fcmTokens[existingIdx].device = device || user.fcmTokens[existingIdx].device;
      user.fcmTokens[existingIdx].platform = platform || user.fcmTokens[existingIdx].platform;
      user.fcmTokens[existingIdx].updatedAt = new Date();
    } else {
      user.fcmTokens.push({ token, device, platform, updatedAt: new Date() });
    }

    await user.save();

    console.log(`[FCM] Token registered for user ${userId} (device: ${device || 'unknown'})`);
    res.json({ status: "success", message: "FCM token registered" });
  } catch (error) {
    console.error("[FCM] Error registering token:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

/**
 * DELETE /user/fcm-token
 * Remove an FCM token (e.g. on logout).
 * Body: { token: string }
 */
router.delete("/fcm-token", authMiddleware, async (req, res) => {
  try {
    if (req.user?.role === "superadmin") {
      return res.json({ status: "success", message: "FCM token removal bypassed for SuperAdmin" });
    }
    const userId = req.user?.userId || req.user?.id;
    const { token } = req.body;

    if (!token) return res.status(400).json({ message: "FCM token is required" });

    await User.findByIdAndUpdate(userId, {
      $pull: { fcmTokens: { token } },
    });

    console.log(`[FCM] Token removed for user ${userId}`);
    res.json({ status: "success", message: "FCM token removed" });
  } catch (error) {
    console.error("[FCM] Error removing token:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// POST /user/handover/request
// Initiate handover process: send OTP to current email and target new email
router.post("/handover/request", authMiddleware, async (req, res) => {
  try {
    const { newEmail } = req.body;
    if (!newEmail || typeof newEmail !== 'string') {
      return res.status(400).json({ message: "New email is required" });
    }

    const targetEmail = newEmail.trim().toLowerCase();

    // Check if target email is already in use
    const emailExists = await User.findOne({ email: targetEmail });
    if (emailExists) {
      return res.status(400).json({ message: "The target email is already registered to another account" });
    }

    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.email.toLowerCase() === targetEmail) {
      return res.status(400).json({ message: "Target email must be different from current email" });
    }

    // Generate random 6-digit numeric OTPs
    const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();
    const currentOtp = generateOtp();
    const newOtp = generateOtp();
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes expiration

    // Store in User document
    user.handoverVerification = {
      currentEmailOtp: currentOtp,
      currentEmailOtpExpires: expires,
      newEmailOtp: newOtp,
      newEmailOtpExpires: expires,
      targetNewEmail: targetEmail
    };
    await user.save();

    // Send emails
    const currentSubject = "Dozemate Account Handover - Verification Code (Current Account Owner)";
    const currentText = `Hello,\n\nYou have requested to hand over your Dozemate account to: ${targetEmail}.\n\nYour verification code is: ${currentOtp}\n\nThis code will expire in 15 minutes.`;
    const currentHtml = `<p>Hello,</p><p>You have requested to hand over your Dozemate account to: <strong>${targetEmail}</strong>.</p><p>Your verification code is: <strong style="font-size: 18px; color: #007b90;">${currentOtp}</strong></p><p>This code will expire in 15 minutes.</p>`;

    const newSubject = "Dozemate Account Handover - Verification Code (New Account Owner)";
    const newText = `Hello,\n\nAn account handover has been requested to transfer ownership of a Dozemate clinical account to you (${targetEmail}).\n\nYour verification code is: ${newOtp}\n\nThis code will expire in 15 minutes.`;
    const newHtml = `<p>Hello,</p><p>An account handover has been requested to transfer ownership of a Dozemate clinical account to you (<strong>${targetEmail}</strong>).</p><p>Your verification code is: <strong style="font-size: 18px; color: #007b90;">${newOtp}</strong></p><p>This code will expire in 15 minutes.</p>`;

    await sendEmail({ to: user.email, subject: currentSubject, text: currentText, html: currentHtml });
    await sendEmail({ to: targetEmail, subject: newSubject, text: newText, html: newHtml });

    res.json({ status: "success", message: "Verification codes sent to current and target emails" });
  } catch (error) {
    console.error("Error requesting handover:", error);
    res.status(500).json({ message: "Server error during handover request" });
  }
});

// POST /user/handover/verify
// Verify both OTPs and complete account email handover
router.post("/handover/verify", authMiddleware, async (req, res) => {
  try {
    const { currentOtp, newOtp } = req.body;
    if (!currentOtp || !newOtp) {
      return res.status(400).json({ message: "Both current and new email OTPs are required" });
    }

    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const verification = user.handoverVerification;
    if (!verification || !verification.targetNewEmail) {
      return res.status(400).json({ message: "No active handover request found. Please start over." });
    }

    const now = new Date();
    // Validate Current Email OTP
    if (verification.currentEmailOtp !== currentOtp || now > new Date(verification.currentEmailOtpExpires)) {
      return res.status(400).json({ message: "Current email verification code is incorrect or expired" });
    }

    // Validate New Email OTP
    if (verification.newEmailOtp !== newOtp || now > new Date(verification.newEmailOtpExpires)) {
      return res.status(400).json({ message: "New email verification code is incorrect or expired" });
    }

    const oldEmail = user.email;
    const newEmail = verification.targetNewEmail;

    // Check one final time if target email is already taken
    const emailExists = await User.findOne({ email: newEmail });
    if (emailExists) {
      return res.status(400).json({ message: "The target email is already registered to another account" });
    }

    // Push to history
    user.handoverHistory.push({
      fromEmail: oldEmail,
      toEmail: newEmail,
      handoverDate: now,
      authorizedBy: user.name
    });

    // Transfer email ownership
    user.email = newEmail;
    user.handoverVerification = undefined; // clear transient info
    await user.save();

    // 1. Update Account primaryEmail if exists
    if (user.account) {
      const account = await Account.findById(user.account);
      if (account) {
        account.primaryEmail = newEmail;
        await account.save();

        // 2. Update Organization email if exists
        if (account.organizationId) {
          const organization = await Organization.findById(account.organizationId);
          if (organization) {
            organization.email = newEmail;
            await organization.save();
          }
        }
      }
    }

    // Generate new token for the user so session stays valid
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({
      status: "success",
      message: "Account ownership successfully handed over",
      token,
      newEmail
    });
  } catch (error) {
    console.error("Error verifying handover:", error);
    res.status(500).json({ message: "Server error during handover verification" });
  }
});

module.exports = router;