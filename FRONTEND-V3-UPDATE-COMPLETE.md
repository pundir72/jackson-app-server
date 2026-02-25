# Frontend V3 Update - Complete

**Date**: February 25, 2026  
**Status**: ✅ **FRONTEND UPDATED TO V3**

---

## 🎯 Changes Made

### 1. API Endpoint Updated (`JacksonRewardsApp/lib/api.js`)

**Changed from V1/V2 to V3**:

```javascript
// OLD (V1/V2)
const endpoint = `/api/daily-rewards/week`;
const endpoint = `/api/daily-rewards/claim`;

// NEW (V3)
const endpoint = `/api/v3/daily-rewards/week`;
const endpoint = `/api/v3/daily-rewards/claim`;
```

**Functions updated**:
- `getDailyRewardsWeek()` - Now calls V3 endpoint
- `claimDailyReward()` - Now calls V3 endpoint (no dayNumber needed)
- `recoverMissedDailyReward()` - Now calls V3 endpoint

**Whitelist updated**:
- Added `/api/v3/daily-rewards` to allowed endpoints

---

### 2. Display Logic Simplified (`DailyRewardsSection.jsx`)

**Removed complex calculation**:

```javascript
// OLD (V2) - Complex logic
let displayDayNumber = dayData.dayNumber;
if (weekData?.displayMode === 'USER_RELATIVE' && weekData?.isFirstWeek && weekData?.userJoinDayIndex !== undefined) {
    displayDayNumber = dayData.dayNumber - weekData.userJoinDayIndex;
}

// NEW (V3) - Simple!
const displayDayNumber = dayData.dayNumber; // Always 1-7
```

**Removed hidden days filter**:

```javascript
// OLD (V2) - Had to filter hidden days
return weekData.days
    .filter(day => !day.hidden)
    .map(transformRewardData)
    .filter(Boolean);

// NEW (V3) - No hidden days!
return weekData.days
    .map(transformRewardData)
    .filter(Boolean);
```

---

## ✅ Benefits of V3

### For Users:
- ✅ Join day is always "Day 1"
- ✅ No confusing "missed" days before joining
- ✅ Clear 7-day progression
- ✅ Week resets on their join day (predictable)

### For Developers:
- ✅ Simpler code (no complex calculations)
- ✅ No hidden days to handle
- ✅ No display mode switching
- ✅ Easier to maintain

### For Business:
- ✅ Better user experience
- ✅ Higher engagement
- ✅ Clearer metrics
- ✅ Easier to explain

---

## 🧪 Testing

### 1. Build APK

```bash
cd JacksonRewardsApp

# Install dependencies (if needed)
npm install

# Build for Android
npm run build
npx cap sync android

# Open in Android Studio
npx cap open android
```

### 2. Test in App

**Scenario 1: New User**
1. Register new account
2. Go to Daily Rewards
3. Should see "DAY 1" (claimable)
4. Should see "DAY 2-7" (locked)
5. No days before join shown

**Scenario 2: Existing User**
1. Login with existing account
2. Go to Daily Rewards
3. Should see correct day number based on join date
4. Past days show as "MISSED"
5. Today shows as "CLAIMABLE"
6. Future days show as "LOCKED"

**Scenario 3: Claim Reward**
1. Click "CLAIM NOW" on today's reward
2. Should succeed
3. Day status changes to "CLAIMED"
4. Next day becomes "CLAIMABLE"
5. Wallet balance increases

---

## 📊 API Response Structure (V3)

```json
{
  "success": true,
  "data": {
    "weekKey": "USER-W1",
    "weekStart": "2026-02-24T00:00:00.000Z",
    "weekEnd": "2026-03-02T23:59:59.999Z",
    "todayDayNumber": 2,
    "days": [
      {
        "dayNumber": 1,
        "status": "missed",
        "rewardCoins": 50,
        "rewardXp": 25
      },
      {
        "dayNumber": 2,
        "status": "claimable",
        "rewardCoins": 60,
        "rewardXp": 30
      },
      {
        "dayNumber": 3,
        "status": "locked",
        "rewardCoins": 70,
        "rewardXp": 35
      },
      ... (7 days total)
    ],
    "weekNumber": 1,
    "userWeek": {
      "isUserWeek": true,
      "weekNumber": 1,
      "joinDayName": "Tuesday",
      "displayMode": "USER_RELATIVE"
    }
  }
}
```

**Key differences from V2**:
- ✅ `dayNumber` is always 1-7 (no calendar days)
- ✅ No `hidden` field (all days shown)
- ✅ No `userJoinDayIndex` calculation needed
- ✅ `weekKey` is "USER-W1" (not calendar week)
- ✅ `userWeek` object has join day info

---

## 🔧 Build Commands

### Development Build
```bash
cd JacksonRewardsApp
npm run dev
```

### Production Build (APK)
```bash
cd JacksonRewardsApp

# Build Next.js app
npm run build

# Sync with Capacitor
npx cap sync android

# Open in Android Studio
npx cap open android

# In Android Studio:
# Build > Generate Signed Bundle / APK
# Select APK
# Choose release variant
# Sign with your keystore
```

### Quick Test Build
```bash
cd JacksonRewardsApp
npm run build
npx cap sync android
cd android
./gradlew assembleDebug

# APK location:
# android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 📱 APK Delivery Checklist

Before giving APK to client:

- [ ] Backend V3 endpoint tested and working
- [ ] User's `createdAt` field set correctly
- [ ] Old progress documents cleared
- [ ] Frontend updated to V3 API
- [ ] APK built successfully
- [ ] Tested on physical device
- [ ] Daily rewards show correct day numbers
- [ ] Claim functionality works
- [ ] No crashes or errors
- [ ] Week resets on user's join day

---

## 🐛 Troubleshooting

### APK shows wrong day numbers
- Check: Is backend running V3 endpoint?
- Check: Is app calling `/api/v3/daily-rewards`?
- Check: Network tab in Chrome DevTools (USB debugging)

### Claim button doesn't work
- Check: Is day status "claimable"?
- Check: Backend logs for errors
- Check: Network response in DevTools

### App crashes on Daily Rewards screen
- Check: API response structure
- Check: Console logs for errors
- Check: Null/undefined checks in code

---

## 📞 Support

If issues persist:

1. **Check backend logs**:
   ```bash
   tail -f combined.log | grep "daily-rewards"
   ```

2. **Check app logs** (USB debugging):
   ```bash
   adb logcat | grep "DailyRewards"
   ```

3. **Test API directly**:
   ```bash
   curl -X GET "http://YOUR_SERVER/api/v3/daily-rewards/week" \
     -H "Authorization: Bearer TOKEN"
   ```

---

## ✅ Summary

**Frontend changes complete:**
- ✅ API calls updated to V3
- ✅ Display logic simplified
- ✅ Hidden days filter removed
- ✅ Ready to build APK

**Next steps:**
1. Build APK
2. Test on device
3. Deliver to client

**The frontend is now using the V3 user-based week system!** 🚀
