const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const authMiddleware = require('../middleware/authMiddleware');

// All ticket routes require authentication
router.use(authMiddleware);

router.post('/', ticketController.createTicket);
router.get('/', ticketController.getTickets);
router.patch('/:id', ticketController.updateTicket);
router.delete('/:id', ticketController.deleteTicket);

module.exports = router;
