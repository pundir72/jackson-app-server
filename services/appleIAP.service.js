const axios = require('axios')
const jwt = require('jsonwebtoken')
const config = require('../config/config')

// Apple App Store URLs
const PRODUCTION_URL = 'https://buy.itunes.apple.com/verifyReceipt'
const SANDBOX_URL = 'https://sandbox.itunes.apple.com/verifyReceipt'

// Apple App Store Server API URLs
const SERVER_API_PRODUCTION = 'https://api.storekit.itunes.apple.com'
const SERVER_API_SANDBOX = 'https://api.storekit-sandbox.itunes.apple.com'

// Note: For App Store Server Notifications V2, Apple includes the public key
// in the JWT's x5c header (certificate chain). We need to extract and verify it.
// The JWKS endpoint (https://appleid.apple.com/auth/keys) is for Sign in with Apple only.

const STATUS_CODES = {
  0: 'Valid receipt',
  21000: 'The App Store could not read the JSON object you provided',
  21002: 'The data in the receipt-data property was malformed or missing',
  21003: 'The receipt could not be authenticated',
  21004:
    'The shared secret you provided does not match the shared secret on file',
  21005: 'The receipt server is not currently available',
  21006: 'This receipt is valid but the subscription has expired',
  21007: 'This receipt is from the test environment (sandbox)',
  21008: 'This receipt is from the production environment',
  21009: 'Internal data access error',
  21010: 'The user account cannot be found or has been deleted',
}

const verifyReceipt = async (receiptData, useSandbox = false) => {
  try {
    const url = useSandbox ? SANDBOX_URL : PRODUCTION_URL
    const sharedSecret =
      config.APPLE_SHARED_SECRET || process.env.APPLE_SHARED_SECRET

    if (!sharedSecret) {
      console.error('[APPLE-IAP-SERVICE] APPLE_SHARED_SECRET not configured')
      return {
        success: false,
        verified: false,
        error:
          'Apple IAP credentials not configured on server. Please contact support.',
      }
    }

    console.log(
      `[APPLE-IAP-SERVICE] Verifying receipt with Apple (${useSandbox ? 'sandbox' : 'production'})...`,
    )

    const response = await axios.post(
      url,
      {
        'receipt-data': receiptData,
        password: sharedSecret,
        'exclude-old-transactions': true,
      },
      {
        timeout: 15000,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    )

    const { status, receipt, latest_receipt_info, pending_renewal_info } =
      response.data

    console.log(
      '[APPLE-IAP-SERVICE] Apple response status:',
      status,
      STATUS_CODES[status] || 'Unknown status',
    )

    // Status code 21007 means sandbox receipt sent to production
    if (status === 21007) {
      console.log(
        '[APPLE-IAP-SERVICE] Sandbox receipt detected, retrying with sandbox URL...',
      )
      return verifyReceipt(receiptData, true)
    }

    // Status code 21008 means production receipt sent to sandbox (shouldn't happen)
    if (status === 21008) {
      console.log(
        '[APPLE-IAP-SERVICE] Production receipt detected in sandbox, retrying with production URL...',
      )
      return verifyReceipt(receiptData, false)
    }

    // Status code 0 = valid receipt
    // Status code 21006 = valid but expired (we still want to record it)
    if (status !== 0 && status !== 21006) {
      return {
        success: false,
        verified: false,
        error:
          STATUS_CODES[status] ||
          `Apple verification failed with status ${status}`,
      }
    }

    // Get the latest subscription info
    let latestTransaction = null

    if (latest_receipt_info && latest_receipt_info.length > 0) {
      // Sort by purchase_date_ms descending to get the latest
      latestTransaction = latest_receipt_info.sort(
        (a, b) => parseInt(b.purchase_date_ms) - parseInt(a.purchase_date_ms),
      )[0]
    } else if (receipt && receipt.in_app && receipt.in_app.length > 0) {
      // Fallback to in_app if latest_receipt_info is not available
      latestTransaction = receipt.in_app.sort(
        (a, b) => parseInt(b.purchase_date_ms) - parseInt(a.purchase_date_ms),
      )[0]
    }

    if (!latestTransaction) {
      return {
        success: false,
        verified: false,
        error: 'No transaction found in receipt',
      }
    }

    console.log('[APPLE-IAP-SERVICE] Receipt verified successfully')

    return {
      success: true,
      verified: true,
      data: {
        ...latestTransaction,
        receipt_status: status,
        pending_renewal_info: pending_renewal_info?.[0] || null,
        environment: useSandbox ? 'sandbox' : 'production',
      },
    }
  } catch (error) {
    console.error(
      '[APPLE-IAP-SERVICE] Receipt verification error:',
      error.message,
    )

    // Handle network errors
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return {
        success: false,
        verified: false,
        error: 'Connection timeout. Please try again.',
      }
    }

    // Handle axios errors
    if (error.response) {
      return {
        success: false,
        verified: false,
        error: `Apple verification failed: ${error.response.status} ${error.response.statusText}`,
      }
    }

    return {
      success: false,
      verified: false,
      error: error.message || 'Receipt verification failed',
    }
  }
}

