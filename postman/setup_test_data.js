const mongoose = require('mongoose');
const Game = require('../src/models/Game');
const User = require('../src/models/User');
require('dotenv').config();

// Sample test games data
const sampleGames = [
  {
    title: 'Brain Teaser Pro',
    description: 'Challenge your mind with advanced puzzle games',
    category: 'puzzle',
    difficulty: 'medium',
    gameType: 'single_player',
    pointsReward: 100,
    cashbackReward: 0.50,
    maxPointsPerDay: 500,
    maxCashbackPerDay: 2.50,
    imageUrl: 'https://example.com/puzzle-game.jpg',
    backgroundColor: '#FF5733',
    textColor: '#FFFFFF',
    tags: ['puzzle', 'brain-teaser', 'logic'],
    ageRange: 'all',
    gender: 'all',
    isActive: true,
    isFeatured: true,
    isNew: true,
    isVipOnly: false,
    locationRequired: false,
    totalPlays: 150,
    averageRating: 4.2,
    totalRatings: 25
  },
  {
    title: 'VIP Blackjack',
    description: 'Exclusive VIP casino game with high rewards',
    category: 'casino',
    difficulty: 'hard',
    gameType: 'single_player',
    pointsReward: 200,
    cashbackReward: 1.00,
    maxPointsPerDay: 1000,
    maxCashbackPerDay: 5.00,
    imageUrl: 'https://example.com/vip-blackjack.jpg',
    backgroundColor: '#8B0000',
    textColor: '#FFD700',
    tags: ['casino', 'vip', 'blackjack', 'card-game'],
    ageRange: '18_24',
    gender: 'all',
    isActive: true,
    isFeatured: false,
    isNew: false,
    isVipOnly: true,
    locationRequired: false,
    totalPlays: 75,
    averageRating: 4.8,
    totalRatings: 15
  },
  {
    title: 'Treasure Hunt',
    description: 'Find treasures in your local area',
    category: 'action',
    difficulty: 'easy',
    gameType: 'single_player',
    pointsReward: 75,
    cashbackReward: 0.25,
    maxPointsPerDay: 300,
    maxCashbackPerDay: 1.00,
    imageUrl: 'https://example.com/treasure-hunt.jpg',
    backgroundColor: '#228B22',
    textColor: '#FFFFFF',
    tags: ['action', 'location', 'treasure', 'adventure'],
    ageRange: 'all',
    gender: 'all',
    isActive: true,
    isFeatured: false,
    isNew: true,
    isVipOnly: false,
    locationRequired: true,
    locationRadius: 5,
    totalPlays: 200,
    averageRating: 4.5,
    totalRatings: 40
  },
  {
    title: 'Math Challenge',
    description: 'Educational math games for all ages',
    category: 'educational',
    difficulty: 'medium',
    gameType: 'single_player',
    pointsReward: 80,
    cashbackReward: 0.40,
    maxPointsPerDay: 400,
    maxCashbackPerDay: 2.00,
    imageUrl: 'https://example.com/math-challenge.jpg',
    backgroundColor: '#4169E1',
    textColor: '#FFFFFF',
    tags: ['educational', 'math', 'learning', 'school'],
    ageRange: 'all',
    gender: 'all',
    isActive: true,
    isFeatured: true,
    isNew: false,
    isVipOnly: false,
    locationRequired: false,
    totalPlays: 300,
    averageRating: 4.0,
    totalRatings: 60
  },
  {
    title: 'Strategy Master',
    description: 'Advanced strategy games for tactical minds',
    category: 'strategy',
    difficulty: 'expert',
    gameType: 'multiplayer',
    pointsReward: 150,
    cashbackReward: 0.75,
    maxPointsPerDay: 750,
    maxCashbackPerDay: 3.75,
    imageUrl: 'https://example.com/strategy-master.jpg',
    backgroundColor: '#2F4F4F',
    textColor: '#FFFFFF',
    tags: ['strategy', 'tactical', 'multiplayer', 'competitive'],
    ageRange: '18_24',
    gender: 'all',
    isActive: true,
    isFeatured: false,
    isNew: false,
    isVipOnly: false,
    locationRequired: false,
    maxPlayers: 4,
    totalPlays: 120,
    averageRating: 4.6,
    totalRatings: 30
  },
  {
    title: 'Arcade Classics',
    description: 'Classic arcade games with modern twists',
    category: 'arcade',
    difficulty: 'easy',
    gameType: 'single_player',
    pointsReward: 60,
    cashbackReward: 0.30,
    maxPointsPerDay: 300,
    maxCashbackPerDay: 1.50,
    imageUrl: 'https://example.com/arcade-classics.jpg',
    backgroundColor: '#FF69B4',
    textColor: '#FFFFFF',
    tags: ['arcade', 'classic', 'retro', 'fun'],
    ageRange: 'all',
    gender: 'all',
    isActive: true,
    isFeatured: false,
    isNew: true,
    isVipOnly: false,
    locationRequired: false,
    totalPlays: 500,
    averageRating: 4.3,
    totalRatings: 100
  },
  {
    title: 'Trivia Night',
    description: 'Test your knowledge with trivia questions',
    category: 'trivia',
    difficulty: 'medium',
    gameType: 'tournament',
    pointsReward: 90,
    cashbackReward: 0.45,
    maxPointsPerDay: 450,
    maxCashbackPerDay: 2.25,
    imageUrl: 'https://example.com/trivia-night.jpg',
    backgroundColor: '#9932CC',
    textColor: '#FFFFFF',
    tags: ['trivia', 'knowledge', 'quiz', 'tournament'],
    ageRange: 'all',
    gender: 'all',
    isActive: true,
    isFeatured: true,
    isNew: false,
    isVipOnly: false,
    locationRequired: false,
    maxPlayers: 8,
    totalPlays: 180,
    averageRating: 4.4,
    totalRatings: 45
  },
  {
    title: 'Simulation City',
    description: 'Build and manage your own virtual city',
    category: 'simulation',
    difficulty: 'hard',
    gameType: 'single_player',
    pointsReward: 120,
    cashbackReward: 0.60,
    maxPointsPerDay: 600,
    maxCashbackPerDay: 3.00,
    imageUrl: 'https://example.com/simulation-city.jpg',
    backgroundColor: '#32CD32',
    textColor: '#FFFFFF',
    tags: ['simulation', 'city-building', 'management', 'strategy'],
    ageRange: '25_34',
    gender: 'all',
    isActive: true,
    isFeatured: false,
    isNew: false,
    isVipOnly: false,
    locationRequired: false,
    estimatedDuration: 30,
    totalPlays: 90,
    averageRating: 4.7,
    totalRatings: 20
  }
];

