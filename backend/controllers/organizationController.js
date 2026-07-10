const Organization = require("../models/Organization");
const User = require("../models/User");
const createError = require("../utils/appError");

// Generate a unique organization ID
const generateOrgId = async () => {
  // Format: ORG + random 6 digit number
  const randomNum = Math.floor(100000 + Math.random() * 900000);
  const orgId = `ORG${randomNum}`;

  // Check if this ID already exists
  const existingOrg = await Organization.findOne({ organizationId: orgId });
  if (existingOrg) {
    // If exists, recursively try again
    return generateOrgId();
  }

  return orgId;
};

// Create a new organization
exports.createOrganization = async (req, res, next) => {
  try {
    const {
      name,
      address,
      contactNumber,
      email,
      pincode,
      contactPerson,
      description
    } = req.body;

    // Generate a unique organization ID
    const organizationId = await generateOrgId();

    const newOrganization = await Organization.create({
      organizationId,
      name,
      address,
      contactNumber,
      email,
      pincode,
      contactPerson,
      description,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    res.status(201).json({
      status: "success",
      message: "Organization created successfully",
      data: {
        organization: newOrganization
      }
    });
  } catch (error) {
    console.error("Error creating organization:", error);
    next(error);
  }
};

// Get all organizations
exports.getAllOrganizations = async (req, res, next) => {
  try {
    // Implement pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Apply filters if provided
    let filter = {};
    if (req.query.isActive) {
      filter.isActive = req.query.isActive === "true";
    }

    // Apply search if provided
    if (req.query.search) {
      filter = {
        ...filter,
        $or: [
          { name: { $regex: req.query.search, $options: "i" } },
          { email: { $regex: req.query.search, $options: "i" } },
          { organizationId: { $regex: req.query.search, $options: "i" } }
        ]
      };
    }

    const organizations = await Organization.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Organization.countDocuments(filter);

    res.status(200).json({
      status: "success",
      results: organizations.length,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
      data: {
        organizations
      }
    });
  } catch (error) {
    console.error("Error fetching organizations:", error);
    next(error);
  }
};

// Get a specific organization
exports.getOrganization = async (req, res, next) => {
  try {
    const organization = await Organization.findById(req.params.id);

    if (!organization) {
      // FIXED: Added 'new' keyword
      return next(new createError(404, "Organization not found"));
    }

    res.status(200).json({
      status: "success",
      data: {
        organization
      }
    });
  } catch (error) {
    console.error("Error fetching organization:", error);
    next(error);
  }
};

exports.getOrganizationByOrgId = async (req, res, next) => {
  try {
    const organization = await Organization.findOne({
      organizationId: req.params.organizationId
    });

    if (!organization) {
      return res.status(404).json({
        status: "fail",
        message: "Organization not found"
      });
    }

    res.status(200).json({
      status: "success",
      data: {
        organization
      }
    });
  } catch (error) {
    console.error("Error fetching organization by organizationId:", error);
    next(error);
  }
};

exports.getOrganizationNameByOrgId = async (req, res, next) => {
  try {
    const organization = await Organization.findOne({
      organizationId: req.params.organizationId
    }).select('name');

    if (!organization) {
      // Simple approach: return direct response instead of using createError
      return res.status(404).json({
        status: "fail",
        message: "Organization not found"
      });
    }

    res.status(200).json({
      status: "success",
      data: {
        organizationId: req.params.organizationId,
        name: organization.name
      }
    });
  } catch (error) {
    console.error("Error fetching organization name:", error);
    next(error);
  }
};

// Update an organization
exports.updateOrganization = async (req, res, next) => {
  try {
    const allowedFields = [
      "name",
      "address",
      "contactNumber",
      "email",
      "pincode",
      "isActive",
      "logo",
      "contactPerson",
      "description"
    ];

    // Filter out fields that are not allowed to be updated
    const updateData = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    const organization = await Organization.findByIdAndUpdate(
      req.params.id,
      updateData,
      {
        new: true,
        runValidators: true
      }
    );

    if (!organization) {
      // FIXED: Added 'new' keyword
      return next(new createError(404, "Organization not found"));
    }

    res.status(200).json({
      status: "success",
      message: "Organization updated successfully",
      data: {
        organization
      }
    });
  } catch (error) {
    console.error("Error updating organization:", error);
    next(error);
  }
};

// Delete an organization
// Delete an organization
// controllers/organizationController.js

exports.deleteOrganization = async (req, res, next) => {
  try {
    const orgId = req.params.organizationId;
    console.log(`🗑 Attempting to delete org ${orgId}`);

    const organization = await Organization.findOne({ organizationId: orgId });
    if (!organization) {
      console.warn(`⚠️ Organization not found: ${orgId}`);
      return next(new createError(404, "Organization not found"));
    }

    // 🔎 Count users linked to this orgId
    const userCount = await User.countDocuments({ organizationId: organization.organizationId });
    console.log(`👥 Found ${userCount} users for org ${orgId}`);

    if (userCount > 0) {
      console.warn(`❌ Cannot delete org ${orgId} → it has ${userCount} users`);
      return res.status(400).json({
        status: "fail",
        message: "Organization cannot be deleted because it has associated users."
      });
    }

    // ✅ Safe to delete
    await Organization.findByIdAndDelete(organization._id);
    console.log(`✅ Org ${orgId} deleted`);

    return res.status(200).json({
      status: "success",
      message: "Organization deleted successfully"
    });
  } catch (error) {
    console.error("❌ Error deleting organization:", error);
    next(error);
  }
};


// controllers/organizationController.js
// Get users belonging to an organization
exports.getOrganizationUsers = async (req, res, next) => {
  try {
    const orgParam = req.params.organizationId;
    console.log(`📥 Fetching users for org ${orgParam}`);

    // allow both Mongo _id and custom orgId
    const organization = /^[0-9a-fA-F]{24}$/.test(orgParam)
      ? await Organization.findById(orgParam)
      : await Organization.findOne({ organizationId: orgParam });

    if (!organization) {
      console.warn(`⚠️ Organization not found: ${orgParam}`);
      return res.status(404).json({
        status: "error",
        message: "Organization not found"
      });
    }

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // ✅ Users link via organizationId (string), not ObjectId
    const [users, total] = await Promise.all([
      User.find({ organizationId: organization.organizationId })
        .select("-password")
        .skip(skip)
        .limit(limit),
      User.countDocuments({ organizationId: organization.organizationId })
    ]);

    console.log(
      `👥 Returning ${users.length} users (page ${page}) for org ${organization.organizationId}`
    );

    return res.status(200).json({
      status: "success",
      total,
      currentPage: page,
      data: { users } // empty array if none
    });
  } catch (error) {
    console.error("❌ Error fetching organization users:", error);
    next(error);
  }
};

// Public endpoint: get minimal list of active organizations (no auth required)
exports.getPublicOrganizations = async (req, res, next) => {
  try {
    let specificOrgId = null;
    const authHeader = req.header("Authorization");
    if (authHeader) {
      try {
        const jwt = require("jsonwebtoken");
        const decoded = jwt.verify(authHeader.replace("Bearer ", ""), process.env.JWT_SECRET);
        if (decoded && decoded.role === 'admin') {
          // If the user is an admin (Sub-Admin), find their organization ID from their user record
          const adminUser = await User.findById(decoded.userId).populate('account').lean();
          if (adminUser && adminUser.account && adminUser.account.organizationId) {
            specificOrgId = adminUser.account.organizationId;
          }
        }
      } catch (err) {
        console.warn("getPublicOrganizations: Optional JWT decoding failed:", err.message);
      }
    }

    let filter = { isActive: { $ne: false } };
    if (specificOrgId) {
      filter._id = specificOrgId;
    }

    const orgs = await Organization.find(filter, "organizationId name _id")
      .sort({ name: 1 })
      .lean();

    console.log(`🌍 Public org fetch → ${orgs.length} records`);

    return res.status(200).json({
      status: "success",
      count: orgs.length,
      data: { organizations: orgs }
    });
  } catch (err) {
    console.error("❌ Error in getPublicOrganizations:", err);
    return res.status(500).json({ status: "error", message: "Server error" });
  }
};
