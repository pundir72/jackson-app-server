const cron = require('node-cron');
const { resetDailyProgress } = require('../middleware/dailyProgressReset');
const UserChallengeProgress = require('../models/UserChallengeProgress');
const DailyChallenge = require('../models/DailyChallenge');
const bitlabsOfferCache = require('./bitlabsOfferCache');
const { processDecayForAllUsers } = require('./xpDecayV2');
const config = require('../config/config');
const besitosService = require('../services/besitos.service');
const User = require('../models/User');
const SurveyConfig = require('../models/SurveyConfig');
const NonGamingOfferConfig = require('../models/NonGamingOfferConfig');
const BesitosConversion = require('../models/BesitosConversion');
const Transaction = require('../models/Transaction');
const { applyTierMultiplierToXP } = require('./xpTierMultiplier');

/**
 * Scheduler for My Account Overview daily tasks
 */
class Scheduler {
  constructor() {
    this.jobs = [];
  }

  /**
   * Start all scheduled jobs
   */
  start() {
    // Reset daily progress at midnight every day
    this.scheduleDailyProgressReset();

    // Expire old daily challenges
    this.scheduleExpireOldChallenges();

    // Update past daily challenges to completed status
    this.scheduleUpdatePastChallenges();

    // Process XP decay for inactive users
    this.scheduleXPDecay();

    // Start Bitlabs offer cache refresh
    this.startBitlabsOfferRefresh();

    // Start Besitos conversion poll
    this.scheduleBesitosConversionPoll();

    console.log('Scheduler started successfully');
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    this.jobs.forEach(job => job.destroy());
    this.jobs = [];
    console.log('Scheduler stopped');
  }

