# Postman Collection Testing Guide - Bug Fixes

This guide explains how to test all the fixed bugs using the Postman collection.

## Setup

1. **Import the Collection**
   - Open Postman
   - Click "Import" → Select `postman_collection.json`
   - The collection will be imported with all endpoints organized by bug fix

2. **Set Environment Variables**
   - Update `base_url` in collection variables (default: `http://localhost:5000/api`)
   - Login endpoints will automatically set `auth_token` and `admin_token`

## Testing Flow

### 1. Authentication (Required First)

**Flow:**
1. **User Login** → Sets `auth_token` automatically
2. **Admin Login** → Sets `admin_token` automatically

**Expected Results:**
- Both endpoints return 200 with token
- Tokens are automatically saved to collection variables

---

### 2. Daily Rewards - Bug Fix

**Bug Fixed:** New users can access previous weeks and see inconsistent statuses

**Testing Flow:**
1. **Get Current Week (New User)**
   - Should return current week data
   - Days before user creation should be marked as 'missed'
   - Should not show any previous weeks

2. **Get Previous Week (Should Redirect)**
   - Use date before user creation (e.g., `2024-01-01`)
   - Should return 200 with current week data
   - Should include message: "You can only access data from your account creation date onward"

3. **Get Future Week (Should Fail)**
   - Use future date (e.g., `2025-12-31`)
   - Should return 400 with error: "Cannot access future weeks"

4. **Claim Daily Reward**
   - Should work normally for current week

**Expected Results:**
- ✅ New users cannot access weeks before their creation
- ✅ Days before user creation are marked as 'missed'
- ✅ Future weeks are blocked

---

### 3. Admin - Game/Offer Screen Selection

**Bug Fixed:** Admin cannot update `uiSection` (screen) for games and offers

**Testing Flow:**
1. **Create Game with Screen**
   - Create a game with `uiSection: "Most Played"`
   - Should return 201 with game data

2. **Update Game Screen (Bug Fix)**
   - Update existing game with new `uiSection: "Highest Earning"`
   - Should return 200 with updated game
   - ✅ Should now allow updating `uiSection` and `ageGroup`

3. **Create Offer with Screen**
   - Create an offer with `uiSection: "Banner"`
   - Should return 201 with offer data

4. **Update Offer Screen (Bug Fix)**
   - Update existing offer with new `uiSection: "Carousel"`
   - Should return 200 with updated offer
   - ✅ Should now allow updating `uiSection` and `ageGroup`

5. **Get Available UI Sections**
   - Should return list of available screen/section options
   - Can be used to populate dropdown in admin panel

**Expected Results:**
- ✅ Admin can update `uiSection` for existing games
- ✅ Admin can update `uiSection` for existing offers
- ✅ Admin can get list of available sections

---

### 4. Payment Retry - Bug Fix

**Bug Fixed:** Users cannot retry failed or stuck payments

**Testing Flow:**
1. **Create VIP Subscription**
   - Create a subscription (e.g., Gold tier, monthly plan)
   - Save `subscriptionId` from response

2. **Initiate Payment**
   - Initiate payment for the subscription
   - Payment intent is created
   - If payment fails, subscription status becomes 'failed'

3. **Get Payment Status**
   - Check payment status using `paymentIntentId`
   - Should return `canRetry: true` if payment failed
   - Should return `stripeStatus` from Stripe

4. **Retry Failed Payment (Bug Fix)**
   - Use `/payment/retry` endpoint
   - Should return 200 with new payment intent
   - ✅ Should allow retrying failed payments

5. **Initiate Payment with Retry Flag**
   - Use `/payment/initiate` with `retry: true`
   - Should create new payment intent for failed subscriptions
   - ✅ Should reset subscription to 'pending' status

**Expected Results:**
- ✅ Users can retry failed payments
- ✅ Users can retry stuck payments
- ✅ Payment status shows `canRetry` flag
- ✅ New payment intent is created on retry

---

### 5. Downloaded Games - Bug Fix

**Bug Fixed:** Users cannot get downloaded games list and single game by ID

**Testing Flow:**
1. **Install Game**
   - Install a game using `/game/install`
   - Game should be saved with `installedAt` and `status: 'installed'`

2. **Get User's Downloaded Games List**
   - Should return formatted list with pagination
   - Should include game metadata (title, icon, category, etc.)
   - ✅ Should return proper response format

3. **Get Downloaded Games History**
   - Should return downloaded games with pagination
   - Should be sorted by `installedAt` date

4. **Get Single Game by MongoDB _id**
   - Use MongoDB ObjectId (e.g., `507f1f77bcf86cd799439011`)
   - Should return game data with `isDownloaded` flag
   - ✅ Should support MongoDB `_id` lookup

5. **Get Single Game by gameId**
   - Use gameId string (e.g., `game123`)
   - Should return game data with `isDownloaded` flag
   - ✅ Should support `gameId` string lookup

6. **Get Single Downloaded Game by gameId**
   - Use `/game/downloaded/:gameId` endpoint
   - Should return game from user's downloaded games
   - Should include full metadata and user-specific data
   - ✅ Should only return games that are in user's downloads

