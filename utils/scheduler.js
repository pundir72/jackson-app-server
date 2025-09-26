const cron = require('node-cron');
const { resetDailyProgress } = require('../middleware/dailyProgressReset');

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
}

module.exports = new Scheduler();
