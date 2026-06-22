const { getDb } = require('../database');

async function getMyNotifications(req, res) {
  const { prepare } = await getDb();
  const notifications = prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY sent_at DESC').all(req.user.id);
  res.json(notifications);
}

async function markAsRead(req, res) {
  const { id } = req.params;
  const { prepare, save } = await getDb();
  prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(id, req.user.id);
  save();
  res.json({ message: 'تم التحديث' });
}

async function markAllAsRead(req, res) {
  const { prepare, save } = await getDb();
  prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);
  save();
  res.json({ message: 'تم تحديد الكل كمقروء' });
}

async function deleteNotification(req, res) {
  const { id } = req.params;
  const { prepare, save } = await getDb();
  prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?').run(id, req.user.id);
  save();
  res.json({ message: 'تم الحذف' });
}

async function createNotification(userId, type, title, message) {
  const { prepare, save } = await getDb();
  prepare('INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)').run(userId, type, title, message);
  save();
}

async function getSettings(req, res) {
  const { prepare } = await getDb();
  let settings = prepare('SELECT * FROM notification_settings WHERE id = 1').get();
  if (!settings) {
    prepare('INSERT INTO notification_settings (id) VALUES (1)').run();
    const { save } = await getDb();
    save();
    settings = prepare('SELECT * FROM notification_settings WHERE id = 1').get();
  }
  res.json(settings);
}

async function updateSettings(req, res) {
  const { reminder_before_hours, enable_push, enable_email, enable_sms } = req.body;
  const { prepare, save } = await getDb();
  prepare('UPDATE notification_settings SET reminder_before_hours = ?, enable_push = ?, enable_email = ?, enable_sms = ? WHERE id = 1').run(
    reminder_before_hours || 1,
    enable_push != null ? (enable_push ? 1 : 0) : 1,
    enable_email != null ? (enable_email ? 1 : 0) : 0,
    enable_sms != null ? (enable_sms ? 1 : 0) : 0
  );
  save();
  const settings = prepare('SELECT * FROM notification_settings WHERE id = 1').get();
  res.json(settings);
}

async function getUnreadCount(req, res) {
  const { prepare } = await getDb();
  const row = prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user.id);
  res.json({ count: row.count });
}

module.exports = { getMyNotifications, markAsRead, markAllAsRead, deleteNotification, createNotification, getSettings, updateSettings, getUnreadCount };
