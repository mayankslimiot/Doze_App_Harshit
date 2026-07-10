const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const authMiddleware = require('../middleware/authMiddleware');

// Protect all dashboard routes
router.use(authMiddleware);

router.get('/stats', dashboardController.getDashboardStats);
router.get('/sessions', dashboardController.getRecentSessions);
router.get('/devices', dashboardController.getDevices);
router.get('/rooms-beds', dashboardController.getRoomsBeds);

module.exports = router;
