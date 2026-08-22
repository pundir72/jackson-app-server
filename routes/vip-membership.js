const express = require('express');
const router = express.Router();
const { query, body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const User = require('../models/User');
const VIPTier = require('../models/VIPTier');
const VIPSubscription = require('../models/VIPSubscription');
const { getVIPPricing } = require('../utils/pricing');
const { getUserVIPBenefits } = require('../utils/vipBenefits');
const { verifyAppStoreReceipt } = require('../utils/appStoreVerification');

// ==================== VIP MEMBERSHIP SCREEN ====================

/**
 * @route   GET /api/vip/membership-screen
 * @desc    Get complete VIP Membership screen data
 * @access  Private
 */
router.get('/membership-screen', auth, [
  query('region').optional().isString().withMessage('Region must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { region = 'US' } = req.query;
    const userId = req.user.userId;

    // Get user's current VIP status
    const user = await User.findById(userId).select('vip firstName lastName');
    const activeSubscription = await VIPSubscription.getActiveSubscription(userId);
    
    // Get pricing and tiers
    const pricing = await getVIPPricing(region, userId);
    const tiers = await VIPTier.getActiveTiers();
    
    // Format tiers for membership screen
    const membershipTiers = tiers.map(tier => ({
      id: tier.tierId,
      name: tier.name,
      description: tier.description,
      benefits: tier.getBenefitsSummary(),
      pricing: pricing.pricing[tier.tierId],
      features: tier.features,
      order: tier.order,
      isPopular: pricing.pricing[tier.tierId]?.trending === 'yearly',
      isActive: activeSubscription?.tier === tier.tierId
    }));

    // Get active plan data if user has subscription
    let activePlan = null;
    if (activeSubscription && activeSubscription.isActive()) {
      const tier = tiers.find(t => t.tierId === activeSubscription.tier);
      activePlan = {
        tier: activeSubscription.tier,
        plan: activeSubscription.plan,
        name: tier?.name || activeSubscription.tier,
        renewalDate: activeSubscription.endDate,
        isExpiringSoon: activeSubscription.isExpiringSoon(7),
        autoRenew: activeSubscription.autoRenew,
        nextBillingDate: activeSubscription.nextBillingDate,
        status: activeSubscription.status
      };
    }

    // Get comparison table data
    const comparisonData = tiers.map(tier => ({
      tier: tier.tierId,
      name: tier.name,
      features: {
        noAds: tier.features.noAds,
        xpMultiplier: tier.features.xpMultiplier,
        weeklyXpBonus: tier.features.weeklyXpBonus,
        bonusSpins: tier.features.bonusSpins,
        prioritySupport: tier.features.prioritySupport,
        earlyAccess: tier.features.earlyAccess,
        unlimitedSpins: tier.features.unlimitedSpins
      },
      pricing: pricing.pricing[tier.tierId]
    }));

    res.json({
      success: true,
      data: {
        user: {
          name: `${user.firstName} ${user.lastName}`,
            currentTier: user.vip?.level || 'free',
          isActive: !!(user.vip?.isActive || activeSubscription)
        },
        activePlan,
        tiers: membershipTiers.sort((a, b) => a.order - b.order),
        comparison: comparisonData,
        region: pricing.region,
        currency: pricing.currency,
        symbol: pricing.symbol,
        billingDisclosure: {
          text: "Subscription automatically renews unless auto-renew is turned off at least 24 hours before the end of the current period. Your account will be charged for renewal within 24 hours prior to the end of the current period. You can manage and cancel your subscriptions by going to your account settings on the App Store or Google Play Store.",
          autoRenew: true,
          cancellationPolicy: "You can cancel anytime from your account settings"
        }
      }
    });
  } catch (error) {
    console.error('Error getting VIP membership screen data:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get VIP membership screen data'
    });
  }
});

/**
 * @route   GET /api/vip/active-plan
 * @desc    Get active plan card data
 * @access  Private
 */
router.get('/active-plan', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const activeSubscription = await VIPSubscription.getActiveSubscription(userId);
    
    if (!activeSubscription || !activeSubscription.isActive()) {
      return res.json({
        success: true,
        data: {
          hasActivePlan: false,
          activePlan: null
        }
      });
    }

    const tier = await VIPTier.getTierById(activeSubscription.tier);
    
    res.json({
      success: true,
      data: {
        hasActivePlan: true,
        activePlan: {
          tier: activeSubscription.tier,
          plan: activeSubscription.plan,
          name: tier?.name || activeSubscription.tier,
          renewalDate: activeSubscription.endDate,
          isExpiringSoon: activeSubscription.isExpiringSoon(7),
          autoRenew: activeSubscription.autoRenew,
          nextBillingDate: activeSubscription.nextBillingDate,
          status: activeSubscription.status,
          badge: {
            text: 'Active Plan',
            color: '#4CAF50'
          }
        }
      }
    });
  } catch (error) {
    console.error('Error getting active plan:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get active plan'
    });
  }
});

