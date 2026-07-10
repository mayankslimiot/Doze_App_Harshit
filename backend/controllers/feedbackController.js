const Feedback = require('../models/Feedback');
const User = require('../models/User');
const Account = require('../models/Account');

exports.createFeedback = async (req, res, next) => {
  try {
    const { 
      sessionCode, 
      technicianFeedback, 
      doctorFeedback,
      nameOfSubmitter,
      subject,
      severity,
      problemDetails
    } = req.body;

    if (!sessionCode && !subject) {
      return res.status(400).json({ success: false, message: 'Session code or feedback subject is required' });
    }

    let organizationId = null;

    // Resolve organizationId if not superadmin
    if (req.user.role !== 'superadmin' && req.user.role !== 'super_admin') {
      const user = await User.findById(req.user.userId).populate('account');
      if (user && user.account) {
        organizationId = user.account.organizationId || null;
      }
    }

    const feedback = new Feedback({
      sessionCode,
      submittedBy: req.user.userId,
      organizationId,
      nameOfSubmitter,
      subject,
      severity: severity || 'Low',
      problemDetails,
      technicianFeedback: {
        setupEase: technicianFeedback?.setupEase || 0,
        placementClarity: technicianFeedback?.placementClarity || 0,
        usability: technicianFeedback?.usability || 0,
        signalIssues: technicianFeedback?.signalIssues,
        alertUnderstanding: technicianFeedback?.alertUnderstanding,
        comments: technicianFeedback?.comments || ''
      },
      doctorFeedback: {
        clinicalUtility: doctorFeedback?.clinicalUtility || 0,
        reportClarity: doctorFeedback?.reportClarity || 0,
        diagnosticConfidence: doctorFeedback?.diagnosticConfidence,
        comments: doctorFeedback?.comments || ''
      }
    });

    await feedback.save();

    res.status(201).json({ success: true, status: 'success', data: feedback });
  } catch (error) {
    console.error('Error creating feedback:', error);
    next(error);
  }
};

exports.getFeedbacks = async (req, res, next) => {
  try {
    let query = {};

    // Filter by organization if normal admin
    if (req.user.role !== 'superadmin' && req.user.role !== 'super_admin') {
      const user = await User.findById(req.user.userId).populate('account');
      if (!user || !user.account || !user.account.organizationId) {
        return res.status(200).json({ success: true, status: 'success', data: [] });
      }
      query.organizationId = user.account.organizationId;
    }

    const feedbacks = await Feedback.find(query)
      .populate('submittedBy', 'name email role')
      .populate('organizationId', 'name organizationId')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, status: 'success', data: feedbacks });
  } catch (error) {
    console.error('Error fetching feedbacks:', error);
    next(error);
  }
};

exports.markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Only superadmins can mark feedback as read/reviewed
    if (req.user.role !== 'superadmin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Only superadmins can mark feedback as reviewed' });
    }

    const feedback = await Feedback.findByIdAndUpdate(
      id,
      { $set: { isRead: true } },
      { new: true }
    );

    if (!feedback) {
      return res.status(404).json({ success: false, message: 'Feedback not found' });
    }

    res.status(200).json({ success: true, status: 'success', data: feedback });
  } catch (error) {
    console.error('Error marking feedback as read:', error);
    next(error);
  }
};

exports.deleteFeedback = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check organization permission for normal admin
    if (req.user.role !== 'superadmin' && req.user.role !== 'super_admin') {
      const user = await User.findById(req.user.userId).populate('account');
      const orgId = user?.account?.organizationId;

      const feedback = await Feedback.findById(id);
      if (!feedback) {
        return res.status(404).json({ success: false, message: 'Feedback not found' });
      }

      if (String(feedback.organizationId) !== String(orgId)) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
    }

    const feedback = await Feedback.findByIdAndDelete(id);

    if (!feedback) {
      return res.status(404).json({ success: false, message: 'Feedback not found' });
    }

    res.status(200).json({ success: true, status: 'success', message: 'Feedback deleted successfully' });
  } catch (error) {
    console.error('Error deleting feedback:', error);
    next(error);
  }
};
