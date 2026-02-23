const express = require('express')
const router = express.Router()
const mongoose = require('mongoose')
const { body, validationResult, query } = require('express-validator')
const protect = require('../middleware/auth')
const VIPTier = require('../models/VIPTier')
const VIPSubscription = require('../models/VIPSubscription')
const User = require('../models/User')
const DailyChallenge = require('../models/DailyChallenge')
const UserChallengeProgress = require('../models/UserChallengeProgress')
const BonusDay = require('../models/BonusDay')
const XPMultiplier = require('../models/XPMultiplier')
const Transaction = require('../models/Transaction')
const Game = require('../models/Game')
const Referral = require('../models/Referral')
const besitosService = require('../services/besitos.service')
const { getVIPPricing } = require('../utils/pricing')
const {
  calculateRetention,
  getRetentionTrend,
  getRetentionInsights,
  validateRetentionData
} = require('../utils/retentionCalculatorFixed')

// Admin authentication middleware
const { adminAuth } = require('../middleware/adminAuth')

// ==================== VIP TIERS MANAGEMENT ====================

// Get all VIP tiers (admin view)
router.get('/vip-tiers', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', status = 'all' } = req.query

    let query = {}

    // Search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { tierId: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ]
    }

    // Status filter
    if (status !== 'all') {
      query.active = status === 'active'
    }

    const skip = (parseInt(page) - 1) * parseInt(limit)

    const tiers = await VIPTier.find(query)
      .sort({ order: 1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))

    const total = await VIPTier.countDocuments(query)

    res.json({
      success: true,
      data: {
        tiers,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit),
        },
      },
    })
  } catch (error) {
    console.error('Error getting VIP tiers:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to get VIP tiers',
      error: error.message,
    })
  }
})

// Get single VIP tier by ID
router.get('/vip-tiers/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params

    const tier = await VIPTier.findById(id)
    if (!tier) {
      return res.status(404).json({
        success: false,
        message: 'VIP tier not found',
      })
    }

    res.json({
      success: true,
      data: tier,
    })
  } catch (error) {
    console.error('Error getting VIP tier:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to get VIP tier',
      error: error.message,
    })
  }
})

// Create new VIP tier
router.post(
  '/vip-tiers',
  adminAuth,
  [
    body('tierId')
      .isIn(['bronze', 'gold', 'platinum'])
      .withMessage('Invalid tier ID'),
    body('name').notEmpty().withMessage('Name is required'),
    body('description').notEmpty().withMessage('Description is required'),
    body('pricing.monthly')
      .isNumeric()
      .withMessage('Monthly price must be a number'),
    body('pricing.yearly')
      .isNumeric()
      .withMessage('Yearly price must be a number'),
    body('benefits').isArray().withMessage('Benefits must be an array'),
    body('order').isNumeric().withMessage('Order must be a number'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        })
      }

      const tierData = req.body

      // Check if tier ID already exists
      const existingTier = await VIPTier.findOne({ tierId: tierData.tierId })
      if (existingTier) {
        return res.status(400).json({
          success: false,
          message: 'VIP tier with this ID already exists',
        })
      }

      const tier = new VIPTier(tierData)
      await tier.save()

      res.status(201).json({
        success: true,
        message: 'VIP tier created successfully',
        data: tier,
      })
    } catch (error) {
      console.error('Error creating VIP tier:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to create VIP tier',
        error: error.message,
      })
    }
  }
)

// Update VIP tier
router.put(
  '/vip-tiers/:id',
  adminAuth,
  [
    body('name').optional().notEmpty().withMessage('Name cannot be empty'),
    body('description')
      .optional()
      .notEmpty()
      .withMessage('Description cannot be empty'),
    body('pricing.monthly')
      .optional()
      .isNumeric()
      .withMessage('Monthly price must be a number'),
    body('pricing.yearly')
      .optional()
      .isNumeric()
      .withMessage('Yearly price must be a number'),
    body('benefits')
      .optional()
      .isArray()
      .withMessage('Benefits must be an array'),
    body('order').optional().isNumeric().withMessage('Order must be a number'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        })
      }

      const { id } = req.params
      const updateData = req.body

      const tier = await VIPTier.findByIdAndUpdate(
        id,
        { ...updateData, updatedAt: new Date() },
        { new: true, runValidators: true }
      )

      if (!tier) {
        return res.status(404).json({
          success: false,
          message: 'VIP tier not found',
        })
      }

      res.json({
        success: true,
        message: 'VIP tier updated successfully',
        data: tier,
      })
    } catch (error) {
      console.error('Error updating VIP tier:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to update VIP tier',
        error: error.message,
      })
    }
  }
)

// Delete VIP tier
router.delete('/vip-tiers/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params

    // Check if tier is being used by any subscriptions
    const activeSubscriptions = await VIPSubscription.find({
      tier: tier.tierId,
      status: 'active',
    })
    if (activeSubscriptions.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete tier with active subscriptions',
      })
    }

    const tier = await VIPTier.findByIdAndDelete(id)
    if (!tier) {
      return res.status(404).json({
        success: false,
        message: 'VIP tier not found',
      })
    }

    res.json({
      success: true,
      message: 'VIP tier deleted successfully',
    })
  } catch (error) {
    console.error('Error deleting VIP tier:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to delete VIP tier',
      error: error.message,
    })
  }
})

// Toggle VIP tier status (active/inactive)
router.patch('/vip-tiers/:id/toggle', adminAuth, async (req, res) => {
  try {
    const { id } = req.params

    const tier = await VIPTier.findById(id)
    if (!tier) {
      return res.status(404).json({
        success: false,
        message: 'VIP tier not found',
      })
    }

    tier.active = !tier.active
    await tier.save()

    res.json({
      success: true,
      message: `VIP tier ${
        tier.active ? 'activated' : 'deactivated'
      } successfully`,
      data: tier,
    })
  } catch (error) {
    console.error('Error toggling VIP tier status:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to toggle VIP tier status',
      error: error.message,
    })
  }
})

// ==================== SUBSCRIPTIONS MANAGEMENT ====================

// Get all subscriptions (admin view)
router.get('/subscriptions', adminAuth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status = 'all',
      tier = 'all',
      search = '',
      startDate,
      endDate,
    } = req.query

    let query = {}

    // Status filter
    if (status !== 'all') {
      query.status = status
    }

    // Tier filter
    if (tier !== 'all') {
      query.tier = tier
    }

    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {}
      if (startDate) query.createdAt.$gte = new Date(startDate)
      if (endDate) query.createdAt.$lte = new Date(endDate)
    }

    // Search functionality
    if (search) {
      query.$or = [
        { paymentIntentId: { $regex: search, $options: 'i' } },
        { stripeSubscriptionId: { $regex: search, $options: 'i' } },
      ]
    }

    const skip = (parseInt(page) - 1) * parseInt(limit)

    const subscriptions = await VIPSubscription.find(query)
      .populate('userId', 'firstName lastName email mobile')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))

    const total = await VIPSubscription.countDocuments(query)

    res.json({
      success: true,
      data: {
        subscriptions,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit),
        },
      },
    })
  } catch (error) {
    console.error('Error getting subscriptions:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to get subscriptions',
      error: error.message,
    })
  }
})

// Get subscription statistics
router.get('/subscriptions/stats', adminAuth, async (req, res) => {
  try {
    const { period = '30d' } = req.query

    let dateFilter = {}
    const now = new Date()

    switch (period) {
      case '7d':
        dateFilter = {
          createdAt: {
            $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
          },
        }
        break
      case '30d':
        dateFilter = {
          createdAt: {
            $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
          },
        }
        break
      case '90d':
        dateFilter = {
          createdAt: {
            $gte: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
          },
        }
        break
      case '1y':
        dateFilter = {
          createdAt: {
            $gte: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
          },
        }
        break
    }

    const stats = await VIPSubscription.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: null,
          totalSubscriptions: { $sum: 1 },
          totalRevenue: { $sum: '$amount' },
          activeSubscriptions: {
            $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] },
          },
          cancelledSubscriptions: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] },
          },
          averageRevenue: { $avg: '$amount' },
        },
      },
    ])

    const tierStats = await VIPSubscription.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$tier',
          count: { $sum: 1 },
          revenue: { $sum: '$amount' },
        },
      },
    ])

    res.json({
      success: true,
      data: {
        period,
        overview: stats[0] || {
          totalSubscriptions: 0,
          totalRevenue: 0,
          activeSubscriptions: 0,
          cancelledSubscriptions: 0,
          averageRevenue: 0,
        },
        tierBreakdown: tierStats,
      },
    })
  } catch (error) {
    console.error('Error getting subscription stats:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to get subscription statistics',
      error: error.message,
    })
  }
})

// Cancel subscription (admin)
router.post(
  '/subscriptions/:id/cancel',
  adminAuth,
  [body('reason').notEmpty().withMessage('Cancellation reason is required')],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        })
      }

      const { id } = req.params
      const { reason } = req.body

      const subscription = await VIPSubscription.findById(id)
      if (!subscription) {
        return res.status(404).json({
          success: false,
          message: 'Subscription not found',
        })
      }

      await subscription.cancel(reason)

      // Update user's VIP status
      await User.findByIdAndUpdate(subscription.userId, {
        $set: {
          'vip.level': 'free',
          'vip.isActive': false,
          'vip.expires': null,
        },
      })

      res.json({
        success: true,
        message: 'Subscription cancelled successfully',
        data: subscription.getSummary(),
      })
    } catch (error) {
      console.error('Error cancelling subscription:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to cancel subscription',
        error: error.message,
      })
    }
  }
)

// ==================== USERS MANAGEMENT ====================

// Get all users with filters and pagination
router.get('/users', adminAuth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      tier = 'all',
      status = 'all',
      location = 'all',
      memberSince = 'all',
      gender = 'all',
      ageRange = 'all',
      search = '',
      marketingChannel = 'all',
    } = req.query

    let query = {}

    // Search functionality
    if (search) {
      const searchParts = search.trim().split(/\s+/)

      if (searchParts.length === 2) {
        const [firstName, lastName] = searchParts

        query.$or = [
          {
            $and: [
              { firstName: { $regex: firstName, $options: 'i' } },
              { lastName: { $regex: lastName, $options: 'i' } },
            ],
          },
          { email: { $regex: search, $options: 'i' } },
          { mobile: { $regex: search, $options: 'i' } },
        ]
      } else {
        query.$or = [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { mobile: { $regex: search, $options: 'i' } },
        ]
      }
    }

    // Tier filter
    if (tier !== 'all') {
      query['vip.level'] = tier
    }

    // Status filter
    if (status !== 'all') {
      if (status === 'Active') {
        query['profile.status'] = 'active'
      } else if (status === 'Inactive') {
        query['profile.status'] = 'inactive'
      } else if (status === 'Paused') {
        query['profile.status'] = 'paused'
      } else if (status === 'Suspended') {
        query['profile.status'] = 'suspended'
      }
    }

    // Gender filter
    if (gender !== 'all') {
      query['onboarding.gender'] = gender.toLowerCase()
    }

    // Age range filter
    if (ageRange !== 'all') {
      query['onboarding.ageRange'] = ageRange.replace('–', '-')
    }

    // Location filter (based on country)
    if (location !== 'all') {
      // Country name to code mapping (reverse of locations endpoint)
      const countryNameToCode = {
        India: 'IN',
        'United States': 'US',
        'United Kingdom': 'GB',
        Canada: 'CA',
        Australia: 'AU',
        Germany: 'DE',
        France: 'FR',
        Italy: 'IT',
        Spain: 'ES',
        Brazil: 'BR',
        Mexico: 'MX',
        Japan: 'JP',
        China: 'CN',
        'South Korea': 'KR',
        Singapore: 'SG',
        'United Arab Emirates': 'AE',
        'Saudi Arabia': 'SA',
        'South Africa': 'ZA',
        'New Zealand': 'NZ',
        Netherlands: 'NL',
      }

      // Get country code if searching by full name
      const countryCode = countryNameToCode[location] || null

      // Build country filter - search only in location.current.country
      const countryOrConditions = [
        { 'location.current.country': { $regex: location, $options: 'i' } },
      ]

      // If we have a country code, also search for it
      if (countryCode) {
        countryOrConditions.push(
          { 'location.current.country': { $regex: countryCode, $options: 'i' } }
        )
      }

      const countryFilter = { $or: countryOrConditions }

      // If there's already an $or condition (from search), merge them
      if (query.$or && query.$or.length > 0) {
        query.$and = query.$and || []
        query.$and.push({ $or: query.$or })
        query.$and.push(countryFilter)
        delete query.$or
      } else {
        query.$or = countryOrConditions
      }
    }

    // Member since filter
    if (memberSince !== 'all') {
      const now = new Date()
      let dateFilter = {}

      switch (memberSince) {
        case 'Last 30 days':
          dateFilter = {
            $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
          }
          break
        case 'Last 3 months':
          dateFilter = {
            $gte: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
          }
          break
        case 'Last 6 months':
          dateFilter = {
            $gte: new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000),
          }
          break
        case 'Last year':
          dateFilter = {
            $gte: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
          }
          break
        case 'More than a year':
          dateFilter = {
            $lt: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
          }
          break
      }

      if (Object.keys(dateFilter).length > 0) {
        query.createdAt = dateFilter
      }
    }

    // Marketing Channel filter (from Adjust attribution data)
    if (marketingChannel !== 'all') {
      // Need to join with AdjustCallback collection to filter by marketing channel
      const AdjustCallback = require('../models/AdjustCallback')
      
      // Find user IDs that have the specified marketing channel
      const adjustCallbacks = await AdjustCallback.find({
        activityKind: 'install',
        network: marketingChannel
      }).distinct('userId')
      
      // Add to query - users must be in the list of user IDs with this marketing channel
      if (adjustCallbacks.length > 0) {
        query._id = { $in: adjustCallbacks }
      } else {
        // No users found with this marketing channel, return empty result
        query._id = { $in: [] }
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit)

    const users = await User.find(query)
      .select(
        'firstName lastName email mobile vip profile onboarding location createdAt lastActive'
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))

    const total = await User.countDocuments(query)

    // Transform users to match frontend format
    const transformedUsers = users.map((user) => {
      const vip = user.vip || { level: 'free' }
      const profile = user.profile || { status: 'active', avatar: '' }
      const onboarding = user.onboarding || {}
      const locCurrent =
        user.location && user.location.current ? user.location.current : {}
      const firstName = user.firstName || ''
      const lastName = user.lastName || ''
      const fullName = `${firstName} ${lastName}`.trim() || 'N/A'
      const tierLevel = vip.level || 'free'
      const tier = tierLevel.charAt(0).toUpperCase() + tierLevel.slice(1)
      const statusVal = profile.status || 'active'
      const status = statusVal.charAt(0).toUpperCase() + statusVal.slice(1)
      const gender = onboarding.gender
        ? onboarding.gender.charAt(0).toUpperCase() + onboarding.gender.slice(1)
        : 'N/A'
      const ageRange = onboarding.ageRange || 'N/A'

      // Determine location - check multiple sources
      let location = 'N/A'
      if (
        locCurrent.city &&
        locCurrent.country &&
        locCurrent.city.trim() &&
        locCurrent.country.trim()
      ) {
        location = `${locCurrent.city}, ${locCurrent.country}`
      } else if (
        user.signup &&
        user.signup.city &&
        user.signup.country &&
        user.signup.city.trim() &&
        user.signup.country.trim()
      ) {
        // Fallback to signup location if current location is not available
        location = `${user.signup.city}, ${user.signup.country}`
      } else if (locCurrent.country && locCurrent.country.trim()) {
        // If only country is available
        location = locCurrent.country
      } else if (
        user.signup &&
        user.signup.country &&
        user.signup.country.trim()
      ) {
        // Fallback to signup country
        location = user.signup.country
      } else if (locCurrent.latitude && locCurrent.longitude) {
        // If GPS coordinates are available but no city/country
        location = `${locCurrent.latitude.toFixed(
          2
        )}, ${locCurrent.longitude.toFixed(2)}`
      }

      // Generate user ID from MongoDB ObjectId
      const userId = `ID${user._id.toString().slice(-6).toUpperCase()}`

      return {
        id: user._id,
        userId,
        name: fullName,
        tier,
        tierIcon: getTierIcon(tier),
        tierBg: getTierBg(tier),
        tierBorder: getTierBorder(tier),
        tierColor: getTierColor(tier),
        email: user.email || 'N/A',
        phone: user.mobile || 'N/A',
        gender,
        age: ageRange,
        location,
        status,
        statusBg: getStatusBg(status),
        statusColor: getStatusColor(status),
        avatar:
          profile.avatar || 'https://c.animaapp.com/t66hdvJZ/img/avatar.svg',
        createdAt: user.createdAt,
        lastActive: user.lastActive || user.createdAt,
        social: user.social || {},
        isGoogleUser: !!(user.social && user.social.googleId),
        socialProvider: user.social?.provider || null,
      }
    })

    res.json({
      success: true,
      data: {
        users: transformedUsers,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit),
        },
      },
    })
  } catch (error) {
    console.error('Error getting users:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to get users',
      error: error.message,
    })
  }
})

