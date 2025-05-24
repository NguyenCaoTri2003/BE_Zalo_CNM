const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { s3, docClient } = require('../config/aws.config');
const { getIO } = require('../services/socket');
const Message = require('../models/message.model');

// Biến toàn cục để lưu trữ thông tin xác nhận
const verificationStore = new Map();

class UserController {
    static async register(req, res) {
        try {
            const { fullName, email, password, phoneNumber } = req.body;

            if (!fullName || !email || !password || !phoneNumber) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Vui lòng điền đầy đủ thông tin',
                    error: 'MISSING_FIELDS'
                });
            }

            const existingUser = await User.getUserByEmail(email);
            if (existingUser) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Email đã được sử dụng',
                    error: 'EMAIL_EXISTS'
                });
            }

            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            const userData = {
                email: email,
                fullName: fullName,
                phoneNumber: phoneNumber,
                password: hashedPassword,
                createdAt: new Date().toISOString(),
                avatar: 'https://res.cloudinary.com/ds4v3awds/image/upload/v1743944990/l2eq6atjnmzpppjqkk1j.jpg'
            };

            const createdUser = await User.createUser(userData);

            const token = jwt.sign(
                { userId: createdUser.userId, email: email },
                process.env.JWT_SECRET,
                { expiresIn: '24h' }
            );

            res.status(201).json({
                success: true,
                message: 'Đăng ký thành công',
                token,
                user: {
                    userId: createdUser.userId,
                    email: email,
                    fullName: fullName,
                    phoneNumber: phoneNumber,
                    avatar: userData.avatar
                }
            });
        } catch (error) {
            console.error('Registration error:', error);
            res.status(500).json({ 
                success: false,
                message: 'Lỗi server, vui lòng thử lại sau',
                error: 'SERVER_ERROR'
            });
        }
    }

    static async login(req, res) {
        try {
            const { email, phoneNumber, password } = req.body;

            if ((!email && !phoneNumber) || !password) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Vui lòng nhập thông tin đăng nhập và mật khẩu',
                    error: 'MISSING_CREDENTIALS',
                    errorMessage: '<span style="color: red;">Vui lòng nhập thông tin đăng nhập và mật khẩu</span>'
                });
            }

            if (password.length < 8) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Mật khẩu phải có ít nhất 8 ký tự',
                    error: 'PASSWORD_TOO_SHORT',
                    errorMessage: '<span style="color: red;">Mật khẩu phải có ít nhất 8 ký tự</span>'
                });
            }

            let user = null;
            
            // Kiểm tra đăng nhập với email
            if (email) {
                user = await User.getUserByEmail(email);
                if (!user) {
                    return res.status(400).json({ 
                        success: false,
                        message: 'Email không tồn tại trong hệ thống',
                        error: 'EMAIL_NOT_FOUND',
                        errorMessage: '<span style="color: red;">Email không tồn tại trong hệ thống</span>'
                    });
                }
            } 
            // Kiểm tra đăng nhập với số điện thoại
            else if (phoneNumber) {
                user = await User.getUserByPhoneNumber(phoneNumber);
                if (!user) {
                    return res.status(400).json({ 
                        success: false,
                        message: 'Số điện thoại không tồn tại trong hệ thống',
                        error: 'PHONE_NOT_FOUND',
                        errorMessage: '<span style="color: red;">Số điện thoại không tồn tại trong hệ thống</span>'
                    });
                }
            }

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Mật khẩu không chính xác',
                    error: 'INVALID_PASSWORD',
                    errorMessage: '<span style="color: red;">Mật khẩu không chính xác</span>'
                });
            }

            const token = jwt.sign(
                { userId: user.userId, email: user.email },
                process.env.JWT_SECRET,
                { expiresIn: '24h' }
            );

            res.json({
                success: true,
                message: 'Đăng nhập thành công',
                token,
                user: {
                    userId: user.userId,
                    email: user.email,
                    fullName: user.fullName,
                    phoneNumber: user.phoneNumber,
                    avatar: user.avatar || 'https://res.cloudinary.com/ds4v3awds/image/upload/v1743944990/l2eq6atjnmzpppjqkk1j.jpg'
                }
            });
        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({ 
                success: false,
                message: 'Lỗi server, vui lòng thử lại sau',
                error: 'SERVER_ERROR',
                errorMessage: '<span style="color: red;">Lỗi server, vui lòng thử lại sau</span>'
            });
        }
    }

    static async getProfile(req, res) {
        try {
            const user = await User.getUserById(req.user.userId);
            if (!user) {
                return res.status(404).json({ 
                    success: false,
                    message: 'Không tìm thấy thông tin người dùng',
                    error: 'USER_NOT_FOUND'
                });
            }

            delete user.password;
            
            // Ensure avatar exists, or use default
            if (!user.avatar) {
                user.avatar = 'https://res.cloudinary.com/ds4v3awds/image/upload/v1743944990/l2eq6atjnmzpppjqkk1j.jpg';
            }
            
            res.json({
                success: true,
                message: 'Lấy thông tin thành công',
                user
            });
        } catch (error) {
            console.error('Profile error:', error);
            res.status(500).json({ 
                success: false,
                message: 'Lỗi server, vui lòng thử lại sau',
                error: 'SERVER_ERROR'
            });
        }
    }

    static async getProfileByEmail(req, res) {
        try {
            const { email } = req.params;
    
            const user = await User.getUserByEmail(email);
    
            if (!user) {
                return res.status(404).json({ 
                    success: false,
                    message: 'Không tìm thấy thông tin người dùng',
                    error: 'USER_NOT_FOUND'
                });
            }
    
            delete user.password;
    
            if (!user.avatar) {
                user.avatar = 'https://res.cloudinary.com/ds4v3awds/image/upload/v1743944990/l2eq6atjnmzpppjqkk1j.jpg';
            }
    
            res.json({
                success: true,
                user
            });
        } catch (error) {
            console.error('Profile error:', error);
            res.status(500).json({ 
                success: false,
                message: 'Lỗi server, vui lòng thử lại sau',
                error: 'SERVER_ERROR'
            });
        }
    }
    

    static async forgotPassword(req, res) {
        try {
            const { email } = req.body;
            console.log('Received forgot password request for email:', email);

            if (!email) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Vui lòng nhập email',
                    error: 'MISSING_EMAIL'
                });
            }

            const user = await User.getUserByEmail(email);
            console.log('Found user:', user ? 'Yes' : 'No');
            
            if (!user) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Email không tồn tại trong hệ thống',
                    error: 'EMAIL_NOT_FOUND'
                });
            }

            // Tạo mã xác nhận 6 chữ số
            const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
            const codeExpiry = Date.now() + 3600000; // 1 giờ
            console.log('Generated verification code:', verificationCode);
            console.log('Code expiry:', new Date(codeExpiry).toISOString());

            try {
                // Lưu mã xác nhận vào user data
                console.log('Attempting to save reset code to database...');
                const updateResult = await User.updateUserResetCode(email, {
                    resetCode: verificationCode,
                    resetCodeExpiry: codeExpiry
                });
                console.log('Reset code saved successfully. Update result:', JSON.stringify(updateResult, null, 2));

                // Verify the update immediately
                const verifyUser = await User.getUserByEmail(email);
                console.log('Verification - User after update:', JSON.stringify(verifyUser, null, 2));
            } catch (dbError) {
                console.error('Error saving reset code to database:', dbError);
                console.error('Error details:', {
                    code: dbError.code,
                    message: dbError.message,
                    stack: dbError.stack
                });
                throw dbError;
            }

            // Cấu hình nodemailer với service ít nghiêm ngặt hơn
            const transporter = nodemailer.createTransport({
                host: 'smtp.gmail.com',
                port: 587,
                secure: false, // true for 465, false for other ports
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASSWORD
                }
            });

            // Tạo nội dung email
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: 'Mã xác nhận đặt lại mật khẩu Zalo',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #0068ff;">Zalo - Đặt lại mật khẩu</h2>
                        <p>Chào bạn,</p>
                        <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản Zalo của bạn. Mã xác nhận của bạn là:</p>
                        <div style="text-align: center; margin: 30px 0;">
                            <div style="font-size: 32px; font-weight: bold; letter-spacing: 5px; padding: 15px; background-color: #f2f2f2; border-radius: 5px;">${verificationCode}</div>
                        </div>
                        <p>Mã xác nhận này sẽ hết hạn sau 1 giờ.</p>
                        <p>Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này hoặc liên hệ với chúng tôi nếu bạn có câu hỏi.</p>
                        <p>Trân trọng,<br>Đội ngũ Zalo</p>
                    </div>
                `
            };

            // Gửi email
            await transporter.sendMail(mailOptions);

            res.status(200).json({
                success: true,
                message: 'Mã xác nhận đã được gửi đến email của bạn'
            });
        } catch (error) {
            console.error('Forgot password error:', error);
            res.status(500).json({ 
                success: false,
                message: 'Lỗi server, vui lòng thử lại sau',
                error: 'SERVER_ERROR'
            });
        }
    }

    static async resetPassword(req, res) {
        try {
            const { email, code, newPassword } = req.body;

            if (!email || !code || !newPassword) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Vui lòng cung cấp email, mã xác nhận và mật khẩu mới',
                    error: 'MISSING_FIELDS'
                });
            }

            if (newPassword.length < 8) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Mật khẩu phải có ít nhất 8 ký tự',
                    error: 'PASSWORD_TOO_SHORT'
                });
            }

            // Tìm user với email
            const user = await User.getUserByEmail(email);
            if (!user) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Email không tồn tại trong hệ thống',
                    error: 'EMAIL_NOT_FOUND'
                });
            }

            // Kiểm tra mã xác nhận
            if (!user.resetCode || user.resetCode !== code) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Mã xác nhận không chính xác',
                    error: 'INVALID_CODE'
                });
            }

            // Kiểm tra thời hạn mã
            if (!user.resetCodeExpiry || user.resetCodeExpiry < Date.now()) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Mã xác nhận đã hết hạn',
                    error: 'CODE_EXPIRED'
                });
            }

            // Hash mật khẩu mới
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(newPassword, salt);

            // Cập nhật mật khẩu và xóa mã xác nhận
            await User.updateUserPasswordWithCode(email, hashedPassword);

            res.status(200).json({
                success: true,
                message: 'Mật khẩu đã được đặt lại thành công'
            });
        } catch (error) {
            console.error('Reset password error:', error);
            res.status(500).json({ 
                success: false,
                message: 'Lỗi server, vui lòng thử lại sau',
                error: 'SERVER_ERROR'
            });
        }
    }

    static async updateProfile(req, res) {
        try {
            const { fullName, gender, phoneNumber, address } = req.body;
            const userId = req.user.userId;

            // Prepare update data
            const updateData = {
                fullName,
                gender,
                phoneNumber,
                address
            };

            // Remove undefined fields
            Object.keys(updateData).forEach(key => {
                if (updateData[key] === undefined) {
                    delete updateData[key];
                }
            });

            // Update user in DynamoDB
            const updatedUser = await User.updateUser(userId, updateData);
            delete updatedUser.password;

            res.json({
                success: true,
                message: 'Cập nhật thông tin thành công',
                user: updatedUser
            });
        } catch (error) {
            console.error('Update profile error:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi server, vui lòng thử lại sau',
                error: 'SERVER_ERROR'
            });
        }
    }

    static async uploadAvatar(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: 'Không tìm thấy file ảnh',
                    error: 'NO_FILE'
                });
            }

            // Kiểm tra file type
            const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
            if (!allowedTypes.includes(req.file.mimetype)) {
                return res.status(400).json({
                    success: false,
                    message: 'Chỉ chấp nhận file ảnh (JPEG, PNG, GIF)',
                    error: 'INVALID_FILE_TYPE'
                });
            }

            // Kiểm tra kích thước file (tối đa 10MB)
            const maxSize = 10 * 1024 * 1024; // 10MB
            if (req.file.size > maxSize) {
                return res.status(400).json({
                    success: false,
                    message: 'Kích thước file quá lớn (tối đa 10MB)',
                    error: 'FILE_TOO_LARGE'
                });
            }

            const fileName = `avatars/${req.user.userId}-${Date.now()}.${req.file.mimetype.split('/')[1]}`;
            
            const params = {
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: fileName,
                Body: req.file.buffer,
                ContentType: req.file.mimetype
            };

            const result = await s3.upload(params).promise();
            const avatarUrl = result.Location;

            // Cập nhật avatar trong database
            await User.updateUser(req.user.userId, { avatar: avatarUrl });

            res.json({
                success: true,
                message: 'Cập nhật ảnh đại diện thành công',
                avatarUrl
            });
        } catch (error) {
            console.error('Upload avatar error:', error);
            if (error.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({
                    success: false,
                    message: 'Kích thước file quá lớn (tối đa 10MB)',
                    error: 'FILE_TOO_LARGE'
                });
            }
            res.status(500).json({
                success: false,
                message: 'Lỗi server, vui lòng thử lại sau',
                error: 'SERVER_ERROR'
            });
        }
    }

    static async updatePassword(req, res) {
        try {
            const { currentPassword, newPassword } = req.body;
            const userId = req.user.userId;
    
            if (!currentPassword || !newPassword) {
                return res.status(400).json({
                    success: false,
                    message: 'Vui lòng nhập đầy đủ mật khẩu hiện tại và mật khẩu mới',
                    error: 'MISSING_PASSWORD_FIELDS'
                });
            }
    
            if (newPassword.length < 8) {
                return res.status(400).json({
                    success: false,
                    message: 'Mật khẩu mới phải có ít nhất 8 ký tự',
                    error: 'PASSWORD_TOO_SHORT'
                });
            }
    
            const user = await User.getUserById(userId);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'Người dùng không tồn tại',
                    error: 'USER_NOT_FOUND'
                });
            }
    
            const isMatch = await bcrypt.compare(currentPassword, user.password);
            if (!isMatch) {
                return res.status(400).json({
                    success: false,
                    message: 'Mật khẩu hiện tại không chính xác',
                    error: 'INVALID_CURRENT_PASSWORD'
                });
            }
    
            const salt = await bcrypt.genSalt(10);
            const hashedNewPassword = await bcrypt.hash(newPassword, salt);
    
            await User.updateUser(userId, { password: hashedNewPassword });
    
            res.status(200).json({
                success: true,
                message: 'Đổi mật khẩu thành công'
            });
    
        } catch (error) {
            console.error('Update password error:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi server, vui lòng thử lại sau',
                error: 'SERVER_ERROR'
            });
        }
    }

    static async updateProfileWeb(req, res) {
        try {
            const { fullName, gender, phoneNumber, address } = req.body;
            const userId = req.user.userId;

            // Log the received gender value and its type for debugging
            console.log('Received updateProfileWeb request with data:', req.body);
            console.log('Type of received gender:', typeof gender);

            // Prepare update data
            const updateData = {
                fullName,
                gender, // gender should be boolean here
                phoneNumber,
                address
            };

            // Remove undefined fields
            Object.keys(updateData).forEach(key => {
                // Keep boolean 'false' but remove undefined/null
                if (updateData[key] === undefined || updateData[key] === null) {
                    // Allow null for address to clear it
                    if (key !== 'address') {
                        delete updateData[key];
                    }
                }
            });

            // Log the data being sent to the model update function
            console.log('Prepared updateData for User.updateUser:', updateData);

            // Update user in DynamoDB
            const updatedUser = await User.updateUser(userId, updateData);
            delete updatedUser.password; // Ensure password is not sent back

            res.json({
                success: true,
                message: 'Cập nhật thông tin thành công',
                user: updatedUser
            });
        } catch (error) {
            console.error('Update profile error:', error);
            // Provide more specific error feedback if possible
            const errorMessage = error.message || 'Lỗi server không xác định';
            let statusCode = 500;
            let errorCode = 'SERVER_ERROR';

            if (errorMessage.includes('User not found')) {
                statusCode = 404;
                errorCode = 'USER_NOT_FOUND';
            } else if (errorMessage.includes('ValidationException')) {
                statusCode = 400;
                errorCode = 'VALIDATION_ERROR';
                console.error('DynamoDB Validation Exception potentially due to type mismatch (e.g., gender column type).');
            }
            
            res.status(statusCode).json({
                success: false,
                message: `Lỗi server: ${errorMessage}`,
                error: errorCode
            });
        }
    }

    static async sendVerificationCode(req, res) {
        try {
            const { email } = req.body;
            console.log('Received verification request for email:', email);

            if (!email) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Vui lòng nhập email',
                    error: 'MISSING_EMAIL'
                });
            }

            // Kiểm tra email đã tồn tại chưa
            const existingUser = await User.getUserByEmail(email);
            if (existingUser) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Email đã được sử dụng',
                    error: 'EMAIL_EXISTS'
                });
            }

            // Tạo mã xác nhận 6 chữ số
            const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
            const codeExpiry = Date.now() + 3600000; // 1 giờ

            // Lưu mã xác nhận vào bộ nhớ tạm thời
            verificationStore.set(email, {
                code: verificationCode,
                expiry: codeExpiry
            });

            // Gửi email xác nhận
            const transporter = nodemailer.createTransport({
                host: 'smtp.gmail.com',
                port: 587,
                secure: false,
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASSWORD
                }
            });

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: 'Mã xác nhận đăng ký tài khoản Zalo',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #0068ff;">Xác nhận đăng ký tài khoản Zalo</h2>
                        <p>Xin chào,</p>
                        <p>Chúng tôi đã nhận được yêu cầu đăng ký tài khoản Zalo với email này.</p>
                        <p>Mã xác nhận của bạn là: <strong style="font-size: 24px; color: #0068ff;">${verificationCode}</strong></p>
                        <p>Mã xác nhận sẽ hết hạn sau 1 giờ.</p>
                        <p>Nếu bạn không yêu cầu đăng ký, vui lòng bỏ qua email này.</p>
                        <p>Trân trọng,<br>Đội ngũ Zalo</p>
                    </div>
                `
            };

            console.log("verificationCode:", verificationCode); 

            await transporter.sendMail(mailOptions);

            res.json({
                success: true,
                message: 'Mã xác nhận đã được gửi đến email của bạn'
            });
        } catch (error) {
            console.error('Send verification code error:', error);
            res.status(500).json({ 
                success: false,
                message: 'Không thể gửi mã xác nhận. Vui lòng thử lại sau',
                error: 'SERVER_ERROR'
            });
        }
    }

    static async verifyAndRegister(req, res) {
        try {
            const { email, code, fullName, password, phoneNumber } = req.body;
            console.log('Received verification and registration request:', { email, code });

            if (!email || !code || !fullName || !password || !phoneNumber) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Vui lòng điền đầy đủ thông tin',
                    error: 'MISSING_FIELDS',
                    errorMessage: '<span style="color: red;">Vui lòng điền đầy đủ thông tin</span>'
                });
            }

            // Kiểm tra mật khẩu không được chứa khoảng trắng
            if (password.includes(' ')) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Mật khẩu không được chứa khoảng trắng',
                    error: 'PASSWORD_CONTAINS_SPACE',
                    errorMessage: '<span style="color: red;">Mật khẩu không được chứa khoảng trắng</span>'
                });
            }

            // Kiểm tra độ dài mật khẩu
            if (password.length < 8) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Mật khẩu phải có ít nhất 8 ký tự',
                    error: 'PASSWORD_TOO_SHORT',
                    errorMessage: '<span style="color: red;">Mật khẩu phải có ít nhất 8 ký tự</span>'
                });
            }

            // Kiểm tra mật khẩu phải chứa ít nhất 1 chữ hoa, 1 chữ thường, 1 số và 1 ký tự đặc biệt
            const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
            if (!passwordRegex.test(password)) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Mật khẩu phải chứa ít nhất 1 chữ hoa, 1 chữ thường, 1 số và 1 ký tự đặc biệt',
                    error: 'PASSWORD_INVALID_FORMAT',
                    errorMessage: '<span style="color: red;">Mật khẩu phải chứa ít nhất 1 chữ hoa, 1 chữ thường, 1 số và 1 ký tự đặc biệt</span>'
                });
            }

            // Kiểm tra mã xác nhận từ bộ nhớ tạm thời
            const verificationData = verificationStore.get(email);
            if (!verificationData) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Mã xác nhận không hợp lệ',
                    error: 'INVALID_CODE',
                    errorMessage: '<span style="color: red;">Mã xác nhận không hợp lệ</span>'
                });
            }

            if (verificationData.code !== code) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Mã xác nhận không chính xác',
                    error: 'INVALID_CODE',
                    errorMessage: '<span style="color: red;">Mã xác nhận không chính xác</span>'
                });
            }

            if (Date.now() > verificationData.expiry) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Mã xác nhận đã hết hạn',
                    error: 'CODE_EXPIRED',
                    errorMessage: '<span style="color: red;">Mã xác nhận đã hết hạn</span>'
                });
            }

            // Mã hóa mật khẩu
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            // Tạo user mới
            const userData = {
                email: email,
                fullName: fullName,
                phoneNumber: phoneNumber,
                password: hashedPassword,
                createdAt: new Date().toISOString(),
                avatar: 'https://res.cloudinary.com/ds4v3awds/image/upload/v1743944990/l2eq6atjnmzpppjqkk1j.jpg'
            };

            await User.createUser(userData);

            // Xóa mã xác nhận khỏi bộ nhớ tạm thời
            verificationStore.delete(email);

            res.json({
                success: true,
                message: 'Đăng ký thành công'
            });
        } catch (error) {
            console.error('Verify and register error:', error);
            res.status(500).json({ 
                success: false,
                message: 'Đăng ký thất bại. Vui lòng thử lại sau',
                error: 'SERVER_ERROR',
                errorMessage: '<span style="color: red;">Đăng ký thất bại. Vui lòng thử lại sau</span>'
            });
        }
    }

    static async searchUser(req, res) {
        try {
            const { email, phoneNumber } = req.query;
            
            if (!email && !phoneNumber) {
                return res.status(400).json({
                    success: false,
                    message: 'Vui lòng cung cấp email hoặc số điện thoại để tìm kiếm'
                });
            }

            const user = await User.searchUsers(email, phoneNumber);

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy người dùng'
                });
            }

            // Ẩn thông tin nhạy cảm và chỉ trả về thông tin cần thiết
            const { password, resetToken, resetTokenExpiry, ...userWithoutSensitiveInfo } = user;
            
            // Đảm bảo có avatar mặc định nếu không có
            if (!userWithoutSensitiveInfo.avatar) {
                userWithoutSensitiveInfo.avatar = 'https://res.cloudinary.com/ds4v3awds/image/upload/v1743944990/l2eq6atjnmzpppjqkk1j.jpg';
            }

            res.status(200).json({
                success: true,
                data: {
                    fullName: userWithoutSensitiveInfo.fullName,
                    avatar: userWithoutSensitiveInfo.avatar,
                    phoneNumber: userWithoutSensitiveInfo.phoneNumber,
                    email: userWithoutSensitiveInfo.email
                }
            });
        } catch (error) {
            console.error('Error searching user:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi server, vui lòng thử lại sau'
            });
        }
    }

    static async sendFriendRequest(req, res) {
        try {
            const senderEmail = req.user.email;
            const { receiverEmail } = req.body;

            if (!receiverEmail) {
                return res.status(400).json({
                    success: false,
                    message: 'Vui lòng cung cấp email người nhận'
                });
            }

            // Kiểm tra xem người nhận có tồn tại không
            const receiver = await User.getUserByEmail(receiverEmail);
            if (!receiver) {
                return res.status(404).json({
                    success: false,
                    message: 'Người dùng không tồn tại'
                });
            }

            // Kiểm tra xem đã gửi lời mời chưa
            const sender = await User.getUserByEmail(senderEmail);
            const hasSentRequest = (sender.friendRequestsSent || [])
                .some(request => request.email === receiverEmail);

            if (hasSentRequest) {
                return res.status(400).json({
                    success: false,
                    message: 'Bạn đã gửi lời mời kết bạn trước đó'
                });
            }

            // Gửi lời mời kết bạn
            await User.sendFriendRequest(senderEmail, receiverEmail);

            // Gửi thông báo qua Socket.IO
            const io = getIO();
            io.emit(`friendRequestUpdate:${receiverEmail}`, {
                type: 'newRequest',
                sender: {
                    email: sender.email,
                    fullName: sender.fullName,
                    avatar: sender.avatar
                }
            });

            res.status(200).json({
                success: true,
                message: 'Đã gửi lời mời kết bạn'
            });
        } catch (error) {
            console.error('Send friend request error:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi server, vui lòng thử lại sau'
            });
        }
    }

    static async respondToFriendRequest(req, res) {
        try {
            const userEmail = req.user.email;
            const { senderEmail, accept } = req.body;

            if (!senderEmail || accept === undefined) {
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu thông tin cần thiết'
                });
            }

            // Check if request exists
            const requests = await User.getFriendRequests(userEmail);
            if (!requests.received.some(request => request.email === senderEmail)) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy lời mời kết bạn'
                });
            }

            await User.respondToFriendRequest(userEmail, senderEmail, accept);

            // Gửi thông báo qua Socket.IO
            const io = getIO();
            io.emit(`friendRequestResponded:${senderEmail}`, {
                receiverEmail: userEmail,
                accept
            });

            res.status(200).json({
                success: true,
                message: accept ? 'Đã chấp nhận lời mời kết bạn' : 'Đã từ chối lời mời kết bạn'
            });
        } catch (error) {
            console.error('Respond to friend request error:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi server, vui lòng thử lại sau'
            });
        }
    }

    static async getFriendRequests(req, res) {
        try {
            const userEmail = req.user.email;
            const requests = await User.getFriendRequests(userEmail);

            // Get full user info for each request
            const receivedWithInfo = await Promise.all(
                requests.received.map(async (request) => {
                    const user = await User.getUserByEmail(request.email);
                    return {
                        ...request,
                        fullName: user.fullName,
                        avatar: user.avatar
                    };
                })
            );

            const sentWithInfo = await Promise.all(
                requests.sent.map(async (request) => {
                    const user = await User.getUserByEmail(request.email);
                    return {
                        ...request,
                        fullName: user.fullName,
                        avatar: user.avatar
                    };
                })
            );

            res.status(200).json({
                success: true,
                data: {
                    received: receivedWithInfo,
                    sent: sentWithInfo
                }
            });
        } catch (error) {
            console.error('Get friend requests error:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi server, vui lòng thử lại sau'
            });
        }
    }

    static async getFriends(req, res) {
        try {
            const userEmail = req.user.email;
            const friends = await User.getFriends(userEmail);

            // Get full user info for each friend
            const friendsWithInfo = await Promise.all(
                friends.map(async (friend) => {
                    const user = await User.getUserByEmail(friend.email);
                    return {
                        ...friend,
                        userId: user.userId,
                        fullName: user.fullName,
                        avatar: user.avatar,
                        phoneNumber: user.phoneNumber 
                    };
                })
            );

            res.status(200).json({
                success: true,
                data: friendsWithInfo
            });
        } catch (error) {
            console.error('Get friends error:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi server, vui lòng thử lại sau'
            });
        }
    }

    static async withdrawFriendRequest(req, res) {
        try {
            const senderEmail = req.user.email;
            const { receiverEmail } = req.body;

            if (!receiverEmail) {
                return res.status(400).json({
                    success: false,
                    message: 'Vui lòng cung cấp email người nhận'
                });
            }

            // Get both users first
            const sender = await User.getUserByEmail(senderEmail);
            const receiver = await User.getUserByEmail(receiverEmail);
            
            if (!sender || !receiver) {
                return res.status(404).json({
                    success: false,
                    message: 'Người dùng không tồn tại'
                });
            }

            // Check if request exists
            const sentRequest = (sender.friendRequestsSent || [])
                .find(request => request.email === receiverEmail);

            if (!sentRequest) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy lời mời kết bạn'
                });
            }

            // Remove from sender's sent requests
            const updatedSentRequests = (sender.friendRequestsSent || [])
                .filter(request => request.email !== receiverEmail);

            await docClient.update({
                TableName: 'Users',
                Key: { userId: sender.userId },
                UpdateExpression: 'SET friendRequestsSent = :requests',
                ExpressionAttributeValues: {
                    ':requests': updatedSentRequests
                }
            }).promise();

            // Remove from receiver's received requests
            const updatedReceivedRequests = (receiver.friendRequestsReceived || [])
                .filter(request => request.email !== senderEmail);

            await docClient.update({
                TableName: 'Users',
                Key: { userId: receiver.userId },
                UpdateExpression: 'SET friendRequestsReceived = :requests',
                ExpressionAttributeValues: {
                    ':requests': updatedReceivedRequests
                }
            }).promise();

            // Gửi thông báo qua Socket.IO
            const io = getIO();
            io.emit(`friendRequestWithdrawn:${receiverEmail}`, {
                senderEmail
            });

            res.status(200).json({
                success: true,
                message: 'Đã thu hồi lời mời kết bạn'
            });
        } catch (error) {
            console.error('Withdraw friend request error:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi server, vui lòng thử lại sau'
            });
        }
    }

    static async unfriend(req, res) {
        try {
            const userEmail = req.user.email;
            const { friendEmail } = req.body;

            if (!friendEmail) {
                return res.status(400).json({
                    success: false,
                    message: 'Vui lòng cung cấp email người bạn muốn xóa'
                });
            }

            // Kiểm tra xem có phải là bạn bè không
            const user = await User.getUserByEmail(userEmail);
            const isFriend = (user.friends || []).some(friend => friend.email === friendEmail);

            if (!isFriend) {
                return res.status(404).json({
                    success: false,
                    message: 'Người dùng này không phải là bạn bè của bạn'
                });
            }

            // Xóa bạn bè
            await User.removeFriend(userEmail, friendEmail);

            await Message.permanentlyDeleteMessagesBetweenUsers(userEmail, friendEmail);

            // Gửi thông báo qua Socket.IO
            const io = getIO();
            io.emit(`friendshipUpdate:${friendEmail}`, {
                type: 'unfriend',
                userEmail: userEmail
            });

            res.status(200).json({
                success: true,
                message: 'Đã xóa bạn bè thành công'
            });
        } catch (error) {
            console.error('Unfriend error:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi server, vui lòng thử lại sau'
            });
        }
    }
}

module.exports = UserController; 