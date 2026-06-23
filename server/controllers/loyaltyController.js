const { getDb } = require('../database');

async function getPoints(req, res) {
  const { prepare } = await getDb();
  const totalRow = await prepare('SELECT COALESCE(SUM(points), 0) as total FROM loyalty_points WHERE customer_id = ? AND type IN (\'earned\', \'bonus\')').get(req.user.id);
  const redeemedRow = await prepare('SELECT COALESCE(SUM(ABS(points)), 0) as total FROM loyalty_points WHERE customer_id = ? AND type = \'redeemed\'').get(req.user.id);
  const balance = (totalRow.total || 0) - (redeemedRow.total || 0);

  const thisMonth = await prepare(`
    SELECT COALESCE(SUM(points), 0) as total FROM loyalty_points
    WHERE customer_id = ? AND type IN ('earned', 'bonus')
    AND to_char(created_at, 'YYYY-MM') = to_char(NOW(), 'YYYY-MM')
  `).get(req.user.id);

  res.json({ balance, total_earned: totalRow.total || 0, total_redeemed: redeemedRow.total || 0, this_month: thisMonth.total || 0 });
}

async function getHistory(req, res) {
  const { prepare } = await getDb();
  const history = await prepare(`
    SELECT lp.*, a.date_time as appointment_date
    FROM loyalty_points lp
    LEFT JOIN appointments a ON lp.appointment_id = a.id
    WHERE lp.customer_id = ?
    ORDER BY lp.created_at DESC
    LIMIT 50
  `).all(req.user.id);
  res.json(history);
}

async function getRewards(req, res) {
  const { prepare } = await getDb();
  const rewards = await prepare('SELECT * FROM loyalty_rewards WHERE is_active = 1').all();
  res.json(rewards);
}

async function redeem(req, res) {
  const { reward_id } = req.body;
  if (!reward_id) return res.status(400).json({ error: 'المكافأة مطلوبة' });

  const { prepare, save } = await getDb();

  const reward = await prepare('SELECT * FROM loyalty_rewards WHERE id = ? AND is_active = 1').get(reward_id);
  if (!reward) return res.status(404).json({ error: 'المكافأة غير موجودة' });

  const totalEarned = await prepare('SELECT COALESCE(SUM(points), 0) as total FROM loyalty_points WHERE customer_id = ? AND type IN (\'earned\', \'bonus\')').get(req.user.id);
  const totalRedeemed = await prepare('SELECT COALESCE(SUM(ABS(points)), 0) as total FROM loyalty_points WHERE customer_id = ? AND type = \'redeemed\'').get(req.user.id);
  const balance = (totalEarned.total || 0) - (totalRedeemed.total || 0);

  if (balance < reward.points_required) {
    return res.status(400).json({ error: `نقاط غير كافية. تحتاج ${reward.points_required} نقطة` });
  }

  await prepare('INSERT INTO loyalty_points (customer_id, points, type, description) VALUES (?, ?, ?, ?)').run(
    req.user.id, -reward.points_required, 'redeemed', `استبدال: ${reward.name}`
  );
  save();

  const description = reward.reward_type === 'discount' ? `خصم ${reward.reward_value} دينار` :
    reward.reward_type === 'free_service' ? 'خدمة مجانية' :
    reward.reward_type === 'bonus_points' ? `مضاعفة نقاط` : reward.name;

  res.json({ message: `✅ تم استبدال ${reward.points_required} نقطة بنجاح! ${description}`, reward });
}

async function addPoints(customerId, points, type, description, appointmentId) {
  const { prepare, save } = await getDb();
  await prepare('INSERT INTO loyalty_points (customer_id, points, type, description, appointment_id) VALUES (?, ?, ?, ?, ?)').run(
    customerId, points, type, description, appointmentId
  );
  save();
}

module.exports = { getPoints, getHistory, getRewards, redeem, addPoints };
