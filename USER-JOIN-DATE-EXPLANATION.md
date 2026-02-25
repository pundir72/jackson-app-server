# User Join Date - Where It Comes From

**Question**: Where does the system get the user's joining date?

---

## 📍 Source of Join Date

### 1. Database Field: `User.createdAt`

The join date comes from the **User model** in MongoDB:

```javascript
// In routes/daily-rewards-v3.js (line 77)
const user = await User.findById(req.user.userId).select('createdAt');
const userCreatedAt = user.createdAt || new Date();
```

### 2. When Is It Set?

The `createdAt` field is automatically set by Mongoose when a user registers:

```javascript
// User model schema (models/User.js)
const userSchema = new mongoose.Schema({
  email: String,
  password: String,
  // ... other fields
}, { 
  timestamps: true  // ← This adds createdAt and updatedAt automatically
});
```

### 3. Example Values

From your logs:
```
User joined: 2026-02-25T15:40:10.811Z
```

This means:
- **Date**: February 25, 2026
- **Time**: 15:40:10 (3:40 PM UTC)
- **Timestamp**: Full ISO 8601 format

---

## 🔧 How It's Used in V3

### Step 1: Fetch User's Join Date
```javascript
const user = await User.findById(userId).select('createdAt');
const userCreatedAt = user.createdAt; // 2026-02-25T15:40:10.811Z
```

### Step 2: Normalize to Start of Day
```javascript
const joinDate = new Date(userCreatedAt);
joinDate.setUTCHours(0, 0, 0, 0); // 2026-02-25T00:00:00.000Z
```

**Why normalize?**
- User joined at 3:40 PM
- But their "Day 1" should be the entire day (midnight to midnight)
- So we treat the join date as the start of that day

### Step 3: Calculate Week Bounds
```javascript
// Week 1 starts on the join date (normalized)
weekStart = 2026-02-25T00:00:00.000Z  // Start of join day
weekEnd   = 2026-03-03T23:59:59.999Z  // 6 days later

// Week 2 starts 7 days after Week 1
weekStart = 2026-03-04T00:00:00.000Z
weekEnd   = 2026-03-10T23:59:59.999Z
```

---

## 🐛 The Bug That Was Fixed

### Problem
```javascript
// OLD CODE (WRONG)
if (dateUtc < userCreatedAt) {
  // Comparing: 2026-02-25T00:00:00.000Z < 2026-02-25T15:40:10.811Z
  // Result: TRUE (midnight is before 3:40 PM)
  // Error: "Requested date is before user joined" ❌
}
```

### Solution
```javascript
// NEW CODE (CORRECT)
const requestDate = new Date(dateUtc);
requestDate.setUTCHours(0, 0, 0, 0); // 2026-02-25T00:00:00.000Z

const joinDate = new Date(userCreatedAt);
joinDate.setUTCHours(0, 0, 0, 0); // 2026-02-25T00:00:00.000Z

if (requestDate < joinDate) {
  // Comparing: 2026-02-25 < 2026-02-25
  // Result: FALSE (same day)
  // Success: Proceeds to load progress ✅
}
```

---

## 📊 Timeline Example

**User Registration**:
```
Date: 2026-02-25
Time: 15:40:10 (3:40 PM)
Timestamp: 2026-02-25T15:40:10.811Z
```

**System Interpretation**:
```
Join Date (normalized): 2026-02-25T00:00:00.000Z
Week 1 Start: 2026-02-25T00:00:00.000Z
Week 1 End: 2026-03-03T23:59:59.999Z
```

**User's Daily Rewards**:
```
Day 1: Feb 25 (join day) - CLAIMABLE
Day 2: Feb 26 - LOCKED
Day 3: Feb 27 - LOCKED
Day 4: Feb 28 - LOCKED
Day 5: Mar 1 - LOCKED
Day 6: Mar 2 - LOCKED
Day 7: Mar 3 - LOCKED
```

---

## 🔍 How to Check User's Join Date

### Option 1: MongoDB Query
```javascript
db.users.findOne(
  { _id: ObjectId("6999e14f61f52e395e1531a4") },
  { createdAt: 1 }
)
```

### Option 2: API Call
```bash
# Get user profile (includes createdAt)
curl -X GET "http://localhost:5000/api/users/profile" \
  -H "Authorization: Bearer $TOKEN"
```

### Option 3: Backend Logs
```
🔍 User-Based Daily Reward Progress for user 6999e14f61f52e395e1531a4:
   User joined: 2026-02-25T15:40:10.811Z
```

---

## ✅ Summary

**Where join date comes from**:
1. `User.createdAt` field in MongoDB
2. Set automatically when user registers
3. Stored as ISO 8601 timestamp

**How it's used**:
1. Fetched from database
2. Normalized to start of day (midnight)
3. Used to calculate user's week bounds
4. Week 1 = join day + 6 days
5. Week 2 = 7 days after Week 1, etc.

**The fix**:
- Now compares dates (not timestamps)
- User can access their join day regardless of registration time
- No more "before user joined" error!

---

**Test again and it should work now!** 🚀
