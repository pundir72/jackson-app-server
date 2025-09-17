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
  
  // Get all users with relevant data
  const users = await User.find({})
    .select('firstName lastName profile.avatar badges xp wallet games surveys races streak vip.level')
    .lean();
  
  // Calculate scores based on category
  const entries = users.map(user => {
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
      case 'overall':
        // Weighted overall score
        score = (metadata.xp * 0.3) + 
                (metadata.coins * 0.25) + 
                (metadata.streak * 10) + 
                (metadata.gamesPlayed * 5) + 
                (metadata.surveysCompleted * 3) + 
                (metadata.racesCompleted * 2);
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
  });
  
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
