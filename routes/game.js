const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const User = require('../models/User');
const Game = require('../models/Game');
const besitosController = require('../controllers/besitos.controller');
// Get user's games
router.get('/', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('games');
        res.json(user.games);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
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
        await user.save();

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
        await user.save();

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

router.get('/get-game-by-id/:id', protect, async (req, res) => {
    try {
        const game = await Game.findById(req.params.id).select("gameDetails sdkProvider");
        if (!game) {
            return res.status(404).json({
                success: false,
                message: 'Game not found'
            });
        }
        if (game.sdkProvider === "besitos") {
            const externalId = game.gameDetails?.id;
            if (!externalId) {
                return res.status(400).json({ success: false, message: 'Missing external game id for besitos mapping' });
            }
            req.query.offer_id = externalId;
            await besitosController.getOffers(req, res);
        } else {
            res.json({
                success: true,
                data: game.gameDetails
            });
        }
    } catch (error) {
        console.error('Error while fetching game list:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching the game list.',
            error: error.message
        });
    }
});

module.exports = router;
