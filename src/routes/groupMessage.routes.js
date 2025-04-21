const express = require('express');
const router = express.Router();
const GroupMessageController = require('../controllers/groupMessage.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Apply auth middleware to all routes
router.use(authMiddleware);

// Message routes
router.post('/:groupId/messages', GroupMessageController.sendMessage);
router.get('/:groupId/messages', GroupMessageController.getMessages);
router.delete('/:groupId/messages/:messageId', GroupMessageController.deleteMessage);
router.post('/:groupId/messages/:messageId/recall', GroupMessageController.recallMessage);
router.post('/:groupId/messages/:messageId/forward', GroupMessageController.forwardMessage);

module.exports = router; 