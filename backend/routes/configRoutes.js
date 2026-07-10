const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { getConfig, updateConfig } = require('../controllers/systemConfigController');

router.use(authMiddleware);

router.route('/')
  .get(getConfig)
  .post(updateConfig);

module.exports = router;