/**
 * @route   GET /api/vip/comparison-table
 * @desc    Get detailed comparison table data
 * @access  Private
 */
router.get('/comparison-table', auth, [
  query('region').optional().isString().withMessage('Region must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { region = 'US' } = req.query;
    const pricing = await getVIPPricing(region);
    const tiers = await VIPTier.getActiveTiers();
    
    const comparisonTable = tiers.map(tier => ({
      tier: tier.tierId,
      name: tier.name,
      pricing: pricing.pricing[tier.tierId],
      features: {
        noAds: {
          enabled: tier.features.noAds,
          description: 'Ad-free experience'
        },
        xpMultiplier: {
          value: tier.features.xpMultiplier,
          description: `${tier.features.xpMultiplier}x XP multiplier`
        },
        weeklyXpBonus: {
          value: tier.features.weeklyXpBonus,
          description: `+${tier.features.weeklyXpBonus} weekly XP bonus`
        },
        bonusSpins: {
          value: tier.features.bonusSpins,
          description: `+${tier.features.bonusSpins} bonus spins`
        },
        prioritySupport: {
          enabled: tier.features.prioritySupport,
          description: 'Priority customer support'
        },
        earlyAccess: {
          enabled: tier.features.earlyAccess,
          description: 'Early access to new features'
        },
        unlimitedSpins: {
          enabled: tier.features.unlimitedSpins,
          description: 'Unlimited daily spins'
        }
      }
    }));

    res.json({
      success: true,
      data: {
        comparison: comparisonTable.sort((a, b) => a.order - b.order),
        region: pricing.region,
        currency: pricing.currency,
        symbol: pricing.symbol
      }
    });
  } catch (error) {
    console.error('Error getting comparison table:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get comparison table'
    });
  }
});

/**
 * @route   GET /api/vip/xp-tooltip
 * @desc    Get XP calculation explanation for tooltip
 * @access  Private
 */
router.get('/xp-tooltip', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const userBenefits = await getUserVIPBenefits(userId);
    
    const xpExplanation = {
      title: 'XP Calculation Explained',
      description: 'Your XP is calculated based on your VIP tier and activities:',
      calculation: {
        baseXP: 'Base XP from activities',
        vipMultiplier: userBenefits.xpMultiplier,
        weeklyBonus: userBenefits.weeklyXpBonus,
        totalFormula: 'Total XP = (Base XP × VIP Multiplier) + Weekly Bonus'
      },
      examples: [
        {
          activity: 'Complete a survey',
          baseXP: 25,
          withVIP: Math.round(25 * userBenefits.xpMultiplier + userBenefits.weeklyXpBonus),
          description: `Survey completion with ${userBenefits.tier} VIP benefits`
        },
        {
          activity: 'Play a game',
          baseXP: 10,
          withVIP: Math.round(10 * userBenefits.xpMultiplier + userBenefits.weeklyXpBonus),
          description: `Game completion with ${userBenefits.tier} VIP benefits`
        }
      ],
      currentTier: userBenefits.tier,
      benefits: {
        multiplier: userBenefits.xpMultiplier,
        weeklyBonus: userBenefits.weeklyXpBonus,
        isActive: userBenefits.isActive
      }
    };

    res.json({
      success: true,
      data: xpExplanation
    });
  } catch (error) {
    console.error('Error getting XP tooltip:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get XP tooltip'
    });
  }
});

/**
 * @route   GET /api/vip/legal-disclaimer
 * @desc    Get legal disclaimer text
 * @access  Private
 */
router.get('/legal-disclaimer', auth, async (req, res) => {
  try {
    const disclaimer = {
      title: 'Subscription Terms and Conditions',
      sections: [
        {
          title: 'Automatic Renewal',
          content: 'Your subscription will automatically renew unless auto-renew is turned off at least 24 hours before the end of the current period.'
        },
        {
          title: 'Billing',
          content: 'Your account will be charged for renewal within 24 hours prior to the end of the current period.'
        },
        {
          title: 'Cancellation',
          content: 'You can manage and cancel your subscriptions by going to your account settings on the App Store or Google Play Store.'
        },
        {
          title: 'Refunds',
          content: 'Refunds are handled by Apple/Google according to their respective policies. Contact support for assistance.'
        },
        {
          title: 'Terms of Service',
          content: 'By subscribing, you agree to our Terms of Service and Privacy Policy.'
        }
      ],
      fullText: "All subscriptions renew automatically unless canceled at least 24 hours before the end of the current period. Your account will be charged for renewal within 24 hours prior to the end of the current period. You can manage and cancel your subscriptions by going to your account settings on the App Store or Google Play Store. Refunds are handled by Apple/Google according to their respective policies.",
      lastUpdated: new Date().toISOString()
    };

    res.json({
      success: true,
      data: disclaimer
    });
  } catch (error) {
    console.error('Error getting legal disclaimer:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get legal disclaimer'
    });
  }
});

