const express = require('express');
const router = express.Router();
const feedbackController = require('../controllers/feedbackController');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

// All feedback routes require authentication
router.use(authMiddleware);

// Submit feedback (Admins, Users, Superadmins can submit if they have a session)
router.post('/', feedbackController.createFeedback);

// Viewing and managing feedbacks requires admin or superadmin privilege
router.get('/', adminMiddleware, feedbackController.getFeedbacks);
router.patch('/:id/read', adminMiddleware, feedbackController.markAsRead);
router.delete('/:id', adminMiddleware, feedbackController.deleteFeedback);

module.exports = router;