const verifyServerNotification = async (signedPayload) => {
  try {
    console.log('[APPLE-IAP-SERVICE] Verifying server notification...')

    // Decode JWT header to get certificate chain
    const parts = signedPayload.split('.')
    if (parts.length !== 3) {
      return {
        success: false,
        error: 'Invalid JWT format',
      }
    }

    const headerBase64 = parts[0]
    const header = JSON.parse(
      Buffer.from(headerBase64, 'base64').toString('utf-8'),
    )

    // For App Store Server Notifications V2, the certificate chain is in x5c header
    if (!header.x5c || !Array.isArray(header.x5c) || header.x5c.length === 0) {
      console.warn(
        '[APPLE-IAP-SERVICE] Missing x5c certificate chain in JWT header',
      )
      console.warn(
        '[APPLE-IAP-SERVICE] Skipping signature verification (NOT SECURE FOR PRODUCTION)',
      )

      // Decode payload without verification (NOT SECURE)
      const payloadBase64 = parts[1]
      const decoded = JSON.parse(
        Buffer.from(payloadBase64, 'base64').toString('utf-8'),
      )

      console.log(
        '[APPLE-IAP-SERVICE] Notification type:',
        decoded.notificationType,
      )

      return {
        success: true,
        verified: false, // Not verified!
        data: decoded,
      }
    }

    // Extract the public key from the first certificate in the chain
    const certData = header.x5c[0]
    const cert = `-----BEGIN CERTIFICATE-----\n${certData}\n-----END CERTIFICATE-----`

    // Verify the JWT signature using the certificate
    const decoded = jwt.verify(signedPayload, cert, {
      algorithms: ['ES256'], // Apple uses ES256 algorithm
    })

    console.log(
      '[APPLE-IAP-SERVICE] Notification type:',
      decoded.notificationType,
    )
    console.log('[APPLE-IAP-SERVICE] JWT verified successfully')

    // TODO: In production, you should also verify the certificate chain
    // against Apple's root certificate to ensure it's genuinely from Apple
    // See: https://developer.apple.com/documentation/appstoreservernotifications/responding_to_app_store_server_notifications

    return {
      success: true,
      verified: true,
      data: decoded,
    }
  } catch (error) {
    console.error(
      '[APPLE-IAP-SERVICE] Server notification verification error:',
      error.message,
    )

    // Handle specific JWT errors
    if (error.name === 'JsonWebTokenError') {
      return {
        success: false,
        verified: false,
        error: 'Invalid JWT signature',
      }
    }

    if (error.name === 'TokenExpiredError') {
      return {
        success: false,
        verified: false,
        error: 'JWT has expired',
      }
    }

    return {
      success: false,
      verified: false,
      error: error.message,
    }
  }
}

const generateAppStoreServerToken = () => {
  try {
    const privateKey =
      config.APPLE_PRIVATE_KEY || process.env.APPLE_PRIVATE_KEY
    const keyId = config.APPLE_KEY_ID || process.env.APPLE_KEY_ID
    const issuerId = config.APPLE_ISSUER_ID || process.env.APPLE_ISSUER_ID
    const bundleId = config.APPLE_BUNDLE_ID || process.env.APPLE_BUNDLE_ID

    if (!privateKey || !keyId || !issuerId || !bundleId) {
      throw new Error(
        'Missing Apple App Store Server API credentials. Required: APPLE_PRIVATE_KEY, APPLE_KEY_ID, APPLE_ISSUER_ID, APPLE_BUNDLE_ID',
      )
    }

    const now = Math.floor(Date.now() / 1000)

    const payload = {
      iss: issuerId,
      iat: now,
      exp: now + 3600, // Token expires in 1 hour
      aud: 'appstoreconnect-v1',
      bid: bundleId,
    }

    const token = jwt.sign(payload, privateKey, {
      algorithm: 'ES256',
      keyid: keyId,
    })

    return token
  } catch (error) {
    console.error(
      '[APPLE-IAP-SERVICE] Failed to generate App Store Server token:',
      error.message,
    )
    throw error
  }
}

const getSubscriptionStatus = async (originalTransactionId, useSandbox = false) => {
  try {
    // Generate authentication token
    const token = generateAppStoreServerToken()
    const baseUrl = useSandbox ? SERVER_API_SANDBOX : SERVER_API_PRODUCTION
    const url = `${baseUrl}/inApps/v1/subscriptions/${originalTransactionId}`

    console.log(
      `[APPLE-IAP-SERVICE] Fetching subscription status for transaction: ${originalTransactionId} (${useSandbox ? 'sandbox' : 'production'})`,
    )

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    })

    console.log('[APPLE-IAP-SERVICE] Subscription status retrieved successfully')

    return {
      success: true,
      data: response.data,
    }
  } catch (error) {
    console.error(
      '[APPLE-IAP-SERVICE] Failed to get subscription status:',
      error.message,
    )

    // If production fails with 404, try sandbox
    if (
      !useSandbox &&
      error.response &&
      (error.response.status === 404 || error.response.status === 400)
    ) {
      console.log(
        '[APPLE-IAP-SERVICE] Retrying with sandbox environment...',
      )
      return getSubscriptionStatus(originalTransactionId, true)
    }

    // Handle missing credentials
    if (error.message.includes('Missing Apple App Store Server API credentials')) {
      return {
        success: false,
        error: 'App Store Server API not configured. Please add APPLE_PRIVATE_KEY, APPLE_KEY_ID, APPLE_ISSUER_ID, and APPLE_BUNDLE_ID to environment variables.',
      }
    }

    // Handle network errors
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return {
        success: false,
        error: 'Connection timeout. Please try again.',
      }
    }

    // Handle API errors
    if (error.response) {
      const status = error.response.status
      const errorData = error.response.data

      if (status === 401) {
        return {
          success: false,
          error: 'Invalid authentication token',
        }
      }

      if (status === 404) {
        return {
          success: false,
          error: 'Transaction not found',
        }
      }

      return {
        success: false,
        error: errorData?.errorMessage || `API error: ${status}`,
      }
    }

    return {
      success: false,
      error: error.message || 'Failed to get subscription status',
    }
  }
}

module.exports = {
  verifyReceipt,
  verifyServerNotification,
  getSubscriptionStatus,
  generateAppStoreServerToken,
}
