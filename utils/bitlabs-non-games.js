/**
 * Bitlabs Non-Game Offers Utility
 * Handles surveys, magic receipts, cashback, and shopping offers from Bitlabs
 * @module utils/bitlabs-non-games
 */

const bitlabsService = require('../services/bitlabs.service');
const bitlabsOfferCache = require('../utils/bitlabsOfferCache');

/**
 * Get non-game offers (surveys, magic receipts, cashback, shopping)
 * Uses dedicated Bitlabs endpoints: /v2/client/surveys and /v1/client/cashback/offers
 * @param {Object} params - Parameters
 * @param {string} params.userId - User ID
 * @param {Object} params.userProfile - User profile data
 * @param {string} params.type - Offer type: 'survey', 'magic_receipt', 'cashback', 'shopping', or 'all'
 * @param {string} params.category - Category filter
 * @returns {Promise<Object>} Non-game offers result
 */
async function getNonGameOffers(params = {}) {
  try {
    const { userId, userProfile = {}, type = 'all', category } = params;
    
    // Build query parameters
    const queryParams = {};
    
    // Add device filter based on user profile
    if (userProfile.platform) {
      queryParams.platform = userProfile.platform;
    }
    
    // Add client info if available
    if (userProfile.userAgent) {
      queryParams.client_user_agent = userProfile.userAgent;
    }
    if (userProfile.ip) {
      queryParams.client_ip = userProfile.ip;
    }
    
    const categorizedOffers = {
      surveys: [],
      magicReceipts: [],
      cashback: [],
      shopping: [],
      other: []
    };
    
    // Fetch from dedicated endpoints based on type
    const fetchPromises = [];
    
    // Fetch surveys from dedicated endpoint
    if (type === 'all' || type === 'survey') {
      fetchPromises.push(
        bitlabsService.getSurveys(queryParams, userId)
          .then(result => {
            if (result.success && result.data) {
              categorizedOffers.surveys = result.data.map(survey => normalizeOffer(survey, userId));
            }
          })
          .catch(err => {
            console.error('Error fetching surveys:', err.message);
          })
      );
    }
    
    // Fetch cashback from dedicated endpoint
    if (type === 'all' || type === 'cashback') {
      fetchPromises.push(
        bitlabsService.getCashbackOffers(queryParams, userId)
          .then(result => {
            if (result.success && result.data) {
              categorizedOffers.cashback = result.data.map(offer => normalizeOffer(offer, userId));
            }
          })
          .catch(err => {
            console.error('Error fetching cashback:', err.message);
          })
      );
    }
    
    // Fetch other non-game offers (magic receipts, shopping) from /v2/client/offers with is_game=false
    if (type === 'all' || type === 'magic_receipt' || type === 'shopping' || type === 'other') {
      const offersQueryParams = {
        is_game: false,
        ...queryParams
      };
      
      fetchPromises.push(
        bitlabsOfferCache.getOffers(offersQueryParams)
          .then(offers => {
            offers.forEach(offer => {
              const offerType = getOfferType(offer);
              const normalizedOffer = normalizeOffer(offer, userId);
              
              // Skip surveys and cashback (already fetched from dedicated endpoints)
              if (offerType === 'survey' || offerType === 'cashback') {
                return;
              }
              
              switch (offerType) {
                case 'magic_receipt':
                  categorizedOffers.magicReceipts.push(normalizedOffer);
                  break;
                case 'shopping':
                  categorizedOffers.shopping.push(normalizedOffer);
                  break;
                default:
                  categorizedOffers.other.push(normalizedOffer);
              }
            });
          })
          .catch(err => {
            console.error('Error fetching other non-game offers:', err.message);
          })
      );
    }
    
    // Wait for all fetches to complete
    await Promise.all(fetchPromises);
    
    // Combine all offers
    const allOffers = [
      ...categorizedOffers.surveys,
      ...categorizedOffers.magicReceipts,
      ...categorizedOffers.cashback,
      ...categorizedOffers.shopping,
      ...categorizedOffers.other
    ];
    
    // Filter by type if specified
    let filteredOffers = allOffers;
    if (type !== 'all') {
      filteredOffers = allOffers.filter(offer => offer.type === type);
    }
    
    // Filter by category if specified
    if (category && category !== 'all') {
      filteredOffers = filteredOffers.filter(offer => {
        const offerCategory = offer.category || '';
        return offerCategory.toLowerCase().includes(category.toLowerCase());
      });
    }
    
    // Calculate totals
    const totalOffers = filteredOffers.length;
    const estimatedEarnings = filteredOffers.reduce((sum, offer) => {
      return sum + (parseFloat(offer.reward?.coins || 0));
    }, 0);
    
    return {
      success: true,
      offers: filteredOffers,
      categorized: categorizedOffers,
      totalOffers,
      estimatedEarnings,
      breakdown: {
        surveys: categorizedOffers.surveys.length,
        magicReceipts: categorizedOffers.magicReceipts.length,
        cashback: categorizedOffers.cashback.length,
        shopping: categorizedOffers.shopping.length,
        other: categorizedOffers.other.length
      }
    };
  } catch (error) {
    console.error('Error getting non-game offers:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch non-game offers',
      offers: [],
      categorized: {
        surveys: [],
        magicReceipts: [],
        cashback: [],
        shopping: [],
        other: []
      },
      totalOffers: 0,
      estimatedEarnings: 0
    };
  }
}

