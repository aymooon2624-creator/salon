const express = require('express');
const router = express.Router();
const { getAll, getAllAdmin, create, update, remove } = require('../controllers/productController');
const { authenticateToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/', asyncHandler(getAll));
router.get('/admin', authenticateToken, requireAdmin, asyncHandler(getAllAdmin));
router.post('/', authenticateToken, requireAdmin, asyncHandler(create));
router.put('/:id', authenticateToken, requireAdmin, asyncHandler(update));
router.delete('/:id', authenticateToken, requireAdmin, asyncHandler(remove));

module.exports = router;
