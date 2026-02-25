# Daily Rewards API Endpoints

**Base URL**: `http://localhost:5000` (or your backend URL)  
**Authentication**: Required (Bearer token in Authorization header)

---

## 📍 Main Endpoints

### 1. Get Daily Rewards Week Data

**Endpoint**: `GET /api/daily-rewards-v2/week`

**Description**: Fetches the daily reward data for the current week or a specific week

**Headers**:
```
Authorization: Bearer <your_jwt_token>
Content-Type: application/json
```

**Query Parameters**:
- `date` (optional): ISO date string to fetch a specific week (e.g., "2026-02-26")
  - If omitted, returns current week

**Example Request**:
```bash
# Current week
curl -X GET "http://localhost:5000/api/daily-rewards-v2/week" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"

# Specific week
curl -X GET "http://localhost:5000/api/daily-rewards-v2/week?date=2026-02-26" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**Response** (Success - 200):
```json
{
  "success": true,
  "data": {
    "weekKey": "2026-W09",
    "weekStart": "2026-02-23T00:00:00.000Z",
    "weekEnd": "2026-03-01T23:59:59.999Z",
    "todayDayNumber": 4,
    "days": [
      {
        "dayNumber": 1,
        "status": "claimed",
        "claimedAt": "2026-02-23T10:30:00.000Z",
        "coins": 100,
        "xp": 50,
        "hidden": false,
        "active": true,
        "rewardType": "Both",
        "rewardCoins": 100,
        "rewardXp": 50,
        "claimButtonLabel": "CLAIM NOW",
        "timerLabel": "Next reward in",
        "claimableOnLoginOnly": false
      },
      {
        "dayNumber": 2,
        "status": "missed",
        "coins": 0,
        "xp": 0,
        "hidden": false,
        "active": true,
        "rewardType": "Both",
        "rewardCoins": 150,
        "rewardXp": 75
      },
      {
        "dayNumber": 3,
        "status": "missed",
        "coins": 0,
        "xp": 0,
        "hidden": false,
        "active": true,
        "rewardType": "Both",
        "rewardCoins": 200,
        "rewardXp": 100
      },
      {
        "dayNumber": 4,
        "status": "claimable",
        "coins": 0,
        "xp": 0,
        "hidden": false,
        "active": true,
        "rewardType": "Both",
        "rewardCoins": 250,
        "rewardXp": 125
      },
      {
        "dayNumber": 5,
        "status": "locked",
        "coins": 0,
        "xp": 0,
        "hidden": false,
        "active": true,
        "rewardType": "Both",
        "rewardCoins": 300,
        "rewardXp": 150
      },
      {
        "dayNumber": 6,
        "status": "locked",
        "coins": 0,
        "xp": 0,
        "hidden": false,
        "active": true,
        "rewardType": "Both",
        "rewardCoins": 350,
        "rewardXp": 175
      },
      {
        "dayNumber": 7,
        "status": "locked",
        "coins": 0,
        "xp": 0,
        "hidden": false,
        "active": true,
        "rewardType": "Both",
        "rewardCoins": 500,
        "rewardXp": 250
      }
    ],
    "bigRewardEligible": false,
    "bigRewardGranted": false,
    "countdown": 43200000,
    "weekNumber": 1,
    "weeklyMultiplier": {
      "enabled": true,
      "currentMultiplier": 1.0,
      "status": "Weekly Multiplier: Gradual (Active) - Week 1 (1.0x)"
    },
    "bigReward": {
      "enabled": true,
      "downgradeOnMiss": true,
      "coins": 1000,
      "xp": 500,
      "awardBadge": false
    },
    "midWeekJoin": {
      "isFirstWeek": true,
      "isMidWeekJoin": true,
      "userCreatedDayIndex": 0,
      "userCreatedDayNumber": 1,
      "joinDayName": "Monday",
      "displayMode": "USER_RELATIVE",
      "totalDaysAvailable": 7,
      "message": "Welcome! You joined on Monday. This is your Day 1! You'll get 7 consecutive days of rewards starting from today.",
      "explanation": "For your first week, daily rewards are shown as Day 1, Day 2, Day 3, etc., starting from your join date. You get a full 7-day reward experience!",
      "behavior": "FIRST_WEEK_USER_RELATIVE"
    },
    "yearTransition": {
      "isYearTransition": false,
      "message": "No year transition detected"
    },
    "displayMode": "USER_RELATIVE",
    "isFirstWeek": true,
    "userJoinDayIndex": 0
  }
}
```

**Key Fields for Frontend**:
- `displayMode`: "USER_RELATIVE" (first week) or "CALENDAR" (subsequent weeks)
- `isFirstWeek`: true if user's first week
- `userJoinDayIndex`: Calendar day index user joined (0-6, Mon-Sun)
- `days[].hidden`: true for days before user joined (filter these out)
- `days[].status`: "locked", "claimable", "claimed", "missed"
- `days[].active`: false if admin deactivated this day
- `todayDayNumber`: Current day number (1-7)

---

### 2. Claim Daily Reward

**Endpoint**: `POST /api/daily-rewards-v2/claim`

**Description**: Claims the daily reward for today

**Headers**:
```
Authorization: Bearer <your_jwt_token>
Content-Type: application/json
```

**Body**: None (automatically claims today's reward)

**Example Request**:
```bash
curl -X POST "http://localhost:5000/api/daily-rewards-v2/claim" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json"
```

**Response** (Success - 200):
```json
{
  "success": true,
  "data": {
    "day": 4,
    "coins": 250,
    "baseXP": 125,
    "xp": 187.5,
    "tierMultiplier": 1.5,
    "bigReward": false,
    "weekNumber": 1,
    "weekMultiplier": 1.0,
    "newBalance": 1250,
    "newXP": 687.5
  }
}
```

**Response** (Error - 400):
```json
{
  "success": false,
  "error": "Reward not claimable"
}
```

**Response** (Error - 503):
```json
{
  "success": false,
  "error": "Daily Reward module is currently disabled",
  "message": "Please contact support if you believe this is an error"
}
```

---

### 3. Get Daily Rewards History

**Endpoint**: `GET /api/daily-rewards-v2/history`

**Description**: Fetches the user's daily reward history for past weeks

**Headers**:
```
Authorization: Bearer <your_jwt_token>
Content-Type: application/json
```

**Query Parameters**:
- `weeks` (optional): Number of weeks to fetch (default: 4)

**Example Request**:
```bash
curl -X GET "http://localhost:5000/api/daily-rewards-v2/history?weeks=4" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**Response** (Success - 200):
```json
{
  "success": true,
  "data": [
    {
      "weekKey": "2026-W09",
      "weekStart": "2026-02-23T00:00:00.000Z",
      "weekEnd": "2026-03-01T23:59:59.999Z",
      "days": [...],
      "bigRewardEligible": false,
      "bigRewardGranted": false
    },
    {
      "weekKey": "2026-W08",
      "weekStart": "2026-02-16T00:00:00.000Z",
      "weekEnd": "2026-02-22T23:59:59.999Z",
      "days": [...],
      "bigRewardEligible": true,
      "bigRewardGranted": true
    }
  ]
}
```

