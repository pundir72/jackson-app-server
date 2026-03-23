require("dotenv").config();

module.exports = {
  // Environment
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: process.env.PORT || 3000,

  // Database
  MONGODB_URI:
    process.env.MONGODB_URI || "mongodb://localhost:27017/jackson-app",

  // JWT
  JWT_SECRET: process.env.JWT_SECRET || "your-secret-key",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",

  // Security
  PASSWORD_SALT_ROUNDS: parseInt(process.env.PASSWORD_SALT_ROUNDS) || 10,

  // File Upload
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5MB
  ALLOWED_FILE_TYPES: process.env.ALLOWED_FILE_TYPES?.split(",") || [
    "image/jpeg",
    "image/png",
    "image/gif",
  ],

  // Payment
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,

  // Google Pay
  GOOGLE_PAY_CLIENT_ID: process.env.GOOGLE_PAY_CLIENT_ID,

  // Google OAuth
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_CALLBACK_URL:
    process.env.GOOGLE_CALLBACK_URL ||
    "http://localhost:4001/api/auth/google/callback",

  // Facebook OAuth
  FACEBOOK_APP_ID: process.env.FACEBOOK_APP_ID,
  FACEBOOK_APP_SECRET: process.env.FACEBOOK_APP_SECRET,
  FACEBOOK_CALLBACK_URL:
    process.env.FACEBOOK_CALLBACK_URL ||
    "http://localhost:4001/api/auth/facebook/callback",

  // Firebase
  FIREBASE_CONFIG: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  },

  // Google Play Integrity
  GOOGLE_PLAY_INTEGRITY_SERVICE_ACCOUNT: process.env.GOOGLE_PLAY_INTEGRITY_SERVICE_ACCOUNT,
  ANDROID_PACKAGE_NAME: process.env.ANDROID_PACKAGE_NAME,
  // Comma-separated SHA-256 certificate digests of your app's signing certificates.
  // Find via: keytool -printcert -jarfile your-app.apk | grep "SHA256:"
  // Example: "a1b2c3d4e5f6...,b2c3d4e5f6a7..."
  EXPECTED_CERT_DIGESTS: process.env.EXPECTED_CERT_DIGESTS,
  // How long a challenge nonce stays valid (seconds). Default: 300 (5 minutes).
  INTEGRITY_NONCE_TTL_SECONDS: process.env.INTEGRITY_NONCE_TTL_SECONDS || 300,
  INTEGRITY_TEST_TOKEN: process.env.INTEGRITY_TEST_TOKEN || null,

  // Google Play In-App Purchase (IAP)
  GOOGLE_PLAY_SERVICE_ACCOUNT: process.env.GOOGLE_PLAY_SERVICE_ACCOUNT, // JSON string of service account credentials
  GOOGLE_PLAY_KEY_FILE: process.env.GOOGLE_PLAY_KEY_FILE, // Path to service account key file (alternative to JSON string)

  // Redis
  REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",

  // OpenAI
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS:
    parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,

  // XP System
  XP_DECAY_DAYS: parseInt(process.env.XP_DECAY_DAYS) || 7,
  XP_DECAY_PERCENT: parseFloat(process.env.XP_DECAY_PERCENT) || 0.25,

  // VIP System
  VIP_TIERS: {
    bronze: {
      price: parseInt(process.env.VIP_BRONZE_PRICE) || 4.99,
      benefits: ["No Ads", "Bonus XP", "Exclusive Offers"],
    },
    gold: {
      price: parseInt(process.env.VIP_GOLD_PRICE) || 9.99,
      benefits: ["All Bronze", "Double XP", "Special Rewards"],
    },
    platinum: {
      price: parseInt(process.env.VIP_PLATINUM_PRICE) || 19.99,
      benefits: ["All Gold", "Triple XP", "VIP Support"],
    },
  },

  // Cash Coach
  MIN_WITHDRAWAL_AMOUNT: parseFloat(process.env.MIN_WITHDRAWAL_AMOUNT) || 20,
  MAX_WITHDRAWAL_AMOUNT: parseFloat(process.env.MAX_WITHDRAWAL_AMOUNT) || 100,

  // Besitos - Game Offers & Surveys Platform
  BESITOS_BASE_URL: process.env.BESITOS_BASE_URL || "https://api.besitos.ai",
  BESITOS_PARTNER_ID: process.env.BESITOS_PARTNER_ID,
  BESITOS_API_TOKEN: process.env.BESITOS_API_TOKEN,
  BESITOS_WEBHOOK_SECRET: "NVvhXplfe9DUG9lgK8oy",

  // Bitlabs - Game Offers & Surveys Platform
  // Base URL should NOT include /v1 - it will be added to the endpoint path
  BITLABS_BASE_URL: process.env.BITLABS_BASE_URL || "https://api.bitlabs.ai",
  BITLABS_API_TOKEN: process.env.BITLABS_API_TOKEN,
  BITLABS_SECRET_KEY: process.env.BITLABS_SECRET_KEY,
  BITLABS_SERVER_TO_SERVER_KEY: process.env.BITLABS_SERVER_TO_SERVER_KEY,
  BITLABS_WHITELISTED_IP: process.env.BITLABS_WHITELISTED_IP || "127.0.0.1", // Whitelisted server IP to pass via client_ip parameter (defaults to localhost like Besitos)
  BITLABS_REFRESH_INTERVAL_MINUTES:
    parseInt(process.env.BITLABS_REFRESH_INTERVAL_MINUTES) || 5,

  // Everflow - Non-Gaming Offers Platform
  // Documentation: https://developers.everflow.io/docs/affiliate/postbacks/
  // Base URL: https://api.eflow.team (for US) or https://api-eu.eflow.team (for EU)
  // Endpoints include /v1 (e.g., /v1/affiliate/postbacks)
  EVERFLOW_BASE_URL: process.env.EVERFLOW_BASE_URL || "https://api.eflow.team",
  EVERFLOW_API_KEY: process.env.EVERFLOW_API_KEY,
  EVERFLOW_WEBHOOK_SECRET: process.env.EVERFLOW_WEBHOOK_SECRET,

  // Affise - Affiliate Tracking Platform
  // Documentation: https://api-wdigital.affise.com/docs3.1/
  AFFISE_BASE_URL: process.env.AFFISE_BASE_URL || "https://api-wdigital.affise.com",
  AFFISE_API_VERSION: process.env.AFFISE_API_VERSION || "3.0",
  AFFISE_API_KEY: process.env.AFFISE_API_KEY,

  // AppLovin MAX - Ad Mediation Platform
  // Documentation: https://support.axon.ai/en/max/getting-started/
  // AppLovin MAX is a client-side SDK for rewarded ads mediation
  // Supported Ad Networks: Facebook, Google AdMob, Digital Turbine, Inmobi, Mintegral, Bidmachine, Liftoff/Vungle, Pangle, Moloco, Google Ad Manager
  APPLOVIN_MAX_SDK_KEY: process.env.APPLOVIN_MAX_SDK_KEY,

  // Adjust - S2S API for event tracking
  // Documentation: https://dev.adjust.com/en/api/s2s-api
  ADJUST_API_TOKEN: process.env.ADJUST_API_TOKEN,
  ADJUST_APP_TOKEN: process.env.ADJUST_APP_TOKEN,

  // Adjust S2S V2 - Offerwall Campaign Filtering
  // Comma-separated list of offerwall campaign names (case-insensitive matching)
  // Example: "offerwall_campaign,offerwall_promo,wall_promotion"
  OFFERWALL_CAMPAIGNS: process.env.OFFERWALL_CAMPAIGNS,

  // Adjust S2S V2 - Event Validation Settings
  ALLOW_LEVEL_SKIPPING: process.env.ALLOW_LEVEL_SKIPPING === "true", // Allow users to skip levels
  ALLOW_ORGANIC_USERS: process.env.ALLOW_ORGANIC_USERS === "true", // Allow organic users (no campaign)

  // Error Codes
  ERROR_CODES: {
    INVALID_CREDENTIALS: 401,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    VALIDATION_ERROR: 422,
    INTERNAL_ERROR: 500,
  },

  IMAGE_BASE_URL: process.env.IMAGE_BASE_URL || "http://localhost:4001",

  EMAIL: process.env.EMAIL,
  EMAIL_PASSWORD: process.env.EMAIL_PASSWORD,

  // Cloudflare Turnstile (Captcha)
  CLOUDFLARE_TURNSTILE_SITE_KEY: process.env.CLOUDFLARE_TURNSTILE_SITE_KEY,
  CLOUDFLARE_TURNSTILE_SECRET_KEY: process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY,
};
