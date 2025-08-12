# Jackson App API Documentation

## Base URL
```
http://localhost:3000/api/v1
```

## Authentication
All protected endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## Response Format
All API responses follow this format:
```json
{
  "success": true,
  "message": "Success message",
  "data": {},
  "statusCode": 200
}
```

## Error Response Format
```json
{
  "success": false,
  "message": "Error message",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email format",
      "value": "invalid-email"
    }
  ],
  "statusCode": 400
}
```

---

## Authentication Endpoints

### Register User
**POST** `/auth/register`

Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890",
  "dateOfBirth": "1990-01-01",
  "gender": "male",
  "ageRange": "25_34",
  "referralCode": "ABC123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "user": {
      "id": 1,
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "isEmailVerified": false,
      "referralCode": "USER123ABC"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "message": "Registration successful. Please verify your email."
  },
  "statusCode": 201
}
```

### Login User
**POST** `/auth/login`

Authenticate user and get access tokens.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": 1,
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "totalPoints": 0,
      "totalCashback": "0.00"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "statusCode": 200
}
```

### Verify Email
**POST** `/auth/verify-email`

Verify email address with OTP.

**Request Body:**
```json
{
  "email": "user@example.com",
  "otp": "123456"
}
```

### Forgot Password
**POST** `/auth/forgot-password`

Send password reset email.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

### Reset Password
**POST** `/auth/reset-password`

Reset password using reset token.

**Request Body:**
```json
{
  "token": "reset-token-here",
  "password": "NewSecurePassword123"
}
```

### Refresh Token
**POST** `/auth/refresh-token`

Get new access token using refresh token.

**Request Body:**
```json
{
  "refreshToken": "refresh-token-here"
}
```

---

## User Management Endpoints

### Get User Profile
**GET** `/users/profile`

Get current user's profile information.

**Response:**
```json
{
  "success": true,
  "message": "Profile retrieved successfully",
  "data": {
    "user": {
      "id": 1,
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "phone": "+1234567890",
      "dateOfBirth": "1990-01-01",
      "gender": "male",
      "ageRange": "25_34",
      "avatar": "/uploads/avatars/avatar.jpg",
      "totalPoints": 150,
      "totalCashback": "25.50",
      "isVip": false,
      "streakDays": 5
    }
  },
  "statusCode": 200
}
```

### Update User Profile
**PUT** `/users/profile`