/**
 * @route   POST /api/vip/initiate-purchase
 * @desc    Initiate App Store purchase (iOS IAP)
 * @access  Private
 */
router.post('/initiate-purchase', auth, [
  body('tierId').isIn(['bronze', 'gold', 'platinum']).withMessage('Invalid tier ID'),
  body('plan').isIn(['weekly', 'monthly', 'yearly']).withMessage('Invalid plan'),
  body('region').optional().isString().withMessage('Region must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { tierId, plan, region = 'US' } = req.body;
    const userId = req.user.userId;

    // An active subscriber may change tier/plan (e.g. Gold -> Platinum).
    // Only an identical repurchase is rejected; the previous subscription is
    // closed in complete-purchase once Apple verifies the new transaction.
    const activeSubscription = await VIPSubscription.getActiveSubscription(userId);
    const isTierChange = !!(activeSubscription && activeSubscription.isActive());
    if (isTierChange && activeSubscription.tier === tierId && activeSubscription.plan === plan) {
      return res.status(400).json({
        success: false,
        error: 'You are already subscribed to this tier and plan'
      });
    }

    // Get pricing for the selected tier and plan
    const pricing = await getVIPPricing(region, userId);
    const tierPricing = pricing.pricing[tierId];
    
    if (!tierPricing || !tierPricing[plan]) {
      return res.status(400).json({
        success: false,
        error: 'Pricing not available for selected tier and plan'
      });
    }

    // Create purchase session
    const purchaseSession = {
      userId,
      tierId,
      plan,
      region,
      amount: tierPricing[plan].amount, // Extract just the amount number
      currency: pricing.currency,
      sessionId: `purchase_${Date.now()}_${userId}`,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      status: 'pending'
    };

    // Store purchase session (in production, use Redis or database)
    // For now, we'll return the session data
    res.json({
      success: true,
      data: {
        sessionId: purchaseSession.sessionId,
        tierId: purchaseSession.tierId,
        plan: purchaseSession.plan,
        amount: purchaseSession.amount,
        currency: purchaseSession.currency,
        region: purchaseSession.region,
        expiresAt: purchaseSession.expiresAt,
        appStoreProductId: `${tierId}_${plan}`, // iOS App Store product ID
        pricing: tierPricing[plan], // Full pricing details for frontend
        tierChange: isTierChange
          ? { fromTier: activeSubscription.tier, fromPlan: activeSubscription.plan }
          : null,
        instructions: {
          title: 'Complete Purchase',
          description: 'Use the session ID to complete your purchase in the App Store',
          steps: [
            '1. Use the provided session ID in your iOS app',
            '2. Initiate App Store purchase with the product ID',
            '3. Complete payment in App Store',
            '4. Verify purchase with our backend'
          ]
        }
      }
    });
  } catch (error) {
    console.error('Error initiating purchase:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to initiate purchase'
    });
  }
});

/**
 * @route   POST /api/vip/complete-purchase
 * @desc    Complete App Store purchase and create subscription
 * @access  Private
 */
