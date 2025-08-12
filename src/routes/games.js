const express = require('express');
const router = express.Router();
const { authMiddleware: protect } = require('../middleware/auth');
const {
  getGames,
  getFeaturedGames,
  getNewGames,
  getPopularGames,
  getTopRatedGames,
  getGameCategories,
  getGameById,
  playGame,
  completeGame,
  rateGame,
  getGameProgress,
  getGameProgressById,
  getGameAchievements,
  getGameLeaderboard,
  getGamesByTags,
  getLocationBasedGames,
  getVipGames,
  getGameStats,
  toggleGameFeatured,
  toggleGameActive,
  addGameTag,
  removeGameTag,
} = require('../controllers/gamesController');

// Game listing routes
router.get('/', protect, getGames);
router.get('/featured', protect, getFeaturedGames);
router.get('/new', protect, getNewGames);
router.get('/popular', protect, getPopularGames);
router.get('/top-rated', protect, getTopRatedGames);
router.get('/categories', protect, getGameCategories);
router.get('/tags', protect, getGamesByTags);
router.get('/location-based', protect, getLocationBasedGames);
router.get('/vip', protect, getVipGames);
router.get('/stats', protect, getGameStats);

// Game detail routes
router.get('/:id', protect, getGameById);
router.post('/:id/play', protect, playGame);
router.post('/:id/complete', protect, completeGame);
router.post('/:id/rate', protect, rateGame);

// Game progress routes
router.get('/progress', protect, getGameProgress);
router.get('/progress/:gameId', protect, getGameProgressById);
router.get('/achievements', protect, getGameAchievements);
router.get('/:gameId/leaderboard', protect, getGameLeaderboard);

// Admin routes (these should be protected with admin middleware in production)
router.patch('/:id/toggle-featured', protect, toggleGameFeatured);
router.patch('/:id/toggle-active', protect, toggleGameActive);
router.post('/:id/tags', protect, addGameTag);
router.delete('/:id/tags/:tag', protect, removeGameTag);

module.exports = router; 