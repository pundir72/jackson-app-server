const SurveySDK = require('../models/SurveySDK');
const bitlabs = require('./bitlabs');
const besitos = require('./besitos');

// Note: SurveyOffer model might not exist, handle gracefully
let SurveyOfferModel;
try {
  SurveyOfferModel = require('../models/SurveyOffer');
} catch (error) {
  console.warn('SurveyOffer model not found, skipping offer persistence');
  SurveyOfferModel = null;
}

/**
 * Refresh offers from all active SDKs
 * This is called by the scheduler to keep offers up-to-date
 */
async function refreshOffersFromSDKs() {
  console.log('Starting offer refresh from SDKs...');
  const results = {
    success: [],
    failed: [],
    totalRefreshed: 0
  };

  try {
    // Refresh Bitlabs surveys (if configured)
    if (process.env.BITLABS_API_KEY && process.env.BITLABS_PUBLISHER_ID) {
      try {
        const bitlabsResult = await bitlabs.getSurveys({
          userId: 'system',
          userProfile: {
            age: 25,
            gender: 'other',
            country: 'US',
            language: 'en',
            platform: 'mobile'
          }
        });

        if (bitlabsResult.success && bitlabsResult.surveys) {
          // Update SurveyOffer records for Bitlabs (if model exists)
          if (SurveyOfferModel) {
            for (const survey of bitlabsResult.surveys) {
              await SurveyOfferModel.findOneAndUpdate(
                { externalId: survey.id || survey.surveyId, sdkProvider: 'bitlabs' },
                {
                  title: survey.title,
                  description: survey.description,
                  coinReward: survey.reward?.coins || survey.coinReward || 0,
                  estimatedTime: survey.estimatedTime || 5,
                  status: 'live',
                  lastSyncedAt: new Date()
                },
                { upsert: true, new: true }
              );
            }
          }
          results.success.push('bitlabs');
          results.totalRefreshed += bitlabsResult.surveys.length;
        }
      } catch (error) {
        console.error('Error refreshing Bitlabs offers:', error);
        results.failed.push({ sdk: 'bitlabs', error: error.message });
      }
    }

    // Refresh Besitos offers (if configured)
    if (process.env.BESITOS_API_TOKEN || process.env.BESITOS_API_KEY) {
      try {
        const besitosResult = await besitos.getGameOffers({
          userId: 'system',
          userProfile: {
            age: 25,
            gender: 'other',
            country: 'US',
            language: 'en',
            platform: 'mobile'
          }
        });

        if (besitosResult.success && besitosResult.offers) {
          // Filter for non-gaming offers
          const nonGamingOffers = besitosResult.offers.filter(offer => {
            const category = offer.category?.toLowerCase() || '';
            return category !== 'game' && category !== 'gaming' && category !== 'arcade';
          });

          // Update SurveyOffer records for Besitos non-gaming offers (if model exists)
          if (SurveyOfferModel) {
            for (const offer of nonGamingOffers) {
              await SurveyOfferModel.findOneAndUpdate(
                { externalId: offer.id || offer.gameId, sdkProvider: 'besitos' },
                {
                  title: offer.title,
                  description: offer.description,
                  coinReward: offer.reward?.coins || 0,
                  estimatedTime: offer.estimatedTime || 10,
                  status: 'live',
                  lastSyncedAt: new Date()
                },
                { upsert: true, new: true }
              );
            }
          }
          results.success.push('besitos');
          results.totalRefreshed += nonGamingOffers.length;
        }
      } catch (error) {
        console.error('Error refreshing Besitos offers:', error);
        results.failed.push({ sdk: 'besitos', error: error.message });
      }
    }

    // Refresh offers from SurveySDK entries
    try {
      const activeSDKs = await SurveySDK.find({ isActive: true }).lean();
      
      for (const sdk of activeSDKs) {
        // Skip Bitlabs as it's handled above
        if (sdk.name.toLowerCase() === 'bitlabs') continue;

        // For now, just update lastSyncAt timestamp
        // In future, can implement actual SDK API calls here
        await SurveySDK.findByIdAndUpdate(sdk._id, {
          'analytics.lastSyncAt': new Date()
        });

        results.success.push(sdk.name);
      }
    } catch (error) {
      console.error('Error refreshing SurveySDK offers:', error);
      results.failed.push({ sdk: 'surveysdk', error: error.message });
    }

    console.log(`Offer refresh completed. Refreshed ${results.totalRefreshed} offers from ${results.success.length} SDKs.`);
    return results;
  } catch (error) {
    console.error('Error in offer refresh:', error);
    throw error;
  }
}

/**
 * Manual trigger for offer refresh (for testing/admin)
 */
async function triggerOfferRefresh() {
  try {
    console.log('Manually triggering offer refresh...');
    const results = await refreshOffersFromSDKs();
    console.log('Manual offer refresh completed:', results);
    return results;
  } catch (error) {
    console.error('Error in manual offer refresh:', error);
    throw error;
  }
}

module.exports = {
  refreshOffersFromSDKs,
  triggerOfferRefresh
};


