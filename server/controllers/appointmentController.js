const { getDb } = require('../database');
const { addPoints } = require('./loyaltyController');

async function getAll(req, res) {
  const { prepare } = await getDb();
  let appointments;

  if (req.user.role === 'admin') {
    appointments = await prepare(`
      SELECT a.*, u.username, u.phone
      FROM appointments a
      JOIN users u ON a.customer_id = u.id
      ORDER BY a.date_time DESC
    `).all();
  } else {
    appointments = await prepare(`
      SELECT a.*, u.username, u.phone
      FROM appointments a
      JOIN users u ON a.customer_id = u.id
      WHERE a.customer_id = ?
      ORDER BY a.date_time DESC
    `).all(req.user.id);
  }

  const result = await Promise.all(appointments.map(async app => {
    const services = await prepare(`
      SELECT s.id, s.name, s.icon, aps.price_at_booking
      FROM appointment_services aps
      JOIN services s ON aps.service_id = s.id
      WHERE aps.appointment_id = ?
    `).all(app.id);
    return { ...app, services };
  }));

  res.json(result);
}

async function getToday(req, res) {
  const { prepare } = await getDb();
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

  const appointments = await prepare(`
    SELECT a.*, u.username, u.phone
    FROM appointments a
    JOIN users u ON a.customer_id = u.id
    WHERE a.date_time >= ? AND a.date_time < ?
    ORDER BY a.date_time ASC
  `).all(startOfDay, endOfDay);

  const result = await Promise.all(appointments.map(async app => {
    const services = await prepare(`
      SELECT s.id, s.name, s.icon, aps.price_at_booking
      FROM appointment_services aps
      JOIN services s ON aps.service_id = s.id
      WHERE aps.appointment_id = ?
    `).all(app.id);
    return { ...app, services };
  }));

  res.json(result);
}

async function create(req, res) {
  const { date_time, service_ids, coupon_code, loyalty_points } = req.body;

  if (!date_time || !service_ids || !service_ids.length) {
    return res.status(400).json({ error: 'التاريخ والوقت والخدمات مطلوبة' });
  }

  const { prepare, save } = await getDb();

  const settings = await prepare('SELECT * FROM settings WHERE id = 1').get();
  if (!settings) {
    return res.status(500).json({ error: 'الإعدادات غير موجودة' });
  }

  const barberStatus = await prepare('SELECT * FROM barber_status WHERE id = 1').get();
  if (barberStatus && barberStatus.status !== 'available') {
    return res.status(400).json({ error: 'الحلاق غير متاح حالياً' });
  }

  const placeholders = service_ids.map(() => '?').join(',');
  const services = await prepare(`SELECT * FROM services WHERE id IN (${placeholders})`).all(...service_ids);

  if (services.length !== service_ids.length) {
    return res.status(400).json({ error: 'بعض الخدمات غير موجودة' });
  }

  let total_price = services.reduce((sum, s) => sum + s.price, 0);
  const total_duration = services.reduce((sum, s) => sum + s.duration, 0);

  const appointmentDate = new Date(date_time);
  const now = new Date();
  if (appointmentDate <= now) {
    return res.status(400).json({ error: 'يجب أن يكون الموعد في المستقبل' });
  }

  const [workHour, workMin] = (settings.work_start || '09:00').split(':').map(Number);
  const [endHour, endMin] = (settings.work_end || '21:00').split(':').map(Number);
  const appHour = appointmentDate.getHours();
  const appMin = appointmentDate.getMinutes();

  if (appHour < workHour || (appHour === workHour && appMin < workMin) ||
      appHour > endHour || (appHour === endHour && appMin > endMin)) {
    return res.status(400).json({ error: 'خارج أوقات العمل' });
  }

  const conflict = await prepare(`
    SELECT id FROM appointments
    WHERE date_time = ? AND status NOT IN ('cancelled', 'auto_cancelled')
  `).get(date_time);

  if (conflict) {
    return res.status(400).json({ error: 'هذا الموعد محجوز مسبقاً' });
  }

  let couponId = null;
  let discountAmount = 0;

  if (coupon_code) {
    const today = new Date().toISOString().split('T')[0];
    const coupon = await prepare('SELECT * FROM coupons WHERE code = ? AND is_active = 1 AND valid_from <= ? AND valid_until >= ?').get(coupon_code.toUpperCase(), today, today);
    if (coupon) {
      if (!coupon.usage_limit || coupon.usage_count < coupon.usage_limit) {
        if (total_price >= coupon.min_order) {
          let d = coupon.discount_type === 'percentage' ? total_price * coupon.discount_value / 100 : coupon.discount_value;
          if (coupon.max_discount) d = Math.min(d, coupon.max_discount);
          d = Math.min(d, total_price);
          discountAmount = Math.round(d * 100) / 100;
          couponId = coupon.id;
          await prepare('UPDATE coupons SET usage_count = usage_count + 1 WHERE id = ?').run(coupon.id);
          await prepare('INSERT INTO coupon_usage (coupon_id, customer_id, discount_amount) VALUES (?, ?, ?)').run(coupon.id, req.user.id, discountAmount);
        }
      }
    }
  }

  let loyaltyPointsUsed = 0;
  if (loyalty_points && loyalty_points > 0) {
    const totalEarned = await prepare("SELECT COALESCE(SUM(points), 0) as total FROM loyalty_points WHERE customer_id = ? AND type IN ('earned', 'bonus')").get(req.user.id);
    const totalRedeemed = await prepare("SELECT COALESCE(SUM(ABS(points)), 0) as total FROM loyalty_points WHERE customer_id = ? AND type = 'redeemed'").get(req.user.id);
    const balance = (totalEarned.total || 0) - (totalRedeemed.total || 0);
    const pointsAsDiscount = Math.min(loyalty_points, balance, Math.floor(total_price - discountAmount));
    if (pointsAsDiscount > 0) {
      loyaltyPointsUsed = pointsAsDiscount;
      discountAmount += pointsAsDiscount;
      await prepare('INSERT INTO loyalty_points (customer_id, points, type, description) VALUES (?, ?, ?, ?)').run(
        req.user.id, -pointsAsDiscount, 'redeemed', `خصم ${pointsAsDiscount} دينار من نقاط الولاء`
      );
    }
  }

  const finalPrice = Math.max(0, total_price - discountAmount);

  const result = await prepare('INSERT INTO appointments (customer_id, date_time, status, total_price, total_duration, coupon_id, discount_amount, loyalty_points_used) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id').run(
    req.user.id, date_time, 'pending', finalPrice, total_duration, couponId, discountAmount, loyaltyPointsUsed
  );

  const appointmentId = result.rows[0].id;

  for (const service of services) {
    await prepare('INSERT INTO appointment_services (appointment_id, service_id, price_at_booking) VALUES (?, ?, ?)').run(
      appointmentId, service.id, service.price
    );
  }
  await save();

  const appointment = await prepare('SELECT * FROM appointments WHERE id = ?').get(appointmentId);
  res.status(201).json({ ...appointment, services, original_price: total_price, discount_amount: discountAmount });
}

