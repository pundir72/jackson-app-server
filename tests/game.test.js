const mongoose = require('mongoose');
const Game = require('../src/models/Game');
const User = require('../src/models/User');

// Mock user for testing
const mockUser = {
  id: new mongoose.Types.ObjectId(),
  isVip: false,
  ageRange: '18_24',
  gender: 'male'
};

const mockVipUser = {
  id: new mongoose.Types.ObjectId(),
  isVip: true,
  ageRange: '25_34',
  gender: 'female'
};

describe('Game Model Test', () => {
  let testGame;

  beforeAll(async () => {
    // Create a test game
    testGame = new Game({
      title: 'Test Puzzle Game',
      description: 'A fun puzzle game for testing',
      category: 'puzzle',
      difficulty: 'medium',
      gameType: 'single_player',
      pointsReward: 100,
      cashbackReward: 0.50,
      maxPointsPerDay: 500,
      maxCashbackPerDay: 2.50,
      imageUrl: 'https://example.com/game.jpg',
      backgroundColor: '#FF5733',
      textColor: '#FFFFFF',
      tags: ['puzzle', 'brain-teaser'],
      ageRange: 'all',
      gender: 'all',
      isActive: true,
      isFeatured: false,
      isNew: true,
      isVipOnly: false
    });
  });

  describe('Game Schema Validation', () => {
    test('should create a valid game', async () => {
      const game = new Game({
        title: 'Valid Game',
        description: 'A valid game description',
        category: 'puzzle',
        pointsReward: 50,
        cashbackReward: 0.25
      });

      expect(game.title).toBe('Valid Game');
      expect(game.category).toBe('puzzle');
      expect(game.isActive).toBe(true);
    });

    test('should require title', async () => {
      const game = new Game({
        description: 'No title game',
        category: 'puzzle',
        pointsReward: 50,
        cashbackReward: 0.25
      });

      try {
        await game.save();
      } catch (error) {
        expect(error.errors.title).toBeDefined();
      }
    });

    test('should validate category enum', async () => {
      const game = new Game({
        title: 'Invalid Category Game',
        description: 'Game with invalid category',
        category: 'invalid_category',
        pointsReward: 50,
        cashbackReward: 0.25
      });

      try {
        await game.save();
      } catch (error) {
        expect(error.errors.category).toBeDefined();
      }
    });
  });

  describe('Virtual Fields', () => {
    test('should calculate totalRewardValue correctly', () => {
      expect(testGame.totalRewardValue).toBe(150); // 100 points + (0.50 * 100)
    });

    test('should calculate popularityScore correctly', () => {
      testGame.totalPlays = 100;
      testGame.averageRating = 4.5;
      expect(testGame.popularityScore).toBe(42.7); // (100 * 0.4) + (4.5 * 0.6)
    });

    test('should identify location-based games', () => {
      testGame.locationRequired = true;
      testGame.locationRadius = 5;
      expect(testGame.isLocationBased).toBe(true);
    });

    test('should identify games with daily limits', () => {
      expect(testGame.hasDailyLimits).toBe(true);
    });
  });

  describe('Instance Methods', () => {
    test('should check availability for user', () => {
      expect(testGame.isAvailableForUser(mockUser)).toBe(true);
    });

    test('should check VIP requirement', () => {
      testGame.isVipOnly = true;
      expect(testGame.isAvailableForUser(mockUser)).toBe(false);
      expect(testGame.isAvailableForUser(mockVipUser)).toBe(true);
    });

    test('should calculate rewards for VIP user', () => {
      const rewards = testGame.getRewardForUser(mockVipUser);
      expect(rewards.points).toBe(150); // 100 * 1.5
      expect(rewards.cashback).toBe(0.75); // 0.50 * 1.5
    });

    test('should calculate rewards for regular user', () => {
      const rewards = testGame.getRewardForUser(mockUser);
      expect(rewards.points).toBe(100);
      expect(rewards.cashback).toBe(0.50);
    });

    test('should get daily limits', () => {
      const limits = testGame.getDailyLimits();
      expect(limits.maxPoints).toBe(500);
      expect(limits.maxCashback).toBe(2.50);
    });
  });

  describe('Static Methods', () => {
    beforeEach(async () => {
      // Create test games for static method testing
      await Game.create([
        {
          title: 'Featured Game 1',
          description: 'A featured game',
          category: 'puzzle',
          pointsReward: 50,
          cashbackReward: 0.25,
          isActive: true,
          isFeatured: true
        },
        {
          title: 'New Game 1',
          description: 'A new game',
          category: 'action',
          pointsReward: 75,
          cashbackReward: 0.35,
          isActive: true,
          isNew: true
        },
        {
          title: 'VIP Game 1',
          description: 'A VIP game',
          category: 'casino',
          pointsReward: 200,
          cashbackReward: 1.00,
          isActive: true,
          isVipOnly: true
        }
      ]);
    });

    test('should find featured games', async () => {
      const featuredGames = await Game.findFeatured();
      expect(featuredGames.length).toBeGreaterThan(0);
      expect(featuredGames[0].isFeatured).toBe(true);
    });

    test('should find new games', async () => {
      const newGames = await Game.findNew();
      expect(newGames.length).toBeGreaterThan(0);
      expect(newGames[0].isNew).toBe(true);
    });

    test('should find VIP games', async () => {
      const vipGames = await Game.findVipGames();
      expect(vipGames.length).toBeGreaterThan(0);
      expect(vipGames[0].isVipOnly).toBe(true);
    });

    test('should find games by category', async () => {
      const puzzleGames = await Game.findByCategory('puzzle');
      expect(puzzleGames.length).toBeGreaterThan(0);
      expect(puzzleGames[0].category).toBe('puzzle');
    });

    test('should find games by tags', async () => {
      const taggedGames = await Game.findByTags(['puzzle'], 10);
      expect(taggedGames.length).toBeGreaterThan(0);
    });
  });

  describe('Pre-save Middleware', () => {
    test('should validate hex color codes', async () => {
      const game = new Game({
        title: 'Color Test Game',
        description: 'Testing color validation',
        category: 'puzzle',
        pointsReward: 50,
        cashbackReward: 0.25,
        backgroundColor: 'invalid-color',
        textColor: '#FFFFFF'
      });

      try {
        await game.save();
      } catch (error) {
        expect(error.message).toContain('Invalid backgroundColor format');
      }
    });

    test('should validate game URL', async () => {
      const game = new Game({
        title: 'URL Test Game',
        description: 'Testing URL validation',
        category: 'puzzle',
        pointsReward: 50,
        cashbackReward: 0.25,
        gameUrl: 'invalid-url'
      });

      try {
        await game.save();
      } catch (error) {
        expect(error.message).toContain('Invalid game URL format');
      }
    });
  });

  afterAll(async () => {
    // Clean up test data
    await Game.deleteMany({ title: { $regex: /Test|Featured|New|VIP/ } });
  });
}); 