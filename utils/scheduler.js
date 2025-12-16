const cron = require('node-cron');
const { resetDailyProgress } = require('../middleware/dailyProgressReset');
const UserChallengeProgress = require('../models/UserChallengeProgress');
const bitlabsOfferCache = require('./bitlabsOfferCache');
const { processDecayForAllUsers } = require('./xpDecayV2');
const config = require('../config/config');

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
    
    // Process XP decay for inactive users
    this.scheduleXPDecay();
    
    // Start Bitlabs offer cache refresh
    this.startBitlabsOfferRefresh();
    
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
}

module.exports = new Scheduler();
