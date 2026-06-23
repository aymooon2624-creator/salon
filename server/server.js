const express = require('express');
const path = require('path');
const cors = require('cors');
const { getDb } = require('./database');
const { authenticateToken } = require('./middleware/auth');
const { requireAdmin } = require('./middleware/admin');

const authRoutes = require('./routes/auth');
const serviceRoutes = require('./routes/services');
const appointmentRoutes = require('./routes/appointments');
const statusRoutes = require('./routes/status');
const reportRoutes = require('./routes/reports');
const productRoutes = require('./routes/products');
const notificationRoutes = require('./routes/notifications');
const loyaltyRoutes = require('./routes/loyalty');
const recurringRoutes = require('./routes/recurring');
const chatRoutes = require('./routes/chat');
const couponRoutes = require('./routes/coupons');

const { checkReminders, checkCouponExpiry, checkLoyaltyBonus, runAllCrons, processRecurringBookings } = require('./cron-jobs');
const { initDb } = require('./init-db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/products', productRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/loyalty', loyaltyRoutes);
app.use('/api/recurring', recurringRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/coupons', couponRoutes);

app.get('/dashboard', authenticateToken, requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/api/settings/public', async (req, res) => {
  try {
    const { prepare } = await getDb();
    const settings = await prepare('SELECT auto_cancel_minutes, work_start, work_end, slot_duration FROM settings WHERE id = 1').get();
    res.json(settings || { auto_cancel_minutes: 5 });
  } catch (err) {
    res.json({ auto_cancel_minutes: 5 });
  }
});

app.get('/api/cron/run', async (req, res) => {
  try {
    const cancelResult = await runAllCrons();
    await checkReminders();
    const recurringCount = await processRecurringBookings();
    await checkCouponExpiry();
    await checkLoyaltyBonus();
    res.json({ ok: true, auto_cancelled: cancelResult.auto_cancelled, recurring_created: recurringCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use((err, req, res, next) => {
  console.error('❌ خطأ:', err);
  res.status(500).json({ error: 'حدث خطأ في الخادم' });
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'المسار غير موجود' });
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

async function startServer() {
  async function runScheduledTasks() {
    try {
      const result = await runAllCrons();
      await checkReminders();
      const recurringCount = await processRecurringBookings();
      if (recurringCount > 0) console.log(`[متكرر] تم إنشاء ${recurringCount} حجز متكرر`);
    } catch (err) {
      console.error('خطأ في المهام المجدولة:', err);
    }
  }

  setInterval(runScheduledTasks, 60000);
  setInterval(checkCouponExpiry, 3600000);
  setInterval(checkLoyaltyBonus, 86400000);

  app.listen(PORT, () => {
    console.log(`✂️  صالون الشايب يعمل على المنفذ ${PORT}`);
    console.log(`📍 http://localhost:${PORT}`);
  });
}

initDb().then(async () => {
  const { testConnection } = require('./database');
  await testConnection();
}).catch(err => console.error('❌ DB init:', err));

if (require.main === module) {
  startServer().catch(err => {
    console.error('❌ خطأ في بدء التشغيل:', err);
    process.exit(1);
  });
}

module.exports = app;
