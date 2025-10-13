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
