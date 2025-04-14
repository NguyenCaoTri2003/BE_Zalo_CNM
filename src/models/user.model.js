const { docClient, dynamodb } = require('../config/aws.config');

class User {
    static async createUser(userData) {
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
            Key: {
                email: email
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
                { AttributeName: 'email', KeyType: 'HASH' }
            ],
            AttributeDefinitions: [
                { AttributeName: 'email', AttributeType: 'S' }
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
        const params = {
            TableName: 'Users',
            Key: {
                email: email
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
        const params = {
            TableName: 'Users',
            Key: {
                email: email
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
                    email: email
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
        const params = {
            TableName: 'Users',
            Key: {
                email: email
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

    static async updateUser(email, updateData) {
        try {
            console.log('Updating user with email:', email);
            console.log('Update data:', updateData);

            // Kiểm tra xem người dùng có tồn tại không
            const existingUser = await this.getUserByEmail(email);
            if (!existingUser) {
                throw new Error('User not found');
            }

            // Loại bỏ email khỏi dữ liệu cập nhật vì nó là khóa chính
            const { email: _, ...updateDataWithoutEmail } = updateData;

            // Chỉ cập nhật các trường được cung cấp
            const updateExpressions = [];
            const expressionAttributeValues = {};
            const expressionAttributeNames = {};

            Object.keys(updateDataWithoutEmail).forEach((key, index) => {
                if (updateDataWithoutEmail[key] !== undefined && updateDataWithoutEmail[key] !== null) {
                    const attributeName = `#attr${index}`;
                    const attributeValue = `:val${index}`;
                    
                    updateExpressions.push(`${attributeName} = ${attributeValue}`);
                    expressionAttributeNames[attributeName] = key;
                    expressionAttributeValues[attributeValue] = updateDataWithoutEmail[key];
                }
            });

            if (updateExpressions.length === 0) {
                throw new Error('No valid fields to update');
            }

            const params = {
                TableName: 'Users',
                Key: {
                    email: email
                },
                UpdateExpression: `set ${updateExpressions.join(', ')}`,
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues,
                ReturnValues: 'ALL_NEW'
            };

            console.log('DynamoDB update params:', JSON.stringify(params, null, 2));

            const result = await docClient.update(params).promise();
            console.log('Update result:', JSON.stringify(result, null, 2));

            return result.Attributes;
        } catch (error) {
            console.error('Error in updateUser:', error);
            console.error('Error details:', {
                code: error.code,
                message: error.message,
                stack: error.stack
            });
            throw error;
        }
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
        
        // Update sender's sent requests
        await docClient.update({
            TableName: 'Users',
            Key: { email: senderEmail },
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

        // Update receiver's received requests
        await docClient.update({
            TableName: 'Users',
            Key: { email: receiverEmail },
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

        if (accept) {
            // Add to friends list for both users
            await docClient.update({
                TableName: 'Users',
                Key: { email: userEmail },
                UpdateExpression: 'SET friends = list_append(if_not_exists(friends, :empty_list), :friend)',
                ExpressionAttributeValues: {
                    ':friend': [{ email: senderEmail, timestamp }],
                    ':empty_list': []
                }
            }).promise();

            await docClient.update({
                TableName: 'Users',
                Key: { email: senderEmail },
                UpdateExpression: 'SET friends = list_append(if_not_exists(friends, :empty_list), :friend)',
                ExpressionAttributeValues: {
                    ':friend': [{ email: userEmail, timestamp }],
                    ':empty_list': []
                }
            }).promise();
        }

        // Remove from received requests
        const user = await this.getUserByEmail(userEmail);
        const updatedReceivedRequests = (user.friendRequestsReceived || [])
            .filter(request => request.email !== senderEmail);

        await docClient.update({
            TableName: 'Users',
            Key: { email: userEmail },
            UpdateExpression: 'SET friendRequestsReceived = :requests',
            ExpressionAttributeValues: {
                ':requests': updatedReceivedRequests
            }
        }).promise();

        // Update sender's sent requests status
        const sender = await this.getUserByEmail(senderEmail);
        const updatedSentRequests = (sender.friendRequestsSent || [])
            .filter(request => request.email !== userEmail);

        await docClient.update({
            TableName: 'Users',
            Key: { email: senderEmail },
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
}

module.exports = User; 