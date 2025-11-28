const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const protect = require('../middleware/auth');
const User = require('../models/User');
const Game = require('../models/Game');
const Transaction = require('../models/Transaction');
const GameTask = require('../models/GameTask');
const WelcomeBonusTimer = require('../models/WelcomeBonusTimer');
const TaskProgressionRule = require('../models/TaskProgressionRule');
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

    // Find Game document to get ObjectId for proper linking (if gameId provided)
    let gameDoc = null;
    if (gameId) {
      gameDoc = await Game.findOne({ gameId: gameId }).select('_id').lean();
    }

    // Create transaction record for revenue tracking
    const transaction = new Transaction({
      user: user._id,
      type: 'credit',
      amount: coinsNum,
      balanceType: 'coins',
      description: gameId ? `Game earnings - ${gameId}` : `Manual game earnings${reason ? ` - ${reason}` : ''}`,
      status: 'completed',
      referenceId: `GAME-EARN-${gameId || 'manual'}-${Date.now()}`,
      gameId: gameId || null,
      game: gameDoc?._id || null,
      metadata: {
        gameId: gameId || null,
        offerId: offerId || null,
        reason: reason || null,
        source: 'game_earn',
        xpEarned: xpNum
      },
    });

    await Promise.all([
      user.save(),
      transaction.save()
    ]);

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

// ==================== GAME TASKS ENDPOINTS ====================

// Get normal tasks for a game (excluding bonus tasks)
router.get('/:gameId/tasks', protect, async (req, res) => {
    try {
        const { gameId } = req.params;
        const userId = req.user.userId;

        // Verify game exists
        const game = await Game.findById(gameId);
        if (!game) {
            return res.status(404).json({
                success: false,
                message: 'Game not found'
            });
        }

        // Get bonus tasks configuration to exclude them
        const rule = await WelcomeBonusTimer.findOne({ 
            isActive: true,
            'gameBonusTasks.gameId': gameId,
            'gameBonusTasks.isEnabled': true
        });

        let query = { gameId: gameId, isActive: true };

        // Exclude bonus tasks from normal task list
        if (rule) {
            const gameBonusConfig = rule.gameBonusTasks.find(
                config => config.gameId.toString() === gameId.toString() && config.isEnabled
            );
            
            if (gameBonusConfig && gameBonusConfig.bonusTasks.length > 0) {
                const bonusTaskIds = gameBonusConfig.bonusTasks.map(bt => bt.taskId);
                query._id = { $nin: bonusTaskIds };
            }
        }

        // Get user's completed tasks and progression data
        const user = await User.findById(userId).select('tasks taskProgression xp vip').lean();
        const completedTaskIds = user?.tasks?.filter(t => t.completed).map(t => t.taskId) || [];

        // Get progression rule
        const progressionRule = await TaskProgressionRule.findByGame(gameId);

        // Get user's progression data for this game
        const gameIdString = gameId.toString();
        const progression = user?.taskProgression?.get?.(gameIdString) || {
            completedTasks: 0,
            thresholdReached: false,
            rewardTransferred: false,
            coinBoxBalance: 0
        };

        const completedTasksCount = progression.completedTasks || 0;
        const thresholdReached = progression.thresholdReached || false;
        const rewardTransferred = progression.rewardTransferred || false;

        // Fetch normal tasks
        const tasks = await GameTask.find(query)
            .sort({ order: 1, createdAt: 1 })
            .lean();

        // Format tasks with completion status and unlock status
        const formattedTasks = tasks.map((task, index) => {
            const taskIdString = task._id.toString();
            const isCompleted = completedTaskIds.includes(taskIdString);
            
            // Determine unlock status
            let isUnlocked = true;
            let unlockReason = '';

            if (progressionRule && !isCompleted) {
                // Check if this is a post-threshold task
                const postThresholdTask = progressionRule.postThresholdTasks.find(
                    pt => pt.taskId.toString() === taskIdString && pt.isEnabled
                );

                if (postThresholdTask) {
                    // Post-threshold task - check all conditions
                    const unlockCheck = progressionRule.canUnlockTask(
                        user,
                        taskIdString,
                        completedTasksCount,
                        rewardTransferred
                    );
                    isUnlocked = unlockCheck.canUnlock;
                    unlockReason = unlockCheck.reason;
                } else {
                    // Regular sequential task - check if previous tasks are completed
                    if (index > 0) {
                        const previousTask = tasks[index - 1];
                        const previousTaskCompleted = completedTaskIds.includes(previousTask._id.toString());
                        if (!previousTaskCompleted) {
                            isUnlocked = false;
                            unlockReason = `Complete previous task first`;
                        }
                    }
                }
            } else if (!isCompleted && index > 0) {
                // Sequential unlock for regular tasks
                const previousTask = tasks[index - 1];
                const previousTaskCompleted = completedTaskIds.includes(previousTask._id.toString());
                if (!previousTaskCompleted) {
                    isUnlocked = false;
                    unlockReason = `Complete previous task first`;
                }
            }

            return {
                _id: task._id,
                name: task.name,
                description: task.description,
                completionRule: task.completionRule,
                rewardType: task.rewardType,
                rewardValue: task.rewardValue,
                order: task.order,
                isCompleted: isCompleted,
                isBonusTask: false,
                isUnlocked: isUnlocked,
                unlockReason: unlockReason
            };
        });

        res.json({
            success: true,
            data: {
                tasks: formattedTasks,
                totalTasks: formattedTasks.length
            }
        });
    } catch (error) {
        console.error('Error getting game tasks:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get game tasks',
            error: error.message
        });
    }
});

