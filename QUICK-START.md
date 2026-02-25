# Quick Start Guide - Test Daily Rewards Fixes

**Goal**: Run backend + frontends to test ADM-DR-001, ADM-DR-006, ADM-DR-011 fixes

---

## 🚀 Option 1: Automated Start (Linux/Mac)

```bash
# Make script executable (first time only)
chmod +x start-all-services.sh

# Run the script
./start-all-services.sh
```

This will open 3 terminal windows with:
- Backend (port 5000)
- Admin Panel (port 3000)
- Mobile App (port 3001)

---

## 🚀 Option 2: Manual Start (All Platforms)

### Terminal 1: Backend
```bash
# Install dependencies (first time only)
npm install

# Start backend
npm run dev

# Backend will run on http://localhost:5000
# (or check your .env file for PORT variable)
```

### Terminal 2: Admin Panel
```bash
# Open new terminal, navigate to admin frontend
cd admin-frontend

# Install dependencies (first time only)
npm install

# Start admin panel
npm run dev

# Admin panel will run on http://localhost:3000
```

### Terminal 3: Mobile App
```bash
# Open new terminal, navigate to mobile app
cd JacksonRewardsApp

# Install dependencies (first time only)
npm install

# Start mobile app
npm run dev

# Mobile app will run on http://localhost:3001
```

---

## ✅ Verify Services Are Running

Open your browser and check:

1. **Backend**: http://localhost:5000/health (or /api/health)
2. **Admin Panel**: http://localhost:3000
3. **Mobile App**: http://localhost:3001

---

## 🧪 Quick Backend Tests (No Frontend Needed)

Before testing with UI, verify backend fixes:

```bash
# Test 1: Verify duplicate function removed
node verify-adm-dr-001-duplicate-fix.js
# Expected: ✅ PASS

# Test 2: Test mid-week join logic
node test-adm-dr-001-fix.js
# Expected: Shows correct user-relative days

# Test 3: Check XP multiplier config
node test-adm-dr-006-multipliers.js
# Expected: Shows XPTier configuration

# Test 4: Check active/inactive flags
node test-adm-dr-011-active-flags.js
# Expected: Shows flag handling
```

---

## 📱 Test with Mobile App

### Test ADM-DR-001 (Mid-Week Join)

1. **Create new user** (register in app or use API)
2. **Login to mobile app**: http://localhost:3001
3. **Go to Daily Rewards**
4. **Check display**:
   - ✅ Should see "Day 1" (not "Wednesday")
   - ✅ Should NOT see Monday/Tuesday
   - ✅ Can claim "Day 1" immediately

### Test ADM-DR-006 (XP Multipliers)

1. **Ensure XP Tiers configured** (use admin panel)
2. **Login to mobile app**
3. **Claim daily reward**
4. **Check XP calculation**:
   - ✅ Should apply both multipliers
   - ✅ Transaction history shows correct XP

### Test ADM-DR-011 (Active Flags)

1. **Admin panel**: Deactivate Daily Rewards
2. **Mobile app**: Check Daily Rewards screen
3. **Verify**:
   - ✅ Shows "disabled" message
   - ✅ Claim button disabled
   - ✅ App doesn't crash when trying to claim

---

## 🔧 If Frontend Needs Fixes

If tests fail, frontend needs implementation. See:
- **COMPLETE-TESTING-GUIDE.md** - Detailed testing steps
- **ADM-DR-ALL-ISSUES-ROOT-CAUSE-ANALYSIS.md** - Technical details
- **CRITICAL-FIX-APPLIED.md** - Summary of fixes

Frontend code examples are in COMPLETE-TESTING-GUIDE.md under "Frontend Fixes Required"

---

## 🛑 Stop Services

Press `Ctrl+C` in each terminal window to stop the services.

---

## 📞 Troubleshooting

### Port Already in Use
```bash
# Find process using port
lsof -i :5000  # or :3000, :3001

# Kill process
kill -9 <PID>
```

### Dependencies Not Installing
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Backend Not Connecting to Database
```bash
# Check MongoDB is running
# Check .env file has MONGODB_URI
cat .env | grep MONGODB_URI
```

---

## 📖 Full Documentation

- **COMPLETE-TESTING-GUIDE.md** - Comprehensive testing guide
- **ADM-DR-ALL-ISSUES-ROOT-CAUSE-ANALYSIS.md** - Root cause analysis
- **CRITICAL-FIX-APPLIED.md** - Fix summary

---

**Backend is ready. Frontend may need updates based on test results.**
