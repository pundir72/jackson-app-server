const GooglePlayPurchase = require('../models/GooglePlayPurchase');
const VIPSubscription = require('../models/VIPSubscription');
const User = require('../models/User');
const VIPTier = require('../models/VIPTier');
const googlePlayService = require('../services/googlePlay.service');
const config = require('../config/config');

/**
 * Google Play Purchase Controller
 * Handles all Google Play in-app purchase operations
 */

/**
 * Verify and process a purchase from Google Play
 */
const verifyPurchase = async (req, res) => {
  try {
    const {
      purchaseToken,
      productId,
      orderId,
      purchaseTime,
      packageName,
      purchaseType = 'subscription', // 'subscription' or 'one_time'
      metadata = {}
    } = req.body;

    const userId = req.user.userId;

    // Validate required fields
    if (!purchaseToken || !productId || !orderId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: purchaseToken, productId, orderId'
      });
    }

    // Check if purchase already exists
    const existingPurchase = await GooglePlayPurchase.findOne({
      $or: [
        { orderId },
        { purchaseToken }
      ]
    });

    if (existingPurchase) {
      // If purchase exists and is verified, return success
      if (existingPurchase.verificationStatus === 'verified') {
        return res.json({
          success: true,
          message: 'Purchase already verified',
          data: {
            purchaseId: existingPurchase._id,
            verificationStatus: existingPurchase.verificationStatus,
            isActive: existingPurchase.isActive(),
            expiryTime: existingPurchase.expiryTime
          }
        });
      }

      // If purchase exists but not verified, re-verify
      const verificationResult = purchaseType === 'subscription'
        ? await googlePlayService.verifySubscription(
            packageName || config.ANDROID_PACKAGE_NAME,
            productId,
            purchaseToken
          )
        : await googlePlayService.verifyProduct(
            packageName || config.ANDROID_PACKAGE_NAME,
            productId,
            purchaseToken
          );

      if (!verificationResult.success || !verificationResult.verified) {
        existingPurchase.verificationStatus = 'failed';
        await existingPurchase.save();

        return res.status(400).json({
          success: false,
          message: 'Purchase verification failed',
          error: verificationResult.error
        });
      }

      // Update existing purchase with verification data
      await existingPurchase.markAsVerified(verificationResult.data.rawResponse);
      
      if (purchaseType === 'subscription') {
        existingPurchase.expiryTime = verificationResult.data.expiryTime;
        existingPurchase.autoRenewing = verificationResult.data.autoRenewing;
        await existingPurchase.save();
      }

      return res.json({
        success: true,
        message: 'Purchase verified successfully',
        data: {
          purchaseId: existingPurchase._id,
          verificationStatus: existingPurchase.verificationStatus,
          isActive: existingPurchase.isActive(),
          expiryTime: existingPurchase.expiryTime
        }
      });
    }

    // Verify purchase with Google Play
    const verificationResult = purchaseType === 'subscription'
      ? await googlePlayService.verifySubscription(
          packageName || config.ANDROID_PACKAGE_NAME,
          productId,
          purchaseToken
        )
      : await googlePlayService.verifyProduct(
          packageName || config.ANDROID_PACKAGE_NAME,
          productId,
          purchaseToken
        );

    if (!verificationResult.success || !verificationResult.verified) {
      // Check if it's a configuration error
      if (verificationResult.error && verificationResult.error.includes('credentials not configured')) {
        return res.status(500).json({
          success: false,
          message: 'Google Play IAP is not configured on the server',
          error: 'Server configuration error. Please contact support.',
          details: process.env.NODE_ENV === 'development' ? verificationResult.error : undefined
        });
      }

      return res.status(400).json({
        success: false,
        message: 'Purchase verification failed',
        error: verificationResult.error
      });
    }

    const verifiedData = verificationResult.data;

    // Create purchase record
    const purchase = new GooglePlayPurchase({
      userId,
      orderId: verifiedData.orderId,
      packageName: packageName || config.ANDROID_PACKAGE_NAME,
      productId,
      purchaseToken,
      purchaseType,
      purchaseTime: verifiedData.purchaseTime,
      purchaseState: verifiedData.purchaseState,
      verificationStatus: 'verified',
      verifiedAt: new Date(),
      googlePlayResponse: verifiedData.rawResponse,
      acknowledged: verifiedData.acknowledgementState === 1,
      amount: verifiedData.priceAmountMicros 
        ? verifiedData.priceAmountMicros / 1000000 
        : 0,
      currency: verifiedData.priceCurrencyCode || 'USD',
      metadata: {
        ...metadata,
        region: verifiedData.countryCode
      }
    });

    // Add subscription-specific fields
    if (purchaseType === 'subscription') {
      purchase.subscriptionId = productId;
      purchase.expiryTime = verifiedData.expiryTime;
      purchase.autoRenewing = verifiedData.autoRenewing;
    }

    await purchase.save();

    // Acknowledge purchase if not already acknowledged
    if (verifiedData.acknowledgementState === 0) {
      const ackResult = purchaseType === 'subscription'
        ? await googlePlayService.acknowledgeSubscription(
            packageName || config.ANDROID_PACKAGE_NAME,
            productId,
            purchaseToken
          )
        : await googlePlayService.acknowledgeProduct(
            packageName || config.ANDROID_PACKAGE_NAME,
            productId,
            purchaseToken
          );

      if (ackResult.success) {
        await purchase.acknowledge();
      }
    }

    // Link to VIP subscription if applicable
    if (purchaseType === 'subscription') {
      await linkToVIPSubscription(purchase, userId, productId);
    }

    res.status(201).json({
      success: true,
      message: 'Purchase verified and processed successfully',
      data: {
        purchaseId: purchase._id,
        orderId: purchase.orderId,
        productId: purchase.productId,
        verificationStatus: purchase.verificationStatus,
        isActive: purchase.isActive(),
        expiryTime: purchase.expiryTime,
        autoRenewing: purchase.autoRenewing
      }
    });

  } catch (error) {
    console.error('Error verifying purchase:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify purchase',
      error: error.message
    });
  }
};

