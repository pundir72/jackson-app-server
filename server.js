require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const config = require('./config/config');
const winston = require('winston');
const socketIo = require('socket.io');
const Redis = require('ioredis');

// Initialize Redis client
let redis;
try {
    redis = new Redis(config.REDIS_URL);
    redis.on('error', (error) => {
        console.error('Redis connection error:', error);
        redis = null; // Set to null on connection error
    });
    redis.on('connect', () => {
        console.log('Connected to Redis');
    });
} catch (error) {
    console.error('Failed to connect to Redis:', error);
    redis = null; // Set to null if Redis is not available
}

// Log Redis status
if (redis) {
    console.log('Redis client initialized successfully');
} else {
    console.log('Redis client not available - continuing without Redis');
}

// Initialize Winston logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' })
    ]
});

// Express app
const app = express();

// Middleware setup
app.use(cors());
app.use(helmet());
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const apiLimiter = rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    max: config.RATE_LIMIT_MAX_REQUESTS
});

// Apply rate limiting to all routes
app.use(apiLimiter);

// MongoDB connection
mongoose.connect(config.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => {
    console.log('Connected to MongoDB');
    
    // Create server
    const server = app.listen(config.PORT, () => {
        console.log(`Server is running on port ${config.PORT}`);
    }).on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            console.error(`Port ${config.PORT} is already in use. Please try a different port or kill the process using this port.`);
            process.exit(1);
        } else {
            console.error('Server error:', error);
            process.exit(1);
        }
    });

    // Initialize Socket.io
    const io = socketIo(server, {
        cors: {
            origin: process.env.FRONTEND_URL || '*',
            methods: ['GET', 'POST']
        }
    });

    // Socket.io event handlers
    io.on('connection', (socket) => {
        console.log('New client connected');
        
        socket.on('join-room', (roomId) => {
            socket.join(roomId);
        });
        
        socket.on('leave-room', (roomId) => {
            socket.leave(roomId);
        });
        
        socket.on('disconnect', () => {
            console.log('Client disconnected');
        });
    });

    // Routes setup
    const authRoutes = require('./routes/auth');
    const onboardingRoutes = require('./routes/onboarding');
    const homeRoutes = require('./routes/home');
    const walletRoutes = require('./routes/wallet');
    const vipRoutes = require('./routes/vip');
    const gameRoutes = require('./routes/game');
    const profileRoutes = require('./routes/profile');
    const cashCoachRoutes = require('./routes/cashCoach');
    const biometricRoutes = require('./routes/biometric');
    const locationRoutes = require('./routes/location');
    const disclosureRoutes = require('./routes/disclosure');
    const testRoutes = require('./routes/test');

    // API Routes
    app.use('/api/auth', authRoutes);
    app.use('/api/onboarding', onboardingRoutes);
    app.use('/api/home', homeRoutes);
    app.use('/api/wallet', walletRoutes);
    app.use('/api/vip', vipRoutes);
    app.use('/api/game', gameRoutes);
    app.use('/api/profile', profileRoutes);
    app.use('/api/cash-coach', cashCoachRoutes);
    app.use('/api/biometric', biometricRoutes);
    app.use('/api/location', locationRoutes);
    app.use('/api/disclosure', disclosureRoutes);
    app.use('/api/test', testRoutes);

    // Error handling middleware
    app.use((err, req, res, next) => {
        logger.error(err.stack);
        
        // Check if error has a status code
        const statusCode = err.statusCode || 500;
        
        // Check if error has a message
        const message = err.message || 'Internal Server Error';
        
        // Send error response
        res.status(statusCode).json({
            success: false,
            error: {
                message,
                statusCode,
                ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
            }
        });
    });

    // Graceful shutdown handling
    process.on('SIGTERM', () => {
        console.log('SIGTERM received, shutting down gracefully');
        server.close(() => {
            console.log('Server closed');
            mongoose.connection.close(() => {
                console.log('MongoDB connection closed');
                process.exit(0);
            });
        });
    });

    process.on('SIGINT', () => {
        console.log('SIGINT received, shutting down gracefully');
        server.close(() => {
            console.log('Server closed');
            mongoose.connection.close(() => {
                console.log('MongoDB connection closed');
                process.exit(0);
            });
        });
    });

    // Export for testing
    module.exports = {
        app,
        server,
        io,
        redis,
        logger
    };

    // Server error handling
    server.on('error', (error) => {
        if (error.syscall !== 'listen') {
            throw error;
        }

        const bind = typeof config.PORT === 'string' ? `Pipe ${config.PORT}` : `Port ${config.PORT}`;

        // Handle specific listen errors with friendly messages
        switch (error.code) {
            case 'EACCES':
                console.error(`${bind} requires elevated privileges`);
                process.exit(1);
                break;
            case 'EADDRINUSE':
                console.error(`${bind} is already in use`);
                process.exit(1);
                break;
            default:
                throw error;
        }
    });
})
.catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
});
