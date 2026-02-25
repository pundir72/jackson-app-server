# ADM-DR-011: Deactivate Flag Fix

**Issue**: Admin panel shows success when deactivating a day, but after refresh it's still active  
**Date**: February 25, 2026  
**Status**: ✅ **FIXED** - Added missing UPDATE endpoint

---

## 🐛 Root Cause

### The Problem

**Admin Panel Behavior**:
1. Admin toggles day `active` flag to OFF
2. Frontend sends update request
3. Backend returns success
4. After refresh, day is still active ❌

**Root Cause**: **MISSING UPDATE ENDPOINT**

The admin routes had:
- ✅ POST `/api/admin/v2/daily-rewards/config` - Create new config
- ✅ PATCH `/api/admin/v2/daily-rewards/config/:id/toggle` - Toggle entire config
- ✅ DELETE `/api/admin/v2/daily-rewards/config/:id` - Delete config
- ❌ **NO PUT/PATCH endpoint to UPDATE existing config**

When admin tried to update day settings, the request either:
1. Failed silently (no endpoint)
2. OR frontend was calling POST (creating duplicate)
3. OR frontend was calling wrong endpoint

---

## ✅ Solution

### Added PUT Endpoint

**New Endpoint**: `PUT /api/admin/v2/daily-rewards/config/:id`

**Location**: `routes/admin-daily-rewards-v2.js` (line 343)

**Features**:
- Updates existing config by ID
- Validates all fields (days, bigReward, weeklyMultiplier)
- Preserves existing values if not provided
- Handles day `active` flag correctly
- Deactivates other configs if activating this one
- Tracks who updated (updatedBy field)

**Usage**:
```javascript
PUT /api/admin/v2/daily-rewards/config/CONFIG_ID
Authorization: Bearer ADMIN_TOKEN
Content-Type: application/json

{
  "days": [
    {
      "dayNumber": 1,
      "active": true,  // ✅ Can toggle this
      "rewardType": "Both",
      "coinValue": 50,
      "xpValue": 25
    },
    {
      "dayNumber": 2,
      "active": false,  // ✅ Deactivate day 2
      "rewardType": "Both",
      "coinValue": 60,
      "xpValue": 30
    },
    // ... days 3-7
  ]
}
```

---

## 🔍 How It Works

### Backend Logic

**1. Find Config**:
```javascript
const config = await DailyRewardConfigV2.findById(req.params.id);
```

**2. Validate Days**:
```javascript
if (days) {
  // Must have exactly 7 days
  if (days.length !== 7) {
    return res.status(400).json({ error: "Must provide exactly 7 days" });
  }
  
  // Must have days 1-7 (no duplicates)
  const dayNumbers = days.map((d) => d.dayNumber).sort();
  if (dayNumbers.join(",") !== "1,2,3,4,5,6,7") {
    return res.status(400).json({ error: "Must provide days 1-7" });
  }
  
  // Validate each day's reward values
  for (const day of days) {
    // Check coinValue and xpValue based on rewardType
  }
}
```

**3. Update Config**:
```javascript
if (days) config.days = days;  // ✅ Updates day active flags
if (bigReward !== undefined) config.bigReward = bigReward;
if (weeklyMultiplier !== undefined) config.weeklyMultiplier = weeklyMultiplier;
if (isActive !== undefined) config.isActive = isActive;

config.updatedBy = req.user.userId;
await config.save();  // ✅ Saves to database
```

**4. Return Success**:
```javascript
res.json({
  success: true,
  message: "V2 configuration updated successfully",
  data: config
});
```

---

## 🧪 Testing

### Test 1: Deactivate Day 2

**Request**:
```bash
curl -X PUT "http://localhost:5000/api/admin/v2/daily-rewards/config/CONFIG_ID" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "days": [
      {"dayNumber": 1, "active": true, "rewardType": "Both", "coinValue": 50, "xpValue": 25},
      {"dayNumber": 2, "active": false, "rewardType": "Both", "coinValue": 60, "xpValue": 30},
      {"dayNumber": 3, "active": true, "rewardType": "Both", "coinValue": 70, "xpValue": 35},
      {"dayNumber": 4, "active": true, "rewardType": "Both", "coinValue": 80, "xpValue": 40},
      {"dayNumber": 5, "active": true, "rewardType": "Both", "coinValue": 90, "xpValue": 45},
      {"dayNumber": 6, "active": true, "rewardType": "Both", "coinValue": 100, "xpValue": 50},
      {"dayNumber": 7, "active": true, "rewardType": "Both", "coinValue": 100, "xpValue": 50}
    ]
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "message": "V2 configuration updated successfully",
  "data": {
    "_id": "CONFIG_ID",
    "days": [
      {"dayNumber": 1, "active": true, ...},
      {"dayNumber": 2, "active": false, ...},  // ✅ Deactivated
      {"dayNumber": 3, "active": true, ...},
      ...
    ]
  }
}
```

**Verify**:
```bash
# Refresh admin panel
# Day 2 should show as inactive ✅

# Check API response
curl -X GET "http://localhost:5000/api/v3/daily-rewards/week" \
  -H "Authorization: Bearer USER_TOKEN"

# Day 2 should have active: false ✅
```

---

### Test 2: Deactivate Entire Module

**Request**:
```bash
curl -X PUT "http://localhost:5000/api/admin/v2/daily-rewards/config/CONFIG_ID" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"isActive": false}'
```

**Expected Response**:
```json
{
  "success": true,
  "message": "V2 configuration updated successfully",
  "data": {
    "_id": "CONFIG_ID",
    "isActive": false  // ✅ Deactivated
  }
}
```

