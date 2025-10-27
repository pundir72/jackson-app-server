const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    // Location
    location: {
        current: {
            latitude: {
                type: Number
            },
            // Last seen IP
            lastIp: { type: String },
            longitude: {
                type: Number
            },
            accuracy: {
                type: Number,
                default: 0
            },
            country: {
                type: String
            },
            city: {
                type: String
            },
            ip: {
                type: String
            },
            timestamp: {
                type: Date,
                default: Date.now
            }
        },
        history: [{
            latitude: Number,
            longitude: Number,
            accuracy: Number,
            country: String,
            city: String,
            ip: String,
            timestamp: { type: Date, default: Date.now }
        }]
    },
    // VIP Status
    vip: {
        level: {
            type: String,
            // enum: ['free', 'bronze', 'gold', 'platinum'],
            default: 'free'
        },
        expires: {
            type: Date
        },
        benefits: {
            type: Array,
            default: []
        },
        isActive: {
            type: Boolean,
            default: false
        }
    },
    // Basic Info
    firstName: {
        type: String,
        required: true,
        trim: true
    },
    lastName: {
        type: String,
        required: true,
        trim: true
    },
    dateOfBirth: {
        type: Date
    },
    // Public username displayed in profile; unique, alphanumeric/underscore, 3-20 chars
    username: {
        type: String,
        unique: true,
        sparse: true,
        trim: true,
        minlength: 3,
        maxlength: 20,
        validate: {
            validator: function (v) {
                if (!v) return true; // optional
                return /^[a-zA-Z0-9_]+$/.test(v);
            },
            message: 'Username can contain only letters, numbers, and underscores (3-20 chars)'
        }
    },
    email: {
        type: String,
        required: false,
        unique: false,
        lowercase: true,
        trim: true,
        validate: {
            validator: function (v) {
                // Allow null/undefined values
                if (!v) return true;
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
            },
            message: 'Please enter a valid email address'
        }
    },
    mobile: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        validate: {
            validator: function (v) {
                // Remove any non-digit characters first
                const cleanNumber = v.replace(/\D/g, '');

                // International mobile number validation
                // Supports formats like: +1234567890, +44123456789, 6263573606

                // Check if it's a valid mobile number
                if (cleanNumber.length >= 7 && cleanNumber.length <= 15) {
                    // Valid international mobile number length
                    return true;
                }

                return false;
            },
            message: 'Please enter a valid mobile number (7-15 digits, with or without country code)'
        }
    },

    // OTP Verification
    otp: {
        code: {
            type: String
        },
        expiresAt: {
            type: Date
        }
    },

    isVerified: {
        type: Boolean,
        default: false
    },
    password: {
        type: String,
        required: true, // Required again - users must complete full signup
        minlength: 8
    },
    socialTag: {
        type: String,
        trim: true
    },
    role: {
        type: String,
        default: "USER",
    },

    // Social Login
    social: {
        googleId: {
            type: String,
            sparse: true
        },
        facebookId: {
            type: String,
            sparse: true
        },
        googleAccessToken: {
            type: String
        },
        facebookAccessToken: {
            type: String
        },
        provider: {
            type: String,
            enum: ['local', 'google', 'facebook'],
            default: 'local'
        }
    },

    // Profile
    profile: {
        avatar: {
            type: String,
            default: 'https://rewardsapi.hireagent.co/uploads/avatars/1757567700196-89285370.jpg'
        },
        bio: {
            type: String,
            trim: true
        },
        status: {
            type: String,
            enum: ['active', 'inactive', 'paused', 'suspended'],
            default: 'active'
        },
        theme: {
            type: String,
            enum: ['light', 'dark'],
            default: 'light'
        },
        notifications: {
            type: Boolean,
            default: true
        }
    },

    // Wallet
    wallet: {
        balance: {
            type: Number,
            default: 0
        },
        currency: {
            type: String,
            enum: ['coins', 'USD', 'INR'],
            default: 'coins'
        },
        lastUpdated: {
            type: Date
        },
        transactions: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Transaction'
        }]
    },

    // XP System
    xp: {
        current: {
            type: Number,
            default: 0
        },
        // Total lifetime XP earned (used for analytics and some progress calcs)
        total: {
            type: Number,
            default: 0
        },
        tier: {
            type: Number,
            default: 1
        }
    },

    // Onboarding
    onboarding: {
        completed: {
            type: Boolean,
            default: false
        },
        step: {
            type: Number,
            default: 0
        },
        primaryGoal: {
            type: String,
            // enum: ['earn', 'save', 'invest', 'learn'],
            required: false
        },
        gender: {
            type: String,
            // enum: ['male', 'female', 'other'],
            required: false
        },
        ageRange: {
            type: String,
            // enum: ['18-25', '26-35', '36-45', '46-55', '56+'],
            required: false
        },
        gamePreferences: [{
            type: String,
            // enum: ['puzzle', 'arcade', 'strategy', 'action', 'adventure', 'words', 'trivia']
        }],
        gameStyle: {
            type: String,
            // enum: ['easy', 'medium', 'hard', 'casual'],
            required: false
        },
        improvementArea: {
            type: String,
            // enum: ['budgeting', 'saving', 'investing', 'debt', 'retirement'],
            required: false
        },
        dailyEarningGoal: {
            type: Number,
            required: false
        },
        // My Account Overview - Dynamic Daily Goals
        dailyGoals: {
            gamesPlayed: {
                type: Number,
                default: 5,
                min: 1,
                max: 20
            },
            coinsEarned: {
                type: Number,
                default: 900,
                min: 100,
                max: 5000
            },
            challengesCompleted: {
                type: Number,
                default: 3,
                min: 1,
                max: 10
            }
        }
    },

    // App / session meta for admin analytics
    appVersion: {
        type: String,
        default: '1.0.0'
    },
    lastActive: {
        type: Date
    },
    lastLoginAt: {
        type: Date
    },
    loginCount: {
        type: Number,
        default: 0
    },
    
    // Device tracking for admin analytics
    device: {
        type: {
            type: String, // 'iOS', 'Android', 'Web'
            default: 'Unknown'
        },
        model: {
            type: String, // 'iPhone 14 Pro', 'Samsung Galaxy S23', etc.
            default: 'Unknown'
        },
        os: {
            type: String, // 'iOS 17.2', 'Android 14', etc.
            default: 'Unknown'
        },
        lastUpdated: {
            type: Date
        }
    },

    // Signup snapshot (immutable registration metadata)
    signup: {
        ip: String,
        country: String,
        city: String,
        at: { type: Date }
    },

    // Redemption preferences (admin Balance & Tier panel)
    redemption: {
        preference: {
            type: String,
            // enum: ['paypal', 'gift_card', 'crypto', 'bank', 'gpay', 'revolut', 'usd', 'inr', 'coins', 'none'],
            default: 'none'
        },
        // Redemption tracking for admin analytics
        count: {
            type: Number,
            default: 0
        },
        totalCoinsRedeemed: {
            type: Number,
            default: 0
        },
        lastRedeemedAt: {
            type: Date
        }
    },

    // Lightweight cache for spin usage history (for admin summaries)
    lastSpinAt: {
        type: Date
    },
    spinCount: {
        type: Number,
        default: 0
    },
    
    // Analytics for admin dashboard
    analytics: {
        totalCoinsEarned: {
            type: Number,
            default: 0
        },
        totalOffersRedeemed: {
            type: Number,
            default: 0
        },
        lastOfferClaimedAt: {
            type: Date
        },
        avgSessionDuration: {
            type: Number, // in minutes
            default: 0
        },
        primaryEarningSource: {
            type: String, // 'games', 'surveys', 'tasks', 'referrals'
            default: 'N/A'
        }
    },

    // Biometric
    biometric: {
        enabled: {
            type: Boolean,
            default: false
        },
        lastAttempt: {
            type: Date
        },
        attempts: {
            type: Number,
            default: 0
        },
        lockedUntil: {
            type: Date
        }
    },

    // Password Reset
    passwordReset: {
        token: {
            type: String
        },
        expires: {
            type: Date
        },
        attempts: {
            type: Number,
            default: 0
        },
        lastRequest: {
            type: Date
        }
    },



    // Games
    games: [{
        gameId: {
            type: String
        },
        score: {
            type: Number
        },
        completed: {
            type: Boolean,
            default: false
        },
        date: {
            type: Date
        },
        // Enhanced game tracking for My Games screen
        firstPlayed: {
            type: Date,
            default: Date.now
        },
        lastPlayed: {
            type: Date
        },
        playCount: {
            type: Number,
            default: 0
        },
        completedAt: {
            type: Date
        },
        progress: {
            type: Number,
            default: 0,
            min: 0,
            max: 100
        },
        level: {
            type: Number,
            default: 1
        },
        // Unread message tracking
        hasUnread: {
            type: Boolean,
            default: false
        },
        unreadCount: {
            type: Number,
            default: 0
        },
        lastMessageAt: {
            type: Date
        }
    }],

    // Tasks
    tasks: [{
        taskId: {
            type: String
        },
        type: {
            type: String,
            // enum: ['daily', 'weekly', 'monthly']
        },
        completed: {
            type: Boolean,
            default: false
        },
        xpReward: {
            type: Number
        },
        date: {
            type: Date
        }
    }],

    // Surveys
    surveys: [{
        surveyId: {
            type: String
        },
        completed: {
            type: Boolean,
            default: false
        },
        date: {
            type: Date
        }
    }],

    // Races
    races: [{
        raceId: {
            type: String
        },
        position: {
            type: Number
        },
        completed: {
            type: Boolean,
            default: false
        },
        date: {
            type: Date
        }
    }],

    // Cash Coach - Enhanced Financial Planning System
    cashCoach: {
        // Financial Goals (Slider Values)
        financialGoals: {
            salary: {
                type: Number,
                default: 0,
                min: 0,
                max: 9999
            },
            rent: {
                type: Number,
                default: 0,
                min: 0,
                max: 9999
            },
            food: {
                type: Number,
                default: 0,
                min: 0,
                max: 9999
            },
            savings: {
                type: Number,
                default: 0,
                min: 0,
                max: 9999
            },
            revenueGoal: {
                type: Number,
                default: 0,
                min: 0,
                max: 9999
            }
        },

        // Monthly Summary (Calculated Values)
        monthlySummary: {
            totalIncome: {
                type: Number,
                default: 0
            },
            totalExpenses: {
                type: Number,
                default: 0
            },
            netSavings: {
                type: Number,
                default: 0
            },
            jacksonContribution: {
                type: Number,
                default: 0
            },
            lastCalculated: {
                type: Date,
                default: Date.now
            }
        },

        // Task Progress Tracking for "Achieve Your Goal"
        taskProgress: {
            steps: [{
                id: {
                    type: String,
                    required: true
                },
                title: {
                    type: String,
                    required: true
                },
                description: {
                    type: String,
                    required: true
                },
                type: {
                    type: String,
                    // enum: ['game', 'survey', 'challenge', 'milestone', 'receipt'],
                    required: true
                },
                completed: {
                    type: Boolean,
                    default: false
                },
                reward: {
                    coins: {
                        type: Number,
                        default: 0
                    },
                    xp: {
                        type: Number,
                        default: 0
                    }
                },
                completedAt: {
                    type: Date
                },
                order: {
                    type: Number,
                    required: true
                }
            }],
            currentStep: {
                type: Number,
                default: 0
            },
            totalSteps: {
                type: Number,
                default: 5
            },
            totalReward: {
                coins: {
                    type: Number,
                    default: 0
                },
                xp: {
                    type: Number,
                    default: 0
                }
            },
            isActive: {
                type: Boolean,
                default: false
            },
            startedAt: {
                type: Date
            },
            completedAt: {
                type: Date
            }
        },

        // Linked Accounts for Payout Methods
        linkedAccounts: [{
            provider: {
                type: String,
                // enum: ['paypal', 'gpay', 'revolut', 'bank', 'crypto'],
                required: true
            },
            accountId: {
                type: String,
                required: true
            },
            accountName: {
                type: String,
                required: true
            },
            isActive: {
                type: Boolean,
                default: true
            },
            isVerified: {
                type: Boolean,
                default: false
            },
            linkedAt: {
                type: Date,
                default: Date.now
            },
            lastUsed: {
                type: Date
            }
        }],

        // Receipt Management
        receipts: [{
            id: {
                type: String,
                required: true
            },
            amount: {
                type: Number,
                required: true
            },
            category: {
                type: String,
                default: 'other'
            },
            description: {
                type: String
            },
            imageUrl: {
                type: String
            },
            status: {
                type: String,
                // enum: ['processing', 'approved', 'rejected'],
                default: 'processing'
            },
            reward: {
                coins: {
                    type: Number,
                    default: 0
                },
                xp: {
                    type: Number,
                    default: 0
                }
            },
            uploadedAt: {
                type: Date,
                default: Date.now
            },
            processedAt: {
                type: Date
            }
        }],

        // Custom Goals (Named Goals)
        customGoals: [{
            id: {
                type: String,
                required: true
            },
            name: {
                type: String,
                required: true
            },
            description: {
                type: String
            },
            targetAmount: {
                type: Number,
                required: true
            },
            currentAmount: {
                type: Number,
                default: 0
            },
            category: {
                type: String,
                // enum: ['vacation', 'rent_deposit', 'emergency', 'purchase', 'savings', 'other'],
                default: 'other'
            },
            priority: {
                type: String,
                enum: ['low', 'medium', 'high'],
                default: 'medium'
            },
            status: {
                type: String,
                // enum: ['active', 'completed', 'paused', 'cancelled'],
                default: 'active'
            },
            targetDate: {
                type: Date
            },
            createdAt: {
                type: Date,
                default: Date.now
            },
            completedAt: {
                type: Date
            }
        }],

        // Earning History
        earningHistory: [{
            date: {
                type: Date,
                required: true
            },
            source: {
                type: String,
                // enum: ['game', 'survey', 'challenge', 'receipt', 'bonus', 'referral'],
                required: true
            },
            amount: {
                type: Number,
                required: true
            },
            description: {
                type: String
            },
            taskId: {
                type: String
            }
        }],

        // Settings and Preferences
        settings: {
            autoCalculate: {
                type: Boolean,
                default: true
            },
            notifications: {
                goalReminders: {
                    type: Boolean,
                    default: true
                },
                earningUpdates: {
                    type: Boolean,
                    default: true
                },
                milestoneReached: {
                    type: Boolean,
                    default: true
                }
            },
            currency: {
                type: String,
                default: 'USD'
            },
            timezone: {
                type: String,
                default: 'UTC'
            }
        }
    },
    // Disclosure tracking
    disclosureAccepted: {
        type: Boolean,
        default: false
    },
    disclosureAcceptedAt: {
        type: Date
    },
    disclosureVersion: {
        type: String,
        default: '1.0'
    },
    // Conversion sessions
    conversionSessions: [{
        id: String,
        coins: Number,
        currency: String,
        type: {
            type: String,
            enum: ['task', 'ad']
        },
        status: {
            type: String,
            // enum: ['pending', 'task_completed', 'ad_completed', 'claimed', 'expired']
        },
        expiresAt: Date,
        taskId: String,
        taskCompletedAt: Date,
        adCompletedAt: Date,
        claimedAt: Date,
        conversionAmount: Number,
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    // Withdrawal requests
    withdrawals: [{
        id: String,
        method: String,
        amount: Number,
        netAmount: Number,
        processingFee: Number,
        requiredCoins: Number,
        paymentDetails: Object,
        status: {
            type: String,
            // enum: ['pending', 'approved', 'rejected', 'completed', 'failed']
        },
        createdAt: {
            type: Date,
            default: Date.now
        },
        processedAt: Date
    }],
    // Welcome Offer tracking
    welcomeOffer: {
        started: { type: Boolean, default: false },
        startedAt: Date,
        expiresAt: Date,
        completed: { type: Boolean, default: false },
        completedAt: Date,
        gamesCompleted: { type: Number, default: 0 },
        totalMinutesPlayed: { type: Number, default: 0 },
        rewardClaimed: { type: Boolean, default: false },
        tasks: [{
            id: String,
            title: String,
            description: String,
            type: String,
            required: Number,
            completed: Number,
            reward: {
                coins: Number,
                xp: Number
            }
        }]
    },
    // Survey sessions
    surveys: [{
        id: String,
        provider: String,
        status: {
            type: String,
            // enum: ['active', 'completed', 'incomplete', 'expired']
        },
        startedAt: Date,
        expiresAt: Date,
        completedAt: Date,
        reward: Number,
        surveyId: String,
        userToken: String,
        callbackUrl: String
    }],
    // Race participation
    races: [{
        raceId: String,
        gameId: String,
        status: {
            type: String,
            // enum: ['active', 'completed', 'expired', 'cancelled']
        },
        startedAt: Date,
        expiresAt: Date,
        completedAt: Date,
        currentLevel: { type: Number, default: 0 },
        completedLevels: [Number],
        bots: [{
            id: String,
            name: String,
            currentLevel: Number,
            speed: Number,
            avatar: String,
            isActive: Boolean
        }],
        position: Number,
        totalReward: {
            coins: Number,
            xp: Number
        }
    }],
    // Streak tracking
    streak: {
        current: { type: Number, default: 0 },
        lastUpdated: Date,
        completedTasks: [String],
        lastTaskType: String,
        lastTaskId: String,
        resetAt: Date,
        resetReason: String
    },
    // Daily Activity Tracking
    dailyActivity: {
        currentStreak: { type: Number, default: 0 },
        lastActiveDate: { type: Date },
        totalActiveDays: { type: Number, default: 0 },
        activeDates: [String], // Array of date strings (YYYY-MM-DD) when user was active
        longestStreak: { type: Number, default: 0 },
        streakHistory: [{
            startDate: Date,
            endDate: Date,
            days: Number,
            brokenAt: Date
        }],
        lastStreakReset: Date,
        resetReason: String
    },
    // User badges
    badges: [String],
    // User titles
    titles: [String],
    // User preferences
    preferences: {
        lastActiveTab: String,
        lastTabSwitch: Date,
        lastChallengeCheck: Date,
        lastGameCheck: Date,
        lastRewardCheck: Date,
        lastDealCheck: Date,
        lastInsightCheck: Date,
        theme: { type: String, default: 'light' },
        notifications: { type: Boolean, default: true },
        language: { type: String, default: 'en' },
        // My Games screen preferences
        searchHistory: [{
            query: String,
            timestamp: { type: Date, default: Date.now }
        }],
        favoriteGames: [String],
        lastSearchQuery: String,
        gameViewMode: { type: String, enum: ['grid', 'list'], default: 'grid' },
        sortBy: {
            type: String,
            // enum: ['recent', 'popular', 'alphabetical', 'earning'],
            default: 'recent'
        },
        filterBy: {
            category: [String],
            difficulty: [String],
            hasUnread: Boolean,
            isFavorite: Boolean
        }
    },

    // My Account Overview milestone tracking
    milestone_gamesPlayed_claimed: { type: Boolean, default: false },
    milestone_coinsEarned_claimed: { type: Boolean, default: false },
    milestone_challengesCompleted_claimed: { type: Boolean, default: false },

    // Daily progress reset tracking
    lastProgressReset: Date,

    // Ad-free purchase system
    adFreeUntil: {
        type: Date,
        default: null
    },
    adFreePurchases: [{
        purchaseDate: {
            type: Date,
            default: Date.now
        },
        duration: {
            type: Number, // hours
            required: true
        },
        cost: {
            coins: {
                type: Number,
                default: 0
            },
            xp: {
                type: Number,
                default: 0
            }
        },
        paymentMethod: {
            type: String,
            // enum: ['coins', 'xp', 'mixed'],
            required: true
        },
        expiresAt: {
            type: Date,
            required: true
        },
        isActive: {
            type: Boolean,
            default: true
        }
    }],
    adFreeStats: {
        totalPurchases: {
            type: Number,
            default: 0
        },
        totalCoinsSpent: {
            type: Number,
            default: 0
        },
        totalXPSpent: {
            type: Number,
            default: 0
        },
        totalHoursPurchased: {
            type: Number,
            default: 0
        }
    }
}, {
    timestamps: true,
    toJSON: {
        virtuals: true
    }
});

