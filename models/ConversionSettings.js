/**
 * Conversion Settings Model
 * Stores coin-to-currency conversion rates and redemption limits
 * @module models/ConversionSettings
 */

const mongoose = require('mongoose');

const conversionSettingsSchema = new mongoose.Schema({
    // Currency code (e.g., 'USD')
    currency: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        enum: ['USD'],
        default: 'USD'
    },
    
    // Conversion rates
    coinsPerDollar: {
        type: Number,
        required: true,
        min: 0.01,
        default: 100 // 100 coins = $1
    },
    
    // Conversion unit settings
    coinsPerUnit: {
        type: Number,
        required: true,
        min: 1,
        default: 500 // 500 coins
    },
    
    currencyAmount: {
        type: Number,
        required: true,
        min: 0.01,
        default: 5 // $5
    },
    
    // Redemption limits
    minRedemption: {
        type: Number,
        required: true,
        min: 1,
        default: 100 // Minimum 100 coins
    },
    
    maxRedemption: {
        type: Number,
        required: true,
        min: 1,
        default: 10000 // Maximum 10000 coins
    },
    
    // Payment methods available for this currency
    paymentMethods: {
        type: [String],
        default: ['UPI', 'Paytm', 'Gift Card', 'Bank Transfer', 'PayPal']
    },
    
    // Metadata
    lastUpdatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false
    },
    
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Indexes
conversionSettingsSchema.index({ currency: 1 });
conversionSettingsSchema.index({ isActive: 1 });

// Statics

/**
 * Get active conversion settings for a currency
 */
conversionSettingsSchema.statics.getActiveSettings = async function(currency = 'USD') {
    let settings = await this.findOne({ currency: currency.toUpperCase(), isActive: true });
    
    // If no settings exist, create default
    if (!settings) {
        settings = await this.create({
            currency: currency.toUpperCase(),
            coinsPerDollar: 100,
            coinsPerUnit: 500,
            currencyAmount: 5,
            minRedemption: 100,
            maxRedemption: 10000,
            paymentMethods: ['UPI', 'Paytm', 'Gift Card', 'Bank Transfer', 'PayPal']
        });
    }
    
    return settings;
};

/**
 * Update conversion settings for a currency
 */
conversionSettingsSchema.statics.updateSettings = async function(currency, updateData, adminId) {
    const currencyUpper = currency.toUpperCase();
    
    let settings = await this.findOne({ currency: currencyUpper });
    
    if (!settings) {
        // Create new settings if they don't exist
        settings = await this.create({
            currency: currencyUpper,
            ...updateData,
            lastUpdatedBy: adminId
        });
    } else {
        // Update existing settings
        Object.assign(settings, updateData);
        settings.lastUpdatedBy = adminId;
        await settings.save();
    }
    
    return settings;
};

const ConversionSettings = mongoose.model('ConversionSettings', conversionSettingsSchema);

module.exports = ConversionSettings;

