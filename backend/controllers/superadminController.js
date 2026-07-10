const SuperAdmin = require("../models/SuperAdmin");
const Organization = require("../models/Organization");
const Account = require("../models/Account");
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { logger } = require("../utils/logger");
const { sendEmail } = require("../utils/mailer");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// 1. Initialize Default SuperAdmin
exports.initSuperAdmin = async () => {
  try {
    const email = "mayank.pratap@slimiot.com";
    const existing = await SuperAdmin.findOne({ email });

    if (!existing) {
      const hashedPassword = await bcrypt.hash("Welcome@2026", 12);
      await SuperAdmin.create({
        email,
        password: hashedPassword,
        isFirstLogin: true,
      });
      logger.info("✅ Default SuperAdmin created successfully.");
    }
  } catch (error) {
    logger.err(error, { where: "initSuperAdmin" });
  }
};

// 2. SuperAdmin Login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ status: "fail", message: "Please provide email and password" });
    }

    const cleanEmail = email.toLowerCase().trim();
    logger.info(`SuperAdmin login attempt for: ${cleanEmail}`);

    const superAdmin = await SuperAdmin.findOne({ email: cleanEmail }).select("+password");

    if (!superAdmin) {
      logger.info(`SuperAdmin not found: ${cleanEmail}`);
      return res.status(401).json({ status: "fail", message: "Incorrect email or password" });
    }

    const isMatch = await bcrypt.compare(password.trim(), superAdmin.password);
    if (!isMatch) {
      logger.info(`SuperAdmin password mismatch for: ${cleanEmail}`);
      return res.status(401).json({ status: "fail", message: "Incorrect email or password" });
    }

    // Determine if we need to force a password change
    if (superAdmin.isFirstLogin) {
      return res.status(200).json({
        status: "success",
        isFirstLogin: true,
        email: superAdmin.email,
        message: "First login detected. Password change required.",
      });
    }

    // Generate JWT token if not first login
    const token = jwt.sign(
      { userId: superAdmin._id, role: "superadmin" },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(200).json({
      status: "success",
      token,
      data: {
        user: {
          id: superAdmin._id,
          email: superAdmin.email,
          role: "superadmin",
        },
      },
    });
  } catch (error) {
    logger.err(error, { where: "superAdminLogin" });
    res.status(500).json({ status: "error", message: "Internal Server Error" });
  }
};

// 3. SuperAdmin Change Password (First Login)
exports.changePassword = async (req, res) => {
  try {
    const { email, currentPassword, newPassword, confirmPassword } = req.body;

    if (!email || !currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ status: "fail", message: "Please provide all password fields." });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ status: "fail", message: "New passwords do not match." });
    }

    const cleanEmail = email.toLowerCase().trim();
    const superAdmin = await SuperAdmin.findOne({ email: cleanEmail }).select("+password");

    if (!superAdmin) {
      return res.status(404).json({ status: "fail", message: "SuperAdmin not found." });
    }

    const isMatch = await bcrypt.compare(currentPassword, superAdmin.password);
    if (!isMatch) {
      return res.status(401).json({ status: "fail", message: "Incorrect current password." });
    }

    superAdmin.password = await bcrypt.hash(newPassword, 12);
    superAdmin.isFirstLogin = false;
    await superAdmin.save();

    // Generate token and login automatically
    const token = jwt.sign(
      { userId: superAdmin._id, role: "superadmin" },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(200).json({
      status: "success",
      message: "Password changed successfully.",
      token,
      data: {
        user: {
          id: superAdmin._id,
          email: superAdmin.email,
          role: "superadmin",
        },
      },
    });
  } catch (error) {
    logger.err(error, { where: "superAdminChangePassword" });
    res.status(500).json({ status: "error", message: "Internal Server Error" });
  }
};

// --- Logo upload configuration using Multer ---
const logoDir = path.join("uploads", "logos");
if (!fs.existsSync(logoDir)) {
  fs.mkdirSync(logoDir, { recursive: true });
}

const logoStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, logoDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: logoStorage,
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB limit
});

exports.logoUploadMw = upload.single("logo");

exports.uploadLogo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: "fail", message: "No logo file provided" });
    }
    const relPath = `/uploads/logos/${req.file.filename}`;
    res.status(200).json({ status: "success", logoUrl: relPath });
  } catch (err) {
    logger.err(err, { where: "uploadLogo" });
    res.status(500).json({ status: "error", message: "Failed to upload logo" });
  }
};

