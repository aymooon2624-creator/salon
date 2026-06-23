const { getDb } = require('../database');

async function getAll(req, res) {
  const { prepare } = await getDb();
  const services = await prepare('SELECT * FROM services WHERE is_active = 1').all();
  res.json(services);
}

async function create(req, res) {
  const { name, price, duration, icon } = req.body;

  if (!name || price == null || !duration) {
    return res.status(400).json({ error: 'اسم الخدمة والسعر والمدة مطلوبون' });
  }
  if (price < 0 || duration < 1) {
    return res.status(400).json({ error: 'قيم غير صالحة' });
  }

  const { prepare, save } = await getDb();
  const result = await prepare('INSERT INTO services (name, price, duration, icon) VALUES (?, ?, ?, ?) RETURNING id').run(
    name, price, duration, icon || '✂️'
  );
  save();

  const service = await prepare('SELECT * FROM services WHERE id = ?').get(result.rows[0].id);
  res.status(201).json(service);
}

async function update(req, res) {
  const { id } = req.params;
  const { name, price, duration, icon, is_active } = req.body;

  const { prepare, save } = await getDb();
  const existing = await prepare('SELECT * FROM services WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'الخدمة غير موجودة' });
  }

  await prepare('UPDATE services SET name = ?, price = ?, duration = ?, icon = ?, is_active = ? WHERE id = ?').run(
    name || existing.name,
    price != null ? price : existing.price,
    duration || existing.duration,
    icon || existing.icon,
    is_active != null ? is_active : existing.is_active,
    id
  );
  save();

  const updated = await prepare('SELECT * FROM services WHERE id = ?').get(id);
  res.json(updated);
}

async function remove(req, res) {
  const { id } = req.params;
  const { prepare, save } = await getDb();

  const existing = await prepare('SELECT * FROM services WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'الخدمة غير موجودة' });
  }

  await prepare('DELETE FROM services WHERE id = ?').run(id);
  save();

  res.json({ message: 'تم حذف الخدمة بنجاح' });
}

module.exports = { getAll, create, update, remove };
