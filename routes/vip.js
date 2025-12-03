const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const protect = require('../middleware/auth');
const User = require('../models/User');
const VIPTier = require('../models/VIPTier');
const VIPSubscription = require('../models/VIPSubscription');
const { getVIPPricing, calculateSubscriptionCost, getTierComparison, validatePricing } = require('../utils/pricing');
const { applyWeeklyVIPBenefits, getWeeklyBenefitsStatus, manuallyApplyWeeklyBenefits } = require('../utils/weeklyBenefits');

// Get all VIP tiers with pricing
router.get('/tiers', async (req, res) => {
    try {
        const { region = 'US' } = req.query;
        const pricing = await getVIPPricing(region);
        const tiers = await VIPTier.getActiveTiers();
        
        const tiersWithPricing = tiers.map(tier => ({
            id: tier.tierId,
            name: tier.name,
            description: tier.description,
            benefits: tier.getBenefitsSummary(),
            pricing: pricing.pricing[tier.tierId],
            features: tier.features,
            order: tier.order
        }));
        
        res.json({
            success: true,
            data: {
                region: pricing.region,
                currency: pricing.currency,
                symbol: pricing.symbol,
                tiers: tiersWithPricing,
                lastUpdated: pricing.lastUpdated
            }
        });
    } catch (error) {
        console.error('Error getting VIP tiers:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get VIP tiers',
            error: error.message 
        });
    }
});

// Get specific tier details
router.get('/tiers/:tierId', async (req, res) => {
    try {
        const { tierId } = req.params;
        const { region = 'US' } = req.query;
        
        const tier = await VIPTier.getTierById(tierId);
        if (!tier) {
            return res.status(404).json({ 
                success: false, 
                message: 'VIP tier not found' 
            });
        }
        
        const pricing = await getVIPPricing(region);
        const tierPricing = pricing.pricing[tierId];
        
        res.json({
            success: true,
            data: {
                id: tier.tierId,
                name: tier.name,
                description: tier.description,
                benefits: tier.getBenefitsSummary(),
                pricing: tierPricing,
                features: tier.features,
                order: tier.order
            }
        });
    } catch (error) {
        console.error('Error getting VIP tier:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get VIP tier',
            error: error.message 
        });
    }
});

// Get tier benefits
router.get('/benefits/:tierId', async (req, res) => {
    try {
        const { tierId } = req.params;
        
        const tier = await VIPTier.getTierById(tierId);
        if (!tier) {
            return res.status(404).json({ 
                success: false, 
                message: 'VIP tier not found' 
            });
        }
        
        res.json({
            success: true,
            data: {
                tierId: tier.tierId,
                tierName: tier.name,
                benefits: tier.getBenefitsSummary(),
                features: tier.features
            }
        });
    } catch (error) {
        console.error('Error getting tier benefits:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get tier benefits',
            error: error.message 
        });
    }
});

// Get VIP pricing
router.get('/pricing', async (req, res) => {
    try {
        const { region = 'US' } = req.query;
        const pricing = await getVIPPricing(region);
        
        res.json({
            success: true,
            data: pricing
        });
    } catch (error) {
        console.error('Error getting VIP pricing:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get VIP pricing',
            error: error.message 
        });
    }
});

// Get tier comparison
router.get('/comparison', async (req, res) => {
    try {
        const { region = 'US' } = req.query;
        const comparison = await getTierComparison(region);
        
        res.json({
            success: true,
            data: comparison
        });
    } catch (error) {
        console.error('Error getting tier comparison:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get tier comparison',
            error: error.message 
        });
    }
});

// Get current user's VIP status
router.get('/status', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('vip');
        const activeSubscription = await VIPSubscription.getActiveSubscription(req.user.userId);
        
        res.json({
            success: true,
            data: {
                currentTier: user.vip.level || 'free',
                isActive: user.vip.isActive || false,
                subscription: activeSubscription ? activeSubscription.getSummary() : null,
                benefits: user.vip.benefits || []
            }
        });
    } catch (error) {
        console.error('Error getting VIP status:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get VIP status',
            error: error.message 
        });
    }
});

// Get user's subscription history
router.get('/subscriptions', protect, async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        const subscriptions = await VIPSubscription.getUserSubscriptions(req.user.userId, parseInt(limit));
        
        res.json({
            success: true,
            data: subscriptions.map(sub => sub.getSummary())
        });
    } catch (error) {
        console.error('Error getting subscription history:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get subscription history',
            error: error.message 
        });
    }
});

