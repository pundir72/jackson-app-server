require('dotenv').config();

module.exports = {
    // Environment
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: process.env.PORT || 3000,
    
    // Database
    MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/jackson-app',
    
    // JWT
    JWT_SECRET: process.env.JWT_SECRET || 'your-secret-key',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
    
    // Security
    PASSWORD_SALT_ROUNDS: parseInt(process.env.PASSWORD_SALT_ROUNDS) || 10,
    
    // File Upload
    MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5MB
    ALLOWED_FILE_TYPES: process.env.ALLOWED_FILE_TYPES?.split(',') || ['image/jpeg', 'image/png', 'image/gif'],
    
    // Payment
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    
    // Google Pay
    GOOGLE_PAY_CLIENT_ID: process.env.GOOGLE_PAY_CLIENT_ID,
    
    // Google OAuth
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:4001/api/auth/google/callback',
    
    // Facebook OAuth
    FACEBOOK_APP_ID: process.env.FACEBOOK_APP_ID,
    FACEBOOK_APP_SECRET: process.env.FACEBOOK_APP_SECRET,
    FACEBOOK_CALLBACK_URL: process.env.FACEBOOK_CALLBACK_URL || 'http://localhost:4001/api/auth/facebook/callback',
    
    // Firebase
    FIREBASE_CONFIG: {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    },
    
    // Redis
    REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
    
    // OpenAI
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    
    // Rate Limiting
    RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    
    // XP System
    XP_DECAY_DAYS: parseInt(process.env.XP_DECAY_DAYS) || 7,
    XP_DECAY_PERCENT: parseFloat(process.env.XP_DECAY_PERCENT) || 0.25,
    
    // VIP System
    VIP_TIERS: {
        BRONZE: {
            price: parseInt(process.env.VIP_BRONZE_PRICE) || 4.99,
            benefits: ['No Ads', 'Bonus XP', 'Exclusive Offers']
        },
        GOLD: {
            price: parseInt(process.env.VIP_GOLD_PRICE) || 9.99,
            benefits: ['All Bronze', 'Double XP', 'Special Rewards']
        },
        PLATINUM: {
            price: parseInt(process.env.VIP_PLATINUM_PRICE) || 19.99,
            benefits: ['All Gold', 'Triple XP', 'VIP Support']
        }
    },
    
    // Cash Coach
    MIN_WITHDRAWAL_AMOUNT: parseFloat(process.env.MIN_WITHDRAWAL_AMOUNT) || 20,
    MAX_WITHDRAWAL_AMOUNT: parseFloat(process.env.MAX_WITHDRAWAL_AMOUNT) || 100,
    
    // Error Codes
    ERROR_CODES: {
        INVALID_CREDENTIALS: 401,
        UNAUTHORIZED: 401,
        FORBIDDEN: 403,
        NOT_FOUND: 404,
        VALIDATION_ERROR: 422,
        INTERNAL_ERROR: 500
    },

    IMAGE_BASE_URL: process.env.IMAGE_BASE_URL || 'http://localhost:4001',

    EMAIL: process.env.EMAIL,
    EMAIL_PASSWORD: process.env.EMAIL_PASSWORD
};
