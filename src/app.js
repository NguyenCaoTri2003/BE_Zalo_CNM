const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const userRoutes = require('./routes/user.routes');
const messageRoutes = require('./routes/message.routes');
const fileRoutes = require('./routes/file.routes');

const app = express();

// Cấu hình CORS
app.use(cors({
  origin: '*', // Cho phép tất cả các domain
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  credentials: true
}));

// Cấu hình body-parser cho JSON và URL-encoded
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Routes
app.use('/api', userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/files', fileRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    message: 'Lỗi server, vui lòng thử lại sau',
    error: err.message || 'SERVER_ERROR'
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app; 