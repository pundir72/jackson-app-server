const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const bitlabs = require('../utils/bitlabs');
const verisoul = require('../utils/verisoul');
const { applyTierMultiplierToXP } = require('../utils/xpTierMultiplier');

// Survey SDK configuration
const SURVEY_CONFIG = {
  providers: {
    bitlabs: {
      name: 'BitLabs',
      icon: '🧪',
      baseUrl: 'https://survey.bitlabs.ai',
      apiKey: process.env.BITLABS_API_KEY,
      enabled: true
    },
    cpx: {
      name: 'CPX Research',
      icon: '📊',
      baseUrl: 'https://survey.cpxresearch.com',
      apiKey: process.env.CPX_API_KEY,
      enabled: true
    },
    ayet: {
      name: 'Ayet Studios',
      icon: '🎯',
      baseUrl: 'https://survey.ayetstudios.com',
      apiKey: process.env.AYET_API_KEY,
      enabled: true
    }
  },
  rewardMultiplier: 1.0, // Can be adjusted based on user tier
  minReward: 10,
  maxReward: 500
};

// Get available survey providers
router.get('/providers', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('xp vip profile location');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const currentXP = user.xp.current || 0;
    const currentTier = getCurrentTier(currentXP);
    const vipMultiplier = await getVIPMultiplier(user);
    
    // Get Bitlabs surveys
    const bitlabsResult = await bitlabs.getSurveys({
      userId: user._id.toString(),
      userProfile: {
        age: user.profile?.age || 25,
        gender: user.profile?.gender || 'other',
        country: user.location?.country || 'US',
        language: user.preferences?.language || 'en',
        interests: user.preferences?.interests || [],
        platform: 'mobile',
        osVersion: 'iOS 15.0',
        appVersion: '1.0.0'
      }
    });

    const providers = [
      {
        id: 'bitlabs',
        name: 'BitLabs',
        icon: '🧪',
        baseUrl: 'https://survey.bitlabs.ai',
        isAvailable: bitlabsResult.success,
        estimatedReward: {
          min: Math.round(SURVEY_CONFIG.minReward * vipMultiplier),
          max: Math.round(SURVEY_CONFIG.maxReward * vipMultiplier)
        },
        surveys: bitlabsResult.success ? bitlabsResult.surveys : [],
        totalSurveys: bitlabsResult.success ? bitlabsResult.totalSurveys : 0
      }
    ];

    res.json({
      success: true,
      data: {
        providers,
        userTier: currentTier.id,
        vipMultiplier,
        message: 'Choose a survey provider to start earning!'
      }
    });
  } catch (error) {
    console.error('Error getting survey providers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get survey providers'
    });
  }
});