// Calculate subscription cost
router.post('/calculate-cost', [
    body('tierId').isIn(['bronze', 'gold', 'platinum']).withMessage('Invalid tier ID'),
    body('plan').isIn(['weekly', 'monthly', 'yearly']).withMessage('Invalid plan'),
    body('region').optional().isString().withMessage('Invalid region')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }
        
        const { tierId, plan, region = 'US' } = req.body;
        const userId = req.user ? req.user.userId : null;
        
        const cost = await calculateSubscriptionCost(tierId, plan, region, userId);
        
        res.json({
            success: true,
            data: cost
        });
    } catch (error) {
        console.error('Error calculating subscription cost:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to calculate subscription cost',
            error: error.message 
        });
    }
});

// Initiate VIP subscription (alias for upgrade)
router.post('/subscribe', protect, [
    body('plan').isIn(['weekly', 'monthly', 'yearly']).withMessage('Invalid plan. Must be: weekly, monthly, or yearly'),
    body('region').optional().isString().withMessage('Invalid region')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }
        
        // Accept both 'tier' and 'tierId' for backward compatibility
        const tierId = req.body.tierId || req.body.tier;
        if (!tierId) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                error: 'Tier ID is required. Use either "tier" or "tierId" field.'
            });
        }
        
        const { plan, region = 'US' } = req.body;
        const userId = req.user.userId;
        
        // Normalize tierId to lowercase
        const normalizedTierId = tierId.toLowerCase();
        
        // Validate tier exists and is active
        const tier = await VIPTier.getTierById(normalizedTierId);
        if (!tier || !tier.active) {
            // Get available tiers for error message
            const availableTiers = await VIPTier.getActiveTiers();
            const tierIds = availableTiers.map(t => t.tierId).join(', ');
            
            return res.status(400).json({
                success: false,
                message: 'Invalid tier ID',
                error: `Tier '${tierId}' not found or inactive. Available tiers: ${tierIds || 'bronze, gold, platinum'}`,
                availableTiers: availableTiers.map(t => t.tierId)
            });
        }
        
        // Check if user already has an active subscription
        const existingSubscription = await VIPSubscription.getActiveSubscription(userId);
        if (existingSubscription) {
            return res.status(400).json({
                success: false,
                message: 'User already has an active VIP subscription'
            });
        }
        
        // Check if user already has a pending subscription (prevent duplicates)
        const existingPending = await VIPSubscription.findOne({
            userId,
            status: 'pending'
        }).sort({ createdAt: -1 });
        if (existingPending) {
            return res.status(200).json({
                success: true,
                message: 'Pending VIP subscription already exists. Complete payment to activate.',
                data: {
                    subscriptionId: existingPending._id,
                    tierId: existingPending.tier,
                    plan: existingPending.plan,
                    amount: existingPending.amount,
                    currency: existingPending.currency,
                    paymentIntentId: existingPending.paymentIntentId || null,
                    nextStep: existingPending.paymentIntentId ? 'payment_confirmation' : 'payment_required'
                }
            });
        }
        
        // Calculate cost
        const cost = await calculateSubscriptionCost(normalizedTierId, plan, region, userId);
        
        // Create pending subscription
        const subscription = new VIPSubscription({
            userId,
            tier: normalizedTierId,
            plan,
            status: 'pending',
            amount: cost.amount,
            currency: cost.currency,
            startDate: new Date(),
            endDate: new Date(Date.now() + (plan === 'yearly' ? 365 : plan === 'monthly' ? 30 : 7) * 24 * 60 * 60 * 1000),
            metadata: {
                region: region,
                source: 'app',
                campaign: null,
                referrer: null
            }
        });
        
        await subscription.save();
        
        res.json({
            success: true,
            message: 'VIP subscription initiated',
            data: {
                subscriptionId: subscription._id,
                tierId: normalizedTierId,
                plan,
                amount: cost.amount,
                currency: cost.currency,
                paymentIntentId: subscription.paymentIntentId,
                nextStep: 'payment_required'
            }
        });
    } catch (error) {
        console.error('Error initiating VIP subscription:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to initiate VIP subscription',
            error: error.message 
        });
    }
});

