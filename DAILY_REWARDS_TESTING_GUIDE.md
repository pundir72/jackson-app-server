# 🎁 Daily Rewards V1.0 - Complete Testing Guide

## 📦 Postman Collections

You have **2 collections** ready to import:

1. **User Collection**: `/postman/Daily_Rewards_User.postman_collection.json`
   - Get current week view
   - Claim today's reward
   - View history

2. **Admin Collection**: `/postman/Daily_Rewards_Admin.postman_collection.json`
   - Create/update reward configuration
   - Monitor user progress
   - View analytics

---

## 🚀 Complete Testing Flow

### **STEP 1: Setup (Admin) - Run Once**

#### 1.1 Import Admin Collection
```
1. Open Postman
2. Import: Daily_Rewards_Admin.postman_collection.json
3. Set variables:
   - base_url: http://localhost:4001
   - admin_jwt_token: <your admin JWT>
```

#### 1.2 Create Reward Configuration
**Endpoint**: `POST /api/admin/daily-rewards/config`

**Run**: "Seed Default Config" request in Admin collection

**Body** (already in collection):
```json
{
  "version": 1,
  "days": [
    { "dayNumber": 1, "coins": 10, "xp": 5 },
    { "dayNumber": 2, "coins": 15, "xp": 8 },
    { "dayNumber": 3, "coins": 20, "xp": 10 },
    { "dayNumber": 4, "coins": 25, "xp": 12 },
    { "dayNumber": 5, "coins": 30, "xp": 15 },
    { "dayNumber": 6, "coins": 35, "xp": 18 },
    { "dayNumber": 7, "coins": 10, "xp": 5 }
  ],
  "bigReward": {
    "coins": 200,
    "xp": 100,
    "awardBadge": true,
    "badgeName": "Perfect Week 🏆"
  },
  "fallbackReward": {
    "coins": 50,
    "xp": 25
  },
  "isActive": true
}
```

**Expected**: 201 Created with config data

#### 1.3 Verify Config Created
**Endpoint**: `GET /api/admin/daily-rewards/config`

**Expected Response**:
```json
{
  "success": true,
  "data": {
    "version": 1,
    "days": [...],
    "bigReward": {...},
    "isActive": true
  }
}
```

---

### **STEP 2: User Testing - Daily Flow**

#### 2.1 Import User Collection
```
1. Import: Daily_Rewards_User.postman_collection.json
2. Set variables:
   - base_url: http://localhost:4001
   - jwt_token: <your user JWT>
```

#### 2.2 View Current Week
**Endpoint**: `GET /api/daily-rewards/week`

**Run**: "1. Get Current Week" request

**Expected Response**:
```json
{
  "success": true,
  "data": {
    "weekKey": "2025-W41",
    "weekStart": "2025-10-06T00:00:00.000Z",
    "weekEnd": "2025-10-12T23:59:59.999Z",
    "todayDayNumber": 3,
    "days": [
      {
        "dayNumber": 1,
        "status": "claimable",
        "claimedAt": null,
        "coins": 0,
        "xp": 0
      },
      {
        "dayNumber": 2,
        "status": "locked",
        "coins": 0,
        "xp": 0
      }
      // ... days 3-7 locked
    ],
    "bigRewardEligible": false,
    "bigRewardGranted": false,
    "countdown": 43200000
  }
}
```

**What to check**:
- ✅ `todayDayNumber` matches current day (1=Monday, 7=Sunday)
- ✅ Today's day has `status: "claimable"`
- ✅ Other days are `locked`
- ✅ `countdown` shows milliseconds until end of day

#### 2.3 Claim Today's Reward
**Endpoint**: `POST /api/daily-rewards/claim`

**Run**: "2. Claim Today's Reward" request

**Expected Response** (Day 1):
```json
{
  "success": true,
  "data": {
    "day": 1,
    "coins": 10,
    "xp": 5,
    "bigReward": false,
    "newBalance": 110,
    "newXP": 55
  }
}
```

**What happens**:
- ✅ Coins and XP credited to user wallet
- ✅ Transaction created
- ✅ Day 1 marked as `claimed`
- ✅ Day 2 unlocked (becomes `claimable`)

#### 2.4 Verify Claim
**Endpoint**: `GET /api/daily-rewards/week`

**Run**: "1. Get Current Week" again

**Expected**:
```json
{
  "days": [
    {
      "dayNumber": 1,
      "status": "claimed",
      "claimedAt": "2025-10-08T10:30:00.000Z",
      "coins": 10,
      "xp": 5
    },
    {
      "dayNumber": 2,
      "status": "claimable",
      // Now unlocked!
    }
  ]
}
```

