# Daily Rewards V3 - User-Based Week System

**Date**: February 25, 2026  
**Status**: ✅ **NEW SYSTEM IMPLEMENTED**

---

## 🎯 What Changed

### V2 System (Calendar-Based)
- Weeks run Monday-Sunday (fixed calendar)
- User joins Wednesday → sees "missed" Monday/Tuesday
- Complex logic for first week vs subsequent weeks
- Different display modes (USER_RELATIVE vs CALENDAR)

### V3 System (User-Based) ✅ NEW
- Weeks run from user's join date (personalized)
- User joins Wednesday → Week 1 = Wed-Tue, Week 2 = Wed-Tue
- Simple logic (always user-relative)
- Always shows Day 1, 2, 3, 4, 5, 6, 7

---

## 📊 How It Works

### Example 1: User Joins on Wednesday

**User joins**: Wednesday, Feb 25, 2026

**Week 1**: Wed Feb 25 - Tue Mar 3
- Day 1 = Wednesday (join day)
- Day 2 = Thursday
- Day 3 = Friday
- Day 4 = Saturday
- Day 5 = Sunday
- Day 6 = Monday
- Day 7 = Tuesday

**Week 2**: Wed Mar 4 - Tue Mar 10
- Day 1 = Wednesday
- Day 2 = Thursday
- ... (same pattern)

**Week 3**: Wed Mar 11 - Tue Mar 17
- And so on...

### Example 2: User Joins on Friday

**User joins**: Friday, Feb 27, 2026

**Week 1**: Fri Feb 27 - Thu Mar 5
- Day 1 = Friday (join day)
- Day 2 = Saturday
- Day 3 = Sunday
- Day 4 = Monday
- Day 5 = Tuesday
- Day 6 = Wednesday
- Day 7 = Thursday

**Week 2**: Fri Mar 6 - Thu Mar 12
- Day 1 = Friday
- ... (same pattern)

---

## 🚀 API Endpoints

### Base URL
```
http://localhost:5000/api/v3/daily-rewards
```

### 1. Get Week Data

**Endpoint**: `GET /api/v3/daily-rewards/week`

**Headers**:
```
Authorization: Bearer <token>
```

**Query Parameters**:
- `date` (optional): ISO date string

**Response**:
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
        "rewardXp": 25
      },
      {
        "dayNumber": 2,
        "status": "locked",
        "coins": 0,
        "xp": 0,
        "rewardCoins": 60,
        "rewardXp": 30
      },
      ...
    ],
    "weekNumber": 1,
    "userWeek": {
      "isUserWeek": true,
      "weekNumber": 1,
      "daysSinceJoin": 0,
      "todayDayNumber": 1,
      "joinDayName": "Wednesday",
      "displayMode": "USER_RELATIVE",
      "message": "You're in Week 1 of your Daily Rewards journey. Your week runs from Wednesday to Wednesday (7 days).",
      "behavior": "USER_WEEK_SYSTEM"
    },
    "displayMode": "USER_RELATIVE",
    "isUserWeek": true
  }
}
```

### 2. Claim Reward

**Endpoint**: `POST /api/v3/daily-rewards/claim`

**Headers**:
```
Authorization: Bearer <token>
```

**Response**:
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

### 3. Get History

**Endpoint**: `GET /api/v3/daily-rewards/history?weeks=4`

**Headers**:
```
Authorization: Bearer <token>
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "weekKey": "USER-W2",
      "weekStart": "2026-03-04T00:00:00.000Z",
      "weekEnd": "2026-03-10T23:59:59.999Z",
      "days": [...]
    },
    {
      "weekKey": "USER-W1",
      "weekStart": "2026-02-25T00:00:00.000Z",
      "weekEnd": "2026-03-03T23:59:59.999Z",
      "days": [...]
    }
  ]
}
```

---

## 🔧 Testing

### Test with cURL

```bash
# Set your token
TOKEN="your_jwt_token"

# Get current week
curl -X GET "http://localhost:5000/api/v3/daily-rewards/week" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.'

# Claim today's reward
curl -X POST "http://localhost:5000/api/v3/daily-rewards/claim" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.'

