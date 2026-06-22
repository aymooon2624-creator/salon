document.addEventListener('DOMContentLoaded', () => {
  if (!isLoggedIn()) return;
  loadCoupons();
  document.getElementById('validateCouponForm').addEventListener('submit', validateCoupon);
});

async function loadCoupons() {
  try {
    const coupons = await apiRequest('/coupons/active');
    const container = document.getElementById('couponsList');

    if (coupons.length === 0) {
      container.innerHTML = '<div class="empty-state"><span class="empty-icon">🎟️</span>لا توجد عروض حالياً</div>';
      return;
    }

    container.innerHTML = coupons.map(c => {
      const discountStr = c.discount_type === 'percentage' ? `${c.discount_value}%` : `${c.discount_value} دينار`;
      const validUntil = new Date(c.valid_until).toLocaleDateString('ar-SA');
      return `
        <div class="coupon-card">
          <div class="coupon-header">
            <span class="coupon-code">${c.code}</span>
            <span class="coupon-discount">${discountStr}</span>
          </div>
          ${c.description ? `<div class="coupon-desc">${c.description}</div>` : ''}
          <div class="coupon-footer">
            <span style="color:var(--text-secondary);font-size:13px;">صالح حتى ${validUntil}</span>
            <button class="btn btn-warning btn-sm" onclick="copyCode('${c.code}')">📋 نسخ الكود</button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error(err);
  }
}

function copyCode(code) {
  navigator.clipboard.writeText(code).then(() => {
    showToast('📋 تم نسخ الكود: ' + code, 'success');
  }).catch(() => {
    showToast('❌ فشل النسخ', 'error');
  });
}

async function validateCoupon(e) {
  e.preventDefault();
  const code = document.getElementById('couponCode').value;
  const resultEl = document.getElementById('couponResult');

  try {
    const data = await apiRequest('/coupons/validate', {
      method: 'POST',
      body: JSON.stringify({ code })
    });
    const discountStr = data.coupon.discount_type === 'percentage' ? `${data.coupon.discount_value}%` : `${data.coupon.discount_value} دينار`;
    resultEl.innerHTML = `
      <div style="background:rgba(46,204,113,0.1);border:1px solid var(--success);border-radius:12px;padding:16px;margin-top:12px;">
        <strong style="color:var(--success);">✅ كود صالح!</strong><br>
        الخصم: ${discountStr}
        ${data.coupon.description ? `<br><span style="color:var(--text-secondary);font-size:13px;">${data.coupon.description}</span>` : ''}
      </div>
    `;
  } catch (err) {
    resultEl.innerHTML = `
      <div style="background:rgba(231,76,60,0.1);border:1px solid var(--danger);border-radius:12px;padding:16px;margin-top:12px;">
        <strong style="color:var(--danger);">❌ ${err.message}</strong>
      </div>
    `;
  }
}