// Sample test users
const sampleUsers = [
  {
    email: 'testuser@example.com',
    password: 'password123',
    firstName: 'Test',
    lastName: 'User',
    phoneNumber: '+1234567890',
    ageRange: '18_24',
    gender: 'male',
    isVip: false,
    isActive: true
  },
  {
    email: 'vipuser@example.com',
    password: 'password123',
    firstName: 'VIP',
    lastName: 'User',
    phoneNumber: '+1234567891',
    ageRange: '25_34',
    gender: 'female',
    isVip: true,
    isActive: true
  }
];

async function setupTestData() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/rewards-backend');
    console.log('✅ Connected to MongoDB');

    // Clear existing test data
    await Game.deleteMany({ title: { $regex: /Test|Brain Teaser|VIP Blackjack|Treasure Hunt|Math Challenge|Strategy Master|Arcade Classics|Trivia Night|Simulation City/ } });
    console.log('✅ Cleared existing test games');

    // Insert sample games
    const createdGames = await Game.insertMany(sampleGames);
    console.log(`✅ Created ${createdGames.length} test games`);

    // Create test users if they don't exist
    for (const userData of sampleUsers) {
      const existingUser = await User.findOne({ email: userData.email });
      if (!existingUser) {
        const user = new User(userData);
        await user.save();
        console.log(`✅ Created test user: ${userData.email}`);
      } else {
        console.log(`ℹ️  Test user already exists: ${userData.email}`);
      }
    }

    // Display created games
    console.log('\n📋 Created Test Games:');
    createdGames.forEach((game, index) => {
      console.log(`${index + 1}. ${game.title} (ID: ${game._id})`);
      console.log(`   Category: ${game.category}, Difficulty: ${game.difficulty}`);
      console.log(`   VIP Only: ${game.isVipOnly}, Featured: ${game.isFeatured}`);
      console.log(`   Tags: ${game.tags.join(', ')}`);
      console.log('');
    });

    console.log('🎯 Test Data Setup Complete!');
    console.log('\n📝 Next Steps:');
    console.log('1. Import the Postman collection');
    console.log('2. Set your authToken in Postman variables');
    console.log('3. Use the game IDs above for testing');
    console.log('4. Follow the testing guide for comprehensive testing');

  } catch (error) {
    console.error('❌ Error setting up test data:', error);
  } finally {
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  }
}

// Run the setup
setupTestData(); 