#### 2.5 Try Claiming Again (Should Fail)
**Endpoint**: `POST /api/daily-rewards/claim`

**Expected**: 400 Bad Request
```json
{
  "success": false,
  "error": "Reward not claimable"
}
```

---

### **STEP 3: Test Day 7 Big Reward**

#### 3.1 Simulate Perfect Week
To test the big reward, you need to claim all 7 days consecutively.

**Option A: Wait 7 days** (Real testing)
- Claim each day for 7 consecutive days
- On Day 7, you'll get the big reward

**Option B: Database Manipulation** (Quick testing)
```javascript
// In MongoDB shell or Compass
db.dailyrewardprogresses.updateOne(
  { userId: ObjectId("YOUR_USER_ID"), weekKey: "2025-W41" },
  { 
    $set: { 
      "days.0.status": "claimed",
      "days.1.status": "claimed",
      "days.2.status": "claimed",
      "days.3.status": "claimed",
      "days.4.status": "claimed",
      "days.5.status": "claimed",
      "days.6.status": "claimable"  // Day 7 ready to claim
    }
  }
)
```

#### 3.2 Claim Day 7
**Endpoint**: `POST /api/daily-rewards/claim`

**Expected Response** (Perfect Week):
```json
{
  "success": true,
  "data": {
    "day": 7,
    "coins": 210,
    "xp": 105,
    "bigReward": true,
    "newBalance": 1420,
    "newXP": 705
  }
}
```

**Breakdown**:
- Base Day 7: 10 coins + 5 XP
- Big Reward Bonus: +200 coins + 100 XP
- **Total**: 210 coins + 105 XP
- Badge "Perfect Week 🏆" added to user

---

### **STEP 4: Test Missed Day Scenario**

#### 4.1 Simulate Missed Day
```javascript
// Mark Day 3 as missed
db.dailyrewardprogresses.updateOne(
  { userId: ObjectId("YOUR_USER_ID"), weekKey: "2025-W41" },
  { 
    $set: { 
      "days.0.status": "claimed",
      "days.1.status": "claimed",
      "days.2.status": "missed",  // Day 3 missed
      "days.3.status": "claimed",
      "days.4.status": "claimed",
      "days.5.status": "claimed",
      "days.6.status": "claimable"  // Day 7
    }
  }
)
```

#### 4.2 Claim Day 7
**Expected Response** (Imperfect Week):
```json
{
  "success": true,
  "data": {
    "day": 7,
    "coins": 10,
    "xp": 5,
    "bigReward": false,
    "newBalance": 1020,
    "newXP": 555
  }
}
```

**What happened**:
- ❌ Big reward NOT granted (Day 3 was missed)
- ✅ Normal Day 7 reward only (10 coins + 5 XP)
- ❌ No badge awarded

---

## 📊 Admin Monitoring

### View User Progress
**Endpoint**: `GET /api/admin/daily-rewards/users/:userId/week?date=2025-10-08`

**Use Case**: Check specific user's week progress

### Get Weekly Summary
**Endpoint**: `GET /api/admin/daily-rewards/summary?weekKey=2025-W41`

**Response**:
```json
{
  "success": true,
  "data": {
    "weekKey": "2025-W41",
    "overall": {
      "totalUsers": 1250,
      "bigRewardsGranted": 340,
      "perfectWeeks": 340
    },
    "perDay": [
      {
        "_id": 1,
        "claimed": 1200,
        "missed": 50,
        "totalUsers": 1250
      },
      {
        "_id": 7,
        "claimed": 400,
        "missed": 850,
        "totalUsers": 1250
      }
    ]
  }
}
```

**Insights**:
- 27.2% of users achieved perfect week (340/1250)
- Day 1 claim rate: 96% (1200/1250)
- Day 7 claim rate: 32% (400/1250)

---

## 🎯 Acceptance Criteria Testing

| AC | Requirement | How to Test | Status |
|----|-------------|-------------|--------|
| AC1 | Navigate weeks | GET `/week?date=2025-10-06` (previous week) | ✅ |
| AC2 | "CLAIM NOW" on login | Check `status: "claimable"` | ✅ |
| AC3 | Shows "CLAIMED" | After claim, `status: "claimed"` | ✅ |
| AC4 | Missed shows red X | `status: "missed"` for skipped days | ✅ |
| AC5 | Missed day = no big reward | Day 7 claim returns `bigReward: false` | ✅ |
| AC6 | Timer for next unlock | `countdown` field in milliseconds | ✅ |
| AC7 | Big reward animation | `bigReward: true` only if days 1-6 claimed | ✅ |
| AC8 | Server-side persistence | Progress stored in DB per user/week | ✅ |

---

## 🔄 Week-by-Week Flow

