const { docClient, dynamodb } = require('../config/aws.config');
const { v4: uuidv4 } = require('uuid');

class User {
    static async createUser(userData) {
        // Tạo userId mới nếu chưa có
        if (!userData.userId) {
            userData.userId = uuidv4();
        }
        
        const params = {
            TableName: 'Users',
            Item: {
                ...userData,
                friends: [],
                friendRequestsReceived: [], // Lời mời kết bạn nhận được
                friendRequestsSent: [], // Lời mời kết bạn đã gửi
            }
        };
        await docClient.put(params).promise();
        return userData;
    }

    static async getUserByEmail(email) {
        const params = {
            TableName: 'Users',
            IndexName: 'EmailIndex',
            KeyConditionExpression: 'email = :email',
            ExpressionAttributeValues: {
                ':email': email
            }
        };
        
        try {
            const result = await docClient.query(params).promise();
            return result.Items[0];
        } catch (error) {
            console.error('Error getting user by email:', error);
            return null;
        }
    }

    static async getUserById(userId) {
        const params = {
            TableName: 'Users',
            Key: {
                userId: userId
            }
        };
        const result = await docClient.get(params).promise();
        return result.Item;
    }

    static async getUserByPhoneNumber(phoneNumber) {
        const params = {
            TableName: 'Users',
            FilterExpression: 'phoneNumber = :phoneNumber',
            ExpressionAttributeValues: {
                ':phoneNumber': phoneNumber
            }
        };
        const result = await docClient.scan(params).promise();
        return result.Items && result.Items.length > 0 ? result.Items[0] : null;
    }

    static async createUsersTable() {
        const params = {
            TableName: 'Users',
            KeySchema: [
                { AttributeName: 'userId', KeyType: 'HASH' }
            ],
            AttributeDefinitions: [
                { AttributeName: 'userId', AttributeType: 'S' },
                { AttributeName: 'email', AttributeType: 'S' }
            ],
            GlobalSecondaryIndexes: [
                {
                    IndexName: 'EmailIndex',
                    KeySchema: [
                        { AttributeName: 'email', KeyType: 'HASH' }
                    ],
                    Projection: {
                        ProjectionType: 'ALL'
                    },
                    ProvisionedThroughput: {
                        ReadCapacityUnits: 5,
                        WriteCapacityUnits: 5
                    }
                }
            ],
            ProvisionedThroughput: {
                ReadCapacityUnits: 5,
                WriteCapacityUnits: 5
            }
        };

        try {
            await dynamodb.createTable(params).promise();
            console.log('Users table created successfully');
        } catch (error) {
            if (error.code === 'ResourceInUseException') {
                console.log('Users table already exists');
            } else {
                console.error('Error creating Users table:', error);
                throw error;
            }
        }
    }

    static async updateUserResetToken(email, tokenData) {
        // Get user by email first
        const user = await this.getUserByEmail(email);
        if (!user) {
            throw new Error('User not found');
        }

        const params = {
            TableName: 'Users',
            Key: {
                userId: user.userId
            },
            UpdateExpression: 'set resetToken = :resetToken, resetTokenExpiry = :resetTokenExpiry',
            ExpressionAttributeValues: {
                ':resetToken': tokenData.resetToken,
                ':resetTokenExpiry': tokenData.resetTokenExpiry
            },
            ReturnValues: 'UPDATED_NEW'
        };
        await docClient.update(params).promise();
        return tokenData;
    }

    static async getUserByResetToken(resetToken) {
        const params = {
            TableName: 'Users',
            FilterExpression: 'resetToken = :resetToken',
            ExpressionAttributeValues: {
                ':resetToken': resetToken
            }
        };
        const result = await docClient.scan(params).promise();
        return result.Items && result.Items.length > 0 ? result.Items[0] : null;
    }

    static async updateUserPassword(email, newPassword) {
        // Get user by email first
        const user = await this.getUserByEmail(email);
        if (!user) {
            throw new Error('User not found');
        }

        const params = {
            TableName: 'Users',
            Key: {
                userId: user.userId
            },
            UpdateExpression: 'set password = :password, resetToken = :resetToken, resetTokenExpiry = :resetTokenExpiry',
            ExpressionAttributeValues: {
                ':password': newPassword,
                ':resetToken': null,
                ':resetTokenExpiry': null
            },
            ReturnValues: 'UPDATED_NEW'
        };
        await docClient.update(params).promise();
        return { email };
    }

