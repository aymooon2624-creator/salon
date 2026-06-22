const express = require('express');
const router = express.Router();
const { getDaily, getWeekly, getMonthly } = require('../controllers/reportController');
const { authenticateToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/daily', authenticateToken, requireAdmin, asyncHandler(getDaily));
router.get('/weekly', authenticateToken, requireAdmin, asyncHandler(getWeekly));
router.get('/monthly', authenticateToken, requireAdmin, asyncHandler(getMonthly));

module.exports = router;