// Get VIP users (must come before /users/:id route)
router.get('/users/vip', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, tier = 'all' } = req.query

    let query = { 'vip.isActive': true }

    if (tier !== 'all') {
      query['vip.level'] = tier
    }

    const skip = (parseInt(page) - 1) * parseInt(limit)

    const users = await User.find(query)
      .select('firstName lastName email mobile vip createdAt')
      .sort({ 'vip.expires': -1 })
      .skip(skip)
      .limit(parseInt(limit))

    const total = await User.countDocuments(query)

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit),
        },
      },
    })
  } catch (error) {
    console.error('Error getting VIP users:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to get VIP users',
      error: error.message,
    })
  }
})

// Export users data (must come before /users/:id route)
router.get('/users/export', adminAuth, async (req, res) => {
  try {
    const {
      format = 'csv',
      tier = 'all',
      status = 'all',
      location = 'all',
      memberSince = 'all',
      gender = 'all',
      ageRange = 'all',
      search = '',
    } = req.query

    // Build the same query as the main /users endpoint
    let query = {}

    // Search functionality
    if (search) {
      const searchParts = search.trim().split(/\s+/)

      if (searchParts.length === 2) {
        const [firstName, lastName] = searchParts

        query.$or = [
          {
            $and: [
              { firstName: { $regex: firstName, $options: 'i' } },
              { lastName: { $regex: lastName, $options: 'i' } },
            ],
          },
          { email: { $regex: search, $options: 'i' } },
          { mobile: { $regex: search, $options: 'i' } },
        ]
      } else {
        query.$or = [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { mobile: { $regex: search, $options: 'i' } },
        ]
      }
    }

    // Tier filter
    if (tier !== 'all') {
      query['vip.level'] = tier
    }

    // Status filter
    if (status !== 'all') {
      if (status === 'Active') {
        query['profile.status'] = 'active'
      } else if (status === 'Inactive') {
        query['profile.status'] = 'inactive'
      } else if (status === 'Paused') {
        query['profile.status'] = 'paused'
      } else if (status === 'Suspended') {
        query['profile.status'] = 'suspended'
      }
    }

    // Gender filter
    if (gender !== 'all') {
      query['onboarding.gender'] = gender.toLowerCase()
    }

    // Age range filter
    if (ageRange !== 'all') {
      query['onboarding.ageRange'] = ageRange.replace('–', '-')
    }

    // Location filter (based on country)
    if (location !== 'all') {
      // Country name to code mapping (same as main endpoint)
      const countryNameToCode = {
        India: 'IN',
        'United States': 'US',
        'United Kingdom': 'GB',
        Canada: 'CA',
        Australia: 'AU',
        Germany: 'DE',
        France: 'FR',
        Italy: 'IT',
        Spain: 'ES',
        Brazil: 'BR',
        Mexico: 'MX',
        Japan: 'JP',
        China: 'CN',
        'South Korea': 'KR',
        Singapore: 'SG',
        'United Arab Emirates': 'AE',
        'Saudi Arabia': 'SA',
        'South Africa': 'ZA',
        'New Zealand': 'NZ',
        Netherlands: 'NL',
      }

      const countryCode = countryNameToCode[location] || null

      const countryOrConditions = [
        { 'location.current.country': { $regex: location, $options: 'i' } },
      ]

      if (countryCode) {
        countryOrConditions.push({
          'location.current.country': { $regex: countryCode, $options: 'i' },
        })
      }

      if (query.$or && query.$or.length > 0) {
        query.$and = query.$and || []
        query.$and.push({ $or: query.$or })
        query.$and.push({ $or: countryOrConditions })
        delete query.$or
      } else {
        query.$or = countryOrConditions
      }
    }

    // Member since filter
    if (memberSince !== 'all') {
      const now = new Date()
      let dateFilter = {}

      switch (memberSince) {
        case 'Last 30 days':
          dateFilter = {
            $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
          }
          break
        case 'Last 3 months':
          dateFilter = {
            $gte: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
          }
          break
        case 'Last 6 months':
          dateFilter = {
            $gte: new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000),
          }
          break
        case 'Last year':
          dateFilter = {
            $gte: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
          }
          break
        case 'More than a year':
          dateFilter = {
            $lt: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
          }
          break
      }

      if (Object.keys(dateFilter).length > 0) {
        query.createdAt = dateFilter
      }
    }

    const users = await User.find(query)
      .select(
        'firstName lastName email mobile vip profile onboarding location createdAt'
      )
      .sort({ createdAt: -1 })

    if (format === 'csv') {
      // Generate CSV data
      const csvHeaders =
        'User ID,Name,Email,Phone,Gender,Age Range,Location,Tier,Status,Member Since\n'
      const csvData = users
        .map((user) => {
          const userId = `ID${user._id.toString().slice(-6).toUpperCase()}`
          const fullName = `${user.firstName} ${user.lastName}`
          const tier =
            user.vip.level.charAt(0).toUpperCase() + user.vip.level.slice(1)
          const status =
            user.profile.status.charAt(0).toUpperCase() +
            user.profile.status.slice(1)
          const gender = user.onboarding.gender
            ? user.onboarding.gender.charAt(0).toUpperCase() +
              user.onboarding.gender.slice(1)
            : 'N/A'
          const ageRange = user.onboarding.ageRange || 'N/A'
          const location =
            user.location.current.city && user.location.current.country
              ? `${user.location.current.city}, ${user.location.current.country}`
              : 'N/A'
          const memberSince = user.createdAt.toISOString().split('T')[0]

          return `${userId},"${fullName}",${user.email || 'N/A'},${
            user.mobile || 'N/A'
          },${gender},${ageRange},"${location}",${tier},${status},${memberSince}`
        })
        .join('\n')

      const csvContent = csvHeaders + csvData

      res.setHeader('Content-Type', 'text/csv')
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=users-export-${
          new Date().toISOString().split('T')[0]
        }.csv`
      )
      res.send(csvContent)
    } else {
      // Return JSON format
      res.json({
        success: true,
        data: users,
        exportedAt: new Date(),
        totalUsers: users.length,
      })
    }
  } catch (error) {
    console.error('Error exporting users:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to export users',
      error: error.message,
    })
  }
})

// Get all unique locations from users (must come before /users/:id route)
router.get('/users/locations', adminAuth, async (req, res) => {
  try {
    // Aggregate unique countries from all users
    const locations = await User.aggregate([
      {
        $project: {
          country: {
            $cond: [
              { $ifNull: ['$location.current.country', false] },
              '$location.current.country',
              '$signup.country',
            ],
          },
        },
      },
      {
        $match: {
          country: { $ne: null, $ne: '', $ne: 'Unknown' },
        },
      },
      {
        $group: {
          _id: '$country',
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          location: '$_id',
          country: '$_id',
          count: 1,
        },
      },
      {
        $sort: { count: -1, location: 1 },
      },
    ])

    // Post-process to merge country codes with full country names (e.g., "IN" and "India")
    const countryMap = new Map()

    // Country code to full name mapping
    const countryMapping = {
      IN: 'India',
      US: 'United States',
      GB: 'United Kingdom',
      CA: 'Canada',
      AU: 'Australia',
      DE: 'Germany',
      FR: 'France',
      IT: 'Italy',
      ES: 'Spain',
      BR: 'Brazil',
      MX: 'Mexico',
      JP: 'Japan',
      CN: 'China',
      KR: 'South Korea',
      SG: 'Singapore',
      AE: 'United Arab Emirates',
      SA: 'Saudi Arabia',
      ZA: 'South Africa',
      NZ: 'New Zealand',
      NL: 'Netherlands',
    }

    locations.forEach((loc) => {
      const country = loc.country || ''

      // Determine the full country name
      let fullCountryName = country
      let normalizedKey = country.toUpperCase()

      // If it's a 2-letter code, try to find the full name
      if (country.length === 2) {
        fullCountryName = countryMapping[country.toUpperCase()] || country
        normalizedKey = country.toUpperCase()
      } else {
        // If it's a full name, check if we already have it
        const codeEntry = Object.entries(countryMapping).find(
          ([code, name]) => name.toLowerCase() === country.toLowerCase()
        )
        if (codeEntry) {
          normalizedKey = codeEntry[0]
          fullCountryName = codeEntry[1]
        }
      }

      if (countryMap.has(normalizedKey)) {
        // Merge counts for duplicate countries
        const existing = countryMap.get(normalizedKey)
        existing.count += loc.count
      } else {
        countryMap.set(normalizedKey, {
          location: fullCountryName,
          count: loc.count,
        })
      }
    })

    // Convert map back to array and sort
    const mergedLocations = Array.from(countryMap.values())
      .sort((a, b) => b.count - a.count || a.location.localeCompare(b.location))

    res.json({
      success: true,
      data: {
        locations: mergedLocations,
        totalLocations: mergedLocations.length,
      },
    })
  } catch (error) {
    console.error('Error getting unique locations:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to get unique locations',
      error: error.message,
    })
  }
})

// Get all unique marketing channels from Adjust callbacks (must come before /users/:id route)
router.get('/users/marketing-channels', adminAuth, async (req, res) => {
  try {
    const AdjustCallback = require('../models/AdjustCallback')
    
    // Aggregate unique marketing channels (network field) from install callbacks
    const channels = await AdjustCallback.aggregate([
      {
        $match: {
          activityKind: 'install',
          network: { $ne: null, $ne: '', $exists: true }
        }
      },
      {
        $group: {
          _id: '$network',
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          channel: '$_id',
          count: 1
        }
      },
      {
        $sort: { count: -1, channel: 1 }
      }
    ])

    // Extract just the channel names for the dropdown
    const channelNames = channels.map(c => c.channel)

    res.json({
      success: true,
      data: {
        channels: channelNames,
        totalChannels: channelNames.length,
        details: channels // Include counts for potential future use
      }
    })
  } catch (error) {
    console.error('Error getting unique marketing channels:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to get unique marketing channels',
      error: error.message,
    })
  }
})

// Get single user details
router.get('/users/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params

    const user = await User.findById(id)
      .populate('wallet.transactions')
      .populate('games')
      .populate('tasks')
      .populate('surveys')

    // Get challenge-related data
    const [
      challengeProgress,
      completedChallenges,
      streakData,
      bonusDaysClaimed,
    ] = await Promise.all([
      // Get user's challenge progress
      UserChallengeProgress.find({ userId: id })
        .populate('challengeId', 'title type coinReward xpReward challengeDate')
        .sort({ challengeDate: -1 })
        .limit(50),

      // Get completed challenges count
      UserChallengeProgress.countDocuments({ userId: id, status: 'completed' }),

      // Get current streak info from user
      Promise.resolve({
        current: user.xp?.streak || user.streak?.current || 0,
        lastUpdated: user.streak?.lastUpdated || null,
        completedTasks: user.streak?.completedTasks || [],
      }),

      // Get bonus days claimed (if tracked)
      Promise.resolve(0), // TODO: Implement bonus day tracking if needed
    ])

    // Fetch latest downloaded games count from Besitos
    let downloadedGamesCount = user.games?.length || 0
    try {
      const besitosResponse = await besitosService.getUserData(id)
      const besitosData = besitosResponse.data || besitosResponse
      // Calculate total downloaded games from in_progress and completed arrays
      const inProgressCount = besitosData.in_progress?.length || 0
      const completedCount = besitosData.completed?.length || 0
      downloadedGamesCount = inProgressCount + completedCount
    } catch (error) {
      console.warn(
        'Failed to fetch Besitos user data for admin:',
        error.message
      )
      // Fall back to local games count
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      })
    }

    // Transform user data to match frontend format
    const safeVip = user.vip || { level: 'free' }
    const safeProfile = user.profile || {
      status: 'active',
      avatar: '',
      notifications: true,
    }
    // Ensure notifications is properly read from user.profile (default to true if not set)
    if (user.profile) {
      safeProfile.notifications =
        user.profile.notifications !== undefined
          ? user.profile.notifications
          : true
    }
    const safeOnboarding = user.onboarding || {}
    const safeWallet = user.wallet || { balance: 0 }
    const safeXp = user.xp || { current: 0, tier: 1, total: 0 }
    const safeLocation =
      user.location && user.location.current ? user.location.current : {}
    const safeGames = Array.isArray(user.games) ? user.games : []
    const safeTasks = Array.isArray(user.tasks) ? user.tasks : []
    const safeSurveys = Array.isArray(user.surveys) ? user.surveys : []
    const safeDevice = user.device || {
      type: 'Unknown',
      model: 'Unknown',
      os: 'Unknown',
    }
    const safeRedemption = user.redemption || { preference: 'none', count: 0 }
    const safeAnalytics = user.analytics || {}

    const fullName =
      `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'N/A'
    const tierText = safeVip.level || 'free'
    const statusText = safeProfile.status || 'active'

    // Compute derived fields
    const mostPlayedGame =
      safeGames.length > 0
        ? safeGames.reduce(
            (max, g) => ((g.playCount || 0) > (max.playCount || 0) ? g : max),
            safeGames[0]
          )
        : null
    const lastGamePlayed =
      safeGames.length > 0
        ? safeGames.reduce((latest, g) => {
            if (!g.lastPlayed) return latest
            if (!latest || !latest.lastPlayed) return g
            return new Date(g.lastPlayed) > new Date(latest.lastPlayed)
              ? g
              : latest
          }, null)
        : null
    const lastTaskCompleted =
      safeTasks.length > 0
        ? safeTasks
            .filter((t) => t.completed)
            .reduce((latest, t) => {
              if (!t.date) return latest
              if (!latest || !latest.date) return t
              return new Date(t.date) > new Date(latest.date) ? t : latest
            }, null)
        : null

    // Compute preferred game category from onboarding
    const preferredCategory =
      safeOnboarding.gamePreferences &&
      safeOnboarding.gamePreferences.length > 0
        ? safeOnboarding.gamePreferences[0]
        : 'N/A'

    // Compute challenge-related fields
    const lastChallengeCompleted = challengeProgress.find(
      (cp) => cp.status === 'completed'
    )
    const challengesInProgress = challengeProgress.filter(
      (cp) => cp.status === 'in_progress'
    ).length
    const totalChallengesCompleted = completedChallenges
    const currentStreak = streakData.current
    const streakLastUpdated = streakData.lastUpdated

    // Calculate challenge success rate
    const totalChallengeAttempts = challengeProgress.length
    const challengeSuccessRate =
      totalChallengeAttempts > 0
        ? Math.round((totalChallengesCompleted / totalChallengeAttempts) * 100)
        : 0

    // Calculate age from dateOfBirth if available, otherwise use ageRange
    let ageValue = 'N/A'

    if (user.dateOfBirth) {
      try {
        const today = new Date()
        const birthDate = new Date(user.dateOfBirth)

        if (!isNaN(birthDate.getTime())) {
          let age = today.getFullYear() - birthDate.getFullYear()
          const monthDiff = today.getMonth() - birthDate.getMonth()
          if (
            monthDiff < 0 ||
            (monthDiff === 0 && today.getDate() < birthDate.getDate())
          ) {
            age--
          }

          // Convert to age range format
          if (age >= 13 && age <= 17) ageValue = '13-17'
          else if (age >= 18 && age <= 24) ageValue = '18-24'
          else if (age >= 25 && age <= 34) ageValue = '25-34'
          else if (age >= 35 && age <= 44) ageValue = '35-44'
          else if (age >= 45 && age <= 54) ageValue = '45-54'
          else if (age >= 55 && age <= 64) ageValue = '55-64'
          else if (age >= 65) ageValue = '65+'
          else ageValue = 'N/A'
        }
      } catch (error) {
        console.error('Error calculating age from dateOfBirth:', error)
      }
    }

    // Fallback to ageRange from onboarding if dateOfBirth not available or calculation failed
    if (
      ageValue === 'N/A' &&
      safeOnboarding.ageRange &&
      safeOnboarding.ageRange !== 'N/A'
    ) {
      ageValue = safeOnboarding.ageRange
    }

    // Fetch redemption history from PayoutRequest
    let redemptionHistory = []
    try {
      const PayoutRequest = require('../models/PayoutRequest')
      const payouts = await PayoutRequest.find({
        userId: user._id,
        status: { $in: ['completed', 'approved'] },
      })
        .select(
          'coinsDeducted createdAt approvedAt payment reward status tremendousOrderId metadata'
        )
        .sort({ createdAt: -1 })
        .limit(50)
        .lean()

      redemptionHistory = payouts.map((payout) => ({
        id: payout._id.toString(),
        redemptionId:
          payout.metadata?.externalId || payout._id.toString().slice(-8),
        amount:
          payout.payment?.amount || payout.reward?.value?.denomination || 0,
        currency:
          payout.payment?.currency ||
          payout.reward?.value?.currency_code ||
          'USD',
        coinsDeducted: payout.coinsDeducted || 0,
        method: payout.reward?.delivery?.method || 'N/A',
        status: payout.status,
        createdAt: payout.createdAt,
        approvedAt: payout.approvedAt,
        tremendousOrderId: payout.tremendousOrderId || null,
      }))
    } catch (error) {
      console.error('Error fetching redemption history:', error)
    }

    // Calculate spin count - ALWAYS use SpinWheelLog as source of truth so Activity Summary is never stale
    let spinCount = 0
    let lastSpinAt = null
    try {
      const SpinWheelLog = require('../models/SpinWheelLog')
      spinCount = await SpinWheelLog.countDocuments({ user: user._id })
      if (spinCount > 0) {
        const lastSpin = await SpinWheelLog.findOne({ user: user._id })
          .sort({ createdAt: -1 })
          .select('createdAt')
          .lean()
        if (lastSpin) lastSpinAt = lastSpin.createdAt
      }
      // Keep user document in sync for other code paths (async, don't wait)
      if (spinCount !== (typeof user.spinCount === 'number' ? user.spinCount : 0) || (spinCount > 0 && !user.lastSpinAt)) {
        User.findByIdAndUpdate(user._id, {
          $set: {
            spinCount,
            ...(lastSpinAt && { lastSpinAt }),
          },
        }).catch((err) => console.error('Error syncing user spinCount/lastSpinAt:', err))
      }
    } catch (error) {
      console.error('Error calculating spin count from SpinWheelLog:', error)
      spinCount = typeof user.spinCount === 'number' ? user.spinCount : 0
      lastSpinAt = user.lastSpinAt || null
    }

    // Calculate redemption count - ALWAYS use Transaction + PayoutRequest as source of truth so Activity Summary is never stale
    let redemptionCount = 0
    let totalCoinsRedeemed = 0
    let lastRedeemedAt = null
    try {
      const PayoutRequest = require('../models/PayoutRequest')
      // 1) Transaction redemptions (in-house / approval flow)
      const txRedemptions = await Transaction.find({
        user: user._id,
        type: 'redemption',
        status: 'completed',
      })
        .select('amount createdAt')
        .sort({ createdAt: -1 })
        .lean()
      const txCount = txRedemptions.length
      const txCoins = txRedemptions.reduce((sum, t) => sum + (t.amount || 0), 0)
      const txLast = txRedemptions[0] ? txRedemptions[0].createdAt : null

      // 2) PayoutRequest redemptions (Tremendous / payouts)
      const completedPayouts = await PayoutRequest.find({
        userId: user._id,
        status: { $in: ['completed', 'approved'] },
      })
        .select('coinsDeducted createdAt approvedAt')
        .lean()
      const payoutCount = completedPayouts.length
      const payoutCoins = completedPayouts.reduce(
        (sum, p) => sum + (p.coinsDeducted || 0),
        0
      )
      const payoutLast =
        completedPayouts.length > 0
          ? completedPayouts.sort((a, b) => {
              const dateA = a.approvedAt || a.createdAt
              const dateB = b.approvedAt || b.createdAt
              return new Date(dateB) - new Date(dateA)
            })[0]
          : null
      const lastPayoutDate = payoutLast
        ? payoutLast.approvedAt || payoutLast.createdAt
        : null

      redemptionCount = txCount + payoutCount
      totalCoinsRedeemed = txCoins + payoutCoins
      if (txLast && lastPayoutDate) {
        lastRedeemedAt = new Date(txLast) > new Date(lastPayoutDate) ? txLast : lastPayoutDate
      } else {
        lastRedeemedAt = txLast || lastPayoutDate
      }

      // Keep user.redemption in sync for other code paths (async, don't wait)
      if (redemptionCount > 0) {
        User.findByIdAndUpdate(user._id, {
          $set: {
            'redemption.count': redemptionCount,
            'redemption.totalCoinsRedeemed': totalCoinsRedeemed,
            'redemption.lastRedeemedAt': lastRedeemedAt,
          },
        }).catch((err) =>
          console.error('Error syncing user redemption count:', err)
        )
      }
    } catch (error) {
      console.error('Error calculating redemption from Transaction/PayoutRequest:', error)
      redemptionCount = typeof safeRedemption.count === 'number' ? safeRedemption.count : 0
      totalCoinsRedeemed =
        typeof safeRedemption.totalCoinsRedeemed === 'number'
          ? safeRedemption.totalCoinsRedeemed
          : 0
      lastRedeemedAt = safeRedemption.lastRedeemedAt || null
    }

    // Fetch Adjust attribution data from AdjustCallback
    let adjustAttribution = {
      clickId: null,
      transactionId: null,
      marketingChannel: null,
      campaign: null,
      adgroup: null,
      creative: null,
      network: null,
      trackerName: null,
      clickTime: null,
      installTime: null,
    }
    try {
      const AdjustCallback = require('../models/AdjustCallback')
      // Find the install callback for this user (most reliable source)
      const installCallback = await AdjustCallback.findOne({
        userId: user._id,
        activityKind: 'install',
      })
        .sort({ createdAt: -1 })
        .select('clickLabel trackerToken network campaign adgroup creative trackerName clickTime installTime')
        .lean()

      if (installCallback) {
        adjustAttribution = {
          clickId: installCallback.clickLabel || null,
          transactionId: installCallback.trackerToken || null,
          marketingChannel: installCallback.network || null,
          campaign: installCallback.campaign || null,
          adgroup: installCallback.adgroup || null,
          creative: installCallback.creative || null,
          network: installCallback.network || null,
          trackerName: installCallback.trackerName || null,
          clickTime: installCallback.clickTime || null,
          installTime: installCallback.installTime || null,
        }
      } else {
        // Fallback: try to find any callback for this user
        const anyCallback = await AdjustCallback.findOne({
          userId: user._id,
        })
          .sort({ createdAt: -1 })
          .select('clickLabel trackerToken network campaign adgroup creative trackerName clickTime installTime')
          .lean()

        if (anyCallback) {
          adjustAttribution = {
            clickId: anyCallback.clickLabel || null,
            transactionId: anyCallback.trackerToken || null,
            marketingChannel: anyCallback.network || null,
            campaign: anyCallback.campaign || null,
            adgroup: anyCallback.adgroup || null,
            creative: anyCallback.creative || null,
            network: anyCallback.network || null,
            trackerName: anyCallback.trackerName || null,
            clickTime: anyCallback.clickTime || null,
            installTime: anyCallback.installTime || null,
          }
        }
      }
    } catch (error) {
      console.error('Error fetching Adjust attribution data:', error)
    }

    const transformedUser = {
      // === Profile Tab ===
      id: user._id,
      userId: `ID${user._id.toString().slice(-6).toUpperCase()}`,
      name: fullName,
      tier: tierText.charAt(0).toUpperCase() + tierText.slice(1),
      email: user.email || 'N/A',
      phone: user.mobile || 'N/A',
      gender: safeOnboarding.gender
        ? safeOnboarding.gender.charAt(0).toUpperCase() +
          safeOnboarding.gender.slice(1)
        : 'N/A',
      age: ageValue,
      registrationDate: user.createdAt,
      country:
        safeLocation.country && safeLocation.country.trim()
          ? safeLocation.country
          : user.signup && user.signup.country && user.signup.country.trim()
          ? user.signup.country
          : 'N/A',
      signupCountry:
        user.signup && user.signup.country && user.signup.country.trim()
          ? user.signup.country
          : 'N/A',
      appVersion: user.appVersion || 'N/A',
      accountStatus: statusText.charAt(0).toUpperCase() + statusText.slice(1),
      faceVerification:
        user.biometric?.faceVerification?.verified === true
          ? 'Verified'
          : 'Not Verified',
      deviceType:
        `${safeDevice.type} - ${safeDevice.model}` !== 'Unknown - Unknown'
          ? `${safeDevice.type} - ${safeDevice.model}`
          : 'N/A',
      deviceOS: safeDevice.os || 'N/A',
      lastActive: user.lastActive || user.createdAt,
      ipAddress: safeLocation.ip || (user.signup && user.signup.ip) || 'N/A',
      location: (() => {
        // Determine location - check multiple sources with trimming
        if (
          safeLocation.city &&
          safeLocation.country &&
          safeLocation.city.trim() &&
          safeLocation.country.trim()
        ) {
          return `${safeLocation.city}, ${safeLocation.country}`
        } else if (
          user.signup &&
          user.signup.city &&
          user.signup.country &&
          user.signup.city.trim() &&
          user.signup.country.trim()
        ) {
          return `${user.signup.city}, ${user.signup.country}`
        } else if (safeLocation.country && safeLocation.country.trim()) {
          return safeLocation.country
        } else if (
          user.signup &&
          user.signup.country &&
          user.signup.country.trim()
        ) {
          return user.signup.country
        } else if (safeLocation.latitude && safeLocation.longitude) {
          return `${safeLocation.latitude.toFixed(
            2
          )}, ${safeLocation.longitude.toFixed(2)}`
        }
        return 'N/A'
      })(),

      // === Balance & Tier Tab ===
      xp: typeof safeXp.current === 'number' ? safeXp.current : 0,
      coinBalance:
        typeof safeWallet.balance === 'number' ? safeWallet.balance : 0,
      xpTier: typeof safeXp.tier === 'number' ? safeXp.tier : 1,
      redemptionPreference: (safeRedemption.preference || 'none').toUpperCase(),
      mostPlayedGame: mostPlayedGame ? mostPlayedGame.gameId || 'N/A' : 'N/A',
      lastGamePlayed: lastGamePlayed ? lastGamePlayed.gameId || 'N/A' : 'N/A',
      totalGamesDownloaded: downloadedGamesCount,
      avgSessionDuration:
        typeof safeAnalytics.avgSessionDuration === 'number'
          ? `${safeAnalytics.avgSessionDuration} min`
          : 'N/A',
      primaryEarningSource: safeAnalytics.primaryEarningSource || 'N/A',
      preferredGameCategory: preferredCategory,
      onboardingGoal:
        safeOnboarding.primaryGoal || safeOnboarding.improvementArea || 'N/A',
      notificationSettings: safeProfile.notifications ? 'Enabled' : 'Disabled',

      // === Activity Summary Tab ===
      lastLoginAt: user.lastLoginAt || null,
      loginCount: typeof user.loginCount === 'number' ? user.loginCount : 0,
      lastTaskCompleted: lastTaskCompleted
        ? lastTaskCompleted.taskId || 'N/A'
        : 'N/A',
      lastTaskCompletedDate: lastTaskCompleted ? lastTaskCompleted.date : null,
      offersRedeemed:
        typeof safeAnalytics.totalOffersRedeemed === 'number'
          ? safeAnalytics.totalOffersRedeemed
          : 0,
      lastOfferClaimed: safeAnalytics.lastOfferClaimedAt || null,
      totalCoinsEarned:
        typeof safeAnalytics.totalCoinsEarned === 'number'
          ? safeAnalytics.totalCoinsEarned
          : 0,
      totalXPEarned: typeof safeXp.total === 'number' ? safeXp.total : 0,
      dailyChallengesCompleted: totalChallengesCompleted,
      redemptionsMade: redemptionCount,
      redemptionBreakdown: {
        count: redemptionCount,
        totalCoins: totalCoinsRedeemed,
        lastRedeemed: lastRedeemedAt,
      },
      challengeProgress: {
        currentStreak: currentStreak,
        streakLastUpdated: streakLastUpdated,
        totalChallengesCompleted: totalChallengesCompleted,
        challengesInProgress: challengesInProgress,
        challengeSuccessRate: challengeSuccessRate,
        lastChallengeCompleted: lastChallengeCompleted
          ? {
              title: lastChallengeCompleted.challengeId?.title || 'N/A',
              type: lastChallengeCompleted.challengeId?.type || 'N/A',
              completedAt: lastChallengeCompleted.completedAt,
              coinsEarned: lastChallengeCompleted.rewardsEarned?.coins || 0,
              xpEarned: lastChallengeCompleted.rewardsEarned?.xp || 0,
            }
          : null,
        recentChallenges: challengeProgress.slice(0, 5).map((cp) => ({
          title: cp.challengeId?.title || 'N/A',
          type: cp.challengeId?.type || 'N/A',
          status: cp.status,
          challengeDate: cp.challengeDate,
          progress: cp.progress?.percentage || 0,
        })),
      },
      spinUsage: spinCount,
      lastSpinAt: lastSpinAt,

      // Redemption history/map
      redemptionHistory: redemptionHistory,

      // === Legacy & Full Objects ===
      status: statusText.charAt(0).toUpperCase() + statusText.slice(1),
      avatar:
        safeProfile.avatar || 'https://c.animaapp.com/t66hdvJZ/img/avatar.svg',
      memberSince: user.createdAt,
      gamesPlayed: downloadedGamesCount,
      tasksCompleted:
        safeTasks.filter((task) => task && task.completed).length || 0,
      surveysCompleted:
        safeSurveys.filter((survey) => survey && survey.completed).length || 0,
      vip: safeVip,
      wallet: safeWallet,
      onboarding: safeOnboarding,
      profile: safeProfile,

      // === Marketing Attribution (Adjust) ===
      clickId: adjustAttribution.clickId || 'N/A',
      transactionId: adjustAttribution.transactionId || 'N/A',
      marketingChannel: adjustAttribution.marketingChannel || 'N/A',
    }

    res.json({
      success: true,
      data: transformedUser,
    })
  } catch (error) {
    console.error('Error getting user details:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to get user details',
      error: error.message,
    })
  }
})

