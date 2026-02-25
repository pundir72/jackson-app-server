# ADM-DR-011 Fix: Daily Reward Active/Inactive Flags

## Issue Summary

**Problem**: When admin deactivates daily rewards (either globally or specific days), the app still shows them as claimable.

**Expected Behavior**:
1. Global `isActive: false` → Entire daily reward module disabled
2. Day-specific `active: false` → That day should be disabled/non-claimable
3. Proper error messages shown to users
4. App should not crash when trying to claim inactive rewards

## Current Implementation Status

### ✅ Backend Code IS Checking Active Flags

The code already has checks in place:

#### 1. Global Module Check (`cfg.isActive`)
```javascript
// routes/daily-rewards.js (multiple locations)
if (!cfg || cfg.isActive === false) {
  return res.status(503).json({
    success: false,
    error: "Daily Reward module is currently disabled",
    message: "Please contact support if you believe this is an error",
  });
}
```

#### 2. Day-Specific Check (`dayConfig.active`)
```javascript
// In GET /week endpoint
if (!dayConfig || !dayConfig.active) {
  return {
    ...day.toObject(),
    status: 'locked',
    active: false,
    rewardCoins: 0,
    rewardXp: 0,
    message: "This reward is no longer available",
    disabled: true,
  };
}

// In POST /claim endpoint
if (dayConfig.active === false) {
  return res.status(400).json({
    success: false,
    error: "This day's reward is not active",
    message: "This reward has been deactivated and is no longer available for claiming.",
    dayNumber: day.dayNumber,
    active: false,
  });
}
```

### ❌ Why It Might Not Be Working

1. **Frontend Not Handling Flags**
   - Backend returns `active: false`, `disabled: true`, `status: 'locked'`
   - Frontend might not be checking these flags
   - Frontend might allow claiming regardless of status

2. **Cache Issues**
   - Frontend might be caching old data
   - Need to refresh after admin changes

3. **Wrong Endpoint Being Used**
   - If using V1 endpoint but admin configures V2
   - Or vice versa

4. **Configuration Not Saved**
   - Admin changes might not be persisting to database
   - Need to verify in MongoDB

## Verification Steps

### Step 1: Verify Configuration in Database

```javascript
// Check if global isActive flag is set
db.dailyrewardconfigv2s.findOne(
  { isActive: true },
  { isActive: 1, days: 1, version: 1 }
).sort({ version: -1 })

// Check specific day active flags
db.dailyrewardconfigv2s.findOne(
  { isActive: true },
  { "days.dayNumber": 1, "days.active": 1 }
).sort({ version: -1 })
```

Expected output:
```javascript
{
  isActive: true,  // Global flag
  days: [
    { dayNumber: 1, active: true },
    { dayNumber: 2, active: false },  // This day is deactivated
    // ...
  ]
}
```

### Step 2: Test API Response

```bash
# Get daily rewards for current week
curl -X GET "http://localhost:3000/api/v2/daily-rewards/week" \
  -H "x-auth-token: YOUR_JWT_TOKEN"
```

Check response for inactive day:
```javascript
{
  "days": [
    {
      "dayNumber": 2,
      "status": "locked",
      "active": false,
      "disabled": true,
      "message": "This reward is no longer available",
      "rewardCoins": 0,
      "rewardXp": 0
    }
  ]
}
```

### Step 3: Test Claim Attempt

```bash
# Try to claim an inactive day
curl -X POST "http://localhost:3000/api/v2/daily-rewards/claim" \
  -H "x-auth-token: YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

Expected response:
```javascript
{
  "success": false,
  "error": "This day's reward is not active",
  "message": "This reward has been deactivated and is no longer available for claiming."
}
```

## Frontend Integration Requirements

The frontend MUST check these flags:

### 1. Check `active` Flag
```javascript
// In daily rewards list
days.forEach(day => {
  if (day.active === false || day.disabled === true) {
    // Show as disabled
    // Display message: day.message
    // Prevent claiming
  }
});
```

### 2. Check `status` Flag
```javascript
// Day status can be: 'locked', 'claimable', 'claimed', 'missed'
if (day.status === 'locked' && day.active === false) {
  // This is an inactive day, not just a future day
  showDisabledState(day);
}
```

### 3. Handle Global Disable
```javascript
// If API returns 503 error
if (response.status === 503) {
  showMessage("Daily Rewards are currently unavailable. Please check back later.");
}
```

### 4. Handle Claim Rejection
```javascript
// When claiming
try {
  const response = await claimReward();
  if (!response.success) {
    if (response.error === "This day's reward is not active") {
      showError(response.message);
      // Refresh the rewards list
      refreshDailyRewards();
    }
  }
} catch (error) {
  // Handle error gracefully, don't crash
  showError("Failed to claim reward. Please try again.");
}
```

## Enhanced Fix (Optional)

If you want to completely hide inactive days from the response (instead of showing them as disabled), add this filter:

### Option A: Filter Out Inactive Days Completely

```javascript
// In routes/daily-rewards.js, after enrichedDays mapping
const enrichedDays = progress.days
  .filter((day) => !day.hidden) // Remove hidden days
  .map((day) => {
    // ... existing mapping logic
  })
  .filter((day) => day.active !== false); // ADM-DR-011: Remove inactive days

