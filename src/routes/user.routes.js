const express = require('express');
const router = express.Router();
const UserController = require('../controllers/user.controller');
const authenticateToken = require('../middleware/auth.middleware');
const upload = require('../config/multer.config');

router.post('/register', UserController.register);
router.post('/login', UserController.login);
router.get('/profile', authenticateToken, UserController.getProfile);
router.put('/profile', authenticateToken, UserController.updateProfile);
router.put('/profileweb', authenticateToken, UserController.updateProfileWeb);
router.post('/forgot-password', UserController.forgotPassword);
router.post('/reset-password', UserController.resetPassword);
router.post('/upload-avatar', authenticateToken, upload.single('avatar'), UserController.uploadAvatar);
router.put('/update-password', authenticateToken, UserController.updatePassword);

module.exports = router; 