const { getDb } = require('../database');

async function create(req, res) {
  const { service_ids, day_of_week, time_slot, frequency_weeks } = req.body;

  if (!service_ids || !service_ids.length || day_of_week == null || !time_slot) {
    return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
  }

  const { prepare, save } = await getDb();

  const today = new Date();
  const dayDiff = (day_of_week - today.getDay() + 7) % 7;
  const nextDate = new Date(today);
  nextDate.setDate(today.getDate() + (dayDiff === 0 ? 7 : dayDiff));
  const nextDateStr = nextDate.toISOString().split('T')[0];

  const result = await prepare('INSERT INTO recurring_bookings (customer_id, service_ids, day_of_week, time_slot, frequency_weeks, next_booking_date) VALUES (?, ?, ?, ?, ?, ?) RETURNING id').run(
    req.user.id, JSON.stringify(service_ids), day_of_week, time_slot, frequency_weeks || 1, nextDateStr
  );
  save();

  const booking = await prepare('SELECT * FROM recurring_bookings WHERE id = ?').get(result.rows[0].id);
  res.status(201).json(booking);
}

async function getMy(req, res) {
  const { prepare } = await getDb();
  const bookings = await prepare('SELECT * FROM recurring_bookings WHERE customer_id = ? ORDER BY next_booking_date ASC').all(req.user.id);
  const enriched = await Promise.all(bookings.map(async b => {
    const serviceIds = JSON.parse(b.service_ids);
    const placeholders = serviceIds.map(() => '?').join(',');
    const services = await prepare(`SELECT * FROM services WHERE id IN (${placeholders})`).all(...serviceIds);
    return { ...b, services, parsed_service_ids: serviceIds };
  }));
  res.json(enriched);
}

async function getAll(req, res) {
  const { prepare } = await getDb();
  const bookings = await prepare(`
    SELECT rb.*, u.username, u.phone
    FROM recurring_bookings rb
    JOIN users u ON rb.customer_id = u.id
    ORDER BY rb.next_booking_date ASC
  `).all();
  const enriched = await Promise.all(bookings.map(async b => {
    const serviceIds = JSON.parse(b.service_ids);
    const placeholders = serviceIds.map(() => '?').join(',');
    const services = await prepare(`SELECT * FROM services WHERE id IN (${placeholders})`).all(...serviceIds);
    return { ...b, services, parsed_service_ids: serviceIds };
  }));
  res.json(enriched);
}

async function update(req, res) {
  const { id } = req.params;
  const { service_ids, day_of_week, time_slot, frequency_weeks, is_active } = req.body;
  const { prepare, save } = await getDb();

  const existing = await prepare('SELECT * FROM recurring_bookings WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'غير موجود' });

  await prepare('UPDATE recurring_bookings SET service_ids = ?, day_of_week = ?, time_slot = ?, frequency_weeks = ?, is_active = ? WHERE id = ?').run(
    service_ids ? JSON.stringify(service_ids) : existing.service_ids,
    day_of_week != null ? day_of_week : existing.day_of_week,
    time_slot || existing.time_slot,
    frequency_weeks || existing.frequency_weeks,
    is_active != null ? (is_active ? 1 : 0) : existing.is_active,
    id
  );
  save();

  const updated = await prepare('SELECT * FROM recurring_bookings WHERE id = ?').get(id);
  res.json(updated);
}

async function remove(req, res) {
  const { id } = req.params;
  const { prepare, save } = await getDb();
  await prepare('DELETE FROM recurring_bookings WHERE id = ?').run(id);
  save();
  res.json({ message: 'تم الإلغاء' });
}

async function processRecurringBookings() {
  try {
    const { prepare, save } = await getDb();
    const today = new Date().toISOString().split('T')[0];

    const due = await prepare('SELECT * FROM recurring_bookings WHERE is_active = 1 AND next_booking_date = ?').all(today);

    for (const booking of due) {
      const serviceIds = JSON.parse(booking.service_ids);
      const placeholders = serviceIds.map(() => '?').join(',');
      const services = await prepare(`SELECT * FROM services WHERE id IN (${placeholders})`).all(...serviceIds);
      if (services.length === 0) continue;

      const totalPrice = services.reduce((sum, s) => sum + s.price, 0);
      const totalDuration = services.reduce((sum, s) => sum + s.duration, 0);
      const dateTime = `${today}T${booking.time_slot}:00`;

      const conflict = await prepare('SELECT id FROM appointments WHERE date_time = ? AND status NOT IN (\'cancelled\', \'auto_cancelled\')').get(dateTime);
      if (conflict) continue;

      const result = await prepare('INSERT INTO appointments (customer_id, date_time, status, total_price, total_duration) VALUES (?, ?, ?, ?, ?) RETURNING id').run(
        booking.customer_id, dateTime, 'pending', totalPrice, totalDuration
      );

      for (const s of services) {
        await prepare('INSERT INTO appointment_services (appointment_id, service_id, price_at_booking) VALUES (?, ?, ?)').run(result.rows[0].id, s.id, s.price);
      }

      const nextDate = new Date(today);
      nextDate.setDate(nextDate.getDate() + 7 * (booking.frequency_weeks || 1));
      await prepare('UPDATE recurring_bookings SET next_booking_date = ? WHERE id = ?').run(nextDate.toISOString().split('T')[0], booking.id);

      const { createNotification } = require('./notificationController');
      await createNotification(booking.customer_id, 'reminder', '🔄 حجز متكرر', `تم إنشاء موعدك المتكرر تلقائياً اليوم الساعة ${booking.time_slot}`);
    }

    if (due.length > 0) save();
    return due.length;
  } catch (err) {
    console.error('خطأ في معالجة الحجوزات المتكررة:', err);
    return 0;
  }
}

module.exports = { create, getMy, getAll, update, remove, processRecurringBookings };
