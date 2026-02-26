const GooglePlayPurchase = require('../models/GooglePlayPurchase');
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
      subscriptionId,
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

        // Update user VIP status for re-verified subscription
        await linkToVIPSubscription(existingPurchase, userId, subscriptionId);
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
      purchase.subscriptionId = subscriptionId; // Keep the specific plan ID (e.g., "platinumyearly")
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
      await linkToVIPSubscription(purchase, userId, subscriptionId);
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
    console.error('[GOOGLE-PLAY-IAP] Error verifying purchase:', error);
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
    console.error('[GOOGLE-PLAY-IAP] Error getting purchase history:', error);
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
    console.error('[GOOGLE-PLAY-IAP] Error getting active subscription:', error);
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
    console.error('[GOOGLE-PLAY-IAP] Error refreshing subscription:', error);
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
      console.log('[GOOGLE-PLAY-IAP] Received test notification from Google Play');
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
    console.error('[GOOGLE-PLAY-IAP] Error handling webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook processing failed',
      error: error.message
    });
  }
};

/**
 * Helper: Link Google Play purchase to VIP subscription
 * Updates user.vip based on the subscription purchase
 */
async function linkToVIPSubscription(purchase, userId, subscriptionId) {
  try {
    // Extract tier from subscriptionId (e.g., "platinumyearly" -> "platinum", "bronzeweekly" -> "bronze", "monthly" -> "gold")
    let tier = 'free';

    if (subscriptionId) {
      const lowerSubscriptionId = subscriptionId.toLowerCase();

      // Check tier based on subscriptionId
      if (lowerSubscriptionId.includes('platinum')) {
        tier = 'platinum';
      } else if (lowerSubscriptionId.includes('gold')) {
        tier = 'gold';
      } else if (lowerSubscriptionId.includes('bronze')) {
        tier = 'bronze';
      } else if (lowerSubscriptionId === 'monthly') {
        // Special case: "monthly" is gold_monthly plan
        tier = 'gold';
      }
    }

    if (tier === 'free') {
      console.log(`[GOOGLE-PLAY-IAP] No VIP tier found for subscriptionId: ${subscriptionId}`);
      return;
    }

    // Get tier benefits if VIPTier model exists
    let benefits = [];
    try {
      const vipTier = await VIPTier.getTierById(tier);
      if (vipTier) {
        benefits = vipTier.getBenefitsSummary();
      }
    } catch (error) {
      console.log(`[GOOGLE-PLAY-IAP] VIPTier not found for tier: ${tier}, using empty benefits`);
    }

    // Update user VIP status directly
    await User.findByIdAndUpdate(userId, {
      $set: {
        'vip.level': tier,
        'vip.isActive': true,
        'vip.expires': purchase.expiryTime,
        'vip.benefits': benefits
      }
    });

    console.log(`[GOOGLE-PLAY-IAP] Updated user VIP status to ${tier} (expires: ${purchase.expiryTime})`);
  } catch (error) {
    console.error('[GOOGLE-PLAY-IAP] Error updating user VIP status:', error);
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
    console.log(`[GOOGLE-PLAY-IAP] Purchase not found for token: ${purchaseToken}`);
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
        // Extend user VIP expiry to match renewed subscription
        await User.findByIdAndUpdate(purchase.userId, {
          $set: {
            'vip.expires': renewResult.data.expiryTime,
            'vip.isActive': true
          }
        });
      }
      break;
    case 3: // SUBSCRIPTION_CANCELED
      purchase.purchaseState = 1;
      purchase.canceledAt = new Date();
      purchase.autoRenewing = false;
      // Deactivate user VIP on cancellation
      await User.findByIdAndUpdate(purchase.userId, {
        $set: { 'vip.isActive': false }
      });
      break;
    case 13: // SUBSCRIPTION_EXPIRED
      purchase.verificationStatus = 'expired';
      // Deactivate user VIP on expiry
      await User.findByIdAndUpdate(purchase.userId, {
        $set: { 'vip.isActive': false }
      });
      break;
    default:
      console.log(`[GOOGLE-PLAY-IAP] Unhandled subscription notification type: ${notificationType}`);
      break;
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
    console.log(`[GOOGLE-PLAY-IAP] Purchase not found for token: ${purchaseToken}`);
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
      console.log(`[GOOGLE-PLAY-IAP] Unhandled product notification type: ${notificationType}`);
      break;
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
