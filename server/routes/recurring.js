const express = require('express');
const router = express.Router();
const { create, getMy, getAll, update, remove } = require('../controllers/recurringController');
const { authenticateToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/admin', authenticateToken, requireAdmin, asyncHandler(getAll));
router.get('/', authenticateToken, asyncHandler(getMy));
router.post('/', authenticateToken, asyncHandler(create));
router.put('/:id', authenticateToken, asyncHandler(update));
router.delete('/:id', authenticateToken, asyncHandler(remove));

module.exports = router;
