const { getDb } = require('../database');

async function getActive(req, res) {
  const { prepare } = await getDb();
  const today = new Date().toISOString().split('T')[0];
  const coupons = prepare('SELECT * FROM coupons WHERE is_active = 1 AND valid_from <= ? AND valid_until >= ?').all(today, today);
  res.json(coupons);
}

async function getAll(req, res) {
  const { prepare } = await getDb();
  const coupons = prepare('SELECT * FROM coupons ORDER BY created_at DESC').all();
  res.json(coupons);
}

async function create(req, res) {
  const { code, description, discount_type, discount_value, min_order, max_discount, usage_limit, valid_from, valid_until } = req.body;

  if (!code || !discount_type || discount_value == null || !valid_from || !valid_until) {
    return res.status(400).json({ error: 'الكود ونوع الخصم والقيمة وتاريخ الصلاحية مطلوبون' });
  }
  if (!['percentage', 'fixed'].includes(discount_type)) {
    return res.status(400).json({ error: 'نوع الخصم يجب أن يكون percentage أو fixed' });
  }

  const { prepare, save } = await getDb();
  const existing = prepare('SELECT id FROM coupons WHERE code = ?').get(code);
  if (existing) return res.status(400).json({ error: 'الكود موجود مسبقاً' });

  const result = prepare('INSERT INTO coupons (code, description, discount_type, discount_value, min_order, max_discount, usage_limit, valid_from, valid_until) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    code.toUpperCase(), description || '', discount_type, discount_value, min_order || 0, max_discount || null, usage_limit || null, valid_from, valid_until
  );
  save();

  const coupon = prepare('SELECT * FROM coupons WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(coupon);
}

async function update(req, res) {
  const { id } = req.params;
  const updates = req.body;
  const { prepare, save } = await getDb();

  const existing = prepare('SELECT * FROM coupons WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'غير موجود' });

  prepare('UPDATE coupons SET code = ?, description = ?, discount_type = ?, discount_value = ?, min_order = ?, max_discount = ?, usage_limit = ?, valid_from = ?, valid_until = ?, is_active = ? WHERE id = ?').run(
    updates.code || existing.code,
    updates.description != null ? updates.description : existing.description,
    updates.discount_type || existing.discount_type,
    updates.discount_value != null ? updates.discount_value : existing.discount_value,
    updates.min_order != null ? updates.min_order : existing.min_order,
    updates.max_discount != null ? updates.max_discount : existing.max_discount,
    updates.usage_limit != null ? updates.usage_limit : existing.usage_limit,
    updates.valid_from || existing.valid_from,
    updates.valid_until || existing.valid_until,
    updates.is_active != null ? (updates.is_active ? 1 : 0) : existing.is_active,
    id
  );
  save();

  const updated = prepare('SELECT * FROM coupons WHERE id = ?').get(id);
  res.json(updated);
}

async function validate(req, res) {
  const { code, order_total } = req.body;
  if (!code) return res.status(400).json({ error: 'الكود مطلوب' });

  const { prepare } = await getDb();
  const today = new Date().toISOString().split('T')[0];
  const coupon = prepare('SELECT * FROM coupons WHERE code = ? AND is_active = 1 AND valid_from <= ? AND valid_until >= ?').get(code.toUpperCase(), today, today);

  if (!coupon) return res.status(404).json({ error: 'الكود غير صالح أو منتهي الصلاحية' });
  if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit) {
    return res.status(400).json({ error: 'تم استنفاذ عدد استخدامات هذا الكود' });
  }
  if (order_total && order_total < coupon.min_order) {
    return res.status(400).json({ error: `الحد الأدنى للطلب ${coupon.min_order} دينار` });
  }

  let discount = coupon.discount_type === 'percentage'
    ? (order_total || 0) * coupon.discount_value / 100
    : coupon.discount_value;
  if (coupon.max_discount) discount = Math.min(discount, coupon.max_discount);
  if (order_total) discount = Math.min(discount, order_total);

  res.json({ valid: true, coupon, discount });
}

async function apply(req, res) {
  const { code, appointment_id } = req.body;
  if (!code || !appointment_id) return res.status(400).json({ error: 'الكود والموعد مطلوبان' });

  const { prepare, save } = await getDb();

  const appointment = prepare('SELECT * FROM appointments WHERE id = ? AND customer_id = ?').get(appointment_id, req.user.id);
  if (!appointment) return res.status(404).json({ error: 'الموعد غير موجود' });

  const today = new Date().toISOString().split('T')[0];
  const coupon = prepare('SELECT * FROM coupons WHERE code = ? AND is_active = 1 AND valid_from <= ? AND valid_until >= ?').get(code.toUpperCase(), today, today);
  if (!coupon) return res.status(404).json({ error: 'الكود غير صالح' });
  if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit) {
    return res.status(400).json({ error: 'انتهت صلاحية الاستخدام' });
  }
  if (appointment.total_price < coupon.min_order) {
    return res.status(400).json({ error: `الحد الأدنى ${coupon.min_order} دينار` });
  }

  let discount = coupon.discount_type === 'percentage'
    ? appointment.total_price * coupon.discount_value / 100
    : coupon.discount_value;
  if (coupon.max_discount) discount = Math.min(discount, coupon.max_discount);
  discount = Math.min(discount, appointment.total_price);

  prepare('UPDATE appointments SET coupon_id = ?, discount_amount = ? WHERE id = ?').run(coupon.id, discount, appointment_id);
  prepare('UPDATE coupons SET usage_count = usage_count + 1 WHERE id = ?').run(coupon.id);
  prepare('INSERT INTO coupon_usage (coupon_id, customer_id, appointment_id, discount_amount) VALUES (?, ?, ?, ?)').run(
    coupon.id, req.user.id, appointment_id, discount
  );
  save();

  const updated = prepare('SELECT * FROM appointments WHERE id = ?').get(appointment_id);
  res.json({ message: '✅ تم تطبيق الكود', appointment: updated, discount });
}

async function getStats(req, res) {
  const { prepare } = await getDb();
  const stats = prepare(`
    SELECT c.id, c.code, c.usage_count, c.usage_limit,
           COUNT(cu.id) as actual_usage, COALESCE(SUM(cu.discount_amount), 0) as total_discount
    FROM coupons c
    LEFT JOIN coupon_usage cu ON c.id = cu.coupon_id
    GROUP BY c.id
  `).all();
  res.json(stats);
}

module.exports = { getActive, getAll, create, update, validate, apply, getStats };