/**
 * Get user's purchase history
 */
const getPurchaseHistory = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { limit = 20, purchaseType } = req.query;

    const query = { userId };
    if (purchaseType) {
      query.purchaseType = purchaseType;
    }

    const purchases = await GooglePlayPurchase.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate('vipSubscriptionId');

    res.json({
      success: true,
      data: {
        purchases: purchases.map(p => ({
          id: p._id,
          orderId: p.orderId,
          productId: p.productId,
          purchaseType: p.purchaseType,
          purchaseTime: p.purchaseTime,
          verificationStatus: p.verificationStatus,
          amount: p.amount,
          currency: p.currency,
          isActive: p.isActive(),
          expiryTime: p.expiryTime,
          autoRenewing: p.autoRenewing,
          vipSubscription: p.vipSubscriptionId
        })),
        total: purchases.length
      }
    });

  } catch (error) {
    console.error('Error getting purchase history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get purchase history',
      error: error.message
    });
  }
};

/**
 * Get active subscription
 */
const getActiveSubscription = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { productId } = req.query;

    const query = {
      userId,
      purchaseType: 'subscription',
      verificationStatus: 'verified',
      expiryTime: { $gt: new Date() },
      purchaseState: 0
    };

    if (productId) {
      query.productId = productId;
    }

    const subscription = await GooglePlayPurchase.findOne(query)
      .sort({ expiryTime: -1 })
      .populate('vipSubscriptionId');

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'No active subscription found'
      });
    }

    res.json({
      success: true,
      data: {
        id: subscription._id,
        orderId: subscription.orderId,
        productId: subscription.productId,
        purchaseTime: subscription.purchaseTime,
        expiryTime: subscription.expiryTime,
        autoRenewing: subscription.autoRenewing,
        isActive: subscription.isActive(),
        amount: subscription.amount,
        currency: subscription.currency,
        vipSubscription: subscription.vipSubscriptionId
      }
    });

  } catch (error) {
    console.error('Error getting active subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get active subscription',
      error: error.message
    });
  }
};

