# Jackson Rewards App - Complete Codebase Understanding

## Architecture Overview

### Technology Stack
- **Backend**: Node.js + Express.js + MongoDB (Mongoose)
- **Frontend Mobile**: React Native (Next.js) in JacksonRewardsApp/
- **Frontend Admin**: Next.js in admin-frontend/
- **Caching**: Redis
- **Monitoring**: OpenTelemetry, Sentry, Prometheus, Grafana
- **Authentication**: JWT, Firebase Auth, Biometric
- **Payment**: Stripe, Google Play IAP, Tremendous (gift cards)

---

## Core Database Models

### User & Profile
- **User**: Complete user profile with wallet (coins, XP, cash), VIP status, games, surveys, biometric, location, daily activity
- **Transaction**: All financial transactions with approval workflow
- **VIPSubscription/VIPTier**: VIP membership system

### Games & Rewards
- **Game**: Game offers with rewards, XP tiers, display rules
- **Rewards**: Reward configuration
- **DailyRewardProgress**: User's weekly reward tracking
- **DailyRewardConfigV2**: Admin config for daily rewards
- **SpinWheelConfig/SpinWheelReward/SpinWheelLog**: Spin wheel system
- **XPTier/XPTierV2**: XP tier definitions with multipliers
- **XPMultiplier/XPDecaySetting**: XP rules

### Engagement
- **DailyChallenge**: Daily challenges
- **Achievement/UserAchievement**: Achievement system
- **Leaderboard**: Rankings
- **Walkathon**: Step-based challenges
- **Race**: Racing competitions

### Third-Party Integrations
- **AdjustAttribution/AdjustCallback**: Adjust tracking
- **BesitosConversion/BesitosUserActivity**: Besitos game offers
- **EverflowConversion**: Everflow tracking
- **SurveyOffer/InternalSurvey**: Survey management
- **NonGameOffer**: Non-gaming offers

### Admin & Support
- **PayoutRequest/PayoutMethod**: Withdrawal management
- **Ticket**: Support tickets
- **Creative**: Ad creatives
- **GameTip**: Game tips
- **Integration**: Third-party API configs

---

## API Routes Structure

### User Routes
- `/api/auth` - Authentication (login, signup, OTP, password reset)
- `/api/profile` - User profile management
- `/api/onboarding` - Onboarding flow
- `/api/wallet` - Wallet & transactions
- `/api/account-overview` - Account overview

### Game Routes
- `/api/game` - Game listing, installation, completion
- `/api/my-games` - User's installed games (synced from Besitos)
- `/api/game-offers` - Game offer management
- `/api/game-tips` - Game tips

### Reward Routes
- `/api/daily-rewards` - Daily reward system
- `/api/daily-rewards-v2` - V2 with weekly multipliers
- `/api/spin` - Spin wheel mechanics
- `/api/xp-tier` - XP tier progression
- `/api/achievements` - Achievement tracking

### Engagement Routes
- `/api/daily-challenge` - Daily challenges
- `/api/leaderboard` - Rankings
- `/api/streak` - Streak tracking
- `/api/daily-activity` - Activity tracking
- `/api/referral` - Referral system
- `/api/race` - Racing
- `/api/walkathon` - Walkathon challenges

### Monetization Routes
- `/api/vip` - VIP membership
- `/api/vip/membership` - VIP subscriptions
- `/api/ad-free` - Ad-free purchases
- `/api/payouts` - Payout requests
- `/api/withdrawal` - Withdrawals
- `/api/payment` - Payment processing

### Content Routes
- `/api/surveys` - Survey offers
- `/api/internal-surveys` - Internal surveys
- `/api/non-game-offers` - Shopping, receipts
- `/api/cash-coach` - Financial planning
- `/api/receipts` - Receipt scanning

### Integration Routes
- `/api/besitos` - Besitos game offers
- `/api/bitlabs` - Bitlabs offers
- `/api/everflow` - Everflow conversions
- `/api/adjust` - Adjust event tracking
- `/api/v2/adjust` - Adjust V2 S2S
- `/api/affise` - Affise tracking
- `/api/integrity` - Google Play Integrity
- `/api/google-play-iap` - Google Play IAP
- `/api/zoho` - Zoho CRM

