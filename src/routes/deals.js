const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
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
} = require('../controllers/dealsController');

// Public listing (but in server we mount with auth; keep consistent)
router.get('/', protect, getDeals);
router.get('/featured', protect, getFeaturedDeals);
router.get('/category/:category', protect, getDealsByCategory);
router.get('/store/:storeName', protect, getDealsByStore);
router.get('/nearby', protect, getNearbyDeals);

// Deal detail and usage
router.get('/:id', protect, getDealById);
router.post('/:id/use', protect, useDeal);

// Admin operations (should be protected with admin middleware in prod)
router.post('/', protect, createDeal);
router.put('/:id', protect, updateDeal);
router.delete('/:id', protect, deleteDeal);
router.patch('/:id/toggle-featured', protect, toggleDealFeatured);
router.patch('/:id/toggle-active', protect, toggleDealActive);

module.exports = router;