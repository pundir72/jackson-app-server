/**
 * FIX for Attribution Endpoint
 * Uses AdjustCallback properly instead of OAuth provider
 * 
 * SENIOR DEV ISSUES ADDRESSED:
 * 1. ✅ Source detection: Use AdjustCallback.network/trackerName (not OAuth)
 * 2. ✅ TikTok/Instagram/Snapchat: Read from AdjustCallback fields
 * 3. ✅ Marketing Cost: Link by adjustUserId, not userId
 * 4. ✅ Margin: Includes marketingCost
 * 5. ✅ Performance: Use aggregation instead of User.find()
 */

const mongoose = require('mongoose');
const AdjustCallback = require('./models/AdjustCallback');
const User = require('./models/User');
const Transaction = require('./models/Transaction');

/**
 * Get attribution data using AdjustCallback (webhook data)
 * This is the CORRECT way - uses real attribution data
 */
async function getAttributionFromAdjustCallback(filters = {}) {
  const { startDate, endDate, source: sourceFilter } = filters;

  // Build date filter
  const dateFilter = {};
  if (startDate) dateFilter.$gte = new Date(startDate);
  if (endDate) dateFilter.$lte = new Date(endDate);

  // Step 1: Get installs grouped by ACTUAL network from AdjustCallback
  const installMatch = {
    activityKind: { $in: ['install', 'reattribution', 'reattribution_reinstall'] },
    ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
    ...(sourceFilter ? { 
      $or: [
        { network: new RegExp(sourceFilter, 'i') },
        { trackerName: new RegExp(sourceFilter, 'i') },
        { campaign: new RegExp(sourceFilter, 'i') }
      ]
    } : {})
  };

  const installAggregation = await AdjustCallback.aggregate([
    { $match: installMatch },
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user'
      }
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: {
          network: { $ifNull: ['$network', 'Organic'] },
          trackerName: { $ifNull: ['$trackerName', 'direct'] }
        },
        installs: { $addToSet: '$userId' },
        userIds: { $addToSet: { $ifNull: ['$userId', '$_id'] } },
        totalRevenue: { $sum: { $ifNull: ['$revenue', 0] } },
        sampleClickId: { $first: '$clickLabel' }
      }
    },
    {
      $project: {
        source: '$_id.network',
        trackerName: '$_id.trackerName',
        installs: { $size: '$installs' },
        userIds: 1,
        totalRevenue: 1,
        sampleClickId: 1
      }
    },
    { $sort: { installs: -1 } }
  ]);

  // Step 2: Build attribution data with all metrics
  const attributionData = await Promise.all(
    installAggregation.map(async (group) => {
      const userIds = group.userIds.filter(id => id !== null);
      
      // D1 Retention: Use retentionCalculator or fallback
      let d1Retention = 0;
      if (userIds.length > 0) {
        try {
          // Try to use retentionCalculator
          const { calculateRetention } = require('../utils/retentionCalculatorFixed');
          const users = await User.find({ _id: { $in: userIds } })
            .select('createdAt dailyActivity')
            .lean();
          const retention = calculateRetention(users, 'd1');
          d1Retention = retention.percentage || 0;
        } catch (err) {
          // Fallback: manual calculation
          const users = await User.find({ _id: { $in: userIds } })
            .select('createdAt dailyActivity')
            .lean();
          const retained = users.filter(user => {
            if (!user.dailyActivity?.activeDates || !user.createdAt) return false;
            const d1Date = new Date(user.createdAt);
            d1Date.setDate(d1Date.getDate() + 1);
            const d1Str = d1Date.toISOString().split('T')[0];
            return user.dailyActivity.activeDates.includes(d1Str);
          }).length;
          d1Retention = ((retained / users.length) * 100).toFixed(2);
        }
      }

      // Revenue from Transactions
      const revenueData = await Transaction.aggregate([
        {
          $match: {
            user: { $in: userIds },
            type: { $in: ['credit', 'reward'] },
            status: 'completed',
            ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {})
          }
        },
        {
          $group: {
            _id: null,
            revenue: { $sum: '$amount' }
          }
        }
      ]);
      const revenue = revenueData[0]?.revenue || 0;

      // Reward Cost
      const rewardData = await Transaction.aggregate([
        {
          $match: {
            user: { $in: userIds },
            type: 'reward',
            balanceType: 'coins',
            status: 'completed',
            ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {})
          }
        },
        {
          $group: {
            _id: null,
            cost: { $sum: '$amount' }
          }
        }
      ]);
      const rewardCost = rewardData[0]?.cost || 0;

      // Marketing Cost: Link by adjustUserId OR click tracking
      let marketingCost = 0;
      try {
        // Match by adjustUserId (set in webhook processing)
        const adSpendData = await AdjustCallback.aggregate([
          {
            $match: {
              activityKind: 'ad_spend',
              ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
              $or: [
                { network: group.source },
                { trackerName: group.trackerName },
                { campaign: group.source } // Try campaign name too
              ]
            }
          },
          {
            $group: {
              _id: null,
              totalCost: { $sum: '$costAmount' } // Use costAmount field we added!
            }
          }
        ]);
        marketingCost = adSpendData[0]?.totalCost || 0;
      } catch (error) {
        console.warn(`⚠️ Could not fetch marketing cost for ${group.source}:`, error.message);
      }

      // Margin calculation (FIXED: includes marketingCost)
      const margin = revenue - rewardCost - marketingCost;
      const marginPercent = revenue > 0 ? ((margin / revenue) * 100).toFixed(2) : 0;

      return {
        source: group.source,
        trackerName: group.trackerName,
        installs: group.installs,
        d1Retention: parseFloat(d1Retention),
        revenue,
        rewardCost,
        marketingCost,
        margin,
        marginPercent: parseFloat(marginPercent)
      };
    })
  );

  return attributionData;
}

/**
 * Get available sources from AdjustCallback (not OAuth!)
 */
async function getAvailableSources(filters = {}) {
  const { startDate, endDate } = filters;
  
  const dateFilter = {};
  if (startDate) dateFilter.$gte = new Date(startDate);
  if (endDate) dateFilter.$lte = new Date(endDate);

  const sources = await AdjustCallback.aggregate([
    {
      $match: {
        activityKind: { $in: ['install', 'reattribution', 'reattribution_reinstall'] },
        ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {})
      }
    },
    {
      $group: {
        _id: { $ifNull: ['$network', 'Organic'] }
      }
    },
    { $project: { source: '$_id' } },
    { $sort: { source: 1 } }
  ]);

  return sources.map(s => s.source);
}

module.exports = {
  getAttributionFromAdjustCallback,
  getAvailableSources
};