/**
 * Refresh subscription status
 */
const refreshSubscription = async (req, res) => {
  try {
    const { purchaseId } = req.params;
    const userId = req.user.userId;

    const purchase = await GooglePlayPurchase.findOne({
      _id: purchaseId,
      userId,
      purchaseType: 'subscription'
    });

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    }

    // Re-verify with Google Play
    const verificationResult = await googlePlayService.verifySubscription(
      purchase.packageName,
      purchase.productId,
      purchase.purchaseToken
    );

    if (!verificationResult.success || !verificationResult.verified) {
      purchase.verificationStatus = 'failed';
      await purchase.save();

      return res.status(400).json({
        success: false,
        message: 'Subscription verification failed',
        error: verificationResult.error
      });
    }

    const verifiedData = verificationResult.data;

    // Update purchase with latest data
    purchase.expiryTime = verifiedData.expiryTime;
    purchase.autoRenewing = verifiedData.autoRenewing;
    purchase.purchaseState = verifiedData.purchaseState;
    purchase.googlePlayResponse = verifiedData.rawResponse;
    
    // Check if subscription expired
    if (new Date() > verifiedData.expiryTime) {
      purchase.verificationStatus = 'expired';
    }

    await purchase.save();

    res.json({
      success: true,
      message: 'Subscription refreshed successfully',
      data: {
        id: purchase._id,
        productId: purchase.productId,
        expiryTime: purchase.expiryTime,
        autoRenewing: purchase.autoRenewing,
        isActive: purchase.isActive(),
        verificationStatus: purchase.verificationStatus
      }
    });

  } catch (error) {
    console.error('Error refreshing subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to refresh subscription',
      error: error.message
    });
  }
};

/**
 * Handle Google Play webhook notifications
 */
const handleWebhook = async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || !message.data) {
      return res.status(400).json({
        success: false,
        message: 'Invalid webhook payload'
      });
    }

    // Decode base64 message data
    const decodedData = Buffer.from(message.data, 'base64').toString('utf-8');
    const notification = JSON.parse(decodedData);

    const {
      subscriptionNotification,
      oneTimeProductNotification,
      testNotification
    } = notification;

    // Handle test notification
    if (testNotification) {
      console.log('Received test notification from Google Play');
      return res.status(200).json({ success: true });
    }

    // Handle subscription notification
    if (subscriptionNotification) {
      await handleSubscriptionNotification(subscriptionNotification);
    }

    // Handle one-time product notification
    if (oneTimeProductNotification) {
      await handleProductNotification(oneTimeProductNotification);
    }

    res.status(200).json({ success: true });

  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook processing failed',
      error: error.message
    });
  }
};

/**
 * Helper: Link Google Play purchase to VIP subscription
 */