/**
 * Get surveys specifically
 * Uses dedicated Bitlabs endpoint: /v2/client/surveys
 * @param {Object} params - Parameters
 * @returns {Promise<Object>} Survey offers result
 */
async function getSurveys(params = {}) {
  try {
    const { userId, userProfile = {}, category } = params;
    
    const queryParams = {};
    if (userProfile.platform) {
      queryParams.platform = userProfile.platform;
    }
    if (userProfile.userAgent) {
      queryParams.client_user_agent = userProfile.userAgent;
    }
    if (userProfile.ip) {
      queryParams.client_ip = userProfile.ip;
    }
    
    const result = await bitlabsService.getSurveys(queryParams, userId);
    
    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to fetch surveys',
        surveys: [],
        totalSurveys: 0,
        estimatedEarnings: 0
      };
    }
    
    let surveys = result.data || [];
    
    // Filter by category if specified
    if (category && category !== 'all') {
      surveys = surveys.filter(survey => {
        const surveyCategory = survey.category || '';
        return surveyCategory.toLowerCase().includes(category.toLowerCase());
      });
    }
    
    const normalizedSurveys = surveys.map(survey => normalizeOffer(survey, userId));
    const estimatedEarnings = normalizedSurveys.reduce((sum, s) => sum + (s.reward?.coins || 0), 0);
    
    return {
      success: true,
      surveys: normalizedSurveys,
      categorized: {
        surveys: normalizedSurveys,
        magicReceipts: [],
        cashback: [],
        shopping: [],
        other: []
      },
      totalSurveys: normalizedSurveys.length,
      estimatedEarnings
    };
  } catch (error) {
    console.error('Error getting surveys:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch surveys',
      surveys: [],
      totalSurveys: 0,
      estimatedEarnings: 0
    };
  }
}

/**
 * Get magic receipts
 * @param {Object} params - Parameters
 * @returns {Promise<Object>} Magic receipt offers result
 */
async function getMagicReceipts(params = {}) {
  return getNonGameOffers({ ...params, type: 'magic_receipt' });
}

/**
 * Get cashback offers
 * Uses dedicated Bitlabs endpoint: /v1/client/cashback/offers
 * @param {Object} params - Parameters
 * @returns {Promise<Object>} Cashback offers result
 */
