const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const protect = require('../middleware/auth');
const VIPSubscription = require('../models/VIPSubscription');
const User = require('../models/User');
const VIPTier = require('../models/VIPTier');
const { calculateSubscriptionCost, validatePricing } = require('../utils/pricing');

// Mock Stripe configuration (replace with actual Stripe setup)
const STRIPE_CONFIG = {
  secretKey: process.env.STRIPE_SECRET_KEY || 'sk_test_mock_key',
  publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_mock_key',
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || 'whsec_mock_secret'
};

// Initialize Stripe (mock implementation)
const stripe = {
  paymentIntents: {
    create: async (params) => {
      // Mock payment intent creation
      return {
        id: `pi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        client_secret: `pi_${Date.now()}_secret_${Math.random().toString(36).substr(2, 9)}`,
        amount: params.amount,
        currency: params.currency,
        status: 'requires_payment_method'
      };
    },
    confirm: async (paymentIntentId) => {
      // Mock payment confirmation
      return {
        id: paymentIntentId,
        status: 'succeeded',
        amount: 10000,
        currency: 'usd'
      };
    }
  },
  subscriptions: {
    create: async (params) => {
      // Mock subscription creation
      return {
        id: `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        status: 'active',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + (params.items[0].price_data.unit_amount === 1000 ? 30 : 365) * 24 * 60 * 60
      };
    },
    cancel: async (subscriptionId) => {
      // Mock subscription cancellation
      return {
        id: subscriptionId,
        status: 'canceled',
        canceled_at: Math.floor(Date.now() / 1000)
      };
    }
  },
  webhooks: {
    constructEvent: (body, signature, secret) => {
      // Mock webhook event construction
      return JSON.parse(body);
    }
  }
};

// Initiate payment for VIP subscription
router.post('/initiate', protect, [
  body('subscriptionId').isMongoId().withMessage('Invalid subscription ID'),
  body('paymentMethod').optional().isIn(['card', 'upi', 'google_pay', 'apple_pay']).withMessage('Invalid payment method')
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

    const { subscriptionId, paymentMethod = 'card' } = req.body;
    const userId = req.user.userId;

    // Get subscription
    const subscription = await VIPSubscription.findOne({
      _id: subscriptionId,
      userId,
      status: 'pending'
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found or not pending'
      });
    }

    // Validate pricing
    const isValidPricing = await validatePricing(
      subscription.tier,
      subscription.plan,
      subscription.amount,
      'US' // Default region
    );

    if (!isValidPricing) {
      return res.status(400).json({
        success: false,
        message: 'Invalid pricing detected'
      });
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(subscription.amount * 100), // Convert to cents
      currency: subscription.currency.toLowerCase(),
      metadata: {
        subscriptionId: subscription._id.toString(),
        userId: userId.toString(),
        tier: subscription.tier,
        plan: subscription.plan
      },
      description: `VIP ${subscription.tier} ${subscription.plan} subscription`
    });

    // Update subscription with payment intent ID
    subscription.paymentIntentId = paymentIntent.id;
    await subscription.save();

    res.json({
      success: true,
      message: 'Payment initiated successfully',
      data: {
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        amount: subscription.amount,
        currency: subscription.currency,
        subscriptionId: subscription._id,
        nextStep: 'payment_confirmation'
      }
    });

  } catch (error) {
    console.error('Error initiating payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initiate payment',
      error: error.message
    });
  }
});

// Confirm payment and activate subscription
router.post('/confirm', protect, [
  body('paymentIntentId').isString().withMessage('Payment intent ID is required'),
  body('subscriptionId').isMongoId().withMessage('Invalid subscription ID')
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

    const { paymentIntentId, subscriptionId } = req.body;
    const userId = req.user.userId;

    // Get subscription
    const subscription = await VIPSubscription.findOne({
      _id: subscriptionId,
      userId,
      paymentIntentId,
      status: 'pending'
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found or not pending'
      });
    }

    // Confirm payment intent (mock implementation)
    const confirmedPayment = await stripe.paymentIntents.confirm(paymentIntentId);

    if (confirmedPayment.status !== 'succeeded') {
      return res.status(400).json({
        success: false,
        message: 'Payment not successful',
        data: {
          status: confirmedPayment.status
        }
      });
    }

    // Create recurring subscription if yearly plan
    let stripeSubscriptionId = null;
    if (subscription.plan === 'yearly') {
      const stripeSubscription = await stripe.subscriptions.create({
        customer: userId, // In real implementation, create Stripe customer
        items: [{
          price_data: {
            currency: subscription.currency.toLowerCase(),
            product_data: {
              name: `VIP ${subscription.tier} ${subscription.plan}`,
            },
            unit_amount: Math.round(subscription.amount * 100),
            recurring: {
              interval: 'year'
            }
          }
        }],
        metadata: {
          subscriptionId: subscription._id.toString(),
          userId: userId.toString()
        }
      });
      stripeSubscriptionId = stripeSubscription.id;
    }

    // Update subscription status
    subscription.status = 'active';
    subscription.stripeSubscriptionId = stripeSubscriptionId;
    subscription.nextBillingDate = subscription.endDate;
    await subscription.save();

    // Update user's VIP status
    const tier = await VIPTier.getTierById(subscription.tier);
    if (tier) {
      await User.findByIdAndUpdate(userId, {
        $set: {
          'vip.level': subscription.tier,
          'vip.isActive': true,
          'vip.expires': subscription.endDate,
          'vip.benefits': tier.getBenefitsSummary()
        }
      });
    }

    res.json({
      success: true,
      message: 'Payment confirmed and subscription activated',
      data: {
        subscriptionId: subscription._id,
        tier: subscription.tier,
        plan: subscription.plan,
        status: subscription.status,
        expiresAt: subscription.endDate,
        benefits: tier ? tier.getBenefitsSummary() : []
      }
    });

  } catch (error) {
    console.error('Error confirming payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to confirm payment',
      error: error.message
    });
  }
});

