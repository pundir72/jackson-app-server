const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { getToday, claim } = require('../controllers/dailyRewardController');

router.get('/today', protect, getToday);
router.post('/claim', protect, claim);

module.exports = router;