### Monday (Day 1)
```
GET /week
→ Day 1: claimable, Days 2-7: locked

POST /claim
→ +10 coins, +5 XP
→ Day 1: claimed, Day 2: claimable
```

### Tuesday (Day 2)
```
GET /week
→ Day 1: claimed, Day 2: claimable, Days 3-7: locked

POST /claim
→ +15 coins, +8 XP
→ Day 2: claimed, Day 3: claimable
```

### ... Days 3-6 (Same Pattern)

### Sunday (Day 7) - Perfect Week
```
GET /week
→ Days 1-6: claimed, Day 7: claimable
→ bigRewardEligible: false (not yet claimed)

POST /claim
→ +210 coins (10 + 200 big bonus)
→ +105 XP (5 + 100 big bonus)
→ bigReward: true
→ Badge "Perfect Week 🏆" added
```

### Sunday (Day 7) - Missed Day Earlier
```
GET /week
→ Days 1-2: claimed, Day 3: missed, Days 4-6: claimed, Day 7: claimable

POST /claim
→ +10 coins (normal reward only)
→ +5 XP
→ bigReward: false
→ No badge
```

---

## 🎨 Frontend UI Guidelines

### Calendar States
```javascript
const dayStyles = {
  'locked': { bg: 'grey', icon: '🔒', clickable: false },
  'claimable': { bg: 'green-pulsing', text: 'CLAIM NOW', clickable: true },
  'claimed': { bg: 'green', icon: '✓', text: 'CLAIMED', clickable: false },
  'missed': { bg: 'red', icon: '❌', text: 'UNCLAIMED', clickable: false }
};
```

### Big Reward Day 7
```javascript
// Check if eligible for big reward
if (dayNumber === 7) {
  const allPreviousClaimed = days.slice(0, 6).every(d => d.status === 'claimed');
  
  if (allPreviousClaimed) {
    // Show gold chest animation
    showBigRewardChest();
  } else {
    // Show normal chest
    showNormalChest();
  }
}
```

### Countdown Timer
```javascript
// Convert countdown (ms) to HH:MM:SS
const ms = data.countdown;
const hours = Math.floor(ms / 3600000);
const minutes = Math.floor((ms % 3600000) / 60000);
const seconds = Math.floor((ms % 60000) / 1000);

const formatted = `${hours}h ${minutes}m ${seconds}s`;
// Update every second
```

---

## 🧪 Test Scenarios

### Scenario 1: Perfect Week (Big Reward)
```
Day 1: Claim → +10 coins
Day 2: Claim → +15 coins
Day 3: Claim → +20 coins
Day 4: Claim → +25 coins
Day 5: Claim → +30 coins
Day 6: Claim → +35 coins
Day 7: Claim → +210 coins (10 + 200 big bonus) 🎉

Total: 345 coins + badge
```

### Scenario 2: Missed Day 3
```
Day 1: Claim → +10 coins
Day 2: Claim → +15 coins
Day 3: SKIP (missed)
Day 4: Claim → +25 coins (Day 3 auto-marked as missed)
Day 5: Claim → +30 coins
Day 6: Claim → +35 coins
Day 7: Claim → +10 coins (NO big bonus) ❌

Total: 125 coins, no badge
```

### Scenario 3: Navigation Between Weeks
```
Current Week: GET /week
→ Shows this week Mon-Sun

Previous Week: GET /week?date=2025-10-01
→ Shows week containing Oct 1

Future Week: GET /week?date=2025-10-15
→ Shows next week (all locked)
```

---

## 📋 Admin Panel Testing

### Configuration Management

#### View Active Config
```
GET /api/admin/daily-rewards/config
→ Returns current active configuration
```

#### Create New Config Version
```
POST /api/admin/daily-rewards/config
→ Auto-deactivates old configs
→ Activates new one
```

#### List All Configs
```
GET /api/admin/daily-rewards/configs
→ See all versions (active and inactive)
```

#### Toggle Config
```
PATCH /api/admin/daily-rewards/config/:id/toggle
→ Activate/deactivate a config
```

### User Monitoring

#### View Specific User's Week
```
GET /api/admin/daily-rewards/users/:userId/week?date=2025-10-08
→ See their progress for that week
```

#### View User's History
```
GET /api/admin/daily-rewards/users/:userId/history?weeks=10
→ Last 10 weeks of progress
```

#### Weekly Analytics
```
GET /api/admin/daily-rewards/summary?weekKey=2025-W41
→ Overall stats: claim rates, big rewards granted
```

---

## 🔍 Troubleshooting

### Issue: "Reward not claimable"
**Cause**: Day is not in `claimable` state