// 4. Provision Organization (Sub-Admin)
exports.provisionOrganization = async (req, res) => {
  try {
    const { orgName, address, website, hospitalId: reqHospitalId, organizationId, adminName, adminEmail, adminPhone, servicePlan, seatLimit, logo, activeStartDate, activeEndDate, organizationType } = req.body;

    const finalOrgId = organizationId || reqHospitalId;

    if (!orgName || !adminEmail || !adminName || !finalOrgId) {
      return res.status(400).json({ status: "fail", message: "Organization name, Admin name, Admin email, and Organization ID are required" });
    }

    // 1. Pre-check: Ensure Organization ID doesn't already exist
    const existingOrganization = await Organization.findOne({ organizationId: finalOrgId });
    if (existingOrganization) {
      return res.status(400).json({ status: "fail", message: "Organization ID already exists." });
    }

    // Pre-check: Ensure Organization Email doesn't already exist in Organization collection
    const escapedEmail = adminEmail.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const existingOrgByEmail = await Organization.findOne({
      email: { $regex: new RegExp(`^${escapedEmail}$`, "i") }
    });
    if (existingOrgByEmail) {
      return res.status(400).json({ status: "fail", message: "Email is already registered to another account." });
    }

    // 2. Generate temporary password (Welcome@XXXX)
    const tempPassword = `Welcome@${Math.floor(1000 + Math.random() * 9000)}`;

    let createdOrganization = null;
    let createdAccount = null;

    try {
      // 3. Create Organization
      createdOrganization = await Organization.create({
        organizationId: finalOrgId,
        name: orgName,
        address: address || "Not provided",
        pincode: "000000",
        contactNumber: adminPhone || "0000000000",
        email: adminEmail,
        website: website || "",
        taxId: "",
        servicePlan: servicePlan || "trial",
        seatLimit: seatLimit || 100,
        logo: logo || "/uploads/defaults/default-org-logo.png",
        accentColor: "#007b90",
        activeStartDate: activeStartDate || new Date(),
        activeEndDate: activeEndDate || null,
        organizationType: organizationType || "hospital"
      });

      // 4. Create Account
      createdAccount = await Account.create({
        accountId: Date.now().toString(),
        organizationId: createdOrganization._id,
      });

      // 5. Create User (Sub-Admin)
      const hashedPassword = await bcrypt.hash(tempPassword, 12);
      
      // Clean up existing non-superadmin user with this email to avoid duplicate key error
      await User.deleteMany({ email: adminEmail.toLowerCase().trim(), role: { $ne: 'superadmin' } });

      const user = await User.create({
        name: adminName,
        identifier: `${adminName}-${finalOrgId}`, // Ensures uniqueness across the system
        email: adminEmail,
        mobile: adminPhone ? parseInt(adminPhone.replace(/\D/g, '').substring(0, 10)) || 0 : 0,
        pincode: 0,
        password: hashedPassword,
        role: "admin",
        isDefaultProfile: true,
        account: createdAccount._id,
        accountId: createdAccount.accountId,
        passwordMustChange: true,
        isVerified: true
      });

      // Link user back to account for profile consistency
      await Account.updateOne(
        { _id: createdAccount._id },
        { $push: { userProfiles: user._id }, $set: { defaultUser: user._id } }
      );
    } catch (createErr) {
      // Rollback if User creation fails (e.g. duplicate email)
      if (createdOrganization) await Organization.findByIdAndDelete(createdOrganization._id);
      if (createdAccount) await Account.findByIdAndDelete(createdAccount._id);
      throw createErr;
    }

    // 6. Send Email
    const subject = `Welcome to the Dozemate Pilot Dashboard`;
    const text = `Dear ${adminName},

Welcome to the Dozemate Pilot Dashboard.

Your user account has been created for the Dozemate exploratory hospital pilot at ${orgName}.

You may log in using the details below:
Login URL: https://dozemate.com/admin/
Email: ${adminEmail}
Temporary Password: ${tempPassword}

For security, you will be required to change your password when you log in for the first time.

Once logged in, you will be able to access the dashboard features assigned to your role, which may include participant/session setup, device assignment, signal-quality review, sleep/rest session summaries, alert review, reports, feedback, and pilot support.

Please note that Dozemate is being used in this pilot as a non-interventional, exploratory sleep/rest intelligence and review-support tool. It is not a diagnostic system and does not replace hospital clinical judgement, patient care protocols, or emergency escalation procedures.

For any device, dashboard, report, or access-related issue, please use the Pilot Support section inside the dashboard or contact the SlimIoT pilot support team at info@slimiot.com.

Thank you,
The Dozemate Team
SlimIoT Technologies Private Limited`;
    
    const html = `
      <p>Dear ${adminName},</p>
      <p>Welcome to the Dozemate Pilot Dashboard.</p>
      <p>Your user account has been created for the Dozemate exploratory hospital pilot at <strong>${orgName}</strong>.</p>
      <p>You may log in using the details below:</p>
      <ul>
        <li><strong>Login URL:</strong> <a href="https://dozemate.com/admin/">https://dozemate.com/admin/</a></li>
        <li><strong>Email:</strong> ${adminEmail}</li>
        <li><strong>Temporary Password:</strong> <strong>${tempPassword}</strong></li>
      </ul>
      <p>For security, you will be required to change your password when you log in for the first time.</p>
      <p>Once logged in, you will be able to access the dashboard features assigned to your role, which may include participant/session setup, device assignment, signal-quality review, sleep/rest session summaries, alert review, reports, feedback, and pilot support.</p>
      <p>Please note that Dozemate is being used in this pilot as a non-interventional, exploratory sleep/rest intelligence and review-support tool. It is not a diagnostic system and does not replace hospital clinical judgement, patient care protocols, or emergency escalation procedures.</p>
      <p>For any device, dashboard, report, or access-related issue, please use the Pilot Support section inside the dashboard or contact the SlimIoT pilot support team at <a href="mailto:info@slimiot.com">info@slimiot.com</a>.</p>
      <p>Thank you,<br/>
      The Dozemate Team<br/>
      SlimIoT Technologies Private Limited</p>
    `;

    try {
      await sendEmail({ to: adminEmail, subject, text, html });
    } catch (emailErr) {
      logger.error("Failed to send provision email", emailErr);
    }

    res.status(201).json({
      status: "success",
      message: "Organization provisioned successfully",
      data: {
        organizationId: finalOrgId,
        adminEmail
      }
    });

  } catch (error) {
    logger.err(error);
    if (error.code === 11000) {
      return res.status(400).json({ status: "fail", message: "Email is already registered to another account." });
    }
    res.status(500).json({ status: "error", message: "Server error during provisioning" });
  }
};

