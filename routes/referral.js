const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const Referral = require('../models/Referral');
const User = require('../models/User');
const config = require('../config/config');

/**
 * @route   GET /api/referral/code
 * @desc    Get user's referral code (generates if doesn't exist)
 * @access  Private
 */
router.get('/code', protect, async (req, res) => {
    try {
        const referralCode = await Referral.getUserReferralCode(req.user.userId);
        
        // Get user info for share messages
        const user = await User.findById(req.user.userId).select('firstName lastName');
        
        // Find the referral entry
        const referral = await Referral.findOne({ 
            referralCode,
            referrer: req.user.userId 
        });
        
        const baseUrl = process.env.APP_BASE_URL || 'https://jackson.app';
        const shareableLink = referral.generateShareableLink(baseUrl);
        const shareMessages = referral.getShareMessages(user.firstName);
        
        res.json({
            success: true,
            data: {
                referralCode,
                shareableLink,
                shareMessages,
                expiresAt: referral.expiresAt
            }
        });
    } catch (error) {
        console.error('Error getting referral code:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get referral code',
            message: error.message
        });
    }
});

/**
 * @route   POST /api/referral/validate
 * @desc    Validate a referral code
 * @access  Public
 */
router.post('/validate', async (req, res) => {
    try {
        const { referralCode } = req.body;
        
        if (!referralCode) {
            return res.status(400).json({
                success: false,
                error: 'Referral code is required'
            });
        }
        
        // Find the referral by code
        const referral = await Referral.findOne({ 
            referralCode: referralCode.toUpperCase(),
            status: 'pending'
        }).populate('referrer', 'firstName lastName username');
        
        if (!referral) {
            return res.status(404).json({
                success: false,
                error: 'Invalid referral code',
                valid: false
            });
        }
        
        // Check if expired
        if (referral.expiresAt && referral.expiresAt < new Date()) {
            referral.status = 'expired';
            await referral.save();
            
            return res.status(400).json({
                success: false,
                error: 'Referral code has expired',
                valid: false
            });
        }
        
        res.json({
            success: true,
            valid: true,
            data: {
                referralCode: referral.referralCode,
                referrerName: referral.referrer.firstName,
                rewards: {
                    xp: 50,
                    badge: 'Premium Badge'
                },
                expiresAt: referral.expiresAt
            }
        });
    } catch (error) {
        console.error('Error validating referral code:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to validate referral code',
            message: error.message
        });
    }
});

/**
 * @route   GET /api/referral/history
 * @desc    Get user's referral history
 * @access  Private
 */
router.get('/history', protect, async (req, res) => {
    try {
        const { page = 1, limit = 10, status } = req.query;
        
        const query = { referrer: req.user.userId };
        if (status) {
            query.status = status;
        }
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const [referrals, total] = await Promise.all([
            Referral.find(query)
                .populate('referee', 'firstName lastName email username')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Referral.countDocuments(query)
        ]);
        
        // Format the response
        const formattedReferrals = referrals.map(ref => ({
            id: ref._id,
            referralCode: ref.referralCode,
            status: ref.status,
            referee: ref.referee ? {
                id: ref.referee._id,
                name: `${ref.referee.firstName} ${ref.referee.lastName}`,
                username: ref.referee.username
            } : null,
            rewards: {
                xpAwarded: ref.rewards.referrerRewarded ? ref.rewards.xpAmount : 0,
                badgeAwarded: ref.rewards.badgeAwarded
            },
            createdAt: ref.createdAt,
            completedAt: ref.completedAt,
            expiresAt: ref.expiresAt,
            source: ref.metadata?.source
        }));
        
        res.json({
            success: true,
            data: {
                referrals: formattedReferrals,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            }
        });
    } catch (error) {
        console.error('Error getting referral history:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get referral history',
            message: error.message
        });
    }
});

/**
 * @route   GET /api/referral/stats
 * @desc    Get user's referral statistics
 * @access  Private
 */
router.get('/stats', protect, async (req, res) => {
    try {
        const stats = await Referral.getUserStats(req.user.userId);
        
        // Get user's Premium Badge status
        const user = await User.findById(req.user.userId).select('badges');
        const hasPremiumBadge = user.badges.some(b => b.name === 'Premium Badge');
        
        res.json({
            success: true,
            data: {
                ...stats,
                hasPremiumBadge,
                rewards: {
                    xpPerReferral: 50,
                    badge: 'Premium Badge'
                }
            }
        });
    } catch (error) {
        console.error('Error getting referral stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get referral stats',
            message: error.message
        });
    }
});

