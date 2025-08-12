const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/server');
const User = require('../src/models/User');
const UserPreference = require('../src/models/UserPreference');

let mongoServer;
let authToken;
let testUserId;

describe('Onboarding API Tests', () => {
  beforeAll(async () => {
    // Setup in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Create a test user and get auth token
    const testUser = await User.create({
      email: 'test@example.com',
      password: 'password123',
      firstName: 'Test',
      lastName: 'User'
    });
    testUserId = testUser._id;

    // Mock authentication middleware
    app.use('/api/v1/onboarding', (req, res, next) => {
      req.userId = testUserId;
      next();
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear user preferences before each test
    await UserPreference.deleteMany({});
  });

  describe('POST /api/v1/onboarding/step-complete', () => {
    it('should complete age selection step', async () => {
      const response = await request(app)
        .post('/api/v1/onboarding/step-complete')
        .send({
          step: 'age_selection',
          data: { ageRange: '25_34' }
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.step).toBe('age_selection');
      expect(response.body.data.nextStep).toBe('gender_selection');
    });

    it('should complete gender selection step', async () => {
      const response = await request(app)
        .post('/api/v1/onboarding/step-complete')
        .send({
          step: 'gender_selection',
          data: { gender: 'male' }
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.step).toBe('gender_selection');
    });

    it('should complete game preferences step', async () => {
      const response = await request(app)
        .post('/api/v1/onboarding/step-complete')
        .send({
          step: 'game_preferences',
          data: { gamePreferences: ['puzzle', 'strategy'] }
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.step).toBe('game_preferences');
    });

    it('should reject invalid step', async () => {
      const response = await request(app)
        .post('/api/v1/onboarding/step-complete')
        .send({
          step: 'invalid_step',
          data: {}
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/onboarding/progress', () => {
    it('should return onboarding progress', async () => {
      // First complete a step
      await request(app)
        .post('/api/v1/onboarding/step-complete')
        .send({
          step: 'age_selection',
          data: { ageRange: '25_34' }
        });

      const response = await request(app)
        .get('/api/v1/onboarding/progress');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.progress).toBeDefined();
      expect(response.body.data.progress.completedSteps).toBe(1);
    });

    it('should return 0 progress for new user', async () => {
      const response = await request(app)
        .get('/api/v1/onboarding/progress');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.progress.progress).toBe(0);
    });
  });

  describe('POST /api/v1/onboarding/save-preferences', () => {
    it('should save all onboarding preferences', async () => {
      const preferences = {
        ageRange: '25_34',
        gender: 'male',
        gamePreferences: ['puzzle', 'strategy'],
        gameStyle: 'casual',
        gameHabit: 'evening_reward_gamer',
        primaryGoal: 'earn_cashback',
        dailyEarningGoal: 50
      };

      const response = await request(app)
        .post('/api/v1/onboarding/save-preferences')
        .send(preferences);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.isCompleted).toBe(true);
    });

    it('should handle partial preferences', async () => {
      const partialPreferences = {
        ageRange: '25_34',
        gender: 'male'
      };

      const response = await request(app)
        .post('/api/v1/onboarding/save-preferences')
        .send(partialPreferences);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/v1/onboarding/resume', () => {
    it('should resume onboarding from current step', async () => {
      // Complete first step
      await request(app)
        .post('/api/v1/onboarding/step-complete')
        .send({
          step: 'age_selection',
          data: { ageRange: '25_34' }
        });

      const response = await request(app)
        .get('/api/v1/onboarding/resume');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.currentStep).toBe('age_selection');
      expect(response.body.data.nextStep).toBe('gender_selection');
    });
  });
}); 