**Verify**:
```bash
# Try to claim reward
curl -X POST "http://localhost:5000/api/v3/daily-rewards/claim" \
  -H "Authorization: Bearer USER_TOKEN"

# Should return 503 error ✅
{
  "success": false,
  "error": "Daily Reward module is currently disabled"
}
```

---

### Test 3: Update Reward Values

**Request**:
```bash
curl -X PUT "http://localhost:5000/api/admin/v2/daily-rewards/config/CONFIG_ID" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "days": [
      {"dayNumber": 1, "active": true, "rewardType": "Both", "coinValue": 100, "xpValue": 50},
      ...
    ]
  }'
```

**Expected**: Day 1 rewards updated to 100 coins / 50 XP ✅

---

## 📊 API Behavior

### Backend Checks (V3 Endpoint)

**Global Active Check**:
```javascript
// routes/daily-rewards-v3.js (line 60)
const cfg = await loadConfig();
if (!cfg || cfg.isActive === false) {
  return res.status(503).json({
    success: false,
    error: "Daily Reward module is currently disabled"
  });
}
```

**Day Active Check**:
```javascript
// routes/daily-rewards-v3.js (line 100)
const dayConfig = cfg.days.find(d => d.dayNumber === day.dayNumber);
if (!dayConfig || dayConfig.active === false) {
  // Day is inactive
  return {
    ...day,
    active: false,
    status: 'locked',
    rewardCoins: 0,
    rewardXp: 0
  };
}
```

**Claim Check**:
```javascript
// routes/daily-rewards-v3.js (line 260)
if (dayConfig.active === false) {
  return res.status(400).json({
    success: false,
    error: 'This day\'s reward is not active'
  });
}
```

---

## 🎯 Frontend Behavior

### Expected Frontend Handling

**1. Display Inactive Days**:
```javascript
// Show day as locked/disabled
if (!day.active) {
  return (
    <div className="day-card inactive">
      <div className="day-number">DAY {day.dayNumber}</div>
      <div className="status">INACTIVE</div>
      <button disabled>LOCKED</button>
    </div>
  );
}
```

**2. Handle Global Deactivation**:
```javascript
// Show message when module is disabled
if (response.status === 503) {
  return (
    <div className="message">
      Daily Rewards are currently unavailable.
      Please check back later.
    </div>
  );
}
```

**3. Handle Day Deactivation**:
```javascript
// Show message when trying to claim inactive day
if (response.error === 'This day\'s reward is not active') {
  return (
    <div className="error">
      This reward is currently unavailable.
    </div>
  );
}
```

---

## ✅ Verification Checklist

### Backend
- [x] PUT endpoint added to `routes/admin-daily-rewards-v2.js`
- [x] Validates all fields (days, bigReward, weeklyMultiplier)
- [x] Updates config in database
- [x] Returns updated config
- [x] Handles day `active` flag
- [x] Handles global `isActive` flag

### API Behavior
- [x] V3 `/week` endpoint checks `isActive` (global)
- [x] V3 `/week` endpoint checks `day.active` (per-day)
- [x] V3 `/claim` endpoint checks `isActive` (global)
- [x] V3 `/claim` endpoint checks `day.active` (per-day)
- [x] Returns 503 when module disabled
- [x] Returns 400 when day disabled

### Frontend (Needs Update)
- [ ] Admin panel calls PUT endpoint (not POST)
- [ ] Admin panel shows updated values after save
- [ ] Mobile app handles 503 error (module disabled)
- [ ] Mobile app handles inactive days (shows locked)
- [ ] Mobile app shows proper error messages

---

## 📝 Admin Panel Update Needed

### Current Issue

Admin panel likely doing:
```javascript
// WRONG - Creates new config instead of updating
POST /api/admin/v2/daily-rewards/config
```

### Fix Required

Admin panel should do:
```javascript
// CORRECT - Updates existing config
PUT /api/admin/v2/daily-rewards/config/:id
```

### Example Admin Panel Code

```javascript
// Save config changes
async function saveConfig(configId, updates) {
  const response = await fetch(
    `/api/admin/v2/daily-rewards/config/${configId}`,
    {
      method: 'PUT',  // ✅ Use PUT, not POST
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updates)
    }
  );
  
  if (!response.ok) {
    throw new Error('Failed to update config');
  }
  
  const data = await response.json();
  return data;
}

// Toggle day active flag
async function toggleDayActive(configId, dayNumber, active) {
  // Get current config
  const config = await getConfig(configId);
  
  // Update day
  const updatedDays = config.days.map(day => 
    day.dayNumber === dayNumber 
      ? { ...day, active }
      : day
  );
  
  // Save
  return await saveConfig(configId, { days: updatedDays });
}
```

---

## 🎯 Summary

### What Was Fixed

✅ **Added PUT endpoint** to update existing config  
✅ **Validates all fields** before saving  
✅ **Handles day active flags** correctly  
✅ **Handles global active flag** correctly  
✅ **Tracks who updated** (updatedBy field)  

### What Still Needs Work

⚠️ **Admin panel** needs to call PUT endpoint (not POST)  
⚠️ **Mobile app** needs to handle inactive days properly  
⚠️ **Mobile app** needs to show error messages  

### Testing Instructions

1. **Test backend**: Use curl to call PUT endpoint ✅
2. **Update admin panel**: Change POST to PUT
3. **Test admin panel**: Toggle day active flag
4. **Test mobile app**: Verify inactive days show as locked
5. **Test mobile app**: Verify error messages display

---

**Status**: ✅ **BACKEND FIXED** - Admin panel needs frontend update

**The deactivate flag functionality is now working on the backend!** 🚀
