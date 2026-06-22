const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'salon.db');
let dbInstance;
let SQL;

class Statement {
  constructor(sql) {
    this.sql = sql;
  }

  get(...params) {
    const stmt = dbInstance.prepare(this.sql);
    if (params.length > 0) stmt.bind(params);
    if (stmt.step()) {
      const result = stmt.getAsObject();
      stmt.free();
      return result;
    }
    stmt.free();
    return undefined;
  }

  all(...params) {
    const stmt = dbInstance.prepare(this.sql);
    if (params.length > 0) stmt.bind(params);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  run(...params) {
    dbInstance.run(this.sql, params);
    const lastId = dbInstance.exec("SELECT last_insert_rowid() as id");
    const row = lastId[0] && lastId[0].values ? lastId[0].values[0] : [0];
    return { changes: dbInstance.getRowsModified(), lastInsertRowid: row[0] };
  }
}

function prepare(sql) {
  return new Statement(sql);
}

async function ensureDb() {
  if (!dbInstance) {
    SQL = await initSqlJs();
    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      dbInstance = new SQL.Database(buffer);
    } else {
      dbInstance = new SQL.Database();
    }
    dbInstance.run('PRAGMA foreign_keys = ON');
  }
}

function saveDb() {
  const data = dbInstance.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

async function getDb() {
  await ensureDb();
  return { prepare, run: dbInstance.run.bind(dbInstance), exec: dbInstance.exec.bind(dbInstance), save: saveDb };
}

async function initTables() {
  await ensureDb();

  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      phone TEXT NOT NULL,
      role TEXT DEFAULT 'customer',
      customer_notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      duration INTEGER NOT NULL,
      icon TEXT DEFAULT '✂️',
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      date_time DATETIME NOT NULL,
      status TEXT DEFAULT 'pending',
      total_price REAL NOT NULL,
      total_duration INTEGER NOT NULL,
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS appointment_services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      appointment_id INTEGER NOT NULL,
      service_id INTEGER NOT NULL,
      price_at_booking REAL NOT NULL,
      FOREIGN KEY (appointment_id) REFERENCES appointments(id),
      FOREIGN KEY (service_id) REFERENCES services(id)
    );

    CREATE TABLE IF NOT EXISTS barber_status (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      status TEXT DEFAULT 'available',
      back_at TIME,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      work_start TIME DEFAULT '09:00',
      work_end TIME DEFAULT '21:00',
      slot_duration INTEGER DEFAULT 30,
      auto_cancel_minutes INTEGER DEFAULT 5,
      notification_enabled INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      description TEXT DEFAULT '',
      icon TEXT DEFAULT '🧴',
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      appointment_id INTEGER NOT NULL UNIQUE,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      comment TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (appointment_id) REFERENCES appointments(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS notification_settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      reminder_before_hours INTEGER DEFAULT 1,
      enable_push INTEGER DEFAULT 1,
      enable_email INTEGER DEFAULT 0,
      enable_sms INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS loyalty_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      points INTEGER NOT NULL,
      type TEXT NOT NULL,
      description TEXT,
      appointment_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES users(id),
      FOREIGN KEY (appointment_id) REFERENCES appointments(id)
    );

    CREATE TABLE IF NOT EXISTS loyalty_rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      points_required INTEGER NOT NULL,
      reward_type TEXT NOT NULL,
      reward_value REAL NOT NULL,
      service_id INTEGER,
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY (service_id) REFERENCES services(id)
    );

    CREATE TABLE IF NOT EXISTS recurring_bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      service_ids TEXT NOT NULL,
      day_of_week INTEGER NOT NULL,
      time_slot TIME NOT NULL,
      frequency_weeks INTEGER DEFAULT 1,
      next_booking_date DATE NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sender_id) REFERENCES users(id),
      FOREIGN KEY (receiver_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      description TEXT,
      discount_type TEXT NOT NULL,
      discount_value REAL NOT NULL,
      min_order REAL DEFAULT 0,
      max_discount REAL,
      usage_limit INTEGER,
      usage_count INTEGER DEFAULT 0,
      valid_from DATE NOT NULL,
      valid_until DATE NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS coupon_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coupon_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      appointment_id INTEGER,
      discount_amount REAL NOT NULL,
      used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (coupon_id) REFERENCES coupons(id),
      FOREIGN KEY (customer_id) REFERENCES users(id),
      FOREIGN KEY (appointment_id) REFERENCES appointments(id)
    );
  `);

  const existingColumns = dbInstance.exec("PRAGMA table_info(appointments)");
  const columnNames = existingColumns[0] ? existingColumns[0].values.map(v => v[1]) : [];

  const alterStatements = [
    "ALTER TABLE appointments ADD COLUMN coupon_id INTEGER DEFAULT NULL",
    "ALTER TABLE appointments ADD COLUMN discount_amount REAL DEFAULT 0",
    "ALTER TABLE appointments ADD COLUMN loyalty_points_used INTEGER DEFAULT 0",
    "ALTER TABLE appointments ADD COLUMN reminder_sent INTEGER DEFAULT 0"
  ];

  for (const stmt of alterStatements) {
    const colName = stmt.split('ADD COLUMN ')[1].split(' ')[0];
    if (!columnNames.includes(colName)) {
      try {
        dbInstance.run(stmt);
      } catch (e) {
        console.log(`⚠️  العمود ${colName} موجود مسبقاً`);
      }
    }
  }

  saveDb();
}

module.exports = { getDb, initTables };
