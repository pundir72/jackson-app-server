const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const protect = require('../middleware/auth');
const User = require('../models/User');
const Game = require('../models/Game');
const besitosController = require('../controllers/besitos.controller');
const { trackAchievements } = require('../utils/achievements');
// Get user's games (downloaded/installed games list)
router.get('/', protect, async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const pageNum = Math.max(parseInt(page) || 1, 1);
        const pageSize = Math.min(Math.max(parseInt(limit) || 20, 1), 100);

        const user = await User.findById(req.user.userId).select('games');
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        const gamesArr = Array.isArray(user.games) ? user.games.slice() : [];
        gamesArr.sort((a, b) => new Date(b.installedAt || b.date || 0) - new Date(a.installedAt || a.date || 0));

        const start = (pageNum - 1) * pageSize;
        const slice = gamesArr.slice(start, start + pageSize);

        // Enrich with game metadata from Game collection
        const enriched = await Promise.all(slice.map(async (g) => {
            let meta = null;
            try {
                meta = await Game.findOne({ gameId: g.gameId })
                    .select('title description category uiSection gender ageGroup metadata gameDetails rewards')
                    .lean();
            } catch (_) {}

            return {
                gameId: g.gameId,
                offerId: g.offerId || null,
                installedAt: g.installedAt || g.date || null,
                status: g.status || 'installed',
                completed: g.completed || false,
                progress: g.progress || 0,
                score: g.score || 0,
                playCount: g.playCount || 0,
                lastPlayed: g.lastPlayed || null,
                level: g.level || 1,
                // Game metadata
                title: meta?.title || null,
                description: meta?.description || null,
                category: meta?.category || null,
                uiSection: meta?.uiSection || null,
                gender: meta?.gender || null,
                ageGroup: meta?.ageGroup || null,
                rewards: meta?.rewards || { coins: 0, xp: 0 },
                icon: meta?.metadata?.thumbnail?.url || meta?.gameDetails?.square_image || meta?.gameDetails?.image || '',
                gameDetails: meta?.gameDetails || null
            };
        }));

        res.json({
            success: true,
            data: {
                games: enriched,
                pagination: {
                    page: pageNum,
                    limit: pageSize,
                    total: gamesArr.length,
                    pages: Math.ceil(gamesArr.length / pageSize)
                }
            }
        });
    } catch (error) {
        console.error('Error getting user games:', error);
        res.status(500).json({ 
            success: false,
            message: 'Server error',
            error: error.message 
        });
    }
});

