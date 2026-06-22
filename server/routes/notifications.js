const express = require('express');
const router = express.Router();
const { getMyNotifications, markAsRead, markAllAsRead, deleteNotification, getSettings, updateSettings, getUnreadCount } = require('../controllers/notificationController');
const { authenticateToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/', authenticateToken, asyncHandler(getMyNotifications));
router.get('/unread', authenticateToken, asyncHandler(getUnreadCount));
router.get('/settings', authenticateToken, requireAdmin, asyncHandler(getSettings));
router.put('/settings', authenticateToken, requireAdmin, asyncHandler(updateSettings));
router.put('/read-all', authenticateToken, asyncHandler(markAllAsRead));
router.put('/:id/read', authenticateToken, asyncHandler(markAsRead));
router.delete('/:id', authenticateToken, asyncHandler(deleteNotification));

module.exports = router;
