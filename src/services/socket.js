const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const Group = require('../models/group.model');
const { v4: uuidv4 } = require('uuid');

let io;
const userSockets = new Map(); // Lưu trữ socket connections của users
const groupRooms = new Map(); // Thêm biến để lưu trữ các phòng chat nhóm
const onlineUsers = new Map();

const initializeSocket = (server) => {
    io = socketIO(server, {
        cors: {
            origin: '*',
            
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
            allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With', '*'],
            // credentials: true,
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

        socket.on("register", (userId) => {
            socket.userId = userId;
            onlineUsers[userId] = socket.id;
            console.log(`User ${userId} connected with socket ${socket.id}`);
        });

        // Xử lý sự kiện tham gia nhóm chat
        socket.on('joinGroup', async (data) => {
            try {
                const { groupId } = data;
                console.log('User joining group:', userEmail, 'groupId:', groupId);
                
                // Tham gia vào phòng socket của nhóm
                socket.join(groupId);
                
                // Lưu thông tin phòng
                if (!groupRooms.has(groupId)) {
                    groupRooms.set(groupId, new Set());
                }
                groupRooms.get(groupId).add(socket.id);
                
                console.log('User joined group room:', groupId);
            } catch (error) {
                console.error('Join group error:', error);
            }
        });

        // Xử lý sự kiện thêm người khác vào nhóm
        socket.on('addMemberGroup', async ({ groupId, userId }) => {
            try {
                // Kiểm tra userId để xác nhận người cần vào nhóm là ai
                console.log(`User ${userId} đang join group ${groupId}`);
                
                // Cho phép user tham gia phòng nhóm (socket.join)
                socket.join(groupId);

                // Thêm vào danh sách phòng
                if (!groupRooms.has(groupId)) {
                    groupRooms.set(groupId, new Set());
                }
                groupRooms.get(groupId).add(socket.id);

                const user = await User.getUserById(userId); // Lấy thông tin tên/email
                const joinMessage = {
                    messageId: uuidv4(),
                    groupId,
                    senderId: 'system',
                    action: 'join',
                    senderEmail: 'system@chat.app',
                    content: `${user.fullName}`, // Hoặc `${user.name}` nếu có
                    type: 'system',
                    isDeleted: false,
                    isRecalled: false,
                    isSystem: true,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };

                await Group.addMessage(groupId, joinMessage);

                // ✅ Gửi cho các thành viên trong nhóm
                socket.to(groupId).emit('groupMessageJoin', joinMessage);

                console.log(`User ${userId} đã join group ${groupId}`);
            } catch (error) {
                console.error('Lỗi khi join group:', error);
            }
        });

        // Xử lý sự kiện gửi tin nhắn nhóm
        socket.on('groupMessage', async (data) => {
            try {
                const { groupId, message } = data;
                console.log('New group message:', {
                    groupId,
                    sender: userEmail,
                    messageId: message.messageId
                });

                // Gửi tin nhắn tới tất cả thành viên trong nhóm
                
                io.to(groupId).emit('newGroupMessage', {
                    groupId,
                    message: {
                        ...message,
                        //senderEmail: userEmail
                    }
                });

                // Gửi xác nhận lại cho người gửi
                console.log('🔥 Emit newGroupMessage đến group:', groupId, 'với message:', message);
                socket.emit('groupMessageSent', {
                    success: true,
                    messageId: message.messageId
                });
            } catch (error) {
                console.error('Group message error:', error);
                socket.emit('groupMessageSent', {
                    success: false,
                    error: error.message
                });
            }
        });

        // Xử lý sự kiện rời nhóm chat
        socket.on('leaveGroup', (data) => {
            try {
                const { groupId } = data;
                console.log('User leaving group:', userEmail, 'groupId:', groupId);
                
                // Rời khỏi phòng socket của nhóm
                socket.leave(groupId);
                
                // Xóa thông tin phòng
                if (groupRooms.has(groupId)) {
                    groupRooms.get(groupId).delete(socket.id);
                    if (groupRooms.get(groupId).size === 0) {
                        groupRooms.delete(groupId);
                    }
                }
                
                console.log('User left group room:', groupId);
            } catch (error) {
                console.error('Leave group error:', error);
            }
        });

        // Xử lý sự kiện rời nhóm web version
        socket.on('leaveGroupWeb', async (data) => {
            console.log('🔥 leaveGroupWeb event received!', data);
            try {
                const { groupId, userEmail } = data; // Thêm userEmail vào thông tin
                console.log('User leaving group web:', userEmail, 'groupId:', groupId);

                const user = await User.getUserByEmail(userEmail);

                const leaveMessage = {
                    messageId: uuidv4(),
                    groupId,
                    senderId: 'system',
                    senderEmail: 'system@chat.app',
                    content: `${user.fullName}`,
                    type: 'system',
                    action: 'leave',
                    isDeleted: false,
                    isRecalled: false,
                    isSystem: true,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                
                await Group.addMessage(groupId, leaveMessage);

                // Gửi thông báo cho các thành viên còn lại trong nhóm
                socket.to(groupId).emit('groupMessageLeave', leaveMessage);
               

                // Gửi thông báo cho các thành viên còn lại trong nhóm
                // socket.to(groupId).emit('groupMessageLeave', {
                //     type: 'system',
                //     content: `${userEmail} đã rời khỏi nhóm.`,
                //     groupId,
                //     timestamp: new Date().toISOString(),
                //     isSystem: true
                // });

                 // Rời khỏi phòng socket của nhóm
                socket.leave(groupId);

                // Xóa thông tin phòng (xử lý nhóm)
                if (groupRooms.has(groupId)) {
                    groupRooms.get(groupId).delete(socket.id);
                    if (groupRooms.get(groupId).size === 0) {
                        groupRooms.delete(groupId);
                    }
                }

                console.log('User left group room:', groupId);
            } catch (error) {
                console.error('Leave group error:', error);
            }
        });


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

        socket.on('withdrawFriendRequest', async (data) => {
            try {
                const { receiverEmail, senderEmail } = data;

                // Thực hiện logic thu hồi lời mời trong DB ở đây

                // Gửi thông báo cho người nhận lời mời rằng lời mời đã bị thu hồi
                const receiverSockets = userSockets.get(receiverEmail);
                if (receiverSockets) {
                receiverSockets.forEach(socketId => {
                    io.to(socketId).emit('friendRequestWithdrawn', {
                    senderEmail
                    });
                });
                }

                // Có thể gửi xác nhận cho người gửi (nếu cần)
                socket.emit('withdrawConfirmed', { success: true });
            } catch (error) {
                console.error('Error withdrawing friend request:', error);
                socket.emit('withdrawConfirmed', { success: false, error: error.message });
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
                            },
                            lastMessage: {
                                message: "Bạn đã trở thành bạn bè",
                                time: new Date(),
                                senderEmail: accepter.email
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
                            },
                            lastMessage: {
                                message: "Bạn đã trở thành bạn bè",
                                time: new Date(),
                                senderEmail: accepter.email
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

        //Thêm xử lý sự kiện khi người dùng online/offline
        socket.on('userStatus', async (data) => {
            try {
                const { status } = data;
                const userEmail = socket.user.email;
                

                // Lấy danh sách bạn bè của người dùng
                const user = await User.getUserByEmail(userEmail);
                if (!user || !user.friends) return;

                

                //Gửi thông báo trạng thái cho tất cả bạn bè
                user.friends.forEach(friendEmail => {

                    const friendSockets = userSockets.get(friendEmail);
                    console.log("📢 Gửi tới socket bạn bè:", friendEmail, friendSockets);
                    if (friendSockets) {
                        friendSockets.forEach(socketId => {
                            io.to(socketId).emit('friendStatusUpdate', {
                                email: userEmail,
                                online: status === 'online'
                            });
                        });
                    }
                    console.log('Gửi trạng thái tới:', friendEmail, 'Online:', status === 'online');
                });
                
            } catch (error) {
                console.error('User status update error:', error);
            }
        });

        
        // Xử lý sự kiện trạng thái online/offline từ web
        socket.on('userStatusWeb', async (data) => {
            const { status, email } = data;

            if (!email) return;

            if (status === "offline") {
                // Xóa socket khỏi danh sách user
                if (userSockets.has(email)) {
                    userSockets.get(email).delete(socket.id);
                    if (userSockets.get(email).size === 0) {
                        userSockets.delete(email);

                        // Gửi trạng thái offline đến bạn bè
                        const user = await User.getUserByEmail(email);
                        if (user?.friends) {
                            user.friends.forEach(friend => {
                                const friendEmail = typeof friend === 'string' ? friend : friend.email;
                                const friendSockets = userSockets.get(friendEmail);
                                if (friendSockets) {
                                    friendSockets.forEach(socketId => {
                                        io.to(socketId).emit('friendStatusUpdateWeb', {
                                            email,
                                            online: false
                                        });
                                    });
                                }
                            });
                        }
                    }
                }

                return; //Không xử lý tiếp nếu là offline
            }

            // Nếu là online – như cũ
            if (!userSockets.has(email)) {
                userSockets.set(email, new Set());
            }
            userSockets.get(email).add(socket.id);
            socket.user = { email };

            const user = await User.getUserByEmail(email);
            if (!user || !user.friends) return;

            const onlineFriends = [];
            user.friends.forEach(friend => {
                const friendEmail = typeof friend === 'string' ? friend : friend.email;
                const friendSockets = userSockets.get(friendEmail);
                if (friendSockets) {
                    friendSockets.forEach(socketId => {
                        io.to(socketId).emit('friendStatusUpdateWeb', {
                            email,
                            online: true
                        });
                    });
                    onlineFriends.push(friendEmail);
                }
            });

            // Gửi lại danh sách bạn bè online cho user
            socket.emit('initialFriendStatusesWeb', {
                friends: user.friends.map(f => typeof f === 'string' ? f : f.email),
                onlineFriends
            });
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

        // Xử lý xóa tin nhắn nhóm
        socket.on("recallGroupMessage", (data) => {
            const { groupId, messageId, senderEmail } = data;
            const groupSockets = groupRooms.get(groupId); // tuỳ cách bạn lưu
            if (groupSockets) {
                groupSockets.forEach(socketId => {
                    io.to(socketId).emit("recallGroupMessage", {
                        groupId,
                        messageId,
                        senderEmail,
                    });
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

        socket.on("groupMessageReaction", async (data) => {
            try {
                const { messageId, reaction, groupId } = data;
                const senderEmail = socket.user.email;

                console.log("📨 Group message reaction received:", { groupId, messageId, reaction });

                // Gửi cho tất cả trong nhóm (trừ người gửi)
                socket.to(groupId).emit("messageReaction", {
                    messageId,
                    reaction,
                    senderEmail
                });

                socket.emit("messageReactionConfirmed", {
                    success: true,
                    messageId,
                    reaction
                });
            } catch (error) {
                console.error("Group message reaction error:", error);
                socket.emit("messageReactionConfirmed", {
                    success: false,
                    error: error.message
                });
            }
        });

        // socket.on("register", (userId) => {
        //     onlineUsers[userId] = socket.id;
        //     console.log(`User ${userId} connected with socket ${socket.id}`);
        // });

        // socket.on("disconnect", () => {
        //     // Xóa user khỏi onlineUsers khi disconnect
        //     for (const [userId, socketId] of Object.entries(onlineUsers)) {
        //     if (socketId === socket.id) {
        //         delete onlineUsers[userId];
        //         break;
        //     }
        //     }
        // });

        socket.on("call-user", ({ fromUserId, toUserId }) => {
            const toSocketId = onlineUsers[toUserId];
            if (toSocketId) {
                console.log(`📞 ${fromUserId} đang gọi ${toUserId}`);
                io.to(toSocketId).emit("incoming-call", { fromUserId });
            } else {
                console.log(`❌ Không tìm thấy ${toUserId} online`);
            }
        });

        socket.on("call-declined", ({ fromUserId, toUserId }) => {
            const toSocketId = onlineUsers[fromUserId]; // A là người gọi
            if (toSocketId) {
                io.to(toSocketId).emit("call-declined", { fromUserId, toUserId });
            }
            console.log("📨 call-declined từ", toUserId, "về", fromUserId);
            console.log("📦 Socket của người gọi (fromUserId):", toSocketId);
        });

        socket.on("call-accepted", ({ fromUserId, toUserId }) => {
            const toSocketId = onlineUsers[fromUserId];
            if (toSocketId) {
                io.to(toSocketId).emit("call-accepted", { fromUserId, toUserId });
            }
        });

        socket.on("call-cancelled", ({ fromUserId, toUserId }) => {
            const toSocketId = onlineUsers[toUserId];

            if (toSocketId) {
                io.to(toSocketId).emit("call-cancelled", { fromUserId, toUserId });
            } else {
                console.log(`❌ Không tìm thấy ${toUserId} online để gửi thông báo hủy`);
            }
        });

        socket.on("call-ended", ({ roomId }) => {
            console.log("📩 Gọi call-ended với roomId:", roomId);
            console.log("🧑 socket.userId là:", socket.userId);

            const [user1, user2] = roomId.split("_");
            const currentUser = socket.userId;
            const otherUser = currentUser === user1 ? user2 : user1;

            const toSocketId = onlineUsers[otherUser]; 
            if (toSocketId) {
                io.to(toSocketId).emit("call-ended", { roomId });
                console.log(`📞 Cuộc gọi kết thúc - gửi đến ${otherUser}`);
            } else {
                console.log(`❌ Không tìm thấy người còn lại (${otherUser}) online`);
            }
        });

        socket.on('disconnect', async () => {
            const userEmail = socket.user?.email;
            console.log('Client disconnected:', userEmail);

            if (userEmail && userSockets.has(userEmail)) {
                userSockets.get(userEmail).delete(socket.id);

                if (userSockets.get(userEmail).size === 0) {
                    userSockets.delete(userEmail);

                    // Gửi thông báo offline đến bạn bè
                    try {
                        const user = await User.getUserByEmail(userEmail);
                        if (user?.friends) {
                            user.friends.forEach(friend => {
                                const friendEmail = typeof friend === 'string' ? friend : friend.email;
                                const friendSockets = userSockets.get(friendEmail);
                                if (friendSockets) {
                                    friendSockets.forEach(socketId => {
                                        io.to(socketId).emit('friendStatusUpdateWeb', {
                                            email: userEmail,
                                            online: false
                                        });
                                    });
                                }
                            });
                        }
                    } catch (error) {
                        console.error('Error notifying friends of disconnect:', error);
                    }
                }
            }

            // ✅ Xóa socket khỏi tất cả các phòng nhóm
            groupRooms.forEach((sockets, groupId) => {
                if (sockets.has(socket.id)) {
                    sockets.delete(socket.id);
                    if (sockets.size === 0) {
                        groupRooms.delete(groupId);
                    }
                }
            });
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