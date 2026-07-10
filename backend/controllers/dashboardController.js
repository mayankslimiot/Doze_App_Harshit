const Device = require('../models/Device');
const SleepSession = require('../models/SleepSession');
const MonitoringSession = require('../models/MonitoringSession');
const User = require('../models/User');
const Account = require('../models/Account');


exports.getDashboardStats = async (req, res) => {
  try {
    let devices;
    let activeSessionsCount;

    if (req.user.role === 'superadmin') {
      devices = await Device.find({});
      const deviceIds = devices.map(d => d.deviceId);
      activeSessionsCount = await MonitoringSession.countDocuments({ 
        deviceId: { $in: deviceIds },
        status: 'active' 
      });
    } else {
      const user = await User.findById(req.user.userId).populate('account');
      if (!user || !user.account) {
        return res.status(404).json({ status: 'error', message: 'User or account not found' });
      }

      // Identify devices belonging to this account/organization
      const accountIdStr = user.account.accountId || String(user.account._id);
      
      // Find all devices linked to this account or organization
      const filter = {
        $or: [
          { accountId: accountIdStr }
        ]
      };
      if (user.account.organizationId) {
        filter.$or.push({ organizationId: user.account.organizationId });
      }
      devices = await Device.find(filter);
      const deviceIds = devices.map(d => d.deviceId);

      // Active Sessions: count of MonitoringSessions with status 'active'
      activeSessionsCount = await MonitoringSession.countDocuments({ 
        deviceId: { $in: deviceIds },
        status: 'active' 
      });
    }
    
    // Devices Online: count of all devices that have sent data in the last 30 seconds
    const devicesOnlineCount = devices.filter(d => {
      const ts = d.lastActiveAt ? new Date(d.lastActiveAt).getTime() : 0;
      return (Date.now() - ts) <= 30000;
    }).length;
    const totalDevicesCount = devices.length;

    // Pending Reviews: We don't have a formal review status, so we default to 0
    const pendingReviewsCount = 0;

    // Active Alerts: No Alert model exists yet
    const activeAlertsCount = 0;

    res.status(200).json({
      status: 'success',
      data: {
        activeSessions: activeSessionsCount,
        devicesOnline: devicesOnlineCount,
        totalDevices: totalDevicesCount,
        pendingReviews: pendingReviewsCount,
        activeAlerts: activeAlertsCount
      }
    });
  } catch (error) {
    console.error('Dashboard Stats Error:', error);
    res.status(500).json({ status: 'error', message: 'Server error fetching stats' });
  }
};

exports.getRecentSessions = async (req, res) => {
  try {
    let devices;
    if (req.user.role === 'superadmin') {
      devices = await Device.find({});
    } else {
      const user = await User.findById(req.user.userId).populate('account');
      if (!user || !user.account) {
        return res.status(404).json({ status: 'error', message: 'User or account not found' });
      }

      const accountIdStr = user.account.accountId || String(user.account._id);
      const filter = {
        $or: [
          { accountId: accountIdStr }
        ]
      };
      if (user.account.organizationId) {
        filter.$or.push({ organizationId: user.account.organizationId });
      }
      devices = await Device.find(filter);
    }

    // Build a lookup map: deviceId -> device document (for real-time status)
    const deviceMap = {};
    const deviceIds = [];
    for (const d of devices) {
      deviceIds.push(d.deviceId);
      deviceMap[d.deviceId] = d;
    }

    // Fetch recent monitoring sessions for these devices that are active
    const sessions = await MonitoringSession.find({ 
      deviceId: { $in: deviceIds },
      status: 'active'
    })
      .sort({ createdAt: -1 })
      .limit(10);

    // Format them for the frontend
    const formattedSessions = sessions.map(s => {
      // Calculate duration formatted from start and expected end
      let durationStr = 'N/A';
      if (s.startTime && s.expectedEndTime) {
        const diffMs = new Date(s.expectedEndTime).getTime() - new Date(s.startTime).getTime();
        const durationMinsTotal = Math.max(0, Math.floor(diffMs / 60000));
        const durationHours = Math.floor(durationMinsTotal / 60);
        const durationMins = durationMinsTotal % 60;
        durationStr = `${durationHours.toString().padStart(2, '0')}h ${durationMins.toString().padStart(2, '0')}m`;
      }

      let displayStatus = s.status === 'active' ? 'Monitoring' : s.status;
      if (s.status === 'active' && s.expectedEndTime && new Date() > new Date(s.expectedEndTime)) {
        displayStatus = 'Completed';
      }

      // Determine real device online/offline status from device heartbeat
      const device = deviceMap[s.deviceId];
      let deviceStatus = 'Offline';
      if (device && device.lastActiveAt) {
        const ts = new Date(device.lastActiveAt).getTime();
        const isOffline = (Date.now() - ts) > 30000; // 30-second threshold
        deviceStatus = isOffline ? 'Offline' : 'Online';
      }

      return {
        id: s._id,
        deviceId: s.deviceId,
        patientCode: s.patientId || s.patientCode || 'PT-XXXX',
        bedId: s.bed || s.bedId || s.deviceId,
        name: s.name || null,
        room: s.room || null,
        status: displayStatus,
        deviceStatus,
        duration: durationStr,
        signal: 'good',
        isReviewed: s.isReviewed || false,
        flagged: s.flagged || false,
        admissionDate: s.admissionDate || s.startTime || null,
        dischargeDate: s.dischargeDate || null,
      };
    });

    res.status(200).json({
      status: 'success',
      data: formattedSessions
    });
  } catch (error) {
    console.error('Dashboard Sessions Error:', error);
    res.status(500).json({ status: 'error', message: 'Server error fetching sessions' });
  }
};

