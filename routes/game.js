const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const User = require('../models/User');

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

module.exports = router;
