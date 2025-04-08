const express = require('express');
const router = express.Router();
const UploadController = require('../controllers/upload.controller');
const authenticateToken = require('../middleware/auth.middleware');

router.post('/upload', authenticateToken, UploadController.upload);

module.exports = router; 