# Complete Testing Guide - Daily Rewards Fixes

**Date**: February 25, 2026  
**Purpose**: Test ADM-DR-001, ADM-DR-006, and ADM-DR-011 fixes across all platforms

---

## 🚀 Quick Start - Run Everything

### Terminal 1: Backend
```bash
# Install dependencies (if not done)
npm install

# Start backend server
npm run dev
```
Backend will run on: `http://localhost:5000` (or check your .env for PORT)

### Terminal 2: Admin Panel
```bash
# Navigate to admin frontend
cd admin-frontend

# Install dependencies (if not done)
npm install

# Start admin panel
npm run dev
```
Admin panel will run on: `http://localhost:3000`

### Terminal 3: Mobile App (Web Version)
```bash
# Navigate to mobile app
cd JacksonRewardsApp

# Install dependencies (if not done)
npm install

# Start mobile app
npm run dev
```
Mobile app will run on: `http://localhost:3001` (or next available port)

---

## 📱 Testing Platforms

You have 3 platforms to test:
1. **Backend API** - Direct API testing with curl/Postman
2. **Admin Panel** - Next.js web app for admin configuration
3. **Mobile App** - React Native app (can test web version or build for Android/iOS)

---

## 🧪 Test Plan

### STEP 1: Backend Verification (No Frontend Needed)

Run these scripts to verify backend fixes:

```bash
# Verify ADM-DR-001 duplicate function fix
node verify-adm-dr-001-duplicate-fix.js
# Expected: ✅ PASS: Only one definition exists

# Test ADM-DR-001 mid-week join logic
node test-adm-dr-001-fix.js
# Expected: Shows correct user-relative days for first week

# Test ADM-DR-006 XP multiplier configuration
node test-adm-dr-006-multipliers.js
# Expected: Shows if XPTier has accessBenefits field

# Test ADM-DR-011 active/inactive flags
node test-adm-dr-011-active-flags.js
# Expected: Shows flag handling in database
```

---

### STEP 2: Admin Panel Testing

**Start Backend + Admin Panel** (Terminals 1 & 2)

#### Test ADM-DR-011 (Active/Inactive Flags)

1. **Login to Admin Panel**
   - URL: `http://localhost:3000`
   - Login with admin credentials

2. **Navigate to Daily Rewards**
   - Go to: Rewards → Daily Rewards
   - You should see the Daily Rewards configuration page

3. **Test Global Toggle**
   ```
   Action: Toggle "Active" = OFF (global setting)
   Save: Click Save button
   Verify: Check database or API response
   ```

4. **Test Day-Specific Toggle**
   ```
   Action: Select Day 3
   Action: Toggle "Active" = OFF for Day 3
   Save: Click Save button
   Verify: Check database or API response
   ```

5. **Verify Changes Persist**
   ```bash
   # Run verification script
   node test-adm-dr-011-active-flags.js
   ```

#### Test ADM-DR-006 (XP Multipliers Configuration)

1. **Navigate to XP Tiers**
   - Go to: Settings → XP Tiers (or similar)

2. **Check Tier Configuration**
   ```
   Verify: Each tier has "Access Benefits" field
   Example: "1.5x", "2.0x", "2.5x"
   ```

3. **If Missing, Add Access Benefits**
   ```
   Edit each tier
   Add field: accessBenefits = "1.5x" (or appropriate value)
   Save changes
   ```

4. **Verify Configuration**
   ```bash
   node verify-adm-dr-006-multipliers.js
   ```

---

### STEP 3: Mobile App Testing (Critical)

**Start Backend + Mobile App** (Terminals 1 & 3)

#### Test ADM-DR-001 (Mid-Week Join)

**Scenario 1: New User Joins Mid-Week**

1. **Create Test User**
   ```bash
   # Option A: Use API directly
   curl -X POST http://localhost:5000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{
       "email": "test-wednesday@example.com",
       "password": "Test123!",
       "name": "Wednesday User"
     }'
   
   # Option B: Register through mobile app UI
   ```

2. **Login to Mobile App**
   - URL: `http://localhost:3001`
   - Login with test user credentials

3. **Navigate to Daily Rewards**
   - Find "Daily Rewards" section in app
   - Click to open Daily Rewards screen

4. **Verify Display** ✅
   ```
   Expected Behavior:
   ✅ Should see "Day 1" (NOT "Wednesday")
   ✅ Should NOT see Monday/Tuesday (hidden)
   ✅ "Day 1" should be CLAIMABLE immediately
   ✅ Future days show as "Day 2", "Day 3", etc.
   
   Wrong Behavior (if bug still exists):
   ❌ Shows "Monday", "Tuesday", "Wednesday"
   ❌ Monday/Tuesday marked as "missed"
   ❌ Can't claim until actual Monday
   ```