/**
 * @route   POST /api/referral/share
 * @desc    Track when user shares their referral link
 * @access  Private
 */
router.post('/share', protect, async (req, res) => {
    try {
        const { source } = req.body; // facebook, twitter, linkedin, messenger, sms, copy_link
        
        if (!source) {
            return res.status(400).json({
                success: false,
                error: 'Share source is required'
            });
        }
        
        // Get user's referral code
        const referralCode = await Referral.getUserReferralCode(req.user.userId);
        
        // Find the referral
        const referral = await Referral.findOne({ 
            referralCode,
            referrer: req.user.userId,
            status: 'pending'
        });
        
        if (referral) {
            // Update metadata to track share source (for analytics)
            if (!referral.metadata) {
                referral.metadata = {};
            }
            referral.metadata.lastSharedVia = source;
            referral.metadata.lastSharedAt = new Date();
            
            await referral.save();
        }
        
        res.json({
            success: true,
            message: 'Share tracked successfully',
            data: {
                source,
                referralCode
            }
        });
    } catch (error) {
        console.error('Error tracking share:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to track share',
            message: error.message
        });
    }
});

/**
 * @route   GET /api/referral/link
 * @desc    Generate and get shareable referral link with messages
 * @access  Private
 */
router.get('/link', protect, async (req, res) => {
    try {
        const { platform } = req.query; // facebook, twitter, linkedin, messenger, sms, whatsapp
        
        // Get user's referral code
        const referralCode = await Referral.getUserReferralCode(req.user.userId);
        
        // Get user info
        const user = await User.findById(req.user.userId).select('firstName lastName');
        
        // Find the referral entry
        const referral = await Referral.findOne({ 
            referralCode,
            referrer: req.user.userId 
        });
        
        const baseUrl = process.env.APP_BASE_URL || 'https://jackson.app';
        const shareableLink = referral.generateShareableLink(baseUrl);
        const shareMessages = referral.getShareMessages(user.firstName);
        
        // Get specific platform message if requested
        const message = platform && shareMessages[platform] 
            ? shareMessages[platform] 
            : shareMessages.default;
        
        res.json({
            success: true,
            data: {
                referralCode,
                link: shareableLink,
                message,
                allMessages: shareMessages,
                expiresAt: referral.expiresAt
            }
        });
    } catch (error) {
        console.error('Error generating referral link:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate referral link',
            message: error.message
        });
    }
});

/**
 * @route   GET /api/referral/leaderboard
 * @desc    Get top referrers leaderboard
 * @access  Private
 */
router.get('/leaderboard', protect, async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        
        const topReferrers = await Referral.aggregate([
            {
                $match: { status: 'completed' }
            },
            {
                $group: {
                    _id: '$referrer',
                    totalReferrals: { $sum: 1 },
                    totalXPEarned: { $sum: '$rewards.xpAmount' }
                }
            },
            {
                $sort: { totalReferrals: -1 }
            },
            {
                $limit: parseInt(limit)
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'user'
                }
            },
            {
                $unwind: '$user'
            },
            {
                $project: {
                    userId: '$_id',
                    name: { $concat: ['$user.firstName', ' ', '$user.lastName'] },
                    username: '$user.username',
                    totalReferrals: 1,
                    totalXPEarned: 1
                }
            }
        ]);
        
        // Check current user's rank
        const userRank = await Referral.aggregate([
            {
                $match: { status: 'completed' }
            },
            {
                $group: {
                    _id: '$referrer',
                    totalReferrals: { $sum: 1 }
                }
            },
            {
                $sort: { totalReferrals: -1 }
            }
        ]);
        
        const currentUserIndex = userRank.findIndex(
            r => r._id.toString() === req.user.userId.toString()
        );
        
        res.json({
            success: true,
            data: {
                leaderboard: topReferrers,
                currentUserRank: currentUserIndex >= 0 ? currentUserIndex + 1 : null,
                currentUserReferrals: currentUserIndex >= 0 ? userRank[currentUserIndex].totalReferrals : 0
            }
        });
    } catch (error) {
        console.error('Error getting referral leaderboard:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get referral leaderboard',
            message: error.message
        });
    }
});

module.exports = router;


