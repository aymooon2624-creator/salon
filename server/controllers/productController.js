const { getDb } = require('../database');

async function getAll(req, res) {
  const { prepare } = await getDb();
  const products = prepare('SELECT * FROM products WHERE is_active = 1').all();
  res.json(products);
}

async function getAllAdmin(req, res) {
  const { prepare } = await getDb();
  const products = prepare('SELECT * FROM products').all();
  res.json(products);
}

async function create(req, res) {
  const { name, price, description, icon } = req.body;
  if (!name || price == null) {
    return res.status(400).json({ error: 'اسم المنتج والسعر مطلوبان' });
  }
  const { prepare, save } = await getDb();
  const result = prepare('INSERT INTO products (name, price, description, icon) VALUES (?, ?, ?, ?)').run(
    name, price, description || '', icon || '🧴'
  );
  save();
  const product = prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(product);
}

async function update(req, res) {
  const { id } = req.params;
  const { name, price, description, icon, is_active } = req.body;
  const { prepare, save } = await getDb();
  const existing = prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'المنتج غير موجود' });
  prepare('UPDATE products SET name = ?, price = ?, description = ?, icon = ?, is_active = ? WHERE id = ?').run(
    name || existing.name,
    price != null ? price : existing.price,
    description != null ? description : existing.description,
    icon || existing.icon,
    is_active != null ? is_active : existing.is_active,
    id
  );
  save();
  const updated = prepare('SELECT * FROM products WHERE id = ?').get(id);
  res.json(updated);
}

async function remove(req, res) {
  const { id } = req.params;
  const { prepare, save } = await getDb();
  const existing = prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'المنتج غير موجود' });
  prepare('DELETE FROM products WHERE id = ?').run(id);
  save();
  res.json({ message: 'تم حذف المنتج بنجاح' });
}

module.exports = { getAll, getAllAdmin, create, update, remove };
