const Deal = require('../models/Deal');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const logger = require('../utils/logger');

// List deals with filters
const getDeals = async (req, res) => {
  try {
    const { page = 1, limit = 10, category, storeName, featured, vipOnly } = req.query;
    const skip = (page - 1) * limit;

    const query = {};
    if (category) query.category = category;
    if (storeName) query.storeName = new RegExp(storeName, 'i');
    if (featured !== undefined) query.isFeatured = featured === 'true';
    if (vipOnly !== undefined) query.isVipOnly = vipOnly === 'true';

    // Only active and within date range
    const now = new Date();
    query.isActive = true;
    query.startDate = { $lte: now };
    query.endDate = { $gte: now };

    const deals = await Deal.find(query)
      .sort({ priority: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Deal.countDocuments(query);

    res.status(200).json({
      success: true,
      message: 'Deals retrieved successfully',
      data: {
        deals,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: parseInt(limit),
          hasNextPage: page * limit < total,
          hasPrevPage: page > 1,
        },
      },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error getting deals:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve deals', statusCode: 500 });
  }
};

// Featured deals
const getFeaturedDeals = async (req, res) => {
  try {
    const deals = await Deal.findFeatured();
    res.status(200).json({ success: true, message: 'Featured deals retrieved successfully', data: { deals }, statusCode: 200 });
  } catch (error) {
    logger.error('Error getting featured deals:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve featured deals', statusCode: 500 });
  }
};

// Deals by category
const getDealsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const deals = await Deal.findByCategory(category);
    res.status(200).json({ success: true, message: 'Deals by category retrieved successfully', data: { deals }, statusCode: 200 });
  } catch (error) {
    logger.error('Error getting deals by category:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve deals by category', statusCode: 500 });
  }
};

// Deals by store
const getDealsByStore = async (req, res) => {
  try {
    const { storeName } = req.params;
    const deals = await Deal.findByStore(storeName);
    res.status(200).json({ success: true, message: 'Deals by store retrieved successfully', data: { deals }, statusCode: 200 });
  } catch (error) {
    logger.error('Error getting deals by store:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve deals by store', statusCode: 500 });
  }
};

// Nearby deals (location-based)
const getNearbyDeals = async (req, res) => {
  try {
    const { latitude, longitude, radius = 10 } = req.query;
    if (!latitude || !longitude) {
      return res.status(400).json({ success: false, message: 'latitude and longitude are required', statusCode: 400 });
    }
    const deals = await Deal.findNearby(parseFloat(latitude), parseFloat(longitude), parseFloat(radius));
    res.status(200).json({ success: true, message: 'Nearby deals retrieved successfully', data: { deals }, statusCode: 200 });
  } catch (error) {
    logger.error('Error getting nearby deals:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve nearby deals', statusCode: 500 });
  }
};

// Get deal by id
const getDealById = async (req, res) => {
  try {
    const { id } = req.params;
    const deal = await Deal.findById(id);
    if (!deal) {
      return res.status(404).json({ success: false, message: 'Deal not found', statusCode: 404 });
    }
    res.status(200).json({ success: true, message: 'Deal retrieved successfully', data: { deal }, statusCode: 200 });
  } catch (error) {
    logger.error('Error getting deal by id:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve deal', statusCode: 500 });
  }
};

