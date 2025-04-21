const Group = require('../models/group.model');
const { v4: uuidv4 } = require('uuid');

class GroupController {
    // Create a new group
    static async createGroup(req, res) {
        try {
            const { name, description, members = [] } = req.body;
            
            // Lấy userId từ token đã decode
            const creatorId = req.user.userId || req.user.id;

            if (!creatorId) {
                return res.status(400).json({
                    success: false,
                    message: 'Creator ID is required. Please check your authentication.'
                });
            }

            console.log('Creating group with creator:', creatorId); // Debug log

            // Filter out null or undefined members
            const validMembers = Array.isArray(members) 
                ? members.filter(member => member != null)
                : [];

            // Ensure creator is always an admin and included in members
            const groupData = {
                groupId: uuidv4(),
                name: name || 'New Group',
                description: description || '',
                creatorId: creatorId,
                members: [...new Set([creatorId, ...validMembers])].filter(Boolean),
                admins: [creatorId]
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
                message: error.message
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
            const { name, description } = req.body;
            const userId = req.user.id;

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
            const userId = req.user.id;

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
            const userId = req.user.id;

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
            const userId = req.user.id;

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
            const userId = req.user.id;

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
            const userId = req.user.id;

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
}

module.exports = GroupController; 