# Get history
curl -X GET "http://localhost:5000/api/v3/daily-rewards/history?weeks=2" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.'
```

### Expected Behavior

**Day 1 (Join Day)**:
```json
{
  "todayDayNumber": 1,
  "days": [
    {"dayNumber": 1, "status": "claimable"},
    {"dayNumber": 2, "status": "locked"},
    {"dayNumber": 3, "status": "locked"},
    ...
  ]
}
```

**Day 2 (Next Day)**:
```json
{
  "todayDayNumber": 2,
  "days": [
    {"dayNumber": 1, "status": "claimed"},
    {"dayNumber": 2, "status": "claimable"},
    {"dayNumber": 3, "status": "locked"},
    ...
  ]
}
```

**Day 4 (Missed Day 2 & 3)**:
```json
{
  "todayDayNumber": 4,
  "days": [
    {"dayNumber": 1, "status": "claimed"},
    {"dayNumber": 2, "status": "missed"},
    {"dayNumber": 3, "status": "missed"},
    {"dayNumber": 4, "status": "claimable"},
    ...
  ]
}
```

---

## 📱 Frontend Integration

### Update API Endpoint

**Old (V2)**:
```javascript
const response = await fetch('/api/v2/daily-rewards/week', {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

**New (V3)**:
```javascript
const response = await fetch('/api/v3/daily-rewards/week', {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

### Simplified Display Logic

**V2 (Complex)**:
```javascript
// Had to check displayMode, isFirstWeek, userJoinDayIndex
// Had to filter hidden days
// Had to calculate display day numbers
const displayDays = days
  .filter(day => !day.hidden)
  .map((day, index) => {
    let displayDay = day.dayNumber;
    if (displayMode === 'USER_RELATIVE' && isFirstWeek) {
      displayDay = day.dayNumber - userJoinDayIndex;
    }
    return { ...day, displayDay };
  });
```

**V3 (Simple)**:
```javascript
// Just use dayNumber directly - it's always 1-7!
const displayDays = days.map(day => ({
  ...day,
  displayDay: day.dayNumber // Always 1, 2, 3, 4, 5, 6, 7
}));
```

### Display in UI

```javascript
{displayDays.map(day => (
  <DayCard key={day.dayNumber}>
    <h3>DAY {day.dayNumber}</h3>
    <p>{day.rewardCoins} coins</p>
    <p>{day.rewardXp} XP</p>
    <button 
      disabled={day.status !== 'claimable'}
      onClick={() => claimReward()}
    >
      {day.status === 'claimable' ? 'CLAIM NOW' : 
       day.status === 'claimed' ? 'CLAIMED' :
       day.status === 'missed' ? 'MISSED' : 'LOCKED'}
    </button>
  </DayCard>
))}
```

---

## ✅ Benefits

### For Users
- ✅ Always get full 7-day experience
- ✅ No "missed" days before joining
- ✅ Clear progression (Day 1, 2, 3...)
- ✅ Week resets on their join day (predictable)

### For Developers
- ✅ Simpler logic (no calendar week complexity)
- ✅ No hidden days to filter
- ✅ No display mode switching
- ✅ Easier to understand and maintain

### For Business
- ✅ Better user experience
- ✅ Higher engagement (no confusion)
- ✅ Clearer metrics (user-based weeks)
- ✅ Easier to explain to users

---

## 🔄 Migration from V2 to V3

### Option 1: Gradual Migration
- Keep V2 running for existing users
- Use V3 for new users only
- Migrate users gradually

### Option 2: Full Migration
- Switch all users to V3
- Existing progress continues from current week
- Week numbers recalculated based on join date

### Recommended: Option 1 (Gradual)
```javascript
// In frontend
const apiVersion = user.createdAt > new Date('2026-02-25') ? 'v3' : 'v2';
const endpoint = `/api/${apiVersion}/daily-rewards/week`;
```

---

## 📊 Comparison

| Feature | V2 (Calendar) | V3 (User-Based) |
|---------|---------------|-----------------|
| Week Start | Monday (fixed) | User's join day |
| Week End | Sunday (fixed) | 6 days after join |
| Display | USER_RELATIVE or CALENDAR | Always USER_RELATIVE |
| Hidden Days | Yes (before join) | No (all 7 days shown) |
| Complexity | High | Low |
| User Experience | Confusing | Clear |
| Code Maintenance | Complex | Simple |

---

## 🐛 Troubleshooting

### Days show as "missed" on join day
- Check: Is backend using V3 endpoint?
- Check: Is `todayDayNumber` correct?
- Check: Is `status` being set correctly?

### Week number incorrect
- Check: User's `createdAt` date
- Check: Current date calculation
- Check: Days since join calculation

### Rewards not claimable
- Check: Is config active?
- Check: Is day active in config?
- Check: Is status 'claimable'?

---

## 📁 Files Created

- `utils/dailyRewardUserWeekHelper.js` - User week calculation logic
- `routes/daily-rewards-v3.js` - V3 API endpoints
- `server.js` - Added V3 route registration

---

## 🚀 Next Steps

1. ✅ Backend V3 system created
2. ⏳ Test V3 endpoints with cURL
3. ⏳ Update frontend to use V3 API
4. ⏳ Test with real users
5. ⏳ Deploy to production

---

**The V3 system is ready! Update your frontend to use `/api/v3/daily-rewards/` endpoints.**
