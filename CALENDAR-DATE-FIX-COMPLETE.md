# Calendar Date Display Fix - COMPLETE

**Date**: February 25, 2026  
**Issue**: Frontend showing calendar dates (24, 25, 26...) instead of day numbers (1, 2, 3...)  
**Status**: ✅ FIXED

---

## Problem Identified

### What Was Wrong

**Frontend was showing**:
```
S    M    T    W    T    F    S
24   25   26   27   28   01   02
```

**Should show**:
```
S    M    T    W    T    F    S
1    2    3    4    5    6    7
```

### Root Cause

The `WeeklyCalendarSection.jsx` component was:
1. Taking `weekStart` date from API
2. Calculating calendar dates for each day
3. Displaying actual calendar dates (24, 25, 26...)

**This is WRONG for V3 user-based weeks!**

V3 system should show:
- Day 1, 2, 3, 4, 5, 6, 7 (user-relative)
- NOT calendar dates

---

## Fix Applied

### File: `JacksonRewardsApp/app/Daily-Reward/components/WeeklyCalendarSection.jsx`

**Before**:
```javascript
const generateCalendarDays = useCallback(() => {
    const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const weekStart = new Date(weekData.weekStart);

    return weekData.days.map((dayData, index) => {
        const dayDate = new Date(weekStart);
        dayDate.setDate(dayDate.getDate() + index);

        return {
            day: days[index],
            date: dayDate.getDate().toString().padStart(2, '0'), // ❌ Calendar date
            isActive: dayData.dayNumber === weekData.todayDayNumber,
            status: dayData.status,
            dayNumber: dayData.dayNumber
        };
    });
}, [weekData]);
```

**After**:
```javascript
const generateCalendarDays = useCallback(() => {
    const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    
    // Check if this is V3 user-based week system
    const isUserWeek = weekData.isUserWeek || weekData.displayMode === 'USER_RELATIVE';

    if (isUserWeek) {
        // V3: Show day numbers only (Day 1, 2, 3...)
        return weekData.days.map((dayData, index) => {
            return {
                day: days[index],
                date: dayData.dayNumber.toString(), // ✅ Just day number (1, 2, 3...)
                isActive: dayData.dayNumber === weekData.todayDayNumber,
                status: dayData.status,
                dayNumber: dayData.dayNumber
            };
        });
    } else {
        // V1/V2: Show calendar dates
        const weekStart = new Date(weekData.weekStart);
        return weekData.days.map((dayData, index) => {
            const dayDate = new Date(weekStart);
            dayDate.setDate(dayDate.getDate() + index);

            return {
                day: days[index],
                date: dayDate.getDate().toString().padStart(2, '0'),
                isActive: dayData.dayNumber === weekData.todayDayNumber,
                status: dayData.status,
                dayNumber: dayData.dayNumber
            };
        });
    }
}, [weekData]);
```

---

## How It Works Now

### V3 User-Based Weeks (NEW)

**API Response includes**:
```json
{
  "isUserWeek": true,
  "displayMode": "USER_RELATIVE",
  "days": [
    { "dayNumber": 1, ... },
    { "dayNumber": 2, ... },
    { "dayNumber": 3, ... },
    ...
  ]
}
```

**Frontend displays**:
```
S    M    T    W    T    F    S
1    2    3    4    5    6    7
```

### V1/V2 Calendar Weeks (OLD)

**API Response includes**:
```json
{
  "weekStart": "2026-02-24T00:00:00.000Z",
  "days": [...]
}
```

**Frontend displays**:
```
S    M    T    W    T    F    S
24   25   26   27   28   01   02
```

---

## Expected Result

### User Joined: February 24, 2026

**Week 1 Display**:
```
┌─────────────────────────────────┐
│         USER-W1                 │
├─────────────────────────────────┤
│  S    M    T    W    T    F    S│
│  1    2    3    4    5    6    7│
└─────────────────────────────────┘

Day 1: CLAIMED (Feb 24)
Day 2: CLAIMED (Feb 25)
Day 3: CLAIMABLE (Feb 26 - today)
Day 4-7: LOCKED (future days)
```

