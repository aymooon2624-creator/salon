const express = require('express');
const router = express.Router();
const { getPoints, getHistory, getRewards, redeem } = require('../controllers/loyaltyController');
const { authenticateToken } = require('../middleware/auth');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/points', authenticateToken, asyncHandler(getPoints));
router.get('/history', authenticateToken, asyncHandler(getHistory));
router.get('/rewards', asyncHandler(getRewards));
router.post('/redeem', authenticateToken, asyncHandler(redeem));

module.exports = router;
