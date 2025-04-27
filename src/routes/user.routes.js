const express = require('express');
const router = express.Router();
const UserController = require('../controllers/user.controller');
const authenticateToken = require('../middleware/auth.middleware');
const upload = require('../config/multer.config');
const jwt = require('jsonwebtoken');

// Test route
router.get('/test', (req, res) => {
    res.json({ message: 'API is working!' });
});

// Registration routes
router.post('/register/send-verification', UserController.sendVerificationCode);
router.post('/register/verify', UserController.verifyAndRegister);
router.post('/register', UserController.register);

// Authentication routes
router.post('/login', UserController.login);
router.get('/profile', authenticateToken, UserController.getProfile);
router.get('/profile/:email', authenticateToken, UserController.getProfileByEmail);
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
router.post('/friends/unfriend', authenticateToken, UserController.unfriend);

// Route test để lấy token
router.post('/test-token', (req, res) => {
    try {
        const userId = req.body.userId || 'test-user-id';
        // Tạo token với đầy đủ thông tin
        const tokenData = {
            userId: userId,
            email: `test-${userId}@example.com`,
            iat: Math.floor(Date.now() / 1000)
        };
        
        const token = jwt.sign(tokenData, process.env.JWT_SECRET || 'your-secret-key');
        
        console.log('Generated token data:', tokenData); // Debug log
        
        res.json({ 
            success: true,
            data: {
                token,
                userId
            }
        });
    } catch (error) {
        console.error('Error generating token:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router; 