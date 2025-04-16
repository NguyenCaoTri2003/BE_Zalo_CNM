const express = require('express');
const router = express.Router();
const FileController = require('../controllers/file.controller');
const authenticateToken = require('../middleware/auth.middleware');

// API upload file
router.post('/upload', authenticateToken, FileController.uploadMiddleware, FileController.uploadFile);

// API lấy file
router.get('/:filename', authenticateToken, FileController.getFile);

module.exports = router; 