router.post('/complete-purchase', auth, [
  body('sessionId').notEmpty().withMessage('Session ID is required'),
  body('appStoreReceipt').notEmpty().withMessage('App Store receipt is required'),
  body('transactionId').notEmpty().withMessage('Transaction ID is required'),
  body('productId').notEmpty().withMessage('Product ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { sessionId, appStoreReceipt, transactionId, productId } = req.body;
    const userId = req.user.userId;

    // Verify the session exists and is valid
    // In production, you would validate this against your session store
    if (!sessionId.startsWith('purchase_')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid session ID'
      });
    }

    // Extract tier and plan from product ID (format: tier_plan)
    const [tierId, plan] = productId.split('_');
    if (!['bronze', 'gold', 'platinum'].includes(tierId) || !['weekly', 'monthly', 'yearly'].includes(plan)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid product ID'
      });
    }

    // Verify App Store receipt (in production, use Apple's verification service)
    const receiptVerification = await verifyAppStoreReceipt(appStoreReceipt, productId);
    if (!receiptVerification.valid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid App Store receipt',
        details: receiptVerification.error,
        appleStatus: receiptVerification.status
      });
    }

    if (receiptVerification.transactionId !== transactionId) {
      return res.status(400).json({
        success: false,
        error: 'The App Store transaction does not match the verified receipt'
      });
    }

    // Apple transactions are immutable. Treat retries as idempotent so a slow
    // network response cannot turn a successful App Store purchase into a
    // visible "Payment Failed" state.
    const completedPurchase = await VIPSubscription.findOne({
      'metadata.transactionId': receiptVerification.transactionId
    });
    if (completedPurchase) {
      if (completedPurchase.userId.toString() !== userId.toString()) {
        return res.status(409).json({
          success: false,
          error: 'This App Store transaction belongs to another account'
        });
      }
      return res.json({
        success: true,
        data: {
          subscription: completedPurchase.getSummary(),
          message: 'Subscription was already activated'
        }
      });
    }

    // A verified purchase from a user with an active subscription is a
    // tier/plan change: close the previous subscription and activate the new
    // one. Identical repurchases were already rejected at initiate-purchase,
    // and true duplicates are caught by the transaction idempotency check
    // above, so reaching here with the same tier+plan means a genuine new
    // Apple transaction that must not be discarded.
    const existingSubscription = await VIPSubscription.getActiveSubscription(userId);
    if (existingSubscription && existingSubscription.isActive()) {
      existingSubscription.status = 'cancelled';
      existingSubscription.autoRenew = false;
      existingSubscription.endDate = new Date();
      existingSubscription.metadata.replacedByTransactionId = receiptVerification.transactionId;
      existingSubscription.metadata.replacedAt = new Date();
      existingSubscription.metadata.replacementReason = 'tier_change';
      await existingSubscription.save();
    }

    // Get pricing for the tier and plan
    const pricing = await getVIPPricing('US', userId);
    const tierPricing = pricing.pricing[tierId];
    const amount = tierPricing[plan].amount; // Extract just the amount number

    // Calculate subscription dates
    const startDate = new Date();
    const endDate = new Date();
    
    switch (plan) {
      case 'weekly':
        endDate.setDate(endDate.getDate() + 7);
        break;
      case 'monthly':
        endDate.setMonth(endDate.getMonth() + 1);
        break;
      case 'yearly':
        endDate.setFullYear(endDate.getFullYear() + 1);
        break;
    }

    // Create VIP subscription
    const subscription = new VIPSubscription({
      userId,
      tier: tierId,
      plan,
      status: 'active',
      amount,
      currency: pricing.currency,
      startDate,
      endDate,
      nextBillingDate: endDate,
      autoRenew: true,
      metadata: {
        region: 'US',
        source: 'ios_app',
        transactionId: receiptVerification.transactionId,
        originalTransactionId: receiptVerification.originalTransactionId,
        productId,
        appStoreEnvironment: receiptVerification.environment,
        sessionId
      }
    });

    await subscription.save();

    // Update user's VIP status
    await User.findByIdAndUpdate(userId, {
      $set: {
        'vip.level': tierId,
        'vip.isActive': true
      }
    });

    res.json({
      success: true,
      data: {
        subscription: subscription.getSummary(),
        message: 'Subscription activated successfully',
        benefits: {
          tier: tierId,
          plan,
          startDate,
          endDate,
          autoRenew: true
        }
      }
    });
  } catch (error) {
    console.error('Error completing purchase:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to complete purchase'
    });
  }
});

/**
 * @route   POST /api/vip/verify-purchase
 * @desc    Verify App Store purchase (for iOS app)
 * @access  Private
 */
router.post('/verify-purchase', auth, [
  body('receiptData').notEmpty().withMessage('Receipt data is required'),
  body('productId').notEmpty().withMessage('Product ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { receiptData, productId } = req.body;
    const userId = req.user.userId;

    // Verify with App Store (in production, use Apple's verification service)
    const verification = await verifyAppStoreReceipt(receiptData, productId);
    
    if (!verification.valid) {
      return res.status(400).json({
        success: false,
        error: 'Purchase verification failed',
        details: verification.error
      });
    }

    res.json({
      success: true,
      data: {
        valid: true,
        transactionId: verification.transactionId,
        productId: verification.productId,
        purchaseDate: verification.purchaseDate,
        expiresDate: verification.expiresDate
      }
    });
  } catch (error) {
    console.error('Error verifying purchase:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to verify purchase'
    });
  }
});

/**
 * @route   GET /api/vip/purchase-status/:sessionId
 * @desc    Get purchase status for a session
 * @access  Private
 */
router.get('/purchase-status/:sessionId', auth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.userId;

    // In production, check your session store
    // For now, we'll check if a subscription was created with this session
    const subscription = await VIPSubscription.findOne({
      userId,
      'metadata.sessionId': sessionId
    });

    if (!subscription) {
      return res.json({
        success: true,
        data: {
          status: 'pending',
          message: 'Purchase not completed yet'
        }
      });
    }

    res.json({
      success: true,
      data: {
        status: subscription.status,
        subscription: subscription.getSummary(),
        message: subscription.status === 'active' ? 'Purchase completed successfully' : 'Purchase processing'
      }
    });
  } catch (error) {
    console.error('Error getting purchase status:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get purchase status'
    });
  }
});

module.exports = router;
