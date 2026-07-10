const Notification = require("../models/Notification");
const User = require("../models/User");
const Organization = require("../models/Organization");

// Get all notifications for the user's organization
exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId).populate("account");
    const isSuperAdmin = req.user?.role === "superadmin";

    let filter = {};
    
    if (!isSuperAdmin) {
      if (user && user.account && user.account.organizationId) {
        filter.organizationId = user.account.organizationId;
      } else {
        // If user has no organization, they don't get these org-wide alerts
        return res.status(200).json({ notifications: [], unreadCount: 0 });
      }
    }

    const limit = parseInt(req.query.limit) || 50;

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const unreadCount = await Notification.countDocuments({ ...filter, isRead: false });

    res.status(200).json({ notifications, unreadCount });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Mark a single notification as read
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    await Notification.findByIdAndUpdate(id, { isRead: true });
    res.status(200).json({ success: true, message: "Notification marked as read" });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Mark all notifications as read for the user's organization
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId).populate("account");
    const isSuperAdmin = req.user?.role === "superadmin";

    let filter = { isRead: false };
    
    if (!isSuperAdmin) {
      if (user && user.account && user.account.organizationId) {
        filter.organizationId = user.account.organizationId;
      } else {
        return res.status(200).json({ success: true });
      }
    }

    await Notification.updateMany(filter, { isRead: true });
    res.status(200).json({ success: true, message: "All notifications marked as read" });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Trigger dummy notification when organization user is online
exports.createDummyWelcome = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId).populate("account");
    if (!user) {
      // Super admin model might be different, let's check SuperAdmin collection
      const SuperAdmin = require("../models/SuperAdmin");
      const superAdminUser = await SuperAdmin.findById(userId);
      if (superAdminUser) {
        // Create Welcome Notification for Super Admin
        const existingWelcome = await Notification.findOne({
          organizationId: null,
          title: "Welcome to Super Admin Dashboard"
        });

        if (!existingWelcome) {
          const adminWelcomeNotif = new Notification({
            organizationId: null,
            deviceId: "system",
            title: "Welcome to Super Admin Dashboard",
            message: "Welcome to the Dozemate Super Admin Global Controller Console!",
            type: "info",
            isRead: false
          });
          await adminWelcomeNotif.save();

          // Broadcast to super admin channel
          const { broadcastNotification } = require("../services/websocketService");
          broadcastNotification("superadmin", adminWelcomeNotif.toObject());
        }
        return res.status(200).json({ status: "success", message: "SuperAdmin welcome notification processed" });
      }
      return res.status(404).json({ message: "User not found" });
    }

    // Check if the authenticated user is superadmin (just in case they exist in User collection or by role)
    const isSuperAdmin = req.user?.role === "superadmin" || user.role === "superadmin";

    if (isSuperAdmin) {
      // Create Welcome Notification for Super Admin
      const existingWelcome = await Notification.findOne({
        organizationId: null,
        title: "Welcome to Super Admin Dashboard"
      });

      if (!existingWelcome) {
        const adminWelcomeNotif = new Notification({
          organizationId: null,
          deviceId: "system",
          title: "Welcome to Super Admin Dashboard",
          message: "Welcome to the Dozemate Super Admin Global Controller Console!",
          type: "info",
          isRead: false
        });
        await adminWelcomeNotif.save();

        // Broadcast to super admin channel
        const { broadcastNotification } = require("../services/websocketService");
        broadcastNotification("superadmin", adminWelcomeNotif.toObject());
      }
      return res.status(200).json({ status: "success", message: "SuperAdmin welcome notification processed" });
    }

    let orgName = "";
    if (user.account && user.account.organizationId) {
      const org = await Organization.findById(user.account.organizationId);
      if (org) {
        orgName = org.name;
      }
    }

    const isSlimiot = orgName && orgName.toLowerCase().includes("slimiot");

    // Only proceed if it is Slimiot Internals
    if (isSlimiot) {
      // 1. Check if welcome notification already exists for this organization (to prevent duplicate spam)
      const existingWelcome = await Notification.findOne({
        organizationId: user.account.organizationId,
        title: "Welcome to our Pilot Dashboard"
      });

      if (!existingWelcome) {
        // Create Welcome Notification in DB for organization
        const welcomeNotif = new Notification({
          organizationId: user.account.organizationId,
          deviceId: "system",
          title: "Welcome to our Pilot Dashboard",
          message: `Welcome to the Dozemate exploratory hospital pilot dashboard at ${orgName}!`,
          type: "info",
          isRead: false
        });
        await welcomeNotif.save();

        // Broadcast to organization
        const { broadcastNotification } = require("../services/websocketService");
        broadcastNotification(user.account.organizationId.toString(), welcomeNotif.toObject());
      }

      // 2. Create User Online notification for Super Admin
      // To ensure it doesn't get duplicate spam, let's check if there's one created in the last 1 minute
      const oneMinAgo = new Date(Date.now() - 60000);
      const existingOnline = await Notification.findOne({
        title: "User Online Alert",
        message: new RegExp(user.name, "i"),
        createdAt: { $gte: oneMinAgo }
      });

      if (!existingOnline) {
        const adminNotif = new Notification({
          organizationId: user.account.organizationId,
          deviceId: "system",
          title: "User Online Alert",
          message: `User ${user.name} from organization ${orgName} is now online.`,
          type: "info",
          isRead: false
        });
        await adminNotif.save();

        // Broadcast to both organization channel and super admin channel
        const { broadcastNotification } = require("../services/websocketService");
        broadcastNotification(user.account.organizationId.toString(), adminNotif.toObject());
        broadcastNotification("superadmin", adminNotif.toObject());
      }
    }

    res.status(200).json({ status: "success", message: "Dummy notifications processed" });
  } catch (error) {
    console.error("Error creating dummy notifications:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