### Admin Routes (all under `/api/admin/`)
- `rewards`, `xp-tier-v2`, `xp-decay-v2`
- `game-offers`, `display-rules`, `surveys`
- `daily-challenges`, `daily-rewards`, `daily-rewards-v2`
- `creatives`, `transactions`, `spin-wheel`
- `payouts`, `tickets`, `vip`, `game-tips`
- `walkathon`, `internal-surveys`, `adjust-events`
- `cash-coach`

---

## Key Business Flows

### 1. User Registration & Onboarding
```
Mobile Number → OTP (8078 in dev) → Verify OTP → 
Create Account → JWT Token → Onboarding Steps:
  Gender → Age → Game Preferences → Game Style → 
  Improvement Area → Daily Goal → Biometric (optional)
→ Adjust Registration Event
```

### 2. Game Completion Flow
```
Fetch Games (Besitos sync) → User Installs Game → 
User Plays → User Completes (with integrity token) → 
Backend Calculates XP (with tier multiplier) → 
Coins from Besitos API → Transaction Created → 
Adjust Event Tracked → Achievements Checked
```

### 3. Daily Rewards Flow
```
User Opens Daily Rewards → Load Progress:
  - First Week: User-relative days (Day 1, 2, 3...)
  - Subsequent Weeks: Calendar days (Mon, Tue, Wed...)
→ Apply Weekly Multiplier (if week > 1) → 
Apply AccessBenefits Multiplier (XP only) → 
User Claims Reward → Coins + XP Credited → 
Transaction Created → Day 7 Big Reward (if all days done)
```

### 4. Spin Wheel Flow
```
Get Config (eligible rewards for tier) → 
Check Campaign Window (UTC) → Check Status (remaining spins) → 
User Spins → Probability-based Selection (BUG-065 fixed) → 
Apply VIP Multiplier (coins only) → 
Free Spin: Auto-credit | Ad Spin: Pending → 
User Redeems → Transaction + Log Created
```

### 5. VIP Membership Flow
```
View VIP Tiers → Select Tier → Purchase (Stripe/Google Play) → 
VIPSubscription Created → Benefits Applied:
  - XP Multiplier
  - Unlimited Spins
  - Exclusive Rewards
→ Adjust Revenue Event
```

### 6. Withdrawal Flow
```
User Requests Withdrawal → Approval Workflow → 
Face Verification (high-value) → Admin Approval → 
Payout via Tremendous API (gift cards) → 
Transaction Completed → Wallet Updated
```

### 7. Survey Completion Flow
```
Fetch Surveys (Besitos API) → User Completes Survey → 
Besitos Webhook → BesitosConversion Record → 
Coins/XP Credited → Transaction Created
```

### 8. Adjust Attribution Flow
```
User Action (register, game complete, purchase) → 
Backend Sends Event to Adjust S2S API → 
Attribution Data in Adjust Dashboard → 
Admin Views Analytics
```

---

## Middleware Stack

1. **auth.js** - JWT verification, account status check
2. **adminAuth.js** - Admin role verification
3. **integrityVerification.js** - Google Play Integrity (for sensitive ops)
4. **globalActivityTracker.js** - Track all user activity
5. **achievementTracker.js** - Auto-track achievements
6. **cloudflareTurnstile.js** - CAPTCHA verification
7. **firebaseAuth.js** - Firebase authentication
8. **firebaseAppCheck.js** - Firebase App Check

---

## Third-Party Services

### Besitos (Game Offers & Surveys)
- **Endpoints**: `/data/partner/offers/{partnerId}`, `/data/{partnerId}/{userId}`
- **Features**: Game offers, surveys, user progress sync, conversions
- **Webhook**: `POST /api/besitos/webhook`

### Bitlabs (Game Offers)
- **Endpoints**: `/v2/client/offers`, `/v2/publisher/offers`
- **Features**: Game offers, publisher API, client API
- **Webhook**: `POST /api/bitlabs/webhook`

### Adjust (Attribution Tracking)
- **Endpoints**: `/event`, `/ad_revenue`, `/session`
- **Features**: Event tracking, revenue tracking, attribution
- **Webhook**: `POST /api/adjust/webhook`

### Everflow (Conversion Tracking)
- **Features**: Conversion postback
- **Webhook**: `POST /api/everflow/webhook`

### Google Play (Integrity & IAP)
- **Integrity API**: Device/app/user verification
- **IAP API**: In-app purchase verification
- **Webhook**: `POST /api/google-play-iap/webhook`

