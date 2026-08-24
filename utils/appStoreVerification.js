const https = require('https');
const config = require('../config/config');

const requestAppleVerification = (hostname, verificationData) => {
  const postData = JSON.stringify(verificationData);
  const options = {
    hostname,
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
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
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
};

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
    // TestFlight uses sandbox receipts even when the API itself is deployed in
    // a non-production environment, so every environment must verify with Apple.
    const verificationData = {
      'receipt-data': receiptData,
      'password': config.APP_STORE_SHARED_SECRET, // Your App Store shared secret
      'exclude-old-transactions': true
    };

    if (!config.APP_STORE_SHARED_SECRET) {
      return {
        valid: false,
        error: 'APP_STORE_SHARED_SECRET is not configured on the API server'
      };
    }

    // Always try production first. TestFlight/sandbox receipts return 21007 and
    // must be retried against Apple's sandbox endpoint.
    let response = await requestAppleVerification('buy.itunes.apple.com', verificationData);
    if (response.status === 21007) {
      response = await requestAppleVerification('sandbox.itunes.apple.com', verificationData);
    } else if (response.status === 21008) {
      response = await requestAppleVerification('buy.itunes.apple.com', verificationData);
    }

    if (response.status !== 0) {
      return {
        valid: false,
        status: response.status,
        error: getAppStoreErrorDescription(response.status)
      };
    }

    const receipt = response.receipt || {};
    if (config.APP_BUNDLE_ID && receipt.bundle_id !== config.APP_BUNDLE_ID) {
      return {
        valid: false,
        error: `Receipt bundle ID ${receipt.bundle_id || '(missing)'} does not match this application`
      };
    }
    const transactions = [
      ...(Array.isArray(receipt.in_app) ? receipt.in_app : []),
      ...(Array.isArray(response.latest_receipt_info) ? response.latest_receipt_info : [])
    ];
    const productTransactions = transactions
      .filter((transaction) => transaction.product_id === productId)
      .sort((a, b) => Number(b.purchase_date_ms || 0) - Number(a.purchase_date_ms || 0));
    const productTransaction = productTransactions[0];

    if (!productTransaction) {
      return { valid: false, error: 'Product not found in receipt' };
    }

    return {
      valid: true,
      transactionId: productTransaction.transaction_id,
      productId: productTransaction.product_id,
      purchaseDate: new Date(Number(productTransaction.purchase_date_ms)).toISOString(),
      expiresDate: productTransaction.expires_date_ms
        ? new Date(Number(productTransaction.expires_date_ms)).toISOString()
        : null,
      originalTransactionId: productTransaction.original_transaction_id,
      bundleId: receipt.bundle_id,
      environment: response.environment
    };
    
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

// SHA-256 fingerprint of Apple Root CA - G3 (https://www.apple.com/certificateauthority/),
// the root of the certificate chain embedded in every StoreKit 2 signed transaction.
const APPLE_ROOT_CA_G3_FINGERPRINT256 =
  '63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79';

const base64UrlToBuffer = (value) =>
  Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/**
 * Verify a StoreKit 2 signed transaction (JWS) entirely offline.
 *
 * StoreKit 2 purchases do not always produce the legacy app-store receipt file
 * (notably in TestFlight/sandbox), but they always carry a jwsRepresentation
 * signed by Apple. The JWS embeds its x5c certificate chain; verification
 * checks the chain links, pins the root to Apple Root CA - G3, verifies the
 * ES256 signature with the leaf certificate, then validates the payload claims
 * against what the client reported.
 *
 * @param {string} jws - The signed transaction (header.payload.signature)
 * @param {Object} expected - { bundleId, productId, transactionId }
 * @returns {Object} Same shape as verifyAppStoreReceipt results
 */
const verifyAppStoreJws = (jws, expected = {}) => {
  const crypto = require('crypto');
  try {
    if (typeof jws !== 'string' || jws.split('.').length !== 3) {
      return { valid: false, error: 'Malformed signed transaction (JWS)' };
    }
    const [headerB64, payloadB64, signatureB64] = jws.split('.');
    const header = JSON.parse(base64UrlToBuffer(headerB64).toString('utf8'));
    if (header.alg !== 'ES256' || !Array.isArray(header.x5c) || header.x5c.length < 2) {
      return { valid: false, error: 'Unsupported signed transaction header' };
    }

    const chain = header.x5c.map(
      (cert) => new crypto.X509Certificate(Buffer.from(cert, 'base64'))
    );
    for (let i = 0; i < chain.length - 1; i++) {
      if (!chain[i].verify(chain[i + 1].publicKey)) {
        return { valid: false, error: 'Signed transaction certificate chain is invalid' };
      }
    }
    const rootCert = chain[chain.length - 1];
    if (rootCert.fingerprint256 !== APPLE_ROOT_CA_G3_FINGERPRINT256) {
      return { valid: false, error: 'Signed transaction is not rooted in Apple Root CA - G3' };
    }

    const signatureValid = crypto.verify(
      'sha256',
      Buffer.from(`${headerB64}.${payloadB64}`),
      { key: chain[0].publicKey, dsaEncoding: 'ieee-p1363' },
      base64UrlToBuffer(signatureB64)
    );
    if (!signatureValid) {
      return { valid: false, error: 'Signed transaction signature verification failed' };
    }

    const payload = JSON.parse(base64UrlToBuffer(payloadB64).toString('utf8'));

    if (expected.bundleId && payload.bundleId !== expected.bundleId) {
      return {
        valid: false,
        error: `Signed transaction bundle ID ${payload.bundleId || '(missing)'} does not match this application`
      };
    }
    if (expected.productId && payload.productId !== expected.productId) {
      return { valid: false, error: 'Signed transaction product does not match the purchase' };
    }
    if (expected.transactionId && String(payload.transactionId) !== String(expected.transactionId)) {
      return { valid: false, error: 'Signed transaction ID does not match the purchase' };
    }
    if (payload.revocationDate) {
      return { valid: false, error: 'This App Store transaction has been revoked' };
    }

    return {
      valid: true,
      method: 'jws',
      transactionId: String(payload.transactionId),
      productId: payload.productId,
      purchaseDate: payload.purchaseDate
        ? new Date(payload.purchaseDate).toISOString()
        : null,
      expiresDate: payload.expiresDate
        ? new Date(payload.expiresDate).toISOString()
        : null,
      originalTransactionId: String(payload.originalTransactionId || payload.transactionId),
      environment: payload.environment
    };
  } catch (error) {
    return { valid: false, error: 'Signed transaction verification error: ' + error.message };
  }
};

module.exports = {
  verifyAppStoreReceipt,
  verifyAppStoreJws,
  validateSubscriptionPurchase,
  getSubscriptionStatus,
  getAppStoreErrorDescription
};