// Update user
router.put(
  '/users/:id',
  adminAuth,
  [
    body('firstName')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('First name cannot be empty'),
    body('lastName')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Last name cannot be empty'),
    body('email')
      .optional()
      .trim()
      .isEmail()
      .withMessage('Invalid email format'),
    body('mobile')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Mobile number cannot be empty'),
    body('username')
      .optional()
      .trim()
      .matches(/^[a-zA-Z0-9_]{3,20}$/)
      .withMessage(
        'Username must be 3-20 characters (letters, numbers, underscore only)'
      ),
    body('socialTag').optional().trim(),
    body('gender')
      .optional()
      .isIn(['male', 'female', 'Male', 'Female', 'other', 'N/A'])
      .withMessage('Invalid gender'),
    body('ageRange').optional().trim(),
    body('age').optional().trim(), // Alias for ageRange
    body('status')
      .optional()
      .trim()
      .isIn([
        'active',
        'inactive',
        'paused',
        'suspended',
        'Active',
        'Inactive',
        'Paused',
        'Suspended',
      ])
      .withMessage('Invalid status'),
    body('tier')
      .optional()
      .trim()
      .isIn([
        'free',
        'bronze',
        'silver',
        'gold',
        'platinum',
        'Free',
        'Bronze',
        'Silver',
        'Gold',
        'Platinum',
      ])
      .withMessage('Invalid tier'),
    body('country').optional().trim(),
    body('city').optional().trim(),
    body('phone').optional().trim(), // Alias for mobile
    body('dateOfBirth')
      .optional()
      .isISO8601()
      .withMessage('Invalid date format'),
    body('dob').optional().isISO8601().withMessage('Invalid date format'), // Alias for dateOfBirth
    body('location').optional().trim(), // Can be country or city,country format
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array().map((err) => ({
            field: err.path || err.param || err.location,
            message: err.msg,
            value: err.value,
          })),
        })
      }

      const { id } = req.params
      const updateData = req.body

      // Find user first to check uniqueness
      const existingUser = await User.findById(id)
      if (!existingUser) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        })
      }

      // Prevent email changes for Google-authenticated users
      const normalizedNewEmail = updateData.email
        ? updateData.email.toLowerCase()
        : null
      const normalizedExistingEmail = existingUser.email
        ? existingUser.email.toLowerCase()
        : null
      if (
        normalizedNewEmail &&
        normalizedNewEmail !== normalizedExistingEmail
      ) {
        // Check if user is a Google-authenticated user
        if (existingUser.social && existingUser.social.googleId) {
          return res.status(400).json({
            success: false,
            message: 'Email cannot be changed for Google-authenticated users',
            errors: [
              {
                field: 'email',
                message:
                  'Email address cannot be modified for users who signed in with Google',
              },
            ],
          })
        }
      }

      // Check email uniqueness if being updated (compare case-insensitively)
      if (
        normalizedNewEmail &&
        normalizedNewEmail !== normalizedExistingEmail
      ) {
        const emailExists = await User.findOne({
          email: normalizedNewEmail,
          _id: { $ne: id },
        })
        if (emailExists) {
          return res.status(400).json({
            success: false,
            message: 'Email already exists',
            errors: [
              { field: 'email', message: 'This email is already registered' },
            ],
          })
        }
      }

      // Check username uniqueness if being updated
      if (
        updateData.username &&
        updateData.username !== existingUser.username
      ) {
        const usernameExists = await User.findOne({
          username: updateData.username,
          _id: { $ne: id },
        })
        if (usernameExists) {
          return res.status(400).json({
            success: false,
            message: 'Username already exists',
            errors: [
              { field: 'username', message: 'This username is already taken' },
            ],
          })
        }
      }

      // Check mobile uniqueness if being updated
      const mobileField = updateData.mobile || updateData.phone
      if (mobileField && mobileField !== existingUser.mobile) {
        const mobileExists = await User.findOne({
          mobile: mobileField,
          _id: { $ne: id },
        })
        if (mobileExists) {
          return res.status(400).json({
            success: false,
            message: 'Mobile number already exists',
            errors: [
              {
                field: 'mobile',
                message: 'This mobile number is already registered',
              },
            ],
          })
        }
      }

      // Build update object - use 'in' operator to handle all fields including empty strings
      const updateFields = {}

      // Basic fields
      if ('firstName' in updateData)
        updateFields.firstName = updateData.firstName
      if ('lastName' in updateData) updateFields.lastName = updateData.lastName
      if ('email' in updateData)
        updateFields.email = updateData.email.toLowerCase()
      if ('mobile' in updateData || 'phone' in updateData)
        updateFields.mobile = mobileField
      if ('username' in updateData)
        updateFields.username = updateData.username || undefined
      if ('socialTag' in updateData)
        updateFields.socialTag = updateData.socialTag

      // Date of birth - store as dateOfBirth field (will be added to model if needed)
      if ('dateOfBirth' in updateData || 'dob' in updateData) {
        const dobValue = updateData.dateOfBirth || updateData.dob
        if (dobValue && dobValue !== 'dd/mm/yyyy') {
          try {
            const dobDate = new Date(dobValue)
            if (!isNaN(dobDate.getTime())) {
              updateFields.dateOfBirth = dobDate

              // Also calculate and update ageRange if possible
              const today = new Date()
              const age = today.getFullYear() - dobDate.getFullYear()
              const monthDiff = today.getMonth() - dobDate.getMonth()

              if (
                monthDiff < 0 ||
                (monthDiff === 0 && today.getDate() < dobDate.getDate())
              ) {
                age--
              }

              let ageRange = 'N/A'
              if (age >= 13 && age <= 17) ageRange = '13-17'
              else if (age >= 18 && age <= 24) ageRange = '18-24'
              else if (age >= 25 && age <= 34) ageRange = '25-34'
              else if (age >= 35 && age <= 44) ageRange = '35-44'
              else if (age >= 45 && age <= 54) ageRange = '45-54'
              else if (age >= 55 && age <= 64) ageRange = '55-64'
              else if (age >= 65) ageRange = '65+'

              updateFields['onboarding.ageRange'] = ageRange
            }
          } catch (error) {
            console.warn('Invalid date of birth format:', dobValue)
          }
        }
      }

      // Nested onboarding fields
      if ('gender' in updateData) {
        const genderValue =
          updateData.gender === 'N/A'
            ? undefined
            : updateData.gender.toLowerCase()
        updateFields['onboarding.gender'] = genderValue
      }
      if ('ageRange' in updateData || 'age' in updateData) {
        const ageValue = updateData.ageRange || updateData.age
        updateFields['onboarding.ageRange'] =
          ageValue === 'N/A' ? undefined : ageValue
      }

      // Profile fields
      if ('status' in updateData) {
        const statusValue = updateData.status.toLowerCase()
        updateFields['profile.status'] = statusValue
      }

      // VIP tier
      if ('tier' in updateData) {
        const tierValue = updateData.tier.toLowerCase()
        updateFields['vip.level'] = tierValue
      }

      // Location fields
      if ('country' in updateData) {
        updateFields['location.current.country'] = updateData.country
      }
      if ('city' in updateData) {
        updateFields['location.current.city'] = updateData.city
      }

      // Handle location field (can be "country" or "city, country" format)
      if ('location' in updateData) {
        const locationValue = updateData.location
        if (locationValue && locationValue !== 'Select location') {
          // Check if it contains a comma (city, country format)
          if (locationValue.includes(',')) {
            const [city, country] = locationValue
              .split(',')
              .map((s) => s.trim())
            updateFields['location.current.city'] = city
            updateFields['location.current.country'] = country
          } else {
            // Just country
            updateFields['location.current.country'] = locationValue
          }
        }
      }

      // Update timestamp
      updateFields.updatedAt = new Date()

      const user = await User.findByIdAndUpdate(
        id,
        { $set: updateFields },
        { new: true, runValidators: false } // Disable validators to allow flexible updates
      )

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        })
      }

      res.json({
        success: true,
        message: 'User updated successfully',
        data: user,
      })
    } catch (error) {
      console.error('Error updating user:', error)

      // Handle MongoDB duplicate key errors
      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0]
        return res.status(400).json({
          success: false,
          message: `${
            field.charAt(0).toUpperCase() + field.slice(1)
          } already exists`,
          errors: [{ field, message: `This ${field} is already registered` }],
        })
      }

      res.status(500).json({
        success: false,
        message: 'Failed to update user',
        error: error.message,
      })
    }
  }
)

