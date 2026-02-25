# Test V3 API Now

**All fixes applied:**
1. ✅ User's `createdAt` set to Feb 24, 2026 (Tuesday)
2. ✅ Old progress documents deleted
3. ✅ Next API call will create fresh progress

---

## 🧪 Test Command

```bash
curl -X GET "http://localhost:5000/api/v3/daily-rewards/week" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  | jq '.data | {weekKey, weekStart, weekEnd, todayDayNumber, joinDayName: .userWeek.joinDayName}'
```

---

## ✅ Expected Response

```json
{
  "weekKey": "USER-W1",
  "weekStart": "2026-02-24T00:00:00.000Z",
  "weekEnd": "2026-03-02T23:59:59.999Z",
  "todayDayNumber": 2,
  "joinDayName": "Tuesday"
}
```

**Key Points:**
- `weekStart`: Should be **Feb 24** (Tuesday), not Feb 25
- `weekEnd`: Should be **Mar 2** (Monday), 6 days after Feb 24
- `joinDayName`: Should be **"Tuesday"**, not "Wednesday"
- `todayDayNumber`: Should be **2** (today is Feb 25, which is Day 2 of user's week)

---

## 📊 User's Week Structure

**User joined**: Tuesday, Feb 24, 2026

**Week 1**: Tue Feb 24 - Mon Mar 2
- Day 1 = Tuesday (Feb 24) - join day
- Day 2 = Wednesday (Feb 25) - **TODAY**
- Day 3 = Thursday (Feb 26)
- Day 4 = Friday (Feb 27)
- Day 5 = Saturday (Feb 28)
- Day 6 = Sunday (Mar 1)
- Day 7 = Monday (Mar 2)

**Week 2**: Tue Mar 3 - Mon Mar 9
- Day 1 = Tuesday (Mar 3)
- ... (repeats)

---

## 🎯 What Should Happen

1. **First API call**: Creates new progress document with correct dates
2. **Day 1 (Feb 24)**: Should show as "missed" (yesterday)
3. **Day 2 (Feb 25)**: Should show as "claimable" (today)
4. **Days 3-7**: Should show as "locked" (future)

---

## 🐛 If Still Wrong

If it still shows Feb 25 (Wednesday):

1. **Check backend logs** for the join date:
   ```
   User joined: 2026-02-24T00:00:00.000Z  ← Should be Feb 24
   ```

2. **Restart backend** to clear any in-memory cache:
   ```bash
   pkill -f 'node.*server.js'
   npm run dev
   ```

3. **Check database directly**:
   ```bash
   node check-user-join-date.js
   ```

---

**Test now and let me know the result!** 🚀
