const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const protect = require('../middleware/auth');
const User = require('../models/User');
const VIPTier = require('../models/VIPTier');
const VIPSubscription = require('../models/VIPSubscription');
const { getVIPPricing, calculateSubscriptionCost, getTierComparison, validatePricing } = require('../utils/pricing');

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
    body('plan').isIn(['monthly', 'yearly']).withMessage('Invalid plan'),
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

// Initiate VIP upgrade (create pending subscription)
router.post('/upgrade', protect, [
    body('tierId').isIn(['bronze', 'gold', 'platinum']).withMessage('Invalid tier ID'),
    body('plan').isIn(['monthly', 'yearly']).withMessage('Invalid plan'),
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
        const userId = req.user.userId;
        
        // Check if user already has an active subscription
        const existingSubscription = await VIPSubscription.getActiveSubscription(userId);
        if (existingSubscription) {
            return res.status(400).json({
                success: false,
                message: 'User already has an active VIP subscription'
            });
        }
        
        // Calculate cost
        const cost = await calculateSubscriptionCost(tierId, plan, region, userId);
        
        // Create pending subscription
        const subscription = new VIPSubscription({
            userId,
            tier: tierId,
            plan,
            status: 'pending',
            paymentIntentId: `pending_${Date.now()}_${userId}`,
            amount: cost.amount,
            currency: cost.currency,
            startDate: new Date(),
            endDate: new Date(Date.now() + (plan === 'yearly' ? 365 : 30) * 24 * 60 * 60 * 1000)
        });
        
        await subscription.save();
        
        res.json({
            success: true,
            message: 'VIP upgrade initiated',
            data: {
                subscriptionId: subscription._id,
                tierId,
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

module.exports = router;
