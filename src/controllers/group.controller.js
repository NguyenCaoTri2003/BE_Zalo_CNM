const Group = require('../models/group.model');
const User = require('../models/user.model');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const { s3, docClient: dynamoDB } = require('../config/aws.config');
const Message = require('../models/message.model');

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
                allowMemberInvite: false, // Mặc định không cho phép thành viên thêm người khác
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

    // Get group members
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
    
            const memberDetails = [];
    
            for (const userId of group.members) {
                const user = await User.getUserById(userId);
                if (!user) {
                    console.log('User not found for ID:', userId);
                    continue;
                }
    
                let role = 'member';
                if (group.admins.includes(userId)) {
                    role = 'admin';
                } else if (group.deputies && group.deputies.includes(userId)) {
                    role = 'deputy';
                }
    
                memberDetails.push({
                    userId: user.userId,
                    email: user.email,
                    fullName: user.fullName,
                    avatar: user.avatar,
                    role: role,
                    joinedAt: group.createdAt
                });
            }
    
            const filteredMembers = memberDetails.filter(Boolean);
    
            res.json({
                success: true,
                data: {
                    members: filteredMembers
                }
            });
    
            console.log('Member Details:', filteredMembers);
    
        } catch (error) {
            console.error('Error in getGroupMembers:', error);
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

            const isCreator = group.creatorId === userId;
            const isAdmin = group.admins?.includes(userId);

            if (!isCreator && !isAdmin) {
                return res.status(403).json({
                    success: false,
                    message: 'Chỉ có admin hoặc người tạo nhóm mới có quyền xóa nhóm'
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

    // Toggle member invitation permission
    static async toggleMemberInvite(req, res) {
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

            // Chỉ admin mới có quyền thay đổi cài đặt này
            if (!group.admins.includes(userId)) {
                return res.status(403).json({
                    success: false,
                    message: 'Chỉ admin mới có quyền thay đổi cài đặt này'
                });
            }

            // Đảo ngược trạng thái allowMemberInvite
            

            console.log("✅ Trước khi cập nhật:", group.allowMemberInvite);

            const currentInviteSetting = typeof group.allowMemberInvite === 'boolean' ? group.allowMemberInvite : false;

            const updatedGroup = await Group.updateGroup(groupId, {
                ...group,
                allowMemberInvite: !currentInviteSetting
            });

            console.log("✅ Sau khi cập nhật:", updatedGroup.allowMemberInvite);

            res.json({
                success: true,
                data: updatedGroup
            });
        } catch (error) {
            console.error('Error toggling member invite permission:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to update member invite permission'
            });
        }
    }

    // Add member to group (updated with permission check)
    static async addMember(req, res) {
        try {
            const { groupId } = req.params;
            const { memberIds } = req.body;
            const userId = req.user.userId || req.user.id;

            console.log('Adding members to group:', { groupId, memberIds, userId });

            const group = await Group.getGroup(groupId);
            if (!group) {
                return res.status(404).json({
                    success: false,
                    message: 'Group not found'
                });
            }

            // Kiểm tra quyền thêm thành viên
            const isAdmin = group.admins.includes(userId);
            const canInvite = group.allowMemberInvite;

            if (!isAdmin && !canInvite) {
                return res.status(403).json({
                    success: false,
                    message: 'Bạn không có quyền thêm thành viên vào nhóm này'
                });
            }

            // Kiểm tra xem memberIds có phải là mảng không
            if (!Array.isArray(memberIds)) {
                return res.status(400).json({
                    success: false,
                    message: 'memberIds must be an array'
                });
            }

            // Lọc bỏ các ID không hợp lệ
            const validMemberIds = memberIds.filter(id => id && typeof id === 'string');
            
            if (validMemberIds.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No valid member IDs provided'
                });
            }

            // Thêm nhiều thành viên cùng lúc
            const updatedGroup = await Group.addMembers(groupId, validMemberIds);
            console.log('Updated group after adding members:', updatedGroup);

            res.json({
                success: true,
                data: updatedGroup
            });
        } catch (error) {
            console.error('Error adding members:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to add members'
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
    
            // if (group.creatorId === memberId) {
            //     return res.status(403).json({ success: false, message: 'Cannot remove group creator' });
            // }
    
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
            const { memberId } = req.body;
            const userId = req.user.userId || req.user.id;

            const group = await Group.getGroup(groupId);
            if (!group) {
                return res.status(404).json({
                    success: false,
                    message: 'Group not found'
                });
            }

            // Kiểm tra người thực hiện có phải là admin hiện tại không
            if (!group.admins.includes(userId)) {
                return res.status(403).json({
                    success: false,
                    message: 'Chỉ admin hiện tại mới có thể chuyển quyền'
                });
            }

            // Kiểm tra người được chọn có phải là thành viên của nhóm không
            if (!group.members.includes(memberId)) {
                return res.status(400).json({
                    success: false,
                    message: 'Người được chọn không phải là thành viên của nhóm'
                });
            }

            // Xóa quyền admin của người hiện tại và thêm quyền admin cho người mới
            const updatedGroup = await Group.updateGroup(groupId, {
                ...group,
                admins: [memberId] // Chỉ giữ lại 1 admin duy nhất
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

    //add admin web version
    static async addAdminWeb(req, res) {
        try {
            const { groupId } = req.params;
            const { memberId } = req.body;
            const userId = req.user.userId || req.user.id;

            const group = await Group.getGroup(groupId);
            if (!group) {
                return res.status(404).json({ success: false, message: 'Group not found' });
            }

            if (!group.admins.includes(userId)) {
                return res.status(403).json({ success: false, message: 'Chỉ admin hiện tại mới có thể chuyển quyền' });
            }

            if (!group.members.includes(memberId)) {
                return res.status(400).json({ success: false, message: 'Người được chọn không phải là thành viên của nhóm' });
            }

            // Cập nhật cả admin và creatorId
            const updatedGroup = await Group.updateGroup(groupId, {
                ...group,
                admins: [memberId],        // B trở thành admin duy nhất
                creatorId: memberId        // Đồng thời là người tạo nhóm
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


    // Remove admin from group
    static async removeAdmin(req, res) {
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

            // Kiểm tra người thực hiện có phải là admin hiện tại không
            if (!group.admins.includes(userId)) {
                return res.status(403).json({
                    success: false,
                    message: 'Chỉ admin hiện tại mới có thể chuyển quyền'
                });
            }

            // Prevent removing the group creator as admin
            if (memberId === group.creatorId) {
                return res.status(403).json({
                    success: false,
                    message: 'Không thể xóa quyền admin của người tạo nhóm'
                });
            }

            // Xóa quyền admin của người được chọn
            const updatedGroup = await Group.updateGroup(groupId, {
                ...group,
                admins: group.admins.filter(id => id !== memberId)
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
    //removeadmin web
    static async removeAdminWeb(req, res) {
        try {
            const { groupId } = req.params;
            const { memberId } = req.query;
            const userId = req.user.userId || req.user.id;

            const group = await Group.getGroup(groupId);
            if (!group) {
                return res.status(404).json({
                    success: false,
                    message: 'Group not found'
                });
            }

            // Kiểm tra người thực hiện có phải là admin hiện tại không
            if (!group.admins.includes(userId)) {
                return res.status(403).json({
                    success: false,
                    message: 'Chỉ admin hiện tại mới có thể chuyển quyền'
                });
            }

            // Prevent removing the group creator as admin
            if (memberId === group.creatorId) {
                return res.status(403).json({
                    success: false,
                    message: 'Không thể xóa quyền admin của người tạo nhóm'
                });
            }

            // Xóa quyền admin của người được chọn
            const updatedGroup = await Group.updateGroup(groupId, {
                ...group,
                admins: group.admins.filter(id => id !== memberId)
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

    // Forward message
    static async forwardMessage(req, res) {
        try {
            const { groupId, messageId } = req.params;
            const { targetGroupId, targetEmail } = req.body;
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

            // Find the message in source group
            const sourceMessage = sourceGroup.messages.find(msg => msg.messageId === messageId);
            if (!sourceMessage) {
                return res.status(404).json({
                    success: false,
                    message: 'Message not found'
                });
            }

            // Check if user is a member of source group
            if (!sourceGroup.members.includes(userId)) {
                return res.status(403).json({
                    success: false,
                    message: 'You must be a member of the source group to forward messages'
                });
            }

            // Handle forwarding to group
            if (targetGroupId) {
                const targetGroup = await Group.getGroup(targetGroupId);
                if (!targetGroup) {
                    return res.status(404).json({
                        success: false,
                        message: 'Target group not found'
                    });
                }

                // Check if user is a member of target group
                if (!targetGroup.members.includes(userId)) {
                    return res.status(403).json({
                        success: false,
                        message: 'You must be a member of the target group to forward messages'
                    });
                }

                // Create forwarded message for group
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
                await Group.addMessage(targetGroupId, forwardedMessage);

                return res.json({
                    success: true,
                    data: forwardedMessage
                });
            }
            // Handle forwarding to friend
            else if (targetEmail) {
                // Check if target user exists
                const targetUser = await User.getUserByEmail(targetEmail);
                if (!targetUser) {
                    return res.status(404).json({
                        success: false,
                        message: 'Target user not found'
                    });
                }

                // Create forwarded message for friend
                const forwardedMessage = {
                    messageId: uuidv4(),
                    senderId: userId,
                    senderEmail: userEmail,
                    receiverEmail: targetEmail,
                    content: sourceMessage.content,
                    type: sourceMessage.type,
                    metadata: sourceMessage.metadata,
                    isForwarded: true,
                    originalMessageId: messageId,
                    originalGroupId: groupId,
                    isDeleted: false,
                    isRecalled: false,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    status: 'sent'
                };

                try {
                    // Add message to conversation
                    const savedMessage = await Message.create(forwardedMessage);

                    // Emit socket event for real-time update
                    const io = req.app.get('io');
                    if (io) {
                        io.to(targetEmail).emit('newMessage', savedMessage);
                        io.to(userEmail).emit('newMessage', savedMessage);
                    }

                    return res.json({
                        success: true,
                        data: savedMessage
                    });
                } catch (error) {
                    console.error('Error adding forwarded message:', error);
                    return res.status(500).json({
                        success: false,
                        message: 'Error forwarding message to friend'
                    });
                }
            }
            else {
                return res.status(400).json({
                    success: false,
                    message: 'Either targetGroupId or targetEmail must be provided'
                });
            }
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

            const group = await Group.getGroup(groupId);
            if (!group) {
                return res.status(404).json({
                    success: false,
                    message: 'Group not found'
                });
            }

            // Kiểm tra quyền admin hoặc deputy
            const isAdmin = group.admins.includes(userId);
            const isDeputy = group.deputies && group.deputies.includes(userId);
            
            if (!isAdmin && !isDeputy) {
                return res.status(403).json({
                    success: false,
                    message: 'Chỉ trưởng nhóm hoặc phó trưởng nhóm mới có thể cập nhật thông tin nhóm'
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

    // Leave group
    static async leaveGroup(req, res) {
        try {
            const { groupId } = req.params;
            const userId = req.user.userId || req.user.id;

            console.log('User attempting to leave group:', { userId, groupId }); // Debug log

            const group = await Group.getGroup(groupId);
            if (!group) {
                return res.status(404).json({
                    success: false,
                    message: 'Group not found'
                });
            }

            // Kiểm tra người dùng có phải là thành viên của nhóm không
            if (!group.members.includes(userId)) {
                return res.status(403).json({
                    success: false,
                    message: 'Bạn không phải là thành viên của nhóm này'
                });
            }

            // Xóa người dùng khỏi danh sách thành viên và admin
            const updatedGroup = await Group.updateGroup(groupId, {
                ...group,
                members: group.members.filter(id => id !== userId),
                admins: group.admins.filter(id => id !== userId)
            });

            console.log('User successfully left group:', { userId, groupId }); // Debug log

            res.json({
                success: true,
                data: updatedGroup
            });
        } catch (error) {
            console.error('Error leaving group:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to leave group'
            });
        }
    }

    // Leave group (web version)
    // static async leaveGroupWeb(req, res) {
    //     try {
    //         const { groupId } = req.params;
    //         const userId = req.user.userId || req.user.id;

    //         const group = await Group.getGroup(groupId);
    //         if (!group) {
    //             return res.status(404).json({
    //                 success: false,
    //                 message: 'Group not found'
    //             });
    //         }

    //         // Kiểm tra xem user có phải thành viên không
    //         if (!group.members.includes(userId)) {
    //             return res.status(403).json({
    //                 success: false,
    //                 message: 'Bạn không phải là thành viên của nhóm này'
    //             });
    //         }

    //         // Nếu nhóm chỉ còn 3 thành viên => không cho phép rời
    //         if (group.members.length <= 3) {
    //             return res.status(400).json({
    //                 success: false,
    //                 message: 'Nhóm còn 3 thành viên hoặc ít hơn, không thể rời nhóm'
    //             });
    //         }

    //         // Gỡ khỏi danh sách thành viên
    //         group.members = group.members.filter(id => id !== userId);

    //         // Gỡ khỏi danh sách admin nếu cần
    //         if (group.admins.includes(userId)) {
    //             group.admins = group.admins.filter(id => id !== userId);

    //             // Nếu không còn admin nào sau khi rời, chọn người mới làm admin
    //             if (group.admins.length === 0 && group.members.length > 0) {
    //                 const newAdminId = group.members[Math.floor(Math.random() * group.members.length)];
    //                 group.admins.push(newAdminId);
    //             }
    //         }

    //         // Gỡ khỏi danh sách phó nhóm (deputies) nếu có
    //         if (group.deputies && group.deputies.includes(userId)) {
    //             group.deputies = group.deputies.filter(id => id !== userId);
    //         }

    //         // Nếu là người tạo nhóm (creator)
    //         if (group.creatorId === userId) {
    //             if (group.members.length > 0) {
    //                 // Chuyển quyền creator cho thành viên ngẫu nhiên
    //                 const newCreatorId = group.members[Math.floor(Math.random() * group.members.length)];
    //                 group.creatorId = newCreatorId;

    //                 // Đảm bảo creator mới là admin
    //                 if (!group.admins.includes(newCreatorId)) {
    //                     group.admins.push(newCreatorId);
    //                 }
    //             } else {
    //                 // Nếu không còn ai trong nhóm, để creatorId null (hoặc giữ nguyên nếu cần)
    //                 group.creatorId = null;
    //             }
    //         }

    //         // Lưu cập nhật
    //         const updatedGroup = await Group.updateGroup(groupId, group);

    //         return res.json({
    //             success: true,
    //             message: 'Rời nhóm thành công',
    //             data: updatedGroup
    //         });

    //     } catch (error) {
    //         console.error('Error leaving group:', error);
    //         return res.status(500).json({
    //             success: false,
    //             message: error.message || 'Đã xảy ra lỗi khi rời nhóm'
    //         });
    //     }
    // }

    static async leaveGroupWeb(req, res) {
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

            // Kiểm tra người dùng có phải là thành viên của nhóm không
            if (!group.members.includes(userId)) {
            return res.status(403).json({
                success: false,
                message: 'Bạn không phải là thành viên của nhóm này'
            });
            }

            // Loại bỏ người dùng khỏi danh sách thành viên
            group.members = group.members.filter(id => id !== userId);

            // Nếu người dùng là admin
            if (group.admins.includes(userId)) {
            group.admins = group.admins.filter(id => id !== userId);

            // Nếu còn thành viên khác, chọn ngẫu nhiên một người làm admin
                if (group.members.length > 0) {
                    const newAdminId = group.members[Math.floor(Math.random() * group.members.length)];
                    group.admins.push(newAdminId);
                }
            }

            // Nếu người dùng là phó nhóm
            if (group.deputies && group.deputies.includes(userId)) {
            group.deputies = group.deputies.filter(id => id !== userId);
            }

            const updatedGroup = await Group.updateGroup(groupId, group);

            res.json({
            success: true,
            data: updatedGroup
            });
        } catch (error) {
            console.error('Error leaving group:', error);
            res.status(500).json({
            success: false,
            message: error.message || 'Failed to leave group'
            });
        }
    }


    // Add deputy to group
    static async addDeputy(req, res) {
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

            // Kiểm tra người thực hiện có phải là admin không
            if (!group.admins.includes(userId)) {
                return res.status(403).json({
                    success: false,
                    message: 'Chỉ admin mới có thể thêm phó trưởng nhóm'
                });
            }

            // Kiểm tra người được chọn có phải là thành viên của nhóm không
            if (!group.members.includes(memberId)) {
                return res.status(400).json({
                    success: false,
                    message: 'Người được chọn không phải là thành viên của nhóm'
                });
            }

            // Kiểm tra người được chọn đã là admin chưa
            if (group.admins.includes(memberId)) {
                return res.status(400).json({
                    success: false,
                    message: 'Người được chọn đã là trưởng nhóm'
                });
            }

            // Thêm phó trưởng nhóm
            const updatedGroup = await Group.addDeputy(groupId, memberId);

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

    // Remove deputy from group
    static async removeDeputy(req, res) {
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

            // Kiểm tra người thực hiện có phải là admin không
            if (!group.admins.includes(userId)) {
                return res.status(403).json({
                    success: false,
                    message: 'Chỉ admin mới có thể xóa phó trưởng nhóm'
                });
            }

            // Xóa phó trưởng nhóm
            const updatedGroup = await Group.removeDeputy(groupId, memberId);

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

    // Remove deputy from group
    static async removeDeputyWeb(req, res) {
        try {
            const { groupId } = req.params;
            const { memberId } = req.query;
            const userId = req.user.userId || req.user.id;

            const group = await Group.getGroup(groupId);
            if (!group) {
                return res.status(404).json({
                    success: false,
                    message: 'Group not found'
                });
            }

            // Kiểm tra người thực hiện có phải là admin không
            if (!group.admins.includes(userId)) {
                return res.status(403).json({
                    success: false,
                    message: 'Chỉ admin mới có thể xóa phó trưởng nhóm'
                });
            }

            // Xóa phó trưởng nhóm
            const updatedGroup = await Group.removeDeputy(groupId, memberId);

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

    // Update member role
    static async updateMemberRole(req, res) {
        try {
            const { groupId, memberId } = req.params;
            const { role } = req.body;
            const userId = req.user.userId || req.user.id;

            const group = await Group.getGroup(groupId);
            if (!group) {
                return res.status(404).json({
                    success: false,
                    message: 'Group not found'
                });
            }

            // Kiểm tra người thực hiện có phải là admin không
            if (!group.admins.includes(userId)) {
                return res.status(403).json({
                    success: false,
                    message: 'Chỉ admin mới có thể thay đổi vai trò thành viên'
                });
            }

            // Kiểm tra người được chọn có phải là thành viên của nhóm không
            if (!group.members.includes(memberId)) {
                return res.status(400).json({
                    success: false,
                    message: 'Người được chọn không phải là thành viên của nhóm'
                });
            }

            // Không cho phép thay đổi vai trò của người tạo nhóm
            if (memberId === group.creatorId) {
                return res.status(403).json({
                    success: false,
                    message: 'Không thể thay đổi vai trò của người tạo nhóm'
                });
            }

            let updatedGroup;
            switch (role) {
                case 'admin':
                    // Cập nhật danh sách admin, chỉ giữ lại 1 admin duy nhất
                    updatedGroup = await Group.updateGroup(groupId, {
                        ...group,
                        admins: [memberId] // Chỉ giữ lại 1 admin duy nhất
                    });
                    break;
                case 'deputy':
                    // Thêm vào danh sách deputy
                    updatedGroup = await Group.addDeputy(groupId, memberId);
                    break;
                case 'member':
                    // Xóa khỏi danh sách admin và deputy
                    updatedGroup = await Group.removeAdmin(groupId, memberId);
                    updatedGroup = await Group.removeDeputy(groupId, memberId);
                    break;
                default:
                    return res.status(400).json({
                        success: false,
                        message: 'Vai trò không hợp lệ'
                    });
            }

            res.json({
                success: true,
                data: updatedGroup
            });
        } catch (error) {
            console.error('Error updating member role:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to update member role'
            });
        }
    }

    // Delete message for current user only
    static async deleteMessageForUser(req, res) {
        try {
            const { groupId, messageId } = req.params;
            const userId = req.user.userId || req.user.id;
            const userEmail = req.user.email;

            const group = await Group.getGroup(groupId);
            if (!group) {
                return res.status(404).json({
                    success: false,
                    message: 'Group not found'
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

            // Initialize deletedFor array if it doesn't exist
            if (!message.deletedFor) {
                message.deletedFor = [];
            }

            // Add user to deletedFor array if not already there
            if (!message.deletedFor.includes(userEmail)) {
                message.deletedFor.push(userEmail);
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

            await dynamoDB.update(params).promise();

            return res.json({
                success: true,
                message: 'Message deleted for current user'
            });
        } catch (error) {
            console.error('Error deleting message for user:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }

    static async hideAllGroupMessagesForUser(req, res) {
        try {
            const { groupId } = req.params;
            const userEmail = req.user.email;

            const group = await Group.getGroup(groupId);
            if (!group) {
                return res.status(404).json({
                    success: false,
                    message: 'Group not found'
                });
            }

            // Duyệt tất cả tin nhắn và thêm userEmail vào deletedFor nếu chưa có
            for (const message of group.messages) {
                if (!message.deletedFor) {
                    message.deletedFor = [];
                }

                if (!message.deletedFor.includes(userEmail)) {
                    message.deletedFor.push(userEmail);
                }
            }

            // Cập nhật lại toàn bộ messages
            const params = {
                TableName: 'Groups',
                Key: { groupId },
                UpdateExpression: 'SET messages = :messages',
                ExpressionAttributeValues: {
                    ':messages': group.messages
                },
                ReturnValues: 'ALL_NEW'
            };

            await dynamoDB.update(params).promise();

            return res.json({
                success: true,
                message: 'Đã ẩn toàn bộ tin nhắn nhóm cho bạn'
            });
        } catch (error) {
            console.error('Lỗi khi ẩn tất cả tin nhắn nhóm:', error);
            return res.status(500).json({
                success: false,
                message: 'Lỗi server'
            });
        }
    }
}

module.exports = GroupController; 