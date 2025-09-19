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

    // If payment intent already exists, return it (idempotent initiation)
    if (subscription.paymentIntentId && subscription.paymentClientSecret) {
      return res.json({
        success: true,
        message: 'Payment already initiated',
        data: {
          paymentIntentId: subscription.paymentIntentId,
          clientSecret: subscription.paymentClientSecret || null,
          amount: subscription.amount,
          currency: subscription.currency,
          subscriptionId: subscription._id,
          nextStep: 'payment_confirmation'
        }
      });
    }

    // Validate pricing
    const region = subscription.metadata?.region || 'US';
    const isValidPricing = await validatePricing(
      subscription.tier,
      subscription.plan,
      subscription.amount,
      region,
      userId, // Pass userId for discount calculation
      true // Exclude pending subscription when checking first-time status
    );

    if (!isValidPricing) {
      // Get the expected pricing for debugging
      const expectedCost = await calculateSubscriptionCost(
        subscription.tier,
        subscription.plan,
        region,
        userId
      );
      
      return res.status(400).json({
        success: false,
        message: 'Invalid pricing detected',
        details: {
          expectedAmount: expectedCost.amount,
          actualAmount: subscription.amount,
          tier: subscription.tier,
          plan: subscription.plan,
          region: region,
          expectedFormatted: expectedCost.formatted
        }
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
    subscription.paymentClientSecret = paymentIntent.client_secret;
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

// Handle Google Play Billing webhooks
router.post('/webhook/google-play', express.json(), async (req, res) => {
  try {
    const { notificationType, purchaseToken, subscriptionId } = req.body;
    
    console.log('Google Play webhook received:', { notificationType, purchaseToken, subscriptionId });
    
    switch (notificationType) {
      case 1: // SUBSCRIPTION_RECOVERED
        await handleGooglePlaySubscriptionRecovered(purchaseToken, subscriptionId);
        break;
      case 2: // SUBSCRIPTION_RENEWED
        await handleGooglePlaySubscriptionRenewed(purchaseToken, subscriptionId);
        break;
      case 3: // SUBSCRIPTION_CANCELED
        await handleGooglePlaySubscriptionCanceled(purchaseToken, subscriptionId);
        break;
      case 4: // SUBSCRIPTION_PURCHASED
        await handleGooglePlaySubscriptionPurchased(purchaseToken, subscriptionId);
        break;
      case 5: // SUBSCRIPTION_ON_HOLD
        await handleGooglePlaySubscriptionOnHold(purchaseToken, subscriptionId);
        break;
      case 6: // SUBSCRIPTION_IN_GRACE_PERIOD
        await handleGooglePlaySubscriptionInGracePeriod(purchaseToken, subscriptionId);
        break;
      case 7: // SUBSCRIPTION_RESTARTED
        await handleGooglePlaySubscriptionRestarted(purchaseToken, subscriptionId);
        break;
      case 8: // SUBSCRIPTION_PRICE_CHANGE_CONFIRMED
        await handleGooglePlayPriceChangeConfirmed(purchaseToken, subscriptionId);
        break;
      case 9: // SUBSCRIPTION_DEFERRED
        await handleGooglePlaySubscriptionDeferred(purchaseToken, subscriptionId);
        break;
      case 10: // SUBSCRIPTION_PAUSED
        await handleGooglePlaySubscriptionPaused(purchaseToken, subscriptionId);
        break;
      case 11: // SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED
        await handleGooglePlayPauseScheduleChanged(purchaseToken, subscriptionId);
        break;
      case 12: // SUBSCRIPTION_REVOKED
        await handleGooglePlaySubscriptionRevoked(purchaseToken, subscriptionId);
        break;
      case 13: // SUBSCRIPTION_EXPIRED
        await handleGooglePlaySubscriptionExpired(purchaseToken, subscriptionId);
        break;
      default:
        console.log(`Unhandled Google Play notification type: ${notificationType}`);
    }
    
    res.status(200).json({ received: true });
    
  } catch (error) {
    console.error('Google Play webhook error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Google Play webhook processing failed',
      error: error.message 
    });
  }
});

// Handle Apple Store webhooks
router.post('/webhook/apple-store', express.json(), async (req, res) => {
  try {
    const { notification_type, unified_receipt } = req.body;
    
    console.log('Apple Store webhook received:', { notification_type });
    
    switch (notification_type) {
      case 'INITIAL_BUY':
        await handleAppleStoreInitialBuy(unified_receipt);
        break;
      case 'DID_RENEW':
        await handleAppleStoreDidRenew(unified_receipt);
        break;
      case 'DID_FAIL_TO_RENEW':
        await handleAppleStoreDidFailToRenew(unified_receipt);
        break;
      case 'DID_CHANGE_RENEWAL_PREF':
        await handleAppleStoreDidChangeRenewalPref(unified_receipt);
        break;
      case 'DID_CHANGE_RENEWAL_STATUS':
        await handleAppleStoreDidChangeRenewalStatus(unified_receipt);
        break;
      case 'DID_INTERACT':
        await handleAppleStoreDidInteract(unified_receipt);
        break;
      case 'DID_CANCEL':
        await handleAppleStoreDidCancel(unified_receipt);
        break;
      case 'DID_RECOVER':
        await handleAppleStoreDidRecover(unified_receipt);
        break;
      case 'EXPIRED':
        await handleAppleStoreExpired(unified_receipt);
        break;
      case 'GRACE_PERIOD_EXPIRED':
        await handleAppleStoreGracePeriodExpired(unified_receipt);
        break;
      case 'PRICE_INCREASE':
        await handleAppleStorePriceIncrease(unified_receipt);
        break;
      case 'REFUND':
        await handleAppleStoreRefund(unified_receipt);
        break;
      case 'REVOKE':
        await handleAppleStoreRevoke(unified_receipt);
        break;
      default:
        console.log(`Unhandled Apple Store notification type: ${notification_type}`);
    }
    
    res.status(200).json({ received: true });
    
  } catch (error) {
    console.error('Apple Store webhook error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Apple Store webhook processing failed',
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

// Google Play webhook handlers
async function handleGooglePlaySubscriptionPurchased(purchaseToken, subscriptionId) {
  try {
    console.log(`Google Play subscription purchased: ${subscriptionId}`);
    // In real implementation, verify purchase with Google Play API
    // For now, just log the event
  } catch (error) {
    console.error('Error handling Google Play subscription purchased:', error);
  }
}

async function handleGooglePlaySubscriptionRenewed(purchaseToken, subscriptionId) {
  try {
    console.log(`Google Play subscription renewed: ${subscriptionId}`);
    // In real implementation, extend subscription in database
  } catch (error) {
    console.error('Error handling Google Play subscription renewed:', error);
  }
}

async function handleGooglePlaySubscriptionCanceled(purchaseToken, subscriptionId) {
  try {
    console.log(`Google Play subscription canceled: ${subscriptionId}`);
    // In real implementation, cancel subscription in database
  } catch (error) {
    console.error('Error handling Google Play subscription canceled:', error);
  }
}

async function handleGooglePlaySubscriptionRecovered(purchaseToken, subscriptionId) {
  try {
    console.log(`Google Play subscription recovered: ${subscriptionId}`);
  } catch (error) {
    console.error('Error handling Google Play subscription recovered:', error);
  }
}

async function handleGooglePlaySubscriptionOnHold(purchaseToken, subscriptionId) {
  try {
    console.log(`Google Play subscription on hold: ${subscriptionId}`);
  } catch (error) {
    console.error('Error handling Google Play subscription on hold:', error);
  }
}

async function handleGooglePlaySubscriptionInGracePeriod(purchaseToken, subscriptionId) {
  try {
    console.log(`Google Play subscription in grace period: ${subscriptionId}`);
  } catch (error) {
    console.error('Error handling Google Play subscription in grace period:', error);
  }
}

async function handleGooglePlaySubscriptionRestarted(purchaseToken, subscriptionId) {
  try {
    console.log(`Google Play subscription restarted: ${subscriptionId}`);
  } catch (error) {
    console.error('Error handling Google Play subscription restarted:', error);
  }
}

async function handleGooglePlayPriceChangeConfirmed(purchaseToken, subscriptionId) {
  try {
    console.log(`Google Play price change confirmed: ${subscriptionId}`);
  } catch (error) {
    console.error('Error handling Google Play price change confirmed:', error);
  }
}

async function handleGooglePlaySubscriptionDeferred(purchaseToken, subscriptionId) {
  try {
    console.log(`Google Play subscription deferred: ${subscriptionId}`);
  } catch (error) {
    console.error('Error handling Google Play subscription deferred:', error);
  }
}

async function handleGooglePlaySubscriptionPaused(purchaseToken, subscriptionId) {
  try {
    console.log(`Google Play subscription paused: ${subscriptionId}`);
  } catch (error) {
    console.error('Error handling Google Play subscription paused:', error);
  }
}

async function handleGooglePlayPauseScheduleChanged(purchaseToken, subscriptionId) {
  try {
    console.log(`Google Play pause schedule changed: ${subscriptionId}`);
  } catch (error) {
    console.error('Error handling Google Play pause schedule changed:', error);
  }
}

async function handleGooglePlaySubscriptionRevoked(purchaseToken, subscriptionId) {
  try {
    console.log(`Google Play subscription revoked: ${subscriptionId}`);
  } catch (error) {
    console.error('Error handling Google Play subscription revoked:', error);
  }
}

async function handleGooglePlaySubscriptionExpired(purchaseToken, subscriptionId) {
  try {
    console.log(`Google Play subscription expired: ${subscriptionId}`);
  } catch (error) {
    console.error('Error handling Google Play subscription expired:', error);
  }
}

// Apple Store webhook handlers
async function handleAppleStoreInitialBuy(unifiedReceipt) {
  try {
    console.log('Apple Store initial buy:', unifiedReceipt);
    // In real implementation, verify receipt with Apple and create subscription
  } catch (error) {
    console.error('Error handling Apple Store initial buy:', error);
  }
}

async function handleAppleStoreDidRenew(unifiedReceipt) {
  try {
    console.log('Apple Store did renew:', unifiedReceipt);
    // In real implementation, extend subscription in database
  } catch (error) {
    console.error('Error handling Apple Store did renew:', error);
  }
}

async function handleAppleStoreDidFailToRenew(unifiedReceipt) {
  try {
    console.log('Apple Store did fail to renew:', unifiedReceipt);
    // In real implementation, handle failed renewal
  } catch (error) {
    console.error('Error handling Apple Store did fail to renew:', error);
  }
}

async function handleAppleStoreDidChangeRenewalPref(unifiedReceipt) {
  try {
    console.log('Apple Store did change renewal preference:', unifiedReceipt);
  } catch (error) {
    console.error('Error handling Apple Store did change renewal preference:', error);
  }
}

async function handleAppleStoreDidChangeRenewalStatus(unifiedReceipt) {
  try {
    console.log('Apple Store did change renewal status:', unifiedReceipt);
  } catch (error) {
    console.error('Error handling Apple Store did change renewal status:', error);
  }
}

async function handleAppleStoreDidInteract(unifiedReceipt) {
  try {
    console.log('Apple Store did interact:', unifiedReceipt);
  } catch (error) {
    console.error('Error handling Apple Store did interact:', error);
  }
}

async function handleAppleStoreDidCancel(unifiedReceipt) {
  try {
    console.log('Apple Store did cancel:', unifiedReceipt);
    // In real implementation, cancel subscription in database
  } catch (error) {
    console.error('Error handling Apple Store did cancel:', error);
  }
}

async function handleAppleStoreDidRecover(unifiedReceipt) {
  try {
    console.log('Apple Store did recover:', unifiedReceipt);
  } catch (error) {
    console.error('Error handling Apple Store did recover:', error);
  }
}

async function handleAppleStoreExpired(unifiedReceipt) {
  try {
    console.log('Apple Store expired:', unifiedReceipt);
    // In real implementation, mark subscription as expired
  } catch (error) {
    console.error('Error handling Apple Store expired:', error);
  }
}

async function handleAppleStoreGracePeriodExpired(unifiedReceipt) {
  try {
    console.log('Apple Store grace period expired:', unifiedReceipt);
  } catch (error) {
    console.error('Error handling Apple Store grace period expired:', error);
  }
}

async function handleAppleStorePriceIncrease(unifiedReceipt) {
  try {
    console.log('Apple Store price increase:', unifiedReceipt);
  } catch (error) {
    console.error('Error handling Apple Store price increase:', error);
  }
}

async function handleAppleStoreRefund(unifiedReceipt) {
  try {
    console.log('Apple Store refund:', unifiedReceipt);
    // In real implementation, handle refund and potentially revoke benefits
  } catch (error) {
    console.error('Error handling Apple Store refund:', error);
  }
}

async function handleAppleStoreRevoke(unifiedReceipt) {
  try {
    console.log('Apple Store revoke:', unifiedReceipt);
    // In real implementation, revoke subscription and benefits
  } catch (error) {
    console.error('Error handling Apple Store revoke:', error);
  }
}

module.exports = router;