// Initialize survey session
router.post('/start', protect, async (req, res) => {
  try {
    const { providerId, surveyId } = req.body;
    const user = await User.findById(req.user.userId).select('xp vip surveys profile location');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check if user has active survey session
    const activeSurvey = user.surveys.find(s => s.provider === providerId && s.status === 'active');
    if (activeSurvey) {
      return res.status(400).json({
        success: false,
        error: 'You already have an active survey session'
      });
    }

    let surveySession;

    if (providerId === 'bitlabs') {
      // Use Bitlabs SDK
      const bitlabsResult = await bitlabs.startSurvey({
        userId: user._id.toString(),
        surveyId: surveyId,
        deviceInfo: {
          platform: 'mobile',
          osVersion: 'iOS 15.0',
          appVersion: '1.0.0',
          userAgent: req.headers['user-agent']
        }
      });

      if (!bitlabsResult.success) {
        return res.status(400).json({
          success: false,
          error: bitlabsResult.error || 'Failed to start survey'
        });
      }

      surveySession = {
        id: bitlabsResult.sessionId,
        provider: providerId,
        surveyId: surveyId,
        status: 'active',
        startedAt: new Date(),
        expiresAt: new Date(bitlabsResult.expiresAt),
        estimatedReward: bitlabsResult.reward,
        callbackUrl: `${process.env.API_BASE_URL}/api/surveys/callback/${providerId}`,
        userToken: bitlabsResult.sessionId
      };

      user.surveys.push(surveySession);
      await user.save();

      res.json({
        success: true,
        data: {
          session: surveySession,
          surveyUrl: bitlabsResult.surveyUrl,
          message: 'Survey session started! Complete the survey to earn rewards.'
        }
      });
    } else {
      // Fallback to generic provider
      const provider = SURVEY_CONFIG.providers[providerId];
      if (!provider || !provider.enabled) {
        return res.status(400).json({
          success: false,
          error: 'Survey provider not available'
        });
      }

      surveySession = {
        id: `SURVEY-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        provider: providerId,
        status: 'active',
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
        estimatedReward: {
          min: Math.round(SURVEY_CONFIG.minReward * (await getVIPMultiplier(user))),
          max: Math.round(SURVEY_CONFIG.maxReward * (await getVIPMultiplier(user)))
        },
        callbackUrl: `${process.env.API_BASE_URL}/api/surveys/callback/${providerId}`,
        userToken: generateUserToken(user._id, providerId)
      };

      user.surveys.push(surveySession);
      await user.save();

      res.json({
        success: true,
        data: {
          session: surveySession,
          surveyUrl: `${provider.baseUrl}/survey?token=${surveySession.userToken}&callback=${encodeURIComponent(surveySession.callbackUrl)}`,
          message: 'Survey session started! Complete the survey to earn rewards.'
        }
      });
    }
  } catch (error) {
    console.error('Error starting survey:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start survey'
    });
  }
});

// Survey completion callback (called by survey providers)
router.post('/callback/:providerId', async (req, res) => {
  try {
    const { providerId } = req.params;
    const { userToken, reward, surveyId, completed, signature } = req.body;
    
    // Validate callback
    if (!validateSurveyCallback(providerId, req.body)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid callback data'
      });
    }

    // Find user by token
    const user = await User.findOne({
      'surveys.userToken': userToken,
      'surveys.provider': providerId,
      'surveys.status': 'active'
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found or session expired'
      });
    }

    // Find the survey session
    const surveyIndex = user.surveys.findIndex(s => s.userToken === userToken);
    const survey = user.surveys[surveyIndex];

    if (!survey) {
      return res.status(404).json({
        success: false,
        error: 'Survey session not found'
      });
    }

    // Check if survey is expired
    if (new Date() > survey.expiresAt) {
      survey.status = 'expired';
      await user.save();
      return res.status(400).json({
        success: false,
        error: 'Survey session expired'
      });
    }

    if (completed) {
      let finalReward = reward || SURVEY_CONFIG.minReward;
      let isValidCallback = true;

      // Verify callback with provider if it's Bitlabs
      if (providerId === 'bitlabs') {
        const verification = await bitlabs.verifyCallback({
          sessionId: userToken,
          userId: user._id.toString(),
          surveyId: surveyId,
          reward: reward,
          signature: signature
        });

        if (!verification.success || !verification.isValid) {
          return res.status(400).json({
            success: false,
            error: 'Invalid survey completion callback'
          });
        }

        finalReward = verification.reward || reward;
      }

      // Calculate final reward with VIP multiplier
      const vipMultiplier = await getVIPMultiplier(user);
      finalReward = Math.round(finalReward * vipMultiplier);
      
      // Update survey status
      survey.status = 'completed';
      survey.completedAt = new Date();
      survey.reward = finalReward;
      survey.surveyId = surveyId;
      
      // Update user wallet and XP
      user.wallet.balance = (user.wallet.balance || 0) + finalReward;
      user.wallet.lastUpdated = new Date();

      // Base XP for surveys is 50% of coin reward, then tier multiplier applies
      const baseXp = Math.round(finalReward * 0.5);
      const { finalXP, multiplier: tierMultiplier } = await applyTierMultiplierToXP(user, baseXp);

      user.xp.current = (user.xp.current || 0) + finalXP;
      user.xp.total = (user.xp.total || 0) + finalXP;
      
      // Create transaction record
      const transaction = new Transaction({
        user: user._id,
        type: 'credit',
        amount: finalReward,
        description: `Survey completed - ${providerId === 'bitlabs' ? 'BitLabs' : 'Survey Provider'}`,
        status: 'completed',
        referenceId: survey.id,
        metadata: {
          source: 'survey_complete',
          baseXp,
          xpEarned: finalXP,
          tierMultiplier
        }
      });

      await Promise.all([
        user.save(),
        transaction.save()
      ]);

      res.json({
        success: true,
        data: {
          message: 'Survey completed successfully!',
          reward: finalReward,
          newBalance: user.wallet.balance
        }
      });
    } else {
      // Survey not completed
      survey.status = 'incomplete';
      survey.completedAt = new Date();
      await user.save();

      res.json({
        success: true,
        data: {
          message: 'Survey session ended without completion'
        }
      });
    }
  } catch (error) {
    console.error('Error processing survey callback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process survey callback'
    });
  }
});

// Get survey history
router.get('/history', protect, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const user = await User.findById(req.user.userId).select('surveys');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const surveys = user.surveys
      .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
      .slice((page - 1) * limit, page * limit);

    const total = user.surveys.length;

    res.json({
      success: true,
      data: {
        surveys: surveys.map(survey => ({
          id: survey.id,
          provider: survey.provider,
          providerName: SURVEY_CONFIG.providers[survey.provider]?.name || 'Unknown',
          status: survey.status,
          reward: survey.reward,
          startedAt: survey.startedAt,
          completedAt: survey.completedAt
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error getting survey history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get survey history'
    });
  }
});

// Get survey statistics
router.get('/stats', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('surveys wallet xp');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const surveys = user.surveys || [];
    const completedSurveys = surveys.filter(s => s.status === 'completed');
    const totalEarnings = completedSurveys.reduce((sum, s) => sum + (s.reward || 0), 0);
    
    const stats = {
      totalSurveys: surveys.length,
      completedSurveys: completedSurveys.length,
      totalEarnings,
      averageEarning: completedSurveys.length > 0 ? Math.round(totalEarnings / completedSurveys.length) : 0,
      completionRate: surveys.length > 0 ? Math.round((completedSurveys.length / surveys.length) * 100) : 0,
      topProvider: getTopProvider(completedSurveys),
      recentActivity: surveys.slice(0, 5).map(s => ({
        provider: SURVEY_CONFIG.providers[s.provider]?.name || 'Unknown',
        status: s.status,
        reward: s.reward,
        date: s.completedAt || s.startedAt
      }))
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting survey stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get survey stats'
    });
  }
});

// Helper functions
function getCurrentTier(xp) {
  if (xp >= 10000) return { id: 'expert', name: 'Expert' };
  if (xp >= 5000) return { id: 'senior', name: 'Senior' };
  if (xp >= 1000) return { id: 'mid', name: 'Mid-Level' };
  return { id: 'junior', name: 'Junior' };
}

async function getVIPMultiplier(user) {
  try {
    const VIPTier = require('../models/VIPTier');
    const VIPSubscription = require('../models/VIPSubscription');
    
    const activeSubscription = await VIPSubscription.getActiveSubscription(user._id);
    if (!activeSubscription || !activeSubscription.isActive()) {
      return 1.0;
    }

    const tier = await VIPTier.getTierById(activeSubscription.tier);
    return tier ? tier.features.xpMultiplier || 1.0 : 1.0;
  } catch (error) {
    console.error('Error getting VIP multiplier:', error);
    return 1.0;
  }
}

function generateUserToken(userId, providerId) {
  const crypto = require('crypto');
  const data = `${userId}-${providerId}-${Date.now()}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

function validateSurveyCallback(providerId, data) {
  // Basic validation - in production, you'd want to verify signatures
  const requiredFields = ['userToken', 'completed'];
  return requiredFields.every(field => data.hasOwnProperty(field));
}

function getTopProvider(completedSurveys) {
  if (completedSurveys.length === 0) return null;
  
  const providerCounts = {};
  completedSurveys.forEach(survey => {
    providerCounts[survey.provider] = (providerCounts[survey.provider] || 0) + 1;
  });
  
  const topProvider = Object.entries(providerCounts)
    .sort(([,a], [,b]) => b - a)[0];
  
  return topProvider ? {
    provider: topProvider[0],
    name: SURVEY_CONFIG.providers[topProvider[0]]?.name || 'Unknown',
    count: topProvider[1]
  } : null;
}

module.exports = router;