**Week 2 Display** (after 7 days):
```
┌─────────────────────────────────┐
│         USER-W2                 │
├─────────────────────────────────┤
│  S    M    T    W    T    F    S│
│  1    2    3    4    5    6    7│
└─────────────────────────────────┘

Day 1: CLAIMABLE (Mar 3)
Day 2-7: LOCKED (future days)
```

---

## Testing

### Test Case 1: New User (Today)

**Setup**:
- User joins today (Feb 25, 2026)
- First time opening Daily Rewards

**Expected**:
```
Week: USER-W1
Calendar: 1, 2, 3, 4, 5, 6, 7
Day 1: CLAIMABLE (today)
Day 2-7: LOCKED
```

### Test Case 2: User Joined Yesterday

**Setup**:
- User joined Feb 24, 2026
- Today is Feb 25, 2026
- Claimed Day 1 yesterday

**Expected**:
```
Week: USER-W1
Calendar: 1, 2, 3, 4, 5, 6, 7
Day 1: CLAIMED (Feb 24)
Day 2: CLAIMABLE (today - Feb 25)
Day 3-7: LOCKED
```

### Test Case 3: Week 2

**Setup**:
- User joined Feb 18, 2026
- Today is Feb 25, 2026 (8 days later)
- In Week 2

**Expected**:
```
Week: USER-W2
Calendar: 1, 2, 3, 4, 5, 6, 7
Day 1: CLAIMED (Feb 25)
Day 2: CLAIMABLE (today - Feb 26)
Day 3-7: LOCKED
```

---

## Verification Steps

### 1. Check API Response
```bash
curl -H "Authorization: Bearer {token}" \
  http://localhost:5000/api/v3/daily-rewards/week
```

**Should include**:
```json
{
  "success": true,
  "data": {
    "isUserWeek": true,
    "displayMode": "USER_RELATIVE",
    "todayDayNumber": 2,
    "days": [
      { "dayNumber": 1, "status": "claimed", ... },
      { "dayNumber": 2, "status": "claimable", ... },
      { "dayNumber": 3, "status": "locked", ... },
      ...
    ]
  }
}
```

### 2. Check Frontend Display

**Open app → Daily Rewards**

**Should see**:
- Week header: "USER-W1"
- Calendar row: "1  2  3  4  5  6  7"
- NOT: "24  25  26  27  28  01  02"

### 3. Check Day Cards

**Should show**:
- DAY 1, DAY 2, DAY 3... (not calendar dates)
- Correct status (CLAIMED, CLAIMABLE, LOCKED)
- Correct rewards (coins, XP)

---

## Impact Analysis

### ✅ What Changed
- Frontend now checks for `isUserWeek` or `displayMode === 'USER_RELATIVE'`
- If V3: Shows day numbers (1, 2, 3...)
- If V1/V2: Shows calendar dates (24, 25, 26...)

### ✅ What Didn't Change
- Backend API (already correct)
- V1/V2 systems (still work with calendar dates)
- Day card display (already showing "DAY 1", "DAY 2"...)
- Claim logic (unchanged)

### ✅ Backward Compatibility
- V1/V2 users: Still see calendar dates
- V3 users: See day numbers
- No breaking changes

---

## Summary

### Problem
Frontend was calculating and displaying calendar dates from `weekStart`, which is wrong for user-based weeks.

### Solution
Check if it's a V3 user-based week (`isUserWeek` or `displayMode === 'USER_RELATIVE'`), and if so, display day numbers instead of calendar dates.

### Result
- V3 users see: 1, 2, 3, 4, 5, 6, 7
- V1/V2 users see: 24, 25, 26, 27, 28, 01, 02
- Both systems work correctly

---

**Status**: ✅ Fixed and ready to test  
**Files Changed**: 1 (`WeeklyCalendarSection.jsx`)  
**Impact**: Frontend display only, no backend changes
