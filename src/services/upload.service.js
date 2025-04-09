const { s3 } = require('../config/aws.config');

class UploadService {
    static async uploadFile(file, fileName, fileType) {
        const params = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: fileName,
            Body: file,
            ContentType: fileType,
            ACL: 'public-read'
        };

        const result = await s3.upload(params).promise();
        return result.Location;
    }
}

module.exports = UploadService; 