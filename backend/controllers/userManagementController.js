const User = require("../models/User");
const bcrypt = require("bcryptjs");
const createError = require("../utils/appError");
const Account = require("../models/Account");
const mongoose = require("mongoose");

async function allocAccountId() {
  for (let i = 0; i < 5; i++) {
    const cand = String(Math.floor(10000 + Math.random() * 90000));
    const exists = await Account.exists({ accountId: cand });
    if (!exists) return cand;
  }
  return String(Date.now()).slice(-8);
}

async function findAdminUser(req) {
  const adminId = req.user?.userId || req.user?.id;
  const isSuperAdmin = req.user?.role === 'superadmin' || req.user?.role === 'super_admin';
  
  let adminUser = null;
  if (isSuperAdmin) {
    const Organization = require("../models/Organization");
    let orgId = req.query.organizationId || req.body.organizationId;
    let org = null;
    if (orgId) {
      if (mongoose.Types.ObjectId.isValid(orgId)) {
        org = await Organization.findById(orgId);
      } else {
        org = await Organization.findOne({ organizationId: orgId });
      }
    }
    // If no explicit orgId, try to find org via superadmin's User doc (if they have one)
    if (!org && adminId) {
      const saUserQuery = mongoose.Types.ObjectId.isValid(adminId)
        ? { $or: [{ _id: adminId }, { userId: adminId }] }
        : { userId: adminId };
      const saUser = await User.findOne(saUserQuery).populate('account');
      if (saUser && saUser.account && saUser.account.organizationId) {
        org = await Organization.findById(saUser.account.organizationId);
      }
    }
    // Do NOT fall back to Organization.findOne() — that picks a random org
    adminUser = {
      _id: adminId,
      role: req.user.role,
      email: req.user.email || "",
      account: {
        organizationId: org ? org._id : null
      }
    };
  } else if (adminId) {
    const query = mongoose.Types.ObjectId.isValid(adminId)
      ? { $or: [{ _id: adminId }, { userId: adminId }] }
      : { userId: adminId };
    adminUser = await User.findOne(query).populate('account');
  }

  return adminUser;
}

// Create a new user
exports.createUser = async (req, res) => {
  try {
    const { 
      email, 
      password, 
      name, 
      address = "", 
      pincode = 0, 
      mobile = 0,
      role = "user",
      dateOfBirth,
      gender,
      weight,
      height,
      waist,
      devices = []
    } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        status: "fail",
        message: "Email already in use"
      });
    }
    
    let targetOrgId = null;
    if (req.user.role === 'admin') {
      const adminUser = await findAdminUser(req);
      if (!adminUser || !adminUser.account || !adminUser.account.organizationId) {
        return res.status(400).json({
          status: "fail",
          message: "Admin is not associated with an organization"
        });
      }
      targetOrgId = adminUser.account.organizationId;
    } else {
      // For superadmins, they can specify target org
      if (req.body.organizationId) {
        targetOrgId = req.body.organizationId;
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password || "Welcome@2026", 12);

    // Create Account for the new user
    const acctId = await allocAccountId();
    const accountDoc = await Account.create({
      accountId: acctId,
      primaryEmail: email,
      mobile: String(mobile || ''),
      address,
      pincode,
      organizationId: targetOrgId
    });
    
    // Create new user profile
    const newUser = await User.create({
      email,
      password: hashedPassword,
      name,
      address,
      pincode,
      mobile,
      organizationId: targetOrgId,
      role: "user", // Created users are always regular users
      dateOfBirth,
      gender,
      weight,
      height,
      waist,
      devices,
      createdAt: new Date(),
      account: accountDoc._id,
      accountId: accountDoc.accountId,
      userId: `${accountDoc.accountId}a`,
      isDefaultProfile: true,
      isVerified: true
    });
    
    // Link back to account
    await Account.updateOne(
      { _id: accountDoc._id },
      { $push: { userProfiles: newUser._id }, $set: { defaultUser: newUser._id } }
    );

    // Remove password from response
    const userResponse = newUser.toObject();
    delete userResponse.password;
    
    res.status(201).json({
      status: "success",
      message: "User created successfully",
      data: userResponse
    });
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ status: "fail", message: "Server error", error: error.message });
  }
};

