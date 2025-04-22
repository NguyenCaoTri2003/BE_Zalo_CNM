const Group = require('../models/group.model');
const User = require('../models/user.model');
const { v4: uuidv4 } = require('uuid');

class GroupController {
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

    // Update group details
    static async updateGroup(req, res) {
        try {
            const { groupId } = req.params;
            const { name, description, avatar } = req.body;
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
                description,
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
}

module.exports = GroupController; 