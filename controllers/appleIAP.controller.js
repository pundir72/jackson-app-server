const ApplePurchase = require('../models/ApplePurchase')
const User = require('../models/User')
const VIPTier = require('../models/VIPTier')
const appleIAPService = require('../services/appleIAP.service')

const verifyPurchase = async (req, res) => {
  try {
    const {
      transactionReceipt,
      transactionId,
      productId,
      subscriptionId,
      metadata = {},
    } = req.body

    const userId = req.user.userId

    console.log('[APPLE-IAP] Verify purchase request:', {
      userId,
      transactionId: transactionId?.substring(0, 20) + '...',
      productId,
      subscriptionId,
      hasReceipt: !!transactionReceipt,
    })

    // Check if purchase already exists
    const existingPurchase = await ApplePurchase.findOne({ transactionId })

    if (
      existingPurchase &&
      existingPurchase.verificationStatus === 'verified'
    ) {
      console.log(
        '[APPLE-IAP] Purchase already verified:',
        existingPurchase._id,
      )
      return res.json({
        success: true,
        message: 'Purchase already verified',
        data: {
          purchaseId: existingPurchase._id,
          verificationStatus: existingPurchase.verificationStatus,
          isActive: existingPurchase.isActive(),
          expiresDate: existingPurchase.expiresDate,
        },
      })
    }

    // Verify receipt with Apple App Store
    console.log('[APPLE-IAP] Verifying receipt with Apple...')
    const verificationResult =
      await appleIAPService.verifyReceipt(transactionReceipt)

    if (!verificationResult.success || !verificationResult.verified) {
      console.error(
        '[APPLE-IAP] Verification failed:',
        verificationResult.error,
      )
      return res.status(400).json({
        success: false,
        message: 'Purchase verification failed',
        error: verificationResult.error,
      })
    }

    const verifiedData = verificationResult.data
    console.log('[APPLE-IAP] Receipt verified successfully')

    // Create purchase record
    const purchase = new ApplePurchase({
      userId,
      transactionId,
      originalTransactionId:
        verifiedData.original_transaction_id || transactionId,
      productId,
      subscriptionId,
      purchaseDate: new Date(parseInt(verifiedData.purchase_date_ms)),
      expiresDate: verifiedData.expires_date_ms
        ? new Date(parseInt(verifiedData.expires_date_ms))
        : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year default
      verificationStatus: 'verified',
      verifiedAt: new Date(),
      appleResponse: verifiedData,
      isTrialPeriod: verifiedData.is_trial_period === 'true',
      autoRenewStatus: verifiedData.auto_renew_status === '1',
      metadata,
    })

    await purchase.save()
    console.log('[APPLE-IAP] Purchase record created:', purchase._id)

    // Update user VIP status
    await linkToVIPSubscription(purchase, userId, subscriptionId)

    res.status(201).json({
      success: true,
      message: 'Purchase verified successfully',
      data: {
        purchaseId: purchase._id,
        transactionId: purchase.transactionId,
        productId: purchase.productId,
        verificationStatus: purchase.verificationStatus,
        isActive: purchase.isActive(),
        expiresDate: purchase.expiresDate,
      },
    })
  } catch (error) {
    console.error('[APPLE-IAP] Error verifying purchase:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to verify purchase',
      error: error.message,
    })
  }
}

/**
 * Helper: Link Apple IAP purchase to VIP subscription
 * Updates user.vip based on the subscription purchase
 */
async function linkToVIPSubscription(purchase, userId, subscriptionId) {
  try {
    // Extract tier from subscriptionId (e.g., "platinum_yearly" -> "platinum", "gold_monthly" -> "gold")
    let tier = 'free'

    if (subscriptionId) {
      const lowerSubscriptionId = subscriptionId.toLowerCase()

      // Check tier based on subscriptionId
      if (lowerSubscriptionId.includes('platinum')) {
        tier = 'platinum'
      } else if (lowerSubscriptionId.includes('gold')) {
        tier = 'gold'
      } else if (lowerSubscriptionId.includes('bronze')) {
        tier = 'bronze'
      }
    }

    if (tier === 'free') {
      console.log(
        `[APPLE-IAP] No VIP tier found for subscriptionId: ${subscriptionId}`,
      )
      return
    }

    // Get tier benefits if VIPTier model exists
    let benefits = []
    try {
      const vipTier = await VIPTier.getTierById(tier)
      if (vipTier) {
        benefits = vipTier.getBenefitsSummary()
      }
    } catch (error) {
      console.log(
        `[APPLE-IAP] VIPTier not found for tier: ${tier}, using empty benefits`,
      )
    }

    // Update user VIP status directly
    await User.findByIdAndUpdate(userId, {
      $set: {
        'vip.level': tier,
        'vip.isActive': true,
        'vip.expires': purchase.expiresDate,
        'vip.benefits': benefits,
      },
    })

    console.log(
      `[APPLE-IAP] Updated user VIP status to ${tier} (expires: ${purchase.expiresDate})`,
    )
  } catch (error) {
    console.error('[APPLE-IAP] Error updating user VIP status:', error)
  }
}

