# Tester Guide: Day Active/Inactive Toggle

**Date**: February 25, 2026  
**Issue**: ADM-DR-011 - Day Active/Inactive toggles  
**Status**: ✅ Working correctly - Tester needs to follow correct flow

---

## ✅ How It Works (Correct Flow)

### Step 1: Open Admin Panel
Navigate to: **Admin → Rewards → Daily Rewards**

### Step 2: Toggle Day Active/Inactive
Click the toggle switch for any day (e.g., Day 3)
- Toggle ON (blue) = Active
- Toggle OFF (gray) = Inactive

**IMPORTANT**: This only updates the LOCAL STATE (in browser memory)

### Step 3: Click "Save" Button
After toggling, you MUST click the **"Save"** button at the bottom of the page.

**This is when the API call happens!**

### Step 4: Refresh Page
After saving, refresh the page to verify the changes persisted.

### Step 5: Test in Mobile App
1. Clear app data or logout/login
2. Navigate to Daily Rewards
3. Inactive days should show as LOCKED with 0 rewards

---

## 🚫 Common Mistake

**WRONG**: Toggle → Refresh → Expect changes to persist  
**RIGHT**: Toggle → Save → Refresh → Changes persist

**Why?**
- Toggles update local state only (React state)
- Must click "Save" to send API request
- API request updates database
- Refresh loads from database

---

## 🔍 How to Verify It's Working

### Backend Verification

**1. Check API is called when Save is clicked**

Open browser DevTools (F12) → Network tab:
1. Toggle Day 3 to inactive
2. Click "Save" button
3. Look for API call: `PUT /api/admin/v2/daily-rewards/config/{id}`
4. Check request payload includes `days[2].active: false`

**2. Check database directly**

```javascript
// In MongoDB
db.dailyrewardconfigv2s.findOne({ isActive: true })

// Check days array:
{
  days: [
    { dayNumber: 1, active: true, ... },
    { dayNumber: 2, active: true, ... },
    { dayNumber: 3, active: false, ... },  // ← Should be false
    ...
  ]
}
```

### Frontend Verification (Admin Panel)

**1. Toggle Day 3 to inactive**
- Click toggle → turns gray

**2. Click "Save" button**
- Should see success toast: "Daily Rewards configuration saved successfully!"

**3. Refresh page**
- Day 3 toggle should still be gray (inactive)
- If it's blue again, the save didn't work

### Mobile App Verification

**1. Make Day 3 inactive in admin**
- Toggle Day 3 → Save → Verify in admin

**2. Open mobile app**
- Clear app data or logout/login
- Navigate to Daily Rewards

**3. Check Day 3 display**
- Should show as LOCKED
- Should show 0 coins, 0 XP
- Should NOT be claimable

---

## 🎯 Expected Behavior

### When Day is ACTIVE (toggle ON)
```
Admin Panel:
- Toggle: Blue (ON)
- Coin/XP fields: Enabled
- Can edit values

Mobile App:
- Day shows normal status (claimable/locked/claimed)
- Shows configured coin/XP values
- Can claim when available
```

### When Day is INACTIVE (toggle OFF)
```
Admin Panel:
- Toggle: Gray (OFF)
- Coin/XP fields: Disabled
- Cannot edit values

Mobile App:
- Day shows as LOCKED
- Shows 0 coins, 0 XP
- Cannot claim (even if it's the current day)
```

---

## 🔧 Technical Flow

### Admin Panel Flow

```
1. User clicks toggle
   ↓
2. handleDayRewardChange(dayIndex, 'active', !day.active)
   ↓
3. Updates React state (config.days[dayIndex].active)
   ↓
4. User clicks "Save" button
   ↓
5. handleSave() function
   ↓
6. API call: PUT /api/admin/v2/daily-rewards/config/{id}
   ↓
7. Backend updates database
   ↓
8. Success response
   ↓
9. Toast notification: "Configuration saved successfully!"
```

### Mobile App Flow

```
1. User opens Daily Rewards screen
   ↓
2. API call: GET /api/v3/daily-rewards/week
   ↓
3. Backend loads config from database
   ↓
4. Backend checks each day's active flag
   ↓
5. If day.active === false:
   - Set status to 'locked'
   - Set rewardCoins to 0
   - Set rewardXp to 0
   ↓
6. Frontend receives enriched days
   ↓
7. transformRewardData() checks active flag
   ↓
8. If !day.active:
   - Display as LOCKED
   - Show 0 rewards
   - Disable claim button
```