async function confirm(req, res) {
  const { id } = req.params;
  const { prepare, save } = await getDb();

  const appointment = await prepare('SELECT * FROM appointments WHERE id = ?').get(id);
  if (!appointment) {
    return res.status(404).json({ error: 'الموعد غير موجود' });
  }
  if (appointment.status !== 'pending') {
    return res.status(400).json({ error: 'لا يمكن تأكيد هذا الموعد' });
  }

  await prepare("UPDATE appointments SET status = 'confirmed' WHERE id = ?").run(id);
  await prepare("UPDATE barber_status SET status = 'busy', last_updated = CURRENT_TIMESTAMP WHERE id = 1").run();
  await save();

  const updated = await prepare('SELECT * FROM appointments WHERE id = ?').get(id);
  res.json(updated);
}

async function cancel(req, res) {
  const { id } = req.params;
  const { prepare, save } = await getDb();

  const appointment = await prepare('SELECT * FROM appointments WHERE id = ?').get(id);
  if (!appointment) {
    return res.status(404).json({ error: 'الموعد غير موجود' });
  }

  if (req.user.role !== 'admin' && appointment.customer_id !== req.user.id) {
    return res.status(403).json({ error: 'غير مصرح' });
  }

  if (appointment.status === 'completed' || appointment.status === 'cancelled') {
    return res.status(400).json({ error: 'لا يمكن إلغاء هذا الموعد' });
  }

  await prepare("UPDATE appointments SET status = 'cancelled' WHERE id = ?").run(id);
  await prepare("UPDATE barber_status SET status = 'available', last_updated = CURRENT_TIMESTAMP WHERE id = 1").run();
  await save();

  const updated = await prepare('SELECT * FROM appointments WHERE id = ?').get(id);
  res.json(updated);
}

async function complete(req, res) {
  const { id } = req.params;
  const { prepare, save } = await getDb();

  const appointment = await prepare('SELECT * FROM appointments WHERE id = ?').get(id);
  if (!appointment) {
    return res.status(404).json({ error: 'الموعد غير موجود' });
  }
  if (appointment.status !== 'confirmed') {
    return res.status(400).json({ error: 'يجب تأكيد الموعد أولاً' });
  }

  await prepare("UPDATE appointments SET status = 'completed' WHERE id = ?").run(id);
  await prepare("UPDATE barber_status SET status = 'available', last_updated = CURRENT_TIMESTAMP WHERE id = 1").run();
  await save();

  const points = Math.floor(appointment.total_price / 5);
  await addPoints(appointment.customer_id, points, 'earned', `${points} نقطة مقابل الخدمة`, appointment.id);

  const updated = await prepare('SELECT * FROM appointments WHERE id = ?').get(id);
  res.json(updated);
}

