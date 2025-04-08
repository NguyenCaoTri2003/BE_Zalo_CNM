const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

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

            await User.createUser(userData);

            const token = jwt.sign(
                { email: email },
                process.env.JWT_SECRET,
                { expiresIn: '24h' }
            );

            res.status(201).json({
                success: true,
                message: 'Đăng ký thành công',
                token,
                user: {
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
                    error: 'MISSING_CREDENTIALS'
                });
            }

            if (password.length < 6) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Mật khẩu phải có ít nhất 6 ký tự',
                    error: 'PASSWORD_TOO_SHORT'
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
                        error: 'EMAIL_NOT_FOUND'
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
                        error: 'PHONE_NOT_FOUND'
                    });
                }
            }

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Mật khẩu không chính xác',
                    error: 'INVALID_PASSWORD'
                });
            }

            const token = jwt.sign(
                { email: user.email },
                process.env.JWT_SECRET,
                { expiresIn: '24h' }
            );

            res.json({
                success: true,
                message: 'Đăng nhập thành công',
                token,
                user: {
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
                error: 'SERVER_ERROR'
            });
        }
    }

    static async getProfile(req, res) {
        try {
            const user = await User.getUserByEmail(req.user.email);
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

    static async forgotPassword(req, res) {
        try {
            const { email } = req.body;

            if (!email) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Vui lòng nhập email',
                    error: 'MISSING_EMAIL'
                });
            }

            const user = await User.getUserByEmail(email);
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

            // Lưu mã xác nhận vào user data
            await User.updateUserResetCode(email, {
                resetCode: verificationCode,
                resetCodeExpiry: codeExpiry
            });

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

            if (newPassword.length < 6) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Mật khẩu phải có ít nhất 6 ký tự',
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
}

module.exports = UserController; 