// Use a deal (apply rewards)
const useDeal = async (req, res) => {
  try {
    const { id } = req.params;
    const { purchaseAmount } = req.body;
    const userId = req.user.id;

    if (purchaseAmount === undefined || purchaseAmount < 0) {
      return res.status(400).json({ success: false, message: 'purchaseAmount is required and must be >= 0', statusCode: 400 });
    }

    const [deal, user] = await Promise.all([
      Deal.findById(id),
      User.findById(userId),
    ]);

    if (!deal) {
      return res.status(404).json({ success: false, message: 'Deal not found', statusCode: 404 });
    }
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found', statusCode: 404 });
    }
    if (!deal.canBeUsedByUser(user)) {
      return res.status(403).json({ success: false, message: 'You are not eligible to use this deal', statusCode: 403 });
    }

    // Check minimum purchase
    if (deal.minimumPurchase && purchaseAmount < deal.minimumPurchase) {
      return res.status(400).json({ success: false, message: `Minimum purchase is ${deal.minimumPurchase}`, statusCode: 400 });
    }

    const rewards = deal.calculateRewards(purchaseAmount, user);

    // Update user balances
    await user.addPoints(rewards.points);
    await user.addCashback(rewards.cashback);

    // Update wallet
    let wallet = await Wallet.findByUserId(userId);
    if (!wallet) {
      wallet = await Wallet.createForUser(userId);
    }
    if (rewards.cashback > 0) {
      await wallet.addFunds(rewards.cashback, 'deal');
    }

    // Record deal usage
    await deal.recordUsage(userId, purchaseAmount, rewards);

    res.status(200).json({
      success: true,
      message: 'Deal used successfully',
      data: {
        deal: { id: deal._id, title: deal.title },
        rewards,
        userStats: { totalPoints: user.totalPoints, totalCashback: user.totalCashback },
      },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error using deal:', error);
    res.status(500).json({ success: false, message: 'Failed to use deal', statusCode: 500 });
  }
};

// Admin: create deal
const createDeal = async (req, res) => {
  try {
    const deal = await Deal.create(req.body);
    res.status(201).json({ success: true, message: 'Deal created', data: { deal }, statusCode: 201 });
  } catch (error) {
    logger.error('Error creating deal:', error);
    res.status(500).json({ success: false, message: 'Failed to create deal', statusCode: 500 });
  }
};

// Admin: update deal
const updateDeal = async (req, res) => {
  try {
    const { id } = req.params;
    const deal = await Deal.findByIdAndUpdate(id, req.body, { new: true });
    if (!deal) return res.status(404).json({ success: false, message: 'Deal not found', statusCode: 404 });
    res.status(200).json({ success: true, message: 'Deal updated', data: { deal }, statusCode: 200 });
  } catch (error) {
    logger.error('Error updating deal:', error);
    res.status(500).json({ success: false, message: 'Failed to update deal', statusCode: 500 });
  }
};

// Admin: delete deal
const deleteDeal = async (req, res) => {
  try {
    const { id } = req.params;
    const deal = await Deal.findByIdAndDelete(id);
    if (!deal) return res.status(404).json({ success: false, message: 'Deal not found', statusCode: 404 });
    res.status(200).json({ success: true, message: 'Deal deleted', data: { id }, statusCode: 200 });
  } catch (error) {
    logger.error('Error deleting deal:', error);
    res.status(500).json({ success: false, message: 'Failed to delete deal', statusCode: 500 });
  }
};

// Admin: toggle featured
const toggleDealFeatured = async (req, res) => {
  try {
    const { id } = req.params;
    const deal = await Deal.findById(id);
    if (!deal) return res.status(404).json({ success: false, message: 'Deal not found', statusCode: 404 });
    deal.isFeatured = !deal.isFeatured;
    await deal.save();
    res.status(200).json({ success: true, message: `Deal ${deal.isFeatured ? 'featured' : 'unfeatured'} successfully`, data: { deal }, statusCode: 200 });
  } catch (error) {
    logger.error('Error toggling deal featured:', error);
    res.status(500).json({ success: false, message: 'Failed to toggle deal featured', statusCode: 500 });
  }
};

// Admin: toggle active
const toggleDealActive = async (req, res) => {
  try {
    const { id } = req.params;
    const deal = await Deal.findById(id);
    if (!deal) return res.status(404).json({ success: false, message: 'Deal not found', statusCode: 404 });
    deal.isActive = !deal.isActive;
    await deal.save();
    res.status(200).json({ success: true, message: `Deal ${deal.isActive ? 'activated' : 'deactivated'} successfully`, data: { deal }, statusCode: 200 });
  } catch (error) {
    logger.error('Error toggling deal active:', error);
    res.status(500).json({ success: false, message: 'Failed to toggle deal active', statusCode: 500 });
  }
};

module.exports = {
  getDeals,
  getFeaturedDeals,
  getDealsByCategory,
  getDealsByStore,
  getNearbyDeals,
  getDealById,
  useDeal,
  createDeal,
  updateDeal,
  deleteDeal,
  toggleDealFeatured,
  toggleDealActive,
};