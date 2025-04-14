const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');

let io;

const initializeSocket = (server) => {
    io = socketIO(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        }
    });

    // Middleware xác thực token
    io.use((socket, next) => {
        const token = socket.handshake.auth.token;
        if (!token) {
            return next(new Error('Authentication error'));
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.user = decoded;
            next();
        } catch (error) {
            return next(new Error('Authentication error'));
        }
    });

    io.on('connection', (socket) => {
        console.log('New client connected:', socket.user.email);

        // Xử lý sự kiện gửi lời mời kết bạn
        socket.on('friendRequestSent', async (data) => {
            try {
                const { receiverEmail } = data;
                const senderEmail = socket.user.email;

                // Lấy thông tin người gửi
                const sender = await User.getUserByEmail(senderEmail);
                if (!sender) {
                    return;
                }

                // Gửi thông báo cho người nhận
                io.emit(`friendRequestUpdate:${receiverEmail}`, {
                    type: 'newRequest',
                    sender: {
                        email: sender.email,
                        fullName: sender.fullName,
                        avatar: sender.avatar
                    }
                });
            } catch (error) {
                console.error('Friend request sent error:', error);
            }
        });

        // Xử lý sự kiện thu hồi lời mời kết bạn
        socket.on('friendRequestWithdrawn', async (data) => {
            try {
                const { receiverEmail } = data;
                const senderEmail = socket.user.email;

                // Gửi thông báo cho người nhận
                io.emit(`friendRequestWithdrawn:${receiverEmail}`, {
                    senderEmail
                });
            } catch (error) {
                console.error('Friend request withdrawn error:', error);
            }
        });

        // Xử lý sự kiện chấp nhận/từ chối lời mời kết bạn
        socket.on('friendRequestResponded', async (data) => {
            try {
                const { senderEmail, accept } = data;
                const receiverEmail = socket.user.email;

                // Gửi thông báo cho người gửi
                io.emit(`friendRequestResponded:${senderEmail}`, {
                    receiverEmail,
                    accept
                });
            } catch (error) {
                console.error('Friend request responded error:', error);
            }
        });

        socket.on('disconnect', () => {
            console.log('Client disconnected:', socket.user.email);
        });
    });

    return io;
};

const getIO = () => {
    if (!io) {
        throw new Error('Socket.IO not initialized');
    }
    return io;
};

module.exports = {
    initializeSocket,
    getIO
}; 