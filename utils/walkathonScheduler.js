/**
 * Walkathon Scheduler
 * Automated tasks for walkathon management
 * @module utils/walkathonScheduler
 */

const cron = require('node-cron');
const walkathonService = require('../services/walkathonService');
const { getISOWeekKey, getWeekBounds } = require('./walkathonHelpers');

/**
 * Initialize walkathon scheduler
 */
function initializeWalkathonScheduler() {
  console.log('Initializing Walkathon Scheduler...');

  // Repair/initialize lifecycle immediately after every server restart instead
  // of waiting for the next cron tick.
  walkathonService.syncWalkathonLifecycle()
    .then((result) => console.log('Walkathon lifecycle synchronized:', {
      currentWeek: result.currentWalkathon?.weekKey || null,
      nextWeek: result.nextWalkathon?.weekKey || null
    }))
    .catch((error) => console.error('Initial walkathon lifecycle sync failed:', error));
  
  // Weekly reset - Every Sunday at midnight UTC
  cron.schedule('0 0 * * 0', async () => {
    try {
      console.log('Starting weekly walkathon reset...');
      const result = await walkathonService.resetWeeklyWalkathon();
      console.log('Weekly walkathon reset completed:', result);
    } catch (error) {
      console.error('Error in weekly walkathon reset:', error);
    }
  }, {
    timezone: 'UTC'
  });

  // Daily step leaderboard update - Every day at 1 AM UTC
  cron.schedule('0 1 * * *', async () => {
    try {
      console.log('Updating daily step leaderboard...');
      const result = await walkathonService.updateStepLeaderboard();
      console.log('Daily step leaderboard update completed:', result);
    } catch (error) {
      console.error('Error updating step leaderboard:', error);
    }
  }, {
    timezone: 'UTC'
  });

  // Create next week's walkathon - Every Thursday at 2 PM UTC
  cron.schedule('0 14 * * 4', async () => {
    try {
      console.log('Creating next week\'s walkathon...');
      const nextWeekKey = getISOWeekKey(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
      
      // Check if next week's walkathon already exists
      const existingWalkathon = await walkathonService.getUpcomingWalkathon();
      if (!existingWalkathon || existingWalkathon.weekKey !== nextWeekKey) {
        const result = await walkathonService.createNextWeekWalkathon();
        console.log('Next week\'s walkathon created:', result.weekKey);
      } else {
        console.log('Next week\'s walkathon already exists:', nextWeekKey);
      }
    } catch (error) {
      console.error('Error creating next week\'s walkathon:', error);
    }
  }, {
    timezone: 'UTC'
  });

  // Hourly progress check - Every hour
  cron.schedule('0 * * * *', async () => {
    try {
      const result = await walkathonService.syncWalkathonLifecycle();
      console.log('Walkathon lifecycle synchronized:', {
        currentWeek: result.currentWalkathon?.weekKey || null,
        nextWeek: result.nextWalkathon?.weekKey || null,
        completedCount: result.completedCount
      });
    } catch (error) {
      console.error('Error in hourly progress check:', error);
    }
  });

  console.log('Walkathon Scheduler initialized successfully');
}

/**
 * Manual trigger for weekly reset (for testing)
 */
async function triggerWeeklyReset() {
  try {
    console.log('Manually triggering weekly walkathon reset...');
    const result = await walkathonService.resetWeeklyWalkathon();
    console.log('Manual weekly reset completed:', result);
    return result;
  } catch (error) {
    console.error('Error in manual weekly reset:', error);
    throw error;
  }
}

/**
 * Manual trigger for step leaderboard update
 */
async function triggerStepLeaderboardUpdate() {
  try {
    console.log('Manually triggering step leaderboard update...');
    const result = await walkathonService.updateStepLeaderboard();
    console.log('Manual step leaderboard update completed:', result);
    return result;
  } catch (error) {
    console.error('Error in manual step leaderboard update:', error);
    throw error;
  }
}

/**
 * Get scheduler status
 */
function getSchedulerStatus() {
  return {
    isInitialized: true,
    tasks: [
      {
        name: 'Weekly Reset',
        schedule: '0 0 * * 0',
        description: 'Reset walkathon every Sunday at midnight UTC',
        timezone: 'UTC'
      },
      {
        name: 'Daily Leaderboard Update',
        schedule: '0 1 * * *',
        description: 'Update step leaderboard every day at 1 AM UTC',
        timezone: 'UTC'
      },
      {
        name: 'Next Week Walkathon Creation',
        schedule: '0 14 * * 4',
        description: 'Create next week\'s walkathon every Thursday at 2 PM UTC',
        timezone: 'UTC'
      },
      {
        name: 'Hourly Progress Check',
        schedule: '0 * * * *',
        description: 'Check walkathon progress every hour',
        timezone: 'UTC'
      }
    ],
    lastUpdated: new Date().toISOString()
  };
}

module.exports = {
  initializeWalkathonScheduler,
  triggerWeeklyReset,
  triggerStepLeaderboardUpdate,
  getSchedulerStatus
};


