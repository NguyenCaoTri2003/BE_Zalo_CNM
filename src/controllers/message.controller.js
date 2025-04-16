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

exports.recallMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const senderEmail = req.user.email; // Lấy email người gửi từ token

        // Tìm tin nhắn và kiểm tra quyền thu hồi
        const message = await Message.findOne({ messageId, senderEmail });
        
        if (!message) {
            return res.status(404).json({
                success: false,
                error: 'Message not found or you do not have permission to recall this message'
            });
        }

        // Kiểm tra thời gian thu hồi (ví dụ: chỉ cho phép thu hồi trong 2 phút)
        const messageAge = Date.now() - message.createdAt.getTime();
        const twoMinutes = 2 * 60 * 1000;
        
        if (messageAge > twoMinutes) {
            return res.status(400).json({
                success: false,
                error: 'Cannot recall message after 2 minutes'
            });
        }

        // Cập nhật trạng thái tin nhắn thành "recalled"
        await Message.findOneAndUpdate(
            { messageId },
            { 
                status: 'recalled',
                content: 'Tin nhắn đã được thu hồi'
            }
        );

        res.status(200).json({
            success: true,
            message: 'Message recalled successfully'
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
        const userEmail = req.user.email; // Lấy email người dùng từ token

        // Tìm tin nhắn và kiểm tra quyền xóa
        const message = await Message.findOne({
            messageId,
            $or: [
                { senderEmail: userEmail },
                { receiverEmail: userEmail }
            ]
        });

        if (!message) {
            return res.status(404).json({
                success: false,
                error: 'Message not found or you do not have permission to delete this message'
            });
        }

        // Xóa tin nhắn
        await Message.deleteOne({ messageId });

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