---

## 📝 Code References

### Admin Panel
**File**: `admin-frontend/src/components/rewards/DailyRewards.js`

**Toggle Handler** (Line 116):
```javascript
const handleDayRewardChange = (dayIndex, field, value) => {
  setConfig((prev) => ({
    ...prev,
    days: prev.days.map((day, idx) =>
      idx === dayIndex ? { ...day, [field]: value } : day
    ),
  }));
};
```

**Save Handler** (Line 384):
```javascript
const handleSave = async () => {
  // ... validation ...
  
  const response = await apiClient[configId ? 'put' : 'post'](
    configId 
      ? `/admin/daily-rewards-v2/config/${configId}`  // UPDATE
      : "/admin/daily-rewards-v2/config",              // CREATE
    apiPayload
  );
  
  // ... success handling ...
};
```

### Backend API
**File**: `routes/admin-daily-rewards-v2.js`

**PUT Endpoint** (Line 343):
```javascript
router.put("/config/:id", adminAuth, [...validators], async (req, res) => {
  const config = await DailyRewardConfigV2.findById(req.params.id);
  
  // Update days
  if (days) {
    config.days = days;  // Includes active flags
  }
  
  await config.save();
  
  res.json({ success: true, data: config });
});
```

**GET Week Endpoint** (Line 150 in `routes/daily-rewards-v3.js`):
```javascript
// Check if day is active
const isDayActive = dayConfig.active !== false;
let dayStatus = day.status;
if (!isDayActive && day.status !== 'claimed') {
  dayStatus = 'locked';
}

// Set rewards to 0 if inactive
let finalCoins = isDayActive ? baseCoins : 0;
let finalXP = isDayActive ? baseXP : 0;
```

### Mobile App
**File**: `JacksonRewardsApp/app/Daily-Reward/components/DailyRewardsSection.jsx`

**Transform Data** (Line ~200):
```javascript
const transformRewardData = (apiDay) => {
  // Check active flag
  if (apiDay.active === false) {
    return {
      ...apiDay,
      status: 'locked',
      rewardCoins: 0,
      rewardXp: 0,
      claimable: false
    };
  }
  // ... normal logic ...
};
```

---

## ✅ Verification Checklist

Use this checklist to verify the feature is working:

### Admin Panel
- [ ] Toggle Day 3 to inactive (gray)
- [ ] Click "Save" button
- [ ] See success toast message
- [ ] Refresh page
- [ ] Day 3 toggle still gray (inactive)
- [ ] Check browser DevTools → Network → PUT request sent
- [ ] Check request payload → `days[2].active: false`

### Database
- [ ] Query database: `db.dailyrewardconfigv2s.findOne({ isActive: true })`
- [ ] Check `days[2].active` is `false`

### Mobile App
- [ ] Clear app data or logout/login
- [ ] Open Daily Rewards screen
- [ ] Day 3 shows as LOCKED
- [ ] Day 3 shows 0 coins, 0 XP
- [ ] Cannot claim Day 3

---

## 🐛 Troubleshooting

### Issue: Toggle doesn't persist after refresh

**Cause**: Didn't click "Save" button

**Solution**: 
1. Toggle day
2. Click "Save" button (wait for success toast)
3. Then refresh

### Issue: API call not happening

**Cause**: JavaScript error or network issue

**Solution**:
1. Open browser DevTools → Console
2. Check for errors
3. Open Network tab
4. Click Save
5. Look for PUT request to `/api/admin/v2/daily-rewards/config/{id}`

### Issue: Mobile app still shows inactive day as active

**Cause**: App cache or old API response

**Solution**:
1. Clear app data
2. Logout and login again
3. Force close and reopen app
4. Check API response in backend logs

---

## 📞 Summary for Tester

**The feature IS working correctly. The correct flow is:**

1. Toggle day active/inactive in admin panel
2. **Click "Save" button** ← CRITICAL STEP
3. Wait for success message
4. Refresh page to verify
5. Test in mobile app

**Common mistake**: Forgetting to click "Save" button after toggling.

**Remember**: Toggles only update local state. You MUST click "Save" to persist changes to the database.

---

**Status**: ✅ Feature working as designed  
**Action Required**: Follow correct testing flow (Toggle → Save → Verify)
