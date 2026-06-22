const express = require('express');
const router = express.Router();
const { getStatus, updateStatus } = require('../controllers/statusController');
const { authenticateToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/', asyncHandler(getStatus));
router.put('/', authenticateToken, requireAdmin, asyncHandler(updateStatus));

module.exports = router;
