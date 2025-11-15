const besitos = require('./besitos');
const bitlabs = require('./bitlabs');
const SurveySDK = require('../models/SurveySDK');

/**
 * SDK Status Checker Utility
 * Checks initialization status of all SDK providers
 */

/**
 * Check if Besitos SDK is initialized
 */
async function checkBesitosStatus() {
  try {
    // Check if credentials are configured
    const isConfigured = !!(
      process.env.BESITOS_API_TOKEN || 
      process.env.BESITOS_API_KEY ||
      (process.env.BESITOS_PARTNER_ID && process.env.BESITOS_BASE_URL)
    );
    
    if (!isConfigured) {
      return {
        initialized: false,
        error: 'Besitos credentials not configured (missing BESITOS_API_TOKEN/API_KEY or BESITOS_PARTNER_ID)',
        offersAvailable: 0
      };
    }

    // Try to fetch offers to verify connectivity (lightweight test)
    try {
      const testResult = await besitos.getGameOffers({
        userId: 'test',
        userProfile: {
          age: 25,
          gender: 'other',
          country: 'US',
          language: 'en',
          platform: 'mobile'
        }
      });

      return {
        initialized: true,
        offersAvailable: testResult.success ? (testResult.offers?.length || 0) : 0,
        lastChecked: new Date()
      };
    } catch (error) {
      // If configured but test fails, still mark as initialized (may be rate limit or temporary issue)
      return {
        initialized: true,
        offersAvailable: 0,
        warning: `SDK configured but connectivity test failed: ${error.message}`,
        lastChecked: new Date()
      };
    }
  } catch (error) {
    return {
      initialized: false,
      error: error.message,
      offersAvailable: 0
    };
  }
}

/**
 * Check if Bitlabs SDK is initialized
 */
async function checkBitlabsStatus() {
  try {
    // Check if credentials are configured
    const isConfigured = !!(
      process.env.BITLABS_API_KEY && 
      process.env.BITLABS_PUBLISHER_ID
    );
    
    if (!isConfigured) {
      return {
        initialized: false,
        error: 'Bitlabs credentials not configured (missing BITLABS_API_KEY or BITLABS_PUBLISHER_ID)',
        offersAvailable: 0
      };
    }

    // Try to fetch surveys to verify connectivity (lightweight test)
    try {
      const testResult = await bitlabs.getSurveys({
        userId: 'test',
        userProfile: {
          age: 25,
          gender: 'other',
          country: 'US',
          language: 'en',
          platform: 'mobile'
        }
      });

      return {
        initialized: true,
        offersAvailable: testResult.success ? (testResult.surveys?.length || 0) : 0,
        lastChecked: new Date()
      };
    } catch (error) {
      // If configured but test fails, still mark as initialized (may be rate limit or temporary issue)
      return {
        initialized: true,
        offersAvailable: 0,
        warning: `SDK configured but connectivity test failed: ${error.message}`,
        lastChecked: new Date()
      };
    }
  } catch (error) {
    return {
      initialized: false,
      error: error.message,
      offersAvailable: 0
    };
  }
}

/**
 * Check status of SurveySDK entries from database
 */
async function checkSurveySDKStatus() {
  try {
    const surveySDKs = await SurveySDK.find({ isActive: true }).lean();
    
    const statuses = {};
    for (const sdk of surveySDKs) {
      const isConfigured = !!(sdk.apiKey && sdk.baseUrl);
      
      statuses[sdk.name.toLowerCase()] = {
        initialized: isConfigured,
        isActive: sdk.isActive,
        offersAvailable: sdk.analytics?.totalOffers || 0,
        lastSyncAt: sdk.analytics?.lastSyncAt || null,
        error: isConfigured ? null : 'SDK not configured (missing API_KEY or BASE_URL)'
      };
    }

    return statuses;
  } catch (error) {
    return {
      error: `Failed to check SurveySDK status: ${error.message}`
    };
  }
}

/**
 * Get comprehensive SDK status for all providers
 */
async function getAllSDKStatus() {
  try {
    const [besitosStatus, bitlabsStatus, surveySDKStatuses] = await Promise.all([
      checkBesitosStatus(),
      checkBitlabsStatus(),
      checkSurveySDKStatus()
    ]);

    const allStatuses = {
      besitos: besitosStatus,
      bitlabs: bitlabsStatus,
      ...surveySDKStatuses
    };

    // Calculate overall status
    const activeSDKs = Object.keys(allStatuses).filter(
      key => allStatuses[key].initialized === true
    );

    const initialized = activeSDKs.length > 0;
    const totalOffersAvailable = Object.values(allStatuses).reduce(
      (sum, status) => sum + (status.offersAvailable || 0),
      0
    );

    return {
      initialized,
      activeSDKs,
      totalOffersAvailable,
      sdkStatus: allStatuses,
      timestamp: new Date()
    };
  } catch (error) {
    console.error('Error getting SDK status:', error);
    return {
      initialized: false,
      activeSDKs: [],
      totalOffersAvailable: 0,
      error: error.message,
      sdkStatus: {},
      timestamp: new Date()
    };
  }
}

module.exports = {
  checkBesitosStatus,
  checkBitlabsStatus,
  checkSurveySDKStatus,
  getAllSDKStatus
};

