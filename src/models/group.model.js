const AWS = require('aws-sdk');
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const dynamoDBService = new AWS.DynamoDB();
const TABLE_NAME = 'Groups';

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
            UpdateExpression: 'set #name = :name, description = :description, members = :members, admins = :admins, updatedAt = :updatedAt',
            ExpressionAttributeNames: {
                '#name': 'name'
            },
            ExpressionAttributeValues: {
                ':name': updateData.name,
                ':description': updateData.description,
                ':members': updateData.members,
                ':admins': updateData.admins,
                ':updatedAt': new Date().toISOString()
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
}

module.exports = Group; 