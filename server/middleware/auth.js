const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'salon-app-secret-key-2024';

function parseCookies(req) {
  const cookie = req.headers.cookie;
  if (!cookie) return {};
  return cookie.split(';').reduce((acc, c) => {
    const [k, v] = c.trim().split('=');
    acc[k] = v;
    return acc;
  }, {});
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.split(' ')[1]) || parseCookies(req)['token'];

  if (!token) {
    return res.status(401).json({ error: 'مطلوب تسجيل الدخول' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'الرمز غير صالح أو منتهي الصلاحية' });
    }
    req.user = user;
    next();
  });
}

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

module.exports = { authenticateToken, generateToken };
