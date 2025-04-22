const express = require('express');
const router = express.Router();
const GroupController = require('../controllers/group.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Apply auth middleware to all routes
router.use(authMiddleware);

// Get all groups
router.get('/', GroupController.getGroups);

// Group management routes
router.post('/', GroupController.createGroup);
router.get('/:groupId', GroupController.getGroup);
router.put('/:groupId', GroupController.updateGroup);
router.delete('/:groupId', GroupController.deleteGroup);

// Group messages routes
router.get('/:groupId/messages', GroupController.getGroupMessages);
router.post('/:groupId/messages', GroupController.sendGroupMessage);

// Member management routes
router.post('/:groupId/members', GroupController.addMember);
router.delete('/:groupId/members', GroupController.removeMember);

// Admin management routes
router.post('/:groupId/admins', GroupController.addAdmin);
router.delete('/:groupId/admins', GroupController.removeAdmin);

module.exports = router; 