// Start new game
router.post('/start', protect, async (req, res) => {
    try {
        const { gameId } = req.body;

        const user = await User.findById(req.user.userId);

        // Add new game
        user.games.push({
            gameId,
            score: 0,
            completed: false,
            progress: 0,
            date: new Date()
        });

        await user.save();

        res.json({
            message: 'Game started successfully',
            game: user.games[user.games.length - 1]
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Update game score
router.put('/score', protect, async (req, res) => {
    try {
        const { gameId, score } = req.body;

        const user = await User.findById(req.user.userId);

        // Find game and update score
        const game = user.games.find(g => g.gameId === gameId);
        if (!game) {
            return res.status(404).json({ message: 'Game not found' });
        }

        game.score = score;
        // Update progress based on score (assuming 100 is max score)
        game.progress = Math.min(100, Math.max(0, (score / 100) * 100));
        await user.save();

        // Track achievements for game score updates
        setImmediate(async () => {
          try {
            await trackAchievements(req.user.userId, 'games', {
              score: score,
              gameId: gameId,
              category: 'game_score'
            });
          } catch (error) {
            console.error('Error tracking game score achievements:', error);
          }
        });

        res.json({
            message: 'Score updated successfully',
            game
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Complete game
router.put('/complete', protect, async (req, res) => {
    try {
        const { gameId } = req.body;

        const user = await User.findById(req.user.userId);

        // Find game and mark as completed
        const game = user.games.find(g => g.gameId === gameId);
        if (!game) {
            return res.status(404).json({ message: 'Game not found' });
        }

        game.completed = true;
        // Set progress to 100% when game is completed
        game.progress = 100;
        await user.save();

        // Track achievements for game completion
        setImmediate(async () => {
          try {
            await trackAchievements(req.user.userId, 'games', {
              completed: true,
              gameId: gameId,
              category: 'game_completion'
            });
          } catch (error) {
            console.error('Error tracking game completion achievements:', error);
          }
        });

        res.json({
            message: 'Game completed successfully',
            game
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Track a game install/download (internal tracking, not Besitos)
router.post('/install', protect, async (req, res) => {
  try {
    const { gameId, offerId } = req.body;
    if (!gameId) {
      return res.status(400).json({ success: false, message: 'gameId is required' });
    }

    const user = await User.findById(req.user.userId).select('games');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const idx = Array.isArray(user.games) ? user.games.findIndex(g => String(g.gameId) === String(gameId)) : -1;
    if (idx >= 0) {
      user.games[idx].installedAt = new Date();
      if (offerId) user.games[idx].offerId = offerId;
      user.games[idx].status = 'installed';
    } else {
      user.games = user.games || [];
      user.games.push({ gameId, offerId, installedAt: new Date(), status: 'installed' });
    }

    await user.save();
    return res.json({ success: true, message: 'Game installation recorded' });
  } catch (error) {
    console.error('Error recording game installation:', error);
    res.status(500).json({ success: false, message: 'Failed to record installation', error: error.message });
  }
});

// Get downloaded/installed games history
router.get('/downloads', protect, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(parseInt(page) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit) || 20, 1), 100);

    const user = await User.findById(req.user.userId).select('games');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const gamesArr = Array.isArray(user.games) ? user.games.slice() : [];
    gamesArr.sort((a, b) => new Date(b.installedAt || 0) - new Date(a.installedAt || 0));

    const start = (pageNum - 1) * pageSize;
    const slice = gamesArr.slice(start, start + pageSize);

    // Enrich minimal metadata from Game collection if possible
    const enriched = await Promise.all(slice.map(async (g) => {
      let meta = null;
      try {
        meta = await Game.findOne({ gameId: g.gameId })
          .select('title category uiSection gender ageGroup metadata.thumbnail gameDetails')
          .lean();
      } catch (_) {}
      return {
        gameId: g.gameId,
        offerId: g.offerId || null,
        installedAt: g.installedAt || null,
        status: g.status || 'installed',
        title: meta?.title || null,
        category: meta?.category || null,
        uiSection: meta?.uiSection || null,
        gender: meta?.gender || null,
        ageGroup: meta?.ageGroup || null,
        icon: meta?.metadata?.thumbnail?.url || meta?.gameDetails?.square_image || meta?.gameDetails?.image || ''
      };
    }));

    res.json({
      success: true,
      data: {
        downloads: enriched,
        pagination: {
          page: pageNum,
          limit: pageSize,
          total: gamesArr.length,
          pages: Math.ceil(gamesArr.length / pageSize)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching downloads:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch downloads', error: error.message });
  }
});

// Credit earned XP and coins to the authenticated user
router.post('/earn', protect, async (req, res) => {
  try {
    const { gameId, offerId, coins = 0, xp = 0, reason } = req.body;
    const coinsNum = Number(coins);
    const xpNum = Number(xp);

    if ((isNaN(coinsNum) || coinsNum < 0) || (isNaN(xpNum) || xpNum < 0)) {
      return res.status(400).json({ success: false, message: 'coins and xp must be non-negative numbers' });
    }

    // basic per-call cap to avoid accidental large credits
    if (coinsNum > 100000 || xpNum > 100000) {
      return res.status(400).json({ success: false, message: 'coins/xp exceed per-call cap' });
    }

    const user = await User.findById(req.user.userId).select('wallet xp games');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Update wallet balance (coins)
    user.wallet = user.wallet || {};
    user.wallet.balance = Number(user.wallet.balance || 0) + coinsNum;
    user.wallet.lastUpdated = new Date();
    // Update xp object (current + total)
    user.xp = user.xp || {};
    user.xp.current = Number(user.xp.current || 0) + xpNum;
    user.xp.total = Number(user.xp.total || 0) + xpNum;

    // Optional lightweight history on user.games entry if present
    if (gameId && Array.isArray(user.games)) {
      const idx = user.games.findIndex(g => String(g.gameId) === String(gameId));
      if (idx >= 0) {
        user.games[idx].lastEarnedAt = new Date();
        user.games[idx].lastEarned = { coins: coinsNum, xp: xpNum, offerId: offerId || null, reason: reason || null };
      }
    }

    await user.save();

    // Track achievements for game earnings
    setImmediate(async () => {
      try {
        await trackAchievements(req.user.userId, 'wallet', {
          coins: coinsNum,
          xp: xpNum,
          category: 'game_earn',
          gameId: gameId,
          reason: reason
        });
        
        // Also track XP achievements
        await trackAchievements(req.user.userId, 'xp', {
          xp: xpNum,
          category: 'game_earn'
        });
      } catch (error) {
        console.error('Error tracking game earn achievements:', error);
      }
    });

    return res.json({
      success: true,
      data: {
        wallet: { balance: user.wallet.balance },
        xp: { current: user.xp.current, total: user.xp.total }
      }
    });
  } catch (error) {
    console.error('Error crediting earnings:', error);
    res.status(500).json({ success: false, message: 'Failed to credit earnings', error: error.message });
  }
});

/**
 * GET /api/game/discover
 * Query games for user by uiSection, ageGroup, gender
 * Query params: uiSection, ageGroup, gender, page=1, limit=20, country (optional)
 */
router.get('/discover', protect, async (req, res) => {
    try {
        const { uiSection, ageGroup, gender, page = 1, limit = 20, country } = req.query;

        const filter = { isActive: true };
        if (uiSection) filter.uiSection = uiSection;
        if (ageGroup) filter.ageGroup = ageGroup;
        if (gender) filter.gender = gender;
        if (country) filter.countries = country;

        const pageNum = Math.max(parseInt(page) || 1, 1);
        const pageSize = Math.min(Math.max(parseInt(limit) || 20, 1), 100);

        const [items, total] = await Promise.all([
            Game.find(filter)
                .sort({ 'displayRules.priority': -1, createdAt: -1 })
                .select('uiSection gender ageGroup rewards metadata.thumbnail gameDetails')
                .lean()
                .skip((pageNum - 1) * pageSize)
                .limit(pageSize),
            Game.countDocuments(filter)
        ]);

        const games = items.map(g => ({
            gameId: g.gameId,
            title: g.title,
            description: g.description,
            category: g.category,
            uiSection: g.uiSection,
            gender: g.gender,
            ageGroup: g.ageGroup,
            rewards: g.rewards,
            icon: g.metadata?.thumbnail?.url || g.gameDetails?.square_image || g.gameDetails?.image || '',
            images: {
                icon: g.metadata?.images?.icon || g.gameDetails?.square_image || '',
                banner: g.metadata?.images?.banner || g.gameDetails?.large_image || ''
            },
            details: g.gameDetails || {},
            _id: g._id
        }));

        const uiSections = await Game.distinct("uiSection");

        res.json({
            success: true,
            data: games,
            pagination: {
                page: pageNum,
                limit: pageSize,
                total,
                pages: Math.ceil(total / pageSize)
            },
            uiSections
        });
    } catch (error) {
        console.error('Error fetching discover games:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch games', error: error.message });
    }
});

// Get single game by ID (supports both MongoDB _id and gameId string)
router.get('/get-game-by-id/:id', protect, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;

        // Try to find by MongoDB _id first
        let game = null;
        if (mongoose.Types.ObjectId.isValid(id)) {
            game = await Game.findById(id)
                .select('gameId title description category uiSection gender ageGroup metadata gameDetails sdkProvider rewards')
                .lean();
        }

        // If not found by _id, try to find by gameId
        if (!game) {
            game = await Game.findOne({ gameId: id })
                .select('gameId title description category uiSection gender ageGroup metadata gameDetails sdkProvider rewards')
                .lean();
        }

        if (!game) {
            return res.status(404).json({
                success: false,
                message: 'Game not found'
            });
        }

        // Get user's game data if this game is in their downloaded games
        const user = await User.findById(userId).select('games').lean();
        const userGame = user?.games?.find(g => String(g.gameId) === String(game.gameId));

        // If game is from Besitos, get external details
        if (game.sdkProvider === "besitos") {
            const externalId = game.gameDetails?.id;
            if (!externalId) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Missing external game id for besitos mapping' 
                });
            }
            
            // Try to get from Besitos
            try {
                req.query.offer_id = externalId;
                const captureResponse = () => {
                    let payload = null;
                    let statusCode = 200;
                    return {
                        res: {
                            status(code) { statusCode = code; return this; },
                            json(obj) { payload = obj; return this; }
                        },
                        get() { return { payload, statusCode }; }
                    };
                };
                const cap = captureResponse();
                await besitosController.getOffers(req, cap.res);
                const result = cap.get();
                
                if (result.statusCode === 200 && result.payload?.success && result.payload?.data?.length > 0) {
                    const besitosGame = result.payload.data[0];
                    return res.json({
                        success: true,
                        data: {
                            ...game,
                            gameDetails: {
                                ...game.gameDetails,
                                ...besitosGame
                            },
                            userGame: userGame || null,
                            isDownloaded: !!userGame
                        }
                    });
                }
            } catch (besitosError) {
                console.error('Error fetching from Besitos:', besitosError);
                // Fall through to return game data without Besitos details
            }
        }

        res.json({
            success: true,
            data: {
                ...game,
                userGame: userGame || null,
                isDownloaded: !!userGame
            }
        });
    } catch (error) {
        console.error('Error while fetching game:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching the game.',
            error: error.message
        });
    }
});

// Get single downloaded game by gameId (from user's downloaded games)
router.get('/downloaded/:gameId', protect, async (req, res) => {
    try {
        const { gameId } = req.params;
        const userId = req.user.userId;

        const user = await User.findById(userId).select('games');
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Find game in user's downloaded games
        const userGame = user.games?.find(g => String(g.gameId) === String(gameId));
        if (!userGame) {
            return res.status(404).json({
                success: false,
                message: 'Game not found in your downloaded games'
            });
        }

        // Get full game metadata
        const game = await Game.findOne({ gameId })
            .select('title description category uiSection gender ageGroup metadata gameDetails sdkProvider rewards')
            .lean();

        // Enrich with game metadata
        const enrichedGame = {
            gameId: userGame.gameId,
            offerId: userGame.offerId || null,
            installedAt: userGame.installedAt || userGame.date || null,
            status: userGame.status || 'installed',
            completed: userGame.completed || false,
            progress: userGame.progress || 0,
            score: userGame.score || 0,
            playCount: userGame.playCount || 0,
            lastPlayed: userGame.lastPlayed || null,
            level: userGame.level || 1,
            firstPlayed: userGame.firstPlayed || null,
            completedAt: userGame.completedAt || null,
            // Game metadata
            title: game?.title || null,
            description: game?.description || null,
            category: game?.category || null,
            uiSection: game?.uiSection || null,
            gender: game?.gender || null,
            ageGroup: game?.ageGroup || null,
            rewards: game?.rewards || { coins: 0, xp: 0 },
            icon: game?.metadata?.thumbnail?.url || game?.gameDetails?.square_image || game?.gameDetails?.image || '',
            gameDetails: game?.gameDetails || null,
            sdkProvider: game?.sdkProvider || null
        };

        res.json({
            success: true,
            data: enrichedGame
        });
    } catch (error) {
        console.error('Error getting downloaded game:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get downloaded game',
            error: error.message
        });
    }
});

module.exports = router;
