# Test Daily Rewards V3 Endpoint

**Quick test guide for the new user-based week system**

---

## 🚀 Start Backend

```bash
# Restart backend to load V3 routes
npm run dev
```

---

## 🧪 Test V3 API

### 1. Get Your Auth Token

**Option A: Login via API**
```bash
curl -X POST "http://localhost:5000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your_email@example.com",
    "password": "your_password"
  }'
```

**Option B: Get from browser**
- Open DevTools → Application → Local Storage
- Copy the auth token

### 2. Test V3 Week Endpoint

```bash
# Set your token
TOKEN="your_jwt_token_here"

# Get current week (V3 - user-based)
curl -X GET "http://localhost:5000/api/v3/daily-rewards/week" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.'
```

### 3. Expected Response

```json
{
  "success": true,
  "data": {
    "weekKey": "USER-W1",
    "weekStart": "2026-02-25T00:00:00.000Z",
    "weekEnd": "2026-03-03T23:59:59.999Z",
    "todayDayNumber": 1,
    "days": [
      {
        "dayNumber": 1,
        "status": "claimable",
        "coins": 0,
        "xp": 0,
        "rewardCoins": 50,
        "rewardXp": 25,
        "active": true,
        "rewardType": "Both"
      },
      {
        "dayNumber": 2,
        "status": "locked",
        "coins": 0,
        "xp": 0,
        "rewardCoins": 60,
        "rewardXp": 30,
        "active": true,
        "rewardType": "Both"
      },
      ... (7 days total)
    ],
    "weekNumber": 1,
    "userWeek": {
      "isUserWeek": true,
      "weekNumber": 1,
      "daysSinceJoin": 0,
      "todayDayNumber": 1,
      "joinDayName": "Tuesday",
      "displayMode": "USER_RELATIVE",
      "message": "You're in Week 1 of your Daily Rewards journey...",
      "behavior": "USER_WEEK_SYSTEM"
    },
    "displayMode": "USER_RELATIVE",
    "isUserWeek": true
  }
}
```

### 4. Verify Key Fields

✅ Check these fields:
- `weekKey`: Should be "USER-W1" (not "2026-W09")
- `todayDayNumber`: Should be 1 (on join day)
- `days`: Should have exactly 7 days (dayNumber 1-7)
- `days[0].status`: Should be "claimable" (Day 1)
- `days[1-6].status`: Should be "locked" (future days)
- `userWeek.isUserWeek`: Should be true
- `displayMode`: Should be "USER_RELATIVE"

### 5. Test Claim

```bash
# Claim today's reward
curl -X POST "http://localhost:5000/api/v3/daily-rewards/claim" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  | jq '.'
```

**Expected Response**:
```json
{
  "success": true,
  "data": {
    "day": 1,
    "coins": 50,
    "baseXP": 25,
    "xp": 37.5,
    "tierMultiplier": 1.5,
    "bigReward": false,
    "weekNumber": 1,
    "weekMultiplier": 1.0,
    "newBalance": 1050,
    "newXP": 537.5
  }
}
```

### 6. Check After Claim

```bash
# Get week data again
curl -X GET "http://localhost:5000/api/v3/daily-rewards/week" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.data.days[0:2]'
```

**Expected**:
```json
[
  {
    "dayNumber": 1,
    "status": "claimed",  // ✅ Changed from "claimable"
    "coins": 50,
    "xp": 25
  },
  {
    "dayNumber": 2,
    "status": "claimable",  // ✅ Changed from "locked"
    "coins": 0,
    "xp": 0
  }
]
```

---

## 📊 Compare V2 vs V3

### V2 Response (Calendar-Based)
```json
{
  "weekKey": "2026-W09",
  "days": [
    {"dayNumber": 3, "status": "claimed"},  // Calendar day 3 (Wednesday)
    {"dayNumber": 4, "status": "claimable"}, // Calendar day 4 (Thursday)
    ...
  ],
  "userJoinDayIndex": 2,
  "displayMode": "USER_RELATIVE",
  "isFirstWeek": true
}
```

### V3 Response (User-Based) ✅
```json
{
  "weekKey": "USER-W1",
  "days": [
    {"dayNumber": 1, "status": "claimed"},  // User's Day 1
    {"dayNumber": 2, "status": "claimable"}, // User's Day 2
    ...
  ],
  "displayMode": "USER_RELATIVE",
  "isUserWeek": true
}
```

---

## 🐛 Troubleshooting

### Error: "Cannot access dates before your account creation"
- **Fixed!** Date comparison now ignores time (only compares dates)
- Restart backend: `npm run dev`

### Error: "Daily Reward module is currently disabled"
- Check admin panel → Daily Rewards → Active toggle
- Or check database: `DailyRewardConfigV2` → `isActive: true`

### Days show wrong status
- Check backend logs for debug output
- Verify user's `createdAt` date
- Check current date/time

### Week number incorrect
- V3 calculates weeks from user's join date
- Week 1 = first 7 days after join
- Week 2 = next 7 days, etc.

---

## ✅ Success Criteria

Your V3 endpoint is working correctly if:

1. ✅ `weekKey` is "USER-W1" (not calendar week)
2. ✅ `days` array has 7 items (dayNumber 1-7)
3. ✅ Day 1 is claimable on join day
4. ✅ Days 2-7 are locked initially
5. ✅ After claiming Day 1, Day 2 becomes claimable
6. ✅ No "hidden" days
7. ✅ No complex display mode logic needed
8. ✅ `userWeek.isUserWeek` is true

---

## 📱 Update Frontend

Once V3 is working, update your frontend:

**Change API endpoint**:
```javascript
// Old
const url = '/api/v2/daily-rewards/week';

// New
const url = '/api/v3/daily-rewards/week';
```

**Simplify display logic**:
```javascript
// V3 is simpler - just use dayNumber directly!
{data.days.map(day => (
  <DayCard key={day.dayNumber}>
    <h3>DAY {day.dayNumber}</h3>
    {/* No need to calculate display day! */}
  </DayCard>
))}
```

---

**Test the V3 endpoint and confirm it's working before updating the frontend!**