// Get bonus tasks for a game with unlock status
router.get('/:gameId/bonus-tasks', protect, async (req, res) => {
    try {
        const { gameId } = req.params;
        const userId = req.user.userId;

        // Verify game exists
        const game = await Game.findById(gameId);
        if (!game) {
            return res.status(404).json({
                success: false,
                message: 'Game not found'
            });
        }

        // Get user data
        const user = await User.findById(userId).select('games tasks').lean();
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Get user's game data
        const userGame = user.games?.find(g => {
            // Try to match by MongoDB _id if gameId is ObjectId
            if (mongoose.Types.ObjectId.isValid(gameId)) {
                return g.gameId === gameId || String(g.gameId) === String(gameId);
            }
            return String(g.gameId) === String(gameId);
        });

        if (!userGame) {
            return res.status(404).json({
                success: false,
                message: 'Game not found in user\'s games'
            });
        }

        // Get bonus tasks configuration
        const rule = await WelcomeBonusTimer.findOne({ 
            isActive: true,
            'gameBonusTasks.gameId': gameId,
            'gameBonusTasks.isEnabled': true
        })
        .populate('gameBonusTasks.bonusTasks.taskId', 'name description completionRule rewardType rewardValue')
        .lean();

        if (!rule) {
            return res.json({
                success: true,
                data: {
                    hasBonusTasks: false,
                    bonusTasks: [],
                    message: 'No bonus tasks configured for this game'
                }
            });
        }

        const gameBonusConfig = rule.gameBonusTasks.find(
            config => config.gameId.toString() === gameId.toString() && config.isEnabled
        );

        if (!gameBonusConfig || !gameBonusConfig.bonusTasks || gameBonusConfig.bonusTasks.length === 0) {
            return res.json({
                success: true,
                data: {
                    hasBonusTasks: false,
                    bonusTasks: [],
                    message: 'No bonus tasks configured for this game'
                }
            });
        }

        // Get user's completed tasks and unlock timestamps
        const userTasks = user.tasks || [];
        const completedTaskIds = userTasks.filter(t => t.completed).map(t => t.taskId.toString());
        
        // Get bonus task unlock timestamps from user's tasks
        const bonusTaskUnlocks = {};
        userTasks.forEach(t => {
            if (t.isBonusTask && t.unlockedAt) {
                bonusTaskUnlocks[t.taskId] = t.unlockedAt;
            }
        });

        // Calculate user's internal events (this should be tracked separately - using playCount as placeholder)
        // TODO: Replace with actual internal events tracking
        const userInternalEvents = userGame.playCount || 0;
        const minimumEventThreshold = gameBonusConfig.minimumEventThreshold;

        // Get game download/install time
        const gameDownloadTime = userGame.installedAt || userGame.firstPlayed || userGame.date || new Date();

        // Format bonus tasks with unlock status
        const formattedBonusTasks = gameBonusConfig.bonusTasks
            .filter(bt => bt.isEnabled)
            .sort((a, b) => a.order - b.order)
            .map((bt, index) => {
                const taskId = bt.taskId._id || bt.taskId;
                const taskIdString = taskId.toString();
                const userTask = userTasks.find(t => t.taskId === taskIdString);
                const isCompleted = userTask?.completed || false;
                const completedAt = userTask?.completedAt || null;

                // Calculate unlock status based on ACTUAL completion
                let isUnlocked = false;
                let unlockReason = '';
                let unlockTime = bonusTaskUnlocks[taskIdString] || null;

                if (index === 0) {
                    // Task 1: Unlocks immediately (check if already unlocked or unlock now)
                    if (!unlockTime) {
                        // First time viewing - unlock it
                        isUnlocked = true;
                        unlockTime = new Date();
                        unlockReason = 'Unlocks immediately';
                    } else {
                        isUnlocked = true;
                        unlockReason = 'Unlocked';
                    }
                } else {
                    // Task 2 and 3: Require previous task completion AND event threshold
                    const previousTask = gameBonusConfig.bonusTasks.find(t => t.order === bt.order - 1);
                    const previousTaskId = previousTask?.taskId._id || previousTask?.taskId;
                    const previousTaskIdString = previousTaskId.toString();
                    const previousUserTask = userTasks.find(t => t.taskId === previousTaskIdString);
                    const previousTaskCompleted = previousUserTask?.completed || false;
                    const eventThresholdMet = userInternalEvents >= minimumEventThreshold;

                    if (unlockTime) {
                        // Already unlocked
                        isUnlocked = true;
                        unlockReason = 'Unlocked';
                    } else if (previousTaskCompleted && eventThresholdMet) {
                        // Should unlock now
                        isUnlocked = true;
                        unlockTime = new Date();
                        unlockReason = 'Previous task completed and event threshold met';
                    } else if (!previousTaskCompleted) {
                        unlockReason = `Complete Bonus Task ${bt.order - 1} first`;
                    } else if (!eventThresholdMet) {
                        unlockReason = `Reach ${minimumEventThreshold} internal events (current: ${userInternalEvents})`;
                    }
                }

                // Calculate completion deadline (24 hours from unlock time)
                const completionDeadline = unlockTime ? new Date(unlockTime.getTime() + (24 * 60 * 60 * 1000)) : null;
                const now = new Date();
                const isExpired = completionDeadline ? now > completionDeadline : false;
                const timeRemaining = completionDeadline ? Math.max(0, completionDeadline.getTime() - now.getTime()) : null;

                return {
                    taskId: taskIdString,
                    order: bt.order,
                    name: bt.taskId.name || null,
                    description: bt.taskId.description || null,
                    completionRule: bt.taskId.completionRule || null,
                    rewardType: bt.taskId.rewardType || null,
                    rewardValue: bt.taskId.rewardValue || null,
                    unlockCondition: bt.unlockCondition || "Unlock this Bonus Task after Minimum Event Threshold is met.",
                    isUnlocked: isUnlocked,
                    isCompleted: isCompleted,
                    completedAt: completedAt,
                    isExpired: isExpired,
                    unlockReason: unlockReason,
                    unlockTime: unlockTime,
                    completionDeadlineHours: 24,
                    completionDeadline: completionDeadline,
                    timeRemaining: timeRemaining,
                    minimumEventThreshold: minimumEventThreshold,
                    userInternalEvents: userInternalEvents
                };
            });

        // Save unlock timestamps for newly unlocked tasks
        const userDoc = await User.findById(userId);
        let needsSave = false;
        
        formattedBonusTasks.forEach(bt => {
            if (bt.isUnlocked && bt.unlockTime && !bonusTaskUnlocks[bt.taskId]) {
                // Newly unlocked - save the unlock timestamp
                const existingTask = userDoc.tasks.find(t => t.taskId === bt.taskId);
                if (existingTask) {
                    existingTask.unlockedAt = bt.unlockTime;
                    existingTask.isBonusTask = true;
                    existingTask.gameId = gameId;
                } else {
                    if (!userDoc.tasks) {
                        userDoc.tasks = [];
                    }
                    userDoc.tasks.push({
                        taskId: bt.taskId,
                        type: 'bonus',
                        completed: false,
                        isBonusTask: true,
                        gameId: gameId,
                        unlockedAt: bt.unlockTime
                    });
                }
                needsSave = true;
            }
        });

        if (needsSave) {
            await userDoc.save();
        }

        res.json({
            success: true,
            data: {
                hasBonusTasks: true,
                gameId: gameId,
                minimumEventThreshold: minimumEventThreshold,
                completionDeadlineHours: 24,
                taskLogic: "sequential",
                bonusTasks: formattedBonusTasks,
                userProgress: {
                    internalEvents: userInternalEvents,
                    eventThresholdMet: userInternalEvents >= minimumEventThreshold,
                    gameDownloadTime: gameDownloadTime
                }
            }
        });
    } catch (error) {
        console.error('Error getting bonus tasks:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get bonus tasks',
            error: error.message
        });
    }
});

