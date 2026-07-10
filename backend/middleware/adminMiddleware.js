const jwt = require('jsonwebtoken');
const User = require("../models/User");
const Account = require("../models/Account");

const adminMiddleware = async (req, res, next) => {
  try {
    const token = req.header("Authorization");
    if (!token) {
      return res.status(401).json({ message: "Access Denied. No token provided." });
    }

    const decoded = jwt.verify(token.replace("Bearer ", ""), process.env.JWT_SECRET);
    
    // Allow both admin and superadmin
    if (decoded.role !== 'admin' && decoded.role !== 'superadmin' && decoded.role !== 'super_admin') {
      return res.status(403).json({ message: "Access Denied. Admin role required." });
    }
    
    // Check organization active period for admins
    if (decoded.role === 'admin') {
      const user = await User.findById(decoded.userId);
      if (!user) {
        return res.status(401).json({ message: "User not found." });
      }
      if (user.account) {
        const account = await Account.findById(user.account).populate('organizationId');
        if (account && account.organizationId) {
          if (account.organizationId.isActive === false) {
            return res.status(403).json({ status: "fail", message: "Your organization account has been suspended." });
          }
          if (account.organizationId.activeEndDate && new Date() > new Date(account.organizationId.activeEndDate)) {
            return res.status(403).json({ status: "fail", message: "Your organization's access period is over. Please contact support." });
          }
        }
      }
    }

    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return res.status(400).json({ message: "Invalid token." });
    }
    console.error('Admin middleware error:', error);
    res.status(500).json({ message: "Server error during authorization" });
  }
};

module.exports = adminMiddleware;