exports.getRoomsBeds = async (req, res) => {
  try {
    let devices;
    if (req.user.role === 'superadmin') {
      devices = await Device.find({ room: { $ne: null } }).select('deviceId room bed').lean();
    } else {
      const user = await User.findById(req.user.userId).populate('account');
      if (!user || !user.account) {
        return res.status(404).json({ status: 'error', message: 'User or account not found' });
      }
      const accountIdStr = user.account.accountId || String(user.account._id);
      const filter = {
        room: { $ne: null },
        $or: [{ accountId: accountIdStr }]
      };
      if (user.account.organizationId) {
        filter.$or.push({ organizationId: user.account.organizationId });
      }
      devices = await Device.find(filter).select('deviceId room bed').lean();
    }

    // Find occupied device IDs from active sessions
    const activeSessions = await MonitoringSession.find({ status: 'active' }).select('deviceId').lean();
    const occupiedDeviceIds = new Set(activeSessions.map(s => s.deviceId));

    // Build map: { room -> Set(beds) }
    const roomBedMap = {};
    for (const d of devices) {
      if (!d.room || occupiedDeviceIds.has(d.deviceId)) continue;
      if (!roomBedMap[d.room]) roomBedMap[d.room] = new Set();
      if (d.bed) roomBedMap[d.room].add(d.bed);
    }

    // Convert to sorted array structure, filtering out rooms with 0 available beds
    const rooms = Object.keys(roomBedMap)
      .filter(room => roomBedMap[room].size > 0)
      .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))
      .map(room => ({
        room,
        beds: Array.from(roomBedMap[room]).sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))
      }));

    res.status(200).json({ status: 'success', data: rooms });
  } catch (error) {
    console.error('Dashboard RoomsBeds Error:', error);
    res.status(500).json({ status: 'error', message: 'Server error fetching rooms/beds' });
  }
};

exports.getDevices = async (req, res) => {
  try {
    let devices;
    if (req.user.role === 'superadmin') {
      devices = await Device.find({}).sort({ createdAt: -1 });
    } else {
      const user = await User.findById(req.user.userId).populate('account');
      if (!user || !user.account) {
        return res.status(404).json({ status: 'error', message: 'User or account not found' });
      }
      const accountIdStr = user.account.accountId || String(user.account._id);
      const filter = { $or: [{ accountId: accountIdStr }] };
      if (user.account.organizationId) {
        filter.$or.push({ organizationId: user.account.organizationId });
      }
      devices = await Device.find(filter).sort({ createdAt: -1 });
    }

    const formattedDevices = await Promise.all(devices.map(async d => {
      let syncStatus = 'error';
      const ts = d.lastActiveAt ? new Date(d.lastActiveAt).getTime() : 0;
      const isOffline = (Date.now() - ts) > 30000;
      let status = isOffline ? 'Offline' : 'Online';
      if (!isOffline && (d.isLive || d.bedStatus === 'Occupied')) status = 'Monitoring';
      if (!isOffline) syncStatus = 'good';

      // If room/bed are not set, randomize and save them
      let updated = false;
      if (!d.room) { d.room = String(Math.floor(Math.random() * 10) + 101); updated = true; }
      if (!d.bed)  { d.bed  = String(Math.floor(Math.random() * 2)  + 1);   updated = true; }
      if (updated) await d.save();

      return {
        name: d.customName || `Device ${d.deviceId.substring(d.deviceId.length - 4)}`,
        id: d.deviceId,
        status,
        ts,
        syncStatus,
        room: d.room,
        bed: d.bed
      };
    }));

    res.status(200).json({ status: 'success', data: formattedDevices });
  } catch (error) {
    console.error('Dashboard Devices Error:', error);
    res.status(500).json({ status: 'error', message: 'Server error fetching devices' });
  }
};
