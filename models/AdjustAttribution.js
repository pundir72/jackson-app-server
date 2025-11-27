/**
 * Adjust Attribution Model
 * Stores attribution data from Adjust for user tracking
 * @module models/AdjustAttribution
 */

const mongoose = require('mongoose');

const adjustAttributionSchema = new mongoose.Schema({
    // User reference
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    // Adjust identifiers
    adjustId: {
        type: String,
        index: true
    },
    network: {
        type: String
    },
    campaign: {
        type: String
    },
    adgroup: {
        type: String
    },
    creative: {
        type: String
    },
    clickLabel: {
        type: String
    },
    trackerToken: {
        type: String,
        index: true
    },
    trackerName: {
        type: String
    },
    campaignId: {
        type: String
    },
    adgroupId: {
        type: String
    },
    creativeId: {
        type: String
    },

    // Device identifiers
    idfa: {
        type: String,
        index: true
    },
    idfv: {
        type: String
    },
    gpsAdid: {
        type: String,
        index: true
    },
    androidId: {
        type: String
    },
    fireAdid: {
        type: String
    },
    windowsAdid: {
        type: String
    },
    amazonAdid: {
        type: String
    },

    // App information
    appToken: {
        type: String,
        required: true,
        index: true
    },
    appVersion: {
        type: String
    },
    appName: {
        type: String
    },

    // Device information
    deviceType: {
        type: String
    },
    deviceName: {
        type: String
    },
    osName: {
        type: String
    },
    osVersion: {
        type: String
    },
    environment: {
        type: String,
        enum: ['sandbox', 'production'],
        default: 'production'
    },

    // Location information
    country: {
        type: String
    },
    region: {
        type: String
    },
    city: {
        type: String
    },
    language: {
        type: String
    },
    ipAddress: {
        type: String
    },

    // Attribution information
    attributionType: {
        type: String,
        enum: ['click', 'impression', 'session'],
        default: 'click'
    },
    clickTime: {
        type: Date
    },
    installTime: {
        type: Date
    },
    impressionTime: {
        type: Date
    },
    isOrganic: {
        type: Boolean,
        default: false
    },
    isReattributed: {
        type: Boolean,
        default: false
    },

    // Additional metadata
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },

    // Status
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Indexes for performance
adjustAttributionSchema.index({ userId: 1, createdAt: -1 });
adjustAttributionSchema.index({ appToken: 1, trackerToken: 1 });
adjustAttributionSchema.index({ idfa: 1, gpsAdid: 1 });
adjustAttributionSchema.index({ network: 1, campaign: 1 });

// Static methods

/**
 * Get attribution for a user
 */
adjustAttributionSchema.statics.getUserAttribution = async function(userId) {
    return await this.findOne({ 
        userId: userId,
        isActive: true
    }).sort({ createdAt: -1 });
};

/**
 * Get attribution by device ID
 */
adjustAttributionSchema.statics.getByDeviceId = async function(deviceId, deviceType = 'auto') {
    const query = {};
    
    // Try to detect device type and search accordingly
    if (deviceType === 'ios' || deviceId.length === 36) {
        query.$or = [
            { idfa: deviceId },
            { idfv: deviceId }
        ];
    } else if (deviceType === 'android' || deviceId.length === 16) {
        query.$or = [
            { gpsAdid: deviceId },
            { androidId: deviceId }
        ];
    } else {
        // Search all device ID fields
        query.$or = [
            { idfa: deviceId },
            { idfv: deviceId },
            { gpsAdid: deviceId },
            { androidId: deviceId },
            { fireAdid: deviceId },
            { windowsAdid: deviceId },
            { amazonAdid: deviceId }
        ];
    }
    
    return await this.findOne(query).sort({ createdAt: -1 });
};

/**
 * Get attribution statistics
 */
adjustAttributionSchema.statics.getAttributionStats = async function(filters = {}) {
    const matchQuery = {};
    
    if (filters.startDate || filters.endDate) {
        matchQuery.createdAt = {};
        if (filters.startDate) matchQuery.createdAt.$gte = new Date(filters.startDate);
        if (filters.endDate) matchQuery.createdAt.$lte = new Date(filters.endDate);
    }
    
    if (filters.network) matchQuery.network = filters.network;
    if (filters.campaign) matchQuery.campaign = filters.campaign;
    if (filters.appToken) matchQuery.appToken = filters.appToken;
    
    return await this.aggregate([
        { $match: matchQuery },
        {
            $group: {
                _id: {
                    network: '$network',
                    campaign: '$campaign',
                    isOrganic: '$isOrganic'
                },
                count: { $sum: 1 },
                uniqueUsers: { $addToSet: '$userId' }
            }
        },
        {
            $project: {
                network: '$_id.network',
                campaign: '$_id.campaign',
                isOrganic: '$_id.isOrganic',
                count: 1,
                uniqueUsers: { $size: '$uniqueUsers' }
            }
        },
        { $sort: { count: -1 } }
    ]);
};

const AdjustAttribution = mongoose.model('AdjustAttribution', adjustAttributionSchema);

module.exports = AdjustAttribution;

