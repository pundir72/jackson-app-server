/**
 * Campaign Filtering Middleware
 * Filters events based on Adjust attribution (only allow offerwall campaigns)
 * @module middleware/campaignFilter
 */

const AdjustCallback = require('../models/AdjustCallback');
const User = require('../models/User');

/**
 * Check if user came from offerwall campaign
 * Only allows S2S events for users from configured offerwall campaigns
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
const checkOfferwallCampaign = async (req, res, next) => {
  // Get offerwall campaign names from environment
  const offerwallCampaigns = process.env.OFFERWALL_CAMPAIGNS
    ? process.env.OFFERWALL_CAMPAIGNS.split(',').map(c => c.trim())
    : [];
  
  // If no campaigns configured, allow all (for development/testing)
  if (offerwallCampaigns.length === 0) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('⚠️ No offerwall campaigns configured. All events will be allowed.');
    }
    return next();
  }

  try {
    const userId = req.user?.userId || req.firebaseUser?.uid;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required',
        code: 'USER_NOT_AUTHENTICATED'
      });
    }

    // Find user by userId (could be MongoDB _id or Firebase UID)
    let user;
    if (userId.match(/^[0-9a-fA-F]{24}$/)) {
      // MongoDB ObjectId
      user = await User.findById(userId);
    } else {
      // Firebase UID
      user = await User.findOne({ 'metadata.firebaseUid': userId });
    }
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Check user's Adjust attribution from metadata or latest callback
    let attribution = null;
    
    // First, check user metadata for stored attribution
    if (user.metadata?.adjust?.attribution) {
      attribution = user.metadata.adjust.attribution;
    } else {
      // Fallback: find latest Adjust callback for this user
      const latestCallback = await AdjustCallback.findOne({
        userId: user._id
      }).sort({ createdAt: -1 });
      
      if (latestCallback) {
        attribution = {
          campaign: latestCallback.campaign,
          network: latestCallback.network,
          adgroup: latestCallback.adgroup,
          creative: latestCallback.creative,
          trackerName: latestCallback.trackerName,
          isOrganic: latestCallback.isOrganic
        };
      }
    }

    // If no attribution found, check if we should allow organic users
    const allowOrganicUsers = process.env.ALLOW_ORGANIC_USERS === 'true';
    
    if (!attribution) {
      if (allowOrganicUsers) {
        // Allow if no attribution (organic user)
        return next();
      } else {
        return res.status(403).json({
          success: false,
          error: 'User attribution not found. Only users from offerwall campaigns are allowed.',
          code: 'ATTRIBUTION_NOT_FOUND'
        });
      }
    }

    // Check if user is from offerwall campaign
    const isFromOfferwall = offerwallCampaigns.some(campaignName => {
      const campaignLower = (attribution.campaign || '').toLowerCase();
      const trackerNameLower = (attribution.trackerName || '').toLowerCase();
      const searchName = campaignName.toLowerCase();
      
      return campaignLower.includes(searchName) || 
             trackerNameLower.includes(searchName);
    });

    // Check if user is organic (no campaign)
    const isOrganic = attribution.isOrganic || !attribution.campaign;

    if (!isFromOfferwall && !(isOrganic && allowOrganicUsers)) {
      return res.status(403).json({
        success: false,
        error: 'User not from offerwall campaign. S2S events are only allowed for offerwall users.',
        code: 'NOT_OFFERWALL_CAMPAIGN',
        userCampaign: attribution.campaign || 'None',
        allowedCampaigns: offerwallCampaigns
      });
    }

    // Attach attribution to request for logging
    req.attribution = attribution;
    req.isFromOfferwall = isFromOfferwall;
    
    next();
  } catch (error) {
    console.error('Error checking offerwall campaign:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to verify campaign',
      code: 'CAMPAIGN_CHECK_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Optional campaign check (logs but doesn't block)
 * Useful for analytics endpoints
 */
const optionalCampaignCheck = async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.firebaseUser?.uid;
    
    if (!userId) {
      return next();
    }

    // Find user
    let user;
    if (userId.match(/^[0-9a-fA-F]{24}$/)) {
      user = await User.findById(userId);
    } else {
      user = await User.findOne({ 'metadata.firebaseUid': userId });
    }
    
    if (user) {
      // Get attribution (same logic as checkOfferwallCampaign)
      let attribution = null;
      if (user.metadata?.adjust?.attribution) {
        attribution = user.metadata.adjust.attribution;
      } else {
        const latestCallback = await AdjustCallback.findOne({
          userId: user._id
        }).sort({ createdAt: -1 });
        
        if (latestCallback) {
          attribution = {
            campaign: latestCallback.campaign,
            network: latestCallback.network,
            isOrganic: latestCallback.isOrganic
          };
        }
      }
      
      req.attribution = attribution;
    }
    
    next();
  } catch (error) {
    // Don't fail on optional check
    console.warn('Optional campaign check failed:', error.message);
    next();
  }
};

module.exports = {
  checkOfferwallCampaign,
  optionalCampaignCheck
};

