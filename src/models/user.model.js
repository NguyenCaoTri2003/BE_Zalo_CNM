const { docClient, dynamodb } = require('../config/aws.config');

class User {
    static async createUser(userData) {
        const params = {
            TableName: 'Users',
            Item: userData
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
            ReturnValues: 'UPDATED_NEW'
        };
        await docClient.update(params).promise();
        return codeData;
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

            // Chuyển đổi giới tính thành boolean nếu có
            if ('gender' in updateDataWithoutEmail) {
                updateDataWithoutEmail.gender = updateDataWithoutEmail.gender === 'male';
            }

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
}

module.exports = User; 