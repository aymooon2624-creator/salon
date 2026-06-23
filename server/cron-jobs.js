const { getDb } = require('./database');
const { createNotification } = require('./controllers/notificationController');
const { addPoints } = require('./controllers/loyaltyController');
const { processRecurringBookings } = require('./controllers/recurringController');

async function checkReminders() {
  try {
    const { prepare } = await getDb();
    const settings = await prepare('SELECT * FROM notification_settings WHERE id = 1').get();
    const hoursBefore = settings ? settings.reminder_before_hours : 1;

    const now = new Date();
    const targetTime = new Date(now.getTime() + hoursBefore * 60 * 60 * 1000);

    const reminders = await prepare(`
      SELECT a.*, u.username FROM appointments a
      JOIN users u ON a.customer_id = u.id
      WHERE a.status IN ('pending', 'confirmed')
      AND a.reminder_sent = 0
      AND a.date_time BETWEEN ? AND ?
    `).all(now.toISOString(), targetTime.toISOString());

    for (const appt of reminders) {
      const { prepare: p2, save } = await getDb();
      await p2('UPDATE appointments SET reminder_sent = 1 WHERE id = ?').run(appt.id);
      await save();
      await createNotification(appt.customer_id, 'reminder', '⏰ تذكير بالموعد',
        `تذكير: موعدك اليوم الساعة ${new Date(appt.date_time).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })} - ${appt.total_price} دينار`);
    }

    if (reminders.length > 0) {
      console.log(`[تذكير] تم إرسال ${reminders.length} تذكير`);
    }
  } catch (err) {
    console.error('خطأ في التذكيرات:', err);
  }
}

async function checkCouponExpiry() {
  try {
    const { prepare, save } = await getDb();
    const today = new Date().toISOString().split('T')[0];
    const expired = await prepare('UPDATE coupons SET is_active = 0 WHERE valid_until < ? AND is_active = 1').run(today);
    if (expired.changes > 0) {
      console.log(`[كوبونات] تم إيقاف ${expired.changes} كوبون منتهي`);
      await save();
    }
  } catch (err) {
    console.error('خطأ في صلاحية الكوبونات:', err);
  }
}

async function checkLoyaltyBonus() {
  try {
    const { prepare } = await getDb();
    const today = new Date().toISOString().split('T')[0];

    const birthdayUsers = await prepare(`
      SELECT id, username FROM users
      WHERE to_char(NOW(), 'MM-DD') = to_char(created_at, 'MM-DD')
      AND role = 'customer'
    `).all();

    for (const user of birthdayUsers) {
      await createNotification(user.id, 'loyalty', '🎁 عيد ميلاد سعيد!',
        'كل عام وأنت بخير! خصم خاص بمناسبة عيد ميلادك.')
    }

    if (birthdayUsers.length > 0) {
      console.log(`[ولاء] تم إرسال ${birthdayUsers.length} تهنئة عيد ميلاد`);
    }
  } catch (err) {
    console.error('خطأ في مكافآت الولاء:', err);
  }
}

async function runAllCrons() {
  try {
    const { prepare, save } = await getDb();

    const settings = await prepare('SELECT * FROM settings WHERE id = 1').get();
    if (!settings || !settings.notification_enabled) return;

    // Auto-cancel pending appointments
    const minutes = settings.auto_cancel_minutes || 5;
    const cutoff = new Date(Date.now() - minutes * 60 * 1000).toISOString();
    const expired = await prepare("SELECT * FROM appointments WHERE status = 'pending' AND date_time <= ?").all(cutoff);
    for (const appt of expired) {
      await prepare("UPDATE appointments SET status = 'auto_cancelled' WHERE id = ?").run(appt.id);
      const user = await prepare('SELECT username FROM users WHERE id = ?').get(appt.customer_id);
      if (user) {
        await createNotification(appt.customer_id, 'reminder', '⚠️ تم إلغاء موعدك',
          `تم إلغاء موعدك تلقائياً لعدم التأكيد`);
        console.log(`[إلغاء تلقائي] تم إلغاء الموعد #${appt.id} للزبون ${user.username}`);
      }
    }
    if (expired.length > 0) {
      await save();
      return { auto_cancelled: expired.length };
    }
  } catch (err) {
    console.error('خطأ في المهام المجدولة:', err);
  }
  return { auto_cancelled: 0 };
}

module.exports = { checkReminders, checkCouponExpiry, checkLoyaltyBonus, runAllCrons, processRecurringBookings };
