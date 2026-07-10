const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Account = require("../models/Account");

const authMiddleware = async (req, res, next) => {
    const token = req.header("Authorization");
    if (!token) {
        return res.status(401).json({ message: "Access Denied. No token provided." });
    }

    try {
        const decoded = jwt.verify(token.replace("Bearer ", ""), process.env.JWT_SECRET);
        req.user = decoded; // Attach user info to request

        // Validate active status for non-superadmin users
        if (decoded.role !== "superadmin") {
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

        next();
    } catch (error) {
        if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
            return res.status(400).json({ message: "Invalid token." });
        }
        console.error("Auth middleware error:", error);
        res.status(500).json({ message: "Server error during authorization" });
    }
};

module.exports = authMiddleware;
