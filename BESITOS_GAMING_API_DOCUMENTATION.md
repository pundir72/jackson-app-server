# Besitos Gaming API Documentation

## Overview
This API provides integration with Besitos gaming platform for fetching game offers, managing user data, tracking conversions, and handling surveys.

## Base URL
```
http://localhost:5000/api/besitos
```

## Authentication
Most endpoints require authentication using Bearer token in the Authorization header:
```
Authorization: Bearer <token>
```

## Rate Limiting
All endpoints are rate limited to 30 requests per minute per user.

---

## Endpoints

### 1. Health Check

#### `GET /health`
**Description**: Check API health status  
**Access**: Public (no authentication required)

**Response**:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2025-01-10T12:00:00.000Z"
  }
}
```

---

### 2. Game Offers

#### `GET /offers`
**Description**: Get available game offers  
**Access**: Private (requires user authentication)

**Query Parameters**:
| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `platform` | String | Platform filter | `iOS`, `Android` |
| `country` | String | Country code filter | `US`, `UK`, `CA` |
| `category` | String | Category filter | `games`, `puzzle`, `action` |

**Example Request**:
```bash
GET /api/besitos/offers?platform=iOS&country=US&category=games
Authorization: Bearer <user_token>
```

**Response**:
```json
{
  "success": true,
  "data": {
    "offers": [
      {
        "id": "offer_123",
        "title": "Match 3 Puzzle Game",
        "description": "Complete level 10 to earn rewards",
        "type": "game",
        "category": "puzzle",
        "platform": "iOS",
        "country": "US",
        "reward": {
          "coins": 100,
          "xp": 50
        },
        "requirements": {
          "minLevel": 5,
          "timeLimit": 3600
        },
        "metadata": {
          "difficulty": "medium",
          "estimatedTime": 15
        }
      }
    ]
  },
  "timestamp": "2025-01-10T12:00:00.000Z"
}
```

---

### 3. User Data & Activity

#### `GET /user-data/:userId`
**Description**: Get user activity and data from Besitos  
**Access**: Private (user can only access their own data)

**Path Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `userId` | String | User ID |

**Example Request**:
```bash
GET /api/besitos/user-data/68e8cec3bfdfa8bd0e817a24
Authorization: Bearer <user_token>
```

**Response**:
```json
{
  "success": true,
  "data": {
    "userId": "68e8cec3bfdfa8bd0e817a24",
    "totalOffers": 15,
    "completedOffers": 8,
    "totalEarnings": 1250,
    "activeOffers": 3,
    "recentActivity": [
      {
        "offerId": "offer_123",
        "type": "game_completion",
        "completedAt": "2025-01-10T10:30:00.000Z",
        "reward": {
          "coins": 100,
          "xp": 50
        }
      }
    ]
  },
  "timestamp": "2025-01-10T12:00:00.000Z"
}
```

#### `GET /surveys/:userId`
**Description**: Get available surveys for user  
**Access**: Private (user can only access their own surveys)

**Path Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `userId` | String | User ID |

**Query Parameters**:
| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `platform` | String | Platform filter | `iOS`, `Android` |

**Example Request**:
```bash
GET /api/besitos/surveys/68e8cec3bfdfa8bd0e817a24?platform=iOS
Authorization: Bearer <user_token>
```

**Response**:
```json
{
  "success": true,
  "data": {
    "surveys": [
      {
        "id": "survey_789",
        "title": "Lifestyle Survey",
        "description": "Tell us about your lifestyle preferences",
        "category": "lifestyle",
        "estimatedTime": 5,
        "reward": {
          "coins": 75,
          "xp": 25
        },
        "questions": 10,
        "platform": "iOS"
      }
    ]
  },
  "timestamp": "2025-01-10T12:00:00.000Z"
}
```

#### `GET /user-profiling/:userId`
**Description**: Get user profiling questions  
**Access**: Private (user can only access their own profiling)

**Path Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `userId` | String | User ID |

**Response**:
```json
{
  "success": true,
  "data": {
    "profilingQuestions": [
      {
        "id": "prof_1",
        "question": "What is your favorite game genre?",
        "type": "multiple_choice",
        "options": ["puzzle", "action", "strategy", "casual"]
      }
    ]
  },
  "timestamp": "2025-01-10T12:00:00.000Z"
}
```

---

### 4. Messenger & Goals

#### `GET /messenger`
**Description**: Get messenger data and upcoming goals  
**Access**: Private (requires user authentication)

**Example Request**:
```bash
GET /api/besitos/messenger
Authorization: Bearer <user_token>
```

**Response**:
```json
{
  "success": true,
  "data": {
    "upcomingGoals": [
      {
        "id": "goal_1",
        "title": "Complete 5 Games",
        "description": "Play and complete 5 different games",
        "progress": 3,
        "target": 5,
        "reward": {
          "coins": 200,
          "xp": 100
        },
        "deadline": "2025-01-15T23:59:59.000Z"
      }
    ],
    "messages": [
      {
        "id": "msg_1",
        "type": "achievement",
        "title": "Congratulations!",
        "message": "You've completed your first game!",
        "timestamp": "2025-01-10T09:30:00.000Z"
      }
    ]
  },
  "timestamp": "2025-01-10T12:00:00.000Z"
}
```

---

### 5. Conversions & Postbacks

#### `POST /conversion`
**Description**: Submit conversion/postback to Besitos  
**Access**: Private (requires user authentication)

**Request Body**:
```json
{
  "offerId": "offer_123",
  "conversionType": "install",
  "conversionValue": 2.50,
  "currency": "USD",
  "platform": "iOS",
  "country": "US",
  "deviceInfo": {
    "model": "iPhone 14 Pro",
    "os": "iOS 17.2",
    "advertisingId": "12345678-1234-1234-1234-123456789012"
  },
  "metadata": {
    "level": 10,
    "sessionDuration": 1800,
    "purchases": 0
  },
  "timestamp": "2025-01-10T10:30:00.000Z"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "conversionId": "conv_456",
    "status": "submitted",
    "processedAt": "2025-01-10T10:30:05.000Z",
    "reward": {
      "coins": 100,
      "xp": 50
    }
  },
  "timestamp": "2025-01-10T12:00:00.000Z"
}
```

**Conversion Types**:
- `install` - App installation
- `level_completion` - Game level completion
- `survey_completion` - Survey completion
- `purchase` - In-app purchase
- `custom` - Custom conversion event

---

### 6. Admin - Conversions Management

#### `GET /conversions`
**Description**: Get conversions data (Admin only)  
**Access**: Private (requires admin authentication)

**Query Parameters**:
| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `from` | String | Start date (YYYY-MM-DD) | `2025-01-01` |
| `to` | String | End date (YYYY-MM-DD) | `2025-01-31` |
| `status` | String | Conversion status filter | `completed`, `pending`, `failed` |
| `platform` | String | Platform filter | `iOS`, `Android` |

**Example Request**:
```bash
GET /api/besitos/conversions?from=2025-01-01&to=2025-01-31&status=completed
Authorization: Bearer <admin_token>
```

**Response**:
```json
{
  "success": true,
  "data": {
    "conversions": [
      {
        "id": "conv_456",
        "userId": "68e8cec3bfdfa8bd0e817a24",
        "offerId": "offer_123",
        "conversionType": "install",
        "status": "completed",
        "conversionValue": 2.50,
        "currency": "USD",
        "platform": "iOS",
        "country": "US",
        "submittedAt": "2025-01-10T10:30:00.000Z",
        "processedAt": "2025-01-10T10:30:05.000Z"
      }
    ],
    "summary": {
      "total": 150,
      "completed": 120,
      "pending": 20,
      "failed": 10,
      "totalValue": 375.00
    }
  },
  "timestamp": "2025-01-10T12:00:00.000Z"
}
```

---

## Error Responses

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": {
    "message": "Error description",
    "code": "ERROR_CODE"
  }
}
```

