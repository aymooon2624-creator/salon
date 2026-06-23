const { getDb } = require('../database');

async function getStatus(req, res) {
  const { prepare, save } = await getDb();
  let status = await prepare('SELECT * FROM barber_status WHERE id = 1').get();

  if (!status) {
    await prepare(`INSERT INTO barber_status (id, status) VALUES (1, 'available')`).run();
    save();
    status = await prepare('SELECT * FROM barber_status WHERE id = 1').get();
  }

  if (status.back_at) {
    const d = new Date(status.back_at);
    if (!isNaN(d.getTime())) {
      status.back_at = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
  }

  res.json(status);
}

async function updateStatus(req, res) {
  const { status: newStatus, back_at } = req.body;

  if (!newStatus || !['available', 'busy', 'away'].includes(newStatus)) {
    return res.status(400).json({ error: 'حالة غير صالحة' });
  }

  let backAtValue = null;
  if (back_at) {
    const [h, m] = back_at.split(':');
    const d = new Date();
    d.setHours(parseInt(h), parseInt(m), 0, 0);
    backAtValue = d.toISOString();
  }

  const { prepare, save } = await getDb();
  await prepare('UPDATE barber_status SET status = ?, back_at = ?, last_updated = CURRENT_TIMESTAMP WHERE id = 1').run(
    newStatus, backAtValue
  );
  save();

  const updated = await prepare('SELECT * FROM barber_status WHERE id = 1').get();
  res.json(updated);
}

module.exports = { getStatus, updateStatus };
