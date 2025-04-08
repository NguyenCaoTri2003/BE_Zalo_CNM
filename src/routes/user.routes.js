const express = require('express');
const router = express.Router();
const UserController = require('../controllers/user.controller');
const authenticateToken = require('../middleware/auth.middleware');

router.post('/register', UserController.register);
router.post('/login', UserController.login);
router.get('/profile', authenticateToken, UserController.getProfile);
router.post('/forgot-password', UserController.forgotPassword);
router.post('/reset-password', UserController.resetPassword);

module.exports = router; 