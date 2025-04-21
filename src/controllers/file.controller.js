const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { s3 } = require('../config/aws.config');

// Cấu hình multer để lưu file trong memory thay vì disk
const storage = multer.memoryStorage();

// Cấu hình multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // Giới hạn kích thước file 10MB
  },
  fileFilter: function (req, file, cb) {
    // Cho phép tất cả các loại file
    cb(null, true);
  }
});

class FileController {
  // Middleware để xử lý upload
  static uploadMiddleware = upload.single('file');

  // API upload file
  static async uploadFile(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Không có file được tải lên',
          error: 'NO_FILE'
        });
      }

      // Tạo tên file ngẫu nhiên để tránh trùng lặp
      const uniqueFilename = `${uuidv4()}${path.extname(req.file.originalname)}`;

      // Upload file trực tiếp lên S3 trong thư mục uploadFile
      const s3Params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `uploadFile/${uniqueFilename}`,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
        ACL: 'public-read'
      };

      const s3Response = await s3.upload(s3Params).promise();

      // Trả về thông tin file
      return res.status(200).json({
        success: true,
        data: {
          filename: uniqueFilename,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          url: s3Response.Location
        }
      });
    } catch (error) {
      console.error('Lỗi khi upload file:', error);
      
      return res.status(500).json({
        success: false,
        message: 'Lỗi khi upload file',
        error: error.message
      });
    }
  }

  // API lấy file
  static async getFile(req, res) {
    try {
      const { filename } = req.params;
      
      // Lấy file từ S3 từ thư mục uploadFile
      const s3Params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `uploadFile/${filename}`
      };

      const s3Response = await s3.getObject(s3Params).promise();
      
      res.setHeader('Content-Type', s3Response.ContentType);
      res.setHeader('Content-Length', s3Response.ContentLength);
      res.send(s3Response.Body);
    } catch (error) {
      console.error('Lỗi khi lấy file:', error);
      return res.status(500).json({
        success: false,
        message: 'Lỗi khi lấy file',
        error: error.message
      });
    }
  }
}

module.exports = FileController; 