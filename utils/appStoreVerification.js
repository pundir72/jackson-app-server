const https = require('https');
const config = require('../config/config');

/**
 * App Store Receipt Verification Utility
 * Handles iOS App Store receipt verification for in-app purchases
 */

/**
 * Verify App Store receipt with Apple's servers
 * @param {string} receiptData - Base64 encoded receipt data
 * @param {string} productId - Product identifier
 * @returns {Object} Verification result
 */
const verifyAppStoreReceipt = async (receiptData, productId) => {
  try {
    // In production, use Apple's verification service
    // For development/testing, we'll simulate verification
    
    if (process.env.NODE_ENV === 'development') {
      // Development mode - simulate successful verification
      return {
        valid: true,
        transactionId: `txn_${Date.now()}`,
        productId: productId,
        purchaseDate: new Date().toISOString(),
        expiresDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
        originalTransactionId: `orig_txn_${Date.now()}`,
        bundleId: config.APP_BUNDLE_ID || 'com.yourapp.bundle',
        environment: 'Sandbox'
      };
    }

    // Production verification with Apple
    const verificationData = {
      'receipt-data': receiptData,
      'password': config.APP_STORE_SHARED_SECRET, // Your App Store shared secret
      'exclude-old-transactions': true
    };

    const postData = JSON.stringify(verificationData);
    
    const options = {
      hostname: 'buy.itunes.apple.com', // Use 'sandbox.itunes.apple.com' for testing
      port: 443,
      path: '/verifyReceipt',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            
            if (response.status === 0) {
              // Receipt is valid
              const receipt = response.receipt;
              const inApp = receipt.in_app || [];
              
              // Find the specific product in the receipt
              const productTransaction = inApp.find(transaction => 
                transaction.product_id === productId
              );
              
              if (productTransaction) {
                resolve({
                  valid: true,
                  transactionId: productTransaction.transaction_id,
                  productId: productTransaction.product_id,
                  purchaseDate: new Date(parseInt(productTransaction.purchase_date_ms)).toISOString(),
                  expiresDate: productTransaction.expires_date_ms ? 
                    new Date(parseInt(productTransaction.expires_date_ms)).toISOString() : null,
                  originalTransactionId: productTransaction.original_transaction_id,
                  bundleId: receipt.bundle_id,
                  environment: response.environment
                });
              } else {
                resolve({
                  valid: false,
                  error: 'Product not found in receipt'
                });
              }
            } else {
              // Receipt is invalid
              resolve({
                valid: false,
                error: getAppStoreErrorDescription(response.status)
              });
            }
          } catch (error) {
            reject(new Error('Failed to parse Apple response: ' + error.message));
          }
        });
      });
      
      req.on('error', (error) => {
        reject(new Error('Apple verification request failed: ' + error.message));
      });
      
      req.write(postData);
      req.end();
    });
    
  } catch (error) {
    console.error('App Store verification error:', error);
    return {
      valid: false,
      error: error.message
    };
  }
};

/**
 * Get human-readable error description for App Store status codes
 * @param {number} status - App Store status code
 * @returns {string} Error description
 */
const getAppStoreErrorDescription = (status) => {
  const errorCodes = {
    21000: 'The App Store could not read the receipt data',
    21002: 'The receipt data property was malformed or missing',
    21003: 'The receipt could not be authenticated',
    21004: 'The shared secret you provided does not match the shared secret on file',
    21005: 'The receipt server is not currently available',
    21006: 'This receipt is valid but the subscription has expired',
    21007: 'This receipt is from the sandbox environment, but it was sent to the production environment for verification',
    21008: 'This receipt is from the production environment, but it was sent to the sandbox environment for verification',
    21009: 'Internal data access error',
    21010: 'The user account cannot be found or has been deleted'
  };
  
  return errorCodes[status] || `Unknown error (${status})`;
};

/**
 * Validate subscription purchase
 * @param {Object} verificationResult - Result from verifyAppStoreReceipt
 * @param {string} expectedProductId - Expected product ID
 * @returns {Object} Validation result
 */
const validateSubscriptionPurchase = (verificationResult, expectedProductId) => {
  if (!verificationResult.valid) {
    return {
      valid: false,
      error: verificationResult.error
    };
  }
  
  if (verificationResult.productId !== expectedProductId) {
    return {
      valid: false,
      error: 'Product ID mismatch'
    };
  }
  
  // Check if subscription is still active
  if (verificationResult.expiresDate) {
    const expiresDate = new Date(verificationResult.expiresDate);
    const now = new Date();
    
    if (expiresDate <= now) {
      return {
        valid: false,
        error: 'Subscription has expired'
      };
    }
  }
  
  return {
    valid: true,
    transactionId: verificationResult.transactionId,
    productId: verificationResult.productId,
    purchaseDate: verificationResult.purchaseDate,
    expiresDate: verificationResult.expiresDate,
    originalTransactionId: verificationResult.originalTransactionId
  };
};

/**
 * Get subscription status from App Store
 * @param {string} receiptData - Base64 encoded receipt data
 * @returns {Object} Subscription status
 */
const getSubscriptionStatus = async (receiptData) => {
  try {
    const verification = await verifyAppStoreReceipt(receiptData, '');
    
    if (!verification.valid) {
      return {
        valid: false,
        error: verification.error
      };
    }
    
    // Parse subscription status from receipt
    const now = new Date();
    const expiresDate = verification.expiresDate ? new Date(verification.expiresDate) : null;
    
    let status = 'unknown';
    if (expiresDate) {
      if (expiresDate > now) {
        status = 'active';
      } else {
        status = 'expired';
      }
    }
    
    return {
      valid: true,
      status,
      expiresDate: verification.expiresDate,
      transactionId: verification.transactionId,
      originalTransactionId: verification.originalTransactionId
    };
    
  } catch (error) {
    console.error('Error getting subscription status:', error);
    return {
      valid: false,
      error: error.message
    };
  }
};

module.exports = {
  verifyAppStoreReceipt,
  validateSubscriptionPurchase,
  getSubscriptionStatus,
  getAppStoreErrorDescription
};
