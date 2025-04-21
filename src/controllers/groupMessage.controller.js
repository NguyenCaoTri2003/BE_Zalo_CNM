const GroupMessage = require('../models/groupMessage.model');
const Group = require('../models/group.model');
const { v4: uuidv4 } = require('uuid');

class GroupMessageController {
    // Send a message to group
    static async sendMessage(req, res) {
        try {
            const { groupId } = req.params;
            const { content, type = 'text', fileUrl, fileName, fileSize, fileType } = req.body;
            const senderId = req.user.id;

            // Check if user is member of the group
            const group = await Group.getGroup(groupId);
            if (!group) {
                return res.status(404).json({
                    success: false,
                    message: 'Group not found'
                });
            }

            if (!group.members.includes(senderId)) {
                return res.status(403).json({
                    success: false,
                    message: 'You are not a member of this group'
                });
            }

            const messageData = {
                groupId,
                messageId: uuidv4(),
                senderId,
                content,
                type,
                fileUrl,
                fileName,
                fileSize,
                fileType
            };

            const message = await GroupMessage.createMessage(messageData);

            // Emit socket event for real-time updates
            req.io.to(groupId).emit('new_message', message);

            res.status(201).json({
                success: true,
                data: message
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // Get messages from a group
    static async getMessages(req, res) {
        try {
            const { groupId } = req.params;
            const { limit, lastEvaluatedKey } = req.query;
            const userId = req.user.id;

            // Check if user is member of the group
            const group = await Group.getGroup(groupId);
            if (!group) {
                return res.status(404).json({
                    success: false,
                    message: 'Group not found'
                });
            }

            if (!group.members.includes(userId)) {
                return res.status(403).json({
                    success: false,
                    message: 'You are not a member of this group'
                });
            }

            const result = await GroupMessage.getGroupMessages(
                groupId,
                parseInt(limit) || 50,
                lastEvaluatedKey
            );

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // Delete a message
    static async deleteMessage(req, res) {
        try {
            const { groupId, messageId } = req.params;
            const userId = req.user.id;

            const message = await GroupMessage.getMessage(groupId, messageId);
            if (!message) {
                return res.status(404).json({
                    success: false,
                    message: 'Message not found'
                });
            }

            const group = await Group.getGroup(groupId);
            if (!group) {
                return res.status(404).json({
                    success: false,
                    message: 'Group not found'
                });
            }

            // Only message sender or group admin can delete message
            if (message.senderId !== userId && !group.admins.includes(userId)) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not have permission to delete this message'
                });
            }

            const deletedMessage = await GroupMessage.deleteMessage(groupId, messageId);

            // Emit socket event for real-time updates
            req.io.to(groupId).emit('message_deleted', { groupId, messageId });

            res.json({
                success: true,
                data: deletedMessage
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // Recall a message
    static async recallMessage(req, res) {
        try {
            const { groupId, messageId } = req.params;
            const userId = req.user.id;

            const message = await GroupMessage.getMessage(groupId, messageId);
            if (!message) {
                return res.status(404).json({
                    success: false,
                    message: 'Message not found'
                });
            }

            // Only message sender can recall message
            if (message.senderId !== userId) {
                return res.status(403).json({
                    success: false,
                    message: 'Only message sender can recall the message'
                });
            }

            // Check if message is within recall time limit (e.g., 2 minutes)
            const messageTime = new Date(message.createdAt);
            const now = new Date();
            const timeDiff = (now - messageTime) / 1000 / 60; // in minutes

            if (timeDiff > 2) {
                return res.status(400).json({
                    success: false,
                    message: 'Message can only be recalled within 2 minutes'
                });
            }

            const recalledMessage = await GroupMessage.recallMessage(groupId, messageId);

            // Emit socket event for real-time updates
            req.io.to(groupId).emit('message_recalled', { groupId, messageId });

            res.json({
                success: true,
                data: recalledMessage
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // Forward a message to another group
    static async forwardMessage(req, res) {
        try {
            const { groupId, messageId } = req.params;
            const { targetGroupId } = req.body;
            const userId = req.user.id;

            // Check if user is member of both groups
            const sourceGroup = await Group.getGroup(groupId);
            const targetGroup = await Group.getGroup(targetGroupId);

            if (!sourceGroup || !targetGroup) {
                return res.status(404).json({
                    success: false,
                    message: 'One or both groups not found'
                });
            }

            if (!sourceGroup.members.includes(userId) || !targetGroup.members.includes(userId)) {
                return res.status(403).json({
                    success: false,
                    message: 'You must be a member of both groups to forward messages'
                });
            }

            const forwardedMessage = await GroupMessage.forwardMessage(groupId, messageId, targetGroupId);

            // Emit socket events for real-time updates
            req.io.to(targetGroupId).emit('new_message', forwardedMessage);

            res.json({
                success: true,
                data: forwardedMessage
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
}

module.exports = GroupMessageController; 