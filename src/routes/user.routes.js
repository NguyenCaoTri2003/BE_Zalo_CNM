const express = require('express');
const router = express.Router();
const UserController = require('../controllers/user.controller');
const authenticateToken = require('../middleware/auth.middleware');
const upload = require('../config/multer.config');

// Registration routes
router.post('/register/send-verification', UserController.sendVerificationCode);
router.post('/register/verify', UserController.verifyAndRegister);
router.post('/register', UserController.register);

// Authentication routes
router.post('/login', UserController.login);
router.get('/profile', authenticateToken, UserController.getProfile);
router.put('/profile', authenticateToken, UserController.updateProfile);
router.put('/profileweb', authenticateToken, UserController.updateProfileWeb);

// Password management routes
router.post('/forgot-password', UserController.forgotPassword);
router.post('/reset-password', UserController.resetPassword);
router.put('/update-password', authenticateToken, UserController.updatePassword);

// Avatar management
router.post('/upload-avatar', authenticateToken, upload.single('avatar'), UserController.uploadAvatar);

// Search user
router.get('/search', UserController.searchUser);

// Friend management
router.post('/friend-request/send', authenticateToken, UserController.sendFriendRequest);
router.post('/friend-request/respond', authenticateToken, UserController.respondToFriendRequest);
router.post('/friend-request/withdraw', authenticateToken, UserController.withdrawFriendRequest);
router.get('/friend-requests', authenticateToken, UserController.getFriendRequests);
router.get('/friends', authenticateToken, UserController.getFriends);

module.exports = router; 