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