// 4.5. Delete Organization Permanently
exports.deleteOrganizationPermanently = async (req, res) => {
  try {
    const { id } = req.params;
    const Device = require("../models/Device");

    const org = await Organization.findById(id);
    if (!org) {
      return res.status(404).json({ status: "fail", message: "Organization not found" });
    }

    logger.info(`Permanently deleting organization via SuperAdmin request: ${org.name} (${org.organizationId})`);

    const account = await Account.findOne({ organizationId: org._id });
    if (account) {
      const accountIdStr = account.accountId || String(account._id);
      
      // 1. Unassign devices
      await Device.updateMany(
        { $or: [{ organizationId: org._id }, { accountId: accountIdStr }] },
        { $set: { organizationId: null, accountId: null, userId: null, status: 'inactive', profileId: null } }
      );

      // 2. Delete users associated with this account
      await User.deleteMany({ account: account._id });

      // 3. Delete the account
      await Account.deleteOne({ _id: account._id });
    } else {
      // Fallback
      await Device.updateMany(
        { organizationId: org._id },
        { $set: { organizationId: null, accountId: null, userId: null, status: 'inactive', profileId: null } }
      );
      await User.deleteMany({ organizationId: org._id });
    }

    // 4. Delete the organization
    await Organization.deleteOne({ _id: org._id });

    return res.status(200).json({ status: "success", message: "Organization permanently deleted successfully" });
  } catch (error) {
    logger.error("Error during manual permanent deletion of organization:", error);
    return res.status(500).json({ status: "error", message: "Server error during organization deletion" });
  }
};