### Tremendous (Gift Cards)
- **Features**: Gift card creation, order management
- **Used for**: Payout redemptions

### Zoho (CRM)
- **Features**: Ticket management, customer support
- **Endpoints**: `/api/zoho`

---

## Frontend Structure

### Mobile App (JacksonRewardsApp/)
- **Framework**: React Native + Next.js + Capacitor
- **State**: Zustand/Redux stores
- **Key Screens**: 
  - Auth (Login, Signup, OTP)
  - Onboarding (Gender, Age, Preferences)
  - Homepage (Featured games, challenges)
  - My Games (Installed games)
  - Game Detail (Info, tips, play)
  - Wallet (Balance, transactions)
  - Daily Rewards (Weekly calendar)
  - Spin Wheel (Spin mechanics)
  - VIP Membership (Tiers, benefits)
  - Profile (Settings, preferences)

### Admin Panel (admin-frontend/)
- **Framework**: Next.js
- **Key Panels**:
  - Dashboard (Analytics, metrics)
  - User Management
  - Game Management (CRUD, rewards, display rules)
  - Daily Challenges/Rewards Config
  - Spin Wheel Config
  - VIP Management
  - Transaction Management
  - Payout Approval
  - Ticket Management

---

## Known Bugs & Fixes

### Fixed Bugs
- **BUG-063**: Spin wheel probability validation - Fixed randomization
- **BUG-065**: Spin wheel randomization - Proper cumulative distribution
- **ADM-DR-001**: Daily rewards API compatibility - Fixed progress loader
- **ADM-DR-005**: Year transition - Fixed weekly multiplier
- **ADM-DR-011**: Admin flags - Fixed config conflict
- **ADM-DR-044**: XP tier decay - Fixed tier selection
- **ADM-DR-045**: Frontend validation - Fixed validation logic

### Key Files for Bug Fixes
- `utils/spinWheelRandomizer.js` - BUG-065 fix
- `utils/dailyRewardProgressFixed.js` - ADM-DR-001 fix
- `utils/dailyRewardHelpersV2.js` - Weekly multiplier logic
- `routes/spin.js` - Spin wheel endpoint
- `routes/daily-rewards.js` - Daily rewards endpoint

---

## Important Configuration

### Environment Variables (.env)
- MongoDB: `MONGODB_URI`
- Redis: `REDIS_URL`
- JWT: `JWT_SECRET`
- Besitos: `BESITOS_BASE_URL`, `BESITOS_PARTNER_ID`, `BESITOS_API_TOKEN`
- Bitlabs: `BITLABS_API_KEY`, `BITLABS_API_SECRET`
- Adjust: `ADJUST_API_TOKEN`, `ADJUST_APP_TOKEN`
- Google Play: `GOOGLE_PLAY_INTEGRITY_SERVICE_ACCOUNT`, `ANDROID_PACKAGE_NAME`
- Tremendous: `TREMENDOUS_API_KEY`
- Firebase: `FIREBASE_SERVICE_ACCOUNT`

### Key Config Files
- `config/config.js` - Main configuration
- `config/passport.js` - OAuth configuration
- `config/otp-config.js` - OTP settings

---

## Testing & Debugging

### Test Scripts
- `scripts/test-*.js` - Various test scripts for features
- `tests/` - Jest test suites
- `postman/` - Postman collections for API testing

### Debugging Tools
- `debug-*.js` - Debug scripts for specific issues
- `verify-*.js` - Verification scripts
- `fix-*.js` - Fix application scripts

---

## Deployment & Monitoring

### Docker
- `docker-compose.yml` - Main compose file
- `docker-compose-sre.yml` - SRE monitoring stack
- `Dockerfile` - Production image

### Kubernetes
- `k8s/` - K8s manifests (deployment, service, HPA)

### Monitoring
- **Prometheus**: Metrics collection
- **Grafana**: Dashboards
- **Loki**: Log aggregation
- **Tempo**: Distributed tracing
- **Sentry**: Error tracking
- **OpenTelemetry**: Instrumentation

---

## Ready for Bug Fixing!

I now have complete understanding of:
✅ All database models and relationships
✅ All API endpoints and their logic
✅ All business flows (games, rewards, VIP, etc.)
✅ All third-party integrations
✅ Frontend-backend mappings
✅ Middleware and authentication
✅ Known bugs and their fixes

**Ready to handle bugs one by one!** 🚀