// Handle Stripe webhooks
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = STRIPE_CONFIG.webhookSecret;

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object);
        break;
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook processing failed',
      error: error.message
    });
  }
});

// Handle successful payment
async function handlePaymentSucceeded(paymentIntent) {
  try {
    const { subscriptionId, userId, tier, plan } = paymentIntent.metadata;
    
    const subscription = await VIPSubscription.findById(subscriptionId);
    if (!subscription) {
      console.error('Subscription not found for payment intent:', paymentIntent.id);
      return;
    }

    // Update subscription status
    subscription.status = 'active';
    await subscription.save();

    // Update user VIP status
    const tierData = await VIPTier.getTierById(tier);
    if (tierData) {
      await User.findByIdAndUpdate(userId, {
        $set: {
          'vip.level': tier,
          'vip.isActive': true,
          'vip.expires': subscription.endDate,
          'vip.benefits': tierData.getBenefitsSummary()
        }
      });
    }

    console.log(`Payment succeeded for subscription ${subscriptionId}`);
  } catch (error) {
    console.error('Error handling payment succeeded:', error);
  }
}

// Handle failed payment
async function handlePaymentFailed(paymentIntent) {
  try {
    const { subscriptionId } = paymentIntent.metadata;
    
    const subscription = await VIPSubscription.findById(subscriptionId);
    if (subscription) {
      subscription.status = 'failed';
      await subscription.save();
    }

    console.log(`Payment failed for subscription ${subscriptionId}`);
  } catch (error) {
    console.error('Error handling payment failed:', error);
  }
}

// Handle successful recurring payment
async function handleInvoicePaymentSucceeded(invoice) {
  try {
    const { subscriptionId } = invoice.metadata;
    
    const subscription = await VIPSubscription.findById(subscriptionId);
    if (subscription) {
      // Extend subscription
      const newEndDate = new Date(subscription.endDate);
      newEndDate.setFullYear(newEndDate.getFullYear() + 1);
      
      subscription.endDate = newEndDate;
      subscription.nextBillingDate = newEndDate;
      await subscription.save();

      // Update user VIP status
      await User.findByIdAndUpdate(subscription.userId, {
        $set: {
          'vip.expires': newEndDate
        }
      });
    }

    console.log(`Recurring payment succeeded for subscription ${subscriptionId}`);
  } catch (error) {
    console.error('Error handling invoice payment succeeded:', error);
  }
}

// Handle failed recurring payment
async function handleInvoicePaymentFailed(invoice) {
  try {
    const { subscriptionId } = invoice.metadata;
    
    const subscription = await VIPSubscription.findById(subscriptionId);
    if (subscription) {
      subscription.status = 'failed';
      await subscription.save();

      // Optionally downgrade user after grace period
      // This would be handled by a separate job
    }

    console.log(`Recurring payment failed for subscription ${subscriptionId}`);
  } catch (error) {
    console.error('Error handling invoice payment failed:', error);
  }
}

// Handle subscription cancellation
async function handleSubscriptionDeleted(subscription) {
  try {
    const { subscriptionId } = subscription.metadata;
    
    const vipSubscription = await VIPSubscription.findById(subscriptionId);
    if (vipSubscription) {
      vipSubscription.status = 'cancelled';
      vipSubscription.cancellationDate = new Date();
      await vipSubscription.save();

      // Update user VIP status
      await User.findByIdAndUpdate(vipSubscription.userId, {
        $set: {
          'vip.level': 'free',
          'vip.isActive': false,
          'vip.expires': null
        }
      });
    }

    console.log(`Subscription cancelled: ${subscriptionId}`);
  } catch (error) {
    console.error('Error handling subscription deleted:', error);
  }
}

// Get payment methods (mock implementation)
router.get('/methods', protect, async (req, res) => {
  try {
    // Mock payment methods
    const paymentMethods = [
      {
        id: 'card',
        name: 'Credit/Debit Card',
        icon: 'credit-card',
        enabled: true
      },
      {
        id: 'upi',
        name: 'UPI',
        icon: 'upi',
        enabled: true
      },
      {
        id: 'google_pay',
        name: 'Google Pay',
        icon: 'google-pay',
        enabled: true
      },
      {
        id: 'apple_pay',
        name: 'Apple Pay',
        icon: 'apple-pay',
        enabled: process.platform === 'darwin' // Only on iOS
      }
    ];

    res.json({
      success: true,
      data: paymentMethods
    });
  } catch (error) {
    console.error('Error getting payment methods:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payment methods',
      error: error.message
    });
  }
});

// Get payment status
router.get('/status/:paymentIntentId', protect, async (req, res) => {
  try {
    const { paymentIntentId } = req.params;
    const userId = req.user.userId;

    const subscription = await VIPSubscription.findOne({
      paymentIntentId,
      userId
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    res.json({
      success: true,
      data: {
        paymentIntentId: subscription.paymentIntentId,
        status: subscription.status,
        amount: subscription.amount,
        currency: subscription.currency,
        tier: subscription.tier,
        plan: subscription.plan,
        createdAt: subscription.createdAt
      }
    });
  } catch (error) {
    console.error('Error getting payment status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payment status',
      error: error.message
    });
  }
});

module.exports = router;



