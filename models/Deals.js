const mongoose = require('mongoose');

const dealSchema = new mongoose.Schema({
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
        enum: ['game', 'survey', 'race', 'bonus'],
        required: true
    },
    imageUrl: {
        type: String,
        required: true
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    reward: {
        type: {
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

const Deals = mongoose.model('Deals', dealSchema);

module.exports = Deals;
