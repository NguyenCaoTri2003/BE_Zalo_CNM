const express = require('express');
const router = express.Router();
const messageController = require('../controllers/message.controller');
const authenticateToken = require('../middleware/auth.middleware');

// Send a new message
router.post('/send', authenticateToken, messageController.sendMessage);

// Get messages between two users
router.get('/conversation/:receiverEmail', authenticateToken, messageController.getMessages);

// Mark a message as read
router.put('/read/:messageId', authenticateToken, messageController.markAsRead);

module.exports = router; 