// Update user status (suspend/activate)
router.patch(
  '/users/:id/status',
  adminAuth,
  [
    body('status')
      .isIn(['active', 'inactive', 'paused', 'suspended'])
      .withMessage('Invalid status'),
    body('reason').optional().isString().withMessage('Reason must be a string'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        })
      }

      const { id } = req.params
      const { status, reason } = req.body

      const user = await User.findByIdAndUpdate(
        id,
        {
          'profile.status': status,
          'profile.statusReason': reason,
          'profile.statusUpdatedAt': new Date(),
        },
        { new: true }
      )

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        })
      }

      const statusText = status.charAt(0).toUpperCase() + status.slice(1)

      res.json({
        success: true,
        message: `User ${statusText.toLowerCase()}d successfully`,
        data: {
          id: user._id,
          status: statusText,
          reason,
        },
      })
    } catch (error) {
      console.error('Error updating user status:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to update user status',
        error: error.message,
      })
    }
  }
)

// Suspend user (dedicated endpoint)
router.patch(
  '/users/:id/suspend',
  adminAuth,
  [body('reason').optional().isString().withMessage('Reason must be a string')],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        })
      }

      const { id } = req.params
      const { reason } = req.body

      const user = await User.findByIdAndUpdate(
        id,
        {
          'profile.status': 'suspended',
          'profile.statusReason': reason || 'Suspended by admin',
          'profile.statusUpdatedAt': new Date(),
        },
        { new: true }
      )

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        })
      }

      res.json({
        success: true,
        message: 'User suspended successfully',
        data: {
          id: user._id,
          status: 'Suspended',
          reason: reason || 'Suspended by admin',
        },
      })
    } catch (error) {
      console.error('Error suspending user:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to suspend user',
        error: error.message,
      })
    }
  }
)

// Unsuspend user (dedicated endpoint)
router.patch('/users/:id/unsuspend', adminAuth, async (req, res) => {
  try {
    const { id } = req.params

    const user = await User.findByIdAndUpdate(
      id,
      {
        'profile.status': 'active',
        'profile.statusReason': 'Unsuspended by admin',
        'profile.statusUpdatedAt': new Date(),
      },
      { new: true }
    )

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      })
    }

    res.json({
      success: true,
      message: 'User unsuspended successfully',
      data: {
        id: user._id,
        status: 'Active',
        reason: 'Unsuspended by admin',
      },
    })
  } catch (error) {
    console.error('Error unsuspending user:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to unsuspend user',
      error: error.message,
    })
  }
})

// Send notification to user
router.post(
  '/users/:id/notifications',
  adminAuth,
  [
    body('message').notEmpty().withMessage('Message is required'),
    body('type')
      .optional()
      .isIn(['info', 'warning', 'success', 'error'])
      .withMessage('Invalid notification type'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        })
      }

      const { id } = req.params
      const { message, type = 'info' } = req.body

      const user = await User.findById(id)
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        })
      }

      // Store notification in user document
      const notification = {
        _id: new mongoose.Types.ObjectId(),
        message,
        type,
        sentAt: new Date(),
        read: false,
        dismissed: false,
      }

      // Initialize notifications array if it doesn't exist
      if (!user.notifications) {
        user.notifications = []
      }

      // Add notification to user's notifications array
      user.notifications.push(notification)
      await user.save()

      console.log(
        `Sending ${type} notification to user ${user.firstName} ${user.lastName}: ${message}`
      )

      res.json({
        success: true,
        message: 'Notification sent successfully',
        data: {
          userId: id,
          notificationId: notification._id,
          message,
          type,
          sentAt: notification.sentAt,
        },
      })
    } catch (error) {
      console.error('Error sending notification:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to send notification',
        error: error.message,
      })
    }
  }
)

// ==================== DASHBOARD STATS ====================

/**
 * Build user filter query from request parameters
 * Note: Source filter is based on User.social.provider field
 */
async function buildUserFilter(filters) {
  const conditions = []

  // Source filter - based on social.provider field
  if (filters.source) {
    if (filters.source === 'direct') {
      // Direct users: all users who are NOT google AND NOT facebook
      // Simplest approach: use $nin which handles 'local', null, undefined, missing field
      conditions.push({
        'social.provider': { $nin: ['google', 'facebook'] },
      })
    } else if (filters.source === 'google' || filters.source === 'facebook') {
      // Filter by social.provider
      conditions.push({ 'social.provider': filters.source })
    } else {
      // For other sources, check if they match social.provider
      conditions.push({ 'social.provider': filters.source })
    }
  }

  if (filters.gender) {
    // Gender is stored in onboarding.gender based on User schema
    conditions.push({ 'onboarding.gender': filters.gender.toLowerCase() })
  }

  if (filters.age) {
    // Age range is stored in onboarding.ageRange based on User schema
    conditions.push({ 'onboarding.ageRange': filters.age })
  }

  if (filters.gameId) {
    // Filter users who have installed/played this game
    conditions.push({ 'games.gameId': filters.gameId })
  }

  // REMOVED: Date filtering by user registration date
  // Date filters should only apply to activity dates and transactions, not user registration
  // This was causing the issue where filtering by "yesterday" only showed users registered yesterday
  
  // if (filters.startDate || filters.endDate) {
  //   const dateCondition = {}
  //   if (filters.startDate) {
  //     dateCondition.$gte = new Date(filters.startDate)
  //   }
  //   if (filters.endDate) {
  //     dateCondition.$lte = new Date(filters.endDate)
  //   }
  //   conditions.push({ createdAt: dateCondition })
  // }

  // If we have conditions, use $and, otherwise return empty query (matches all)
  if (conditions.length > 0) {
    return { $and: conditions }
  }

  return {}
}

/**
 * Build transaction filter query
 */
function buildTransactionFilter(filters) {
  const query = {}

  if (filters.startDate || filters.endDate) {
    query.createdAt = {}
    if (filters.startDate) {
      query.createdAt.$gte = new Date(filters.startDate)
    }
    if (filters.endDate) {
      query.createdAt.$lte = new Date(filters.endDate)
    }
  }

  if (filters.gameId) {
    // Filter transactions related to this game
    query.$or = [
      { 'metadata.gameId': filters.gameId },
      { referenceId: new RegExp(filters.gameId, 'i') },
      { description: new RegExp(filters.gameId, 'i') },
    ]
  }

  return query
}

/**
 * Get admin dashboard statistics - Comprehensive V2.0 Dashboard
 * @route   GET /api/admin/dashboard
 * @query   {string} startDate - Start date (ISO format)
 * @query   {string} endDate - End date (ISO format)
 * @query   {string} gameId - Filter by game ID
 * @query   {string} source - Filter by acquisition source
 * @query   {string} age - Filter by age group
 * @query   {string} gender - Filter by gender
 * @query   {string} search - Search users or games
 * @access  Admin
 */
