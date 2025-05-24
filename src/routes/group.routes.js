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
// router.get('/members/:groupId', GroupController.getGroupMembers);
router.put('/:groupId', GroupController.updateGroup);
router.delete('/:groupId', GroupController.deleteGroup);

// Group messages routes
router.get('/:groupId/messages', GroupController.getGroupMessages);
router.get('/:groupId/members', GroupController.getGroupMembers);
router.post('/:groupId/messages', GroupController.sendGroupMessage);
router.post('/:groupId/messages/:messageId/reactions', GroupController.addReactionToGroupMessage);
router.post('/:groupId/messages/:messageId/forward', GroupController.forwardMessage);
router.put('/:groupId/messages/:messageId/recall', GroupController.recallMessage);
router.delete('/:groupId/messages/:messageId/user', GroupController.deleteMessageForUser);
router.delete('/:groupId/messages/hide', GroupController.hideAllGroupMessagesForUser);

// Member management routes
router.post('/:groupId/members', GroupController.addMember);
router.delete('/:groupId/members', GroupController.removeMember);
router.delete('/:groupId/members/:memberId', GroupController.removeMemberWeb);
router.put('/:groupId/members/:memberId/role', GroupController.updateMemberRole);

// Admin management routes
router.post('/:groupId/admins', GroupController.addAdmin);
router.post('/:groupId/adminsweb', GroupController.addAdminWeb);
router.delete('/:groupId/admins', GroupController.removeAdmin);
router.delete('/:groupId/adminsweb', GroupController.removeAdminWeb);

// Deputy management routes
router.post('/:groupId/deputies', GroupController.addDeputy);
router.delete('/:groupId/deputies', GroupController.removeDeputy);
router.delete('/:groupId/deputiesweb', GroupController.removeDeputyWeb);

// Group file routes
router.post('/:groupId/upload', GroupController.uploadMiddleware, GroupController.uploadGroupFile);
router.get('/:groupId/files/:filename', GroupController.getGroupFile);

// Thêm route mới cho API updateGroupInfo
router.put('/:groupId/info', GroupController.uploadMiddleware, GroupController.updateGroupInfo);
router.post('/:groupId/info', GroupController.uploadMiddleware, GroupController.updateGroupInfo);

// Route để rời nhóm
router.post('/:groupId/leave', GroupController.leaveGroup);
router.post('/:groupId/leaveweb', GroupController.leaveGroupWeb);


// Toggle member invitation permission
router.post('/:groupId/toggle-member-invite', GroupController.toggleMemberInvite);

module.exports = router; 