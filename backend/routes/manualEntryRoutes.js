const express = require('express');
const router = express.Router();
const { createManualEntry, getManualEntries } = require('../controllers/manualEntryController');
const authMiddleware = require('../middleware/authMiddleware');

// Protect all manual entry routes
router.use(authMiddleware);

router.route('/')
  .post(createManualEntry);

router.route('/:deviceId')
  .get(getManualEntries);

module.exports = router;
