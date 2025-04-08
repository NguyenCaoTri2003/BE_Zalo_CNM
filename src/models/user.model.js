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
}

module.exports = User; 