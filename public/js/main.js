async function loadBarberStatus() {
  try {
    const status = await apiRequest('/status');
    const badge = document.getElementById('barberStatus');
    const statusText = document.getElementById('statusText');
    const statusBadge = document.getElementById('statusBadge');

    if (badge) {
      badge.className = `status-badge status-${status.status}`;
      const labels = { available: '🟢 متاح', busy: '🔴 مشغول', away: '⏸️ خارج' };
      badge.textContent = labels[status.status] || '🟢 متاح';
    }

    if (statusText) {
      const texts = {
        available: 'الحلاق متاح حالياً',
        busy: 'الحلاق مشغول حالياً',
        away: status.back_at ? `الحلاق خارج المحل، سيعود الساعة ${status.back_at}` : 'الحلاق خارج المحل'
      };
      statusText.textContent = texts[status.status] || 'الحلاق متاح حالياً';
    }

    if (statusBadge) {
      statusBadge.className = `status-badge status-${status.status}`;
      const labels = { available: '🟢 متاح', busy: '🔴 مشغول', away: '⏸️ خارج' };
      statusBadge.textContent = labels[status.status] || '🟢 متاح';
    }
  } catch (err) {
    console.error('فشل تحميل حالة الحلاق:', err);
  }
}

async function loadMyAppointments() {
  try {
    const appointments = await apiRequest('/appointments');
    const container = document.getElementById('appointmentsList');

    if (!container) return;

    if (appointments.length === 0) {
      container.innerHTML = '<div class="empty-state"><span class="empty-icon">📅</span>لا توجد مواعيد حتى الآن</div>';
      return;
    }

    container.innerHTML = appointments.slice(0, 10).map(app => {
      const date = new Date(app.date_time);
      const servicesHTML = app.services.map(s => s.icon).join(' ');
      const statusLabels = {
        pending: '⏳ قيد الانتظار',
        confirmed: '✅ تم التأكيد',
        completed: '✔️ منجز',
        cancelled: '❌ ملغي',
        auto_cancelled: '⚠️ ملغي تلقائياً'
      };

      const dateTime = new Date(app.date_time);
      const now = new Date();
      const timeUntil = dateTime - now;
      const isSoon = app.status === 'pending' && timeUntil > 0 && timeUntil < 3600000;

      return `
        <div class="appointment-card fade-in">
          <div class="app-header">
            <span class="app-date">📅 ${date.toLocaleDateString('ar-SA')} - ${date.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</span>
            <span class="status-badge status-${app.status}">${statusLabels[app.status] || app.status}</span>
          </div>
          <div class="app-services">${servicesHTML} - ${app.total_price} دينار - ${app.total_duration} دقيقة</div>
          ${app.status === 'pending' ? `<div style="margin-top:8px;padding:8px 12px;background:rgba(243,156,18,0.1);border-radius:8px;font-size:13px;color:var(--warning);">⏰ سيتم إلغاء هذا الموعد تلقائياً إذا لم تحضر في الوقت المحدد</div>` : ''}
          ${isSoon ? '<div style="margin-top:8px;text-align:center;font-size:18px;">⏰ موعدك باقي له أقل من ساعة!</div>' : ''}
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('فشل تحميل المواعيد:', err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (isLoggedIn()) {
    loadBarberStatus();
    loadMyAppointments();
    setInterval(loadBarberStatus, 30000);
  }
});
