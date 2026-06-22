let selectedServices = new Set();
let servicesData = [];
let appliedCoupon = null;
let appliedCouponDiscount = 0;
let useLoyaltyPoints = false;
let userPointsBalance = 0;

async function getAutoCancelMinutes() {
  try {
    const res = await fetch('/api/settings/public');
    const data = await res.json();
    return data.auto_cancel_minutes || 5;
  } catch (err) {
    return 5;
  }
}

async function showAutoCancelNotice() {
  const minutes = await getAutoCancelMinutes();
  const el = document.getElementById('autoCancelNotice');
  const timeEl = document.getElementById('autoCancelTime');
  if (el && timeEl) {
    timeEl.textContent = minutes;
    el.style.display = 'block';
  }
}

async function loadServices() {
  try {
    servicesData = await apiRequest('/services');
    const container = document.getElementById('servicesList');
    container.innerHTML = servicesData.map(s => `
      <div class="service-item" data-id="${s.id}" onclick="toggleService(${s.id})">
        <span class="service-icon">${s.icon}</span>
        <div class="service-info">
          <div class="service-name">${s.name}</div>
          <div class="service-meta">${s.price} دينار - ${s.duration} دقيقة</div>
        </div>
        <div class="service-check" id="check-${s.id}">⬜</div>
      </div>
    `).join('');
  } catch (err) {
    showToast('فشل تحميل الخدمات', 'error');
  }
}

function toggleService(id) {
  const el = document.querySelector(`.service-item[data-id="${id}"]`);
  const check = document.getElementById(`check-${id}`);
  if (selectedServices.has(id)) {
    selectedServices.delete(id);
    el.classList.remove('selected');
    check.textContent = '⬜';
  } else {
    selectedServices.add(id);
    el.classList.add('selected');
    check.textContent = '✅';
  }
  updateSummary();
}

function getSubtotal() {
  let total = 0;
  selectedServices.forEach(id => {
    const service = servicesData.find(s => s.id === id);
    if (service) total += service.price;
  });
  return total;
}

function getTotalDuration() {
  let total = 0;
  selectedServices.forEach(id => {
    const service = servicesData.find(s => s.id === id);
    if (service) total += service.duration;
  });
  return total;
}

async function applyCoupon() {
  const code = document.getElementById('couponInput').value.trim();
  if (!code) return;
  try {
    const subtotal = getSubtotal();
    const data = await apiRequest('/coupons/validate', {
      method: 'POST',
      body: JSON.stringify({ code, order_total: subtotal })
    });
    appliedCoupon = data.coupon;
    const discountStr = data.coupon.discount_type === 'percentage' ? `${data.coupon.discount_value}%` : `${data.coupon.discount_value} دينار`;
    appliedCouponDiscount = data.discount;
    document.getElementById('couponResult').innerHTML = `
      <div style="background:rgba(46,204,113,0.1);border:1px solid var(--success);border-radius:8px;padding:12px;margin-top:8px;">
        ✅ كود ${code}: خصم ${discountStr} = -${data.discount} دينار
      </div>
    `;
    updateSummary();
  } catch (err) {
    appliedCoupon = null;
    appliedCouponDiscount = 0;
    document.getElementById('couponResult').innerHTML = `
      <div style="background:rgba(231,76,60,0.1);border:1px solid var(--danger);border-radius:8px;padding:12px;margin-top:8px;">
        ❌ ${err.message}
      </div>
    `;
    updateSummary();
  }
}

function toggleLoyalty() {
  useLoyaltyPoints = document.getElementById('useLoyalty').checked;
  updateSummary();
}

async function loadLoyaltyBalance() {
  try {
    const data = await apiRequest('/loyalty/points');
    userPointsBalance = data.balance;
    const el = document.getElementById('loyaltySection');
    if (el && data.balance > 0) {
      el.style.display = 'block';
      document.getElementById('loyaltyLabel').textContent = `🎁 استخدم نقاط الولاء (${data.balance} نقطة = خصم ${data.balance} دينار)`;
    }
  } catch (err) { /* ignore */ }
}

