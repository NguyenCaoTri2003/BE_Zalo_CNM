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

        // Thêm xử lý sự kiện khi có người chấp nhận lời mời kết bạn
        socket.on('friendRequestAccepted', async (data) => {
            try {
                const { email } = data; // email của người gửi lời mời
                const accepterEmail = socket.user.email;

                // Lấy thông tin của cả hai người dùng
                const [accepter, requester] = await Promise.all([
                    User.getUserByEmail(accepterEmail),
                    User.getUserByEmail(email)
                ]);

                if (!accepter || !requester) return;

                // Gửi thông báo cập nhật danh sách bạn bè cho người gửi lời mời
                const requesterSockets = userSockets.get(email);
                if (requesterSockets) {
                    requesterSockets.forEach(socketId => {
                        io.to(socketId).emit('friendListUpdate', {
                            type: 'newFriend',
                            friend: {
                                email: accepter.email,
                                fullName: accepter.fullName,
                                avatar: accepter.avatar,
                                online: true
                            }
                        });
                    });
                }

                // Gửi thông báo cập nhật danh sách bạn bè cho người chấp nhận
                const accepterSockets = userSockets.get(accepterEmail);
                if (accepterSockets) {
                    accepterSockets.forEach(socketId => {
                        io.to(socketId).emit('friendListUpdate', {
                            type: 'newFriend',
                            friend: {
                                email: requester.email,
                                fullName: requester.fullName,
                                avatar: requester.avatar,
                                online: true
                            }
                        });
                    });
                }
            } catch (error) {
                console.error('Friend request accepted error:', error);
            }
        });

        // Thêm xử lý sự kiện khi có người hủy kết bạn
        socket.on('unfriend', async (data) => {
            try {
                const { targetEmail } = data;
                const initiatorEmail = socket.user.email;

                // Gửi thông báo cho người bị hủy kết bạn
                const targetSockets = userSockets.get(targetEmail);
                if (targetSockets) {
                    targetSockets.forEach(socketId => {
                        io.to(socketId).emit('friendListUpdate', {
                            type: 'unfriend',
                            email: initiatorEmail
                        });
                    });
                }

                // Gửi thông báo xác nhận cho người thực hiện hủy kết bạn
                socket.emit('friendListUpdate', {
                    type: 'unfriend',
                    email: targetEmail
                });
            } catch (error) {
                console.error('Unfriend error:', error);
            }
        });

        // Thêm xử lý sự kiện khi người dùng online/offline
        socket.on('userStatus', async (data) => {
            try {
                const { status } = data;
                const userEmail = socket.user.email;

                // Lấy danh sách bạn bè của người dùng
                const user = await User.getUserByEmail(userEmail);
                if (!user || !user.friends) return;

                // Gửi thông báo trạng thái cho tất cả bạn bè
                user.friends.forEach(friendEmail => {
                    const friendSockets = userSockets.get(friendEmail);
                    if (friendSockets) {
                        friendSockets.forEach(socketId => {
                            io.to(socketId).emit('friendStatusUpdate', {
                                email: userEmail,
                                online: status === 'online'
                            });
                        });
                    }
                });
            } catch (error) {
                console.error('User status update error:', error);
            }
        });

        // Xử lý sự kiện thu hồi tin nhắn
        socket.on('messageRecalled', async (data) => {
            try {
                const { messageId, receiverEmail, senderEmail } = data;
                console.log('Message recall request:', { messageId, receiverEmail, senderEmail });

                // Gửi thông báo cho tất cả các kết nối của người nhận
                const receiverSockets = userSockets.get(receiverEmail);
                if (receiverSockets) {
                    console.log('Sending recall notification to receiver:', receiverEmail);
                    receiverSockets.forEach(socketId => {
                        io.to(socketId).emit('messageRecalled', {
                            messageId,
                            senderEmail
                        });
                    });
                }

                // Gửi xác nhận cho người gửi
                socket.emit('messageRecallConfirmed', {
                    success: true,
                    messageId
                });
            } catch (error) {
                console.error('Message recall error:', error);
                socket.emit('messageRecallConfirmed', {
                    success: false,
                    error: error.message
                });
            }
        });

        // Xử lý sự kiện xóa tin nhắn
        socket.on('messageDeleted', async (data) => {
            try {
                const { messageId, receiverEmail } = data;
                console.log('Message delete request:', { messageId, receiverEmail });

                // Gửi thông báo cho tất cả các kết nối của người nhận
                const receiverSockets = userSockets.get(receiverEmail);
                if (receiverSockets) {
                    console.log('Sending delete notification to receiver:', receiverEmail);
                    receiverSockets.forEach(socketId => {
                        io.to(socketId).emit('messageDeleted', {
                            messageId
                        });
                    });
                }

                // Gửi xác nhận cho người gửi
                socket.emit('messageDeleteConfirmed', {
                    success: true,
                    messageId
                });
            } catch (error) {
                console.error('Message delete error:', error);
                socket.emit('messageDeleteConfirmed', {
                    success: false,
                    error: error.message
                });
            }
        });

        // Xử lý sự kiện reaction tin nhắn
        socket.on('messageReaction', async (data) => {
            try {
                const { messageId, reaction, receiverEmail } = data;
                const senderEmail = socket.user.email;
                console.log('Message reaction:', { messageId, reaction, senderEmail, receiverEmail });

                // Gửi thông báo cho tất cả các kết nối của người nhận
                const receiverSockets = userSockets.get(receiverEmail);
                if (receiverSockets) {
                    console.log('Sending reaction notification to receiver:', receiverEmail);
                    receiverSockets.forEach(socketId => {
                        io.to(socketId).emit('messageReaction', {
                            messageId,
                            reaction,
                            senderEmail
                        });
                    });
                }

                // Gửi xác nhận cho người gửi reaction
                socket.emit('messageReactionConfirmed', {
                    success: true,
                    messageId,
                    reaction
                });
            } catch (error) {
                console.error('Message reaction error:', error);
                socket.emit('messageReactionConfirmed', {
                    success: false,
                    error: error.message
                });
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