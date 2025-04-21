const jwt = require('jsonwebtoken');
const User = require('../models/user.model');

const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Access token is required' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Kiểm tra xem người dùng có tồn tại không
        const user = await User.getUserById(decoded.userId);
        if (!user) {
            return res.status(403).json({ message: 'User not found' });
        }
        
        // Thêm thông tin user vào request
        req.user = {
            ...decoded,
            id: decoded.userId // Đảm bảo có trường id
        };
        
        next();
    } catch (err) {
        return res.status(403).json({ message: 'Invalid or expired token' });
    }
};

module.exports = authenticateToken; 