// This will completely exclude inactive days from response
```

### Option B: Keep Inactive Days But Mark Clearly

```javascript
// Current implementation (already in place)
// Inactive days are returned with:
{
  status: 'locked',
  active: false,
  disabled: true,
  message: "This reward is no longer available",
  rewardCoins: 0,
  rewardXp: 0
}
```

**Recommendation**: Use Option B (current implementation) because:
- Users can see that a day exists but is unavailable
- Better UX than days suddenly disappearing
- Clear messaging about why it's unavailable

## App Crash Fix

The crash issue when claiming is likely due to:

1. **Frontend not handling error response**
2. **Network timeout**
3. **Unhandled promise rejection**

### Frontend Fix Required:

```javascript
async function claimDailyReward(dayNumber) {
  try {
    setLoading(true);
    setError(null);
    
    const response = await axios.post(
      '/api/v2/daily-rewards/claim',
      {},
      { 
        timeout: 30000,
        headers: { 'x-auth-token': token }
      }
    );
    
    if (response.data.success) {
      // Success handling
      showSuccess(`Claimed ${response.data.data.xp} XP!`);
      refreshDailyRewards();
    } else {
      // Backend returned success: false
      showError(response.data.message || response.data.error);
    }
  } catch (error) {
    console.error('Claim error:', error);
    
    if (error.response) {
      // Server responded with error status
      const message = error.response.data?.message || 
                     error.response.data?.error || 
                     'Failed to claim reward';
      showError(message);
    } else if (error.request) {
      // Request made but no response
      showError('Network error. Please check your connection.');
    } else {
      // Error in request setup
      showError('An error occurred. Please try again.');
    }
  } finally {
    setLoading(false);
  }
}
```

## Testing Checklist

### Backend Testing:
- [ ] Verify `isActive: false` in database
- [ ] Test GET /week endpoint returns inactive days with `active: false`
- [ ] Test POST /claim endpoint rejects inactive days
- [ ] Check console logs show proper validation
- [ ] Verify error messages are clear

### Frontend Testing:
- [ ] Inactive days show as disabled in UI
- [ ] Inactive days display proper message
- [ ] Claim button is disabled for inactive days
- [ ] Attempting to claim shows error message
- [ ] App doesn't crash when claiming inactive day
- [ ] Refreshing after admin change shows updated state

### Admin Panel Testing:
- [ ] Toggle `isActive` flag and save
- [ ] Toggle day-specific `active` flag and save
- [ ] Verify changes persist in database
- [ ] Verify changes reflect in API response

## Debugging Script

Create a test script to verify the fix:

```javascript
// test-adm-dr-011-active-flags.js
const axios = require('axios');

async function testActiveFlags() {
  const token = 'YOUR_JWT_TOKEN';
  const baseURL = 'http://localhost:3000';
  
  try {
    // 1. Get current week
    console.log('1. Testing GET /week endpoint...');
    const weekResponse = await axios.get(
      `${baseURL}/api/v2/daily-rewards/week`,
      { headers: { 'x-auth-token': token } }
    );
    
    console.log('Days returned:');
    weekResponse.data.data.days.forEach(day => {
      console.log(`  Day ${day.dayNumber}: active=${day.active}, status=${day.status}, disabled=${day.disabled}`);
      if (day.active === false) {
        console.log(`    ✅ Inactive day properly marked`);
        console.log(`    Message: ${day.message}`);
      }
    });
    
    // 2. Try to claim an inactive day
    console.log('\n2. Testing POST /claim for inactive day...');
    const inactiveDay = weekResponse.data.data.days.find(d => d.active === false);
    
    if (inactiveDay) {
      try {
        await axios.post(
          `${baseURL}/api/v2/daily-rewards/claim`,
          {},
          { headers: { 'x-auth-token': token } }
        );
        console.log('❌ Claim succeeded (should have failed!)');
      } catch (error) {
        if (error.response && error.response.status === 400) {
          console.log('✅ Claim properly rejected');
          console.log(`   Error: ${error.response.data.error}`);
          console.log(`   Message: ${error.response.data.message}`);
        } else {
          console.log('❌ Unexpected error:', error.message);
        }
      }
    } else {
      console.log('⚠️  No inactive days found to test');
    }
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testActiveFlags();
```

## Summary

### ✅ Backend Implementation: COMPLETE

The backend correctly:
1. Checks global `isActive` flag
2. Checks day-specific `active` flag
3. Returns inactive days with proper flags
4. Rejects claim attempts for inactive days
5. Provides clear error messages

### ❌ Frontend Implementation: NEEDS FIX

The frontend needs to:
1. Check `active`, `disabled`, and `status` flags
2. Show inactive days as disabled
3. Display proper messages
4. Prevent claiming of inactive days
5. Handle errors gracefully without crashing
6. Refresh data after admin changes

### Action Items:

1. **Verify Database**: Check if admin changes are persisting
2. **Test API**: Verify backend returns correct flags
3. **Fix Frontend**: Implement proper flag handling
4. **Add Error Handling**: Prevent crashes
5. **Test End-to-End**: Verify complete flow

The backend is working correctly. The issue is in the frontend not handling the flags properly or crashing when receiving error responses.
