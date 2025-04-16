const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');

let io;
const userSockets = new Map(); // Lưu trữ socket connections của users

const initializeSocket = (server) => {
    io = socketIO(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
            allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With', '*'],
            credentials: true,
            preflightContinue: false,
            optionsSuccessStatus: 204
        },
        transports: ['polling', 'websocket'],
        allowUpgrades: true,
        pingTimeout: 60000,
        pingInterval: 25000,
        cookie: false,
        allowEIO3: true,
        path: '/socket.io/',
        serveClient: true,
        connectTimeout: 45000,
        maxHttpBufferSize: 1e8,
        cors: true
    });

    // Log khi server socket khởi động
    console.log('Socket.IO server initialized');

    // Middleware xác thực token
    io.use((socket, next) => {
        const token = socket.handshake.auth.token;
        console.log('Socket auth attempt with token:', token ? 'exists' : 'not found');
        
        if (!token) {
            console.error('Socket auth error: No token provided');
            return next(new Error('Authentication error'));
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.user = decoded;
            console.log('Socket authenticated for user:', decoded.email);
            next();
        } catch (error) {
            console.error('Socket auth error:', error.message);
            return next(new Error('Authentication error'));
        }
    });

    io.on('connection', (socket) => {
        const userEmail = socket.user.email;
        console.log('New client connected:', userEmail);

        // Lưu socket connection của user
        if (!userSockets.has(userEmail)) {
            userSockets.set(userEmail, new Set());
        }
        userSockets.get(userEmail).add(socket.id);

        // Xử lý sự kiện gửi tin nhắn mới
        socket.on('newMessage', async (data) => {
            try {
                const { receiverEmail, message } = data;
                const senderEmail = socket.user.email;

                console.log('New message from:', senderEmail, 'to:', receiverEmail);

                // Gửi tin nhắn tới tất cả các kết nối của người nhận
                const receiverSockets = userSockets.get(receiverEmail);
                if (receiverSockets) {
                    receiverSockets.forEach(socketId => {
                        io.to(socketId).emit('newMessage', {
                            ...message,
                            senderEmail
                        });
                    });
                }

                // Gửi xác nhận lại cho người gửi
                socket.emit('messageSent', {
                    success: true,
                    messageId: message.id
                });
            } catch (error) {
                console.error('New message error:', error);
                socket.emit('messageSent', {
                    success: false,
                    error: error.message
                });
            }
        });

        // Xử lý sự kiện đánh dấu tin nhắn đã đọc
        socket.on('messageRead', async (data) => {
            try {
                const { messageId, senderEmail } = data;
                
                // Gửi thông báo cho tất cả các kết nối của người gửi
                const senderSockets = userSockets.get(senderEmail);
                if (senderSockets) {
                    senderSockets.forEach(socketId => {
                        io.to(socketId).emit('messageRead', {
                            messageId
                        });
                    });
                }
            } catch (error) {
                console.error('Message read error:', error);
            }
        });

        // Xử lý sự kiện bắt đầu gõ tin nhắn
        socket.on('typingStart', (data) => {
            try {
                const { receiverEmail } = data;
                const senderEmail = socket.user.email;

                console.log('Typing started from:', senderEmail, 'to:', receiverEmail);

                // Gửi thông báo cho tất cả các kết nối của người nhận
                const receiverSockets = userSockets.get(receiverEmail);
                if (receiverSockets) {
                    receiverSockets.forEach(socketId => {
                        io.to(socketId).emit('typingStart', {
                            senderEmail
                        });
                    });
                }
            } catch (error) {
                console.error('Typing start error:', error);
            }
        });

        // Xử lý sự kiện dừng gõ tin nhắn
        socket.on('typingStop', (data) => {
            try {
                const { receiverEmail } = data;
                const senderEmail = socket.user.email;

                console.log('Typing stopped from:', senderEmail, 'to:', receiverEmail);

                // Gửi thông báo cho tất cả các kết nối của người nhận
                const receiverSockets = userSockets.get(receiverEmail);
                if (receiverSockets) {
                    receiverSockets.forEach(socketId => {
                        io.to(socketId).emit('typingStop', {
                            senderEmail
                        });
                    });
                }
            } catch (error) {
                console.error('Typing stop error:', error);
            }
        });

        // Xử lý sự kiện gửi lời mời kết bạn
        socket.on('friendRequestSent', async (data) => {
            try {
                const { receiverEmail } = data;
                const senderEmail = socket.user.email;

                const sender = await User.getUserByEmail(senderEmail);
                if (!sender) return;

                // Gửi thông báo cho tất cả các kết nối của người nhận
                const receiverSockets = userSockets.get(receiverEmail);
                if (receiverSockets) {
                    receiverSockets.forEach(socketId => {
                        io.to(socketId).emit('friendRequestUpdate', {
                            type: 'newRequest',
                            sender: {
                                email: sender.email,
                                fullName: sender.fullName,
                                avatar: sender.avatar
                            }
                        });
                    });
                }
            } catch (error) {
                console.error('Friend request sent error:', error);
            }
        });

        socket.on('disconnect', () => {
            console.log('Client disconnected:', userEmail);
            // Xóa socket connection khi user disconnect
            const userSocketSet = userSockets.get(userEmail);
            if (userSocketSet) {
                userSocketSet.delete(socket.id);
                if (userSocketSet.size === 0) {
                    userSockets.delete(userEmail);
                }
            }
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