// 5. Update Organization Details
exports.updateOrganization = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, address, email, contactNumber, servicePlan, logo, activeStartDate, activeEndDate, organizationType } = req.body;

    const organization = await Organization.findByIdAndUpdate(
      id,
      { name, address, email, contactNumber, servicePlan, logo, activeStartDate, activeEndDate, organizationType },
      { new: true, runValidators: true }
    );

    if (!organization) {
      return res.status(404).json({ status: "fail", message: "Organization not found." });
    }

    res.status(200).json({
      status: "success",
      message: "Organization updated successfully",
      data: organization
    });
  } catch (error) {
    logger.err(error, { where: "updateOrganization" });
    res.status(500).json({ status: "error", message: "Failed to update organization." });
  }
};


const formatOrganizationsList = async (organizations) => {
  return await Promise.all(organizations.map(async (organization) => {
      const account = await Account.findOne({ organizationId: organization._id });
      let primaryContactName = "Unknown";
      let primaryContactEmail = organization.email;
      let devicesCount = 0;

      if (account) {
        const subAdmin = await User.findOne({ account: account._id, role: 'admin' });
        if (subAdmin) {
          primaryContactName = subAdmin.name;
        }

        try {
           const Device = require('../models/Device');
           const accountIdStr = account.accountId || String(account._id);
           devicesCount = await Device.countDocuments({
             $or: [
               { accountId: accountIdStr },
               { organizationId: organization._id }
             ]
           });
        } catch (err) {
           console.log("Could not count devices", err);
        }
      }

      return {
        id: organization._id,
        hospitalId: organization.organizationId,
        organizationId: organization.organizationId,
        name: organization.name,
        location: organization.address,
        subscription: organization.servicePlan || 'Trial',
        units: organization.seatLimit || 100,
        devices: devicesCount,
        contactName: primaryContactName,
        contactEmail: primaryContactEmail,
        contactNumber: organization.contactNumber,
        status: organization.isActive ? 'Active' : 'Suspended',
        logo: organization.logo || "/uploads/defaults/default-org-logo.png",
        accentColor: organization.accentColor || "#007b90",
        activeStartDate: organization.activeStartDate || null,
        activeEndDate: organization.activeEndDate || null,
        organizationType: organization.organizationType || 'hospital'
      };
  }));
};

// 6. Get All Organizations for SuperAdmin Dashboard
exports.getAllOrganizations = async (req, res) => {
  try {
    const organizations = await Organization.find({ isActive: { $ne: false } }).sort({ createdAt: -1 }).lean();
    const formattedOrganizations = await formatOrganizationsList(organizations);
    
    return res.status(200).json({
      status: "success",
      data: formattedOrganizations
    });
  } catch (error) {
    logger.err(error, { where: "getAllOrganizations" });
    return res.status(500).json({ status: "error", message: "Failed to fetch organizations." });
  }
};

// Suspend Organization
exports.suspendOrganization = async (req, res) => {
  try {
    const { id } = req.params;
    const organization = await Organization.findByIdAndUpdate(
      id,
      { isActive: false, suspendedAt: Date.now() },
      { new: true }
    );
    if (!organization) return res.status(404).json({ status: "fail", message: "Organization not found" });
    
    return res.status(200).json({ status: "success", message: "Organization suspended successfully", data: organization });
  } catch (error) {
    logger.err(error, { where: "suspendOrganization" });
    return res.status(500).json({ status: "error", message: "Failed to suspend organization." });
  }
};

// Restore Organization
exports.restoreOrganization = async (req, res) => {
  try {
    const { id } = req.params;
    const organization = await Organization.findByIdAndUpdate(
      id,
      { isActive: true, suspendedAt: null },
      { new: true }
    );
    if (!organization) return res.status(404).json({ status: "fail", message: "Organization not found" });
    
    return res.status(200).json({ status: "success", message: "Organization restored successfully", data: organization });
  } catch (error) {
    logger.err(error, { where: "restoreOrganization" });
    return res.status(500).json({ status: "error", message: "Failed to restore organization." });
  }
};