// Normalize mobile number before saving
userSchema.pre('save', function (next) {
    if (this.isModified('mobile')) {
        // Remove all non-digit characters
        const cleanNumber = this.mobile.replace(/\D/g, '');

        // Store the full international number (with country code)
        // This preserves the country code for international support
        this.mobile = cleanNumber;
    }
    next();
});

// Hash password before saving
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();

    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Method to compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
    console.log('comparePassword method called');
    console.log('candidatePassword:', candidatePassword);
    console.log('this.password:', this.password);
    const result = await bcrypt.compare(candidatePassword, this.password);
    console.log('bcrypt.compare result:', result);
    return result;
};

// Method to get formatted mobile number with + prefix
userSchema.methods.getFormattedMobile = function () {
    return `+${this.mobile}`;
};

// Method to get mobile without country code (for backward compatibility)
userSchema.methods.getMobileWithoutCode = function () {
    // If it's a 10-digit number (likely Indian), return as is
    if (this.mobile.length === 10) {
        return this.mobile;
    }
    // For international numbers, this method might not be applicable
    return this.mobile;
};

// Ad-free purchase methods
userSchema.methods.isAdFree = function () {
    return this.adFreeUntil && this.adFreeUntil > new Date();
};

userSchema.methods.getAdFreeTimeRemaining = function () {
    if (!this.isAdFree()) {
        return 0;
    }
    return Math.max(0, this.adFreeUntil.getTime() - new Date().getTime());
};

