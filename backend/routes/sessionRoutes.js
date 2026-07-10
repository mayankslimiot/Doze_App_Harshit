const express = require('express');
const router = express.Router();
const { 
  createSession, 
  getSessions, 
  getSessionById, 
  updateSessionNotes,
  toggleReviewedEvent,
  toggleSessionFlag,
  markSessionFullyReviewed,
  deleteSession,
  updateSessionDetails,
  generatePatientId
} = require('../controllers/sessionController');
const authMiddleware = require('../middleware/authMiddleware');

// Protect all session routes
router.use(authMiddleware);

router.route('/')
  .post(createSession)
  .get(getSessions);

router.get('/generate-patient-id', generatePatientId);

router.route('/:id')
  .get(getSessionById)
  .put(updateSessionDetails)
  .delete(deleteSession);

router.route('/:id/notes')
  .put(updateSessionNotes);

router.route('/:id/review-event')
  .put(toggleReviewedEvent);

router.route('/:id/flag')
  .put(toggleSessionFlag);

router.route('/:id/mark-reviewed')
  .put(markSessionFullyReviewed);

module.exports = router;
