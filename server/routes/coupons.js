const express = require('express');
const router = express.Router();
const { getActive, getAll, create, update, validate, apply, getStats } = require('../controllers/couponController');
const { authenticateToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/active', asyncHandler(getActive));
router.get('/admin', authenticateToken, requireAdmin, asyncHandler(getAll));
router.get('/stats', authenticateToken, requireAdmin, asyncHandler(getStats));
router.post('/validate', authenticateToken, asyncHandler(validate));
router.post('/apply', authenticateToken, asyncHandler(apply));
router.post('/', authenticateToken, requireAdmin, asyncHandler(create));
router.put('/:id', authenticateToken, requireAdmin, asyncHandler(update));

module.exports = router;
