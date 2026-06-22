document.addEventListener('DOMContentLoaded', () => {
  if (!isLoggedIn()) return;
  loadPoints();
  loadHistory();
  loadRewards();
});

async function loadPoints() {
  try {
    const data = await apiRequest('/loyalty/points');
    document.getElementById('pointsBalance').textContent = data.balance;
    document.getElementById('totalEarned').textContent = data.total_earned;
    document.getElementById('totalRedeemed').textContent = data.total_redeemed;
    document.getElementById('thisMonth').textContent = data.this_month;
  } catch (err) {
    console.error(err);
  }
}

async function loadHistory() {
  try {
    const history = await apiRequest('/loyalty/history');
    const container = document.getElementById('pointsHistory');
    if (history.length === 0) {
      container.innerHTML = '<div class="empty-state"><span class="empty-icon">🎁</span>لا يوجد سجل نقاط</div>';
      return;
    }
    container.innerHTML = history.map(h => `
      <div class="chat-message" style="margin-bottom:8px;padding:12px;">
        <div style="display:flex;justify-content:space-between;">
          <span style="color:${h.points > 0 ? 'var(--success)' : 'var(--danger)'};font-weight:700;">
            ${h.points > 0 ? '+'+h.points : h.points} نقطة
          </span>
          <span style="color:var(--text-secondary);font-size:13px;">
            ${new Date(h.created_at).toLocaleDateString('ar-SA')}
          </span>
        </div>
        <div style="font-size:14px;color:var(--text-secondary);margin-top:4px;">${h.description || ''}</div>
      </div>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

async function loadRewards() {
  try {
    const rewards = await apiRequest('/loyalty/rewards');
    const container = document.getElementById('rewardsList');
    const ptsEl = document.getElementById('pointsBalance');
    const balance = parseInt(ptsEl ? ptsEl.textContent : '0');

    if (rewards.length === 0) {
      container.innerHTML = '<div class="empty-state"><span class="empty-icon">🎁</span>لا توجد مكافآت متاحة</div>';
      return;
    }

    container.innerHTML = rewards.map(r => {
      const canAfford = balance >= r.points_required;
      const pct = Math.min(100, (balance / r.points_required) * 100);
      const need = r.points_required - balance;
      return `
        <div class="reward-card ${canAfford ? 'reward-available' : ''}">
          <div class="reward-header">
            <span class="reward-name">${r.name}</span>
            <span class="reward-points">${r.points_required} نقطة</span>
          </div>
          ${r.description ? `<div class="reward-desc">${r.description}</div>` : ''}
          <div class="reward-progress">
            <div class="reward-progress-bar" style="width:${Math.min(100, pct)}%"></div>
          </div>
          ${!canAfford ? `<div style="font-size:13px;color:var(--danger);margin-top:8px;">تحتاج ${need} نقطة إضافية</div>` : ''}
          <button class="btn ${canAfford ? 'btn-success' : 'btn-secondary'}" style="width:100%;margin-top:12px;" ${canAfford ? '' : 'disabled'}
            onclick="redeemReward(${r.id}, '${r.name}', ${r.points_required})">
            ${canAfford ? '🎁 استبدل الآن' : '🔒 نقاط غير كافية'}
          </button>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error(err);
  }
}

async function redeemReward(id, name, points) {
  if (!confirm(`هل تريد استبدال ${points} نقطة مقابل "${name}"؟`)) return;
  try {
    const data = await apiRequest('/loyalty/redeem', {
      method: 'POST',
      body: JSON.stringify({ reward_id: id })
    });
    showToast(data.message, 'success');
    loadPoints();
    loadHistory();
    loadRewards();
  } catch (err) {
    showToast(err.message, 'error');
  }
}
