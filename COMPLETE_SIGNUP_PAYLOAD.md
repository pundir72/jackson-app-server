# Complete User Signup Payload

## API Endpoint
`POST /api/auth/signup`

## Required Headers
```
Content-Type: application/json
X-App-Version: 1.1.3.7 (optional)
X-Device-Type: iOS (optional)
X-Device-Model: iPhone 14 Pro (optional)
X-Device-OS: iOS 17.2 (optional)
X-Country: US (optional)
X-City: New York (optional)
```

## Complete Request Body

### Basic Required Fields
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@example.com",
  "mobile": "+1234567890",
  "password": "Secure@1234"
}
```

### Complete Payload with All Optional Fields
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@example.com",
  "mobile": "+1234567890",
  "password": "Secure@1234",
  
  // === Onboarding & Preferences ===
  "gender": "male",
  "ageRange": "26-35",
  "gamePreferences": ["puzzle", "arcade", "strategy"],
  "gameStyle": "casual",
  "improvementArea": "saving",
  "dailyEarningGoal": 900,
  "socialTag": "JohnDoe",
  
  // === Referral System ===
  "referralCode": "ABCD12",
  
  // === App & Device Info ===
  "appVersion": "1.1.3.7",
  "redemptionPreference": "paypal",
  
  // === Device Tracking (NEW) ===
  "deviceType": "iOS",
  "deviceModel": "iPhone 14 Pro",
  "deviceOS": "iOS 17.2"
}
```

## Field Descriptions

### Required Fields
| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `firstName` | String | User's first name | `"John"` |
| `lastName` | String | User's last name | `"Doe"` |
| `email` | String | Valid email address | `"john.doe@example.com"` |
| `mobile` | String | Mobile number (with/without country code) | `"+1234567890"` |
| `password` | String | Password (min 8 characters) | `"Secure@1234"` |

### Optional Onboarding Fields
| Field | Type | Description | Valid Values |
|-------|------|-------------|--------------|
| `gender` | String | User's gender | `"male"`, `"female"`, `"other"` |
| `ageRange` | String | Age range | `"18-25"`, `"26-35"`, `"36-45"`, `"46-55"`, `"56+"` |
| `gamePreferences` | Array | Preferred game types | `["puzzle", "arcade", "strategy", "action", "adventure", "words", "trivia"]` |
| `gameStyle` | String | Game difficulty preference | `"easy"`, `"medium"`, `"hard"`, `"casual"` |
| `improvementArea` | String | Financial improvement focus | `"budgeting"`, `"saving"`, `"investing"`, `"debt"`, `"retirement"` |
| `dailyEarningGoal` | Number | Target daily earnings | `100-5000` |
| `socialTag` | String | Public username/handle | `"JohnDoe"` (3-20 chars, alphanumeric + underscore) |

### Referral & Rewards
| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `referralCode` | String | Referral code from inviter | `"ABCD12"` |
| `redemptionPreference` | String | Preferred redemption method | `"paypal"`, `"gift_card"`, `"crypto"`, `"bank"`, `"gpay"`, `"revolut"` |

### App & Device Info (NEW)
| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `appVersion` | String | App version | `"1.1.3.7"` |
| `deviceType` | String | Device platform | `"iOS"`, `"Android"`, `"Web"` |
| `deviceModel` | String | Device model | `"iPhone 14 Pro"`, `"Samsung Galaxy S23"` |
| `deviceOS` | String | Operating system version | `"iOS 17.2"`, `"Android 14"` |

## Alternative: Using Headers Instead of Body

If you prefer not to send device info in the request body, you can use headers:

```bash
POST /api/auth/signup
Content-Type: application/json
X-App-Version: 1.1.3.7
X-Device-Type: iOS
X-Device-Model: iPhone 14 Pro
X-Device-OS: iOS 17.2
X-Country: US
X-City: New York

{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@example.com",
  "mobile": "+1234567890",
  "password": "Secure@1234",
  "gender": "male",
  "ageRange": "26-35",
  "gamePreferences": ["puzzle", "arcade"],
  "gameStyle": "casual",
  "improvementArea": "saving",
  "dailyEarningGoal": 900,
  "socialTag": "JohnDoe",
  "referralCode": "ABCD12",
  "redemptionPreference": "paypal"
}
```

## Prerequisites

Before calling signup, the user must:

1. **Send OTP**: `POST /api/auth/send-otp` with mobile number
2. **Verify OTP**: `POST /api/auth/verify-otp` with mobile and OTP code
3. **Then signup**: `POST /api/auth/signup` with complete payload

## Expected Response

### Success Response (201)
```json
{
  "success": true,
  "message": "User registered successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "_id": "68e8cec3bfdfa8bd0e817a24",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "mobile": "1234567890",
    "role": "USER",
    "isVerified": true
  },
  "referralResult": {
    "success": true,
    "rewards": {
      "referrer": {
        "coins": 100,
        "xp": 50
      },
      "referee": {
        "coins": 50,
        "xp": 25
      }
    }
  }
}
```

### Error Responses

#### Mobile Already Exists (400)
```json
{
  "error": "User already exists",
  "message": "An account with this mobile number already exists. Please login instead."
}
```

#### Email Already Exists (400)
```json
{
  "error": "Email already exists",
  "message": "An account with this email address already exists. Please use a different email or try logging in."
}
```

#### OTP Not Verified (400)
```json
{
  "error": "OTP not verified",
  "message": "Please verify your mobile number with OTP before completing registration.",
  "requiresOTPVerification": true,
  "mobile": "1234567890"
}
```

#### Validation Error (400)
```json
{
  "errors": [
    {
      "msg": "Password must be at least 8 characters long",
      "param": "password",
      "location": "body"
    }
  ]
}
```

## Data Stored in Database

After successful signup, the following data is stored:

### User Profile
- Basic info (name, email, mobile)
- Password (hashed)
- Verification status (true)

### Device Tracking
- Device type, model, OS
- IP address and location
- App version

### Onboarding Data
- Gender, age range
- Game preferences and style
- Financial goals and improvement areas
- Daily earning targets

### Session Tracking
- `lastActive`, `lastLoginAt`, `loginCount`
- Signup metadata (IP, country, city, timestamp)

### Referral Data (if applicable)
- Referral code processing
- Reward distribution
- Badge assignment

## Testing Examples

### Minimal Signup
```bash
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Test",
    "lastName": "User",
    "email": "test@example.com",
    "mobile": "+1234567890",
    "password": "Test@1234"
  }'
```

### Complete Signup with Device Info
```bash
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -H "X-Device-Type: iOS" \
  -H "X-Device-Model: iPhone 14 Pro" \
  -H "X-Device-OS: iOS 17.2" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "mobile": "+1234567890",
    "password": "Secure@1234",
    "gender": "male",
    "ageRange": "26-35",
    "gamePreferences": ["puzzle", "arcade"],
    "gameStyle": "casual",
    "improvementArea": "saving",
    "dailyEarningGoal": 900,
    "socialTag": "JohnDoe",
    "referralCode": "ABCD12",
    "appVersion": "1.1.3.7",
    "redemptionPreference": "paypal",
    "deviceType": "iOS",
    "deviceModel": "iPhone 14 Pro",
    "deviceOS": "iOS 17.2"
  }'
```

This payload will ensure all admin panel fields are properly populated with device tracking, location data, and comprehensive user information!
