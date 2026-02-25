# Build APK Guide - V3 Daily Rewards System

**Date**: February 25, 2026  
**Status**: Ready to build APK for client testing

---

## ✅ Pre-Build Checklist

All V3 system components are ready:

- [x] Backend V3 endpoints implemented (`/api/v3/daily-rewards/*`)
- [x] User-based week calculation logic (`utils/dailyRewardUserWeekHelper.js`)
- [x] Frontend updated to call V3 API (`JacksonRewardsApp/lib/api.js`)
- [x] Display logic simplified (no complex calculations)
- [x] User's `createdAt` field fixed (Feb 24, 2026)
- [x] Old progress documents cleared

---

## 🚀 Quick Build (Debug APK)

For quick testing, build a debug APK:

```bash
cd JacksonRewardsApp

# 1. Install dependencies (if needed)
npm install

# 2. Build Next.js app
npm run build

# 3. Sync with Capacitor
npx cap sync android

# 4. Build debug APK
cd android
./gradlew assembleDebug

# APK location:
# android/app/build/outputs/apk/debug/app-debug.apk
```

**Time**: ~5-10 minutes

---

## 📦 Production Build (Release APK)

For client delivery, build a signed release APK:

### Step 1: Build Next.js App

```bash
cd JacksonRewardsApp

# Install dependencies
npm install

# Build production bundle
npm run build

# Verify build output
ls -la out/
```

### Step 2: Sync with Capacitor

```bash
# Sync web assets to Android
npx cap sync android

# Verify sync
ls -la android/app/src/main/assets/public/
```

### Step 3: Open in Android Studio

```bash
# Open Android project
npx cap open android
```

This will launch Android Studio with your project.

### Step 4: Build Signed APK in Android Studio

1. **Build > Generate Signed Bundle / APK**
2. Select **APK**
3. Click **Next**
4. **Create new keystore** (if first time):
   - Key store path: `~/jackson-keystore.jks`
   - Password: [Choose secure password]
   - Alias: `jackson-key`
   - Validity: 25 years
   - First/Last Name: Your name
   - Organization: Your company
5. Select **release** variant
6. Click **Finish**

**APK location**: `android/app/release/app-release.apk`

---

## 🔧 Alternative: Command Line Build

If you prefer command line:

```bash
cd JacksonRewardsApp

# Build Next.js
npm run build

# Sync Capacitor
npx cap sync android

# Build release APK (requires keystore)
cd android
./gradlew assembleRelease

# APK location:
# android/app/build/outputs/apk/release/app-release.apk
```

**Note**: You need a keystore file for release builds. Create one:

```bash
keytool -genkey -v -keystore ~/jackson-keystore.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias jackson-key
```

Then configure in `android/app/build.gradle`:

```gradle
android {
    signingConfigs {
        release {
            storeFile file("~/jackson-keystore.jks")
            storePassword "YOUR_PASSWORD"
            keyAlias "jackson-key"
            keyPassword "YOUR_PASSWORD"
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
```

---

## 📱 Install APK on Device

### Method 1: USB Cable

```bash
# Enable USB debugging on device
# Connect device via USB

# Install APK
adb install android/app/build/outputs/apk/debug/app-debug.apk

# Or for release:
adb install android/app/build/outputs/apk/release/app-release.apk
```

### Method 2: File Transfer

1. Copy APK to device (USB, email, cloud storage)
2. Open APK file on device
3. Allow "Install from unknown sources" if prompted
4. Install

### Method 3: Android Studio

1. Connect device via USB
2. In Android Studio: **Run > Run 'app'**
3. Select your device
4. App installs and launches automatically

---

## 🧪 Testing V3 System on Device

### Test Scenario 1: Check Join Date

**Expected**: User's week should start from their join date (Feb 24, Tuesday)

1. Open app
2. Login with test user
3. Go to Daily Rewards screen
4. **Verify**:
   - Week starts on Tuesday (not Monday)
   - Day 1 = Tuesday (Feb 24)
   - Day 2 = Wednesday (Feb 25) - TODAY
   - Days show as 1, 2, 3, 4, 5, 6, 7 (not calendar days)

### Test Scenario 2: Claim Reward

**Expected**: User can claim today's reward (Day 2)

1. On Daily Rewards screen
2. Day 2 should show "CLAIM NOW" button
3. Click "CLAIM NOW"
4. **Verify**:
   - Success message appears
   - Day 2 changes to "CLAIMED"
   - Wallet balance increases
   - Day 3 becomes "CLAIMABLE" (tomorrow)

### Test Scenario 3: Check Past Days

**Expected**: Day 1 (yesterday) should show as "MISSED"

1. On Daily Rewards screen
2. Day 1 should show "UNCLAIMED" or "MISSED"
3. Button should be disabled
4. **Verify**:
   - Cannot claim past days
   - Status is clear

### Test Scenario 4: Check Future Days

**Expected**: Days 3-7 should be locked