**Solutions**:
- Check: GET `/week` to see actual status
- Already claimed today → status is `claimed`
- Not yet unlocked → previous day not claimed
- Missed day → status is `missed`, cannot claim

### Issue: No big reward on Day 7
**Cause**: One or more days 1-6 were missed or not claimed

**Check**:
```
GET /week
→ Verify days[0-5] all have status: "claimed"
```

### Issue: Countdown shows 0 or negative
**Cause**: Day already passed

**Solution**: 
- This is expected for past days
- Frontend should hide timer if countdown ≤ 0

### Issue: Config not found
**Cause**: No DailyRewardConfig created yet

**Solution**:
- Run "Seed Default Config" in Admin collection
- Or create via POST `/config`

---

## 📊 Database Verification

### Check Config
```javascript
db.dailyrewardconfigs.find({ isActive: true })
```

### Check User Progress
```javascript
db.dailyrewardprogresses.find({ 
  userId: ObjectId("USER_ID"),
  weekKey: "2025-W41"
})
```

### Check Transactions
```javascript
db.transactions.find({
  user: ObjectId("USER_ID"),
  description: /Daily Reward/
}).sort({ createdAt: -1 })
```

---

## ✅ Complete Test Checklist

### Admin Setup
- [ ] Admin collection imported
- [ ] Admin JWT token set
- [ ] Config created successfully
- [ ] Config appears in GET /config
- [ ] Days array has exactly 7 entries
- [ ] Big reward configured

### User Flow - Day 1
- [ ] User collection imported
- [ ] User JWT token set
- [ ] GET /week returns data
- [ ] Day 1 shows `claimable`
- [ ] POST /claim succeeds
- [ ] Wallet balance increased
- [ ] Day 1 now shows `claimed`
- [ ] Day 2 now shows `claimable`

### User Flow - Day 7 (Perfect)
- [ ] Days 1-6 all claimed
- [ ] Day 7 shows `claimable`
- [ ] POST /claim on Day 7
- [ ] Response shows `bigReward: true`
- [ ] Coins include +200 bonus
- [ ] XP includes +100 bonus
- [ ] Badge added to user profile

### User Flow - Day 7 (Missed)
- [ ] One or more days 1-6 missed
- [ ] Day 7 claim returns normal reward
- [ ] Response shows `bigReward: false`
- [ ] No badge awarded

### Navigation
- [ ] GET /week (current week)
- [ ] GET /week?date=YYYY-MM-DD (specific week)
- [ ] GET /history shows past weeks

### Admin Monitoring
- [ ] GET /users/:id/week shows user progress
- [ ] GET /summary shows analytics
- [ ] Can view claim rates per day
- [ ] Can see big rewards granted count

---

## 🎯 Key Points to Remember

1. **One claim per day**: User can only claim once per day (24-hour window)

2. **Week is Monday-Sunday**: Uses ISO week standard (Mon=1, Sun=7)

3. **Big reward requires perfect streak**: All days 1-6 must be `claimed`

4. **Missed days auto-detected**: When claiming a day, past `locked` days become `missed`

5. **Config is global**: All users use the same active config

6. **Week progresses automatically**: New week starts every Monday at 00:00 UTC

7. **Countdown resets daily**: Timer shows time until end of current day

8. **Rewards are cumulative**: On Day 7, user gets base + big bonus if eligible

---

## 📞 API Quick Reference

### User APIs
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/daily-rewards/week` | GET | Get current/specific week |
| `/api/daily-rewards/claim` | POST | Claim today's reward |
| `/api/daily-rewards/history` | GET | Get past weeks |

### Admin APIs
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/admin/daily-rewards/config` | GET | Get active config |
| `/api/admin/daily-rewards/config` | POST | Create/update config |
| `/api/admin/daily-rewards/configs` | GET | List all configs |
| `/api/admin/daily-rewards/config/:id/toggle` | PATCH | Toggle active |
| `/api/admin/daily-rewards/users/:userId/week` | GET | User's week |
| `/api/admin/daily-rewards/users/:userId/history` | GET | User's history |
| `/api/admin/daily-rewards/summary` | GET | Analytics |

---

## 🎉 Summary

You now have:
- ✅ **2 Postman collections** (User + Admin)
- ✅ **Complete testing workflow**
- ✅ **Sample requests and responses**
- ✅ **Troubleshooting guide**
- ✅ **Database verification queries**
- ✅ **Frontend integration examples**

**Start testing now**:
1. Import both collections
2. Run "Seed Default Config" (Admin)
3. Run "Get Current Week" (User)
4. Run "Claim Today's Reward" (User)
5. Verify rewards in wallet

🚀 **Daily Rewards V1.0 is ready for production!**