// Initiate VIP upgrade (create pending subscription)
router.post('/upgrade', protect, [
    body('plan').isIn(['weekly', 'monthly', 'yearly']).withMessage('Invalid plan. Must be: weekly, monthly, or yearly'),
    body('region').optional().isString().withMessage('Invalid region')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }
        
        // Accept both 'tier' and 'tierId' for backward compatibility
        const tierId = req.body.tierId || req.body.tier;
        if (!tierId) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                error: 'Tier ID is required. Use either "tier" or "tierId" field.'
            });
        }
        
        const { plan, region = 'US' } = req.body;
        const userId = req.user.userId;
        
        // Normalize tierId to lowercase
        const normalizedTierId = tierId.toLowerCase();
        
        // Validate tier exists and is active
        const tier = await VIPTier.getTierById(normalizedTierId);
        if (!tier || !tier.active) {
            // Get available tiers for error message
            const availableTiers = await VIPTier.getActiveTiers();
            const tierIds = availableTiers.map(t => t.tierId).join(', ');
            
            return res.status(400).json({
                success: false,
                message: 'Invalid tier ID',
                error: `Tier '${tierId}' not found or inactive. Available tiers: ${tierIds || 'bronze, gold, platinum'}`,
                availableTiers: availableTiers.map(t => t.tierId)
            });
        }
        
        // Check if user already has an active subscription
        const existingSubscription = await VIPSubscription.getActiveSubscription(userId);
        if (existingSubscription) {
            return res.status(400).json({
                success: false,
                message: 'User already has an active VIP subscription'
            });
        }
        
        // Check if user already has a pending subscription (prevent duplicates)
        const existingPending = await VIPSubscription.findOne({
            userId,
            status: 'pending'
        }).sort({ createdAt: -1 });
        if (existingPending) {
            return res.status(200).json({
                success: true,
                message: 'Pending VIP subscription already exists. Complete payment to activate.',
                data: {
                    subscriptionId: existingPending._id,
                    tierId: existingPending.tier,
                    plan: existingPending.plan,
                    amount: existingPending.amount,
                    currency: existingPending.currency,
                    paymentIntentId: existingPending.paymentIntentId || null,
                    nextStep: existingPending.paymentIntentId ? 'payment_confirmation' : 'payment_required'
                }
            });
        }
        
        // Calculate cost
        const cost = await calculateSubscriptionCost(normalizedTierId, plan, region, userId);
        
        // Create pending subscription
        const subscription = new VIPSubscription({
            userId,
            tier: normalizedTierId,
            plan,
            status: 'pending',
            amount: cost.amount,
            currency: cost.currency,
            startDate: new Date(),
            endDate: new Date(Date.now() + (plan === 'yearly' ? 365 : plan === 'monthly' ? 30 : 7) * 24 * 60 * 60 * 1000),
            metadata: {
                region: region,
                source: 'app',
                campaign: null,
                referrer: null
            }
        });
        
        await subscription.save();
        
        res.json({
            success: true,
            message: 'VIP upgrade initiated',
            data: {
                subscriptionId: subscription._id,
                tierId: normalizedTierId,
                plan,
                amount: cost.amount,
                currency: cost.currency,
                paymentIntentId: subscription.paymentIntentId,
                nextStep: 'payment_required'
            }
        });
    } catch (error) {
        console.error('Error initiating VIP upgrade:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to initiate VIP upgrade',
            error: error.message 
        });
    }
});

// Cancel subscription
router.post('/cancel', protect, [
    body('reason').optional().isString().withMessage('Invalid cancellation reason')
], async (req, res) => {
    try {
        const { reason = 'User requested' } = req.body;
        const userId = req.user.userId;
        
        const subscription = await VIPSubscription.getActiveSubscription(userId);
        if (!subscription) {
            return res.status(404).json({
                success: false,
                message: 'No active subscription found'
            });
        }
        
        await subscription.cancel(reason);
        
        // Update user's VIP status
        await User.findByIdAndUpdate(userId, {
            $set: {
                'vip.level': 'free',
                'vip.isActive': false,
                'vip.expires': null
            }
        });
        
        res.json({
            success: true,
            message: 'Subscription cancelled successfully',
            data: {
                subscriptionId: subscription._id,
                cancellationDate: subscription.cancellationDate,
                reason: subscription.cancellationReason
            }
        });
    } catch (error) {
        console.error('Error cancelling subscription:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to cancel subscription',
            error: error.message 
        });
    }
});

// Get VIP benefits (legacy endpoint for backward compatibility)
router.get('/benefits', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('vip');
        const activeSubscription = await VIPSubscription.getActiveSubscription(req.user.userId);
        
        let benefits = [];
        if (activeSubscription) {
            const tier = await VIPTier.getTierById(activeSubscription.tier);
            if (tier) {
                benefits = tier.getBenefitsSummary();
            }
        }
        
        res.json({
            success: true,
            data: benefits
        });
    } catch (error) {
        console.error('Error getting VIP benefits:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get VIP benefits',
            error: error.message 
        });
    }
});

