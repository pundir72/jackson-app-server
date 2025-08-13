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
                // Remove any non-digit characters first
                const cleanNumber = v.replace(/\D/g, '');
                
                // Check if it's a valid mobile number with or without country code
                // Supports formats like: 916263573606, +916263573606, 6263573606
                if (cleanNumber.length === 10) {
                    // 10-digit number (without country code)
                    return /^[6-9][0-9]{9}$/.test(cleanNumber);
                } else if (cleanNumber.length === 12 && cleanNumber.startsWith('91')) {
                    // 12-digit number with India country code (91)
                    return /^91[6-9][0-9]{9}$/.test(cleanNumber);
                } else if (cleanNumber.length === 13 && cleanNumber.startsWith('91')) {
                    // 13-digit number with India country code (91) - handles +91 format
                    return /^91[6-9][0-9]{9}$/.test(cleanNumber);
                }
                
                return false;
            },
            message: 'Please enter a valid mobile number (10 digits or with country code +91)'
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
        bio: {
            type: String,
            trim: true
        },
        status: {
            type: String,
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
            required: false
        },
        gender: {
            type: String,
            enum: ['male', 'female', 'other'],
            required: false
        },
        ageRange: {
            type: String,
            enum: ['18-25', '26-35', '36-45', '46-55', '56+'],
            required: false
        },
        improvementArea: {
            type: String,
            enum: ['budgeting', 'saving', 'investing', 'debt', 'retirement'],
            required: false
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

// Normalize mobile number before saving
userSchema.pre('save', function(next) {
    if (this.isModified('mobile')) {
        // Remove all non-digit characters and normalize to standard format
        const cleanNumber = this.mobile.replace(/\D/g, '');
        
        if (cleanNumber.length === 12 && cleanNumber.startsWith('91')) {
            // Store as 10-digit number (remove country code)
            this.mobile = cleanNumber.substring(2);
        } else if (cleanNumber.length === 13 && cleanNumber.startsWith('91')) {
            // Store as 10-digit number (remove country code)
            this.mobile = cleanNumber.substring(2);
        } else if (cleanNumber.length === 10) {
            // Already 10 digits, store as is
            this.mobile = cleanNumber;
        }
    }
    next();
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
    console.log('comparePassword method called');
    console.log('candidatePassword:', candidatePassword);
    console.log('this.password:', this.password);
    const result = await bcrypt.compare(candidatePassword, this.password);
    console.log('bcrypt.compare result:', result);
    return result;
};

// Method to get formatted mobile number
userSchema.methods.getFormattedMobile = function() {
    return `+91${this.mobile}`;
};

// Method to get mobile without country code
userSchema.methods.getMobileWithoutCode = function() {
    return this.mobile;
};

// Virtuals
userSchema.virtual('totalEarnings').get(function() {
    return this.wallet.balance;
});

const User = mongoose.model('User', userSchema);
module.exports = User;