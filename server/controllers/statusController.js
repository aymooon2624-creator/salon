const { getDb } = require('../database');

async function getStatus(req, res) {
  const { prepare, save } = await getDb();
  let status = await prepare('SELECT * FROM barber_status WHERE id = 1').get();

  if (!status) {
    await prepare(`INSERT INTO barber_status (id, status) VALUES (1, 'available')`).run();
    save();
    status = await prepare('SELECT * FROM barber_status WHERE id = 1').get();
  }

  res.json(status);
}

async function updateStatus(req, res) {
  const { status: newStatus, back_at } = req.body;

  if (!newStatus || !['available', 'busy', 'away'].includes(newStatus)) {
    return res.status(400).json({ error: 'حالة غير صالحة' });
  }

  const { prepare, save } = await getDb();
  await prepare('UPDATE barber_status SET status = ?, back_at = ?, last_updated = CURRENT_TIMESTAMP WHERE id = 1').run(
    newStatus, back_at || null
  );
  save();

  const updated = await prepare('SELECT * FROM barber_status WHERE id = 1').get();
  res.json(updated);
}

module.exports = { getStatus, updateStatus };
