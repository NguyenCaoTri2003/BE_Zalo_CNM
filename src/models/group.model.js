const AWS = require('aws-sdk');
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const dynamoDBService = new AWS.DynamoDB();
const TABLE_NAME = 'Groups';
const User = require('./user.model');

class Group {
    static async createTable() {
        const params = {
            TableName: TABLE_NAME,
            KeySchema: [
                { AttributeName: 'groupId', KeyType: 'HASH' }
            ],
            AttributeDefinitions: [
                { AttributeName: 'groupId', AttributeType: 'S' }
            ],
            ProvisionedThroughput: {
                ReadCapacityUnits: 5,
                WriteCapacityUnits: 5
            }
        };

        try {
            await dynamoDBService.createTable(params).promise();
            console.log('Groups table created successfully');
        } catch (error) {
            if (error.code === 'ResourceInUseException') {
                console.log('Groups table already exists');
            } else {
                throw error;
            }
        }
    }

    static async getGroupsByMember(userId) {
        const params = {
            TableName: TABLE_NAME,
            FilterExpression: 'contains(members, :userId)',
            ExpressionAttributeValues: {
                ':userId': userId
            }
        };

        try {
            const result = await dynamoDB.scan(params).promise();
            const groups = result.Items || [];
            
            // Chuyển đổi cấu trúc dữ liệu để phù hợp với frontend
            const groupsWithMembers = await Promise.all(groups.map(async group => {
                // Lấy thông tin chi tiết của tất cả thành viên
                const memberPromises = group.members.map(async memberId => {
                    try {
                        const user = await User.getUserById(memberId);
                        if (user) {
                            return {
                                email: user.email,
                                fullName: user.fullName || user.email.split('@')[0],
                                avatar: user.avatar || 'https://res.cloudinary.com/ds4v3awds/image/upload/v1743944990/l2eq6atjnmzpppjqkk1j.jpg',
                                role: group.admins.includes(memberId) ? 'admin' : 'member',
                                joinedAt: group.createdAt
                            };
                        }
                        return null;
                    } catch (error) {
                        console.error(`Error getting user info for ${memberId}:`, error);
                        return null;
                    }
                });

                const members = (await Promise.all(memberPromises)).filter(member => member !== null);

                return {
                    ...group,
                    members,
                    lastMessage: group.lastMessage || (group.messages && group.messages.length > 0 ? {
                        content: group.messages[group.messages.length - 1].content,
                        senderEmail: group.messages[group.messages.length - 1].senderEmail,
                        timestamp: group.messages[group.messages.length - 1].createdAt
                    } : undefined)
                };
            }));

            return groupsWithMembers;
        } catch (error) {
            console.error('Error getting groups by member:', error);
            return [];
        }
    }

    static async createGroup(groupData) {
        // Ensure required fields are present
        if (!groupData.groupId || !groupData.name || !groupData.creatorId) {
            throw new Error('Missing required fields: groupId, name, or creatorId');
        }

        // Ensure members and admins are arrays
        const members = Array.isArray(groupData.members) ? groupData.members : [];
        const admins = Array.isArray(groupData.admins) ? groupData.admins : [];

        // Ensure creator is in members and admins
        if (!members.includes(groupData.creatorId)) {
            members.push(groupData.creatorId);
        }
        if (!admins.includes(groupData.creatorId)) {
            admins.push(groupData.creatorId);
        }

        const params = {
            TableName: TABLE_NAME,
            Item: {
                groupId: groupData.groupId,
                name: groupData.name,
                description: groupData.description || '',
                creatorId: groupData.creatorId,
                members: members,
                admins: admins,
                deputies: [],
                messages: [], // Initialize empty messages array
                avatar: groupData.avatar || 'https://res.cloudinary.com/ds4v3awds/image/upload/v1743944990/l2eq6atjnmzpppjqkk1j.jpg',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }
        };

        await dynamoDB.put(params).promise();
        return params.Item;
    }

    static async getGroup(groupId) {
        const params = {
            TableName: TABLE_NAME,
            Key: {
                groupId: groupId
            }
        };

        const result = await dynamoDB.get(params).promise();
        return result.Item;
    }