5. **Claim Day 1**
   ```
   Action: Click "Claim" button on Day 1
   Expected: Success message, rewards credited
   Verify: Check wallet balance increased
   ```

6. **Check Next Day**
   ```
   Wait until next day (or change system date for testing)
   Expected: "Day 2" becomes claimable
   ```

7. **Check Second Week**
   ```
   After 7 days, check next week
   Expected: Shows "Monday", "Tuesday", "Wednesday" (calendar days)
   ```

**Scenario 2: Existing User (Joined Before)**

1. **Login with Existing User**
   - User who joined weeks ago

2. **Check Daily Rewards**
   ```
   Expected: Shows calendar days (Monday-Sunday)
   NOT user-relative days
   ```

#### Test ADM-DR-006 (XP Multipliers)

**Prerequisites**: 
- XP Tiers configured with `accessBenefits` field
- User in week 2+ (weekly multiplier applies)

1. **Check User XP Tier**
   ```
   Navigate to: Profile or Settings
   Note: Current XP and Tier level
   ```

2. **Claim Daily Reward**
   ```
   Navigate to: Daily Rewards
   Action: Claim today's reward
   ```

3. **Verify XP Calculation** ✅
   ```
   Expected:
   ✅ Base XP × Weekly Multiplier × Tier Multiplier
   ✅ Transaction history shows correct XP
   ✅ User XP increases by calculated amount
   
   Example:
   Base XP: 100
   Weekly Multiplier: 1.2x (week 2)
   Tier Multiplier: 1.5x (from accessBenefits)
   Final XP: 100 × 1.2 × 1.5 = 180 XP
   ```

4. **Check Transaction History**
   ```
   Navigate to: Wallet or Transaction History
   Verify: Shows correct XP amount
   ```

5. **If Wrong** ❌
   ```
   Check:
   - Is user in week 1? (weekly multiplier doesn't apply)
   - Does XPTier have accessBenefits field?
   - Does user XP fall within tier range?
   ```

#### Test ADM-DR-011 (Active/Inactive Flags)

**Prerequisites**: Admin has deactivated rewards

1. **Admin: Deactivate Global**
   ```
   Admin Panel → Daily Rewards
   Toggle: Active = OFF (global)
   Save changes
   ```

2. **Mobile App: Check Display** ✅
   ```
   Navigate to: Daily Rewards
   
   Expected:
   ✅ Shows message: "Daily Rewards are currently disabled"
   ✅ All days appear disabled/locked
   ✅ Claim buttons are disabled
   ✅ Proper message displayed to user
   
   Wrong (if frontend not fixed):
   ❌ Rewards still appear claimable
   ❌ No indication of disabled state
   ```

3. **Mobile App: Try to Claim** ✅
   ```
   Action: Click "Claim" button (if visible)
   
   Expected:
   ✅ Shows error message (not crash)
   ✅ Message: "Daily Rewards are currently disabled"
   ✅ App remains responsive
   
   Wrong (current issue):
   ❌ App freezes/gets stuck
   ❌ App crashes/exits
   ❌ Infinite loading state
   ```

4. **Admin: Deactivate Specific Day**
   ```
   Admin Panel → Daily Rewards
   Toggle: Active = OFF for Day 3 only
   Global: Active = ON
   Save changes
   ```

5. **Mobile App: Check Day 3** ✅
   ```
   Navigate to: Daily Rewards
   
   Expected:
   ✅ Day 3 appears disabled/locked
   ✅ Shows message: "This reward is no longer available"
   ✅ Other days remain claimable
   ✅ Claim button disabled for Day 3
   
   Wrong:
   ❌ Day 3 still appears claimable
   ❌ No visual indication of disabled state
   ```

6. **Mobile App: Try to Claim Day 3** ✅
   ```
   Action: Try to claim Day 3
   
   Expected:
   ✅ Shows error message
   ✅ Message: "This reward is not active"
   ✅ App remains responsive
   
   Wrong:
   ❌ App crashes or freezes
   ```

---

## 🔧 Frontend Fixes Required

Based on testing, if issues persist, frontend needs these fixes:

### ADM-DR-001 Frontend Fix

**File**: `JacksonRewardsApp/src/components/DailyRewards.jsx` (or similar)