router.get(
  '/dashboard',
  adminAuth,
  [
    query('startDate')
      .optional()
      .isISO8601()
      .withMessage('Invalid start date format'),
    query('endDate')
      .optional()
      .isISO8601()
      .withMessage('Invalid end date format'),
    query('gameId').optional().isString(),
    query('source').optional().isString(),
    query('age').optional().isString(),
    query('gender').optional().isIn(['male', 'female', 'other']),
    query('search').optional().isString(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        })
      }

      const { startDate, endDate, gameId, source, age, gender, search } =
        req.query

      console.log('📅 Dashboard API - Date params received:', {
        startDate,
        endDate,
        hasStart: !!startDate,
        hasEnd: !!endDate,
      })

      // If no date range provided (null/undefined/empty string), retrieve all data (no date filter)
      // Otherwise use the provided dates
      let start =
        startDate && startDate.trim() !== '' ? new Date(startDate) : undefined
      let end = endDate && endDate.trim() !== '' ? new Date(endDate) : undefined

      console.log('📅 Dashboard API - Parsed dates:', {
        start,
        end,
        willFilterByDate: !!(start || end),
      })

      // Validate date range: end date must not be before start date (only if both are provided)
      if (start && end && start > end) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date range: End date must be after start date',
          errors: [
            {
              field: 'dateRange',
              message: 'End date must be after start date',
            },
          ],
        })
      }

      const filters = {
        startDate: start ? start.toISOString() : undefined,
        endDate: end ? end.toISOString() : undefined,
        gameId,
        source,
        age,
        gender,
      }

      const userFilter = await buildUserFilter(filters)

      // OPTIMIZED: Build transaction filter without loading all user IDs into memory
      // Instead, we'll use $lookup or pass userFilter directly to aggregations
      const transactionFilter = buildTransactionFilter(filters)

      // OPTIMIZED: Only get user IDs if we have user-specific filters (source/gender/age)
      // Otherwise, use transaction date filters only
      let userFilterForTransactions = null
      if (filters.source || filters.gender || filters.age || filters.gameId) {
        // We'll use $lookup in aggregations instead of loading IDs
        userFilterForTransactions = userFilter
      }

      // ==================== A. GLOBAL KPI CARDS - PARALLELIZED ====================

      // OPTIMIZED: Run all independent queries in parallel
      const today = new Date()
      // Use standardized date string format to match activity tracking
      const { getDateString } = require('../utils/dailyActivityTracker')
      const todayStr = getDateString(today)
      const yesterday = new Date()
      yesterday.setHours(yesterday.getHours() - 24)

      console.log(`📅 Dashboard: Calculating metrics for today: ${todayStr}`);

      const [
        totalUsers,
        activeUsersToday,
        rewardsIssued,
        redemptions,
        xpStats,
        retention,
        retentionTrend,
      ] = await Promise.all([
        // Total Registered Users
        User.countDocuments(userFilter),

        // Active Users Today - Check if today's date is in activeDates array (BUG-040 fix)
        (async () => {
          try {
            let activeUsersQuery = { ...userFilter }
            
            // If we have date filters, calculate active users within that date range
            if (start || end) {
              // Generate array of date strings within the range
              const dateStrings = []
              
              // Normalize dates to UTC midnight to avoid timezone issues
              const startDateNormalized = start ? new Date(Date.UTC(
                start.getUTCFullYear(),
                start.getUTCMonth(),
                start.getUTCDate()
              )) : (end ? new Date(Date.UTC(
                end.getUTCFullYear(),
                end.getUTCMonth(),
                end.getUTCDate()
              )) : null)
              
              const endDateNormalized = end ? new Date(Date.UTC(
                end.getUTCFullYear(),
                end.getUTCMonth(),
                end.getUTCDate()
              )) : (start ? new Date(Date.UTC(
                start.getUTCFullYear(),
                start.getUTCMonth(),
                start.getUTCDate()
              )) : null)
              
              // If only start date, use start date
              // If only end date, use end date  
              // If both, use the range
              if (startDateNormalized && endDateNormalized) {
                // Generate all dates in range
                const currentDate = new Date(startDateNormalized)
                while (currentDate <= endDateNormalized) {
                  dateStrings.push(getDateString(currentDate))
                  currentDate.setUTCDate(currentDate.getUTCDate() + 1)
                }
              } else if (startDateNormalized) {
                // Only start date - use that specific date
                dateStrings.push(getDateString(startDateNormalized))
              } else if (endDateNormalized) {
                // Only end date - use that specific date
                dateStrings.push(getDateString(endDateNormalized))
              }
              
              // Find users active on any of these dates
              activeUsersQuery['dailyActivity.activeDates'] = { $in: dateStrings }
              
              console.log(`📊 Active Users in date range query:`, JSON.stringify(activeUsersQuery, null, 2))
              console.log(`📊 Looking for activity on dates:`, dateStrings)
            } else {
              // No date filter - show today's active users
              activeUsersQuery['dailyActivity.activeDates'] = todayStr
              console.log(`📊 Active Users Today query (no date filter):`, JSON.stringify(activeUsersQuery, null, 2))
            }
            
            const count = await User.countDocuments(activeUsersQuery)
            console.log(`📊 Active Users result: ${count}`)
            
            return count
          } catch (error) {
            console.error('❌ Error calculating Active Users:', error.message)
            console.error('Query details:', { userFilter, start, end })
            
            // Return 0 instead of throwing to prevent dashboard from breaking
            return 0
          }
        })(),

        // Total Rewards Issued (Coins) - OPTIMIZED: Use aggregation with user filter
        (async () => {
          const matchStage = { ...transactionFilter }
          if (userFilterForTransactions) {
            // Use $lookup to join with users instead of $in with array
            const pipeline = [
              { $match: matchStage },
              {
                $lookup: {
                  from: 'users',
                  let: { userId: '$user' },
                  pipeline: [
                    { $match: { $expr: { $eq: ['$_id', '$$userId'] } } },
                    { $match: userFilterForTransactions },
                  ],
                  as: 'matchedUser',
                },
              },
              { $match: { matchedUser: { $ne: [] } } },
              {
                $match: {
                  type: { $in: ['credit', 'reward', 'spin', 'bonus'] },
                  balanceType: 'coins',
                  status: 'completed',
                },
              },
              {
                $group: {
                  _id: null,
                  total: { $sum: '$amount' },
                },
              },
            ]
            const result = await Transaction.aggregate(pipeline)
            return result[0]?.total || 0
          } else {
            matchStage.type = { $in: ['credit', 'reward', 'spin', 'bonus'] }
            matchStage.balanceType = 'coins'
            matchStage.status = 'completed'
            const result = await Transaction.aggregate([
              { $match: matchStage },
              { $group: { _id: null, total: { $sum: '$amount' } } },
            ])
            return result[0]?.total || 0
          }
        })(),

        // Total Redemptions (Currency) - OPTIMIZED (BUG-040 fix: Include PayoutRequest data)
        (async () => {
          try {
            console.log('📊 Calculating redemption metrics...')
            const PayoutRequest = require('../models/PayoutRequest')
          
          // Get redemptions from Transaction collection
          let transactionRedemptions = 0
          const matchStage = { ...transactionFilter }
          if (userFilterForTransactions) {
            const pipeline = [
              { $match: matchStage },
              {
                $lookup: {
                  from: 'users',
                  let: { userId: '$user' },
                  pipeline: [
                    { $match: { $expr: { $eq: ['$_id', '$$userId'] } } },
                    { $match: userFilterForTransactions },
                  ],
                  as: 'matchedUser',
                },
              },
              { $match: { matchedUser: { $ne: [] } } },
              {
                $match: {
                  type: 'redemption',
                  status: 'completed',
                },
              },
              {
                $group: {
                  _id: null,
                  total: { $sum: '$amount' },
                },
              },
            ]
            const result = await Transaction.aggregate(pipeline)
            transactionRedemptions = result[0]?.total || 0
          } else {
            matchStage.type = 'redemption'
            matchStage.status = 'completed'
            const result = await Transaction.aggregate([
              { $match: matchStage },
              { $group: { _id: null, total: { $sum: '$amount' } } },
            ])
            transactionRedemptions = result[0]?.total || 0
          }

          // Get redemptions from PayoutRequest collection (Tremendous payouts)
          let payoutRequestRedemptions = 0
          try {
            // Build date filter for PayoutRequest
            const payoutDateFilter = {}
            if (transactionFilter.createdAt) {
              payoutDateFilter.createdAt = transactionFilter.createdAt
            }

            // Build user filter for PayoutRequest
            let payoutUserFilter = {}
            if (userFilterForTransactions) {
              // Get user IDs that match the filter
              const matchingUsers = await User.find(userFilterForTransactions).select('_id').lean()
              const matchingUserIds = matchingUsers.map(u => u._id)
              if (matchingUserIds.length > 0) {
                payoutUserFilter.userId = { $in: matchingUserIds }
              } else {
                // No matching users, return 0
                return transactionRedemptions
              }
            }

            // Query PayoutRequest for completed/approved redemptions
            const payoutQuery = {
              status: { $in: ['completed', 'approved'] },
              ...payoutUserFilter,
              ...payoutDateFilter,
            }
            
            const payoutResult = await PayoutRequest.aggregate([
              { $match: payoutQuery },
              {
                $group: {
                  _id: null,
                  total: { $sum: '$coinsDeducted' },
                },
              },
            ])
            payoutRequestRedemptions = payoutResult[0]?.total || 0
          } catch (error) {
            console.error('Error calculating PayoutRequest redemptions:', error)
            // Continue with transaction redemptions only
          }

          return transactionRedemptions + payoutRequestRedemptions
          } catch (error) {
            console.error('❌ Error calculating total redemptions:', error.message)
            return 0
          }
        })(),

        // Avg. XP/User
        User.aggregate([
          { $match: userFilter },
          {
            $group: {
              _id: null,
              avgXP: { $avg: '$xp.current' },
              totalXP: { $sum: '$xp.current' },
            },
          },
        ]).then((result) => result[0]?.avgXP || 0),

        // Retention metrics (already optimized in retentionCalculator)
        calculateRetention(filters),
        getRetentionTrend(filters),
      ])

      const totalRewardsIssued = rewardsIssued
      const totalRedemptions = redemptions
      const avgXPPerUser = xpStats

      // ==================== TOP PLAYED GAME ====================
      let topPlayedGame = null
      const topGames = await Game.find({ isActive: true })
        .select('_id gameId title bannerImage besitosRawData analytics')
        .sort({ 'analytics.totalPlays': -1 })
        .limit(1)
        .lean()

      if (topGames.length > 0) {
        const game = topGames[0]

        // Check for banner image in multiple places
        let gameBannerImage =
          game.bannerImage ||
          game.besitosRawData?.large_image ||
          game.besitosRawData?.square_image ||
          game.besitosRawData?.image ||
          game.gameDetails?.large_image ||
          game.gameDetails?.image ||
          null

        // Get user demographics for this game
        const gameUsers = await User.find({
          'games.gameId': game.gameId,
          ...userFilter,
        })
          .select('profile onboarding age location vip')
          .lean()

        // Calculate demographics
        const ageGroups = {}
        const genders = {}
        const regions = {}
        const tiers = {}

        gameUsers.forEach((user) => {
          // Age groups - try multiple sources
          let userAgeRange = user.onboarding?.ageRange
          if (!userAgeRange) {
            const age = user.profile?.age || user.age
            if (age) {
              const ageNum = parseInt(age)
              if (ageNum >= 18 && ageNum <= 24) userAgeRange = '18-24'
              else if (ageNum >= 25 && ageNum <= 34) userAgeRange = '25-34'
              else if (ageNum >= 35 && ageNum <= 44) userAgeRange = '35-44'
              else if (ageNum >= 45) userAgeRange = '45+'
              else if (ageNum < 18) userAgeRange = 'Under 18'
            }
          }
          if (userAgeRange) {
            ageGroups[userAgeRange] = (ageGroups[userAgeRange] || 0) + 1
          }

          // Gender - try onboarding first, then profile
          const userGender = user.onboarding?.gender || user.profile?.gender
          if (userGender) {
            const gender = userGender.toLowerCase()
            genders[gender] = (genders[gender] || 0) + 1
          }

          // Regions
          const region = user.location?.current?.country || 'Unknown'
          regions[region] = (regions[region] || 0) + 1

          // Tiers
          const tier = user.vip?.level || 'free'
          tiers[tier] = (tiers[tier] || 0) + 1
        })

        // Calculate average XP and reward conversion
        const usersWithXP = gameUsers.filter((u) => u.xp?.current > 0)
        const avgXP =
          usersWithXP.length > 0
            ? usersWithXP.reduce((sum, u) => sum + (u.xp?.current || 0), 0) /
              usersWithXP.length
            : 0

        // Get users who have received rewards for this game
        const gameRewardTransactions = await Transaction.find({
          ...transactionFilter,
          'metadata.gameId': game.gameId,
          type: { $in: ['credit', 'reward'] },
          status: 'completed',
        })
          .select('user')
          .lean()

        const usersWithRewards = new Set(
          gameRewardTransactions.map((t) => t.user?.toString())
        ).size
        const rewardConversion =
          gameUsers.length > 0
            ? ((usersWithRewards / gameUsers.length) * 100).toFixed(2)
            : 0

        // Ensure bannerImage is properly formatted
        let bannerImageUrl = null
        const bannerToUse = gameBannerImage || game.bannerImage

        if (bannerToUse) {
          if (typeof bannerToUse === 'string') {
            bannerImageUrl = bannerToUse
          } else if (bannerToUse.url) {
            bannerImageUrl = bannerToUse.url
          } else {
            bannerImageUrl = bannerToUse
          }
        }

        topPlayedGame = {
          gameId: game._id, // Use MongoDB ObjectId instead of gameId
          title: game.title,
          banner: bannerImageUrl,
          bannerImage: game.bannerImage || null,
          analytics: {
            totalPlays: game.analytics?.totalPlays || 0,
            totalCompletions: game.analytics?.totalCompletions || 0,
            averageXP: avgXP,
            rewardConversion: parseFloat(rewardConversion),
          },
          demographics: {
            age: ageGroups,
            gender: genders,
            region: regions,
            tier: tiers,
          },
        }
      }

      // ==================== REVENUE VS REWARD COST BY GAME ====================
      const gamesWithRevenue = await Game.find({ isActive: true })
        .select('gameId title metadata analytics')
        .lean()

      let revenueTable = []
      if (gamesWithRevenue.length > 0) {
        // Get all game IDs for batch queries
        const gameIds = gamesWithRevenue.map((g) => g.gameId)

        // Optimized: Get revenue from BesitosConversion (external revenue from SDK providers)
        const BesitosConversion = require('../models/BesitosConversion')

        // Build date filter for conversions
        const conversionDateFilter = {}
        if (transactionFilter.createdAt) {
          conversionDateFilter.createdAt = transactionFilter.createdAt
        }

        // Get revenue from completed conversions (external revenue)
        const revenueByOffer = await BesitosConversion.aggregate([
          {
            $match: {
              conversionStatus: 'completed',
              offerType: 'game',
              ...conversionDateFilter,
            },
          },
          {
            $group: {
              _id: '$offerId',
              revenue: { $sum: { $ifNull: ['$revenue.amount', 0] } },
            },
          },
        ])

        // Create revenue map (offerId -> revenue)
        const revenueByOfferMap = {}
        revenueByOffer.forEach((item) => {
          revenueByOfferMap[item._id] = item.revenue
        })

        // Optimized: Get reward costs for all games
        // Fetch all reward transactions and group by gameId in JavaScript (simpler approach)
        const allRewardTransactions = await Transaction.find({
          ...transactionFilter,
          type: 'reward',
          balanceType: 'coins',
          status: 'completed',
        })
          .select('amount metadata referenceId description')
          .lean()

        // Group reward costs by gameId
        const rewardCostMap = {}
        allRewardTransactions.forEach((transaction) => {
          let matchedGameId = null

          // Try to match from metadata.gameId
          if (
            transaction.metadata?.gameId &&
            gameIds.includes(transaction.metadata.gameId)
          ) {
            matchedGameId = transaction.metadata.gameId
          } else {
            // Try to match from referenceId or description
            for (const gameId of gameIds) {
              const refMatch =
                transaction.referenceId &&
                new RegExp(gameId, 'i').test(transaction.referenceId)
              const descMatch =
                transaction.description &&
                new RegExp(gameId, 'i').test(transaction.description)
              if (refMatch || descMatch) {
                matchedGameId = gameId
                break
              }
            }
          }

          if (matchedGameId) {
            rewardCostMap[matchedGameId] =
              (rewardCostMap[matchedGameId] || 0) + (transaction.amount || 0)
          }
        })

        // Optimized: Get all game users for retention in one batch query
        const allGameUsers = await User.find({
          'games.gameId': { $in: gameIds },
          'games.installedAt': { $exists: true },
          ...userFilter,
        })
          .select('games dailyActivity createdAt')
          .lean()

        // Group users by gameId
        const gameUsersForRetentionMap = {}
        allGameUsers.forEach((user) => {
          user.games?.forEach((game) => {
            if (gameIds.includes(game.gameId) && game.installedAt) {
              if (!gameUsersForRetentionMap[game.gameId]) {
                gameUsersForRetentionMap[game.gameId] = []
              }
              gameUsersForRetentionMap[game.gameId].push({
                dailyActivity: user.dailyActivity,
                createdAt: user.createdAt,
              })
            }
          })
        })

        // Build revenue table (now much faster - no sequential queries)
        revenueTable = gamesWithRevenue.map((game) => {
          // Try to match offerId to gameId - check if gameId matches any offerId in revenue map
          // For now, use metadata.revenue as primary source, conversions as secondary
          let revenue = game.metadata?.revenue || 0

          // Try to find revenue from conversions by matching gameId with offerId
          // This might need adjustment based on your data structure
          for (const [offerId, rev] of Object.entries(revenueByOfferMap)) {
            if (
              offerId === game.gameId ||
              offerId.includes(game.gameId) ||
              game.gameId.includes(offerId)
            ) {
              revenue += rev
            }
          }

          const rewardCost =
            rewardCostMap[game.gameId] || game.metadata?.rewardCost || 0
          const margin = revenue - rewardCost
          const marginPercent =
            revenue > 0 ? ((margin / revenue) * 100).toFixed(2) : 0

          // Calculate D7 retention
          const gameUsersForRetention =
            gameUsersForRetentionMap[game.gameId] || []
          let d7Retention = 0
          if (gameUsersForRetention.length > 0) {
            const retained = gameUsersForRetention.filter((user) => {
              if (!user.dailyActivity?.activeDates) return false
              const userCreatedAt = new Date(user.createdAt)
              const d7Date = new Date(userCreatedAt)
              d7Date.setDate(d7Date.getDate() + 7)
              const d7DateStr = `${d7Date.getFullYear()}-${String(
                d7Date.getMonth() + 1
              ).padStart(2, '0')}-${String(d7Date.getDate()).padStart(2, '0')}`
              return user.dailyActivity.activeDates.includes(d7DateStr)
            }).length
            d7Retention = (
              (retained / gameUsersForRetention.length) *
              100
            ).toFixed(2)
          }

          return {
            gameId: game.gameId,
            title: game.title,
            revenue: revenue,
            rewardCost: rewardCost,
            margin: margin,
            marginProfit: margin, // Add marginProfit field (same as margin)
            marginPercent: parseFloat(marginPercent),
            d7Retention: parseFloat(d7Retention),
            performance:
              parseFloat(marginPercent) > 0 ? 'positive' : 'negative',
          }
        })

        // Sort by revenue descending
        revenueTable.sort((a, b) => b.revenue - a.revenue)
      }

      // Calculate total revenue and margin profit for dashboard summary
      const totalRevenue = revenueTable.reduce(
        (sum, game) => sum + (game.revenue || 0),
        0
      )
      const totalMarginProfit = revenueTable.reduce(
        (sum, game) => sum + (game.margin || 0),
        0
      )

      // ==================== ALERTS ====================
      const pendingRedemptions = await Transaction.countDocuments({
        type: 'redemption',
        'approval.status': 'pending',
        status: 'pending',
      })

      const alerts = []
      if (pendingRedemptions > 0) {
        alerts.push({
          type: 'pending_redemption',
          severity: 'medium',
          message: `${pendingRedemptions} pending redemptions require approval`,
          count: pendingRedemptions,
          timestamp: new Date(),
          actionUrl: '/admin/transactions/redemptions/pending',
        })
      }

      // Check for SDK failures (would need SDK error tracking)
      // Check for fraud alerts (would need fraud detection system)

      // ==================== SEARCH FUNCTIONALITY ====================
      let searchResults = null
      if (search) {
        const searchRegex = new RegExp(search, 'i')
        const [usersResults, gamesResults] = await Promise.all([
          User.find({
            $or: [
              { firstName: searchRegex },
              { lastName: searchRegex },
              { email: searchRegex },
              { mobile: searchRegex },
            ],
          })
            .select('firstName lastName email mobile _id')
            .limit(10)
            .lean(),
          Game.find({
            $or: [
              { title: searchRegex },
              { gameId: searchRegex },
              { description: searchRegex },
            ],
          })
            .select('gameId title bannerImage')
            .limit(10)
            .lean(),
        ])

        searchResults = {
          users: usersResults,
          games: gamesResults,
          total: usersResults.length + gamesResults.length,
        }
      }

      // ==================== ATTRIBUTION PERFORMANCE ====================
      // Get all users and calculate sources properly - MUST use same date filters as userFilter
      // Build base query with date filters (same as userFilter but without source/gender/age)
      const baseDateQuery = {}
      if (filters.startDate || filters.endDate) {
        baseDateQuery.createdAt = {}
        if (filters.startDate) {
          baseDateQuery.createdAt.$gte = new Date(filters.startDate)
        }
        if (filters.endDate) {
          baseDateQuery.createdAt.$lte = new Date(filters.endDate)
        }
      }

      // Get counts for google and facebook WITH date filters
      const googleQuery = { 'social.provider': 'google', ...baseDateQuery }
      const facebookQuery = { 'social.provider': 'facebook', ...baseDateQuery }
      const googleCount = await User.countDocuments(googleQuery)
      const facebookCount = await User.countDocuments(facebookQuery)

      // Direct users query: all users who are NOT google AND NOT facebook
      // This should match: 'local' (default), null, undefined, missing field, or any other value
      // Simplest approach: use $nin which handles all cases
      const directQueryBase = {
        'social.provider': { $nin: ['google', 'facebook'] },
      }

      // Combine with date filter
      const directQuery =
        Object.keys(baseDateQuery).length > 0
          ? { $and: [directQueryBase, baseDateQuery] }
          : directQueryBase

      const directCount = await User.countDocuments(directQuery)

      // Build sources list: always include google, facebook, and direct
      const allSources = []
      if (googleCount > 0) allSources.push('google')
      if (facebookCount > 0) allSources.push('facebook')
      if (directCount > 0) allSources.push('direct')

      const attributionData = await Promise.all(
        allSources.map(async (source) => {
          // Build query for this source
          let sourceQuery = {}
          if (source === 'direct') {
            // Direct users: all users who are NOT google AND NOT facebook
            // Simplest approach: use $nin which handles 'local', null, undefined, missing field
            const directQueryBase = {
              'social.provider': { $nin: ['google', 'facebook'] },
            }

            // Add date filter if provided
            if (filters.startDate || filters.endDate) {
              const dateFilter = {}
              dateFilter.createdAt = {}
              if (filters.startDate) {
                dateFilter.createdAt.$gte = new Date(filters.startDate)
              }
              if (filters.endDate) {
                dateFilter.createdAt.$lte = new Date(filters.endDate)
              }
              sourceQuery = { $and: [directQueryBase, dateFilter] }
            } else {
              sourceQuery = directQueryBase
            }
          } else {
            // OAuth users: filter by social.provider
            sourceQuery = { 'social.provider': source }

            // Add date filter if provided
            if (filters.startDate || filters.endDate) {
              sourceQuery.createdAt = {}
              if (filters.startDate) {
                sourceQuery.createdAt.$gte = new Date(filters.startDate)
              }
              if (filters.endDate) {
                sourceQuery.createdAt.$lte = new Date(filters.endDate)
              }
            }
          }

          const sourceUsers = await User.find(sourceQuery)
            .select('_id createdAt dailyActivity')
            .lean()

          const installs = sourceUsers.length

          // Calculate D1 retention
          let d1Retention = 0
          if (sourceUsers.length > 0) {
            const retained = sourceUsers.filter((user) => {
              if (!user.dailyActivity?.activeDates || !user.createdAt)
                return false
              const userCreatedAt = new Date(user.createdAt)
              const d1Date = new Date(userCreatedAt)
              d1Date.setDate(d1Date.getDate() + 1)
              const d1DateStr = `${d1Date.getFullYear()}-${String(
                d1Date.getMonth() + 1
              ).padStart(2, '0')}-${String(d1Date.getDate()).padStart(2, '0')}`
              return user.dailyActivity.activeDates.includes(d1DateStr)
            }).length
            d1Retention = ((retained / sourceUsers.length) * 100).toFixed(2)
          }

          // Get revenue from source users (use IDs from filtered sourceUsers)
          const filteredSourceUserIds = sourceUsers.map((u) => u._id)
          const revenueData = await Transaction.aggregate([
            {
              $match: {
                ...transactionFilter,
                user: { $in: filteredSourceUserIds },
                type: { $in: ['credit', 'reward'] },
                status: 'completed',
              },
            },
            {
              $group: {
                _id: null,
                revenue: { $sum: '$amount' },
              },
            },
          ])

          // Get reward cost
          const costData = await Transaction.aggregate([
            {
              $match: {
                ...transactionFilter,
                user: { $in: filteredSourceUserIds },
                type: 'reward',
                balanceType: 'coins',
                status: 'completed',
              },
            },
            {
              $group: {
                _id: null,
                cost: { $sum: '$amount' },
              },
            },
          ])

          const revenue = revenueData[0]?.revenue || 0
          const rewardCost = costData[0]?.cost || 0
          const margin = revenue - rewardCost
          const marginPercent =
            revenue > 0 ? ((margin / revenue) * 100).toFixed(2) : 0

          return {
            source: source || 'direct',
            installs: installs,
            d1Retention: parseFloat(d1Retention),
            revenue: revenue,
            rewardCost: rewardCost,
            margin: margin,
            marginPercent: parseFloat(marginPercent),
          }
        })
      )

      // ==================== LEGACY VIP DATA ====================
      const [vipUsers, totalSubscriptions, activeSubscriptions, totalTiers] =
        await Promise.all([
          User.countDocuments({ ...userFilter, 'vip.isActive': true }),
          VIPSubscription.countDocuments(),
          VIPSubscription.countDocuments({ status: 'active' }),
          VIPTier.countDocuments({ active: true }),
        ])

      // ==================== RESPONSE ====================
      res.json({
        success: true,
        data: {
          // A. Global KPI Cards
          kpis: {
            totalRegisteredUsers: totalUsers,
            activeUsersToday: activeUsersToday,
            totalRewardsIssued: totalRewardsIssued,
            totalRedemptions: totalRedemptions,
            avgXPPerUser: Math.round(avgXPPerUser),
            totalRevenue: totalRevenue || 0,
            marginProfit: totalMarginProfit || 0,
          },

          // C. Retention Trend Graph
          retention: {
            current: {
              d1: parseFloat(retention.d1),
              d7: parseFloat(retention.d7),
              d14: parseFloat(retention.d14),
              d30: parseFloat(retention.d30),
            },
            trend: retentionTrend,
            totalCohort: retention.totalCohort,
          },

          // D. Top Played Game Snapshot
          topPlayedGame: topPlayedGame,

          // E. Revenue vs Reward Cost by Game Table
          revenueByGame: revenueTable,

          // F. Attribution Performance Table
          attribution: attributionData,

          // G. Alerts & Notification Panel
          alerts: alerts,

          // Search results (if search query provided)
          search: searchResults,

          // Filters applied
          filters: {
            startDate: filters.startDate,
            endDate: filters.endDate,
            gameId: filters.gameId || null,
            source: filters.source || null,
            age: filters.age || null,
            gender: filters.gender || null,
            search: search || null,
          },

          // Legacy VIP data (for backward compatibility)
          overview: {
            totalUsers,
            vipUsers,
            totalSubscriptions,
            activeSubscriptions,
            totalTiers,
          },
        },
      })
    } catch (error) {
      console.error('Error getting dashboard stats:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to get dashboard statistics',
        error: error.message,
      })
    }
  }
)

