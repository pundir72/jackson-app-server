const { google } = require('googleapis');
const config = require('../config/config');

/**
 * Google Play Billing Service
 * Handles verification and management of Google Play in-app purchases
 */

class GooglePlayService {
  constructor() {
    this.androidPublisher = null;
    this.initialized = false;
  }

  /**
   * Initialize Google Play API client
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Check if credentials are configured
      if (!config.GOOGLE_PLAY_SERVICE_ACCOUNT && !config.GOOGLE_PLAY_KEY_FILE) {
        throw new Error(
          'Google Play credentials not configured. Please set GOOGLE_PLAY_SERVICE_ACCOUNT or GOOGLE_PLAY_KEY_FILE in your .env file'
        );
      }

      let credentials;
      
      // Parse service account JSON if provided as string
      if (config.GOOGLE_PLAY_SERVICE_ACCOUNT) {
        try {
          credentials = typeof config.GOOGLE_PLAY_SERVICE_ACCOUNT === 'string'
            ? JSON.parse(config.GOOGLE_PLAY_SERVICE_ACCOUNT)
            : config.GOOGLE_PLAY_SERVICE_ACCOUNT;
        } catch (parseError) {
          throw new Error(
            'Invalid GOOGLE_PLAY_SERVICE_ACCOUNT JSON format. Please check your .env file'
          );
        }
      }

      // Initialize with service account credentials
      const auth = new google.auth.GoogleAuth({
        credentials: credentials,
        keyFile: config.GOOGLE_PLAY_KEY_FILE,
        scopes: ['https://www.googleapis.com/auth/androidpublisher']
      });

      this.androidPublisher = google.androidpublisher({
        version: 'v3',
        auth
      });

      this.initialized = true;
      console.log('Google Play API initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Google Play API:', error.message);
      throw error;
    }
  }

  /**
   * Verify a subscription purchase
   * @param {string} packageName - App package name
   * @param {string} subscriptionId - Subscription product ID
   * @param {string} purchaseToken - Purchase token from client
   * @returns {Object} Verification result
   */
  async verifySubscription(packageName, subscriptionId, purchaseToken) {
    try {
      await this.initialize();

      const response = await this.androidPublisher.purchases.subscriptions.get({
        packageName,
        subscriptionId,
        token: purchaseToken
      });

      const purchase = response.data;

      return {
        success: true,
        verified: true,
        data: {
          orderId: purchase.orderId,
          purchaseToken: purchaseToken,
          productId: subscriptionId,
          purchaseTime: new Date(parseInt(purchase.startTimeMillis)),
          expiryTime: new Date(parseInt(purchase.expiryTimeMillis)),
          autoRenewing: purchase.autoRenewing || false,
          purchaseState: purchase.paymentState, // 0: Payment pending, 1: Payment received, 2: Free trial, 3: Pending deferred upgrade/downgrade
          acknowledgementState: purchase.acknowledgementState, // 0: Yet to be acknowledged, 1: Acknowledged
          kind: purchase.kind,
          priceAmountMicros: purchase.priceAmountMicros,
          priceCurrencyCode: purchase.priceCurrencyCode,
          countryCode: purchase.countryCode,
          developerPayload: purchase.developerPayload,
          cancelReason: purchase.cancelReason,
          userCancellationTimeMillis: purchase.userCancellationTimeMillis,
          rawResponse: purchase
        }
      };
    } catch (error) {
      console.error('Subscription verification error:', error);
      
      if (error.code === 404) {
        return {
          success: false,
          verified: false,
          error: 'Subscription not found or invalid purchase token'
        };
      }

      return {
        success: false,
        verified: false,
        error: error.message || 'Verification failed'
      };
    }
  }

  /**
   * Verify a one-time product purchase
   * @param {string} packageName - App package name
   * @param {string} productId - Product ID
   * @param {string} purchaseToken - Purchase token from client
   * @returns {Object} Verification result
   */
  async verifyProduct(packageName, productId, purchaseToken) {
    try {
      await this.initialize();

      const response = await this.androidPublisher.purchases.products.get({
        packageName,
        productId,
        token: purchaseToken
      });

      const purchase = response.data;

      return {
        success: true,
        verified: true,
        data: {
          orderId: purchase.orderId,
          purchaseToken: purchaseToken,
          productId: productId,
          purchaseTime: new Date(parseInt(purchase.purchaseTimeMillis)),
          purchaseState: purchase.purchaseState, // 0: Purchased, 1: Canceled, 2: Pending
          consumptionState: purchase.consumptionState, // 0: Yet to be consumed, 1: Consumed
          acknowledgementState: purchase.acknowledgementState, // 0: Yet to be acknowledged, 1: Acknowledged
          kind: purchase.kind,
          developerPayload: purchase.developerPayload,
          quantity: purchase.quantity,
          rawResponse: purchase
        }
      };
    } catch (error) {
      console.error('Product verification error:', error);
      
      if (error.code === 404) {
        return {
          success: false,
          verified: false,
          error: 'Product not found or invalid purchase token'
        };
      }

      return {
        success: false,
        verified: false,
        error: error.message || 'Verification failed'
      };
    }
  }