---

## 🔧 Testing with cURL

### Get Your Auth Token

**Option 1: Login**
```bash
curl -X POST "http://localhost:5000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "your_password"
  }'
```

**Option 2: Use existing token from browser**
- Open browser DevTools → Application → Local Storage
- Find `authToken` or similar key
- Copy the token value

### Test Daily Rewards API

```bash
# Set your token
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Get current week data
curl -X GET "http://localhost:5000/api/daily-rewards-v2/week" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.'

# Claim today's reward
curl -X POST "http://localhost:5000/api/daily-rewards-v2/claim" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  | jq '.'

# Get history
curl -X GET "http://localhost:5000/api/daily-rewards-v2/history?weeks=2" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.'
```

---

## 📱 Frontend Usage

### In React/Next.js

```javascript
// Get daily rewards data
const fetchDailyRewards = async () => {
  const token = localStorage.getItem('authToken');
  
  const response = await fetch('http://localhost:5000/api/daily-rewards-v2/week', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  const data = await response.json();
  
  if (data.success) {
    const { displayMode, isFirstWeek, userJoinDayIndex, days } = data.data;
    
    // Filter hidden days
    const visibleDays = days.filter(day => !day.hidden);
    
    // Calculate display day numbers
    const displayDays = visibleDays.map((day, index) => {
      let displayDayNumber = day.dayNumber;
      
      if (displayMode === 'USER_RELATIVE' && isFirstWeek && userJoinDayIndex !== undefined) {
        displayDayNumber = day.dayNumber - userJoinDayIndex;
      }
      
      return {
        ...day,
        displayDay: displayDayNumber,
        calendarDay: day.dayNumber
      };
    });
    
    return displayDays;
  }
};

// Claim reward
const claimReward = async () => {
  const token = localStorage.getItem('authToken');
  
  const response = await fetch('http://localhost:5000/api/daily-rewards-v2/claim', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  const data = await response.json();
  
  if (data.success) {
    console.log('Claimed:', data.data);
    // Update UI with new balance and XP
  } else {
    console.error('Claim failed:', data.error);
  }
};
```

---

## 🐛 Common Issues

### 401 Unauthorized
- Token expired or invalid
- Get new token by logging in again

### 503 Service Unavailable
- Daily Rewards module disabled by admin
- Check admin panel → Daily Rewards → Active toggle

### 400 Bad Request
- Reward not claimable (already claimed, locked, or missed)
- Check `status` field in week data

### Empty `days` array
- User joined after current week ended
- Check `weekStart` and `weekEnd` dates

---

## 📊 Status Values

| Status | Meaning | Display |
|--------|---------|---------|
| `locked` | Future day, not yet available | "LOCKED" (gray) |
| `claimable` | Today's reward, ready to claim | "CLAIM NOW" (orange) |
| `claimed` | Already claimed | "CLAIMED" (blue) |
| `missed` | Past day, not claimed | "UNCLAIMED" (red cross) |

---

## 🔑 Important Notes

1. **V2 Endpoint**: The app uses `/api/daily-rewards-v2/` (not `/api/daily-rewards/`)
2. **Authentication**: All endpoints require valid JWT token
3. **Week Calculation**: Weeks start on Monday (00:00 UTC) and end on Sunday (23:59:59 UTC)
4. **First Week Logic**: `displayMode: "USER_RELATIVE"` means show "Day 1, 2, 3..."
5. **Subsequent Weeks**: `displayMode: "CALENDAR"` means show calendar days
6. **Hidden Days**: Filter out days where `hidden: true`
7. **Active Flag**: Check `active: false` to disable claiming

---

**File Location**: `routes/daily-rewards-v2.js`  
**Frontend Component**: `JacksonRewardsApp/app/Daily-Reward/components/DailyRewardsSection.jsx`
