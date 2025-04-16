const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { s3 } = require('../config/aws.config');

// Cấu hình multer để lưu file tạm thời
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../../uploads');
    // Tạo thư mục nếu chưa tồn tại
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Tạo tên file ngẫu nhiên để tránh trùng lặp
    const uniqueFilename = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueFilename);
  }
});

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

      // Upload file lên S3
      const fileStream = fs.createReadStream(req.file.path);
      const s3Params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: req.file.filename,
        Body: fileStream,
        ContentType: req.file.mimetype,
        ACL: 'public-read'
      };

      const s3Response = await s3.upload(s3Params).promise();
      
      // Xóa file tạm sau khi upload lên S3
      try {
        fs.unlinkSync(req.file.path);
      } catch (error) {
        console.error('Error deleting temp file:', error);
      }

      // Trả về thông tin file
      return res.status(200).json({
        success: true,
        data: {
          filename: req.file.filename,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          url: s3Response.Location
        }
      });
    } catch (error) {
      console.error('Lỗi khi upload file:', error);
      
      // Xóa file tạm nếu có lỗi
      if (req.file && req.file.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (unlinkError) {
          console.error('Error deleting temp file:', unlinkError);
        }
      }

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
      
      // Lấy file từ S3
      const s3Params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: filename
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