  /**
   * Schedule daily progress reset at midnight
   */
  scheduleDailyProgressReset() {
    // Run at midnight every day (00:00)
    const job = cron.schedule('0 0 * * *', async () => {
      console.log('Running daily progress reset...');
      try {
        await resetDailyProgress();
        console.log('Daily progress reset completed successfully');
      } catch (error) {
        console.error('Error in daily progress reset:', error);
      }
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    this.jobs.push(job);
    console.log('Daily progress reset scheduled for midnight UTC');
  }

  /**
   * Manually trigger daily progress reset (for testing)
   */
  async triggerDailyProgressReset() {
    console.log('Manually triggering daily progress reset...');
    try {
      await resetDailyProgress();
      console.log('Manual daily progress reset completed successfully');
    } catch (error) {
      console.error('Error in manual daily progress reset:', error);
      throw error;
    }
  }

  /**
   * Schedule expiring old daily challenges
   * Runs at 1 AM every day to expire challenges from previous days
   */
  scheduleExpireOldChallenges() {
    // Run at 1 AM every day (01:00)
    const job = cron.schedule('0 1 * * *', async () => {
      console.log('Running daily challenge expiration check...');
      try {
        const result = await UserChallengeProgress.expireOldChallenges();
        console.log(`Expired ${result.modifiedCount} old daily challenges`);
      } catch (error) {
        console.error('Error expiring old daily challenges:', error);
      }
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    this.jobs.push(job);
    console.log('Daily challenge expiration scheduled for 1 AM UTC');
  }

  /**
   * Manually trigger daily challenge expiration (for testing)
   */
  async triggerExpireOldChallenges() {
    console.log('Manually triggering daily challenge expiration...');
    try {
      const result = await UserChallengeProgress.expireOldChallenges();
      console.log(`Manually expired ${result.modifiedCount} old daily challenges`);
      return result;
    } catch (error) {
      console.error('Error in manual daily challenge expiration:', error);
      throw error;
    }
  }

  /**
   * Schedule updating past daily challenges to completed status
   * Runs at midnight every day (00:00) to mark challenges with past challengeDate as completed
   */
  scheduleUpdatePastChallenges() {
    // Run at midnight every day (00:00)
    const job = cron.schedule('0 0 * * *', async () => {
      console.log('Running daily challenge status update...');
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Set to start of today

        const result = await DailyChallenge.updateMany(
          {
            challengeDate: { $lt: today },
            status: { $nin: ['completed', 'expired', 'draft'] }
          },
          {
            $set: { status: 'completed' }
          }
        );

        console.log(`Updated ${result.modifiedCount} past daily challenges to completed status`);
      } catch (error) {
        console.error('Error updating past daily challenges:', error);
      }
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    this.jobs.push(job);
    console.log('Daily challenge status update scheduled for midnight UTC');
  }

  /**
   * Manually trigger past daily challenges status update (for testing)
   */
  async triggerUpdatePastChallenges() {
    console.log('Manually triggering past daily challenges status update...');
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Set to start of today

      const result = await DailyChallenge.updateMany(
        {
          challengeDate: { $lt: today },
          status: { $nin: ['completed', 'expired', 'draft'] }
        },
        {
          $set: { status: 'completed' }
        }
      );

      console.log(`Manually updated ${result.modifiedCount} past daily challenges to completed status`);
      return result;
    } catch (error) {
      console.error('Error in manual past daily challenges status update:', error);
      throw error;
    }
  }

  /**
   * Schedule XP Decay processing
   * Runs daily at 2 AM to process XP decay for inactive users
   */
  scheduleXPDecay() {
    // Run at 2 AM every day (02:00)
    const job = cron.schedule('0 2 * * *', async () => {
      console.log('Running XP decay processing...');
      try {
        const result = await processDecayForAllUsers({ batchSize: 100 });
        console.log(`XP decay processing completed: ${result.message}`);
      } catch (error) {
        console.error('Error processing XP decay:', error);
      }
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    this.jobs.push(job);
    console.log('XP decay processing scheduled for 2 AM UTC');
  }

  /**
   * Manually trigger XP decay processing (for testing)
   */
  async triggerXPDecay() {
    console.log('Manually triggering XP decay processing...');
    try {
      const result = await processDecayForAllUsers({ batchSize: 100 });
      console.log(`Manually processed XP decay: ${result.message}`);
      return result;
    } catch (error) {
      console.error('Error in manual XP decay processing:', error);
      throw error;
    }
  }

  /**
   * Start Bitlabs offer cache refresh
   * Refreshes offers every 5-10 minutes (configurable)
   */
  startBitlabsOfferRefresh() {
    const intervalMinutes = config.BITLABS_REFRESH_INTERVAL_MINUTES || 5;
    
    // Start periodic refresh using the cache utility
    bitlabsOfferCache.startPeriodicRefresh(intervalMinutes);
    
    // Also pre-fetch common offers on startup
    setTimeout(() => {
      bitlabsOfferCache.preFetchCommonOffers().catch(err => {
        console.error('Error pre-fetching Bitlabs offers:', err);
      });
    }, 5000); // Wait 5 seconds after server start
    
    console.log(`Bitlabs offer refresh scheduled (every ${intervalMinutes} minutes)`);
  }

  /**
   * Manually trigger Bitlabs offer refresh (for testing)
   */
  async triggerBitlabsOfferRefresh(queryParams = {}) {
    console.log('Manually triggering Bitlabs offer refresh...');
    try {
      const offers = await bitlabsOfferCache.refreshOffers(queryParams);
      console.log(`Manually refreshed ${offers.length} Bitlabs offers`);
      return offers;
    } catch (error) {
      console.error('Error in manual Bitlabs offer refresh:', error);
      throw error;
    }
  }

  /**
   * Schedule Besitos conversion polling
   * Runs every 5 minutes to poll Besitos Conversion Data API for completed surveys/deals
   * and credit admin-configured rewards to the respective users
   */
  scheduleBesitosConversionPoll() {
    let lastPolledAt = null;

    const job = cron.schedule('*/5 * * * *', async () => {
      try {
        if (!besitosService.getConversions) {
          return;
        }

        const now = new Date();
        const fromDate = lastPolledAt || new Date(Date.now() - 24 * 60 * 60 * 1000);
        lastPolledAt = now;

        const dateParams = {
          from_date: fromDate.toISOString().split('T')[0],
          to_date: now.toISOString().split('T')[0],
          per_page: 1000
        };

        const [surveyResponse, dealResponse] = await Promise.all([
          besitosService.getConversions({ ...dateParams, type: 'survey' }).catch(() => ({ data: [] })),
          besitosService.getConversions({ ...dateParams, type: 'offer' }).catch(() => ({ data: [] })),
        ]);

        const surveyConversions = surveyResponse?.data || [];
        const dealConversions = dealResponse?.data || [];

        const allConversions = [
          ...surveyConversions.map(c => ({ ...c, _isSurvey: true })),
          ...dealConversions.map(c => ({ ...c, _isSurvey: false })),
        ];

        if (allConversions.length === 0) return;

        let credited = 0;

        for (const conv of allConversions) {
          try {
            const existing = await BesitosConversion.findOne({ conversionId: String(conv.transaction_id) });
            if (existing) continue;

            const extId = conv.survey_id || conv.offer_id || conv.deal_id;
            if (!extId) continue;

            const adminConfig = conv._isSurvey
              ? await SurveyConfig.findOne({ externalId: String(extId), status: 'live' }).lean()
              : await NonGamingOfferConfig.findOne({ externalId: String(extId), status: 'live' }).lean();

            if (!adminConfig) continue;

            const coinReward = adminConfig.coinReward || adminConfig.userRewardCoins || 0;
            const xpReward = adminConfig.userRewardXP || 0;
            if (coinReward <= 0 && xpReward <= 0) continue;

            const user = await User.findById(conv.user_id).select('wallet xp');
            if (!user) continue;

            user.wallet.balance = (user.wallet.balance || 0) + coinReward;

            const baseXp = xpReward > 0 ? xpReward : Math.round(coinReward * 0.5);
            const { finalXP } = await applyTierMultiplierToXP(user, baseXp);

            user.xp.current = (user.xp.current || 0) + finalXP;

            const transaction = new Transaction({
              user: user._id,
              type: 'credit',
              amount: coinReward,
              description: `${conv._isSurvey ? 'Survey' : 'Deal'} completed - Besitos`,
              status: 'completed',
              referenceId: String(conv.transaction_id),
              metadata: { source: 'besitos_conversion_poller', offerId: extId, xpEarned: finalXP }
            });

            const besitosConv = new BesitosConversion({
              userId: user._id,
              besitosUserId: conv.user_id,
              offerId: extId,
              offerName: conv.offer_name || conv.note || '',
              offerType: conv._isSurvey ? 'survey' : 'other',
              conversionId: String(conv.transaction_id),
              conversionStatus: 'completed',
              creditedCoins: coinReward,
              creditedXP: finalXP,
              isCredited: true,
              creditedAt: new Date(),
              eventTimestamp: conv.date_time ? new Date(conv.date_time) : new Date(),
              revenue: { amount: conv.payout || 0, currency: 'USD' }
            });

            await Promise.all([user.save(), transaction.save(), besitosConv.save()]);
            credited++;
          } catch (err) {
            console.error(`Error processing Besitos conversion ${conv.transaction_id}:`, err.message);
          }
        }

        if (credited > 0) {
          console.log(`Besitos conversion poll: ${credited} new conversions credited`);
        }
      } catch (error) {
        console.error('Error in Besitos conversion poll:', error);
      }
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    this.jobs.push(job);
    console.log('Besitos conversion poll scheduled (every 5 minutes)');
  }
}

module.exports = new Scheduler();