async function linkToVIPSubscription(purchase, userId, productId) {
  try {
    // Map product ID to VIP tier and plan
    const productMapping = {
      'vip_bronze_weekly': { tier: 'bronze', plan: 'weekly' },
      'vip_bronze_monthly': { tier: 'bronze', plan: 'monthly' },
      'vip_bronze_yearly': { tier: 'bronze', plan: 'yearly' },
      'vip_gold_weekly': { tier: 'gold', plan: 'weekly' },
      'vip_gold_monthly': { tier: 'gold', plan: 'monthly' },
      'vip_gold_yearly': { tier: 'gold', plan: 'yearly' },
      'vip_platinum_weekly': { tier: 'platinum', plan: 'weekly' },
      'vip_platinum_monthly': { tier: 'platinum', plan: 'monthly' },
      'vip_platinum_yearly': { tier: 'platinum', plan: 'yearly' }
    };

    const mapping = productMapping[productId];
    if (!mapping) {
      console.log(`No VIP mapping found for product: ${productId}`);
      return;
    }

    // Create or update VIP subscription
    const vipSubscription = new VIPSubscription({
      userId,
      tier: mapping.tier,
      plan: mapping.plan,
      status: 'active',
      amount: purchase.amount,
      currency: purchase.currency,
      startDate: purchase.purchaseTime,
      endDate: purchase.expiryTime,
      nextBillingDate: purchase.expiryTime,
      autoRenew: purchase.autoRenewing,
      metadata: {
        source: 'google_play',
        googlePlayOrderId: purchase.orderId,
        googlePlayPurchaseToken: purchase.purchaseToken,
        ...purchase.metadata
      }
    });

    await vipSubscription.save();

    // Link purchase to VIP subscription
    purchase.vipSubscriptionId = vipSubscription._id;
    await purchase.save();

    // Update user VIP status
    const tier = await VIPTier.getTierById(mapping.tier);
    if (tier) {
      await User.findByIdAndUpdate(userId, {
        $set: {
          'vip.level': mapping.tier,
          'vip.isActive': true,
          'vip.expires': purchase.expiryTime,
          'vip.benefits': tier.getBenefitsSummary()
        }
      });
    }

    console.log(`Linked Google Play purchase to VIP subscription: ${vipSubscription._id}`);
  } catch (error) {
    console.error('Error linking to VIP subscription:', error);
  }
}

/**
 * Helper: Handle subscription notification from webhook
 */
async function handleSubscriptionNotification(notification) {
  const {
    subscriptionId,
    purchaseToken,
    notificationType
  } = notification;

  const purchase = await GooglePlayPurchase.findOne({ purchaseToken });

  if (!purchase) {
    console.log(`Purchase not found for token: ${purchaseToken}`);
    return;
  }

  // Add notification to purchase record
  await purchase.addWebhookNotification(notificationType, notification);

  // Handle different notification types
  switch (notificationType) {
    case 1: // SUBSCRIPTION_RECOVERED
      purchase.verificationStatus = 'verified';
      purchase.purchaseState = 0;
      break;
    case 2: // SUBSCRIPTION_RENEWED
      // Refresh subscription details
      const renewResult = await googlePlayService.verifySubscription(
        purchase.packageName,
        subscriptionId,
        purchaseToken
      );
      if (renewResult.success) {
        purchase.expiryTime = renewResult.data.expiryTime;
      }
      break;
    case 3: // SUBSCRIPTION_CANCELED
      purchase.purchaseState = 1;
      purchase.canceledAt = new Date();
      purchase.autoRenewing = false;
      break;
    case 13: // SUBSCRIPTION_EXPIRED
      purchase.verificationStatus = 'expired';
      break;
    default:
      console.log(`Unhandled notification type: ${notificationType}`);
  }

  await purchase.save();
}

/**
 * Helper: Handle product notification from webhook
 */
async function handleProductNotification(notification) {
  const {
    sku,
    purchaseToken,
    notificationType
  } = notification;

  const purchase = await GooglePlayPurchase.findOne({ purchaseToken });

  if (!purchase) {
    console.log(`Purchase not found for token: ${purchaseToken}`);
    return;
  }

  // Add notification to purchase record
  await purchase.addWebhookNotification(notificationType, notification);

  // Handle different notification types
  switch (notificationType) {
    case 1: // ONE_TIME_PRODUCT_PURCHASED
      purchase.verificationStatus = 'verified';
      purchase.purchaseState = 0;
      break;
    case 2: // ONE_TIME_PRODUCT_CANCELED
      purchase.purchaseState = 1;
      purchase.canceledAt = new Date();
      break;
    default:
      console.log(`Unhandled notification type: ${notificationType}`);
  }

  await purchase.save();
}

module.exports = {
  verifyPurchase,
  getPurchaseHistory,
  getActiveSubscription,
  refreshSubscription,
  handleWebhook
};