// Get VIP plans for "Check Plans" button (wallet screen integration)
router.get('/plans', protect, async (req, res) => {
    try {
        const { region = 'US' } = req.query;
        const userId = req.user.userId;
        
        // Get current user's VIP status
        const user = await User.findById(userId).select('vip');
        const activeSubscription = await VIPSubscription.getActiveSubscription(userId);
        
        // Get pricing and tiers
        const pricing = await getVIPPricing(region, userId);
        const tiers = await VIPTier.getActiveTiers();
        
        // Format plans data for wallet screen
        const plans = tiers.map(tier => ({
            id: tier.tierId,
            name: tier.name,
            description: tier.description,
            benefits: tier.getBenefitsSummary(),
            pricing: pricing.pricing[tier.tierId],
            features: tier.features,
            order: tier.order,
            isPopular: pricing.pricing[tier.tierId]?.trending === 'yearly'
        }));
        
        res.json({
            success: true,
            data: {
                currentTier: user.vip?.level || 'free',
                isActive: user.vip?.isActive || false,
                hasActiveSubscription: !!activeSubscription,
                region: pricing.region,
                currency: pricing.currency,
                symbol: pricing.symbol,
                plans: plans.sort((a, b) => a.order - b.order),
                billingDisclosure: {
                    text: "Subscription automatically renews unless auto-renew is turned off at least 24 hours before the end of the current period. Your account will be charged for renewal within 24 hours prior to the end of the current period. You can manage and cancel your subscriptions by going to your account settings on the App Store or Google Play Store.",
                    autoRenew: true,
                    cancellationPolicy: "You can cancel anytime from your account settings"
                }
            }
        });
    } catch (error) {
        console.error('Error getting VIP plans:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get VIP plans',
            error: error.message 
        });
    }
});

// Get billing disclosure
router.get('/billing-disclosure', async (req, res) => {
    try {
        const { region = 'US' } = req.query;
        
        const disclosures = {
            US: {
                text: "Subscription automatically renews unless auto-renew is turned off at least 24 hours before the end of the current period. Your account will be charged for renewal within 24 hours prior to the end of the current period. You can manage and cancel your subscriptions by going to your account settings on the App Store or Google Play Store.",
                autoRenew: true,
                cancellationPolicy: "You can cancel anytime from your account settings",
                refundPolicy: "Refunds are handled by Apple or Google according to their policies"
            },
            EU: {
                text: "Subscription automatically renews unless auto-renew is turned off at least 24 hours before the end of the current period. Your account will be charged for renewal within 24 hours prior to the end of the current period. You can manage and cancel your subscriptions by going to your account settings on the App Store or Google Play Store.",
                autoRenew: true,
                cancellationPolicy: "You can cancel anytime from your account settings",
                refundPolicy: "Refunds are handled by Apple or Google according to their policies"
            },
            UK: {
                text: "Subscription automatically renews unless auto-renew is turned off at least 24 hours before the end of the current period. Your account will be charged for renewal within 24 hours prior to the end of the current period. You can manage and cancel your subscriptions by going to your account settings on the App Store or Google Play Store.",
                autoRenew: true,
                cancellationPolicy: "You can cancel anytime from your account settings",
                refundPolicy: "Refunds are handled by Apple or Google according to their policies"
            },
            IN: {
                text: "Subscription automatically renews unless auto-renew is turned off at least 24 hours before the end of the current period. Your account will be charged for renewal within 24 hours prior to the end of the current period. You can manage and cancel your subscriptions by going to your account settings on the App Store or Google Play Store.",
                autoRenew: true,
                cancellationPolicy: "You can cancel anytime from your account settings",
                refundPolicy: "Refunds are handled by Apple or Google according to their policies"
            }
        };
        
        const disclosure = disclosures[region] || disclosures.US;
        
        res.json({
            success: true,
            data: {
                region,
                ...disclosure
            }
        });
    } catch (error) {
        console.error('Error getting billing disclosure:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get billing disclosure',
            error: error.message 
        });
    }
});

// Get weekly benefits status for current user
router.get('/weekly-benefits/status', protect, async (req, res) => {
    try {
        const userId = req.user.userId;
        const status = await getWeeklyBenefitsStatus(userId);
        
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Error getting weekly benefits status:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get weekly benefits status',
            error: error.message 
        });
    }
});

// Manually apply weekly benefits (for testing or manual triggers)
router.post('/weekly-benefits/apply', protect, async (req, res) => {
    try {
        const userId = req.user.userId;
        const result = await manuallyApplyWeeklyBenefits(userId);
        
        if (result.success) {
            res.json({
                success: true,
                message: 'Weekly benefits applied successfully',
                data: result
            });
        } else {
            res.status(400).json({
                success: false,
                message: 'Failed to apply weekly benefits',
                error: result.error
            });
        }
    } catch (error) {
        console.error('Error applying weekly benefits:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to apply weekly benefits',
            error: error.message 
        });
    }
});

// Admin endpoint to apply weekly benefits to all users (for cron job)
router.post('/admin/weekly-benefits/apply-all', protect, async (req, res) => {
    try {
        // Note: In production, this should be protected with admin authentication
        const result = await applyWeeklyVIPBenefits();
        
        res.json({
            success: true,
            message: 'Weekly benefits application completed',
            data: result
        });
    } catch (error) {
        console.error('Error applying weekly benefits to all users:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to apply weekly benefits to all users',
            error: error.message 
        });
    }
});

module.exports = router;