// Complete a game task (normal or bonus)
router.post('/:gameId/tasks/:taskId/complete', protect, async (req, res) => {
    try {
        const { gameId, taskId } = req.params;
        const userId = req.user.userId;

        // Verify game exists
        const game = await Game.findById(gameId);
        if (!game) {
            return res.status(404).json({
                success: false,
                message: 'Game not found'
            });
        }

        // Verify task exists and belongs to game
        const task = await GameTask.findOne({ _id: taskId, gameId: gameId, isActive: true });
        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Task not found or inactive'
            });
        }

        // Get user data
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if task is already completed
        const existingTask = user.tasks?.find(t => t.taskId === taskId.toString());
        if (existingTask && existingTask.completed) {
            return res.status(400).json({
                success: false,
                message: 'Task already completed'
            });
        }

        // Get progression rule for this game
        const progressionRule = await TaskProgressionRule.findByGame(gameId);
        
        // Get user's progression data for this game
        const gameIdString = gameId.toString();
        if (!user.taskProgression) {
            user.taskProgression = new Map();
        }
        const progression = user.taskProgression.get(gameIdString) || {
            completedTasks: 0,
            thresholdReached: false,
            rewardTransferred: false,
            coinBoxBalance: 0
        };

        // Get bonus tasks configuration to check if this is a bonus task
        const rule = await WelcomeBonusTimer.findOne({ 
            isActive: true,
            'gameBonusTasks.gameId': gameId,
            'gameBonusTasks.isEnabled': true
        })
        .populate('gameBonusTasks.bonusTasks.taskId')
        .lean();

        let isBonusTask = false;
        let bonusTaskOrder = null;
        let nextBonusTaskUnlocked = false;
        let nextBonusTaskId = null;

        if (rule) {
            const gameBonusConfig = rule.gameBonusTasks.find(
                config => config.gameId.toString() === gameId.toString() && config.isEnabled
            );

            if (gameBonusConfig) {
                const bonusTask = gameBonusConfig.bonusTasks.find(
                    bt => (bt.taskId._id || bt.taskId).toString() === taskId.toString()
                );

                if (bonusTask) {
                    isBonusTask = true;
                    bonusTaskOrder = bonusTask.order;

                    // Check if next bonus task should unlock
                    if (bonusTaskOrder < 3) {
                        const nextBonusTask = gameBonusConfig.bonusTasks.find(
                            bt => bt.order === bonusTaskOrder + 1
                        );

                        if (nextBonusTask) {
                            // Get user's game data for event threshold check
                            const userGame = user.games?.find(g => {
                                if (mongoose.Types.ObjectId.isValid(gameId)) {
                                    return g.gameId === gameId || String(g.gameId) === String(gameId);
                                }
                                return String(g.gameId) === String(gameId);
                            });

                            const userInternalEvents = userGame?.playCount || 0;
                            const minimumEventThreshold = gameBonusConfig.minimumEventThreshold;
                            const eventThresholdMet = userInternalEvents >= minimumEventThreshold;

                            // Next task unlocks if event threshold is met
                            if (eventThresholdMet) {
                                nextBonusTaskUnlocked = true;
                                nextBonusTaskId = (nextBonusTask.taskId._id || nextBonusTask.taskId).toString();
                                
                                // Actually unlock the next bonus task by saving unlock timestamp
                                const nextTaskIdString = nextBonusTaskId;
                                const existingNextTask = user.tasks?.find(t => t.taskId === nextTaskIdString);
                                const unlockTime = new Date();
                                
                                if (existingNextTask) {
                                    if (!existingNextTask.unlockedAt) {
                                        existingNextTask.unlockedAt = unlockTime;
                                        existingNextTask.isBonusTask = true;
                                        existingNextTask.gameId = gameId;
                                    }
                                } else {
                                    if (!user.tasks) {
                                        user.tasks = [];
                                    }
                                    user.tasks.push({
                                        taskId: nextTaskIdString,
                                        type: 'bonus',
                                        completed: false,
                                        isBonusTask: true,
                                        gameId: gameId,
                                        unlockedAt: unlockTime
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        // Mark task as completed in user's tasks array
        if (existingTask) {
            existingTask.completed = true;
            existingTask.completedAt = new Date();
            existingTask.date = new Date();
            if (isBonusTask) {
                existingTask.isBonusTask = true;
                existingTask.gameId = gameId;
            }
        } else {
            if (!user.tasks) {
                user.tasks = [];
            }
            user.tasks.push({
                taskId: taskId.toString(),
                type: isBonusTask ? 'bonus' : 'normal',
                completed: true,
                completedAt: new Date(),
                xpReward: task.rewardValue || 0,
                date: new Date(),
                isBonusTask: isBonusTask,
                gameId: gameId
            });
        }

        // Handle Task Progression Rules and Coin Box
        // Note: progressionRule already declared at line 1011
        let coinBoxAccumulated = false;
        let thresholdReached = false;

        if (progressionRule && !isBonusTask) {
            // Initialize task progression if needed
            if (!user.taskProgression) {
                user.taskProgression = new Map();
            }

            const gameIdString = gameId.toString();
            const progression = user.taskProgression.get(gameIdString) || {
                completedTasks: 0,
                thresholdReached: false,
                rewardTransferred: false,
                coinBoxBalance: 0,
                coinBoxTransferredAt: null
            };

            // Increment completed tasks count
            progression.completedTasks = (progression.completedTasks || 0) + 1;

            // Check if threshold is reached
            if (progression.completedTasks >= progressionRule.minimumEventThreshold) {
                progression.thresholdReached = true;
                thresholdReached = true;
            }

            // If threshold not reached or reward not transferred, accumulate in coin box
            if (!progression.thresholdReached || !progression.rewardTransferred) {
                if (task.rewardType === 'coins') {
                    progression.coinBoxBalance = (progression.coinBoxBalance || 0) + (task.rewardValue || 0);
                    coinBoxAccumulated = true;
                }
            }

            // Save progression
            user.taskProgression.set(gameIdString, progression);
        }

        // Award rewards (to wallet if not in coin box, XP always to wallet)
        if (task.rewardType === 'xp') {
            user.xp.current = (user.xp.current || 0) + (task.rewardValue || 0);
            user.xp.total = (user.xp.total || 0) + (task.rewardValue || 0);
        } else if (task.rewardType === 'coins') {
            // Only add to wallet if not accumulating in coin box
            if (!coinBoxAccumulated) {
                user.wallet.balance = (user.wallet.balance || 0) + (task.rewardValue || 0);
                user.wallet.lastUpdated = new Date();
                
                // Create transaction record for revenue tracking
                let gameDoc = null;
                if (gameId) {
                    gameDoc = await Game.findById(gameId).select('_id gameId').lean();
                }
                
                const transaction = new Transaction({
                    user: user._id,
                    type: 'credit',
                    amount: task.rewardValue || 0,
                    balanceType: 'coins',
                    description: `Game task completed - ${gameId || 'unknown'}`,
                    status: 'completed',
                    referenceId: `GAME-TASK-${gameId || 'unknown'}-${taskId}-${Date.now()}`,
                    gameId: gameDoc?.gameId || gameId || null,
                    game: gameDoc?._id || gameId || null,
                    metadata: {
                        gameId: gameDoc?.gameId || gameId || null,
                        taskId: taskId,
                        taskType: isBonusTask ? 'bonus' : 'normal',
                        rewardType: task.rewardType,
                        source: 'game_task_completion'
                    },
                });
                
                await transaction.save();
            }
        }

        await user.save();

        // Prepare response
        const response = {
            success: true,
            message: 'Task completed successfully',
            data: {
                taskId: taskId,
                taskName: task.name,
                isBonusTask: isBonusTask,
                reward: {
                    type: task.rewardType,
                    value: task.rewardValue
                },
                nextBonusTaskUnlocked: nextBonusTaskUnlocked,
                coinBoxAccumulated: coinBoxAccumulated,
                thresholdReached: thresholdReached
            }
        };

        // Add coin box info if applicable
        if (progressionRule && !isBonusTask) {
            const gameIdString = gameId.toString();
            const progression = user.taskProgression?.get(gameIdString);
            if (progression) {
                response.data.coinBox = {
                    balance: progression.coinBoxBalance || 0,
                    thresholdReached: progression.thresholdReached || false,
                    rewardTransferred: progression.rewardTransferred || false,
                    canTransfer: (progression.thresholdReached && !progression.rewardTransferred && progression.coinBoxBalance > 0)
                };
            }
        }

        if (nextBonusTaskUnlocked && nextBonusTaskId) {
            response.data.nextBonusTask = {
                taskId: nextBonusTaskId,
                message: 'Next bonus task unlocked! You have 24 hours to complete it.'
            };
        } else if (isBonusTask && bonusTaskOrder < 3) {
            // Get user's game data for event threshold info
            const userGame = user.games?.find(g => {
                if (mongoose.Types.ObjectId.isValid(gameId)) {
                    return g.gameId === gameId || String(g.gameId) === String(gameId);
                }
                return String(g.gameId) === String(gameId);
            });

            const userInternalEvents = userGame?.playCount || 0;
            const gameBonusConfig = rule.gameBonusTasks.find(
                config => config.gameId.toString() === gameId.toString() && config.isEnabled
            );
            const minimumEventThreshold = gameBonusConfig?.minimumEventThreshold || 0;

            response.data.nextBonusTask = {
                message: `Reach ${minimumEventThreshold} internal events to unlock next bonus task (current: ${userInternalEvents})`
            };
        }

        res.json(response);
    } catch (error) {
        console.error('Error completing task:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to complete task',
            error: error.message
        });
    }
});

// Get My Coin Box status for a game
router.get('/:gameId/coin-box', protect, async (req, res) => {
    try {
        const { gameId } = req.params;
        const userId = req.user.userId;

        // Verify game exists
        const game = await Game.findById(gameId);
        if (!game) {
            return res.status(404).json({
                success: false,
                message: 'Game not found'
            });
        }

        // Get user data
        const user = await User.findById(userId).select('taskProgression wallet');
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Get progression rule
        const rule = await TaskProgressionRule.findByGame(gameId);

        if (!rule) {
            return res.json({
                success: true,
                data: {
                    hasProgressionRule: false,
                    coinBoxBalance: 0,
                    thresholdReached: false,
                    rewardTransferred: false,
                    canTransfer: false,
                    minimumEventThreshold: null,
                    completedTasks: 0
                }
            });
        }

        // Get user's progression data for this game
        const gameIdString = gameId.toString();
        const progression = user.taskProgression?.get(gameIdString) || {
            completedTasks: 0,
            thresholdReached: false,
            rewardTransferred: false,
            coinBoxBalance: 0,
            coinBoxTransferredAt: null
        };

        const completedTasks = progression.completedTasks || 0;
        const thresholdReached = progression.thresholdReached || false;
        const rewardTransferred = progression.rewardTransferred || false;
        const coinBoxBalance = progression.coinBoxBalance || 0;

        // Check if user can transfer
        const canTransfer = thresholdReached && !rewardTransferred && coinBoxBalance > 0;

        res.json({
            success: true,
            data: {
                hasProgressionRule: true,
                gameId: gameId,
                minimumEventThreshold: rule.minimumEventThreshold,
                completedTasks: completedTasks,
                thresholdReached: thresholdReached,
                rewardTransferred: rewardTransferred,
                coinBoxBalance: coinBoxBalance,
                canTransfer: canTransfer,
                progress: {
                    completed: completedTasks,
                    required: rule.minimumEventThreshold,
                    percentage: Math.min(100, Math.round((completedTasks / rule.minimumEventThreshold) * 100))
                }
            }
        });
    } catch (error) {
        console.error('Error getting coin box status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get coin box status',
            error: error.message
        });
    }
});

// Transfer rewards from My Coin Box to wallet
router.post('/:gameId/coin-box/transfer', protect, async (req, res) => {
    try {
        const { gameId } = req.params;
        const userId = req.user.userId;

        // Verify game exists
        const game = await Game.findById(gameId);
        if (!game) {
            return res.status(404).json({
                success: false,
                message: 'Game not found'
            });
        }

        // Get user data
        const user = await User.findById(userId).select('taskProgression wallet');
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Get progression rule
        const rule = await TaskProgressionRule.findByGame(gameId);

        if (!rule) {
            return res.status(404).json({
                success: false,
                message: 'No progression rule configured for this game'
            });
        }

        // Get user's progression data for this game
        const gameIdString = gameId.toString();
        if (!user.taskProgression) {
            user.taskProgression = new Map();
        }

        const progression = user.taskProgression.get(gameIdString) || {
            completedTasks: 0,
            thresholdReached: false,
            rewardTransferred: false,
            coinBoxBalance: 0,
            coinBoxTransferredAt: null
        };

        // Check if threshold is reached
        if (!progression.thresholdReached) {
            return res.status(400).json({
                success: false,
                message: `Complete ${rule.minimumEventThreshold} tasks first to unlock transfer (current: ${progression.completedTasks || 0})`
            });
        }

        // Check if already transferred
        if (progression.rewardTransferred) {
            return res.status(400).json({
                success: false,
                message: 'Rewards have already been transferred'
            });
        }

        // Check if there's balance to transfer
        const coinBoxBalance = progression.coinBoxBalance || 0;
        if (coinBoxBalance <= 0) {
            return res.status(400).json({
                success: false,
                message: 'No rewards to transfer'
            });
        }

        // Transfer to wallet
        user.wallet.balance = (user.wallet.balance || 0) + coinBoxBalance;
        user.wallet.lastUpdated = new Date();

        // Update progression
        progression.rewardTransferred = true;
        progression.coinBoxTransferredAt = new Date();
        user.taskProgression.set(gameIdString, progression);

        // Create transaction record for revenue tracking
        let gameDoc = null;
        if (gameId) {
            gameDoc = await Game.findById(gameId).select('_id gameId').lean();
        }
        
        const transaction = new Transaction({
            user: user._id,
            type: 'credit',
            amount: coinBoxBalance,
            balanceType: 'coins',
            description: `Coin box transfer - ${gameId || 'unknown'}`,
            status: 'completed',
            referenceId: `COIN-BOX-${gameId || 'unknown'}-${Date.now()}`,
            gameId: gameDoc?.gameId || gameId || null,
            game: gameDoc?._id || gameId || null,
            metadata: {
                gameId: gameDoc?.gameId || gameId || null,
                source: 'coin_box_transfer',
                coinBoxBalance: coinBoxBalance,
                thresholdReached: progression.thresholdReached
            },
        });

        await Promise.all([
            user.save(),
            transaction.save()
        ]);

        res.json({
            success: true,
            message: 'Rewards transferred successfully',
            data: {
                transferredAmount: coinBoxBalance,
                newWalletBalance: user.wallet.balance,
                transferredAt: progression.coinBoxTransferredAt
            }
        });
    } catch (error) {
        console.error('Error transferring coin box:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to transfer rewards',
            error: error.message
        });
    }
});

module.exports = router;