    static async updateUserResetCode(email, codeData) {
        try {
            console.log('Starting updateUserResetCode...');
            console.log('Email:', email);
            console.log('Code data:', JSON.stringify(codeData, null, 2));

            // Kiểm tra user tồn tại
            const existingUser = await this.getUserByEmail(email);
            console.log('Existing user:', JSON.stringify(existingUser, null, 2));

            if (!existingUser) {
                throw new Error('User not found');
            }

            const params = {
                TableName: 'Users',
                Key: {
                    userId: existingUser.userId
                },
                UpdateExpression: 'set resetCode = :resetCode, resetCodeExpiry = :resetCodeExpiry',
                ExpressionAttributeValues: {
                    ':resetCode': codeData.resetCode,
                    ':resetCodeExpiry': codeData.resetCodeExpiry
                },
                ReturnValues: 'ALL_NEW'
            };

            console.log('DynamoDB update params:', JSON.stringify(params, null, 2));
            
            const result = await docClient.update(params).promise();
            console.log('Update complete. Full result:', JSON.stringify(result, null, 2));
            
            // Verify the update
            const updatedUser = await this.getUserByEmail(email);
            console.log('Verification - Updated user:', JSON.stringify(updatedUser, null, 2));
            
            return result.Attributes;
        } catch (error) {
            console.error('Error in updateUserResetCode:', error);
            console.error('Error details:', {
                code: error.code,
                message: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    static async updateUserPasswordWithCode(email, newPassword) {
        // Get user by email first
        const user = await this.getUserByEmail(email);
        if (!user) {
            throw new Error('User not found');
        }

        const params = {
            TableName: 'Users',
            Key: {
                userId: user.userId
            },
            UpdateExpression: 'set password = :password, resetCode = :resetCode, resetCodeExpiry = :resetCodeExpiry',
            ExpressionAttributeValues: {
                ':password': newPassword,
                ':resetCode': null,
                ':resetCodeExpiry': null
            },
            ReturnValues: 'UPDATED_NEW'
        };
        await docClient.update(params).promise();
        return { email };
    }

    static async updateUser(userId, updateData) {
        // Xây dựng biểu thức cập nhật
        let updateExpression = 'SET';
        const expressionAttributeValues = {};
        const expressionAttributeNames = {};

        // Thêm các trường cần cập nhật vào biểu thức
        Object.keys(updateData).forEach((key, index) => {
            updateExpression += ` #${key} = :${key},`;
            expressionAttributeValues[`:${key}`] = updateData[key];
            expressionAttributeNames[`#${key}`] = key;
        });

        // Loại bỏ dấu phẩy cuối cùng
        updateExpression = updateExpression.slice(0, -1);

        const params = {
            TableName: 'Users',
            Key: {
                userId: userId
            },
            UpdateExpression: updateExpression,
            ExpressionAttributeValues: expressionAttributeValues,
            ExpressionAttributeNames: expressionAttributeNames,
            ReturnValues: 'ALL_NEW'
        };

        const result = await docClient.update(params).promise();
        return result.Attributes;
    }

    static async searchUsers(email, phoneNumber) {
        let user = null;
        if (email) {
            user = await this.getUserByEmail(email);
        } else if (phoneNumber) {
            user = await this.getUserByPhoneNumber(phoneNumber);
        }
        return user;
    }

    static async sendFriendRequest(senderEmail, receiverEmail) {
        const timestamp = new Date().toISOString();
        
        // Get sender and receiver users first
        const sender = await this.getUserByEmail(senderEmail);
        const receiver = await this.getUserByEmail(receiverEmail);
        
        if (!sender || !receiver) {
            throw new Error('User not found');
        }
        
        // Update sender's sent requests using userId
        await docClient.update({
            TableName: 'Users',
            Key: { userId: sender.userId },
            UpdateExpression: 'SET friendRequestsSent = list_append(if_not_exists(friendRequestsSent, :empty_list), :request)',
            ExpressionAttributeValues: {
                ':request': [{
                    email: receiverEmail,
                    timestamp: timestamp,
                    status: 'pending'
                }],
                ':empty_list': []
            }
        }).promise();

        // Update receiver's received requests using userId
        await docClient.update({
            TableName: 'Users',
            Key: { userId: receiver.userId },
            UpdateExpression: 'SET friendRequestsReceived = list_append(if_not_exists(friendRequestsReceived, :empty_list), :request)',
            ExpressionAttributeValues: {
                ':request': [{
                    email: senderEmail,
                    timestamp: timestamp,
                    status: 'pending'
                }],
                ':empty_list': []
            }
        }).promise();

        return { success: true };
    }

    static async respondToFriendRequest(userEmail, senderEmail, accept) {
        const timestamp = new Date().toISOString();

        // Get both users first
        const user = await this.getUserByEmail(userEmail);
        const sender = await this.getUserByEmail(senderEmail);
        
        if (!user || !sender) {
            throw new Error('User not found');
        }

        if (accept) {
            // Add to friends list for both users using userId
            await docClient.update({
                TableName: 'Users',
                Key: { userId: user.userId },
                UpdateExpression: 'SET friends = list_append(if_not_exists(friends, :empty_list), :friend)',
                ExpressionAttributeValues: {
                    ':friend': [{ email: senderEmail, timestamp }],
                    ':empty_list': []
                }
            }).promise();

            await docClient.update({
                TableName: 'Users',
                Key: { userId: sender.userId },
                UpdateExpression: 'SET friends = list_append(if_not_exists(friends, :empty_list), :friend)',
                ExpressionAttributeValues: {
                    ':friend': [{ email: userEmail, timestamp }],
                    ':empty_list': []
                }
            }).promise();
        }

        // Remove from received requests
        const updatedReceivedRequests = (user.friendRequestsReceived || [])
            .filter(request => request.email !== senderEmail);

        await docClient.update({
            TableName: 'Users',
            Key: { userId: user.userId },
            UpdateExpression: 'SET friendRequestsReceived = :requests',
            ExpressionAttributeValues: {
                ':requests': updatedReceivedRequests
            }
        }).promise();

        // Update sender's sent requests status
        const updatedSentRequests = (sender.friendRequestsSent || [])
            .filter(request => request.email !== userEmail);

        await docClient.update({
            TableName: 'Users',
            Key: { userId: sender.userId },
            UpdateExpression: 'SET friendRequestsSent = :requests',
            ExpressionAttributeValues: {
                ':requests': updatedSentRequests
            }
        }).promise();

        return { success: true };
    }

    static async getFriendRequests(userEmail) {
        const user = await this.getUserByEmail(userEmail);
        return {
            received: user.friendRequestsReceived || [],
            sent: user.friendRequestsSent || []
        };
    }

    static async getFriends(userEmail) {
        const user = await this.getUserByEmail(userEmail);
        return user.friends || [];
    }

    static async removeFriend(userEmail, friendEmail) {
        // Lấy thông tin cả hai user
        const user = await this.getUserByEmail(userEmail);
        const friend = await this.getUserByEmail(friendEmail);
        
        if (!user || !friend) {
            throw new Error('User not found');
        }

        // Lấy danh sách bạn bè hiện tại của người dùng
        const updatedFriends = (user.friends || []).filter(friend => friend.email !== friendEmail);

        // Cập nhật danh sách bạn bè của người dùng
        const params = {
            TableName: 'Users',
            Key: { userId: user.userId },
            UpdateExpression: 'SET friends = :friends',
            ExpressionAttributeValues: {
                ':friends': updatedFriends
            }
        };
        await docClient.update(params).promise();

        // Lấy danh sách bạn bè hiện tại của người bị xóa
        const updatedFriendsList = (friend.friends || []).filter(f => f.email !== userEmail);

        // Cập nhật danh sách bạn bè của người bị xóa
        const params2 = {
            TableName: 'Users',
            Key: { userId: friend.userId },
            UpdateExpression: 'SET friends = :friends',
            ExpressionAttributeValues: {
                ':friends': updatedFriendsList
            }
        };

        await docClient.update(params2).promise();
    }
}

module.exports = User; 