userSchema.methods.purchaseAdFree = function (duration, cost, paymentMethod) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (duration * 60 * 60 * 1000)); // Convert hours to milliseconds

    // If user already has ad-free time, extend it
    const currentAdFreeUntil = this.adFreeUntil && this.adFreeUntil > now ? this.adFreeUntil : now;
    const newAdFreeUntil = new Date(currentAdFreeUntil.getTime() + (duration * 60 * 60 * 1000));

    // Create purchase record
    const purchase = {
        purchaseDate: now,
        duration: duration,
        cost: cost,
        paymentMethod: paymentMethod,
        expiresAt: newAdFreeUntil,
        isActive: true
    };

    // Add to purchases array
    this.adFreePurchases.push(purchase);

    // Update ad-free until time
    this.adFreeUntil = newAdFreeUntil;

    // Update stats
    if (!this.adFreeStats) {
        this.adFreeStats = {
            totalPurchases: 0,
            totalCoinsSpent: 0,
            totalXPSpent: 0,
            totalHoursPurchased: 0
        };
    }

    this.adFreeStats.totalPurchases += 1;
    this.adFreeStats.totalCoinsSpent += cost.coins || 0;
    this.adFreeStats.totalXPSpent += cost.xp || 0;
    this.adFreeStats.totalHoursPurchased += duration;

    return purchase;
};

