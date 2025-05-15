const Message = require('../models/message.model');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/user.model');
const Group = require('../models/group.model');

exports.sendMessage = async (req, res) => {
    try {
        const { content, type = 'text', fileData } = req.body;
        const senderEmail = req.user.email;
        const receiverEmail = req.body.receiverEmail;

        if (!senderEmail || !receiverEmail || !content) {
            return res.status(400).json({ 
                success: false,
                error: 'Missing required fields: senderEmail, receiverEmail, or content' 
            });
        }

        const message = {
            messageId: uuidv4(),
            senderEmail,
            receiverEmail,
            content,
            type,              // 👈 thêm type để phân biệt text/file
            ...fileData,       // 👈 thêm metadata file nếu có
            createdAt: new Date().toISOString(),
            status: 'sent'
        };

        const savedMessage = await Message.create(message);
        res.status(201).json({
            success: true,
            data: savedMessage
        });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ 
            success: false,
            error: error.message || 'Internal server error' 
        });
    }
};


exports.getMessages = async (req, res) => {
    try {
        const senderEmail = req.user.email;
        const { receiverEmail } = req.params;
        
        if (!senderEmail || !receiverEmail) {
            return res.status(400).json({ 
                success: false,
                error: 'Missing required fields: senderEmail or receiverEmail' 
            });
        }

        const messages = await Message.find({
            senderEmail,
            receiverEmail
        });

        res.status(200).json({
            success: true,
            data: messages
        });
    } catch (error) {
        console.error('Error getting messages:', error);
        res.status(500).json({ 
            success: false,
            error: error.message || 'Internal server error' 
        });
    }
};

exports.markAsRead = async (req, res) => {
    try {
        const { messageId } = req.params;
        const receiverEmail = req.user.email;

        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({
                success: false,
                error: 'Message not found'
            });
        }

        if (message.receiverEmail !== receiverEmail) {
            return res.status(403).json({
                success: false,
                error: 'You can only mark messages sent to you as read'
            });
        }

        await Message.findOneAndUpdate(
            { messageId, senderEmail: message.senderEmail, receiverEmail },
            { status: 'read' }
        );

        res.status(200).json({ 
            success: true,
            message: 'Message marked as read' 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
};

exports.addReaction = async (req, res) => {
    try {
        const { messageId, reaction } = req.body;
        const senderEmail = req.user.email;

        if (!messageId || !reaction) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: messageId or reaction'
            });
        }

        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({
                success: false,
                error: 'Message not found'
            });
        }

        // Get current reactions or initialize empty array
        let currentReactions = message.reactions || [];

        // Find existing reaction from this user
        const existingReactionIndex = currentReactions.findIndex(
            r => r.senderEmail === senderEmail
        );

        if (existingReactionIndex >= 0) {
            // Update existing reaction
            currentReactions[existingReactionIndex] = {
                senderEmail,
                reaction,
                timestamp: new Date().toISOString()
            };
        } else {
            // Add new reaction
            currentReactions.push({
                senderEmail,
                reaction,
                timestamp: new Date().toISOString()
            });
        }

        // Update reactions in database
        const updatedMessage = await Message.updateReactions(messageId, currentReactions);

        res.status(200).json({
            success: true,
            data: updatedMessage
        });
    } catch (error) {
        console.error('Error adding reaction:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
};

exports.recallMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const userEmail = req.user.email;

        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({
                success: false,
                error: 'Message not found'
            });
        }

        if (message.senderEmail !== userEmail) {
            return res.status(403).json({
                success: false,
                error: 'You can only recall your own messages'
            });
        }

        const updatedMessage = await Message.recallMessage(messageId);

        res.status(200).json({
            success: true,
            data: updatedMessage
        });
    } catch (error) {
        console.error('Error recalling message:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
};

exports.deleteMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const userEmail = req.user.email;
        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({
                success: false,
                error: 'Message not found'
            });
        }

        if (message.senderEmail !== userEmail) {
            return res.status(403).json({
                success: false,
                error: 'You can only delete your own messages'
            });
        }

        const updatedMessage = await Message.deleteMessage(messageId);

        res.status(200).json({
            success: true,
            data: updatedMessage,
            message: 'Message deleted for you'
        });
    } catch (error) {
        console.error('Error deleting message:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
}; 


exports.forwardMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const { sourceType = 'group', sourceGroupId, targetGroupId, targetEmail } = req.body;
        const userId = req.user.userId || req.user.id;
        const userEmail = req.user.email;

        let sourceMessage = null;

        // Nếu nguồn là group
        if (sourceType === 'group') {
            const sourceGroup = await Group.getGroup(sourceGroupId);
            if (!sourceGroup) return res.status(404).json({ success: false, message: 'Group not found' });

            if (!sourceGroup.members.includes(userId)) return res.status(403).json({ success: false, message: 'Not a member' });

            sourceMessage = sourceGroup.messages.find(msg => msg.messageId === messageId);
        } else {
            // Nếu nguồn là tin nhắn cá nhân
            sourceMessage = await Message.findById(messageId);
            if (!sourceMessage) return res.status(404).json({ success: false, message: 'Message not found' });

            if (sourceMessage.senderEmail !== userEmail && sourceMessage.receiverEmail !== userEmail) {
                return res.status(403).json({ success: false, message: 'Not your message' });
            }
        }

        if (!sourceMessage) return res.status(404).json({ success: false, message: 'Message not found' });

        // Tạo message chuyển tiếp giống như trước
        const forwardedMessage = {
            messageId: uuidv4(),
            senderId: userId,
            senderEmail: userEmail,
            content: sourceMessage.content,
            type: sourceMessage.type,
            metadata: sourceMessage.metadata,
            isForwarded: true,
            originalMessageId: messageId,
            originalGroupId: sourceType === 'group' ? sourceGroupId : undefined,   
            originalSenderEmail: sourceType != 'group' ? sourceMessage.senderEmail : undefined,
            isDeleted: false,
            isRecalled: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            status: 'sent'
        };

        console.log("======== Forwarded message: ========", forwardedMessage);

        

        if (!targetGroupId && !targetEmail) {
            return res.status(400).json({ success: false, message: 'Target missing' });
        }

        if (targetGroupId) {
            const targetGroup = await Group.getGroup(targetGroupId);
            if (!targetGroup || !targetGroup.members.includes(userId)) {
                return res.status(403).json({ success: false, message: 'Not a member of target group' });
            }
            forwardedMessage.groupId = targetGroupId;
            await Group.addMessage(targetGroupId, forwardedMessage);
        } 

        if (targetEmail) {
            const targetUser = await User.getUserByEmail(targetEmail);
            if (!targetUser) return res.status(404).json({ success: false, message: 'Target user not found' });

            forwardedMessage.receiverEmail = targetEmail;
            await Message.create(forwardedMessage);
        }

        

        return res.json({ success: true, data: forwardedMessage });

    } catch (error) {
        console.error("Lỗi:", error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
}