  /**
   * Acknowledge a subscription purchase
   * @param {string} packageName - App package name
   * @param {string} subscriptionId - Subscription product ID
   * @param {string} purchaseToken - Purchase token
   * @returns {Object} Acknowledgement result
   */
  async acknowledgeSubscription(packageName, subscriptionId, purchaseToken) {
    try {
      await this.initialize();

      await this.androidPublisher.purchases.subscriptions.acknowledge({
        packageName,
        subscriptionId,
        token: purchaseToken
      });

      return {
        success: true,
        acknowledged: true
      };
    } catch (error) {
      console.error('Subscription acknowledgement error:', error);
      return {
        success: false,
        acknowledged: false,
        error: error.message || 'Acknowledgement failed'
      };
    }
  }

  /**
   * Acknowledge a product purchase
   * @param {string} packageName - App package name
   * @param {string} productId - Product ID
   * @param {string} purchaseToken - Purchase token
   * @returns {Object} Acknowledgement result
   */
  async acknowledgeProduct(packageName, productId, purchaseToken) {
    try {
      await this.initialize();

      await this.androidPublisher.purchases.products.acknowledge({
        packageName,
        productId,
        token: purchaseToken
      });

      return {
        success: true,
        acknowledged: true
      };
    } catch (error) {
      console.error('Product acknowledgement error:', error);
      return {
        success: false,
        acknowledged: false,
        error: error.message || 'Acknowledgement failed'
      };
    }
  }

  /**
   * Cancel a subscription
   * @param {string} packageName - App package name
   * @param {string} subscriptionId - Subscription product ID
   * @param {string} purchaseToken - Purchase token
   * @returns {Object} Cancellation result
   */
  async cancelSubscription(packageName, subscriptionId, purchaseToken) {
    try {
      await this.initialize();

      await this.androidPublisher.purchases.subscriptions.cancel({
        packageName,
        subscriptionId,
        token: purchaseToken
      });

      return {
        success: true,
        canceled: true
      };
    } catch (error) {
      console.error('Subscription cancellation error:', error);
      return {
        success: false,
        canceled: false,
        error: error.message || 'Cancellation failed'
      };
    }
  }

  /**
   * Refund a subscription
   * @param {string} packageName - App package name
   * @param {string} subscriptionId - Subscription product ID
   * @param {string} purchaseToken - Purchase token
   * @returns {Object} Refund result
   */
  async refundSubscription(packageName, subscriptionId, purchaseToken) {
    try {
      await this.initialize();

      await this.androidPublisher.purchases.subscriptions.refund({
        packageName,
        subscriptionId,
        token: purchaseToken
      });

      return {
        success: true,
        refunded: true
      };
    } catch (error) {
      console.error('Subscription refund error:', error);
      return {
        success: false,
        refunded: false,
        error: error.message || 'Refund failed'
      };
    }
  }

  /**
   * Revoke a subscription
   * @param {string} packageName - App package name
   * @param {string} subscriptionId - Subscription product ID
   * @param {string} purchaseToken - Purchase token
   * @returns {Object} Revoke result
   */
  async revokeSubscription(packageName, subscriptionId, purchaseToken) {
    try {
      await this.initialize();

      await this.androidPublisher.purchases.subscriptions.revoke({
        packageName,
        subscriptionId,
        token: purchaseToken
      });

      return {
        success: true,
        revoked: true
      };
    } catch (error) {
      console.error('Subscription revoke error:', error);
      return {
        success: false,
        revoked: false,
        error: error.message || 'Revoke failed'
      };
    }
  }

  /**
   * Get subscription purchase details
   * @param {string} packageName - App package name
   * @param {string} subscriptionId - Subscription product ID
   * @param {string} purchaseToken - Purchase token
   * @returns {Object} Subscription details
   */
  async getSubscriptionDetails(packageName, subscriptionId, purchaseToken) {
    return this.verifySubscription(packageName, subscriptionId, purchaseToken);
  }
}

// Export singleton instance
module.exports = new GooglePlayService();