// ==================== SEPARATE DASHBOARD ENDPOINTS FOR FASTER LOADING ====================

/**
 * Get KPIs only - Fast endpoint for initial load
 * @route   GET /api/admin/dashboard/kpis
 */
router.get(
  '/dashboard/kpis',
  adminAuth,
  [
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    query('gameId').optional().isString(),
    query('source').optional().isString(),
    query('age').optional().isString(),
    query('gender').optional().isIn(['male', 'female', 'other']),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        })
      }

      const { startDate, endDate, gameId, source, age, gender } = req.query

      // If no date range provided, retrieve all data (no date filter)
      let start = startDate ? new Date(startDate) : undefined
      let end = endDate ? new Date(endDate) : undefined

      const filters = {
        startDate: start ? start.toISOString() : undefined,
        endDate: end ? end.toISOString() : undefined,
        gameId,
        source,
        age,
        gender,
      }

      const userFilter = await buildUserFilter(filters)
      const transactionFilter = buildTransactionFilter(filters)

      let userFilterForTransactions = null
      if (filters.source || filters.gender || filters.age || filters.gameId) {
        userFilterForTransactions = userFilter
      }

      const today = new Date()
      // Use standardized date string format to match activity tracking
      const { getDateString } = require('../utils/dailyActivityTracker')
      const todayStr = getDateString(today)
      const yesterday = new Date()
      yesterday.setHours(yesterday.getHours() - 24)

      console.log(`📅 Dashboard KPIs: Calculating metrics for today: ${todayStr}`);

      const [
        totalUsers,
        activeUsersToday,
        rewardsIssued,
        redemptions,
        xpStats,
      ] = await Promise.all([
        User.countDocuments(userFilter),
        // Active Users Today - Check if today's date is in activeDates array (BUG-040 fix)
        (async () => {
          try {
            let activeUsersQuery = { ...userFilter }
            
            // If we have date filters, calculate active users within that date range
            if (start || end) {
              // Generate array of date strings within the range
              const dateStrings = []
              
              // Normalize dates to UTC midnight to avoid timezone issues
              const startDateNormalized = start ? new Date(Date.UTC(
                start.getUTCFullYear(),
                start.getUTCMonth(),
                start.getUTCDate()
              )) : (end ? new Date(Date.UTC(
                end.getUTCFullYear(),
                end.getUTCMonth(),
                end.getUTCDate()
              )) : null)
              
              const endDateNormalized = end ? new Date(Date.UTC(
                end.getUTCFullYear(),
                end.getUTCMonth(),
                end.getUTCDate()
              )) : (start ? new Date(Date.UTC(
                start.getUTCFullYear(),
                start.getUTCMonth(),
                start.getUTCDate()
              )) : null)
              
              // If only start date, use start date
              // If only end date, use end date  
              // If both, use the range
              if (startDateNormalized && endDateNormalized) {
                // Generate all dates in range
                const currentDate = new Date(startDateNormalized)
                while (currentDate <= endDateNormalized) {
                  dateStrings.push(getDateString(currentDate))
                  currentDate.setUTCDate(currentDate.getUTCDate() + 1)
                }
              } else if (startDateNormalized) {
                // Only start date - use that specific date
                dateStrings.push(getDateString(startDateNormalized))
              } else if (endDateNormalized) {
                // Only end date - use that specific date
                dateStrings.push(getDateString(endDateNormalized))
              }
              
              // Find users active on any of these dates
              activeUsersQuery['dailyActivity.activeDates'] = { $in: dateStrings }
              
              console.log(`📊 Active Users in date range query (KPIs):`, JSON.stringify(activeUsersQuery, null, 2))
              console.log(`📊 Looking for activity on dates (KPIs):`, dateStrings)
            } else {
              // No date filter - show today's active users
              activeUsersQuery['dailyActivity.activeDates'] = todayStr
              console.log(`📊 Active Users Today query (KPIs - no date filter):`, JSON.stringify(activeUsersQuery, null, 2))
            }
            
            const count = await User.countDocuments(activeUsersQuery)
            console.log(`📊 Active Users result (KPIs): ${count}`)
            
            return count
          } catch (error) {
            console.error('❌ Error calculating Active Users (KPIs):', error.message)
            console.error('Query details:', { userFilter, start, end })
            
            // Return 0 instead of throwing to prevent dashboard from breaking
            return 0
          }
        })(),

        // Total Rewards Issued (Coins) - OPTIMIZED: Use aggregation with user filter
        (async () => {
          const matchStage = { ...transactionFilter }
          if (userFilterForTransactions) {
            const pipeline = [
              { $match: matchStage },
              {
                $lookup: {
                  from: 'users',
                  let: { userId: '$user' },
                  pipeline: [
                    { $match: { $expr: { $eq: ['$_id', '$$userId'] } } },
                    { $match: userFilterForTransactions },
                  ],
                  as: 'matchedUser',
                },
              },
              { $match: { matchedUser: { $ne: [] } } },
              {
                $match: {
                  type: { $in: ['credit', 'reward', 'spin', 'bonus'] },
                  balanceType: 'coins',
                  status: 'completed',
                },
              },
              {
                $group: {
                  _id: null,
                  total: { $sum: '$amount' },
                },
              },
            ]
            const result = await Transaction.aggregate(pipeline)
            return result[0]?.total || 0
          } else {
            matchStage.type = { $in: ['credit', 'reward', 'spin', 'bonus'] }
            matchStage.balanceType = 'coins'
            matchStage.status = 'completed'
            const result = await Transaction.aggregate([
              { $match: matchStage },
              { $group: { _id: null, total: { $sum: '$amount' } } },
            ])
            return result[0]?.total || 0
          }
        })(),
        // Total Redemptions (Currency) - Include PayoutRequest data (BUG-040 fix)
        (async () => {
          try {
            const PayoutRequest = require('../models/PayoutRequest')
            
            // Get redemptions from Transaction collection
            let transactionRedemptions = 0
            const matchStage = { ...transactionFilter }
          if (userFilterForTransactions) {
            const pipeline = [
              { $match: matchStage },
              {
                $lookup: {
                  from: 'users',
                  let: { userId: '$user' },
                  pipeline: [
                    { $match: { $expr: { $eq: ['$_id', '$$userId'] } } },
                    { $match: userFilterForTransactions },
                  ],
                  as: 'matchedUser',
                },
              },
              { $match: { matchedUser: { $ne: [] } } },
              {
                $match: {
                  type: 'redemption',
                  status: 'completed',
                },
              },
              {
                $group: {
                  _id: null,
                  total: { $sum: '$amount' },
                },
              },
            ]
            const result = await Transaction.aggregate(pipeline)
            transactionRedemptions = result[0]?.total || 0
          } else {
            matchStage.type = 'redemption'
            matchStage.status = 'completed'
            const result = await Transaction.aggregate([
              { $match: matchStage },
              { $group: { _id: null, total: { $sum: '$amount' } } },
            ])
            transactionRedemptions = result[0]?.total || 0
          }

          // Get redemptions from PayoutRequest collection (Tremendous payouts)
          let payoutRequestRedemptions = 0
          try {
            // Build date filter for PayoutRequest
            const payoutDateFilter = {}
            if (transactionFilter.createdAt) {
              payoutDateFilter.createdAt = transactionFilter.createdAt
            }

            // Build user filter for PayoutRequest
            let payoutUserFilter = {}
            if (userFilterForTransactions) {
              // Get user IDs that match the filter
              const matchingUsers = await User.find(userFilterForTransactions).select('_id').lean()
              const matchingUserIds = matchingUsers.map(u => u._id)
              if (matchingUserIds.length > 0) {
                payoutUserFilter.userId = { $in: matchingUserIds }
              } else {
                // No matching users, return transaction redemptions only
                return transactionRedemptions
              }
            }

            // Query PayoutRequest for completed/approved redemptions
            const payoutQuery = {
              status: { $in: ['completed', 'approved'] },
              ...payoutUserFilter,
              ...payoutDateFilter,
            }
            
            const payoutResult = await PayoutRequest.aggregate([
              { $match: payoutQuery },
              {
                $group: {
                  _id: null,
                  total: { $sum: '$coinsDeducted' },
                },
              },
            ])
            payoutRequestRedemptions = payoutResult[0]?.total || 0
          } catch (error) {
            console.error('Error calculating PayoutRequest redemptions:', error)
            // Continue with transaction redemptions only
          }

          return transactionRedemptions + payoutRequestRedemptions
          } catch (error) {
            console.error('❌ Error calculating total redemptions (KPIs):', error.message)
            return 0
          }
        })(),
        User.aggregate([
          { $match: userFilter },
          {
            $group: {
              _id: null,
              avgXP: { $avg: '$xp.current' },
            },
          },
        ]).then((result) => result[0]?.avgXP || 0),
      ])

      const [vipUsers, totalSubscriptions, activeSubscriptions, totalTiers] =
        await Promise.all([
          User.countDocuments({ ...userFilter, 'vip.isActive': true }),
          VIPSubscription.countDocuments(),
          VIPSubscription.countDocuments({ status: 'active' }),
          VIPTier.countDocuments({ active: true }),
        ])

      res.json({
        success: true,
        data: {
          kpis: {
            totalRegisteredUsers: totalUsers,
            activeUsersToday: activeUsersToday,
            totalRewardsIssued: rewardsIssued,
            totalRedemptions: redemptions,
            avgXPPerUser: Math.round(xpStats),
          },
          overview: {
            totalUsers,
            vipUsers,
            totalSubscriptions,
            activeSubscriptions,
            totalTiers,
          },
        },
      })
    } catch (error) {
      console.error('Error getting KPIs:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to get KPIs',
        error: error.message,
      })
    }
  }
)

