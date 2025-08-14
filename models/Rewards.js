const mongoose = require('mongoose');

const rewardSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['daily', 'weekly', 'monthly', 'special'],
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
    imageUrl: {
        type: String,
        required: true
    },
    reward: {
        coins: {
            type: Number,
            required: true
        },
        xp: {
            type: Number,
            required: true
        },
        benefits: {
            type: Array,
            default: []
        }
    },
    requirements: {
        type: Array,
        default: []
    },
    vipOnly: {
        type: Boolean,
        default: false
    },
    active: {
        type: Boolean,
        default: true
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Daily reward schema
const dailyRewardSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    claimed: {
        type: Boolean,
        default: false
    },
    reward: {
        coins: {
            type: Number,
            required: true
        },
        xp: {
            type: Number,
            required: true
        }
    }
}, {
    timestamps: true
});

// Create models
const Reward = mongoose.model('Reward', rewardSchema);
const DailyReward = mongoose.model('DailyReward', dailyRewardSchema);

module.exports = { Reward, DailyReward };
