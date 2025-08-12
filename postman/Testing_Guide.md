# Game API Testing Guide

## Setup Instructions

### 1. Import Postman Collection
1. Open Postman
2. Click "Import" button
3. Select the `Game_API_Collection.json` file
4. The collection will be imported with all 22 endpoints

### 2. Configure Environment Variables

#### Base Configuration
- **baseUrl**: `http://localhost:3000/api/v1` (or your server URL)
- **authToken**: Your JWT authentication token
- **gameId**: Will be auto-populated from responses
- **userId**: Your user ID

### 3. Get Authentication Token

First, you need to authenticate to get a JWT token:

```bash
# Login to get token
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'
```

Copy the `token` from the response and set it as the `authToken` variable in Postman.

## Sample Data for Testing

### Create Test Games

Use these sample games to test the API:

#### Sample Game 1 (Puzzle)
```json
{
  "title": "Brain Teaser Pro",
  "description": "Challenge your mind with advanced puzzle games",
  "category": "puzzle",
  "difficulty": "medium",
  "gameType": "single_player",
  "pointsReward": 100,
  "cashbackReward": 0.50,
  "maxPointsPerDay": 500,
  "maxCashbackPerDay": 2.50,
  "imageUrl": "https://example.com/puzzle-game.jpg",
  "backgroundColor": "#FF5733",
  "textColor": "#FFFFFF",
  "tags": ["puzzle", "brain-teaser", "logic"],
  "ageRange": "all",
  "gender": "all",
  "isActive": true,
  "isFeatured": true,
  "isNew": true,
  "isVipOnly": false,
  "locationRequired": false
}
```

#### Sample Game 2 (VIP Casino)
```json
{
  "title": "VIP Blackjack",
  "description": "Exclusive VIP casino game with high rewards",
  "category": "casino",
  "difficulty": "hard",
  "gameType": "single_player",
  "pointsReward": 200,
  "cashbackReward": 1.00,
  "maxPointsPerDay": 1000,
  "maxCashbackPerDay": 5.00,
  "imageUrl": "https://example.com/vip-blackjack.jpg",
  "backgroundColor": "#8B0000",
  "textColor": "#FFD700",
  "tags": ["casino", "vip", "blackjack", "card-game"],
  "ageRange": "18_24",
  "gender": "all",
  "isActive": true,
  "isFeatured": false,
  "isNew": false,
  "isVipOnly": true,
  "locationRequired": false
}
```

#### Sample Game 3 (Location-Based)
```json
{
  "title": "Treasure Hunt",
  "description": "Find treasures in your local area",
  "category": "action",
  "difficulty": "easy",
  "gameType": "single_player",
  "pointsReward": 75,
  "cashbackReward": 0.25,
  "maxPointsPerDay": 300,
  "maxCashbackPerDay": 1.00,
  "imageUrl": "https://example.com/treasure-hunt.jpg",
  "backgroundColor": "#228B22",
  "textColor": "#FFFFFF",
  "tags": ["action", "location", "treasure", "adventure"],
  "ageRange": "all",
  "gender": "all",
  "isActive": true,
  "isFeatured": false,
  "isNew": true,
  "isVipOnly": false,
  "locationRequired": true,
  "locationRadius": 5
}
```

## Testing Sequence

### Phase 1: Game Listing Endpoints

1. **Get All Games** - Test basic listing with filters
2. **Get Featured Games** - Test featured games filter
3. **Get New Games** - Test new games filter
4. **Get Popular Games** - Test popularity sorting
5. **Get Top Rated Games** - Test rating-based sorting
6. **Get Games by Tags** - Test tag-based filtering
7. **Get Location-Based Games** - Test location filter
8. **Get VIP Games** - Test VIP access (requires VIP user)
9. **Get Game Categories** - Test category listing
10. **Get Game Statistics** - Test analytics endpoint

### Phase 2: Game Details

1. **Get Game by ID** - Test individual game retrieval
2. **Play Game** - Test game start functionality
3. **Complete Game** - Test game completion with rewards
4. **Rate Game** - Test rating system