/**
 * Get Retention data only
 * @route   GET /api/admin/dashboard/retention
 */
router.get(
  '/dashboard/retention',
  adminAuth,
  [
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    query('gameId').optional().isString(),
    query('source').optional().isString(),
    query('age').optional().isString(),
    query('gender').optional().isIn(['male', 'female', 'other']),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        })
      }

      const { startDate, endDate, gameId, source, age, gender } = req.query

      // If no date range provided (null/undefined/empty string), retrieve all data (no date filter)
      // Otherwise use the provided dates
      let start =
        startDate && startDate.trim() !== '' ? new Date(startDate) : undefined
      let end = endDate && endDate.trim() !== '' ? new Date(endDate) : undefined

      // Validate date range: end date must not be before start date (only if both are provided)
      if (start && end && start > end) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date range: End date must be after start date',
          errors: [
            {
              field: 'dateRange',
              message: 'End date must be after start date',
            },
          ],
        })
      }

      const filters = {
        startDate: start ? start.toISOString() : undefined,
        endDate: end ? end.toISOString() : undefined,
        gameId,
        source,
        age,
        gender,
      }

      const [retention, retentionTrend] = await Promise.all([
        calculateRetention(filters),
        getRetentionTrend(filters),
      ])

      // Add insights and validation
      const insights = getRetentionInsights(retention);
      const validation = validateRetentionData(retention);

      res.json({
        success: true,
        data: {
          retention: {
            current: {
              d1: parseFloat(retention.d1),
              d7: parseFloat(retention.d7),
              d14: parseFloat(retention.d14),
              d30: parseFloat(retention.d30),
            },
            trend: retentionTrend,
            totalCohort: retention.totalCohort,
            insights: insights,
            validation: validation,
            methodology: retention.methodology,
            calculatedAt: retention.calculatedAt,
            detailedData: retention.data // For debugging and transparency
          },
        },
      })
    } catch (error) {
      console.error('Error getting retention:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to get retention data',
        error: error.message,
      })
    }
  }
)

/**
 * Get all games list for dropdown
 * @route   GET /api/admin/dashboard/games-list
 */
router.get(
  '/dashboard/games-list',
  adminAuth,
  async (req, res) => {
    try {
      const games = await Game.find({ isActive: true })
        .select('_id gameId title')
        .sort({ title: 1 })
        .lean()

      // Deduplicate games by gameId to prevent duplicate entries in dropdown
      // Use a Map to keep only the first occurrence of each gameId
      const uniqueGamesMap = new Map();
      
      games.forEach(game => {
        // Use gameId as the unique key (prefer gameId over _id for deduplication)
        const key = game.gameId || game._id.toString();
        
        // Only add if not already in map (keeps first occurrence)
        if (!uniqueGamesMap.has(key)) {
          uniqueGamesMap.set(key, {
            id: game._id.toString(),
            gameId: game.gameId,
            title: game.title,
          });
        }
      });

      // Convert Map values to array
      const uniqueGames = Array.from(uniqueGamesMap.values());

      res.json({
        success: true,
        data: {
          games: uniqueGames,
        },
      })
    } catch (error) {
      console.error('Error getting games list:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to fetch games list',
      })
    }
  }
)

/**
 * Get Top Played Game only
 * @route   GET /api/admin/dashboard/top-game
 * @query   selectedGameId - Optional: Specific game ID to show instead of auto-calculated top game
 */
router.get(
  '/dashboard/top-game',
  adminAuth,
  [
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    query('gameId').optional().isString(),
    query('source').optional().isString(),
    query('age').optional().isString(),
    query('gender').optional().isIn(['male', 'female', 'other']),
    query('selectedGameId').optional().isString(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        })
      }

      const { startDate, endDate, gameId, source, age, gender, selectedGameId } = req.query

      // If no date range provided, retrieve all data (no date filter)
      let start = startDate ? new Date(startDate) : undefined
      let end = endDate ? new Date(endDate) : undefined

      const filters = {
        startDate: start ? start.toISOString() : undefined,
        endDate: end ? end.toISOString() : undefined,
        gameId,
        source,
        age,
        gender,
      }

      const userFilter = await buildUserFilter(filters)

      // Get top played game by counting actual user game installations
      let topPlayedGame = null
      let game = null
      let actualPlayCount = 0

      // If selectedGameId is provided, fetch that specific game
      if (selectedGameId) {
        console.log('🎮 Top Game - Fetching selected game:', selectedGameId);
        
        // Try to find by MongoDB ObjectId first, then by gameId
        const gameQuery = mongoose.Types.ObjectId.isValid(selectedGameId)
          ? { _id: selectedGameId, isActive: true }
          : { gameId: selectedGameId, isActive: true }
        
        const selectedGames = await Game.find(gameQuery)
          .select('_id gameId title bannerImage besitosRawData analytics')
          .limit(1)
          .lean()

        if (selectedGames.length > 0) {
          game = selectedGames[0]
          
          // Count how many users have this game
          const gameUserCount = await User.countDocuments({
            'games.gameId': game.gameId,
            ...userFilter,
          })
          actualPlayCount = gameUserCount
          console.log(`🎮 Top Game - Selected game: ${game.title} (${actualPlayCount} users)`);
        } else {
          console.log('🎮 Top Game - Selected game not found');
        }
      } else {
        // Auto-calculate top played game
        // Step 1: Find the most played games from actual user data (top 20 to find at least one that exists)
        const topGamesByUsers = await User.aggregate([
          { $match: userFilter },
          { $unwind: '$games' },
          {
            $group: {
              _id: '$games.gameId',
              totalPlays: { $sum: 1 }
            }
          },
          { $sort: { totalPlays: -1 } },
          { $limit: 20 }
        ])

        console.log('🎮 Top Game - Top 20 games from user data:', topGamesByUsers.map(g => `${g._id} (${g.totalPlays} users)`));

        // Step 2: Find the first game that exists in Game collection
        for (const userGame of topGamesByUsers) {
          const topGames = await Game.find({ gameId: userGame._id, isActive: true })
            .select('_id gameId title bannerImage besitosRawData analytics')
            .limit(1)
            .lean()

          if (topGames.length > 0) {
            game = topGames[0]
            actualPlayCount = userGame.totalPlays
            console.log(`🎮 Top Game - Found match: ${game.title} (${actualPlayCount} users)`);
            break
          }
        }
      }

      if (game) {

        // Check for banner image in multiple places
        let gameBannerImage =
          game.bannerImage ||
          game.besitosRawData?.large_image ||
          game.besitosRawData?.square_image ||
          game.besitosRawData?.image ||
          game.gameDetails?.large_image ||
          game.gameDetails?.image ||
          null

        const gameUserQuery = {
          'games.gameId': game.gameId,
          ...userFilter,
        }
        console.log('🎮 Top Game - Searching for users with gameId:', game.gameId);
        console.log('🎮 Top Game - User filter:', JSON.stringify(userFilter, null, 2));
        const gameUsers = await User.find(gameUserQuery)
          .select('xp onboarding.gender onboarding.ageRange age location vip _id')
          .lean()
        console.log(`🎮 Top Game - Found ${gameUsers.length} users for game ${game.title}`);

        // Debug: Log user structure for first user
        if (gameUsers.length > 0) {
          console.log('🎮 Top Game - Sample user structure:', JSON.stringify(gameUsers[0], null, 2));
        }

        const ageGroups = {}
        const genders = {}
        const regions = {}
        const tiers = {}
        let totalXP = 0

        const gameUserIds = gameUsers.map((u) => u._id)

        const usersWithRewards = await Transaction.countDocuments({
          user: { $in: gameUserIds },
          $or: [
            { 'metadata.gameId': game.gameId },
            { referenceId: new RegExp(game.gameId, 'i') },
            { description: new RegExp(game.gameId, 'i') },
          ],
          type: { $in: ['credit', 'reward'] },
          status: 'completed',
        })

        gameUsers.forEach((user) => {
          // Age groups - try onboarding.ageRange first, then calculate from age
          let userAgeRange = user.onboarding?.ageRange
          if (!userAgeRange && user.age) {
            // Calculate age range from numeric age
            const age = parseInt(user.age)
            if (age >= 18 && age <= 24) userAgeRange = '18-24'
            else if (age >= 25 && age <= 34) userAgeRange = '25-34'
            else if (age >= 35 && age <= 44) userAgeRange = '35-44'
            else if (age >= 45) userAgeRange = '45+'
            else if (age < 18) userAgeRange = 'Under 18'
          }
          if (userAgeRange) {
            ageGroups[userAgeRange] = (ageGroups[userAgeRange] || 0) + 1
          }

          // Gender from onboarding.gender
          const userGender = user.onboarding?.gender
          if (userGender) {
            genders[userGender] = (genders[userGender] || 0) + 1
          }

          // Region from location
          if (user.location?.current?.country) {
            const country = user.location.current.country
            regions[country] = (regions[country] || 0) + 1
          }

          // Tier from vip level
          const tier = user.vip?.level || 'free'
          tiers[tier] = (tiers[tier] || 0) + 1

          // XP
          totalXP += user.xp?.current || 0
        })

        console.log('🎮 Top Game - Demographics collected:');
        console.log('  Age groups:', ageGroups);
        console.log('  Genders:', genders);
        console.log('  Regions:', regions);
        console.log('  Tiers:', tiers);

        const avgXP = gameUsers.length > 0 ? totalXP / gameUsers.length : 0
        const rewardConversion =
          gameUsers.length > 0
            ? ((usersWithRewards / gameUsers.length) * 100).toFixed(2)
            : 0

        let bannerImageUrl = null
        const bannerToUse = gameBannerImage || game.bannerImage

        if (bannerToUse) {
          if (typeof bannerToUse === 'string') {
            bannerImageUrl = bannerToUse
          } else if (bannerToUse.url) {
            bannerImageUrl = bannerToUse.url
          } else {
            bannerImageUrl = bannerToUse
          }
        }

        topPlayedGame = {
          gameId: game._id, // Use MongoDB ObjectId instead of gameId
          title: game.title,
          banner: bannerImageUrl,
          bannerImage: game.bannerImage || null,
          analytics: {
            totalPlays: game.analytics?.totalPlays || 0,
            totalCompletions: game.analytics?.totalCompletions || 0,
            averageXP: avgXP,
            rewardConversion: parseFloat(rewardConversion),
          },
          demographics: {
            age: ageGroups,
            gender: genders,
            region: regions,
            tier: tiers,
          },
        }
      }

      res.json({
        success: true,
        data: {
          topPlayedGame: topPlayedGame,
        },
      })
    } catch (error) {
      console.error('Error getting top game:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to get top game',
        error: error.message,
      })
    }
  }
)

/**
 * Get Revenue by Game only - WITH PAGINATION (50 records per page)
 * @route   GET /api/admin/dashboard/revenue
 * @query   retentionDay - Optional: Retention day to calculate (D1, D3, D4, D5, D6, D7). Default: D7
 */
router.get(
  '/dashboard/revenue',
  adminAuth,
  [
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    query('gameId').optional().isString(),
    query('source').optional().isString(),
    query('age').optional().isString(),
    query('gender').optional().isIn(['male', 'female', 'other']),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('retentionDay').optional().isIn(['D1', 'D3', 'D4', 'D5', 'D6', 'D7']),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        })
      }

      const {
        startDate,
        endDate,
        gameId,
        source,
        age,
        gender,
        page = 1,
        limit = 50,
        retentionDay = 'D7', // Default to D7 if not specified
      } = req.query

      // Parse retention day number (D1 -> 1, D7 -> 7, etc.)
      const retentionDays = parseInt(retentionDay.substring(1))
      console.log(`📊 Revenue - Calculating ${retentionDay} retention (${retentionDays} days)`);

      // If no date range provided, retrieve all data (no date filter)
      let start = startDate && startDate.trim() !== '' ? new Date(startDate) : undefined
      let end = endDate && endDate.trim() !== '' ? new Date(endDate) : undefined

      // Validate date range
      if (start && end && start > end) {
        return res.status(400).json({
          success: false,
          message: "Invalid date range: End date must be after start date",
          errors: [{
            field: "dateRange",
            message: "End date must be after start date"
          }]
        });
      }

      const filters = {
        startDate: start ? start.toISOString() : undefined,
        endDate: end ? end.toISOString() : undefined,
        gameId,
        source,
        age,
        gender,
      }

      const userFilter = await buildUserFilter(filters)
      const transactionFilter = buildTransactionFilter(filters)

      // Get total count of active games (fast query)
      const totalGames = await Game.countDocuments({ isActive: true })

      // Get games for current page only (fast query - only 50 games)
      // Sort by title for consistent pagination (can't sort by revenue without calculating all)
      const skip = (parseInt(page) - 1) * parseInt(limit)
      const gamesWithRevenue = await Game.find({ isActive: true })
        .select('gameId title metadata analytics')
        .sort({ title: 1 }) // Sort by title for consistent pagination
        .skip(skip)
        .limit(parseInt(limit))
        .lean()

      const revenueTable = await Promise.all(
        gamesWithRevenue.map(async (game) => {
          const gameTransactionFilter = { ...transactionFilter }
          if (gameTransactionFilter.$or) {
            delete gameTransactionFilter.$or
          }
          gameTransactionFilter.$or = [
            { 'metadata.gameId': game.gameId },
            { referenceId: new RegExp(game.gameId, 'i') },
            { description: new RegExp(game.gameId, 'i') },
          ]

          const [revenueData, rewardCostData] = await Promise.all([
            Transaction.aggregate([
              {
                $match: {
                  ...gameTransactionFilter,
                  type: { $in: ['credit', 'reward'] },
                  status: 'completed',
                },
              },
              {
                $group: {
                  _id: null,
                  revenue: { $sum: '$amount' },
                },
              },
            ]),
            Transaction.aggregate([
              {
                $match: {
                  ...gameTransactionFilter,
                  type: 'reward',
                  balanceType: 'coins',
                  status: 'completed',
                },
              },
              {
                $group: {
                  _id: null,
                  cost: { $sum: '$amount' },
                },
              },
            ]),
          ])

          const revenue = revenueData[0]?.revenue || game.metadata?.revenue || 0
          const rewardCost =
            rewardCostData[0]?.cost || game.metadata?.rewardCost || 0
          const margin = revenue - rewardCost
          const marginPercent =
            revenue > 0 ? ((margin / revenue) * 100).toFixed(2) : 0

          const gameUsersForRetention = await User.find({
            'games.gameId': game.gameId,
            'games.installedAt': { $exists: true },
            ...userFilter,
          })
            .select('dailyActivity createdAt')
            .lean()

          let retentionValue = 0
          if (gameUsersForRetention.length > 0) {
            const retained = gameUsersForRetention.filter((user) => {
              if (!user.dailyActivity?.activeDates) return false
              const userCreatedAt = new Date(user.createdAt)
              const retentionDate = new Date(userCreatedAt)
              retentionDate.setDate(retentionDate.getDate() + retentionDays)
              const retentionDateStr = `${retentionDate.getFullYear()}-${String(
                retentionDate.getMonth() + 1
              ).padStart(2, '0')}-${String(retentionDate.getDate()).padStart(2, '0')}`
              return user.dailyActivity.activeDates.includes(retentionDateStr)
            }).length
            retentionValue = (
              (retained / gameUsersForRetention.length) *
              100
            ).toFixed(2)
          }

          return {
            gameId: game.gameId,
            title: game.title,
            revenue: revenue,
            rewardCost: rewardCost,
            margin: margin,
            marginPercent: parseFloat(marginPercent),
            retention: parseFloat(retentionValue), // Generic retention field
            retentionDay: retentionDay, // Include which day was calculated
            d7Retention: parseFloat(retentionValue), // Keep for backward compatibility
            performance:
              parseFloat(marginPercent) > 0 ? 'positive' : 'negative',
          }
        })
      )

      // Sort by revenue descending
      revenueTable.sort((a, b) => b.revenue - a.revenue)

      // Calculate pagination metadata
      const totalPages = Math.ceil(totalGames / parseInt(limit))
      const currentPage = parseInt(page)
      const hasNextPage = currentPage < totalPages
      const hasPrevPage = currentPage > 1

      res.json({
        success: true,
        data: {
          revenueByGame: revenueTable,
          pagination: {
            currentPage: currentPage,
            totalPages: totalPages,
            totalItems: totalGames,
            itemsPerPage: parseInt(limit),
            hasNextPage: hasNextPage,
            hasPrevPage: hasPrevPage,
          },
        },
      })
    } catch (error) {
      console.error('Error getting revenue data:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to get revenue data',
        error: error.message,
      })
    }
  }
)