**Common Error Codes**:
- `BESITOS_OFFERS_ERROR` - Error fetching offers
- `BESITOS_USER_DATA_ERROR` - Error fetching user data
- `BESITOS_CONVERSION_ERROR` - Error submitting conversion
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `UNAUTHORIZED` - Invalid or missing authentication
- `FORBIDDEN` - Insufficient permissions

---

## Rate Limiting

- **Limit**: 30 requests per minute per user
- **Window**: 1 minute
- **Headers**: Rate limit information is included in response headers

---

## Testing Examples

### 1. Get Game Offers for iOS
```bash
curl -X GET "http://localhost:5000/api/besitos/offers?platform=iOS&country=US" \
  -H "Authorization: Bearer <user_token>"
```

### 2. Submit Game Completion
```bash
curl -X POST "http://localhost:5000/api/besitos/conversion" \
  -H "Authorization: Bearer <user_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "offerId": "game_offer_456",
    "conversionType": "level_completion",
    "conversionValue": 5.00,
    "currency": "USD",
    "platform": "iOS",
    "country": "US",
    "deviceInfo": {
      "model": "iPhone 14 Pro",
      "os": "iOS 17.2"
    },
    "metadata": {
      "level": 25,
      "sessionDuration": 3600
    }
  }'
```

### 3. Get User Surveys
```bash
curl -X GET "http://localhost:5000/api/besitos/surveys/68e8cec3bfdfa8bd0e817a24?platform=iOS" \
  -H "Authorization: Bearer <user_token>"
```

---

## Postman Collection

Import the provided Postman collection:
- **Collection**: `Besitos_Gaming_API.postman_collection.json`
- **Environment**: `Besitos_Gaming_API_Environment.postman_environment.json`

The collection includes:
- ✅ Authentication endpoints
- ✅ All Besitos API endpoints
- ✅ Pre-configured request examples
- ✅ Test scripts for validation
- ✅ Environment variables
- ✅ Auto-token management

---

## Integration Notes

1. **Authentication**: Always include the Bearer token in the Authorization header
2. **Rate Limiting**: Implement proper retry logic for rate-limited requests
3. **Error Handling**: Check the `success` field in responses before processing data
4. **Timestamp**: All responses include a `timestamp` field for debugging
5. **User Privacy**: Users can only access their own data (userId validation)
6. **Admin Access**: Admin endpoints require admin authentication tokens

This API provides complete integration with the Besitos gaming platform for managing offers, tracking user activity, and processing conversions.
