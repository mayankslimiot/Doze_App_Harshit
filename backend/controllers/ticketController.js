const Ticket = require('../models/Ticket');
const User = require('../models/User');

exports.createTicket = async (req, res, next) => {
  try {
    const {
      ticketType,
      priority,
      sessionId,
      participantCode,
      deviceId,
      wardBedId,
      issueTime,
      description,
      screenshot,
      impact
    } = req.body;

    if (!ticketType || !description) {
      return res.status(400).json({ success: false, message: 'Ticket type and description are required' });
    }

    let organizationId = null;
    if (req.user.role !== 'superadmin') {
      const user = await User.findById(req.user.userId).populate('account');
      if (user && user.account) {
        organizationId = user.account.organizationId || null;
      }
    }

    const ticket = new Ticket({
      ticketType,
      priority: priority || 'Low',
      sessionId: sessionId || '',
      participantCode: participantCode || '',
      deviceId: deviceId || '',
      wardBedId: wardBedId || '',
      issueTime: issueTime ? new Date(issueTime) : new Date(),
      description,
      screenshot: screenshot || '',
      impact: impact || 'Minimal',
      submittedBy: req.user.userId,
      organizationId
    });

    await ticket.save();

    res.status(201).json({ success: true, status: 'success', data: ticket });
  } catch (error) {
    console.error('Error creating ticket:', error);
    next(error);
  }
};

exports.getTickets = async (req, res, next) => {
  try {
    let query = {};

    // Filter by organization if normal admin/user
    if (req.user.role !== 'superadmin') {
      const user = await User.findById(req.user.userId).populate('account');
      if (!user || !user.account || !user.account.organizationId) {
        return res.status(200).json({ success: true, status: 'success', data: [] });
      }
      query.organizationId = user.account.organizationId;
    }

    const tickets = await Ticket.find(query)
      .populate('submittedBy', 'name email role')
      .populate('organizationId', 'name organizationId')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, status: 'success', data: tickets });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    next(error);
  }
};

exports.updateTicket = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, assignedPerson, resolutionNote } = req.body;

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    // Verify organization matching if not superadmin
    if (req.user.role !== 'superadmin') {
      const user = await User.findById(req.user.userId).populate('account');
      const orgId = user?.account?.organizationId;
      if (!orgId || String(ticket.organizationId) !== String(orgId)) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    if (status !== undefined) {
      ticket.status = status;
      if (status === 'Resolved') {
        ticket.resolvedAt = new Date();
      } else {
        ticket.resolvedAt = undefined;
      }
    }
    if (assignedPerson !== undefined) ticket.assignedPerson = assignedPerson;
    if (resolutionNote !== undefined) ticket.resolutionNote = resolutionNote;

    await ticket.save();

    res.status(200).json({ success: true, status: 'success', data: ticket });
  } catch (error) {
    console.error('Error updating ticket:', error);
    next(error);
  }
};

exports.deleteTicket = async (req, res, next) => {
  try {
    const { id } = req.params;

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    // Verify organization permissions
    if (req.user.role !== 'superadmin') {
      const user = await User.findById(req.user.userId).populate('account');
      const orgId = user?.account?.organizationId;
      if (!orgId || String(ticket.organizationId) !== String(orgId)) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    await Ticket.findByIdAndDelete(id);

    res.status(200).json({ success: true, status: 'success', message: 'Ticket deleted successfully' });
  } catch (error) {
    console.error('Error deleting ticket:', error);
    next(error);
  }
};