/**
 * Get Attribution Performance only
 * @route   GET /api/admin/dashboard/attribution
 */
router.get(
  '/dashboard/attribution',
  adminAuth,
  [
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    query('gameId').optional().isString(),
    query('source').optional().isString(),
    query('age').optional().isString(),
    query('gender').optional().isIn(['male', 'female', 'other']),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        })
      }

      const { startDate, endDate, gameId, source, age, gender } = req.query

      // If no date range provided, retrieve all data (no date filter)
      let start = startDate ? new Date(startDate) : undefined
      let end = endDate ? new Date(endDate) : undefined

      const filters = {
        startDate: start ? start.toISOString() : undefined,
        endDate: end ? end.toISOString() : undefined,
        gameId,
        source,
        age,
        gender,
      }

      const userFilter = await buildUserFilter(filters)
      const transactionFilter = buildTransactionFilter(filters)

      const baseDateQuery = {}
      if (filters.startDate || filters.endDate) {
        baseDateQuery.createdAt = {}
        if (filters.startDate) {
          baseDateQuery.createdAt.$gte = new Date(filters.startDate)
        }
        if (filters.endDate) {
          baseDateQuery.createdAt.$lte = new Date(filters.endDate)
        }
      }

      const directQueryBase = {
        'social.provider': { $nin: ['google', 'facebook'] },
      }
      const directQuery =
        Object.keys(baseDateQuery).length > 0
          ? { $and: [directQueryBase, baseDateQuery] }
          : directQueryBase

      const [googleCount, facebookCount, directCount] = await Promise.all([
        User.countDocuments({ 'social.provider': 'google', ...baseDateQuery }),
        User.countDocuments({
          'social.provider': 'facebook',
          ...baseDateQuery,
        }),
        User.countDocuments(directQuery),
      ])

      const allSources = []
      if (googleCount > 0) allSources.push('google')
      if (facebookCount > 0) allSources.push('facebook')
      if (directCount > 0) allSources.push('direct')

      const attributionData = await Promise.all(
        allSources.map(async (source) => {
          let sourceQuery = {}
          if (source === 'direct') {
            const directQueryBase = {
              'social.provider': { $nin: ['google', 'facebook'] },
            }
            if (filters.startDate || filters.endDate) {
              const dateFilter = {}
              dateFilter.createdAt = {}
              if (filters.startDate) {
                dateFilter.createdAt.$gte = new Date(filters.startDate)
              }
              if (filters.endDate) {
                dateFilter.createdAt.$lte = new Date(filters.endDate)
              }
              sourceQuery = { $and: [directQueryBase, dateFilter] }
            } else {
              sourceQuery = directQueryBase
            }
          } else {
            sourceQuery = { 'social.provider': source }
            if (filters.startDate || filters.endDate) {
              sourceQuery.createdAt = {}
              if (filters.startDate) {
                sourceQuery.createdAt.$gte = new Date(filters.startDate)
              }
              if (filters.endDate) {
                sourceQuery.createdAt.$lte = new Date(filters.endDate)
              }
            }
          }

          const sourceUsers = await User.find(sourceQuery)
            .select('_id createdAt dailyActivity')
            .lean()

          const installs = sourceUsers.length

          let d1Retention = 0
          if (sourceUsers.length > 0) {
            const retained = sourceUsers.filter((user) => {
              if (!user.dailyActivity?.activeDates || !user.createdAt)
                return false
              const userCreatedAt = new Date(user.createdAt)
              const d1Date = new Date(userCreatedAt)
              d1Date.setDate(d1Date.getDate() + 1)
              const d1DateStr = `${d1Date.getFullYear()}-${String(
                d1Date.getMonth() + 1
              ).padStart(2, '0')}-${String(d1Date.getDate()).padStart(2, '0')}`
              return user.dailyActivity.activeDates.includes(d1DateStr)
            }).length
            d1Retention = ((retained / sourceUsers.length) * 100).toFixed(2)
          }

          const filteredSourceUserIds = sourceUsers.map((u) => u._id)
          const [revenueData, costData] = await Promise.all([
            Transaction.aggregate([
              {
                $match: {
                  ...transactionFilter,
                  user: { $in: filteredSourceUserIds },
                  type: { $in: ['credit', 'reward'] },
                  status: 'completed',
                },
              },
              {
                $group: {
                  _id: null,
                  revenue: { $sum: '$amount' },
                },
              },
            ]),
            Transaction.aggregate([
              {
                $match: {
                  ...transactionFilter,
                  user: { $in: filteredSourceUserIds },
                  type: 'reward',
                  balanceType: 'coins',
                  status: 'completed',
                },
              },
              {
                $group: {
                  _id: null,
                  cost: { $sum: '$amount' },
                },
              },
            ]),
          ])

          const revenue = revenueData[0]?.revenue || 0
          const rewardCost = costData[0]?.cost || 0
          const margin = revenue - rewardCost
          const marginPercent =
            revenue > 0 ? ((margin / revenue) * 100).toFixed(2) : 0

          // Calculate marketing cost from Adjust callbacks (ad_spend activity)
          // Query Adjust callbacks for ad spend data for this source
          let marketingCost = 0
          try {
            const AdjustCallback = require('../models/AdjustCallback')
            const adSpendData = await AdjustCallback.aggregate([
              {
                $match: {
                  activityKind: 'ad_spend',
                  userId: { $in: filteredSourceUserIds },
                  ...(filters.startDate || filters.endDate ? {
                    createdAt: {
                      ...(filters.startDate ? { $gte: new Date(filters.startDate) } : {}),
                      ...(filters.endDate ? { $lte: new Date(filters.endDate) } : {})
                    }
                  } : {})
                }
              },
              {
                $group: {
                  _id: null,
                  totalCost: { $sum: '$revenue' } // Adjust uses 'revenue' field for ad spend amount
                }
              }
            ])
            marketingCost = adSpendData[0]?.totalCost || 0
          } catch (error) {
            console.warn(`⚠️ Attribution - Could not fetch marketing cost for ${source}:`, error.message)
            // If no ad spend data available, marketing cost remains 0
            marketingCost = 0
          }

          console.log(`📊 Attribution - ${source}: Installs=${installs}, Revenue=${revenue}, RewardCost=${rewardCost}, MarketingCost=${marketingCost}`)

          return {
            source: source || 'direct',
            installs: installs,
            d1Retention: parseFloat(d1Retention),
            revenue: revenue,
            rewardCost: rewardCost,
            marketingCost: marketingCost, // New field
            margin: margin,
            marginPercent: parseFloat(marginPercent),
          }
        })
      )

      res.json({
        success: true,
        data: {
          attribution: attributionData,
        },
      })
    } catch (error) {
      console.error('Error getting attribution data:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to get attribution data',
        error: error.message,
      })
    }
  }
)

// Helper functions for user styling
function getTierIcon(tier) {
  switch (tier.toLowerCase()) {
    case 'bronze':
      return 'https://c.animaapp.com/t66hdvJZ/img/---icon--star--3@2x.png'
    case 'gold':
      return 'https://c.animaapp.com/t66hdvJZ/img/---icon--star--9@2x.png'
    case 'platinum':
      return 'https://c.animaapp.com/t66hdvJZ/img/---icon--star--10@2x.png'
    default:
      return 'https://c.animaapp.com/t66hdvJZ/img/---icon--star--3@2x.png'
  }
}

function getTierBg(tier) {
  switch (tier.toLowerCase()) {
    case 'bronze':
      return '#ffefda'
    case 'gold':
      return '#fffddf'
    case 'platinum':
      return '#f4f4f4'
    default:
      return '#ffefda'
  }
}

function getTierBorder(tier) {
  switch (tier.toLowerCase()) {
    case 'bronze':
      return '#c77023'
    case 'gold':
      return '#f0c92e'
    case 'platinum':
      return '#9aa7b8'
    default:
      return '#c77023'
  }
}

function getTierColor(tier) {
  switch (tier.toLowerCase()) {
    case 'bronze':
      return '#f68d2b'
    case 'gold':
      return '#c7a20f'
    case 'platinum':
      return '#6f85a4'
    default:
      return '#f68d2b'
  }
}

function getStatusBg(status) {
  switch (status.toLowerCase()) {
    case 'active':
      return '#d3f8d2'
    case 'inactive':
      return '#ffdbd4'
    case 'paused':
      return '#fff2ab'
    default:
      return '#d3f8d2'
  }
}

function getStatusColor(status) {
  switch (status.toLowerCase()) {
    case 'active':
      return '#066657'
    case 'inactive':
      return '#f40202'
    case 'paused':
      return '#6f631b'
    default:
      return '#066657'
  }
}

/**
 * Get revenue by game - Separate endpoint for revenue data only
 * @route   GET /api/admin/revenue-by-game
 * @query   {string} startDate - Start date (ISO format)
 * @query   {string} endDate - End date (ISO format)
 * @query   {string} gameId - Filter by game ID
 * @query   {string} source - Filter by acquisition source
 * @query   {string} age - Filter by age group
 * @query   {string} gender - Filter by gender
 * @access  Admin
 */
router.get(
  '/revenue-by-game',
  adminAuth,
  [
    query('startDate')
      .optional()
      .isISO8601()
      .withMessage('Invalid start date format'),
    query('endDate')
      .optional()
      .isISO8601()
      .withMessage('Invalid end date format'),
    query('gameId').optional().isString(),
    query('source').optional().isString(),
    query('age').optional().isString(),
    query('gender').optional().isIn(['male', 'female', 'other']),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        })
      }

      const { startDate, endDate, gameId, source, age, gender } = req.query

      // If no date range provided, retrieve all data (no date filter)
      let start = startDate ? new Date(startDate) : undefined
      let end = endDate ? new Date(endDate) : undefined

      const filters = {
        startDate: start ? start.toISOString() : undefined,
        endDate: end ? end.toISOString() : undefined,
        gameId,
        source,
        age,
        gender,
      }

      const userFilter = await buildUserFilter(filters)

      // Get filtered user IDs to apply to transaction queries
      let filteredUserIds = []
      if (Object.keys(userFilter).length > 0) {
        const filteredUsers = await User.find(userFilter).select('_id').lean()
        filteredUserIds = filteredUsers.map((u) => u._id)
      }

      // Build transaction filter with user IDs if source/gender/age filters are applied
      const transactionFilter = buildTransactionFilter(filters)
      if (filteredUserIds.length > 0) {
        transactionFilter.user = { $in: filteredUserIds }
      } else if (filters.source || filters.gender || filters.age) {
        // If filters are applied but no users match, set empty array to return 0
        transactionFilter.user = { $in: [] }
      }

      // ==================== REVENUE VS REWARD COST BY GAME ====================
      const gamesWithRevenue = await Game.find({ isActive: true })
        .select('gameId title metadata analytics')
        .lean()

      const revenueTable = await Promise.all(
        gamesWithRevenue.map(async (game) => {
          // Build game-specific transaction filter (without gameId filter to avoid conflict)
          const gameTransactionFilter = { ...transactionFilter }
          if (gameTransactionFilter.$or) {
            delete gameTransactionFilter.$or
          }
          gameTransactionFilter.$or = [
            { 'metadata.gameId': game.gameId },
            { referenceId: new RegExp(game.gameId, 'i') },
            { description: new RegExp(game.gameId, 'i') },
          ]

          // Get revenue from transactions (offer completions, etc.)
          const revenueData = await Transaction.aggregate([
            {
              $match: {
                ...gameTransactionFilter,
                type: { $in: ['credit', 'reward'] },
                status: 'completed',
              },
            },
            {
              $group: {
                _id: null,
                revenue: { $sum: '$amount' },
              },
            },
          ])

          // Get reward cost from transactions
          const rewardCostData = await Transaction.aggregate([
            {
              $match: {
                ...gameTransactionFilter,
                type: 'reward',
                balanceType: 'coins',
                status: 'completed',
              },
            },
            {
              $group: {
                _id: null,
                cost: { $sum: '$amount' },
              },
            },
          ])

          const revenue = revenueData[0]?.revenue || game.metadata?.revenue || 0
          const rewardCost =
            rewardCostData[0]?.cost || game.metadata?.rewardCost || 0
          const margin = revenue - rewardCost
          const marginPercent =
            revenue > 0 ? ((margin / revenue) * 100).toFixed(2) : 0

          // Calculate D7 retention for this game (apply user filter)
          const gameUsersForRetention = await User.find({
            'games.gameId': game.gameId,
            'games.installedAt': { $exists: true },
            ...userFilter,
          })
            .select('dailyActivity createdAt')
            .lean()

          let d7Retention = 0
          if (gameUsersForRetention.length > 0) {
            const retained = gameUsersForRetention.filter((user) => {
              if (!user.dailyActivity?.activeDates) return false
              const userCreatedAt = new Date(user.createdAt)
              const d7Date = new Date(userCreatedAt)
              d7Date.setDate(d7Date.getDate() + 7)
              const d7DateStr = `${d7Date.getFullYear()}-${String(
                d7Date.getMonth() + 1
              ).padStart(2, '0')}-${String(d7Date.getDate()).padStart(2, '0')}`
              return user.dailyActivity.activeDates.includes(d7DateStr)
            }).length
            d7Retention = (
              (retained / gameUsersForRetention.length) *
              100
            ).toFixed(2)
          }

          return {
            gameId: game.gameId,
            title: game.title,
            revenue: revenue,
            rewardCost: rewardCost,
            margin: margin,
            marginPercent: parseFloat(marginPercent),
            d7Retention: parseFloat(d7Retention),
            performance:
              parseFloat(marginPercent) > 0 ? 'positive' : 'negative',
          }
        })
      )

      // Sort by revenue descending
      revenueTable.sort((a, b) => b.revenue - a.revenue)

      // Calculate totals
      const totalRevenue = revenueTable.reduce(
        (sum, game) => sum + (game.revenue || 0),
        0
      )
      const totalRewardCost = revenueTable.reduce(
        (sum, game) => sum + (game.rewardCost || 0),
        0
      )
      const totalMargin = totalRevenue - totalRewardCost
      const totalMarginPercent =
        totalRevenue > 0 ? ((totalMargin / totalRevenue) * 100).toFixed(2) : 0

      res.json({
        success: true,
        data: {
          revenueByGame: revenueTable,
          totals: {
            totalRevenue,
            totalRewardCost,
            totalMargin,
            totalMarginPercent: parseFloat(totalMarginPercent),
          },
          filters: {
            startDate: filters.startDate,
            endDate: filters.endDate,
            gameId: filters.gameId || null,
            source: filters.source || null,
            age: filters.age || null,
            gender: filters.gender || null,
          },
        },
      })
    } catch (error) {
      console.error('Error getting revenue by game:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to get revenue by game',
        error: error.message,
      })
    }
  }
)

module.exports = router
