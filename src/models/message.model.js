const { DynamoDB } = require('aws-sdk');
const dynamoDB = new DynamoDB.DocumentClient();
const dynamoDBClient = new DynamoDB();

const TABLE_NAME = 'Conversations';

class Message {
    static async createTable() {
        const params = {
            TableName: TABLE_NAME,
            KeySchema: [
                { AttributeName: 'conversationId', KeyType: 'HASH' }
            ],
            AttributeDefinitions: [
                { AttributeName: 'conversationId', AttributeType: 'S' }
            ],
            ProvisionedThroughput: {
                ReadCapacityUnits: 5,
                WriteCapacityUnits: 5
            }
        };

        try {
            await dynamoDBClient.createTable(params).promise();
            console.log('Conversations table created successfully');
        } catch (error) {
            if (error.code === 'ResourceInUseException') {
                console.log('Conversations table already exists');
            } else {
                console.error('Error creating Conversations table:', error);
                throw error;
            }
        }
    }

    static async create(message) {
        const conversationId = this.generateConversationId(message.senderEmail, message.receiverEmail);
        
        // Get existing conversation or create new one
        const existingConversation = await this.findConversation(conversationId);
        
        if (existingConversation) {
            // Add message to existing conversation
            const params = {
                TableName: TABLE_NAME,
                Key: {
                    conversationId: conversationId
                },
                UpdateExpression: 'SET messages = list_append(if_not_exists(messages, :empty_list), :new_message)',
                ExpressionAttributeValues: {
                    ':empty_list': [],
                    ':new_message': [{
                        messageId: message.messageId,
                        senderEmail: message.senderEmail,
                        receiverEmail: message.receiverEmail,
                        content: message.content,
                        type: message.type || 'text',
                        metadata: message.metadata || {},
                        createdAt: message.createdAt,
                        status: message.status || 'sent',
                        reactions: message.reactions || [],
                        isForwarded: message.isForwarded || false,
                        originalMessageId: message.originalMessageId,
                        originalGroupId: message.originalGroupId,
                        originalSenderEmail: message.originalSenderEmail, 
                        isDeleted: message.isDeleted || false,
                        isRecalled: message.isRecalled || false,
                        deleteBy: message.deleteBy || [],
                    }]
                },
                ReturnValues: 'ALL_NEW'
            };

            try {
                const result = await dynamoDB.update(params).promise();
                return result.Attributes.messages[result.Attributes.messages.length - 1];
            } catch (error) {
                throw error;
            }
        } else {
            // Create new conversation
            const params = {
                TableName: TABLE_NAME,
                Item: {
                    conversationId: conversationId,
                    participants: [message.senderEmail, message.receiverEmail],
                    messages: [{
                        messageId: message.messageId,
                        senderEmail: message.senderEmail,
                        receiverEmail: message.receiverEmail,
                        content: message.content,
                        type: message.type || 'text',
                        metadata: message.metadata || {},
                        createdAt: message.createdAt,
                        status: message.status || 'sent',
                        reactions: message.reactions || [],
                        isForwarded: message.isForwarded || false,
                        originalMessageId: message.originalMessageId,
                        originalGroupId: message.originalGroupId,
                        originalSenderEmail: message.originalSenderEmail,
                        isDeleted: message.isDeleted || false,
                        isRecalled: message.isRecalled || false,
                        deleteBy: message.deleteBy || [],
                    }]
                }
            };

            try {
                await dynamoDB.put(params).promise();
                return params.Item.messages[0];
            } catch (error) {
                throw error;
            }
        }
    }

    static generateConversationId(email1, email2) {
        // Sort emails to ensure consistent conversationId
        const sortedEmails = [email1, email2].sort();
        return `${sortedEmails[0]}_${sortedEmails[1]}`;
    }

    static async findConversation(conversationId) {
        const params = {
            TableName: TABLE_NAME,
            Key: {
                conversationId: conversationId
            }
        };

        try {
            const result = await dynamoDB.get(params).promise();
            return result.Item;
        } catch (error) {
            console.error('Error finding conversation:', error);
            throw error;
        }
    }

