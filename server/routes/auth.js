const express = require('express');
const router = express.Router();
const { register, login, getMe } = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.post('/register', asyncHandler(register));
router.post('/login', asyncHandler(login));
router.post('/logout', (req, res) => {
  res.clearCookie('token', { path: '/' });
  res.json({ ok: true });
});
router.get('/me', authenticateToken, asyncHandler(getMe));

module.exports = router;
