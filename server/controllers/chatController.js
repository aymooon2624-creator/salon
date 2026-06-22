const { getDb } = require('../database');
const { createNotification } = require('./notificationController');

async function getConversation(req, res) {
  const { userId } = req.params;
  const { prepare } = await getDb();
  const messages = prepare(`
    SELECT cm.*, u.username as sender_name
    FROM chat_messages cm
    JOIN users u ON cm.sender_id = u.id
    WHERE (cm.sender_id = ? AND cm.receiver_id = ?) OR (cm.sender_id = ? AND cm.receiver_id = ?)
    ORDER BY cm.created_at ASC
  `).all(req.user.id, userId, userId, req.user.id);
  res.json(messages);
}

async function sendMessage(req, res) {
  const { receiver_id, message } = req.body;
  if (!receiver_id || !message) {
    return res.status(400).json({ error: 'المستلم والرسالة مطلوبان' });
  }

  const { prepare, save } = await getDb();
  const result = prepare('INSERT INTO chat_messages (sender_id, receiver_id, message) VALUES (?, ?, ?)').run(
    req.user.id, receiver_id, message
  );
  save();

  const sender = prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
  await createNotification(receiver_id, 'chat', `💬 رسالة جديدة من ${sender.username}`, message);

  const msg = prepare('SELECT cm.*, u.username as sender_name FROM chat_messages cm JOIN users u ON cm.sender_id = u.id WHERE cm.id = ?').get(result.lastInsertRowid);
  res.status(201).json(msg);
}

async function markAsRead(req, res) {
  const { id } = req.params;
  const { prepare, save } = await getDb();
  prepare('UPDATE chat_messages SET is_read = 1 WHERE id = ? AND receiver_id = ?').run(id, req.user.id);
  save();
  res.json({ message: 'تم' });
}

async function getUnreadCount(req, res) {
  const { prepare } = await getDb();
  const row = prepare('SELECT COUNT(*) as count FROM chat_messages WHERE receiver_id = ? AND is_read = 0').get(req.user.id);
  res.json({ count: row.count });
}

async function getConversations(req, res) {
  const { prepare } = await getDb();

  const isAdmin = req.user.role === 'admin';
  let usersList;
  if (isAdmin) {
    usersList = prepare(`
      SELECT DISTINCT u.id, u.username,
        (SELECT message FROM chat_messages WHERE (sender_id = u.id AND receiver_id = 1) OR (sender_id = 1 AND receiver_id = u.id) ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT created_at FROM chat_messages WHERE (sender_id = u.id AND receiver_id = 1) OR (sender_id = 1 AND receiver_id = u.id) ORDER BY created_at DESC LIMIT 1) as last_time,
        (SELECT COUNT(*) FROM chat_messages WHERE sender_id = u.id AND receiver_id = 1 AND is_read = 0) as unread
      FROM users u
      WHERE u.id IN (
        SELECT DISTINCT CASE WHEN sender_id = 1 THEN receiver_id ELSE sender_id END
        FROM chat_messages
      ) AND u.id != 1
      ORDER BY last_time DESC
    `).all();
  } else {
    usersList = prepare(`
      SELECT u.id, u.username,
        (SELECT message FROM chat_messages WHERE (sender_id = ? AND receiver_id = u.id) OR (sender_id = u.id AND receiver_id = ?) ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT created_at FROM chat_messages WHERE (sender_id = ? AND receiver_id = u.id) OR (sender_id = u.id AND receiver_id = ?) ORDER BY created_at DESC LIMIT 1) as last_time,
        (SELECT COUNT(*) FROM chat_messages WHERE sender_id = u.id AND receiver_id = ? AND is_read = 0) as unread
      FROM users u
      WHERE u.role = 'admin'
    `).all(req.user.id, req.user.id, req.user.id, req.user.id, req.user.id);
  }

  res.json(usersList);
}

module.exports = { getConversation, sendMessage, markAsRead, getUnreadCount, getConversations };
