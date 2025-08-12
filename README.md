# Jackson App Backend

A comprehensive backend system for the Jackson App - a rewards and gaming mobile application that combines cashback, gaming, and financial services.

## Features

### Core Features
- **User Management**: Registration, authentication, profile management
- **Rewards System**: Daily challenges, points, cashback
- **Gaming Platform**: Game preferences, progress tracking
- **Wallet System**: Financial management, withdrawals
- **Location Services**: Location-based rewards
- **Receipt Scanning**: OCR for cashback verification
- **Premium Features**: VIP membership, Cash Coach

### Technical Features
- **RESTful API** with comprehensive endpoints
- **Real-time notifications** using Socket.IO
- **File upload** with image processing
- **SMS/Email verification** using Twilio and Nodemailer
- **Receipt OCR** using Google Cloud Vision
- **Rate limiting** and security measures
- **Comprehensive logging** and monitoring
- **Database migrations** and seeding

## Project Structure

```
jackson-app-backend/
├── src/
│   ├── config/           # Configuration files
│   ├── controllers/      # Route controllers
│   ├── middleware/       # Custom middleware
│   ├── models/          # Database models
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   ├── utils/           # Utility functions
│   ├── validators/      # Input validation
│   └── server.js        # Main server file
├── migrations/          # Database migrations
├── seeders/            # Database seeders
├── tests/              # Test files
├── uploads/            # File uploads
├── logs/               # Application logs
├── docs/               # API documentation
└── package.json
```

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd jackson-app-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

4. **Set up database**
   ```bash
   # Install and start MongoDB (if not already running)
   # On Ubuntu/Debian:
   sudo systemctl start mongod
   
   # On macOS with Homebrew:
   brew services start mongodb-community
   
   # On Windows:
   # Start MongoDB service from Services
   
   # Create database (will be created automatically on first use)
   # The application will connect to 'jackson_app' database
   
   # Seed initial data (optional)
   npm run seed
   ```

5. **Start the server**
   ```bash
   # Development
   npm run dev
   
   # Production
   npm start
   ```

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/verify-otp` - OTP verification
- `POST /api/v1/auth/forgot-password` - Password reset
- `POST /api/v1/auth/refresh-token` - Token refresh

### User Management
- `GET /api/v1/users/profile` - Get user profile
- `PUT /api/v1/users/profile` - Update profile
- `POST /api/v1/users/upload-avatar` - Upload avatar
- `GET /api/v1/users/preferences` - Get user preferences
- `PUT /api/v1/users/preferences` - Update preferences

### Rewards & Challenges
- `GET /api/v1/rewards/daily-challenges` - Get daily challenges
- `POST /api/v1/rewards/complete-challenge` - Complete challenge
- `GET /api/v1/rewards/history` - Get rewards history
- `GET /api/v1/rewards/leaderboard` - Get leaderboard

### Games
- `GET /api/v1/games` - Get available games
- `GET /api/v1/games/:id` - Get game details
- `POST /api/v1/games/:id/play` - Start game
- `POST /api/v1/games/:id/complete` - Complete game
- `GET /api/v1/games/progress` - Get game progress

### Wallet
- `GET /api/v1/wallet/balance` - Get wallet balance
- `GET /api/v1/wallet/transactions` - Get transaction history
- `POST /api/v1/wallet/withdraw` - Request withdrawal
- `POST /api/v1/wallet/add-funds` - Add funds

### Receipt Scanning
- `POST /api/v1/receipts/scan` - Scan receipt
- `GET /api/v1/receipts/history` - Get receipt history
- `POST /api/v1/receipts/verify` - Verify receipt

### VIP & Premium
- `GET /api/v1/vip/benefits` - Get VIP benefits
- `POST /api/v1/vip/upgrade` - Upgrade to VIP
- `GET /api/v1/cash-coach/tips` - Get financial tips

## Database Schema

### Core Collections
- `users` - User accounts and profiles
- `userpreferences` - User preferences and settings
- `challenges` - Daily challenges
- `games` - Available games
- `gameprogress` - User game progress
- `wallet` - Financial transactions
- `receipts` - Scanned receipts
- `vipmemberships` - VIP subscriptions

## Environment Variables

See `env.example` for all required environment variables.

## Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage
```

## Deployment

1. **Set up production environment variables**
2. **Configure database for production**
3. **Set up Redis for caching**
4. **Configure file storage (AWS S3)**
5. **Set up monitoring and logging**
6. **Deploy using PM2 or Docker**

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details 