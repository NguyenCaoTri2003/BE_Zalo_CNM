// Load environment variables first
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Log environment variables for debugging
console.log('AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? '***' : 'not set');
console.log('AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? '***' : 'not set');
console.log('AWS_REGION:', process.env.AWS_REGION || 'not set');

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const { initializeSocket } = require('./services/socket');

const User = require('./models/user.model');
const Message = require('./models/message.model');
const Group = require('./models/group.model');

const app = express();
const server = http.createServer(app);

// Initialize socket.io
const io = initializeSocket(server);

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
  exposedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400 // 24 hours
}));

// Log CORS configuration
console.log('CORS Configuration:', {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
  credentials: true
});

// Add headers for socket.io
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  next();
});

// Add socket.io path
app.use('/socket.io/', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  next();
});

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Initialize DynamoDB tables
User.createUsersTable().catch(err => {
    console.error('Error initializing DynamoDB:', err);
});

Message.createTable().catch(err => {
    console.error('Error creating Messages table:', err);
});

Group.createTable().catch(err => {
    console.error('Error creating Groups table:', err);
});

// Add io instance to request object
app.use((req, res, next) => {
    req.io = io;
    next();
});

// Routes
const userRoutes = require('./routes/user.routes');
const uploadRoutes = require('./routes/upload.routes');
const messageRoutes = require('./routes/message.routes');
const fileRoutes = require('./routes/file.routes');
const groupRoutes = require('./routes/group.routes');

app.use('/api', userRoutes);
app.use('/api', uploadRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/groups', groupRoutes);

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
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 