### Phase 3: Game Progress

1. **Get User's Game Progress** - Test user progress retrieval
2. **Get Game Progress by Game ID** - Test specific game progress
3. **Get Game Achievements** - Test achievements system
4. **Get Game Leaderboard** - Test leaderboard functionality

### Phase 4: Admin Endpoints

1. **Toggle Game Featured Status** - Test admin functionality
2. **Toggle Game Active Status** - Test game activation/deactivation
3. **Add Tag to Game** - Test tag management
4. **Remove Tag from Game** - Test tag removal

## Expected Responses

### Successful Response Format
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {
    // Response data
  },
  "statusCode": 200
}
```

### Error Response Format
```json
{
  "success": false,
  "message": "Error description",
  "statusCode": 400
}
```

## Test Cases

### 1. Authentication Tests
- ✅ Test with valid JWT token
- ❌ Test with invalid/missing token (should return 401)
- ❌ Test with expired token (should return 401)

### 2. Game Listing Tests
- ✅ Test pagination (page, limit parameters)
- ✅ Test filtering by category
- ✅ Test filtering by difficulty
- ✅ Test filtering by game type
- ✅ Test featured games filter
- ✅ Test new games filter
- ✅ Test VIP games filter

### 3. Game Details Tests
- ✅ Test valid game ID retrieval
- ❌ Test invalid game ID (should return 404)
- ✅ Test game play with location
- ✅ Test game completion with score
- ✅ Test game rating (0-5 range)
- ❌ Test invalid rating (should return 400)

### 4. VIP Access Tests
- ✅ Test VIP games with VIP user
- ❌ Test VIP games with non-VIP user (should return 403)

### 5. Admin Tests
- ✅ Test toggle featured status
- ✅ Test toggle active status
- ✅ Test add tag functionality
- ✅ Test remove tag functionality

## Common Issues and Solutions

### 1. Authentication Issues
**Problem**: Getting 401 Unauthorized
**Solution**: 
- Check if JWT token is valid
- Ensure token is properly set in `authToken` variable
- Verify token hasn't expired

### 2. Game ID Issues
**Problem**: Getting 404 Not Found
**Solution**:
- Ensure you have a valid `gameId` in the collection variables
- Create a test game first using the sample data
- Check if the game exists in the database

### 3. VIP Access Issues
**Problem**: Getting 403 Forbidden for VIP games
**Solution**:
- Ensure your user account has VIP status
- Use a VIP user account for testing VIP endpoints

### 4. Validation Errors
**Problem**: Getting 400 Bad Request
**Solution**:
- Check request body format
- Ensure required fields are provided
- Verify data types (numbers, strings, booleans)

## Performance Testing

### Load Testing
- Test with multiple concurrent requests
- Monitor response times
- Check database performance

### Stress Testing
- Test with large datasets
- Test pagination with high limits
- Test filtering with complex queries

## Security Testing

### Input Validation
- Test with malformed JSON
- Test with SQL injection attempts
- Test with XSS payloads

### Authorization
- Test admin endpoints with non-admin users
- Test VIP endpoints with non-VIP users
- Test user-specific data access

## Database Verification

After testing, verify the database state:

```javascript
// Check games collection
db.games.find().pretty()

// Check game progress
db.gameprogress.find().pretty()

// Check user data
db.users.find().pretty()
```

## Reporting

Create a test report with:
- ✅ Passed tests
- ❌ Failed tests
- Performance metrics
- Security findings
- Recommendations

## Troubleshooting

### Server Not Running
```bash
# Start the server
npm start

# Check server logs
npm run dev
```

### Database Connection Issues
```bash
# Check MongoDB connection
mongo --eval "db.runCommand({ping: 1})"

# Check Redis connection
redis-cli ping
```

### Environment Variables
Ensure all required environment variables are set in `.env` file:
```
PORT=3000
MONGODB_URI=mongodb://localhost:27017/rewards-backend
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key
```

This comprehensive testing guide will help you verify all Game API functionality thoroughly! 🚀 