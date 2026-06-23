const { getDb } = require('../database');

async function getDaily(req, res) {
  const { prepare } = await getDb();
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

  const appointments = await prepare(`
    SELECT * FROM appointments
    WHERE date_time >= ? AND date_time < ?
    AND status = 'completed'
  `).all(start, end);

  const total_income = appointments.reduce((sum, a) => sum + a.total_price, 0);
  const total_appointments = appointments.length;

  const servicesUsed = await prepare(`
    SELECT s.name, s.icon, COUNT(*) as count, SUM(aps.price_at_booking) as total
    FROM appointment_services aps
    JOIN services s ON aps.service_id = s.id
    JOIN appointments a ON aps.appointment_id = a.id
    WHERE a.date_time >= ? AND a.date_time < ? AND a.status = 'completed'
    GROUP BY s.id
  `).all(start, end);

  res.json({ date: start, total_income, total_appointments, servicesUsed });
}

async function getWeekly(req, res) {
  const { prepare } = await getDb();
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - 7);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const appointments = await prepare(`
    SELECT * FROM appointments
    WHERE date_time >= ? AND date_time <= ?
    AND status = 'completed'
  `).all(start.toISOString(), end.toISOString());

  const total_income = appointments.reduce((sum, a) => sum + a.total_price, 0);
  const total_appointments = appointments.length;

  const byDay = await prepare(`
    SELECT date_time::date as day, COUNT(*) as count, SUM(total_price) as income
    FROM appointments
    WHERE date_time >= ? AND date_time <= ? AND status = 'completed'
    GROUP BY date_time::date
  `).all(start.toISOString(), end.toISOString());

  res.json({ start: start.toISOString(), end: end.toISOString(), total_income, total_appointments, byDay });
}

async function getMonthly(req, res) {
  const { prepare } = await getDb();
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();

  const appointments = await prepare(`
    SELECT * FROM appointments
    WHERE date_time >= ? AND date_time <= ?
    AND status = 'completed'
  `).all(start, end);

  const total_income = appointments.reduce((sum, a) => sum + a.total_price, 0);
  const total_appointments = appointments.length;

  const byDay = await prepare(`
    SELECT date_time::date as day, COUNT(*) as count, SUM(total_price) as income
    FROM appointments
    WHERE date_time >= ? AND date_time <= ? AND status = 'completed'
    GROUP BY date_time::date
  `).all(start, end);

  res.json({ month: start, total_income, total_appointments, byDay });
}

module.exports = { getDaily, getWeekly, getMonthly };