function updateSummary() {
  const box = document.getElementById('summaryBox');
  const totalPriceEl = document.getElementById('totalPrice');
  const totalDurationEl = document.getElementById('totalDuration');
  const confirmBtn = document.getElementById('confirmBtn');
  const discountRow = document.getElementById('discountRow');
  const discountAmountEl = document.getElementById('discountAmount');
  const finalPriceEl = document.getElementById('finalPrice');
  const finalRow = document.getElementById('finalRow');

  if (selectedServices.size === 0) {
    box.style.display = 'none';
    confirmBtn.disabled = true;
    return;
  }

  const subtotal = getSubtotal();
  const duration = getTotalDuration();
  let totalDiscount = appliedCouponDiscount || 0;

  if (useLoyaltyPoints && userPointsBalance > 0) {
    const maxLoyaltyDiscount = Math.min(userPointsBalance, Math.max(0, subtotal - totalDiscount));
    totalDiscount += maxLoyaltyDiscount;
  }

  const finalPrice = Math.max(0, subtotal - totalDiscount);

  totalPriceEl.textContent = `${subtotal} دينار`;
  totalDurationEl.textContent = `${duration} دقيقة`;

  if (totalDiscount > 0) {
    discountRow.style.display = 'flex';
    discountAmountEl.textContent = `-${totalDiscount} دينار`;
    finalRow.style.display = 'flex';
    finalPriceEl.textContent = `${finalPrice} دينار`;
  } else {
    discountRow.style.display = 'none';
    finalRow.style.display = 'none';
  }

  box.style.display = 'block';
  confirmBtn.disabled = false;
}

async function loadSlots() {
  const dateInput = document.getElementById('bookingDate');
  const timeSelect = document.getElementById('bookingTime');
  const date = dateInput.value;
  if (!date) return;
  timeSelect.innerHTML = '<option value="">جاري التحميل...</option>';
  timeSelect.disabled = true;
  try {
    const data = await apiRequest(`/appointments/slots?date=${date}`);
    timeSelect.innerHTML = '<option value="">اختر الوقت</option>';
    if (data.slots.length === 0) {
      timeSelect.innerHTML += '<option value="" disabled>لا توجد مواعيد متاحة</option>';
    } else {
      data.slots.forEach(slot => {
        const [h, m] = slot.split(':');
        const hour = parseInt(h);
        const ampm = hour >= 12 ? 'م' : 'ص';
        const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
        timeSelect.innerHTML += `<option value="${slot}">${displayHour}:${m} ${ampm}</option>`;
      });
    }
  } catch (err) {
    timeSelect.innerHTML = '<option value="">خطأ في التحميل</option>';
    showToast(err.message, 'error');
  }
  timeSelect.disabled = false;
}

async function confirmBooking() {
  const dateInput = document.getElementById('bookingDate');
  const timeSelect = document.getElementById('bookingTime');
  const confirmBtn = document.getElementById('confirmBtn');
  const date = dateInput.value;
  const time = timeSelect.value;

  if (!date || !time) { showToast('اختر التاريخ والوقت', 'error'); return; }
  if (selectedServices.size === 0) { showToast('اختر خدمة واحدة على الأقل', 'error'); return; }

    const autoCancelMinutes = await getAutoCancelMinutes();

    const confirmed = confirm(`⏰ تنبيه مهم:
إذا لم تحضر خلال ${autoCancelMinutes} دقائق من وقت الموعد، سيتم إلغاء الحجز تلقائياً.
هل تريد تأكيد الحجز؟`);
    if (!confirmed) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = '✅ تأكيد الحجز';
      return;
    }

    confirmBtn.disabled = true;
    confirmBtn.textContent = '⏳ جاري الحجز...';

    try {
        const dateTime = `${date}T${time}:00`;
        const body = {
            date_time: dateTime,
            service_ids: Array.from(selectedServices)
        };

        if (appliedCoupon) body.coupon_code = appliedCoupon.code;
        if (useLoyaltyPoints && userPointsBalance > 0) {
            body.loyalty_points = Math.min(userPointsBalance, getSubtotal() - (appliedCouponDiscount || 0));
        }

        await apiRequest('/appointments', { method: 'POST', body: JSON.stringify(body) });
        showToast(`✅ تم حجز الموعد بنجاح! تنبيه: سيتم إلغاؤه تلقائياً بعد ${autoCancelMinutes} دقائق من الموعد`, 'success');
        setTimeout(() => window.location.href = 'index.html', 1000);
    } catch (err) {
        showToast(err.message, 'error');
        confirmBtn.disabled = false;
        confirmBtn.textContent = '✅ تأكيد الحجز';
    }
}

document.addEventListener('DOMContentLoaded', () => {
  if (!isLoggedIn()) return;

  const dateInput = document.getElementById('bookingDate');
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  dateInput.min = tomorrow.toISOString().split('T')[0];
  const maxDate = new Date(today);
  maxDate.setDate(today.getDate() + 30);
  dateInput.max = maxDate.toISOString().split('T')[0];
  if (!dateInput.value) dateInput.value = tomorrow.toISOString().split('T')[0];

  loadServices();
  loadSlots();
  loadLoyaltyBalance();
  showAutoCancelNotice();

  dateInput.addEventListener('change', loadSlots);
  document.getElementById('confirmBtn').addEventListener('click', confirmBooking);
  document.getElementById('applyCouponBtn').addEventListener('click', applyCoupon);
  document.getElementById('useLoyalty').addEventListener('change', toggleLoyalty);
});