/**
 * Get user's purchase history
 */
const getPurchaseHistory = async (req, res) => {
  try {
    const userId = req.user.userId
    const { limit = 20 } = req.query

    const purchases = await ApplePurchase.find({ userId })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))

    res.json({
      success: true,
      data: {
        purchases: purchases.map((p) => ({
          id: p._id,
          transactionId: p.transactionId,
          productId: p.productId,
          purchaseDate: p.purchaseDate,
          expiresDate: p.expiresDate,
          verificationStatus: p.verificationStatus,
          isActive: p.isActive(),
          autoRenewStatus: p.autoRenewStatus,
        })),
        total: purchases.length,
      },
    })
  } catch (error) {
    console.error('[APPLE-IAP] Error getting purchase history:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to get purchase history',
      error: error.message,
    })
  }
}

/**
 * Get active subscription
 */
const getActiveSubscription = async (req, res) => {
  try {
    const userId = req.user.userId
    const { productId } = req.query

    const query = {
      userId,
      verificationStatus: 'verified',
      expiresDate: { $gt: new Date() },
    }

    if (productId) {
      query.productId = productId
    }

    const subscription = await ApplePurchase.findOne(query).sort({
      expiresDate: -1,
    })

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'No active subscription found',
      })
    }

    res.json({
      success: true,
      data: {
        id: subscription._id,
        transactionId: subscription.transactionId,
        productId: subscription.productId,
        purchaseDate: subscription.purchaseDate,
        expiresDate: subscription.expiresDate,
        isActive: subscription.isActive(),
        autoRenewStatus: subscription.autoRenewStatus,
        isTrialPeriod: subscription.isTrialPeriod,
      },
    })
  } catch (error) {
    console.error('[APPLE-IAP] Error getting active subscription:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to get active subscription',
      error: error.message,
    })
  }
}

/**
 * Refresh subscription status (re-verify with Apple)
 */
const refreshSubscription = async (req, res) => {
  try {
    const { purchaseId } = req.params
    const userId = req.user.userId

    const purchase = await ApplePurchase.findOne({
      _id: purchaseId,
      userId,
    })

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found',
      })
    }

    // Re-verify with Apple (would need to store original receipt)
    // For now, just check expiry date
    if (new Date() > purchase.expiresDate) {
      purchase.verificationStatus = 'expired'
      await purchase.save()

      // Update user VIP status
      await User.findByIdAndUpdate(userId, {
        $set: { 'vip.isActive': false },
      })
    }

    res.json({
      success: true,
      message: 'Subscription refreshed successfully',
      data: {
        id: purchase._id,
        productId: purchase.productId,
        expiresDate: purchase.expiresDate,
        autoRenewStatus: purchase.autoRenewStatus,
        isActive: purchase.isActive(),
        verificationStatus: purchase.verificationStatus,
      },
    })
  } catch (error) {
    console.error('[APPLE-IAP] Error refreshing subscription:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to refresh subscription',
      error: error.message,
    })
  }
}

/**
 * Handle Apple App Store Server Notifications (webhooks)
 */
const handleWebhook = async (req, res) => {
  try {
    console.log('[APPLE-IAP] Received webhook notification')

    // Apple Server-to-Server notifications V2 format
    const { signedPayload } = req.body

    if (!signedPayload) {
      console.error('[APPLE-IAP] Missing signedPayload in webhook')
      return res.status(400).json({
        success: false,
        message: 'Invalid notification format',
      })
    }

    // Verify and decode the JWT
    const verificationResult =
      await appleIAPService.verifyServerNotification(signedPayload)

    if (!verificationResult.success) {
      console.error('[APPLE-IAP] Webhook signature verification failed')
      return res.status(400).json({
        success: false,
        message: 'Invalid notification signature',
      })
    }

    const notification = verificationResult.data
    console.log(
      '[APPLE-IAP] Webhook notification type:',
      notification.notificationType,
    )

    // Handle different notification types
    // notificationType can be: DID_RENEW, EXPIRED, DID_FAIL_TO_RENEW, etc.
    // TODO: Implement notification handling based on type

    res.status(200).json({ success: true })
  } catch (error) {
    console.error('[APPLE-IAP] Error handling webhook:', error)
    res.status(500).json({
      success: false,
      message: 'Webhook processing failed',
      error: error.message,
    })
  }
}

module.exports = {
  verifyPurchase,
  getPurchaseHistory,
  getActiveSubscription,
  refreshSubscription,
  handleWebhook,
}
