/**
 * Initialize Master Data Script
 * This script populates the database with initial master data for onboarding
 */

require('dotenv').config();
const mongoose = require('mongoose');
const MasterData = require('../src/models/MasterData');

// Database connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/jackson-games');
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Master data configuration
const masterDataConfig = {
  age_ranges: [
    { value: 'Under 18', label: 'Under 18', description: 'For users under 18 years old', sortOrder: 1 },
    { value: '18-24', label: '18-24', description: 'For users aged 18-24', sortOrder: 2 },
    { value: '25-34', label: '25-34', description: 'For users aged 25-34', sortOrder: 3 },
    { value: '35-44', label: '35-44', description: 'For users aged 35-44', sortOrder: 4 },
    { value: '45-54', label: '45-54', description: 'For users aged 45-54', sortOrder: 5 },
    { value: '55+', label: '55+', description: 'For users aged 55 and above', sortOrder: 6 }
  ],
  genders: [
    { value: 'male', label: 'Male', description: 'Male gender', sortOrder: 1 },
    { value: 'female', label: 'Female', description: 'Female gender', sortOrder: 2 },
    { value: 'other', label: 'Other', description: 'Other gender identity', sortOrder: 3 },
    { value: 'prefer_not_to_say', label: 'Prefer not to say', description: 'Prefer not to disclose', sortOrder: 4 }
  ],
  primary_goals: [
    { value: 'save_money', label: 'Save Money', description: 'Primary goal is to save money', sortOrder: 1 },
    { value: 'earn_cashback', label: 'Earn Cashback', description: 'Primary goal is to earn cashback', sortOrder: 2 },
    { value: 'play_games', label: 'Play Games', description: 'Primary goal is to play games', sortOrder: 3 },
    { value: 'learn_finance', label: 'Learn Finance', description: 'Primary goal is to learn about finance', sortOrder: 4 },
    { value: 'social_connection', label: 'Social Connection', description: 'Primary goal is social connection', sortOrder: 5 },
    { value: 'entertainment', label: 'Entertainment', description: 'Primary goal is entertainment', sortOrder: 6 },
    { value: 'other', label: 'Other', description: 'Other primary goals', sortOrder: 7 }
  ],
  improvement_areas: [
    { value: 'budgeting', label: 'Budgeting', description: 'Improve budgeting skills', sortOrder: 1 },
    { value: 'saving', label: 'Saving', description: 'Improve saving habits', sortOrder: 2 },
    { value: 'investing', label: 'Investing', description: 'Learn about investing', sortOrder: 3 },
    { value: 'debt_management', label: 'Debt Management', description: 'Improve debt management', sortOrder: 4 },
    { value: 'credit_score', label: 'Credit Score', description: 'Improve credit score', sortOrder: 5 },
    { value: 'financial_literacy', label: 'Financial Literacy', description: 'Improve financial knowledge', sortOrder: 6 },
    { value: 'spending_habits', label: 'Spending Habits', description: 'Improve spending habits', sortOrder: 7 },
    { value: 'goal_setting', label: 'Goal Setting', description: 'Improve goal setting skills', sortOrder: 8 }
  ],
  game_preferences: [
    { value: 'puzzle_brain', label: 'Puzzle & Brain', description: 'Puzzle and brain training games', sortOrder: 1 },
    { value: 'strategy', label: 'Strategy', description: 'Strategy and thinking games', sortOrder: 2 },
    { value: 'arcade', label: 'Arcade', description: 'Arcade and action games', sortOrder: 3 },
    { value: 'simulation', label: 'Simulation', description: 'Simulation games', sortOrder: 4 },
    { value: 'card_casino', label: 'Card & Casino', description: 'Card and casino games', sortOrder: 5 },
    { value: 'sports_racing', label: 'Sports & Racing', description: 'Sports and racing games', sortOrder: 6 },
    { value: 'word_trivia', label: 'Word & Trivia', description: 'Word and trivia games', sortOrder: 7 },
    { value: 'role_playing_adventure', label: 'Role Playing / Adventure', description: 'Role playing and adventure games', sortOrder: 8 }
  ],
  game_styles: [
    { value: 'short_sessions', label: 'Short Sessions', description: 'Quick 5-15 minute games', sortOrder: 1 },
    { value: 'medium_sessions', label: 'Medium Sessions', description: '15-30 minute games', sortOrder: 2 },
    { value: 'long_sessions', label: 'Long Sessions', description: '30+ minute games', sortOrder: 3 },
    { value: 'anytime_play', label: 'Anytime Play', description: 'Flexible session lengths', sortOrder: 4 }
  ],
  player_types: [
    { value: 'evening_reward_gamer', label: 'Evening Reward Gamer', description: 'Plays in evening for rewards', sortOrder: 1 },
    { value: 'casual_break_gamer', label: 'Casual Break Gamer', description: 'Plays during breaks', sortOrder: 2 },
    { value: 'night_reward_fail_gamer', label: 'Night Reward Fail Gamer', description: 'Plays at night after failures', sortOrder: 3 },
    { value: 'fun_anytime_gamer', label: 'Fun Anytime Gamer', description: 'Plays for fun anytime', sortOrder: 4 },
    { value: 'daily_high_reward_gamer', label: 'Daily High Reward Gamer', description: 'Plays daily for high rewards', sortOrder: 5 }
  ],
  daily_earning_goals: [
    { value: '5', label: '$5', description: 'Daily earning goal of $5', sortOrder: 1 },
    { value: '10', label: '$10', description: 'Daily earning goal of $10', sortOrder: 2 },
    { value: '15', label: '$15', description: 'Daily earning goal of $15', sortOrder: 3 },
    { value: '20', label: '$20', description: 'Daily earning goal of $20', sortOrder: 4 },
    { value: '25', label: '$25', description: 'Daily earning goal of $25', sortOrder: 5 },
    { value: '30', label: '$30', description: 'Daily earning goal of $30', sortOrder: 6 },
    { value: '50', label: '$50', description: 'Daily earning goal of $50', sortOrder: 7 },
    { value: '100', label: '$100', description: 'Daily earning goal of $100', sortOrder: 8 }
  ]
};

// Initialize master data
const initializeMasterData = async () => {
  try {
    console.log('Starting master data initialization...');
    
    const results = [];
    
    for (const [category, data] of Object.entries(masterDataConfig)) {
      console.log(`Initializing ${category}...`);
      
      const result = await MasterData.findOneAndUpdate(
        { category },
        { 
          data,
          lastUpdated: new Date(),
          version: '1.0.0'
        },
        { 
          new: true, 
          upsert: true 
        }
      );
      
      results.push({ category, count: result.data.length });
      console.log(`✓ ${category}: ${result.data.length} items created/updated`);
    }

    console.log('\nMaster data initialization completed successfully!');
    console.log('Results:', results);
    
    return results;
    
  } catch (error) {
    console.error('Error initializing master data:', error);
    throw error;
  }
};

// Main execution
const main = async () => {
  try {
    await connectDB();
    await initializeMasterData();
    console.log('Script completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  }
};

// Run the script
if (require.main === module) {
  main();
}

module.exports = { initializeMasterData }; 