// Get all users with pagination, filtering and search
exports.getAllUsers = async (req, res) => {
  try {
    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Build filter object
    let filter = {};
    
    // Filter by role if provided
    if (req.query.role) {
      filter.role = req.query.role;
    }
    
    // Enforce organization filter for admins (sub-admins)
    if (req.user.role === 'admin') {
      const adminUser = await findAdminUser(req);
      if (adminUser && adminUser.account && adminUser.account.organizationId) {
        filter.organizationId = adminUser.account.organizationId;
      } else {
        filter.organizationId = "non-existent-org";
      }
      // Only show normal users, not other admins
      filter.role = "user";
    } else {
      // Filter by organization if provided (for superadmin)
      if (req.query.organizationId) {
        filter.organizationId = req.query.organizationId;
      }
    }
    
    // Search by name or email
    if (req.query.search) {
      filter.$or = [
        { name: { $regex: req.query.search, $options: "i" } },
        { email: { $regex: req.query.search, $options: "i" } }
      ];
    }
    
    // Execute query with pagination
    const users = await User.find(filter)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    // Get total count for pagination
    const total = await User.countDocuments(filter);
    
    res.status(200).json({
      status: "success",
      results: users.length,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
      data: users
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get user by ID
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select("-password")
      .populate("devices")
      .populate("activeDevice");
      
    if (!user) {
      return res.status(404).json({ 
        status: "fail", 
        message: "User not found" 
      });
    }
    
    res.status(200).json({
      status: "success",
      data: user
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Update user
exports.updateUser = async (req, res) => {
  try {
    const { 
      name, 
      email, 
      address, 
      pincode, 
      mobile, 
      role,
      organizationId,
      dateOfBirth,
      gender,
      weight,
      height,
      waist 
    } = req.body;
    
    // Check if email exists for another user
    if (email) {
      const existingUser = await User.findOne({ 
        email, 
        _id: { $ne: req.params.id } 
      });
      
      if (existingUser) {
        return res.status(400).json({ 
          status: "fail",
          message: "Email already in use" 
        });
      }
    }
    
    // Build update object with only provided fields
    const updateData = {};
    
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (address) updateData.address = address;
    if (pincode) updateData.pincode = pincode;
    if (mobile) updateData.mobile = mobile;
    if (role) updateData.role = role;
    if (organizationId) updateData.organizationId = organizationId;
    if (dateOfBirth) updateData.dateOfBirth = dateOfBirth;
    if (gender) updateData.gender = gender;
    if (weight) updateData.weight = weight;
    if (height) updateData.height = height;
    if (waist) updateData.waist = waist;
    
    // If password is provided, hash it
    if (req.body.password) {
      updateData.password = await bcrypt.hash(req.body.password, 12);
    }
    
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select("-password");
    
    if (!updatedUser) {
      return res.status(404).json({ 
        status: "fail",
        message: "User not found" 
      });
    }
    
    res.status(200).json({
      status: "success",
      message: "User updated successfully",
      data: updatedUser
    });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Delete user
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ 
        status: "fail",
        message: "User not found" 
      });
    }
    
    // Prevent deleting yourself (for safety)
    if (user._id.toString() === req.user.userId) {
      return res.status(400).json({ 
        status: "fail",
        message: "Cannot delete your own account through this API" 
      });
    }
    
    await User.findByIdAndDelete(req.params.id);
    
    res.status(200).json({
      status: "success",
      message: "User deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Change user role
exports.changeUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    
    if (!["user", "admin"].includes(role)) {
      return res.status(400).json({ 
        status: "fail",
        message: "Invalid role. Must be 'user' or 'admin'" 
      });
    }
    
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ 
        status: "fail",
        message: "User not found" 
      });
    }
    
    // Prevent changing your own role (for safety)
    if (user._id.toString() === req.user.userId) {
      return res.status(400).json({ 
        status: "fail",
        message: "Cannot change your own role" 
      });
    }
    
    // Prevent changing superadmin role (for safety)
    if (user.role === "superadmin") {
      return res.status(403).json({ 
        status: "fail",
        message: "Cannot change role of a superadmin" 
      });
    }
    
    user.role = role;
    await user.save();
    
    res.status(200).json({
      status: "success",
      message: "User role updated successfully",
      data: {
        id: user._id,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error("Error changing user role:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get users by organization
exports.getUsersByOrganization = async (req, res) => {
  try {
    const { organizationId } = req.params;
    
    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Build filter for the organization
    const filter = { 
      organizationId,
      role: "user" // Only return users, not admin or superadmin
    };
    
    // Search by name or email
    if (req.query.search) {
      filter.$or = [
        { name: { $regex: req.query.search, $options: "i" } },
        { email: { $regex: req.query.search, $options: "i" } }
      ];
    }
    
    // Execute query with pagination
    const users = await User.find(filter)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    // Get total count for pagination
    const total = await User.countDocuments(filter);
    
    res.status(200).json({
      status: "success",
      results: users.length,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
      organizationId,
      data: users
    });
  } catch (error) {
    console.error("Error fetching users by organization:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.getMe = async (req, res) => {
  try {
    const userId = req.user?.userId; // from authMiddleware
    if (!userId) return res.status(401).json({ message: "Unauthorized - invalid token" });

    const user = await User.findById(userId)
      .populate("devices", "deviceId deviceType manufacturer status");

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(user);
  } catch (err) {
    console.error("Error in getMe:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

const Organization = require("../models/Organization");
const { sendEmail } = require("../utils/mailer");

exports.createViewer = async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    if (!name || !email) {
      return res.status(400).json({ status: "fail", message: "Name and Email are required." });
    }

    const emailStr = String(email).toLowerCase().trim();

    // Get sub-admin's account and organization
    const adminUser = await findAdminUser(req);
    if (!adminUser || !adminUser.account || !adminUser.account.organizationId) {
      return res.status(400).json({ status: "fail", message: "Sub-admin organization not found." });
    }

    const orgId = adminUser.account.organizationId;
    const org = await Organization.findById(orgId);
    if (!org) {
      return res.status(404).json({ status: "fail", message: "Organization not found." });
    }

    // Check if the viewer email is already in the current organization's viewers list
    const alreadyInOrg = org.viewers && org.viewers.some(v => v.email.toLowerCase() === emailStr);
    if (alreadyInOrg) {
      return res.status(400).json({ status: "fail", message: "This email is already registered as a viewer for this organization." });
    }

    // Check if the viewer email is in ANY other organization's viewers list
    const otherOrgWithViewer = await Organization.findOne({ "viewers.email": emailStr });
    if (otherOrgWithViewer) {
      return res.status(400).json({ status: "fail", message: "This email is already registered as a viewer for another organization." });
    }

    // Check if user already exists in User model
    const existingUser = await User.findOne({ email: emailStr });

    // Generate random 4-digit numeric temp password suffix
    const tempPass = `Welcome@${Math.floor(1000 + Math.random() * 9000)}`;
    const hashedPassword = await bcrypt.hash(tempPass, 12);

    let viewerUserId;

    if (existingUser) {
      // Safely convert/update existing user to viewer role
      existingUser.role = "viewer";
      existingUser.name = name;
      existingUser.mobile = phone ? Number(phone.replace(/\D/g, '')) || 0 : 0;
      existingUser.organizationId = orgId;
      existingUser.password = hashedPassword;
      existingUser.isVerified = true;
      existingUser.passwordMustChange = false;

      // Handle account linkage
      let accountDocId = existingUser.account;
      if (!accountDocId) {
        const acctId = await allocAccountId();
        const accountDoc = await Account.create({
          accountId: acctId,
          primaryEmail: emailStr,
          mobile: phone || '',
          organizationId: orgId
        });
        existingUser.account = accountDoc._id;
        existingUser.accountId = accountDoc.accountId;
        existingUser.userId = `${accountDoc.accountId}a`;
        accountDocId = accountDoc._id;

        await Account.updateOne(
          { _id: accountDoc._id },
          { $push: { userProfiles: existingUser._id }, $set: { defaultUser: existingUser._id } }
        );
      } else {
        await Account.updateOne(
          { _id: accountDocId },
          { $set: { organizationId: orgId, mobile: phone || '' } }
        );
      }

      await existingUser.save();
      viewerUserId = existingUser._id;
    } else {
      // Create Account for the viewer
      const acctId = await allocAccountId();
      const accountDoc = await Account.create({
        accountId: acctId,
        primaryEmail: emailStr,
        mobile: phone || '',
        organizationId: orgId
      });

      // Create User with role: "viewer"
      const newViewer = await User.create({
        email: emailStr,
        password: hashedPassword,
        name,
        mobile: phone ? Number(phone.replace(/\D/g, '')) || 0 : 0,
        pincode: 0,
        organizationId: orgId,
        role: "viewer",
        account: accountDoc._id,
        accountId: accountDoc.accountId,
        userId: `${accountDoc.accountId}a`,
        isDefaultProfile: true,
        isVerified: true, // Auto verified
        passwordMustChange: false
      });

      // Link back to Account
      await Account.updateOne(
        { _id: accountDoc._id },
        { $push: { userProfiles: newViewer._id }, $set: { defaultUser: newViewer._id } }
      );
      viewerUserId = newViewer._id;
    }

    // Save in Organization's viewers array
    org.viewers = org.viewers || [];
    org.viewers.push({
      name,
      email: emailStr,
      phone,
      userId: viewerUserId
    });
    await org.save();

    // Send invitation email
    const subject = `Welcome to Dozemate - Live Dashboard Viewer Invitation`;
    const text = `Hello ${name},\n\nYou have been invited to monitor the live graphs on Dozemate by your organization ${org.name}.\n\nPlease log in using the following credentials:\n\nEmail: ${emailStr}\nPassword: ${tempPass}\n\nThank you,\nThe Dozemate Team`;
    const html = `
      <h3>Welcome to Dozemate</h3>
      <p>Hello ${name},</p>
      <p>You have been invited to monitor the live graphs on Dozemate by your organization <strong>${org.name}</strong>.</p>
      <p>Please log in using the following credentials:</p>
      <ul>
        <li><strong>Email:</strong> ${emailStr}</li>
        <li><strong>Password:</strong> ${tempPass}</li>
      </ul>
      <p>Thank you,<br/>The Dozemate Team</p>
    `;

    try {
      await sendEmail({ to: emailStr, subject, text, html });
    } catch (mailErr) {
      console.error("Failed to send viewer invitation email:", mailErr);
    }

    res.status(201).json({
      status: "success",
      message: "Viewer account created and invitation sent successfully",
      data: {
        userId: viewerUserId,
        name,
        email: emailStr
      }
    });

  } catch (error) {
    console.error("Error creating viewer:", error);
    res.status(500).json({ status: "fail", message: "Server error", error: error.message });
  }
};

exports.getViewers = async (req, res) => {
  try {
    const adminUser = await findAdminUser(req);
    if (!adminUser || !adminUser.account || !adminUser.account.organizationId) {
      return res.status(400).json({ status: "fail", message: "Sub-admin organization not found." });
    }

    const org = await Organization.findById(adminUser.account.organizationId).lean();
    if (!org) {
      return res.status(404).json({ status: "fail", message: "Organization not found." });
    }



    res.status(200).json({
      status: "success",
      data: org.viewers || []
    });
  } catch (error) {
    console.error("Error fetching viewers:", error);
    res.status(500).json({ status: "fail", message: "Server error", error: error.message });
  }
};

exports.deleteViewer = async (req, res) => {
  try {
    const viewerUserId = req.params.id;

    // Get sub-admin's account and organization
    const adminUser = await findAdminUser(req);
    if (!adminUser || !adminUser.account || !adminUser.account.organizationId) {
      return res.status(400).json({ status: "fail", message: "Sub-admin organization not found." });
    }

    const orgId = adminUser.account.organizationId;
    const org = await Organization.findById(orgId);
    if (!org) {
      return res.status(404).json({ status: "fail", message: "Organization not found." });
    }

    // Pull from Organization's viewers array
    org.viewers = org.viewers.filter(v => v.userId && v.userId.toString() !== viewerUserId);
    await org.save();

    // Find and delete the User and Account
    const userToDelete = await User.findById(viewerUserId);
    if (userToDelete) {
      if (userToDelete.account) {
        await Account.findByIdAndDelete(userToDelete.account);
      }
      await User.findByIdAndDelete(viewerUserId);
    }

    res.status(200).json({
      status: "success",
      message: "Viewer deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting viewer:", error);
    res.status(500).json({ status: "fail", message: "Server error", error: error.message });
  }
};
