const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables first
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const User = require('./models/user.model');

const app = express();

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
  exposedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Initialize DynamoDB
User.createUsersTable().catch(err => {
    console.error('Error initializing DynamoDB:', err);
});

// Routes
const userRoutes = require('./routes/user.routes');
const uploadRoutes = require('./routes/upload.routes');

app.use('/api', userRoutes);
app.use('/api', uploadRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        success: false,
        message: err.message || 'Server error, please try again later',
        error: 'SERVER_ERROR'
    });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 