async function getCashbackOffers(params = {}) {
  try {
    const { userId, userProfile = {}, category } = params;
    
    const queryParams = {};
    if (userProfile.platform) {
      queryParams.platform = userProfile.platform;
    }
    if (userProfile.userAgent) {
      queryParams.client_user_agent = userProfile.userAgent;
    }
    if (userProfile.ip) {
      queryParams.client_ip = userProfile.ip;
    }
    
    const result = await bitlabsService.getCashbackOffers(queryParams, userId);
    
    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to fetch cashback offers',
        cashback: [],
        totalCashback: 0,
        estimatedEarnings: 0
      };
    }
    
    let cashback = result.data || [];
    
    // Filter by category if specified
    if (category && category !== 'all') {
      cashback = cashback.filter(offer => {
        const offerCategory = offer.category || '';
        return offerCategory.toLowerCase().includes(category.toLowerCase());
      });
    }
    
    const normalizedCashback = cashback.map(offer => normalizeOffer(offer, userId));
    const estimatedEarnings = normalizedCashback.reduce((sum, c) => sum + (c.reward?.coins || 0), 0);
    
    return {
      success: true,
      cashback: normalizedCashback,
      categorized: {
        surveys: [],
        magicReceipts: [],
        cashback: normalizedCashback,
        shopping: [],
        other: []
      },
      totalCashback: normalizedCashback.length,
      estimatedEarnings
    };
  } catch (error) {
    console.error('Error getting cashback offers:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch cashback offers',
      cashback: [],
      totalCashback: 0,
      estimatedEarnings: 0
    };
  }
}

/**
 * Get shopping offers
 * @param {Object} params - Parameters
 * @returns {Promise<Object>} Shopping offers result
 */
async function getShoppingOffers(params = {}) {
  return getNonGameOffers({ ...params, type: 'shopping' });
}

/**
 * Track offer start/click
 * @param {Object} params - Parameters
 * @returns {Promise<Object>} Tracking result
 */