**Expected Results:**
- ✅ Users can get downloaded games list with pagination
- ✅ Users can get single game by MongoDB `_id`
- ✅ Users can get single game by `gameId` string
- ✅ Users can get single downloaded game by `gameId`

---

### 6. Account Overview - Bug Fix

**Bug Fixed:** Downloaded games count is not showing in account overview

**Testing Flow:**
1. **Install Some Games**
   - Install multiple games using `/game/install`
   - Games should be saved with `installedAt` and `status: 'installed'`

2. **Get Account Overview**
   - Should return account overview data
   - Should include `stats` object with:
     - `downloadedGames`: Count of downloaded games
     - `totalGames`: Total games in user's games array
     - `completedGames`: Count of completed games
   - ✅ Should show downloaded games count

3. **Verify Downloaded Games Count**
   - Run the test script (automated test)
   - Should verify that `stats.downloadedGames` exists
   - Should verify that count matches installed games

**Expected Results:**
- ✅ Account overview includes `downloadedGames` count
- ✅ Count matches number of games with `installedAt` or `status: 'installed'`
- ✅ Stats object includes `totalGames` and `completedGames`

---

### 7. Spin Wheel - Bug Fix

**Bug Fixed:** Users are not getting admin-created spin wheel configuration and rewards

**Testing Flow:**
1. **Admin: Create Spin Wheel Config**
   - Admin creates spin wheel configuration
   - Sets `maxSpinsPerDay`, `cooldownMinutes`, `spinMode`, etc.
   - Sets `eligibleTiers` and `vipMultipliers`

2. **Admin: Create Spin Wheel Rewards**
   - Admin creates multiple rewards with different probabilities
   - Sets `eligibleTiers` for each reward
   - Sets `isActive: true`

3. **Get Spin Wheel Config (Bug Fix)**
   - User calls `/spin/config`
   - Should return admin-created configuration
   - Should return admin-created rewards (filtered by user's tier)
   - ✅ Should use admin config instead of hardcoded values

4. **Get Spin Status**
   - Should use admin-created `maxSpinsPerDay`
   - Should use admin-created `cooldownMinutes`
   - Should check tier eligibility
   - ✅ Should use admin configuration

5. **Perform Spin**
   - Should use admin-created rewards
   - Should select reward based on probability
   - Should apply VIP multipliers from admin config
   - Should create `SpinWheelLog` entry
   - ✅ Should use admin rewards instead of hardcoded values

6. **Redeem Spin Reward**
   - Should credit the reward to user's wallet
   - Should update XP

7. **Get Spin History**
   - Should return spin history from `SpinWheelLog`

**Expected Results:**
- ✅ Users get admin-created spin wheel configuration
- ✅ Users get admin-created spin wheel rewards
- ✅ Spin uses admin-configured settings (max spins, cooldown, etc.)
- ✅ Rewards are selected based on admin-configured probability
- ✅ VIP multipliers are applied from admin configuration

---

## Complete Testing Flow

### Recommended Order:

1. **Authentication** (Required)
   - User Login
   - Admin Login

2. **Admin Setup** (Required for some tests)
   - Create Spin Wheel Config
   - Create Spin Wheel Rewards
   - Create Game with Screen
   - Create Offer with Screen

3. **User Tests**
   - Daily Rewards (test date restrictions)
   - Install Games (for downloaded games tests)
   - Get Downloaded Games List
   - Get Single Game by ID
   - Get Account Overview (verify downloaded games count)
   - Get Spin Wheel Config (verify admin config)
   - Get Spin Status (verify admin config)
   - Perform Spin (verify admin rewards)

4. **Payment Tests**
   - Create VIP Subscription
   - Initiate Payment
   - Get Payment Status (check canRetry)
   - Retry Failed Payment (if payment failed)

5. **Admin Update Tests**
   - Update Game Screen
   - Update Offer Screen
   - Get Available UI Sections

---

## Notes

- **Authentication**: Most endpoints require authentication. Tokens are automatically saved after login.
- **Admin Endpoints**: Require admin authentication. Use `admin_token` variable.
- **Date Formats**: Use ISO 8601 format (e.g., `2024-01-01` or `2024-01-01T00:00:00Z`)
- **Variables**: Collection variables are automatically updated by test scripts
- **Error Handling**: Check response status codes and error messages for proper error handling

---

## Troubleshooting

### Common Issues:

1. **401 Unauthorized**
   - Make sure you've logged in first
   - Check that `auth_token` or `admin_token` is set

2. **404 Not Found**
   - Check that IDs are correct (subscription_id, game_id, etc.)
   - Verify the endpoint URL is correct

3. **400 Bad Request**
   - Check request body format
   - Verify required fields are included
   - Check date formats

4. **500 Internal Server Error**
   - Check server logs
   - Verify database connection
   - Check that required models exist

---

## Success Criteria

All bug fixes should pass these tests:

✅ **Daily Rewards**: New users cannot access previous weeks  
✅ **Admin Screen Selection**: Admin can update `uiSection` for games and offers  
✅ **Payment Retry**: Users can retry failed/stuck payments  
✅ **Downloaded Games**: Users can get downloaded games list and single game by ID  
✅ **Account Overview**: Downloaded games count is displayed  
✅ **Spin Wheel**: Users get admin-created spin wheel configuration and rewards  

