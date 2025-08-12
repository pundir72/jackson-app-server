const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

// Import configurations
const { connectDB, disconnectDB } = require('./config/database');
const { redisClient } = require('./config/redis');
const logger = require('./utils/logger');
const { setupSocketIO } = require('./config/socket');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const onboardingRoutes = require('./routes/onboarding');
const masterDataRoutes = require('./routes/masterData');
// const rewardsRoutes = require('./routes/rewards');
// const gamesRoutes = require('./routes/games');
// const walletRoutes = require('./routes/wallet');
// const receiptsRoutes = require('./routes/receipts');
// const vipRoutes = require('./routes/vip');
// const cashCoachRoutes = require('./routes/cashCoach');
// const dealsRoutes = require('./routes/deals');
// const dailyRewardRoutes = require('./routes/dailyReward');

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const { authMiddleware } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 4000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://your-frontend-domain.com'] 
    : ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression middleware
app.use(compression());

// Static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
  });
});

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/onboarding', onboardingRoutes);
app.use('/api/v1/master-data', masterDataRoutes);
// app.use('/api/v1/rewards', rewardsRoutes);
// app.use('/api/v1/games', gamesRoutes);
// app.use('/api/v1/deals', authMiddleware, dealsRoutes);
// app.use('/api/v1/daily-reward', authMiddleware, dailyRewardRoutes);
// app.use('/api/v1/wallet', walletRoutes);
// app.use('/api/v1/receipts', receiptsRoutes);
// app.use('/api/v1/vip', vipRoutes);
// app.use('/api/v1/cash-coach', cashCoachRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
  });
});

// Error handling middleware
app.use(errorHandler);

// Database connection and server startup
async function startServer() {
  try {
    // Connect to MongoDB
    await connectDB();

    // Test Redis connection if available
    if (redisClient) {
      await redisClient.ping();
      logger.info('Redis connection established successfully.');
    } else {
      logger.warn('Redis not available, running without caching');
    }

    // Start server
    const server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
    });

    // Setup Socket.IO
    setupSocketIO(server);

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      server.close(async () => {
        await disconnectDB();
        if (redisClient) {
          await redisClient.quit();
        }
        logger.info('Server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down gracefully');
      server.close(async () => {
        await disconnectDB();
        if (redisClient) {
          await redisClient.quit();
        }
        logger.info('Server closed');
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Rejection:', err);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

startServer();

module.exports = app; 