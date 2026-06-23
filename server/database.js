const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

class Statement {
  constructor(sql) {
    this.sql = sql;
  }

  _toPg(sql, params) {
    if (!params || params.length === 0) return { text: sql, values: [] };
    if (sql.includes('$1')) return { text: sql, values: params };
    let idx = 0;
    const text = sql.replace(/\?/g, () => `$${++idx}`);
    return { text, values: params };
  }

  async get(...params) {
    const { text, values } = this._toPg(this.sql, params);
    const result = await pool.query(text, values);
    return result.rows[0] || null;
  }

  async all(...params) {
    const { text, values } = this._toPg(this.sql, params);
    const result = await pool.query(text, values);
    return result.rows;
  }

  async run(...params) {
    const { text, values } = this._toPg(this.sql, params);
    const result = await pool.query(text, values);
    return { changes: result.rowCount, rows: result.rows };
  }
}

async function getDb() {
  return {
    prepare: (sql) => new Statement(sql),
    save: () => {}
  };
}

async function initTables() {
  const { prepare } = await getDb();

  await prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(255) NOT NULL UNIQUE,
      password TEXT NOT NULL,
      phone VARCHAR(50),
      role VARCHAR(20) DEFAULT 'customer',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await prepare(`
    CREATE TABLE IF NOT EXISTS services (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      price INTEGER NOT NULL,
      duration INTEGER NOT NULL,
      icon TEXT DEFAULT '✂️',
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await prepare(`
    CREATE TABLE IF NOT EXISTS barber_status (
      id INTEGER PRIMARY KEY DEFAULT 1,
      status TEXT DEFAULT 'available',
      back_at TIMESTAMP,
      last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await prepare(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      work_start TEXT DEFAULT '09:00',
      work_end TEXT DEFAULT '21:00',
      slot_duration INTEGER DEFAULT 30,
      auto_cancel_minutes INTEGER DEFAULT 5,
      notification_enabled INTEGER DEFAULT 1
    )
  `).run();

  await prepare(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      description TEXT,
      icon TEXT DEFAULT '📦',
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await prepare(`
    CREATE TABLE IF NOT EXISTS appointments (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL,
      date_time TIMESTAMP NOT NULL,
      status TEXT DEFAULT 'pending',
      total_price INTEGER NOT NULL,
      total_duration INTEGER NOT NULL,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      coupon_id INTEGER DEFAULT NULL,
      discount_amount INTEGER DEFAULT 0,
      loyalty_points_used INTEGER DEFAULT 0,
      reminder_sent INTEGER DEFAULT 0,
      FOREIGN KEY (customer_id) REFERENCES users(id)
    )
  `).run();

  await prepare(`
    CREATE TABLE IF NOT EXISTS appointment_services (
      id SERIAL PRIMARY KEY,
      appointment_id INTEGER NOT NULL,
      service_id INTEGER NOT NULL,
      price_at_booking INTEGER NOT NULL,
      FOREIGN KEY (appointment_id) REFERENCES appointments(id),
      FOREIGN KEY (service_id) REFERENCES services(id)
    )
  `).run();

  await prepare(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      type TEXT DEFAULT 'reminder',
      title TEXT NOT NULL,
      message TEXT,
      is_read INTEGER DEFAULT 0,
      sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `).run();

  await prepare(`
    CREATE TABLE IF NOT EXISTS notification_settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      reminder_before_hours INTEGER DEFAULT 1,
      enable_push INTEGER DEFAULT 1,
      enable_email INTEGER DEFAULT 0,
      enable_sms INTEGER DEFAULT 0
    )
  `).run();

  await prepare(`
    CREATE TABLE IF NOT EXISTS loyalty_points (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL,
      points INTEGER NOT NULL,
      type TEXT NOT NULL,
      description TEXT,
      appointment_id INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES users(id)
    )
  `).run();

  await prepare(`
    CREATE TABLE IF NOT EXISTS loyalty_rewards (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      points_required INTEGER NOT NULL,
      reward_type TEXT NOT NULL,
      reward_value INTEGER DEFAULT 0,
      service_id INTEGER,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await prepare(`
    CREATE TABLE IF NOT EXISTS recurring_bookings (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL,
      service_ids TEXT NOT NULL,
      day_of_week INTEGER NOT NULL,
      time_slot TEXT NOT NULL,
      frequency_weeks INTEGER DEFAULT 1,
      next_booking_date DATE,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES users(id)
    )
  `).run();

  await prepare(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id SERIAL PRIMARY KEY,
      sender_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sender_id) REFERENCES users(id),
      FOREIGN KEY (receiver_id) REFERENCES users(id)
    )
  `).run();

  await prepare(`
    CREATE TABLE IF NOT EXISTS coupons (
      id SERIAL PRIMARY KEY,
      code VARCHAR(50) NOT NULL UNIQUE,
      description TEXT,
      discount_type TEXT NOT NULL,
      discount_value INTEGER NOT NULL,
      min_order INTEGER DEFAULT 0,
      max_discount INTEGER,
      usage_limit INTEGER DEFAULT 0,
      usage_count INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      valid_from DATE,
      valid_until DATE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await prepare(`
    CREATE TABLE IF NOT EXISTS coupon_usage (
      id SERIAL PRIMARY KEY,
      coupon_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      appointment_id INTEGER,
      discount_amount INTEGER NOT NULL,
      used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (coupon_id) REFERENCES coupons(id),
      FOREIGN KEY (customer_id) REFERENCES users(id)
    )
  `).run();

  const col = await prepare(`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'coupon_id'
  `).get();

  if (!col) {
    await prepare("ALTER TABLE appointments ADD COLUMN coupon_id INTEGER DEFAULT NULL").run();
    await prepare("ALTER TABLE appointments ADD COLUMN discount_amount INTEGER DEFAULT 0").run();
    await prepare("ALTER TABLE appointments ADD COLUMN loyalty_points_used INTEGER DEFAULT 0").run();
    await prepare("ALTER TABLE appointments ADD COLUMN reminder_sent INTEGER DEFAULT 0").run();
  }
}

module.exports = { getDb, initTables };