    static async updateGroup(groupId, updateData) {
        const params = {
            TableName: TABLE_NAME,
            Key: {
                groupId: groupId
            },
            UpdateExpression: 'set #name = :name, members = :members, admins = :admins, deputies = :deputies, avatar = :avatar, updatedAt = :updatedAt, allowMemberInvite = :allowMemberInvite',
            ExpressionAttributeNames: {
                '#name': 'name'
            },
            ExpressionAttributeValues: {
                ':name': updateData.name,
                ':members': updateData.members,
                ':admins': updateData.admins,
                ':deputies': updateData.deputies || [],
                ':avatar': updateData.avatar,
                ':updatedAt': new Date().toISOString(),
                ':allowMemberInvite': typeof updateData.allowMemberInvite === 'boolean' ? updateData.allowMemberInvite : false,

            },
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamoDB.update(params).promise();
        return result.Attributes;
    }

    static async deleteGroup(groupId) {
        const params = {
            TableName: TABLE_NAME,
            Key: {
                groupId: groupId
            }
        };

        await dynamoDB.delete(params).promise();
        return true;
    }

    static async addMember(groupId, memberId) {
        const group = await this.getGroup(groupId);
        if (!group) throw new Error('Group not found');

        const members = new Set(group.members);
        members.add(memberId);

        const params = {
            TableName: TABLE_NAME,
            Key: {
                groupId: groupId
            },
            UpdateExpression: 'set members = :members, updatedAt = :updatedAt',
            ExpressionAttributeValues: {
                ':members': Array.from(members),
                ':updatedAt': new Date().toISOString()
            },
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamoDB.update(params).promise();
        return result.Attributes;
    }

    static async removeMember(groupId, memberId) {
        const group = await this.getGroup(groupId);
        if (!group) throw new Error('Group not found');

        const members = new Set(group.members);
        members.delete(memberId);

        const params = {
            TableName: TABLE_NAME,
            Key: {
                groupId: groupId
            },
            UpdateExpression: 'set members = :members, updatedAt = :updatedAt',
            ExpressionAttributeValues: {
                ':members': Array.from(members),
                ':updatedAt': new Date().toISOString()
            },
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamoDB.update(params).promise();
        return result.Attributes;
    }

    static async addAdmin(groupId, adminId) {
        const group = await this.getGroup(groupId);
        if (!group) throw new Error('Group not found');

        const admins = new Set(group.admins);
        admins.add(adminId);

        const params = {
            TableName: TABLE_NAME,
            Key: {
                groupId: groupId
            },
            UpdateExpression: 'set admins = :admins, updatedAt = :updatedAt',
            ExpressionAttributeValues: {
                ':admins': Array.from(admins),
                ':updatedAt': new Date().toISOString()
            },
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamoDB.update(params).promise();
        return result.Attributes;
    }

    static async removeAdmin(groupId, adminId) {
        const group = await this.getGroup(groupId);
        if (!group) throw new Error('Group not found');

        const admins = new Set(group.admins);
        admins.delete(adminId);

        const params = {
            TableName: TABLE_NAME,
            Key: {
                groupId: groupId
            },
            UpdateExpression: 'set admins = :admins, updatedAt = :updatedAt',
            ExpressionAttributeValues: {
                ':admins': Array.from(admins),
                ':updatedAt': new Date().toISOString()
            },
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamoDB.update(params).promise();
        return result.Attributes;
    }

    static async addMessage(groupId, message) {
        const group = await this.getGroup(groupId);
        if (!group) {
            throw new Error('Group not found');
        }

        const messages = group.messages || [];
        messages.push(message);

        // Cập nhật tin nhắn cuối cùng
        const lastMessage = {
            content: message.content,
            senderEmail: message.senderEmail,
            timestamp: message.createdAt
        };

        const params = {
            TableName: TABLE_NAME,
            Key: { groupId },
            UpdateExpression: 'SET messages = :messages, lastMessage = :lastMessage',
            ExpressionAttributeValues: {
                ':messages': messages,
                ':lastMessage': lastMessage
            },
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamoDB.update(params).promise();
        return result.Attributes;
    }

    static async addMembers(groupId, memberIds) {
        try {
            const group = await this.getGroup(groupId);
            if (!group) throw new Error('Group not found');

            console.log('Current group members:', group.members);
            console.log('Adding new members:', memberIds);

            // Tạo Set từ danh sách thành viên hiện tại
            const members = new Set(group.members || []);
            
            // Thêm các thành viên mới vào Set
            memberIds.forEach(id => {
                if (id && !members.has(id)) {
                    members.add(id);
                }
            });

            console.log('Updated members list:', Array.from(members));

            const params = {
                TableName: TABLE_NAME,
                Key: {
                    groupId: groupId
                },
                UpdateExpression: 'set members = :members, updatedAt = :updatedAt',
                ExpressionAttributeValues: {
                    ':members': Array.from(members),
                    ':updatedAt': new Date().toISOString()
                },
                ReturnValues: 'ALL_NEW'
            };

            console.log('DynamoDB update params:', JSON.stringify(params, null, 2));

            const result = await dynamoDB.update(params).promise();
            console.log('DynamoDB update result:', JSON.stringify(result, null, 2));

            return result.Attributes;
        } catch (error) {
            console.error('Error in addMembers:', error);
            throw error;
        }
    }

    // Find group by ID (alias for getGroup)
    static async findById(groupId) {
        return this.getGroup(groupId);
    }

    static async addDeputy(groupId, deputyId) {
        const group = await this.getGroup(groupId);
        if (!group) throw new Error('Group not found');

        const deputies = new Set(group.deputies || []);
        deputies.add(deputyId);

        const params = {
            TableName: TABLE_NAME,
            Key: {
                groupId: groupId
            },
            UpdateExpression: 'set deputies = :deputies, updatedAt = :updatedAt',
            ExpressionAttributeValues: {
                ':deputies': Array.from(deputies),
                ':updatedAt': new Date().toISOString()
            },
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamoDB.update(params).promise();
        return result.Attributes;
    }

    static async removeDeputy(groupId, deputyId) {
        const group = await this.getGroup(groupId);
        if (!group) throw new Error('Group not found');

        const deputies = new Set(group.deputies || []);
        deputies.delete(deputyId);

        const params = {
            TableName: TABLE_NAME,
            Key: {
                groupId: groupId
            },
            UpdateExpression: 'set deputies = :deputies, updatedAt = :updatedAt',
            ExpressionAttributeValues: {
                ':deputies': Array.from(deputies),
                ':updatedAt': new Date().toISOString()
            },
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamoDB.update(params).promise();
        return result.Attributes;
    }
}

module.exports = Group; 