    static async find(query) {
        const { senderEmail, receiverEmail } = query;
        const conversationId = this.generateConversationId(senderEmail, receiverEmail);
        
        try {
            const conversation = await this.findConversation(conversationId);
            if (!conversation) {
                return [];
            }
            
            // Filter out messages that are deleted for the current user
            const filteredMessages = conversation.messages.filter(message => {
                if (!message.deletedFor) return true;
                return !message.deletedFor.includes(senderEmail);
            });
            
            // Sort messages by time
            return filteredMessages.sort((a, b) => {
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
        const conversationId = this.generateConversationId(query.senderEmail, query.receiverEmail);
        const conversation = await this.findConversation(conversationId);
        
        if (!conversation) {
            throw new Error('Conversation not found');
        }

        const messageIndex = conversation.messages.findIndex(m => m.messageId === query.messageId);
        if (messageIndex === -1) {
            throw new Error('Message not found');
        }

        conversation.messages[messageIndex].status = update.status;

        const params = {
            TableName: TABLE_NAME,
            Key: {
                conversationId: conversationId
            },
            UpdateExpression: 'SET messages = :messages',
            ExpressionAttributeValues: {
                ':messages': conversation.messages
            }
        };

        try {
            await dynamoDB.update(params).promise();
        } catch (error) {
            throw error;
        }
    }

    static async updateReactions(messageId, reactions) {
        // Find the conversation containing this message
        const conversations = await this.findAllConversations();
        let targetConversation = null;
        let messageIndex = -1;

        for (const conversation of conversations) {
            const index = conversation.messages.findIndex(m => m.messageId === messageId);
            if (index !== -1) {
                targetConversation = conversation;
                messageIndex = index;
                break;
            }
        }

        if (!targetConversation) {
            throw new Error('Message not found');
        }

        targetConversation.messages[messageIndex].reactions = reactions;

        const params = {
            TableName: TABLE_NAME,
            Key: {
                conversationId: targetConversation.conversationId
            },
            UpdateExpression: 'SET messages = :messages',
            ExpressionAttributeValues: {
                ':messages': targetConversation.messages
            },
            ReturnValues: 'ALL_NEW'
        };

        try {
            const result = await dynamoDB.update(params).promise();
            return result.Attributes.messages[messageIndex];
        } catch (error) {
            console.error('Error updating reactions:', error);
            throw error;
        }
    }

    static async findAllConversations() {
        const params = {
            TableName: TABLE_NAME
        };

        try {
            const result = await dynamoDB.scan(params).promise();
            return result.Items || [];
        } catch (error) {
            console.error('Error finding all conversations:', error);
            throw error;
        }
    }

    static async findById(messageId) {
        const conversations = await this.findAllConversations();
        
        for (const conversation of conversations) {
            const message = conversation.messages.find(m => m.messageId === messageId);
            if (message) {
                return message;
            }
        }
        
        return null;
    }

    static async recallMessage(messageId) {
        const conversations = await this.findAllConversations();
        let targetConversation = null;
        let messageIndex = -1;

        for (const conversation of conversations) {
            const index = conversation.messages.findIndex(m => m.messageId === messageId);
            if (index !== -1) {
                targetConversation = conversation;
                messageIndex = index;
                break;
            }
        }

        if (!targetConversation) {
            throw new Error('Message not found');
        }

        targetConversation.messages[messageIndex].isRecalled = true;

        const params = {
            TableName: TABLE_NAME,
            Key: {
                conversationId: targetConversation.conversationId
            },
            UpdateExpression: 'SET messages = :messages',
            ExpressionAttributeValues: {
                ':messages': targetConversation.messages
            },
            ReturnValues: 'ALL_NEW'
        };

        try {
            const result = await dynamoDB.update(params).promise();
            return result.Attributes.messages[messageIndex];
        } catch (error) {
            console.error('Error recalling message:', error);
            throw error;
        }
    }

    static async deleteMessage(messageId) {
        const conversations = await this.findAllConversations();
        let targetConversation = null;
        let messageIndex = -1;

        for (const conversation of conversations) {
            const index = conversation.messages.findIndex(m => m.messageId === messageId);
            if (index !== -1) {
                targetConversation = conversation;
                messageIndex = index;
                break;
            }
        }

        if (!targetConversation) {
            throw new Error('Message not found');
        }

        const message = targetConversation.messages[messageIndex];
        
        // Initialize deletedFor array if it doesn't exist
        if (!message.deletedFor) {
            message.deletedFor = [];
        }

        // Add sender to deletedFor array if not already there
        if (!message.deletedFor.includes(message.senderEmail)) {
            message.deletedFor.push(message.senderEmail);
        }

        const params = {
            TableName: TABLE_NAME,
            Key: {
                conversationId: targetConversation.conversationId
            },
            UpdateExpression: 'SET messages = :messages',
            ExpressionAttributeValues: {
                ':messages': targetConversation.messages
            },
            ReturnValues: 'ALL_NEW'
        };

        try {
            const result = await dynamoDB.update(params).promise();
            return result.Attributes.messages[messageIndex];
        } catch (error) {
            console.error('Error deleting message:', error);
            throw error;
        }
    }

    static async updateDeleteBy(messageId, deletedByArray) {
        const conversations = await this.findAllConversations();
        let targetConversation = null;
        let messageIndex = -1;

        for (const conversation of conversations) {
            const index = conversation.messages.findIndex(m => m.messageId === messageId);
            if (index !== -1) {
                targetConversation = conversation;
                messageIndex = index;
                break;
            }
        }

        if (!targetConversation) {
            throw new Error('Message not found');
        }

        const params = {
            TableName: TABLE_NAME,
            Key: {
                conversationId: targetConversation.conversationId
            },
            UpdateExpression: `SET messages[${messageIndex}].deletedBy = :deletedBy`,
            ExpressionAttributeValues: {
                ':deletedBy': deletedByArray
            },
            ReturnValues: 'ALL_NEW'
        };

        try {
            const result = await dynamoDB.update(params).promise();
            return result.Attributes.messages[messageIndex];
        } catch (error) {
            console.error('Error updating deleteBy:', error);
            throw error;
        }
    }

    static async deleteManyForUser(conversationId, userEmail) {
        const conversation = await this.findConversation(conversationId);
        if (!conversation) {
            throw new Error('Conversation not found');
        }

        const updatedMessages = conversation.messages.map((msg) => {
            if (!msg.deleteBy) msg.deleteBy = [];

            if (!msg.deleteBy.includes(userEmail)) {
                msg.deleteBy.push(userEmail);
            }

            return msg;
        });

        const params = {
            TableName: TABLE_NAME,
            Key: { conversationId },
            UpdateExpression: 'SET messages = :messages',
            ExpressionAttributeValues: {
                ':messages': updatedMessages
            },
            ReturnValues: 'ALL_NEW'
        };

        try {
            const result = await dynamoDB.update(params).promise();
            return result.Attributes.messages;
        } catch (error) {
            console.error('Error in deleteManyForUser:', error);
            throw error;
        }
    }

    static async hideMessagesBetweenUsers(currentEmail, otherEmail) {
        const allMessages = await this.findAllConversations(); // hoặc dùng findAllConversations()

        const updatedMessages = [];

        for (const conversation of allMessages) {
            for (const message of conversation.messages) {
                const isBetweenUsers = 
                    (message.senderEmail === currentEmail && message.receiverEmail === otherEmail) ||
                    (message.senderEmail === otherEmail && message.receiverEmail === currentEmail);

                if (isBetweenUsers && (!message.deletedBy || !message.deletedBy.includes(currentEmail))) {
                    message.deletedBy = message.deletedBy || [];
                    message.deletedBy.push(currentEmail);
                }
            }

            // Update toàn bộ conversation (DynamoDB không hỗ trợ update nested array phần tử riêng lẻ)
            await dynamoDB.update({
                TableName: TABLE_NAME,
                Key: { conversationId: conversation.conversationId },
                UpdateExpression: 'SET messages = :messages',
                ExpressionAttributeValues: {
                    ':messages': conversation.messages
                }
            }).promise();

            updatedMessages.push(conversation.conversationId);
        }

        return updatedMessages;
    }

    static async permanentlyDeleteMessagesBetweenUsers(emailA, emailB) {
        const conversations = await this.findAllConversations(); // hoặc theo conversationId đã biết

        for (const convo of conversations) {
            const relevantMessages = convo.messages.filter(msg =>
                (msg.senderEmail === emailA && msg.receiverEmail === emailB) ||
                (msg.senderEmail === emailB && msg.receiverEmail === emailA)
            );

            if (relevantMessages.length > 0) {
                // Lọc bỏ các tin nhắn giữa 2 người
                convo.messages = convo.messages.filter(msg =>
                    !((msg.senderEmail === emailA && msg.receiverEmail === emailB) ||
                    (msg.senderEmail === emailB && msg.receiverEmail === emailA))
                );
                console.log("⭐ Đang xóa conversationId:", convo.conversationId);

                // Cập nhật lại
                await dynamoDB.update({
                    TableName: TABLE_NAME,
                    Key: { conversationId: convo.conversationId },
                    UpdateExpression: 'SET messages = :messages',
                    ExpressionAttributeValues: {
                        ':messages': convo.messages
                    }
                }).promise();
            }
        }
    }


}

module.exports = Message; 