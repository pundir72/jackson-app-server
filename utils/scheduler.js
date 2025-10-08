const cron = require('node-cron');
const { resetDailyProgress } = require('../middleware/dailyProgressReset');
const UserChallengeProgress = require('../models/UserChallengeProgress');

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
}

module.exports = new Scheduler();