Update user profile information.

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Smith",
  "phone": "+1234567890",
  "dateOfBirth": "1990-01-01",
  "gender": "male",
  "ageRange": "25_34",
  "timezone": "America/New_York",
  "language": "en",
  "currency": "USD"
}
```

### Upload Avatar
**POST** `/users/upload-avatar`

Upload user avatar image.

**Request:** Multipart form data with `avatar` field.

### Get User Preferences
**GET** `/users/preferences`

Get user preferences and settings.

**Response:**
```json
{
  "success": true,
  "message": "Preferences retrieved successfully",
  "data": {
    "preferences": {
      "id": 1,
      "userId": 1,
      "primaryGoal": "earn_cashback",
      "improvementAreas": ["budgeting", "saving"],
      "gameStylePreferences": ["puzzle", "strategy"],
      "dailyEarningGoal": "10.00",
      "preferredStores": ["Walmart", "Target"],
      "theme": "auto",
      "fontSize": "medium",
      "soundEnabled": true,
      "vibrationEnabled": true
    }
  },
  "statusCode": 200
}
```

### Update User Preferences
**PUT** `/users/preferences`

Update user preferences.

**Request Body:**
```json
{
  "primaryGoal": "earn_cashback",
  "improvementAreas": ["budgeting", "saving", "investing"],
  "gameStylePreferences": ["puzzle", "strategy", "action"],
  "dailyEarningGoal": "15.00",
  "preferredStores": ["Walmart", "Target", "Amazon"],
  "theme": "dark",
  "fontSize": "large",
  "soundEnabled": false,
  "vibrationEnabled": true
}
```

### Get User Stats
**GET** `/users/stats`

Get user statistics and achievements.

**Response:**
```json
{
  "success": true,
  "message": "Stats retrieved successfully",
  "data": {
    "stats": {
      "totalPoints": 150,
      "totalCashback": "25.50",
      "totalEarnings": "25.50",
      "streakDays": 5,
      "loginCount": 12,
      "daysSinceRegistration": 30,
      "averageDailyEarnings": "0.85",
      "vipStatus": false,
      "vipExpiry": null
    }
  },
  "statusCode": 200
}
```

---

## Rewards & Challenges Endpoints

### Get Daily Challenges
**GET** `/rewards/daily-challenges`

Get available daily challenges for the user.

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)

**Response:**
```json
{
  "success": true,
  "message": "Daily challenges retrieved successfully",
  "data": {
    "challenges": [
      {
        "id": 1,
        "title": "Spend $50 at Walmart",
        "description": "Make a purchase of $50 or more at Walmart",
        "type": "daily",
        "category": "spending",
        "difficulty": "easy",
        "pointsReward": 50,
        "cashbackReward": "2.50",
        "targetValue": 50,
        "targetUnit": "dollars",
        "startDate": "2024-01-01T00:00:00.000Z",
        "endDate": "2024-01-01T23:59:59.000Z",
        "imageUrl": "/images/challenges/walmart.jpg",
        "backgroundColor": "#FF6B35",
        "textColor": "#FFFFFF"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 1,
      "totalItems": 1,
      "itemsPerPage": 10,
      "hasNextPage": false,
      "hasPrevPage": false
    }
  },
  "statusCode": 200
}
```

### Complete Challenge
**POST** `/rewards/complete-challenge`

Complete a challenge and earn rewards.

**Request Body:**
```json
{
  "challengeId": 1,
  "proof": "Receipt image or proof of completion"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Challenge completed successfully",
  "data": {
    "challenge": {
      "id": 1,
      "title": "Spend $50 at Walmart"
    },
    "rewards": {
      "points": 50,
      "cashback": "2.50"
    },
    "userStats": {
      "totalPoints": 200,
      "totalCashback": "28.00"
    }
  },
  "statusCode": 200
}
```

### Get Rewards History
**GET** `/rewards/history`

Get user's rewards and points history.

**Query Parameters:**
- `type` (optional): Filter by type (`points`, `cashback`, `challenges`, `all`)
- `startDate` (optional): Start date filter
- `endDate` (optional): End date filter
- `page` (optional): Page number
- `limit` (optional): Items per page

**Response:**
```json
{
  "success": true,
  "message": "Rewards history retrieved successfully",
  "data": {
    "history": [
      {
        "id": 1,
        "type": "challenge_completion",
        "description": "Completed: Spend $50 at Walmart",
        "points": 50,
        "cashback": "2.50",
        "createdAt": "2024-01-01T10:30:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 1,
      "totalItems": 1,
      "itemsPerPage": 10
    }
  },
  "statusCode": 200
}
```

### Get Leaderboard
**GET** `/rewards/leaderboard`

Get leaderboard rankings.

**Query Parameters:**
- `period` (optional): Time period (`daily`, `weekly`, `monthly`, `all-time`)
- `type` (optional): Leaderboard type (`points`, `cashback`, `challenges`)
- `limit` (optional): Number of results (default: 100)

**Response:**
```json
{
  "success": true,
  "message": "Leaderboard retrieved successfully",
  "data": {
    "leaderboard": [
      {
        "rank": 1,
        "user": {
          "id": 1,
          "firstName": "John",
          "lastName": "Doe",
          "avatar": "/uploads/avatars/avatar.jpg"
        },
        "points": 1500,
        "cashback": "150.00"
      }
    ],
    "userRank": {
      "rank": 5,
      "points": 1200,
      "cashback": "120.00"
    }
  },
  "statusCode": 200
}
```

---

## Games Endpoints

### Get Games
**GET** `/games`

Get available games.

**Query Parameters:**
- `category` (optional): Game category
- `difficulty` (optional): Difficulty level
- `featured` (optional): Featured games only
- `new` (optional): New games only
- `page` (optional): Page number
- `limit` (optional): Items per page

**Response:**
```json
{
  "success": true,
  "message": "Games retrieved successfully",
  "data": {
    "games": [
      {
        "id": 1,
        "title": "Puzzle Master",
        "description": "Solve challenging puzzles and earn rewards",
        "category": "puzzle",
        "difficulty": "medium",
        "gameType": "single_player",
        "pointsReward": 25,
        "cashbackReward": "1.25",
        "imageUrl": "/images/games/puzzle-master.jpg",
        "estimatedDuration": 5,
        "totalPlays": 150,
        "averageRating": 4.5,
        "totalRatings": 50
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 1,
      "totalItems": 1,
      "itemsPerPage": 10
    }
  },
  "statusCode": 200
}
```

### Play Game
**POST** `/games/:id/play`

Start playing a game.

**Request Body:**
```json
{
  "gameData": {
    "level": 1,
    "difficulty": "medium"
  }
}
```

### Complete Game
**POST** `/games/:id/complete`

Complete a game and earn rewards.

**Request Body:**
```json
{
  "score": 850,
  "gameData": {
    "level": 1,
    "timeSpent": 300,
    "moves": 45
  }
}
```

---

## Wallet Endpoints

### Get Wallet Balance
**GET** `/wallet/balance`

Get user's wallet balance and summary.

**Response:**
```json
{
  "success": true,
  "message": "Balance retrieved successfully",
  "data": {
    "balance": {
      "totalCashback": "25.50",
      "pendingCashback": "5.25",
      "availableForWithdrawal": "20.25",
      "totalPoints": 150,
      "pointsValue": "1.50"
    }
  },
  "statusCode": 200
}
```

### Get Transactions
**GET** `/wallet/transactions`

Get wallet transaction history.

**Query Parameters:**
- `type` (optional): Transaction type
- `status` (optional): Transaction status
- `startDate` (optional): Start date filter
- `endDate` (optional): End date filter
- `page` (optional): Page number
- `limit` (optional): Items per page

**Response:**
```json
{
  "success": true,
  "message": "Transactions retrieved successfully",
  "data": {
    "transactions": [
      {
        "id": 1,
        "type": "cashback",
        "description": "Challenge completion reward",
        "amount": "2.50",
        "status": "completed",
        "createdAt": "2024-01-01T10:30:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 1,
      "totalItems": 1,
      "itemsPerPage": 10
    }
  },
  "statusCode": 200
}
```

### Withdraw Funds
**POST** `/wallet/withdraw`

Request withdrawal of cashback funds.

**Request Body:**
```json
{
  "amount": "20.00",
  "paymentMethod": "paypal",
  "accountDetails": {
    "email": "user@example.com"
  }
}
```

---

## Receipt Scanning Endpoints

### Scan Receipt
**POST** `/receipts/scan`

Upload and scan a receipt for cashback.

**Request:** Multipart form data with `receipt` field and optional metadata.

**Request Body:**
```json
{
  "storeName": "Walmart",
  "amount": "45.67",
  "date": "2024-01-01",
  "location": {
    "latitude": 40.7128,
    "longitude": -74.0060
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Receipt scanned successfully",
  "data": {
    "receipt": {
      "id": 1,
      "storeName": "Walmart",
      "amount": "45.67",
      "cashback": "2.28",
      "points": 46,
      "status": "pending",
      "imageUrl": "/uploads/receipts/receipt.jpg",
      "createdAt": "2024-01-01T10:30:00.000Z"
    }
  },
  "statusCode": 200
}
```

### Get Receipt History
**GET** `/receipts/history`

Get user's receipt scanning history.

**Query Parameters:**
- `status` (optional): Receipt status filter
- `storeName` (optional): Store name filter
- `startDate` (optional): Start date filter
- `endDate` (optional): End date filter
- `page` (optional): Page number
- `limit` (optional): Items per page

---

## VIP Endpoints

### Get VIP Benefits
**GET** `/vip/benefits`

Get VIP membership benefits.

**Response:**
```json
{
  "success": true,
  "message": "VIP benefits retrieved successfully",
  "data": {
    "benefits": [
      {
        "id": 1,
        "title": "Higher Cashback Rates",
        "description": "Earn 2x cashback on all purchases",
        "icon": "💰"
      },
      {
        "id": 2,
        "title": "Exclusive Challenges",
        "description": "Access to VIP-only challenges",
        "icon": "⭐"
      }
    ]
  },
  "statusCode": 200
}
```

### Get VIP Plans
**GET** `/vip/plans`

Get available VIP membership plans.

**Response:**
```json
{
  "success": true,
  "message": "VIP plans retrieved successfully",
  "data": {
    "plans": [
      {
        "id": 1,
        "name": "Monthly VIP",
        "price": "9.99",
        "duration": "1 month",
        "features": [
          "2x cashback rates",
          "Exclusive challenges",
          "Priority support"
        ]
      }
    ]
  },
  "statusCode": 200
}
```

### Upgrade to VIP
**POST** `/vip/upgrade`

Upgrade user to VIP membership.

**Request Body:**
```json
{
  "plan": "monthly",
  "paymentMethod": "credit_card",
  "paymentDetails": {
    "cardNumber": "4111111111111111",
    "expiryMonth": "12",
    "expiryYear": "2025",
    "cvv": "123"
  }
}
```

---

## Cash Coach Endpoints

### Get Financial Tips
**GET** `/cash-coach/tips`

Get personalized financial tips and advice.

**Query Parameters:**
- `category` (optional): Tip category
- `difficulty` (optional): Difficulty level
- `page` (optional): Page number
- `limit` (optional): Items per page

**Response:**
```json
{
  "success": true,
  "message": "Tips retrieved successfully",
  "data": {
    "tips": [
      {
        "id": 1,
        "title": "Build an Emergency Fund",
        "description": "Save 3-6 months of expenses for emergencies",
        "category": "saving",
        "difficulty": "beginner",
        "estimatedSavings": "5000",
        "timeToAchieve": "6 months"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 1,
      "totalItems": 1,
      "itemsPerPage": 10
    }
  },
  "statusCode": 200
}
```

### Get Financial Goals
**GET** `/cash-coach/goals`

Get user's financial goals.

**Response:**
```json
{
  "success": true,
  "message": "Goals retrieved successfully",
  "data": {
    "goals": [
      {
        "id": 1,
        "title": "Emergency Fund",
        "description": "Save for unexpected expenses",
        "targetAmount": "5000",
        "currentAmount": "2000",
        "deadline": "2024-06-01",
        "category": "emergency_fund",
        "progress": 40
      }
    ]
  },
  "statusCode": 200
}
```

### Save Financial Goal
**POST** `/cash-coach/goals`

Create a new financial goal.

**Request Body:**
```json
{
  "title": "Vacation Fund",
  "description": "Save for summer vacation",
  "targetAmount": "3000",
  "deadline": "2024-05-01",
  "category": "vacation"
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| 400 | Bad Request - Invalid input data |
| 401 | Unauthorized - Authentication required |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource not found |
| 409 | Conflict - Resource already exists |
| 422 | Unprocessable Entity - Validation failed |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error - Server error |

---

## Rate Limiting

The API implements rate limiting to prevent abuse:
- **General endpoints**: 100 requests per 15 minutes
- **Authentication endpoints**: 10 requests per 15 minutes
- **File upload endpoints**: 20 requests per 15 minutes

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

---

## WebSocket Events

For real-time features, the API supports WebSocket connections:

### Connection
```javascript
const socket = io('http://localhost:3000', {
  auth: {
    token: 'your-jwt-token'
  }
});
```

### Events

#### Challenge Completed
```javascript
socket.on('challenge_completed', (data) => {
  console.log('Challenge completed:', data);
});
```

#### Reward Earned
```javascript
socket.on('reward_earned', (data) => {
  console.log('Reward earned:', data);
});
```

#### Wallet Transaction
```javascript
socket.on('wallet_transaction', (data) => {
  console.log('Wallet transaction:', data);
});
```

#### Receipt Scanned
```javascript
socket.on('receipt_scanned', (data) => {
  console.log('Receipt scanned:', data);
});
```

---

## SDK Examples

### JavaScript/Node.js
```javascript
const axios = require('axios');

const api = axios.create({
  baseURL: 'http://localhost:3000/api/v1',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

// Register user
const registerUser = async (userData) => {
  const response = await api.post('/auth/register', userData);
  return response.data;
};

// Get daily challenges
const getDailyChallenges = async () => {
  const response = await api.get('/rewards/daily-challenges');
  return response.data;
};

// Complete challenge
const completeChallenge = async (challengeId, proof) => {
  const response = await api.post('/rewards/complete-challenge', {
    challengeId,
    proof
  });
  return response.data;
};
```

### Python
```python
import requests

class JacksonAppAPI:
    def __init__(self, base_url, token=None):
        self.base_url = base_url
        self.headers = {
            'Authorization': f'Bearer {token}' if token else None,
            'Content-Type': 'application/json'
        }
    
    def register_user(self, user_data):
        response = requests.post(
            f'{self.base_url}/auth/register',
            json=user_data,
            headers=self.headers
        )
        return response.json()
    
    def get_daily_challenges(self):
        response = requests.get(
            f'{self.base_url}/rewards/daily-challenges',
            headers=self.headers
        )
        return response.json()
    
    def complete_challenge(self, challenge_id, proof):
        response = requests.post(
            f'{self.base_url}/rewards/complete-challenge',
            json={'challengeId': challenge_id, 'proof': proof},
            headers=self.headers
        )
        return response.json()
```

---

## Support

For API support and questions:
- Email: api-support@jacksonapp.com
- Documentation: https://docs.jacksonapp.com
- Status Page: https://status.jacksonapp.com 