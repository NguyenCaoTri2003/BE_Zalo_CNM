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

// Add reaction to a message
router.post('/reaction', authenticateToken, messageController.addReaction);

// Thu hồi tin nhắn
router.put('/recall/:messageId', authenticateToken, messageController.recallMessage);

// Xóa tin nhắn
router.delete('/delete/:messageId', authenticateToken, messageController.deleteMessage);

module.exports = router; 