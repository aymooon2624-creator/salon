const bcrypt = require('bcryptjs');
const { getDb } = require('../database');
const { generateToken } = require('../middleware/auth');

async function register(req, res) {
  const { username, password, phone } = req.body;

  if (!username || !password || !phone) {
    return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
  }
  if (username.length < 3) {
    return res.status(400).json({ error: 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
  }

  const { prepare, save } = await getDb();
  const existing = prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(400).json({ error: 'اسم المستخدم موجود مسبقاً' });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  const result = prepare('INSERT INTO users (username, password, phone) VALUES (?, ?, ?)').run(username, hashedPassword, phone);
  save();

  const user = { id: result.lastInsertRowid, username, role: 'customer' };
  const token = generateToken(user);

  res.status(201).json({ token, user: { id: user.id, username: user.username, role: user.role } });
}

async function login(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
  }

  const { prepare } = await getDb();
  const user = prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  }

  const token = generateToken(user);
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, phone: user.phone } });
}

async function getMe(req, res) {
  const { prepare } = await getDb();
  const user = prepare('SELECT id, username, phone, role, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'المستخدم غير موجود' });
  }
  res.json(user);
}

module.exports = { register, login, getMe };
