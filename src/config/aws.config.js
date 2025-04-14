const AWS = require('aws-sdk');

// Validate AWS credentials
const requiredEnvVars = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
    console.error('Missing required AWS environment variables:', missingEnvVars);
    throw new Error('AWS credentials are not properly configured');
}

// Configure AWS
AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
});

const dynamodb = new AWS.DynamoDB();
const docClient = new AWS.DynamoDB.DocumentClient();

// Create S3 instance
const s3 = new AWS.S3();

// Test DynamoDB connection
dynamodb.listTables({}, (err, data) => {
    if (err) {
        console.error('Error connecting to DynamoDB:', err);
    } else {
        console.log('Successfully connected to DynamoDB');
        console.log('Available tables:', data.TableNames);
    }
});

module.exports = {
    dynamodb,
    docClient,
    s3
}; 