userSchema.methods.getAdFreeStats = function () {
    return {
        isAdFree: this.isAdFree(),
        adFreeUntil: this.adFreeUntil,
        timeRemaining: this.getAdFreeTimeRemaining(),
        stats: this.adFreeStats || {
            totalPurchases: 0,
            totalCoinsSpent: 0,
            totalXPSpent: 0,
            totalHoursPurchased: 0
        },
        recentPurchases: this.adFreePurchases
            .filter(p => p.isActive)
            .sort((a, b) => b.purchaseDate - a.purchaseDate)
            .slice(0, 5)
    };
};

// Method to get country code
userSchema.methods.getCountryCode = function () {
    if (this.mobile.length > 10) {
        // Extract country code (first 1-3 digits)
        const countryCodeLength = this.mobile.length - 10;
        return this.mobile.substring(0, countryCodeLength);
    }
    return '91'; // Default to India for 10-digit numbers
};

// Method to get mobile without country code
userSchema.methods.getMobileWithoutCountryCode = function () {
    if (this.mobile.length > 10) {
        // Remove country code
        const countryCodeLength = this.mobile.length - 10;
        return this.mobile.substring(countryCodeLength);
    }
    return this.mobile; // Already without country code
};

// Method to generate password reset token
userSchema.methods.generatePasswordResetToken = function () {
    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(32).toString('hex');

    // Hash the token before saving to database
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    this.passwordReset.token = hashedToken;
    this.passwordReset.expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    this.passwordReset.lastRequest = new Date();

    return resetToken; // Return unhashed token for email/SMS
};

// Method to clear password reset token
userSchema.methods.clearPasswordResetToken = function () {
    this.passwordReset.token = undefined;
    this.passwordReset.expires = undefined;
    this.passwordReset.attempts = 0;
};

// Method to check if password reset token is valid
userSchema.methods.isPasswordResetTokenValid = function (token) {
    if (!this.passwordReset.token || !this.passwordReset.expires) {
        return false;
    }

    const crypto = require('crypto');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    return hashedToken === this.passwordReset.token &&
        this.passwordReset.expires > new Date();
};

// Virtuals
userSchema.virtual('totalEarnings').get(function () {
    return this.wallet.balance;
});

const User = mongoose.model('User', userSchema);
module.exports = User;