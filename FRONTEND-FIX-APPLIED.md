# Frontend Fix Applied - ADM-DR-001 Mid-Week Join Display

**Date**: February 25, 2026  
**Issue**: App showing "DAY 3" instead of "DAY 1" for users who joined mid-week  
**Status**: ✅ **FIXED**

---

## 🔴 The Problem You Showed

In the screenshot, the app was showing:
- **DAY 3** (CLAIMED)
- **DAY 4** (claimable)
- **DAY 5, 6, 7** (locked)

But it should show:
- **DAY 1** (CLAIMED) ← User's join day
- **DAY 2** (claimable)
- **DAY 3, 4, 5** (locked)

---

## 🔧 What Was Wrong

The frontend was using `dayNumber` directly from the API, which is the **calendar day number** (1-7 for Monday-Sunday).

But for the first week, we need to show **user-relative day numbers** (Day 1, 2, 3... starting from join date).

---

## ✅ The Fix Applied

### File Modified
`JacksonRewardsApp/app/Daily-Reward/components/DailyRewardsSection.jsx`

### Changes Made

**1. Calculate Display Day Number** (lines ~300-310)
```javascript
// ADM-DR-001 FIX: Calculate display day number based on displayMode
// For first week (USER_RELATIVE mode), show Day 1, 2, 3... starting from join date
// For subsequent weeks (CALENDAR mode), show calendar day numbers 1-7 (Mon-Sun)
let displayDayNumber = dayData.dayNumber;
if (weekData?.displayMode === 'USER_RELATIVE' && weekData?.isFirstWeek && weekData?.userJoinDayIndex !== undefined) {
    // User-relative day: calculate offset from join day
    // If user joined on day index 2 (Wednesday), then:
    // - dayNumber 3 (Wednesday) becomes Day 1
    // - dayNumber 4 (Thursday) becomes Day 2, etc.
    displayDayNumber = dayData.dayNumber - weekData.userJoinDayIndex;
}

return {
    day: displayDayNumber, // Use calculated display day number
    calendarDay: dayData.dayNumber, // Keep original for API calls
    // ... rest of the data
};
```

**2. Filter Hidden Days** (lines ~353-358)
```javascript
// ADM-DR-001 FIX: Filter out hidden days (days before user joined in first week)
return weekData.days
    .filter(day => !day.hidden) // Remove days before user joined
    .map(transformRewardData)
    .filter(Boolean);
```

**3. Use Calendar Day for API Calls** (line ~564)
```javascript
// Use calendarDay (not display day) when calling API
onClick={() => handleClaimClick(reward.calendarDay || reward.day)}
```

---

## 🎯 How It Works Now

### First Week (User Joins Wednesday)

**Backend sends**:
```json
{
  "displayMode": "USER_RELATIVE",
  "isFirstWeek": true,
  "userJoinDayIndex": 2,
  "days": [
    { "dayNumber": 1, "hidden": true },   // Monday - hidden
    { "dayNumber": 2, "hidden": true },   // Tuesday - hidden
    { "dayNumber": 3, "status": "claimed" }, // Wednesday - user joined
    { "dayNumber": 4, "status": "claimable" }, // Thursday
    { "dayNumber": 5, "status": "locked" },  // Friday
    { "dayNumber": 6, "status": "locked" },  // Saturday
    { "dayNumber": 7, "status": "locked" }   // Sunday
  ]
}
```

**Frontend displays**:
- Filters out hidden days (Monday, Tuesday)
- Calculates display numbers:
  - dayNumber 3 - userJoinDayIndex 2 = **Day 1** ✅
  - dayNumber 4 - userJoinDayIndex 2 = **Day 2** ✅
  - dayNumber 5 - userJoinDayIndex 2 = **Day 3** ✅
  - etc.

**User sees**:
- DAY 1 (CLAIMED) ← Wednesday
- DAY 2 (claimable) ← Thursday
- DAY 3, 4, 5 (locked)

### Second Week (Same User)

**Backend sends**:
```json
{
  "displayMode": "CALENDAR",
  "isFirstWeek": false,
  "days": [
    { "dayNumber": 1, "status": "claimable" }, // Monday
    { "dayNumber": 2, "status": "locked" },    // Tuesday
    // ... etc
  ]
}
```

**Frontend displays**:
- No filtering (no hidden days)
- No calculation (displayMode is CALENDAR)
- Shows calendar day numbers directly

**User sees**:
- DAY 1 (Monday)
- DAY 2 (Tuesday)
- DAY 3 (Wednesday)
- etc.

---

## 🧪 How to Test

### 1. Restart the Mobile App
```bash
cd JacksonRewardsApp
npm run dev
```

### 2. Test with Existing User (from screenshot)
- Login with the same user from the screenshot
- Go to Daily Rewards
- **Expected**: Should now show "DAY 1" instead of "DAY 3"

### 3. Test with New User (Mid-Week Join)
```bash
# Create new user on Wednesday
# Login to app
# Go to Daily Rewards
```

**Expected**:
- ✅ Shows "DAY 1" (not "Wednesday")
- ✅ Monday/Tuesday are NOT shown (hidden)
- ✅ Can claim "DAY 1" immediately
- ✅ Next day shows "DAY 2"

### 4. Test Second Week
```bash
# Wait 7 days or change system date
# Check Daily Rewards
```

**Expected**:
- ✅ Shows "DAY 1, 2, 3..." (Monday, Tuesday, Wednesday...)
- ✅ Calendar-based days (not user-relative)

---

## 📊 API Fields Used

The frontend now correctly uses these fields from the API:

| Field | Purpose |
|-------|---------|
| `displayMode` | "USER_RELATIVE" or "CALENDAR" |
| `isFirstWeek` | true if user's first week |
| `userJoinDayIndex` | Calendar day index user joined (0-6) |
| `hidden` | true for days before user joined |
| `dayNumber` | Calendar day number (1-7) |

---

## ✅ Summary

**Before**: App showed calendar day numbers (DAY 3, 4, 5...)  
**After**: App shows user-relative day numbers (DAY 1, 2, 3...)

**Before**: Monday/Tuesday shown as "missed"  
**After**: Monday/Tuesday hidden from UI

**Before**: User confused about which day is "Day 1"  
**After**: Join day is clearly "Day 1"

---

## 🚀 Next Steps

1. ✅ Backend fix applied (duplicate function removed)
2. ✅ Frontend fix applied (display calculation added)
3. ⏳ Test with real users
4. ⏳ Verify second week shows calendar days
5. ⏳ Deploy to production

---

**The fix is complete. Please test and confirm it's working as expected!**
