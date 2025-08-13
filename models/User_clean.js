const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
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
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        validate: {
            validator: function(v) {
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
            validator: function(v) {
                return /^[0-9]{10}$/.test(v);
            },
            message: 'Please enter a valid 10-digit mobile number'
        }
    },
    password: {
        type: String,
        required: true,
        minlength: 8
    },
    socialTag: {
        type: String,
        trim: true
    },

    // Profile
    profile: {
        avatar: {
            type: String,
            default: 'default-avatar.png'
        },
        status: {
            type: String,
            enum: ['active', 'inactive', 'guest'],
            default: 'active'
        },
        lastLogin: {
            type: Date
        },
        unreadMessages: {
            type: Number,
            default: 0
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

    // Preferences
    preferences: {
        language: {
            type: String,
            enum: ['en', 'hi', 'mr', 'ta', 'te'],
            default: 'en'
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

    // XP System
    xp: {
        current: {
            type: Number,
            default: 0
        },
        tier: {
            type: Number,
            default: 1
        },
        streak: {
            type: Number,
            default: 0
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
            enum: ['earn', 'save', 'invest', 'learn'],
            default: 'earn'
        },
        gender: {
            type: String,
            enum: ['male', 'female', 'other'],
            default: null
        },
        ageRange: {
            type: String,
            enum: ['18-25', '26-35', '36-45', '46-55', '56+'],
            default: null
        },
        improvementArea: {
            type: String,
            enum: ['budgeting', 'saving', 'investing', 'debt', 'retirement'],
            default: null
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

    // VIP
    vip: {
        level: {
            type: Number,
            default: 0
        },
        expires: {
            type: Date
        },
        benefits: [{
            type: String
        }]
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
        }
    }],

    // Tasks
    tasks: [{
        taskId: {
            type: String
        },
        type: {
            type: String,
            enum: ['daily', 'weekly', 'monthly']
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

    // Cash Coach
    cashCoach: {
        goals: [{
            id: {
                type: String
            },
            amount: {
                type: Number
            },
            status: {
                type: String,
                enum: ['active', 'completed', 'failed']
            },
            startDate: {
                type: Date
            },
            endDate: {
                type: Date
            }
        }],
        receipts: [{
            id: {
                type: String
            },
            amount: {
                type: Number
            },
            status: {
                type: String,
                enum: ['processing', 'approved', 'rejected']
            },
            date: {
                type: Date
            }
        }],
        revenueGoal: {
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

// Hash password before saving
userSchema.pre('save', async function(next) {
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
userSchema.methods.comparePassword = async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

// Virtuals
userSchema.virtual('totalEarnings').get(function() {
    return this.wallet.balance;
});

const User = mongoose.model('User', userSchema);
module.exports = User;
