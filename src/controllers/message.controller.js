const Message = require('../models/message.model');
const { v4: uuidv4 } = require('uuid');

exports.sendMessage = async (req, res) => {
    try {
        const { content } = req.body;
        const senderEmail = req.user.email; // Lấy email người gửi từ token
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
            createdAt: new Date(),
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
        const senderEmail = req.user.email; // Lấy email người gửi từ token
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
        const receiverEmail = req.user.email; // Lấy email người nhận từ token

        await Message.findOneAndUpdate(
            { messageId, receiverEmail },
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

        // Tìm tin nhắn bằng findById thay vì findOne
        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({
                success: false,
                error: 'Message not found'
            });
        }

        // Chuẩn bị reaction mới
        const newReaction = {
            senderEmail,
            reaction,
            timestamp: new Date().toISOString()
        };

        // Lấy reactions hiện tại hoặc khởi tạo mảng rỗng
        let currentReactions = message.reactions || [];

        // Tìm index của reaction hiện tại của user (nếu có)
        const existingReactionIndex = currentReactions.findIndex(
            r => r.senderEmail === senderEmail
        );

        if (existingReactionIndex >= 0) {
            // Cập nhật reaction cũ
            currentReactions[existingReactionIndex] = newReaction;
        } else {
            // Thêm reaction mới
            currentReactions.push(newReaction);
        }

        // Cập nhật reactions trong database
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

        // Kiểm tra tin nhắn tồn tại
        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({
                success: false,
                error: 'Message not found'
            });
        }

        // Kiểm tra người dùng có phải là người gửi tin nhắn
        if (message.senderEmail !== userEmail) {
            return res.status(403).json({
                success: false,
                error: 'You can only recall your own messages'
            });
        }

        // Thu hồi tin nhắn
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

        // Kiểm tra tin nhắn tồn tại
        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({
                success: false,
                error: 'Message not found'
            });
        }

        // Kiểm tra người dùng có phải là người gửi hoặc người nhận tin nhắn
        if (message.senderEmail !== userEmail && message.receiverEmail !== userEmail) {
            return res.status(403).json({
                success: false,
                error: 'You can only delete messages you sent or received'
            });
        }

        // Xóa tin nhắn
        await Message.deleteMessage(messageId);

        res.status(200).json({
            success: true,
            message: 'Message deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting message:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
}; 