async function getCustomerAppointments(req, res) {
  const { id } = req.params;
  const { prepare } = await getDb();
  const appointments = await prepare(`
    SELECT a.*, u.username, u.phone
    FROM appointments a
    JOIN users u ON a.customer_id = u.id
    WHERE a.customer_id = ?
    ORDER BY a.date_time DESC
  `).all(id);

  const result = await Promise.all(appointments.map(async app => {
    const services = await prepare(`
      SELECT s.id, s.name, s.icon, aps.price_at_booking
      FROM appointment_services aps
      JOIN services s ON aps.service_id = s.id
      WHERE aps.appointment_id = ?
    `).all(app.id);
    return { ...app, services };
  }));

  res.json(result);
}

async function reschedule(req, res) {
  const { id } = req.params;
  const { date_time } = req.body;

  if (!date_time) {
    return res.status(400).json({ error: 'التاريخ والوقت الجديد مطلوب' });
  }

  const { prepare, save } = await getDb();
  const appointment = await prepare('SELECT * FROM appointments WHERE id = ?').get(id);
  if (!appointment) {
    return res.status(404).json({ error: 'الموعد غير موجود' });
  }

  const newDate = new Date(date_time);
  const now = new Date();
  if (newDate <= now) {
    return res.status(400).json({ error: 'يجب أن يكون الموعد في المستقبل' });
  }

  const settings = await prepare('SELECT * FROM settings WHERE id = 1').get();
  if (settings) {
    const [workHour, workMin] = (settings.work_start || '09:00').split(':').map(Number);
    const [endHour, endMin] = (settings.work_end || '21:00').split(':').map(Number);
    const appHour = newDate.getHours();
    const appMin = newDate.getMinutes();
    if (appHour < workHour || (appHour === workHour && appMin < workMin) ||
        appHour > endHour || (appHour === endHour && appMin > endMin)) {
      return res.status(400).json({ error: 'خارج أوقات العمل' });
    }
  }

  const conflict = await prepare(`
    SELECT id FROM appointments
    WHERE date_time = ? AND id != ? AND status NOT IN ('cancelled', 'auto_cancelled')
  `).get(date_time, id);

  if (conflict) {
    return res.status(400).json({ error: 'هذا الموعد محجوب مسبقاً' });
  }

  await prepare("UPDATE appointments SET date_time = ?, status = 'pending', reminder_sent = 0 WHERE id = ?").run(date_time, id);
  await save();

  const updated = await prepare('SELECT * FROM appointments WHERE id = ?').get(id);
  const services = await prepare(`
    SELECT s.id, s.name, s.icon, aps.price_at_booking
    FROM appointment_services aps
    JOIN services s ON aps.service_id = s.id
    WHERE aps.appointment_id = ?
  `).all(id);

  const { createNotification } = require('./notificationController');
  await createNotification(appointment.customer_id, 'reminder', '🔄 تم تغيير موعدك',
    `تم تغيير موعدك إلى ${newDate.toLocaleDateString('ar-SA')} الساعة ${newDate.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}`);

  res.json({ ...updated, services });
}

async function getAvailableSlots(req, res) {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: 'التاريخ مطلوب' });
  }

  const { prepare } = await getDb();
  const settings = await prepare('SELECT * FROM settings WHERE id = 1').get();
  const barberStatus = await prepare('SELECT * FROM barber_status WHERE id = 1').get();

  if (barberStatus && barberStatus.status !== 'available') {
    return res.json({ slots: [], message: 'الحلاق غير متاح اليوم' });
  }

  const [startH, startM] = ((settings && settings.work_start) || '09:00').split(':').map(Number);
  const [endH, endM] = ((settings && settings.work_end) || '21:00').split(':').map(Number);
  const slotDuration = (settings && settings.slot_duration) || 30;

  const booked = await prepare(`
    SELECT date_time FROM appointments
    WHERE date_time::date = ? AND status NOT IN ('cancelled', 'auto_cancelled')
  `).all(date);

  const bookedTimes = new Set(booked.map(b => {
    const d = new Date(b.date_time);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }));

  const now = new Date();
  const nowStr = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
  const todayUTC = now.toISOString().split('T')[0];
  const isToday = date === todayUTC;

  const slots = [];
  for (let h = startH; h <= endH; h++) {
    for (let m = (h === startH ? startM : 0); m < 60; m += slotDuration) {
      if (h === endH && m >= endM) break;
      const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      if (!bookedTimes.has(timeStr)) {
        if (!isToday || timeStr > nowStr) {
          slots.push(timeStr);
        }
      }
    }
  }

  res.json({ slots, date });
}

module.exports = { getAll, getToday, getCustomerAppointments, create, confirm, cancel, complete, reschedule, getAvailableSlots };
