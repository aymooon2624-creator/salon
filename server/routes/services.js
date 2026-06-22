const express = require('express');
const router = express.Router();
const { getAll, create, update, remove } = require('../controllers/serviceController');
const { authenticateToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/', authenticateToken, asyncHandler(getAll));
router.post('/', authenticateToken, requireAdmin, asyncHandler(create));
router.put('/:id', authenticateToken, requireAdmin, asyncHandler(update));
router.delete('/:id', authenticateToken, requireAdmin, asyncHandler(remove));

module.exports = router;