```javascript
// Check displayMode from API response
const { displayMode, isFirstWeek, days } = apiResponse.data;

// Filter out hidden days
const visibleDays = days.filter(day => !day.hidden);

// Show correct labels
visibleDays.map((day, index) => {
  const label = displayMode === 'USER_RELATIVE' 
    ? `Day ${index + 1}`  // First week: Day 1, 2, 3...
    : getDayName(day.dayNumber);  // Later weeks: Mon, Tue, Wed...
  
  return <DayCard label={label} day={day} />;
});
```

### ADM-DR-006 Frontend Fix

**File**: `JacksonRewardsApp/src/components/DailyRewards.jsx`

```javascript
// Add error handling for claim
const claimReward = async (dayNumber) => {
  try {
    setLoading(true);
    const response = await api.post('/api/daily-rewards-v2/claim');
    
    // Success
    showSuccess(`Claimed ${response.data.xp} XP!`);
    updateWallet(response.data.newBalance, response.data.newXP);
    
  } catch (error) {
    // Handle errors gracefully (don't crash)
    if (error.response?.status === 503) {
      showError('Daily Rewards are currently disabled');
    } else if (error.response?.status === 400) {
      showError(error.response.data.error || 'Cannot claim this reward');
    } else {
      showError('Failed to claim reward. Please try again.');
    }
  } finally {
    setLoading(false);
  }
};
```

### ADM-DR-011 Frontend Fix

**File**: `JacksonRewardsApp/src/components/DailyRewards.jsx`

```javascript
// Check active flag before allowing claim
const DayCard = ({ day }) => {
  const isClaimable = day.status === 'claimable' && day.active !== false;
  const isDisabled = day.active === false || day.disabled === true;
  
  return (
    <div className={isDisabled ? 'opacity-50' : ''}>
      <h3>{day.label}</h3>
      
      {isDisabled && (
        <p className="text-red-500">
          This reward is no longer available
        </p>
      )}
      
      <button 
        onClick={() => claimReward(day.dayNumber)}
        disabled={!isClaimable || isDisabled}
        className={isClaimable ? 'btn-primary' : 'btn-disabled'}
      >
        {isClaimable ? 'Claim Now' : 'Locked'}
      </button>
    </div>
  );
};
```

---

## 📊 Testing Checklist

### Backend Tests
- [ ] `verify-adm-dr-001-duplicate-fix.js` passes
- [ ] `test-adm-dr-001-fix.js` shows correct logic
- [ ] `test-adm-dr-006-multipliers.js` shows configuration
- [ ] `test-adm-dr-011-active-flags.js` shows flag handling

### Admin Panel Tests
- [ ] Can login to admin panel
- [ ] Can navigate to Daily Rewards config
- [ ] Can toggle global Active flag
- [ ] Can toggle day-specific Active flag
- [ ] Changes persist to database
- [ ] Can configure XP Tiers with accessBenefits

### Mobile App Tests - ADM-DR-001
- [ ] New user joins mid-week (e.g., Wednesday)
- [ ] Shows "Day 1" (not "Wednesday")
- [ ] Monday/Tuesday are hidden (not shown)
- [ ] Can claim "Day 1" immediately
- [ ] Next day shows "Day 2"
- [ ] Second week shows calendar days

### Mobile App Tests - ADM-DR-006
- [ ] XP Tiers configured with accessBenefits
- [ ] User in week 2+ (weekly multiplier applies)
- [ ] Claim reward shows correct XP calculation
- [ ] Transaction history shows correct amount
- [ ] User XP increases correctly

### Mobile App Tests - ADM-DR-011
- [ ] Global deactivation shows disabled message
- [ ] Day-specific deactivation shows disabled state
- [ ] Claim attempts show error (not crash)
- [ ] App remains responsive (no freeze)
- [ ] Error messages are user-friendly

---

## 🐛 Troubleshooting

### Backend Not Starting
```bash
# Check if port is in use
lsof -i :5000

# Kill existing process
pkill -f 'node.*server.js'

# Start again
npm run dev
```

### Admin Panel Not Starting
```bash
cd admin-frontend
rm -rf .next node_modules
npm install
npm run dev
```

### Mobile App Not Starting
```bash
cd JacksonRewardsApp
rm -rf .next node_modules
npm install
npm run dev
```

### Database Connection Issues
```bash
# Check MongoDB is running
# Check .env file has correct MONGODB_URI
cat .env | grep MONGODB_URI
```

### API Errors
```bash
# Check backend logs
tail -f combined.log

# Check error logs
tail -f error.log
```

---

## 📞 Need Help?

If tests fail:
1. Check backend logs for errors
2. Verify database configuration
3. Run verification scripts
4. Check frontend console for errors
5. Review API responses in Network tab

**Backend is ready to deploy. Frontend needs implementation of the fixes above.**
