const bcrypt = require('bcryptjs');
const { getDb, initTables } = require('./database');

async function init() {
  console.log('🗄️  تهيئة قاعدة البيانات...');

  await initTables();

  const { prepare, save } = await getDb();

  const adminExists = prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!adminExists) {
    const hashed = bcrypt.hashSync('admin123', 10);
    prepare('INSERT INTO users (username, password, phone, role) VALUES (?, ?, ?, ?)').run('admin', hashed, '0500000000', 'admin');
    console.log('✅ تم إنشاء حساب الأدمن (admin / admin123)');
  } else {
    console.log('ℹ️  حساب الأدمن موجود مسبقاً');
  }

  const existingServices = prepare('SELECT COUNT(*) as count FROM services').get();
  if (existingServices.count === 0) {
    const services = [
      { name: 'قصة شعر', price: 20, duration: 30, icon: '✂️' },
      { name: 'حلاقة ذقن', price: 10, duration: 15, icon: '🧔' },
      { name: 'تحديد لحية', price: 8, duration: 10, icon: '✏️' },
      { name: 'صبغة شعر', price: 35, duration: 60, icon: '🎨' },
      { name: 'ماسك للشعر', price: 15, duration: 20, icon: '🧴' },
      { name: 'تنظيف بشرة', price: 20, duration: 25, icon: '🧖' },
    ];

    for (const s of services) {
      prepare('INSERT INTO services (name, price, duration, icon) VALUES (?, ?, ?, ?)').run(s.name, s.price, s.duration, s.icon);
    }
    console.log(`✅ تم إضافة ${services.length} خدمات افتراضية`);
  } else {
    console.log('ℹ️  الخدمات موجودة مسبقاً');
  }

  const barberStatus = prepare('SELECT id FROM barber_status WHERE id = 1').get();
  if (!barberStatus) {
    prepare('INSERT INTO barber_status (id, status) VALUES (1, "available")').run();
    console.log('✅ تم تعيين حالة الحلاق (متاح)');
  } else {
    console.log('ℹ️  حالة الحلاق موجودة مسبقاً');
  }

  const settings = prepare('SELECT id FROM settings WHERE id = 1').get();
  if (!settings) {
    prepare('INSERT INTO settings (id) VALUES (1)').run();
    console.log('✅ تم إضافة الإعدادات الافتراضية');
  } else {
    console.log('ℹ️  الإعدادات موجودة مسبقاً');
  }

  const existingRewards = prepare('SELECT COUNT(*) as count FROM loyalty_rewards').get();
  if (existingRewards.count === 0) {
    const rewards = [
      { name: 'خصم 5 دنانير', description: 'خصم مباشر على أي خدمة', points_required: 500, reward_type: 'discount', reward_value: 5 },
      { name: 'قصة شعر مجانية', description: 'خدمة قصة شعر مجانية', points_required: 1000, reward_type: 'free_service', reward_value: 0, service_id: 1 },
      { name: 'صبغة مجانية', description: 'خدمة صبغة شعر مجانية', points_required: 3000, reward_type: 'free_service', reward_value: 0, service_id: 4 },
      { name: 'مضاعفة النقاط', description: 'ضعف النقاط للزيارة القادمة', points_required: 300, reward_type: 'bonus_points', reward_value: 2 },
    ];
    for (const r of rewards) {
      prepare('INSERT INTO loyalty_rewards (name, description, points_required, reward_type, reward_value, service_id) VALUES (?, ?, ?, ?, ?, ?)').run(
        r.name, r.description, r.points_required, r.reward_type, r.reward_value, r.service_id || null
      );
    }
    console.log(`✅ تم إضافة ${rewards.length} مكافآت ولاء`);
  } else {
    console.log('ℹ️  المكافآت موجودة مسبقاً');
  }

  const existingCoupons = prepare('SELECT COUNT(*) as count FROM coupons').get();
  if (existingCoupons.count === 0) {
    const today = new Date().toISOString().split('T')[0];
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const nextMonthStr = nextMonth.toISOString().split('T')[0];
    const endYear = new Date();
    endYear.setFullYear(endYear.getFullYear() + 1);
    const endYearStr = endYear.toISOString().split('T')[0];

    const coupons = [
      { code: 'SUMMER30', description: 'عرض الصيف: خصم 30% على جميع الخدمات', discount_type: 'percentage', discount_value: 30, min_order: 0, usage_limit: 100, valid_from: today, valid_until: nextMonthStr },
      { code: 'NEW20', description: 'ترحيب بالزباين الجدد: خصم 20%', discount_type: 'percentage', discount_value: 20, min_order: 0, usage_limit: null, valid_from: today, valid_until: endYearStr },
      { code: 'FRIENDS', description: 'خصم الأصدقاء: 15% على أول زيارة', discount_type: 'percentage', discount_value: 15, min_order: 0, usage_limit: null, valid_from: today, valid_until: endYearStr },
    ];
    for (const c of coupons) {
      prepare('INSERT INTO coupons (code, description, discount_type, discount_value, min_order, usage_limit, valid_from, valid_until) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
        c.code, c.description, c.discount_type, c.discount_value, c.min_order, c.usage_limit, c.valid_from, c.valid_until
      );
    }
    console.log(`✅ تم إضافة ${coupons.length} كوبونات`);
  } else {
    console.log('ℹ️  الكوبونات موجودة مسبقاً');
  }

  const existingNotifSettings = prepare('SELECT id FROM notification_settings WHERE id = 1').get();
  if (!existingNotifSettings) {
    prepare('INSERT INTO notification_settings (id) VALUES (1)').run();
    console.log('✅ تم إضافة إعدادات الإشعارات');
  }

  save();
  console.log('🎉 تم تهيئة قاعدة البيانات بنجاح!');
}

if (require.main === module) {
  init().catch(err => {
    console.error('❌ خطأ:', err);
    process.exit(1);
  });
}

module.exports = { initDb: init };
