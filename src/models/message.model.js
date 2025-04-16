const { DynamoDB } = require('aws-sdk');
const dynamoDB = new DynamoDB.DocumentClient();
const dynamoDBClient = new DynamoDB();

const TABLE_NAME = 'Messages';

class Message {
    static async createTable() {
        const params = {
            TableName: TABLE_NAME,
            KeySchema: [
                { AttributeName: 'messageId', KeyType: 'HASH' }
            ],
            AttributeDefinitions: [
                { AttributeName: 'messageId', AttributeType: 'S' }
            ],
            ProvisionedThroughput: {
                ReadCapacityUnits: 5,
                WriteCapacityUnits: 5
            }
        };

        try {
            await dynamoDBClient.createTable(params).promise();
            console.log('Messages table created successfully');
        } catch (error) {
            if (error.code === 'ResourceInUseException') {
                console.log('Messages table already exists');
            } else {
                console.error('Error creating Messages table:', error);
                throw error;
            }
        }
    }

    static async create(message) {
        const params = {
            TableName: TABLE_NAME,
            Item: {
                messageId: message.messageId,
                senderEmail: message.senderEmail,
                receiverEmail: message.receiverEmail,
                content: message.content,
                createdAt: message.createdAt.toISOString(),
                status: message.status,
                reactions: message.reactions || [] // Initialize empty reactions array if not provided
            }
        };

        try {
            await dynamoDB.put(params).promise();
            return message;
        } catch (error) {
            throw error;
        }
    }

    static async find(query) {
        const { senderEmail, receiverEmail } = query;
        
        const params = {
            TableName: TABLE_NAME,
            FilterExpression: '(senderEmail = :senderEmail AND receiverEmail = :receiverEmail) OR (senderEmail = :receiverEmail AND receiverEmail = :senderEmail)',
            ExpressionAttributeValues: {
                ':senderEmail': senderEmail,
                ':receiverEmail': receiverEmail
            }
        };

        try {
            const result = await dynamoDB.scan(params).promise();
            const messages = result.Items || [];
            
            // Sắp xếp tin nhắn theo thời gian
            return messages.sort((a, b) => {
                const dateA = new Date(a.createdAt).getTime();
                const dateB = new Date(b.createdAt).getTime();
                return dateA - dateB;
            });
        } catch (error) {
            console.error('Error in Message.find:', error);
            throw error;
        }
    }

    static async findOneAndUpdate(query, update) {
        const params = {
            TableName: TABLE_NAME,
            Key: {
                messageId: query.messageId
            },
            UpdateExpression: 'SET #status = :status',
            ExpressionAttributeNames: {
                '#status': 'status'
            },
            ExpressionAttributeValues: {
                ':status': update.status
            }
        };

        try {
            await dynamoDB.update(params).promise();
        } catch (error) {
            throw error;
        }
    }

    static async updateReactions(messageId, reactions) {
        const params = {
            TableName: TABLE_NAME,
            Key: {
                messageId: messageId
            },
            UpdateExpression: 'SET reactions = :reactions',
            ExpressionAttributeValues: {
                ':reactions': reactions
            },
            ReturnValues: 'ALL_NEW'
        };

        try {
            const result = await dynamoDB.update(params).promise();
            return result.Attributes;
        } catch (error) {
            console.error('Error updating reactions:', error);
            throw error;
        }
    }

    static async findById(messageId) {
        const params = {
            TableName: TABLE_NAME,
            Key: {
                messageId: messageId
            }
        };

        try {
            const result = await dynamoDB.get(params).promise();
            return result.Item;
        } catch (error) {
            console.error('Error finding message by ID:', error);
            throw error;
        }
    }

    static async recallMessage(messageId) {
        const params = {
            TableName: TABLE_NAME,
            Key: {
                messageId: messageId
            },
            UpdateExpression: 'SET isRecalled = :isRecalled',
            ExpressionAttributeValues: {
                ':isRecalled': true
            },
            ReturnValues: 'ALL_NEW'
        };

        try {
            const result = await dynamoDB.update(params).promise();
            return result.Attributes;
        } catch (error) {
            console.error('Error recalling message:', error);
            throw error;
        }
    }

    static async deleteMessage(messageId) {
        const params = {
            TableName: TABLE_NAME,
            Key: {
                messageId: messageId
            }
        };

        try {
            await dynamoDB.delete(params).promise();
            return true;
        } catch (error) {
            console.error('Error deleting message:', error);
            throw error;
        }
    }
}

module.exports = Message; 