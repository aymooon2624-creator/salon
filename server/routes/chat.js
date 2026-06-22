const express = require('express');
const router = express.Router();
const { getConversation, sendMessage, markAsRead, getUnreadCount, getConversations } = require('../controllers/chatController');
const { authenticateToken } = require('../middleware/auth');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/conversations', authenticateToken, asyncHandler(getConversations));
router.get('/unread', authenticateToken, asyncHandler(getUnreadCount));
router.get('/:userId', authenticateToken, asyncHandler(getConversation));
router.post('/', authenticateToken, asyncHandler(sendMessage));
router.put('/:id/read', authenticateToken, asyncHandler(markAsRead));

module.exports = router;
