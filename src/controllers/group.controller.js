const Group = require('../models/group.model');
const User = require('../models/user.model');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const { s3, docClient: dynamoDB } = require('../config/aws.config');

// Cấu hình multer để lưu file trong memory
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // Giới hạn kích thước file 50MB
  },
  fileFilter: function (req, file, cb) {
    // Cho phép tất cả các loại file
    cb(null, true);
  }
});

class GroupController {
  // Middleware để xử lý upload file
  static uploadMiddleware = upload.single('file');

  // API upload file cho group
  static async uploadGroupFile(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Không có file được tải lên',
          error: 'NO_FILE'
        });
      }

      const { groupId } = req.params;
      const userId = req.user.userId || req.user.id;

      // Kiểm tra group tồn tại
      const group = await Group.getGroup(groupId);
      if (!group) {
        return res.status(404).json({
          success: false,
          message: 'Group không tồn tại'
        });
      }

      // Kiểm tra người dùng có phải là thành viên của group
      if (!group.members.includes(userId)) {
        return res.status(403).json({
          success: false,
          message: 'Bạn không phải là thành viên của group này'
        });
      }

      // Tạo tên file ngẫu nhiên
      const uniqueFilename = `${uuidv4()}${path.extname(req.file.originalname)}`;
      const fileType = req.file.mimetype;
      const isImage = fileType.startsWith('image/');

      // Xác định thư mục lưu trữ
      const folder = isImage ? 'group-images' : 'group-files';

      // Upload file lên S3
      const s3Params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `${folder}/${groupId}/${uniqueFilename}`,
        Body: req.file.buffer,
        ContentType: fileType,
        ACL: 'public-read'
      };

      const s3Response = await s3.upload(s3Params).promise();

      // Trả về thông tin file
      return res.status(200).json({
        success: true,
        data: {
          filename: uniqueFilename,
          originalname: req.file.originalname,
          mimetype: fileType,
          size: req.file.size,
          url: s3Response.Location,
          type: isImage ? 'image' : 'file'
        }
      });
    } catch (error) {
      console.error('Lỗi khi upload file:', error);
      return res.status(500).json({
        success: false,
        message: 'Lỗi khi upload file',
        error: error.message
      });
    }
  }

  // API lấy file của group
  static async getGroupFile(req, res) {
    try {
      const { groupId, filename } = req.params;
      const { type } = req.query; // 'image' hoặc 'file'
      const userId = req.user.userId || req.user.id;

      // Kiểm tra group tồn tại
      const group = await Group.getGroup(groupId);
      if (!group) {
        return res.status(404).json({
          success: false,
          message: 'Group không tồn tại'
        });
      }

      // Kiểm tra người dùng có phải là thành viên của group
      if (!group.members.includes(userId)) {
        return res.status(403).json({
          success: false,
          message: 'Bạn không phải là thành viên của group này'
        });
      }

      // Xác định thư mục dựa trên loại file
      const folder = type === 'image' ? 'group-images' : 'group-files';

      // Lấy file từ S3
      const s3Params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `${folder}/${groupId}/${filename}`
      };

      const s3Response = await s3.getObject(s3Params).promise();
      
      res.setHeader('Content-Type', s3Response.ContentType);
      res.setHeader('Content-Length', s3Response.ContentLength);
      res.send(s3Response.Body);
    } catch (error) {
      console.error('Lỗi khi lấy file:', error);
      return res.status(500).json({
        success: false,
        message: 'Lỗi khi lấy file',
        error: error.message
      });
    }
  }

    // Get all groups for the current user
    static async getGroups(req, res) {
        try {
            // Get userId from token
            const userId = req.user?.userId || req.user?.id;
            
            if (!userId) {
                console.error('User ID not found in token:', req.user);
                return res.status(400).json({
                    success: false,
                    message: 'User ID is required'
                });
            }

            console.log('Getting groups for user:', userId); // Debug log

            const groups = await Group.getGroupsByMember(userId);
            
            console.log('Found groups:', groups); // Debug log
            
            // Remove duplicate groups (since we store one record per member)
            const uniqueGroups = Array.from(new Map(groups.map(group => [group.groupId, group])).values());
            
            res.json({
                success: true,
                data: uniqueGroups
            });
        } catch (error) {
            console.error('Error getting groups:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Internal server error'
            });
        }
    }

    // Create a new group
    static async createGroup(req, res) {
        try {
            const { name, description, members = [], avatar } = req.body;
            
            // Lấy userId từ token đã decode
            const creatorId = req.user?.userId || req.user?.id;

            if (!creatorId) {
                console.error('Creator ID not found in token:', req.user);
                return res.status(400).json({
                    success: false,
                    message: 'Creator ID is required. Please check your authentication.'
                });
            }

            console.log('Creating group with creator:', creatorId); // Debug log

            // Validate members array
            if (!Array.isArray(members)) {
                return res.status(400).json({
                    success: false,
                    message: 'Members must be an array'
                });
            }

            // Chuyển đổi email thành userId
            const memberPromises = members.map(async (email) => {
                try {
                    const user = await User.getUserByEmail(email);
                    return user ? user.userId : null;
                } catch (error) {
                    console.error(`Error finding user with email ${email}:`, error);
                    return null;
                }
            });

            const memberIds = await Promise.all(memberPromises);
            const validMemberIds = memberIds.filter(id => id !== null);

            // Ensure creator is always an admin and included in members
            const groupData = {
                groupId: uuidv4(),
                name: name?.trim() || 'New Group',
                description: description?.trim() || '',
                avatar: avatar || 'https://res.cloudinary.com/ds4v3awds/image/upload/v1743944990/l2eq6atjnmzpppjqkk1j.jpg',
                creatorId: creatorId,
                members: [...new Set([creatorId, ...validMemberIds])],
                admins: [creatorId],
                messages: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            console.log('Group data before creation:', groupData); // Debug log

            const group = await Group.createGroup(groupData);

            console.log('Created group:', group); // Debug log

            res.status(201).json({
                success: true,
                data: group
            });
        } catch (error) {
            console.error('Error creating group:', error); // Debug log
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to create group'
            });
        }
    }

    // Get group details
    static async getGroup(req, res) {
        try {
            const { groupId } = req.params;
            const group = await Group.getGroup(groupId);
            console.log('Getting group details for groupId:', group); // Debug log

            if (!group) {
                return res.status(404).json({
                    success: false,
                    message: 'Group not found'
                });
            }

            res.json({
                success: true,
                data: group
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    static async getGroupMembers(req, res) {
        try {
            const { groupId } = req.params;
            const group = await Group.getGroup(groupId);
    
            if (!group || !group.members) {
                return res.status(404).json({
                    success: false,
                    message: 'Group or members not found'
                });
            }
    
            // Khởi tạo mảng memberDetails để lưu trữ kết quả
            const memberDetails = [];
    
            // Sử dụng vòng lặp for để xử lý từng thành viên
            for (const userId of group.members) {
                const user = await User.getUserById(userId);
                if (!user) {
                    // Nếu không tìm thấy user, có thể bỏ qua hoặc trả về null
                    memberDetails.push(null);
                    continue;  // Tiếp tục với thành viên tiếp theo
                }
    
                memberDetails.push({
                    userId: user.userId,
                    fullName: user.fullName,
                    avatar: user.avatar,
                    role: group.admins.includes(user.userId) ? 'admin' : 'member'
                });
            }
    
            // Loại bỏ các giá trị null nếu có
            const filteredMembers = memberDetails.filter(Boolean);
    
            // Trả về kết quả cuối cùng
            res.json({
                success: true,
                data: {
                    members: filteredMembers
                }
            });
    
            // In ra danh sách thành viên để debug
            console.log('Member Details:', filteredMembers);
    
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
    
    

    // Update group details
    static async updateGroup(req, res) {
        try {
            const { groupId } = req.params;
            const { name, avatar } = req.body;
            const userId = req.user.userId || req.user.id;

            const group = await Group.getGroup(groupId);
            if (!group) {
                return res.status(404).json({
                    success: false,
                    message: 'Group not found'
                });
            }

            if (!group.admins.includes(userId)) {
                return res.status(403).json({
                    success: false,
                    message: 'Only admins can update group details'
                });
            }

            const updatedGroup = await Group.updateGroup(groupId, {
                name,
                avatar: avatar || group.avatar,
                members: group.members,
                admins: group.admins
            });

            res.json({
                success: true,
                data: updatedGroup
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // Delete group
    static async deleteGroup(req, res) {
        try {
            const { groupId } = req.params;
            const userId = req.user.userId || req.user.id;

            const group = await Group.getGroup(groupId);
            if (!group) {
                return res.status(404).json({
                    success: false,
                    message: 'Group not found'
                });
            }

            if (group.creatorId !== userId) {
                return res.status(403).json({
                    success: false,
                    message: 'Only group creator can delete the group'
                });
            }

            await Group.deleteGroup(groupId);
            res.json({
                success: true,
                message: 'Group deleted successfully'
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // Add member to group
    static async addMember(req, res) {
        try {
            const { groupId } = req.params;
            const { memberId } = req.body;
            const userId = req.user.userId || req.user.id;

            const group = await Group.getGroup(groupId);
            if (!group) {
                return res.status(404).json({
                    success: false,
                    message: 'Group not found'
                });
            }

            if (!group.admins.includes(userId)) {
                return res.status(403).json({
                    success: false,
                    message: 'Only admins can add members'
                });
            }

            const updatedGroup = await Group.addMember(groupId, memberId);
            res.json({
                success: true,
                data: updatedGroup
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // Remove member from group
    static async removeMember(req, res) {
        try {
            const { groupId } = req.params;
            const { memberId } = req.body;
            const userId = req.user.userId || req.user.id;

            const group = await Group.getGroup(groupId);
            if (!group) {
                return res.status(404).json({
                    success: false,
                    message: 'Group not found'
                });
            }

            if (!group.admins.includes(userId)) {
                return res.status(403).json({
                    success: false,
                    message: 'Only admins can remove members'
                });
            }

            if (memberId === group.creatorId) {
                return res.status(403).json({
                    success: false,
                    message: 'Cannot remove group creator'
                });
            }

            const updatedGroup = await Group.removeMember(groupId, memberId);
            res.json({
                success: true,
                data: updatedGroup
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    //remove member web
    static removeMemberWeb = async (req, res) => {
        try {
            const { groupId, memberId } = req.params;
            const userId = req.user.userId || req.user.id;
    
            const group = await Group.getGroup(groupId);
            if (!group) {
                return res.status(404).json({ success: false, message: 'Group not found' });
            }
    
            if (!group.admins.includes(userId)) {
                return res.status(403).json({ success: false, message: 'Only admins can remove members' });
            }
    
            if (group.creatorId === memberId) {
                return res.status(403).json({ success: false, message: 'Cannot remove group creator' });
            }
    
            if (group.admins.includes(memberId)) {
                return res.status(403).json({ success: false, message: 'Cannot remove another admin' });
            }
    
            const updatedGroup = await Group.removeMember(groupId, memberId);
    
            res.json({ success: true, data: updatedGroup });
        } catch (error) {
            console.error('Error removing member:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    };

    // Add admin to group
    static async addAdmin(req, res) {
        try {
            const { groupId } = req.params;
            const { adminId } = req.body;
            const userId = req.user.userId || req.user.id;

            const group = await Group.getGroup(groupId);
            if (!group) {
                return res.status(404).json({
                    success: false,
                    message: 'Group not found'
                });
            }

            if (group.creatorId !== userId) {
                return res.status(403).json({
                    success: false,
                    message: 'Only group creator can add admins'
                });
            }

            const updatedGroup = await Group.addAdmin(groupId, adminId);
            res.json({
                success: true,
                data: updatedGroup
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // Remove admin from group
    static async removeAdmin(req, res) {
        try {
            const { groupId } = req.params;
            const { adminId } = req.query;
            const userId = req.user.userId || req.user.id;

            const group = await Group.getGroup(groupId);
            if (!group) {
                return res.status(404).json({
                    success: false,
                    message: 'Group not found'
                });
            }

            if (group.creatorId !== userId) {
                return res.status(403).json({
                    success: false,
                    message: 'Only group creator can remove admins'
                });
            }

            // Prevent removing the group creator as admin
            if (adminId === group.creatorId) {
                return res.status(403).json({
                    success: false,
                    message: 'Cannot remove group creator as admin'
                });
            }

            const updatedGroup = await Group.removeAdmin(groupId, adminId);
            res.json({
                success: true,
                data: updatedGroup
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // Send message to group
    static async sendGroupMessage(req, res) {
        try {
            const { groupId } = req.params;
            const { content, type = 'text', fileData } = req.body;
            const senderEmail = req.user.email;
            const senderId = req.user.userId || req.user.id;

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

            const message = {
                messageId: uuidv4(),
                groupId,
                senderId,
                senderEmail,
                content,
                type,
                ...fileData,
                isDeleted: false,
                isRecalled: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            const updatedGroup = await Group.addMessage(groupId, message);
            
            res.json({
                success: true,
                data: message
            });
        } catch (error) {
            console.error('Error sending group message:', error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // Get group messages
    static async getGroupMessages(req, res) {
        try {
            const { groupId } = req.params;
            const userId = req.user.userId || req.user.id;
            const userEmail = req.user.email;
            
            if (!userId) {
                return res.status(400).json({
                    success: false,
                    message: 'User ID is required'
                });
            }

            const group = await Group.getGroup(groupId);
            if (!group) {
                return res.status(404).json({
                    success: false,
                    message: 'Group not found'
                });
            }

            // Check if user is a member of the group
            if (!group.members.includes(userId)) {
                return res.status(403).json({
                    success: false,
                    message: 'You are not a member of this group'
                });
            }

            // Get messages from the group
            const messages = group.messages || [];
            
            // Sort messages by time (oldest first)
            const sortedMessages = messages.sort((a, b) => {
                const dateA = new Date(a.createdAt).getTime();
                const dateB = new Date(b.createdAt).getTime();
                return dateA - dateB;
            });

            res.json({
                success: true,
                data: {
                    messages: sortedMessages.map(msg => ({
                        ...msg,
                        isCurrentUser: msg.senderEmail === userEmail
                    }))
                }
            });
        } catch (error) {
            console.error('Error getting group messages:', error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // Get group members
    // static async getGroupMembers(req, res) {
    //     try {
    //         const { groupId } = req.params;
    //         const userId = req.user.userId || req.user.id;
    //         const userEmail = req.user.email;

    //         const group = await Group.getGroup(groupId);
    //         if (!group) {
    //             return res.status(404).json({
    //                 success: false,
    //                 message: 'Group not found'
    //             });
    //         }

    //         // Check if user is a member of the group
    //         if (!group.members.includes(userId)) {
    //             return res.status(403).json({
    //                 success: false,
    //                 message: 'You are not a member of this group'
    //             });
    //         }

    //         // Get all member details
    //         const memberDetails = await Promise.all(
    //             group.members.map(async (memberId) => {
    //                 const user = await User.getUserById(memberId);
    //                 return {
    //                     email: user.email,
    //                     fullName: user.fullName,
    //                     avatar: user.avatar,
    //                     role: group.admins.includes(memberId) ? 'admin' : 'member',
    //                     joinedAt: group.createdAt // Since we don't track join date separately
    //                 };
    //             })
    //         );

    //         return res.json({
    //             success: true,
    //             data: {
    //                 members: memberDetails
    //             }
    //         });
    //     } catch (error) {
    //         console.error('Error getting group members:', error);
    //         return res.status(500).json({
    //             success: false,
    //             message: 'Internal server error'
    //         });
    //     }
    // }

    // Add reaction to group message
    static async addReactionToGroupMessage(req, res) {
        try {
            const { groupId } = req.params;
            const { messageId } = req.params;
            const { reaction } = req.body;
            const userId = req.user.userId || req.user.id;
            const userEmail = req.user.email;

            const group = await Group.getGroup(groupId);
            if (!group) {
                return res.status(404).json({
                    success: false,
                    message: 'Group not found'
                });
            }

            // Check if user is a member of the group
            if (!group.members.includes(userId)) {
                return res.status(403).json({
                    success: false,
                    message: 'You are not a member of this group'
                });
            }

            // Find the message
            const messageIndex = group.messages.findIndex(msg => msg.messageId === messageId);
            if (messageIndex === -1) {
                return res.status(404).json({
                    success: false,
                    message: 'Message not found'
                });
            }

            const message = group.messages[messageIndex];
            
            // Initialize reactions array if it doesn't exist
            if (!message.reactions) {
                message.reactions = [];
            }

            // Check if user already reacted with this emoji
            const existingReactionIndex = message.reactions.findIndex(
                r => r.senderEmail === userEmail && r.reaction === reaction
            );

            if (existingReactionIndex !== -1) {
                // Remove reaction if it already exists
                message.reactions.splice(existingReactionIndex, 1);
            } else {
                // Add new reaction
                message.reactions.push({
                    messageId,
                    reaction,
                    senderEmail: userEmail
                });
            }

            // Update the message in the group
            const params = {
                TableName: 'Groups',
                Key: { groupId },
                UpdateExpression: 'SET messages = :messages',
                ExpressionAttributeValues: {
                    ':messages': group.messages
                },
                ReturnValues: 'ALL_NEW'
            };

            const result = await dynamoDB.update(params).promise();

            return res.json({
                success: true,
                data: message
            });
        } catch (error) {
            console.error('Error adding reaction to group message:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }

    // Forward message to another group
    static async forwardMessage(req, res) {
        try {
            const { groupId } = req.params;
            const { messageId, targetGroupId } = req.body;
            const userId = req.user.userId || req.user.id;
            const userEmail = req.user.email;

            // Get source group
            const sourceGroup = await Group.getGroup(groupId);
            if (!sourceGroup) {
                return res.status(404).json({
                    success: false,
                    message: 'Source group not found'
                });
            }

            // Get target group
            const targetGroup = await Group.getGroup(targetGroupId);
            if (!targetGroup) {
                return res.status(404).json({
                    success: false,
                    message: 'Target group not found'
                });
            }

            // Check if user is a member of both groups
            if (!sourceGroup.members.includes(userId) || !targetGroup.members.includes(userId)) {
                return res.status(403).json({
                    success: false,
                    message: 'You must be a member of both groups to forward messages'
                });
            }

            // Find the message in source group
            const sourceMessage = sourceGroup.messages.find(msg => msg.messageId === messageId);
            if (!sourceMessage) {
                return res.status(404).json({
                    success: false,
                    message: 'Message not found'
                });
            }

            // Create forwarded message
            const forwardedMessage = {
                messageId: uuidv4(),
                groupId: targetGroupId,
                senderId: userId,
                senderEmail: userEmail,
                content: sourceMessage.content,
                type: sourceMessage.type,
                metadata: sourceMessage.metadata,
                isForwarded: true,
                originalMessageId: messageId,
                originalGroupId: groupId,
                isDeleted: false,
                isRecalled: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            // Add message to target group
            const updatedTargetGroup = await Group.addMessage(targetGroupId, forwardedMessage);

            return res.json({
                success: true,
                data: forwardedMessage
            });
        } catch (error) {
            console.error('Error forwarding message:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }

    // Recall message
    static async recallMessage(req, res) {
        try {
            const { groupId } = req.params;
            const { messageId } = req.params;
            const userId = req.user.userId || req.user.id;

            const group = await Group.getGroup(groupId);
            if (!group) {
                return res.status(404).json({
                    success: false,
                    message: 'Group not found'
                });
            }

            // Check if user is a member of the group
            if (!group.members.includes(userId)) {
                return res.status(403).json({
                    success: false,
                    message: 'You are not a member of this group'
                });
            }

            // Find the message
            const messageIndex = group.messages.findIndex(msg => msg.messageId === messageId);
            if (messageIndex === -1) {
                return res.status(404).json({
                    success: false,
                    message: 'Message not found'
                });
            }

            const message = group.messages[messageIndex];

            // Check if user is admin or the sender of the message
            const isAdmin = group.admins && group.admins.includes(userId);
            const isSender = message.senderId === userId;
            
            // Check if message is within recall time limit (2 minutes)
            const messageTime = new Date(message.createdAt);
            const currentTime = new Date();
            const timeDiff = (currentTime - messageTime) / 1000 / 60; // Convert to minutes
            
            if (!isAdmin && !isSender) {
                return res.status(403).json({
                    success: false,
                    message: 'Bạn không có quyền thu hồi tin nhắn này'
                });
            }

            if (!isAdmin && timeDiff > 2) {
                return res.status(403).json({
                    success: false,
                    message: 'Chỉ có thể thu hồi tin nhắn trong vòng 2 phút'
                });
            }

            // Mark message as recalled
            message.isRecalled = true;
            message.updatedAt = new Date().toISOString();

            // Update the message in the group
            const params = {
                TableName: 'Groups',
                Key: { groupId },
                UpdateExpression: 'SET messages = :messages',
                ExpressionAttributeValues: {
                    ':messages': group.messages
                },
                ReturnValues: 'ALL_NEW'
            };

            const result = await dynamoDB.update(params).promise();

            return res.json({
                success: true,
                data: message
            });
        } catch (error) {
            console.error('Error recalling message:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }

    // Update group information (name, avatar)
    static async updateGroupInfo(req, res) {
        try {
            const { groupId } = req.params;
            const { name } = req.body;
            const userId = req.user.userId || req.user.id;

            // Kiểm tra nhóm tồn tại
            const group = await Group.getGroup(groupId);
            if (!group) {
                return res.status(404).json({
                    success: false,
                    message: 'Group not found'
                });
            }

            // Kiểm tra quyền admin
            if (!group.admins.includes(userId)) {
                return res.status(403).json({
                    success: false,
                    message: 'Only admins can update group details'
                });
            }

            // Xử lý upload avatar nếu có
            let avatarUrl = group.avatar;
            if (req.file) {
                const uniqueFilename = `${uuidv4()}${path.extname(req.file.originalname)}`;
                const fileType = req.file.mimetype;
                const isImage = fileType.startsWith('image/');

                // Xác định thư mục lưu trữ
                const folder = 'group-avatars';

                // Upload file lên S3
                const s3Params = {
                    Bucket: process.env.AWS_BUCKET_NAME,
                    Key: `${folder}/${groupId}/${uniqueFilename}`,
                    Body: req.file.buffer,
                    ContentType: fileType,
                    ACL: 'public-read'
                };

                const s3Response = await s3.upload(s3Params).promise();
                avatarUrl = s3Response.Location;
            }

            // Cập nhật thông tin nhóm
            const updatedGroup = await Group.updateGroup(groupId, {
                name: name || group.name,
                description: group.description,
                avatar: avatarUrl,
                members: group.members,
                admins: group.admins
            });

            res.json({
                success: true,
                data: updatedGroup
            });
        } catch (error) {
            console.error('Error updating group info:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to update group information'
            });
        }
    }
}

module.exports = GroupController; 