const AWS = require('aws-sdk');
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const dynamoDBService = new AWS.DynamoDB();
const TABLE_NAME = 'GroupMessages';

class GroupMessage {
    static async createTable() {
        const params = {
            TableName: TABLE_NAME,
            KeySchema: [
                { AttributeName: 'groupId', KeyType: 'HASH' },
                { AttributeName: 'messageId', KeyType: 'RANGE' }
            ],
            AttributeDefinitions: [
                { AttributeName: 'groupId', AttributeType: 'S' },
                { AttributeName: 'messageId', AttributeType: 'S' }
            ],
            ProvisionedThroughput: {
                ReadCapacityUnits: 5,
                WriteCapacityUnits: 5
            }
        };

        try {
            await dynamoDBService.createTable(params).promise();
            console.log('GroupMessages table created successfully');
        } catch (error) {
            if (error.code === 'ResourceInUseException') {
                console.log('GroupMessages table already exists');
            } else {
                throw error;
            }
        }
    }

    static async createMessage(messageData) {
        const params = {
            TableName: TABLE_NAME,
            Item: {
                groupId: messageData.groupId,
                messageId: messageData.messageId,
                senderId: messageData.senderId,
                content: messageData.content,
                type: messageData.type, // 'text', 'file', 'image', 'emoji'
                fileUrl: messageData.fileUrl,
                fileName: messageData.fileName,
                fileSize: messageData.fileSize,
                fileType: messageData.fileType,
                isDeleted: false,
                isRecalled: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }
        };

        await dynamoDB.put(params).promise();
        return params.Item;
    }

    static async getMessage(groupId, messageId) {
        const params = {
            TableName: TABLE_NAME,
            Key: {
                groupId: groupId,
                messageId: messageId
            }
        };

        const result = await dynamoDB.get(params).promise();
        return result.Item;
    }

    static async getGroupMessages(groupId, limit = 50, lastEvaluatedKey = null) {
        const params = {
            TableName: TABLE_NAME,
            KeyConditionExpression: 'groupId = :groupId',
            ExpressionAttributeValues: {
                ':groupId': groupId
            },
            Limit: limit,
            ScanIndexForward: false // Get messages in descending order
        };

        if (lastEvaluatedKey) {
            params.ExclusiveStartKey = lastEvaluatedKey;
        }

        const result = await dynamoDB.query(params).promise();
        return {
            messages: result.Items,
            lastEvaluatedKey: result.LastEvaluatedKey
        };
    }

    static async deleteMessage(groupId, messageId) {
        const params = {
            TableName: TABLE_NAME,
            Key: {
                groupId: groupId,
                messageId: messageId
            },
            UpdateExpression: 'set isDeleted = :isDeleted, updatedAt = :updatedAt',
            ExpressionAttributeValues: {
                ':isDeleted': true,
                ':updatedAt': new Date().toISOString()
            },
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamoDB.update(params).promise();
        return result.Attributes;
    }

    static async recallMessage(groupId, messageId) {
        const params = {
            TableName: TABLE_NAME,
            Key: {
                groupId: groupId,
                messageId: messageId
            },
            UpdateExpression: 'set isRecalled = :isRecalled, updatedAt = :updatedAt',
            ExpressionAttributeValues: {
                ':isRecalled': true,
                ':updatedAt': new Date().toISOString()
            },
            ReturnValues: 'ALL_NEW'
        };

        const result = await dynamoDB.update(params).promise();
        return result.Attributes;
    }

    static async forwardMessage(groupId, messageId, targetGroupId) {
        const message = await this.getMessage(groupId, messageId);
        if (!message) throw new Error('Message not found');

        const newMessageId = `forward_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const forwardData = {
            ...message,
            groupId: targetGroupId,
            messageId: newMessageId,
            isForwarded: true,
            originalMessageId: messageId,
            originalGroupId: groupId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        delete forwardData.isDeleted;
        delete forwardData.isRecalled;

        return await this.createMessage(forwardData);
    }
}

module.exports = GroupMessage; 