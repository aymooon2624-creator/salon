document.addEventListener('DOMContentLoaded', () => {
  if (!isLoggedIn()) return;
  loadNotifications();
});

async function loadNotifications() {
  try {
    const notifications = await apiRequest('/notifications');
    const container = document.getElementById('notificationsList');

    if (notifications.length === 0) {
      container.innerHTML = '<div class="empty-state"><span class="empty-icon">🔔</span>لا توجد إشعارات</div>';
      return;
    }

    const typeIcons = {
      reminder: '⏰',
      loyalty: '🎁',
      promo: '🎟️',
      chat: '💬'
    };

    container.innerHTML = notifications.map(n => `
      <div class="appointment-card fade-in" style="${n.is_read ? 'opacity:0.7;' : 'border-color:var(--accent);'}">
        <div class="app-header">
          <span>${typeIcons[n.type] || '🔔'} <strong>${n.title}</strong></span>
          <span style="color:var(--text-secondary);font-size:13px;">${new Date(n.sent_at).toLocaleDateString('ar-SA')}</span>
        </div>
        <div class="app-services">${n.message}</div>
        <div class="app-footer">
          <span style="color:var(--text-secondary);font-size:13px;">${new Date(n.sent_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</span>
          <div class="flex gap-8">
            ${!n.is_read ? `<button class="btn btn-secondary btn-sm" onclick="markAsRead(${n.id})">✅ قرأت</button>` : ''}
            <button class="btn btn-danger btn-sm" onclick="deleteNotif(${n.id})">🗑️</button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

async function markAsRead(id) {
  try {
    await apiRequest(`/notifications/${id}/read`, { method: 'PUT' });
    loadNotifications();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function markAllAsRead() {
  try {
    await apiRequest('/notifications/read-all', { method: 'PUT' });
    showToast('✅ تم تحديد الكل كمقروء', 'success');
    loadNotifications();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteNotif(id) {
  try {
    await apiRequest(`/notifications/${id}`, { method: 'DELETE' });
    loadNotifications();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function getUnreadCount() {
  try {
    const data = await apiRequest('/notifications/unread');
    return data.count;
  } catch (err) {
    return 0;
  }
}
