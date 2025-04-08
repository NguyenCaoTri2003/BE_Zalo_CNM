const UploadService = require('../services/upload.service');

class UploadController {
    static async upload(req, res) {
        try {
            const { file, fileName, fileType } = req.body;

            if (!file || !fileName || !fileType) {
                return res.status(400).json({ message: 'File, fileName, and fileType are required' });
            }

            const url = await UploadService.uploadFile(file, fileName, fileType);
            res.json({ url });
        } catch (error) {
            console.error('Upload error:', error);
            res.status(500).json({ message: 'Upload failed' });
        }
    }
}

module.exports = UploadController; 