1. On Daily Rewards screen
2. Days 3-7 should show "LOCKED"
3. Buttons should be disabled
4. **Verify**:
   - Cannot claim future days
   - Timer shows countdown to next day

### Test Scenario 5: Week Transition

**Expected**: Week resets on Tuesday (user's join day)

1. Wait until next Tuesday (Mar 3)
2. Open Daily Rewards
3. **Verify**:
   - Week number changes to "Week 2"
   - Days reset to 1-7
   - Day 1 is claimable
   - Week runs Tue-Mon (not Mon-Sun)

---

## 🐛 Troubleshooting

### Issue: APK shows wrong day numbers

**Check**:
1. Is backend running and accessible?
2. Is app calling V3 endpoint (`/api/v3/daily-rewards`)?
3. Check network requests in Chrome DevTools (USB debugging)

**Debug**:
```bash
# Enable USB debugging on device
# Connect via USB

# View app logs
adb logcat | grep "DailyRewards"

# View network requests
# Chrome: chrome://inspect
# Select your device
# Open DevTools > Network tab
```

### Issue: "Cannot connect to server"

**Check**:
1. Is backend server running?
2. Is device on same network (for local testing)?
3. Check `BASE_URL` in `JacksonRewardsApp/lib/api.js`

**Fix**:
```javascript
// For production
const BASE_URL = "https://your-production-server.com";

// For local testing (use your computer's IP)
const BASE_URL = "http://192.168.1.100:5000";
```

### Issue: Claim button doesn't work

**Check**:
1. Is day status "claimable"?
2. Check backend logs for errors
3. Check API response in DevTools

**Debug**:
```bash
# Backend logs
tail -f combined.log | grep "daily-rewards"

# Test API directly
curl -X POST "http://YOUR_SERVER/api/v3/daily-rewards/claim" \
  -H "Authorization: Bearer TOKEN"
```

### Issue: App crashes on Daily Rewards screen

**Check**:
1. API response structure
2. Console logs for errors
3. Null/undefined checks in code

**Debug**:
```bash
# View crash logs
adb logcat | grep "FATAL"

# View React errors
adb logcat | grep "ReactNativeJS"
```

---

## 📊 Backend Configuration

Ensure backend is configured correctly:

### 1. Check V3 Routes

```bash
# In backend directory
grep -r "daily-rewards-v3" routes/
```

Should show:
```
routes/daily-rewards-v3.js
```

### 2. Verify Server.js

```bash
grep "daily-rewards-v3" server.js
```

Should show:
```javascript
app.use('/api/v3/daily-rewards', require('./routes/daily-rewards-v3'));
```

### 3. Test V3 Endpoint

```bash
# Get auth token
TOKEN="your_token_here"

# Test week endpoint
curl -X GET "http://localhost:5000/api/v3/daily-rewards/week" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.data | {weekKey, weekStart, todayDayNumber}'
```

Expected response:
```json
{
  "weekKey": "USER-W1",
  "weekStart": "2026-02-24T00:00:00.000Z",
  "todayDayNumber": 2
}
```

---

## 📝 Delivery Checklist

Before giving APK to client:

- [ ] Backend V3 endpoint tested and working
- [ ] User's `createdAt` field set correctly
- [ ] Old progress documents cleared
- [ ] Frontend updated to V3 API
- [ ] APK built successfully (debug or release)
- [ ] Tested on physical device
- [ ] Daily rewards show correct day numbers (1-7)
- [ ] Claim functionality works
- [ ] No crashes or errors
- [ ] Week resets on user's join day (Tuesday)
- [ ] Backend server is accessible from device
- [ ] API endpoints are whitelisted in Capacitor config

---

## 🎯 Quick Test Commands

```bash
# 1. Build APK
cd JacksonRewardsApp
npm run build
npx cap sync android
cd android
./gradlew assembleDebug

# 2. Install on device
adb install app/build/outputs/apk/debug/app-debug.apk

# 3. View logs
adb logcat | grep -E "DailyRewards|ReactNativeJS"

# 4. Test backend
curl -X GET "http://YOUR_SERVER/api/v3/daily-rewards/week" \
  -H "Authorization: Bearer TOKEN"
```

---

## 📞 Support

If issues persist:

1. **Check backend logs**: `tail -f combined.log`
2. **Check app logs**: `adb logcat`
3. **Test API directly**: Use curl or Postman
4. **Verify network**: Ensure device can reach backend
5. **Check Capacitor config**: Verify server URL is whitelisted

---

## ✅ Summary

**V3 System Ready:**
- ✅ User-based weeks (starts from join date)
- ✅ Always shows Day 1-7 (no calendar days)
- ✅ No hidden days
- ✅ Simpler logic
- ✅ Better UX

**Build Steps:**
1. `npm run build` - Build Next.js app
2. `npx cap sync android` - Sync to Android
3. `./gradlew assembleDebug` - Build APK
4. Install and test on device

**The APK is ready to be built and delivered to the client!** 🚀