async function trackOfferClick(params = {}) {
  try {
    const { userId, offerId, offerType, trackingId } = params;
    
    // Log the click for analytics
    console.log(`Tracking offer click: ${offerId} by user ${userId} (type: ${offerType})`);
    
    // In the future, this could call Bitlabs tracking API
    // For now, just return success
    return {
      success: true,
      trackingId: trackingId || `track_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      message: 'Offer click tracked'
    };
  } catch (error) {
    console.error('Error tracking offer click:', error);
    return {
      success: false,
      error: error.message || 'Failed to track offer click'
    };
  }
}

/**
 * Track offer completion
 * @param {Object} params - Parameters
 * @returns {Promise<Object>} Completion result
 */
async function trackCompletion(params = {}) {
  try {
    const { userId, offerId, offerType, completionData, reward } = params;
    
    console.log(`Tracking offer completion: ${offerId} by user ${userId} (type: ${offerType})`);
    
    // In the future, this could verify completion with Bitlabs API
    // For now, just return success
    return {
      success: true,
      offerId,
      reward: reward || 0,
      message: 'Offer completion tracked'
    };
  } catch (error) {
    console.error('Error tracking offer completion:', error);
    return {
      success: false,
      error: error.message || 'Failed to track offer completion'
    };
  }
}

/**
 * Verify callback from Bitlabs
 * @param {Object} params - Parameters
 * @returns {Promise<Object>} Verification result
 */
async function verifyCallback(params = {}) {
  try {
    const { callbackData, signature } = params;
    
    // Verify signature using Bitlabs service
    const isValid = bitlabsService.verifyCallbackSignature(callbackData, signature);
    
    return {
      success: true,
      isValid,
      message: isValid ? 'Callback verified' : 'Invalid callback signature'
    };
  } catch (error) {
    console.error('Error verifying callback:', error);
    return {
      success: false,
      isValid: false,
      error: error.message || 'Failed to verify callback'
    };
  }
}

/**
 * Determine offer type from offer data
 * @param {Object} offer - Offer data
 * @returns {string} Offer type
 */
function getOfferType(offer) {
  // Check anchor/product name for keywords
  const anchor = (offer.anchor || offer.product_name || offer.name || '').toLowerCase();
  const description = (offer.description || '').toLowerCase();
  const category = (offer.category || offer.genre || '').toLowerCase();
  
  // Survey indicators
  if (anchor.includes('survey') || 
      anchor.includes('poll') || 
      description.includes('survey') ||
      description.includes('questionnaire') ||
      category.includes('survey')) {
    return 'survey';
  }
  
  // Magic Receipt indicators
  if (anchor.includes('receipt') || 
      anchor.includes('magic receipt') ||
      description.includes('receipt') ||
      description.includes('upload receipt') ||
      category.includes('receipt')) {
    return 'magic_receipt';
  }
  
  // Cashback indicators
  if (anchor.includes('cashback') || 
      anchor.includes('cash back') ||
      description.includes('cashback') ||
      description.includes('cash back') ||
      category.includes('cashback')) {
    return 'cashback';
  }
  
  // Shopping indicators
  if (anchor.includes('shop') || 
      anchor.includes('store') ||
      anchor.includes('retail') ||
      description.includes('shopping') ||
      description.includes('purchase') ||
      category.includes('shopping') ||
      category.includes('retail')) {
    return 'shopping';
  }
  
  // Default to other
  return 'other';
}

/**
 * Normalize offer data to standard format
 * Handles both offers and surveys from different Bitlabs endpoints
 * @param {Object} offer - Raw offer/survey from Bitlabs
 * @param {string} userId - User ID
 * @returns {Object} Normalized offer
 */
function normalizeOffer(offer, userId = null) {
  // If offer already has type set (from dedicated endpoints), use it
  const offerType = offer.type || getOfferType(offer);
  
  return {
    id: offer.id || offer.offer_id || offer.surveyId,
    offerId: offer.id?.toString() || offer.offer_id?.toString() || offer.surveyId?.toString(),
    surveyId: offer.surveyId || offer.id?.toString(),
    title: offer.title || offer.anchor || offer.product_name || offer.name,
    description: offer.description || '',
    type: offerType,
    category: offer.category || offer.genre || 'General',
    
    // Images
    icon: offer.icon || offer.icon_url || offer.creatives?.icon || '',
    banner: offer.banner || offer.banner_url || 
            offer.creatives?.images?.['600x300'] || 
            offer.creatives?.images?.['630x315'] || 
            offer.icon_url || '',
    
    // Rewards
    reward: offer.reward || {
      coins: parseFloat(offer.total_points || offer.reward || 0),
      currency: 'points',
      xp: Math.round((parseFloat(offer.total_points || offer.reward || 0)) * 0.5),
      payout: offer.events?.find(e => e.payable)?.payout || offer.payout || '0'
    },
    
    // URLs
    clickUrl: offer.clickUrl || offer.click_url || offer.surveyUrl || '',
    surveyUrl: offer.surveyUrl || offer.click_url || '',
    deepLink: offer.deepLink || offer.click_url || '',
    supportUrl: offer.support_url || '',
    
    // Metadata
    estimatedTime: offer.estimatedTime || offer.estimated_time || offer.duration || 0,
    confirmationTime: offer.confirmationTime || offer.confirmation_time || '',
    pendingTime: offer.pendingTime || offer.pending_time || 0,
    offerExpiresAt: offer.offer_expires_at || null,
    sessionHours: offer.session_hours || 0,
    
    // Requirements
    requirements: offer.requirements || '',
    thingsToKnow: offer.things_to_know || offer.thingsToKnow || [],
    
    // Provider info
    provider: 'bitlabs',
    sdkProvider: 'bitlabs',
    
    // Additional fields
    funnelId: offer.funnel_id,
    productId: offer.product_id || offer.productId,
    productName: offer.product_name || offer.productName,
    isSticky: offer.is_sticky || offer.isSticky || false,
    isAvailable: offer.isAvailable !== false,
    mobileVerificationRequired: offer.mobile_verification_required || false,
    webToMobile: offer.web_to_mobile || false,
    webToMobileDevices: offer.web_to_mobile_devices || [],
    epc: offer.epc,
    lowestCapLeft: offer.lowest_cap_left,
    stats: offer.stats || {}
  };
}

module.exports = {
  getNonGameOffers,
  getSurveys,
  getMagicReceipts,
  getCashbackOffers,
  getShoppingOffers,
  trackOfferClick,
  trackCompletion,
  verifyCallback
};