// Get Trashed Organizations
exports.getTrashedOrganizations = async (req, res) => {
  try {
    const organizations = await Organization.find({ isActive: false }).sort({ suspendedAt: -1 }).lean();
    const formattedOrganizations = await formatOrganizationsList(organizations);
    
    // Calculate days remaining before deletion
    const enrichedOrganizations = formattedOrganizations.map((org) => {
      const dbOrg = organizations.find(o => o._id.toString() === org.id.toString());
      let daysRemaining = 0;
      if (dbOrg && dbOrg.suspendedAt) {
        const diffTime = Date.now() - new Date(dbOrg.suspendedAt).getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        daysRemaining = Math.max(0, 7 - diffDays);
      }
      return { ...org, daysRemaining, suspendedAt: dbOrg ? dbOrg.suspendedAt : null };
    });

    return res.status(200).json({
      status: "success",
      data: enrichedOrganizations
    });
  } catch (error) {
    logger.err(error, { where: "getTrashedOrganizations" });
    return res.status(500).json({ status: "error", message: "Failed to fetch trashed organizations." });
  }
};

// 7. Get All Devices for SuperAdmin Dashboard
exports.getAllDevices = async (req, res) => {
  try {
    const Device = require('../models/Device');
    const devices = await Device.find({}).lean();
    
    const Account = require('../models/Account');
    const Organization = require('../models/Organization');
    
    const orgCache = {};
    
    const getOrgName = async (device) => {
      // If device is owned by a personal user, it is ALWAYS unassigned — even if a
      // stale organizationId is present in the document from a previous assignment.
      if (device.userId) {
        return 'Unassigned';
      }
      // Only look up the org if the device has NO personal owner
      if (device.organizationId) {
        if (!orgCache[device.organizationId]) {
          const org = await Organization.findById(device.organizationId);
          orgCache[device.organizationId] = org ? org.name : 'Unknown Organization';
        }
        return orgCache[device.organizationId];
      }
      // Fallback: try accountId for devices without userId or organizationId
      if (device.accountId) {
        if (!orgCache[device.accountId]) {
          const acc = await Account.findOne({ accountId: device.accountId }).populate('organizationId');
          orgCache[device.accountId] = acc && acc.organizationId ? acc.organizationId.name : 'Unassigned';
        }
        return orgCache[device.accountId];
      }
      return 'Unassigned';
    };

    const formattedDevices = await Promise.all(devices.map(async (device) => {
      const orgName = await getOrgName(device);
      
      const ts = device.lastActiveAt ? new Date(device.lastActiveAt).getTime() : 0;
      const isOffline = (Date.now() - ts) > 30000;
      let computedStatus = isOffline ? 'Offline' : 'Online';

      return {
        id: device.deviceId,
        organizationName: orgName,
        deviceName: device.customName || device.defaultName || device.deviceId,
        deviceId: device.deviceId,
        status: computedStatus,
        lastSync: device.lastActiveAt || null,
      };
    }));

    return res.status(200).json({
      status: "success",
      data: formattedDevices
    });
  } catch (error) {
    logger.err(error, { where: "getAllDevices" });
    return res.status(500).json({ status: "error", message: "Failed to fetch devices." });
  }
};

// 8. Get All App Users
exports.getAllUsers = async (req, res) => {
  try {
    const User = require("../models/User");
    const Account = require("../models/Account");
    const Organization = require("../models/Organization");

    const users = await User.find({ role: { $ne: 'superadmin' } }).sort({ createdAt: -1 }).lean();

    const formattedUsers = await Promise.all(users.map(async (user) => {
      let orgName = "Unassigned";
      
      if (user.account) {
        const account = await Account.findById(user.account).populate('organizationId');
        if (account && account.organizationId) {
          orgName = account.organizationId.name;
        }
      }

      return {
        id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        organizationName: orgName,
        createdAt: user.createdAt,
        isVerified: user.isVerified
      };
    }));

    return res.status(200).json({
      status: "success",
      data: formattedUsers
    });
  } catch (error) {
    logger.err(error, { where: "getAllUsers" });
    return res.status(500).json({ status: "error", message: "Failed to fetch users." });
  }
};

// 9. Delete App User
exports.deleteAppUser = async (req, res) => {
  try {
    const { id } = req.params;
    const User = require("../models/User");
    const Account = require("../models/Account");

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ status: "fail", message: "User not found" });
    }

    // Remove user from their account's userProfiles array if exists
    if (user.account) {
      await Account.updateOne(
        { _id: user.account },
        { $pull: { userProfiles: user._id } }
      );
    }

    await User.findByIdAndDelete(id);

    return res.status(200).json({
      status: "success",
      message: "User deleted successfully"
    });
  } catch (error) {
    logger.err(error, { where: "deleteAppUser" });
    return res.status(500).json({ status: "error", message: "Failed to delete user." });
  }
};
