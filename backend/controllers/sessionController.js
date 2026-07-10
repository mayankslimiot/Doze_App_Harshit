const MonitoringSession = require('../models/MonitoringSession');
const Device = require('../models/Device');
const HealthData = require('../models/HealthData');
const mongoose = require('mongoose');

exports.createSession = async (req, res) => {
  try {
    const {
      name,
      patientId,
      room,
      bed,
      age,
      sex,
      admissionDate,
      dischargeDate,
      technicianNotes,
      consentVerified,
      patientPhone,
      patientEmail,
      caretakerPhone,
      caretakerEmail
    } = req.body;

    if (!patientId || !room || !bed || !admissionDate || consentVerified === undefined) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const cleanRoom = String(room).trim().replace(/^Room\s+/i, '');
    const cleanBed = String(bed).trim().replace(/^Bed\s+/i, '');

    const matchedDevice = await Device.findOne({
      room: cleanRoom,
      bed: cleanBed
    });

    if (!matchedDevice) {
      return res.status(400).json({
        success: false,
        message: `No device is currently assigned to Room ${cleanRoom}, Bed ${cleanBed}. Please configure a device with these details first.`
      });
    }

    const session = new MonitoringSession({
      // Patient info
      name,
      patientId,
      room: cleanRoom,
      bed: cleanBed,
      age: Number(age) || null,
      sex,
      admissionDate,
      dischargeDate: dischargeDate || undefined,
      patientPhone,
      patientEmail,
      caretakerPhone,
      caretakerEmail,
      // Device & session
      deviceId: matchedDevice.deviceId,
      technicianNotes,
      consentVerified,
      status: 'active',
    });

    await session.save();

    res.status(201).json({ success: true, data: session });
  } catch (error) {
    console.error('Error creating monitoring session:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.getSessions = async (req, res) => {
  try {
    let filter = {};
    if (req.query.organizationId) {
      const orgId = req.query.organizationId;
      const Organization = require('../models/Organization');
      const Account = require('../models/Account');
      
      let organization = null;
      if (mongoose.Types.ObjectId.isValid(orgId)) {
        organization = await Organization.findById(orgId);
      }
      if (!organization) {
        organization = await Organization.findOne({ organizationId: orgId });
      }

      if (organization) {
        const orgObjectId = organization._id;
        const orgIdString = organization.organizationId;

        // Find accounts under this organization
        const accounts = await Account.find({ organizationId: orgObjectId }).select("_id accountId");
        const accountIdStrs = accounts.map(a => a.accountId).filter(Boolean);

        // Find devices under this organization or accounts
        const conditions = [
          { organizationId: orgObjectId },
          { accountId: { $in: accountIdStrs } }
        ];

        // Only include organizationId if the string value is a valid ObjectId (to prevent CastError)
        if (orgIdString && mongoose.Types.ObjectId.isValid(orgIdString)) {
          conditions.push({ organizationId: orgIdString });
        }

        const devices = await Device.find({
          $or: conditions
        }).select("deviceId");

        const deviceIds = devices.map(d => d.deviceId);
        filter = { deviceId: { $in: deviceIds } };
      } else {
        filter = { _id: null }; // no organization matched
      }
    }

    const sessions = await MonitoringSession.find(filter).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: sessions });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Helper: build a query that matches by _id (if valid ObjectId)
// or by patientId/patientCode for backward compat with old records.
function buildIdQuery(id) {
  if (mongoose.Types.ObjectId.isValid(id)) return { _id: id };
  return { $or: [{ patientId: id }, { patientCode: id }] };
}

exports.getSessionById = async (req, res) => {
  try {
    const session = await MonitoringSession.findOne(buildIdQuery(req.params.id)).lean();
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    
    // Fetch latest HealthData for the device
    if (session.deviceId) {
      const latestData = await HealthData.findOne({ deviceId: session.deviceId })
        .sort({ timestamp: -1 })
        .lean();
        
      if (latestData) {
        session.currentHeartRate = latestData.heartRate;
        session.currentRespiration = latestData.respiration;
        session.currentTemperature = latestData.temperature;
      }
    }

    res.status(200).json({ success: true, data: session });
  } catch (error) {
    console.error('Error fetching session by ID:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.updateSessionNotes = async (req, res) => {
  try {
    const { notes } = req.body;
    const session = await MonitoringSession.findOneAndUpdate(
      buildIdQuery(req.params.id),
      { $set: { technicianNotes: notes } },
      { new: true }
    );
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    res.status(200).json({ success: true, data: session });
  } catch (error) {
    console.error('Error updating session notes:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.toggleReviewedEvent = async (req, res) => {
  try {
    const { eventName, allEvents = [] } = req.body;
    if (!eventName) return res.status(400).json({ success: false, message: 'Event name is required' });

    const session = await MonitoringSession.findOne(buildIdQuery(req.params.id));
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });

    const index = session.reviewedEvents.indexOf(eventName);
    if (index > -1) {
      session.reviewedEvents.splice(index, 1);
    } else {
      session.reviewedEvents.push(eventName);
    }

    if (allEvents.length > 0) {
      const allChecked = allEvents.every(e => session.reviewedEvents.includes(e));
      session.isReviewed = allChecked;
      if (allChecked) {
        session.reviewedAt = new Date();
      } else {
        session.reviewedAt = undefined;
      }
    } else {
      session.isReviewed = false;
    }

    await session.save();
    res.status(200).json({ success: true, data: session });
  } catch (error) {
    console.error('Error toggling reviewed event:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.toggleSessionFlag = async (req, res) => {
  try {
    const session = await MonitoringSession.findOne(buildIdQuery(req.params.id));
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    session.flagged = !session.flagged;
    await session.save();
    res.status(200).json({ success: true, data: session });
  } catch (error) {
    console.error('Error toggling session flag:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.markSessionFullyReviewed = async (req, res) => {
  try {
    const { events = [] } = req.body;
    const session = await MonitoringSession.findOne(buildIdQuery(req.params.id));
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    session.reviewedEvents = events;
    session.isReviewed = true;
    session.reviewedAt = new Date();
    await session.save();
    res.status(200).json({ success: true, data: session });
  } catch (error) {
    console.error('Error marking session reviewed:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.deleteSession = async (req, res) => {
  try {
    const session = await MonitoringSession.findOneAndDelete(buildIdQuery(req.params.id));
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    res.status(200).json({ success: true, message: 'Session deleted successfully' });
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Update basic session details
// @route   PUT /api/sessions/:id
// @access  Private (Authenticated)
exports.updateSessionDetails = async (req, res) => {
  try {
    const { 
      name, 
      patientCode, 
      patientId, 
      admissionDate, 
      dischargeDate, 
      age, 
      sex, 
      room, 
      bed, 
      consentVerified, 
      technicianNotes,
      patientPhone,
      patientEmail,
      caretakerPhone,
      caretakerEmail
    } = req.body;
    
    // We can use buildIdQuery if the app uses custom id resolution, but req.params.id is standard.
    const query = req.params.id.length === 24 ? { _id: req.params.id } : { id: req.params.id };
    const session = await MonitoringSession.findOne(query);
    
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    if (name !== undefined) session.name = name;
    if (patientCode !== undefined) session.patientCode = patientCode;
    if (patientId !== undefined) session.patientId = patientId;
    if (admissionDate !== undefined) session.admissionDate = admissionDate;
    if (dischargeDate !== undefined) {
      session.dischargeDate = dischargeDate;
      // If dischargeDate is provided, auto-complete the session
      if (dischargeDate) {
        session.status = 'Completed';
      } else {
        session.status = 'active'; // Reset to active if discharge date is cleared
      }
    }
    if (age !== undefined) session.age = age;
    if (sex !== undefined) session.sex = sex;
    if (room !== undefined) session.room = room;
    if (bed !== undefined) session.bed = bed;
    if (consentVerified !== undefined) session.consentVerified = consentVerified;
    if (technicianNotes !== undefined) session.technicianNotes = technicianNotes;
    
    if (patientPhone !== undefined) session.patientPhone = patientPhone;
    if (patientEmail !== undefined) session.patientEmail = patientEmail;
    if (caretakerPhone !== undefined) session.caretakerPhone = caretakerPhone;
    if (caretakerEmail !== undefined) session.caretakerEmail = caretakerEmail;

    await session.save();

    res.status(200).json({ success: true, data: session });
  } catch (error) {
    console.error('Error updating session details:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.generatePatientId = async (req, res, next) => {
  try {
    const userId = req.user.userId || req.user.id;
    const User = require('../models/User');
    const Account = require('../models/Account');

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    let orgId = null;
    if (user.account) {
      const account = await Account.findById(user.account);
      if (account) {
        orgId = account.organizationId;
      }
    }

    if (!orgId) {
      const randomDigits = Math.floor(1000 + Math.random() * 9000);
      return res.json({ success: true, patientId: `P-${randomDigits}` });
    }

    // Find all devices associated with this organization
    const devices = await Device.find({ organizationId: orgId }).select('deviceId');
    const deviceIds = devices.map(d => d.deviceId);

    // Find all existing sessions for these devices and get their patientId/patientCode values
    const existingSessions = await MonitoringSession.find({ deviceId: { $in: deviceIds } })
      .select('patientId patientCode');
    
    const existingIds = new Set();
    existingSessions.forEach(s => {
      if (s.patientId) existingIds.add(s.patientId.toUpperCase().trim());
      if (s.patientCode) existingIds.add(s.patientCode.toUpperCase().trim());
    });

    // Generate unique random 4-digit number
    let generatedId = '';
    let attempts = 0;
    while (attempts < 1000) {
      const randomDigits = Math.floor(1000 + Math.random() * 9000); // 4 digits: 1000 to 9999
      const candidateId = `P-${randomDigits}`;
      if (!existingIds.has(candidateId)) {
        generatedId = candidateId;
        break;
      }
      attempts++;
    }

    if (!generatedId) {
      const randomDigits = Math.floor(10000 + Math.random() * 90000);
      generatedId = `P-${randomDigits}`;
    }

    res.json({ success: true, patientId: generatedId });
  } catch (error) {
    console.error('Error generating patient ID:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
