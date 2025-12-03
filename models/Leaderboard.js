const mongoose = require('mongoose');

const leaderboardSchema = new mongoose.Schema({
  category: {
    type: String,
    enum: ['xp', 'coins', 'streak', 'games', 'surveys', 'races', 'overall'],
    required: true
  },
  timeframe: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'all_time'],
    default: 'all_time'
  },
  entries: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    rank: {
      type: Number,
      required: true
    },
    score: {
      type: Number,
      required: true
    },
    displayName: {
      type: String,
      required: true
    },
    avatar: String,
    badges: [String],
    tier: String,
    vipLevel: String,
    metadata: {
      gamesPlayed: Number,
      surveysCompleted: Number,
      racesCompleted: Number,
      streak: Number,
      xp: Number,
      coins: Number
    }
  }],
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  totalUsers: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
leaderboardSchema.index({ category: 1, timeframe: 1, isActive: 1 });
leaderboardSchema.index({ 'entries.user': 1 });
leaderboardSchema.index({ lastUpdated: -1 });

// Static methods
leaderboardSchema.statics.getLeaderboard = function(category, timeframe = 'all_time') {
  return this.findOne({ category, timeframe, isActive: true })
    .populate('entries.user', 'firstName lastName profile.avatar badges xp.current vip.level')
    .sort({ lastUpdated: -1 });
};

leaderboardSchema.statics.updateLeaderboard = async function(category, timeframe = 'all_time') {
  const User = require('./User');
  const StepData = require('./StepData');
  
  // Helper function to get weekly step count
  const getWeeklyStepCount = async (userId, timeframe) => {
    if (timeframe === 'all_time') {
      // For all-time, get total steps from all time
      const result = await StepData.aggregate([
        { $match: { userId: userId } },
        { $group: { _id: null, totalSteps: { $sum: '$steps' } } }
      ]);
      return result.length > 0 ? result[0].totalSteps : 0;
    } else if (timeframe === 'weekly') {
      // For weekly, get current week's steps
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      
      const result = await StepData.aggregate([
        { $match: { userId: userId, date: { $gte: weekStart, $lte: weekEnd } } },
        { $group: { _id: null, totalSteps: { $sum: '$steps' } } }
      ]);
      return result.length > 0 ? result[0].totalSteps : 0;
    } else if (timeframe === 'monthly') {
      // For monthly, get current month's steps
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      
      const result = await StepData.aggregate([
        { $match: { userId: userId, date: { $gte: monthStart, $lte: monthEnd } } },
        { $group: { _id: null, totalSteps: { $sum: '$steps' } } }
      ]);
      return result.length > 0 ? result[0].totalSteps : 0;
    } else if (timeframe === 'daily') {
      // For daily, get today's steps
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      
      const result = await StepData.aggregate([
        { $match: { userId: userId, date: { $gte: today, $lt: tomorrow } } },
        { $group: { _id: null, totalSteps: { $sum: '$steps' } } }
      ]);
      return result.length > 0 ? result[0].totalSteps : 0;
    }
    return 0;
  };
  
  // Get all users with relevant data
  const users = await User.find({})
    .select('firstName lastName profile.avatar badges xp wallet games surveys races streak vip.level')
    .lean();
  
  // Calculate scores based on category
  const entries = await Promise.all(users.map(async (user) => {
    let score = 0;
    const metadata = {
      gamesPlayed: user.games?.length || 0,
      surveysCompleted: user.surveys?.filter(s => s.completed).length || 0,
      racesCompleted: user.races?.filter(r => r.completed).length || 0,
      streak: user.streak?.current || 0,
      xp: user.xp?.current || 0,
      coins: user.wallet?.balance || 0
    };
    
    switch (category) {
      case 'xp':
        score = user.xp?.current || 0;
        break;
      case 'coins':
        score = user.wallet?.balance || 0;
        break;
      case 'streak':
        score = user.streak?.current || 0;
        break;
      case 'games':
        score = user.games?.length || 0;
        break;
      case 'surveys':
        score = user.surveys?.filter(s => s.completed).length || 0;
        break;
      case 'races':
        score = user.races?.filter(r => r.completed).length || 0;
        break;
      case 'steps':
        // For steps, get step data for the specified timeframe
        score = await getWeeklyStepCount(user._id, timeframe);
        break;
      case 'overall':
        // Weighted overall score including steps
        const weeklySteps = await getWeeklyStepCount(user._id, timeframe);
        score = (metadata.xp * 0.25) + 
                (metadata.coins * 0.2) + 
                (metadata.streak * 10) + 
                (metadata.gamesPlayed * 5) + 
                (metadata.surveysCompleted * 3) + 
                (metadata.racesCompleted * 2) +
                (weeklySteps * 0.1); // Add steps to overall score
        break;
    }
    
    return {
      user: user._id,
      score,
      displayName: user.firstName || 'Anonymous',
      avatar: user.profile?.avatar,
      badges: user.badges || [],
      tier: getTierFromXP(user.xp?.current || 0),
      vipLevel: user.vip?.level || 'free',
      metadata
    };
  }));
  
  // Sort by score (descending) and assign ranks
  entries.sort((a, b) => b.score - a.score);
  entries.forEach((entry, index) => {
    entry.rank = index + 1;
  });
  
  // Update or create leaderboard
  const leaderboard = await this.findOneAndUpdate(
    { category, timeframe, isActive: true },
    {
      entries: entries.slice(0, 100), // Top 100
      lastUpdated: new Date(),
      totalUsers: entries.length
    },
    { upsert: true, new: true }
  );
  
  return leaderboard;
};

leaderboardSchema.statics.getUserRank = function(userId, category, timeframe = 'all_time') {
  return this.findOne({ category, timeframe, isActive: true })
    .then(leaderboard => {
      if (!leaderboard) return null;
      
      const userEntry = leaderboard.entries.find(entry => 
        entry.user.toString() === userId.toString()
      );
      
      return userEntry ? {
        rank: userEntry.rank,
        score: userEntry.score,
        totalUsers: leaderboard.totalUsers,
        percentile: Math.round(((leaderboard.totalUsers - userEntry.rank + 1) / leaderboard.totalUsers) * 100)
      } : null;
    });
};

// Helper function
function getTierFromXP(xp) {
  if (xp >= 10000) return 'expert';
  if (xp >= 5000) return 'senior';
  if (xp >= 1000) return 'mid';
  return 'junior';
}

module.exports = mongoose.model('Leaderboard', leaderboardSchema);
