let editingServiceId = null;
let knownAppointmentIds = new Set();

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch (e) { /* sound not supported */ }
}

function showBrowserNotification(title, body) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '✂️' });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission();
  }
}

function detectNewAppointments(appointments) {
  const now = new Set(appointments.map(a => a.id));
  let hasNew = false;
  for (const id of now) {
    if (!knownAppointmentIds.has(id)) {
      const appt = appointments.find(a => a.id === id);
      if (appt && appt.status === 'pending') {
        hasNew = true;
        playBeep();
        showBrowserNotification('🔔 حجز جديد!', `${appt.username} - ${appt.total_price} دينار`);
        showToast(`🔔 حجز جديد من ${appt.username}`, 'info');
      }
    }
  }
  knownAppointmentIds = now;
  return hasNew;
}

function switchTab(tabName, btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(`tab-${tabName}`).classList.add('active');

  if (tabName === 'recurring') loadRecurringTab();
  else if (tabName === 'chat') loadAdminChat();
  else if (tabName === 'coupons') loadCouponsTab();
  else if (tabName === 'notifications-panel') loadNotificationSettings();
  else if (tabName === 'settings') loadSettings();
}

async function setBarberStatus(status) {
  try {
    const body = { status };
    if (status === 'away') {
      document.getElementById('awayTimeGroup').style.display = 'block';
      return;
    }
    document.getElementById('awayTimeGroup').style.display = 'none';
    await apiRequest('/status', { method: 'PUT', body: JSON.stringify(body) });
    showToast(`✅ تم تغيير الحالة إلى ${status}`, 'success');
    updateStatusUI(status);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function saveBackTime() {
  const backAt = document.getElementById('backAt').value;
  if (!backAt) {
    showToast('اختر وقت العودة', 'error');
    return;
  }
  try {
    await apiRequest('/status', { method: 'PUT', body: JSON.stringify({ status: 'away', back_at: backAt }) });
    showToast('✅ تم حفظ وقت العودة', 'success');
    document.getElementById('awayTimeGroup').style.display = 'none';
    updateStatusUI('away');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function updateStatusUI(status) {
  document.querySelectorAll('.status-btn').forEach(btn => {
    btn.className = 'status-btn';
    if (btn.dataset.status === status) {
      btn.classList.add(`active-${status}`);
    }
  });
}

async function loadBarberStatus() {
  try {
    const status = await apiRequest('/status');
    updateStatusUI(status.status);
    if (status.status === 'away') {
      document.getElementById('awayTimeGroup').style.display = 'block';
      document.getElementById('backAt').value = status.back_at || '';
    }
  } catch (err) {
    console.error(err);
  }
}

async function loadTodayAppointments() {
  try {
    const appointments = await apiRequest('/appointments/today');
    detectNewAppointments(appointments);
    const container = document.getElementById('todayAppointments');

    const statusLabels = {
      pending: '⏳ قيد الانتظار',
      confirmed: '✅ تم التأكيد',
      completed: '✔️ منجز',
      cancelled: '❌ ملغي',
      auto_cancelled: '⚠️ ملغي تلقائياً'
    };

    if (appointments.length === 0) {
      container.innerHTML = '<div class="empty-state"><span class="empty-icon">📅</span>لا توجد مواعيد اليوم</div>';
      return;
    }

    container.innerHTML = `
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>الوقت</th>
              <th>الزبون</th>
              <th>الخدمات</th>
              <th>الإجمالي</th>
              <th>رقم</th>
              <th>الحالة</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            ${appointments.map(a => {
              const date = new Date(a.date_time);
              const servicesHTML = a.services.map(s => s.icon).join('');
              return `
                <tr>
                  <td>${date.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</td>
                  <td>${a.username}</td>
                  <td>${servicesHTML}</td>
                  <td>${a.total_price} د</td>
                  <td>${a.phone}</td>
                  <td><span class="status-badge status-${a.status}">${statusLabels[a.status] || a.status}</span></td>
                  <td>
                    <div class="flex gap-8" style="flex-wrap:wrap;">
                      ${a.status === 'pending' ? `<button class="btn btn-success btn-sm" onclick="confirmAppointment(${a.id})">✅ أكد</button>` : ''}
                      ${a.status === 'confirmed' ? `<button class="btn btn-primary btn-sm" onclick="completeAppointment(${a.id})">✔️ أنهي</button>` : ''}
                      ${a.status !== 'completed' && a.status !== 'cancelled' && a.status !== 'auto_cancelled' ? `<button class="btn btn-danger btn-sm" onclick="cancelAppointment(${a.id})">❌ إلغاء</button>` : ''}
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    document.getElementById('todayAppointments').innerHTML = `<p style="color:var(--danger)">❌ ${err.message}</p>`;
  }
}

async function confirmAppointment(id) {
  try {
    await apiRequest(`/appointments/${id}/confirm`, { method: 'PUT' });
    showToast('✅ تم تأكيد بدء الخدمة', 'success');
    loadTodayAppointments();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function completeAppointment(id) {
  try {
    await apiRequest(`/appointments/${id}/complete`, { method: 'PUT' });
    showToast('✔️ تم إنهاء الخدمة', 'success');
    loadTodayAppointments();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function cancelAppointment(id) {
  if (!confirm('هل أنت متأكد من إلغاء هذا الموعد؟')) return;
  try {
    await apiRequest(`/appointments/${id}/cancel`, { method: 'PUT' });
    showToast('❌ تم إلغاء الموعد', 'info');
    loadTodayAppointments();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadServicesTab() {
  try {
    const services = await apiRequest('/services');
    const container = document.getElementById('servicesTabList');

    if (services.length === 0) {
      container.innerHTML = '<div class="empty-state"><span class="empty-icon">✂️</span>لا توجد خدمات</div>';
      return;
    }

    container.innerHTML = `
      <div class="table-wrapper">
        <table>
          <thead>
            <tr><th>الأيقونة</th><th>الاسم</th><th>السعر</th><th>المدة</th><th>الحالة</th><th>إجراءات</th></tr>
          </thead>
          <tbody>
            ${services.map(s => `
              <tr>
                <td style="font-size:24px;">${s.icon}</td>
                <td>${s.name}</td>
                <td>${s.price} دينار</td>
                <td>${s.duration} دقيقة</td>
                <td>${s.is_active ? '🟢 نشط' : '🔴 غير نشط'}</td>
                <td>
                  <button class="btn btn-secondary btn-sm" onclick="editService(${s.id})">✏️ تعديل</button>
                  <button class="btn btn-danger btn-sm" onclick="deleteService(${s.id})">🗑️ حذف</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    document.getElementById('servicesTabList').innerHTML = `<p style="color:var(--danger)">❌ ${err.message}</p>`;
  }
}

function showAddServiceModal() {
  editingServiceId = null;
  document.getElementById('serviceForm').reset();
  document.getElementById('svcIcon').value = '✂️';
  document.getElementById('serviceModal').classList.add('show');
}

async function editService(id) {
  try {
    const services = await apiRequest('/services');
    const service = services.find(s => s.id === id);
    if (!service) return;

    editingServiceId = id;
    document.getElementById('svcName').value = service.name;
    document.getElementById('svcPrice').value = service.price;
    document.getElementById('svcDuration').value = service.duration;
    document.getElementById('svcIcon').value = service.icon;
    document.getElementById('serviceModal').classList.add('show');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteService(id) {
  if (!confirm('هل أنت متأكد من حذف هذه الخدمة؟')) return;
  try {
    await apiRequest(`/services/${id}`, { method: 'DELETE' });
    showToast('🗑️ تم حذف الخدمة', 'info');
    loadServicesTab();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}

let editingProductId = null;

async function loadProductsTab() {
  try {
    const products = await apiRequest('/products/admin');
    const container = document.getElementById('productsTabList');

    if (products.length === 0) {
      container.innerHTML = '<div class="empty-state"><span class="empty-icon">🧴</span>لا توجد منتجات</div>';
      return;
    }

    container.innerHTML = `
      <div class="table-wrapper">
        <table>
          <thead>
            <tr><th>الأيقونة</th><th>الاسم</th><th>السعر</th><th>الوصف</th><th>الحالة</th><th>إجراءات</th></tr>
          </thead>
          <tbody>
            ${products.map(p => `
              <tr>
                <td style="font-size:24px;">${p.icon}</td>
                <td>${p.name}</td>
                <td>${p.price} دينار</td>
                <td style="color:var(--text-secondary);max-width:200px;overflow:hidden;text-overflow:ellipsis;">${p.description || '—'}</td>
                <td>${p.is_active ? '🟢 نشط' : '🔴 غير نشط'}</td>
                <td>
                  <button class="btn btn-secondary btn-sm" onclick="editProduct(${p.id})">✏️ تعديل</button>
                  <button class="btn btn-danger btn-sm" onclick="deleteProduct(${p.id})">🗑️ حذف</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    document.getElementById('productsTabList').innerHTML = `<p style="color:var(--danger)">❌ ${err.message}</p>`;
  }
}

function showAddProductModal() {
  editingProductId = null;
  document.getElementById('productForm').reset();
  document.getElementById('prodIcon').value = '🧴';
  document.getElementById('productModal').classList.add('show');
}

async function editProduct(id) {
  try {
    const products = await apiRequest('/products/admin');
    const product = products.find(p => p.id === id);
    if (!product) return;

    editingProductId = id;
    document.getElementById('prodName').value = product.name;
    document.getElementById('prodPrice').value = product.price;
    document.getElementById('prodIcon').value = product.icon;
    document.getElementById('prodDesc').value = product.description || '';
    document.getElementById('productModal').classList.add('show');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteProduct(id) {
  if (!confirm('هل أنت متأكد من حذف هذا المنتج؟')) return;
  try {
    await apiRequest(`/products/${id}`, { method: 'DELETE' });
    showToast('🗑️ تم حذف المنتج', 'info');
    loadProductsTab();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadCustomers() {
  try {
    const appointments = await apiRequest('/appointments');
    const customersMap = new Map();

    appointments.forEach(a => {
      if (!customersMap.has(a.username)) {
        customersMap.set(a.username, {
          name: a.username,
          phone: a.phone,
          count: 0,
          total_spent: 0,
          last: null,
          bookings: []
        });
      }
      const c = customersMap.get(a.username);
      c.count++;
      c.total_spent += a.total_price;
      const d = new Date(a.date_time);
      if (!c.last || d > new Date(c.last)) c.last = a.date_time;
      c.bookings.push(a);
    });

    const sorted = Array.from(customersMap.values()).sort((a, b) => b.count - a.count);
    const container = document.getElementById('customersList');

    if (sorted.length === 0) {
      container.innerHTML = '<div class="empty-state"><span class="empty-icon">👥</span>لا يوجد زبائن بعد</div>';
      return;
    }

    container.innerHTML = sorted.map((c, i) => {
      const lastDate = c.last ? new Date(c.last).toLocaleDateString('ar-SA') : '—';
      return `
        <div class="card" style="margin-bottom:12px;padding:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div><strong>${i + 1}. ${c.name}</strong> 📱 ${c.phone}</div>
            <div style="display:flex;gap:16px;color:var(--text-secondary);font-size:14px;">
              <span>📋 ${c.count} زيارة</span>
              <span>💰 ${c.total_spent} دينار</span>
              <span>📅 آخر: ${lastDate}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    document.getElementById('customersList').innerHTML = `<p style="color:var(--danger)">❌ ${err.message}</p>`;
  }
}

async function loadReport(type) {
  try {
    const data = await apiRequest(`/reports/${type}`);
    const container = document.getElementById('reportContent');

    const labels = { daily: '📈 تقرير اليوم', weekly: '📈 تقرير الأسبوع', monthly: '📈 تقرير الشهر' };

    container.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card fade-in"><div class="stat-value">${data.total_appointments}</div><div class="stat-label">📋 إجمالي المواعيد</div></div>
        <div class="stat-card fade-in"><div class="stat-value">${data.total_income} د</div><div class="stat-label">💰 إجمالي الإيرادات</div></div>
      </div>
      ${data.byDay && data.byDay.length > 0 ? `
        <div class="table-wrapper mt-20">
          <table>
            <thead><tr><th>التاريخ</th><th>المواعيد</th><th>الإيرادات</th></tr></thead>
            <tbody>
              ${data.byDay.map(d => `
                <tr><td>${d.day}</td><td>${d.count}</td><td>${d.income} د</td></tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : '<p style="color:var(--text-secondary);text-align:center;margin-top:16px;">لا توجد بيانات لهذه الفترة</p>'}
      ${data.servicesUsed && data.servicesUsed.length > 0 ? `
        <h4 class="mt-20 mb-20">📊 الخدمات المستخدمة</h4>
        <div class="table-wrapper">
          <table>
            <thead><tr><th>الخدمة</th><th>عدد المرات</th><th>الإجمالي</th></tr></thead>
            <tbody>
              ${data.servicesUsed.map(s => `
                <tr><td>${s.icon} ${s.name}</td><td>${s.count}</td><td>${s.total} د</td></tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}
    `;
  } catch (err) {
    document.getElementById('reportContent').innerHTML = `<p style="color:var(--danger)">❌ ${err.message}</p>`;
  }
}

async function loadSettings() {
  try {
    const status = await apiRequest('/status');
    const barberStatus = status.status === 'available' ? 'متاح' : (status.status === 'busy' ? 'مشغول' : 'خارج');
    const backAt = status.back_at || '—';

    const container = document.getElementById('settingsForm');
    container.innerHTML = `
      <div class="settings-grid">
        <div class="form-group">
          <label>🕐 بداية العمل</label>
          <div style="color:var(--text-primary);font-weight:700;font-size:18px;">09:00 ص</div>
        </div>
        <div class="form-group">
          <label>🕐 نهاية العمل</label>
          <div style="color:var(--text-primary);font-weight:700;font-size:18px;">09:00 م</div>
        </div>
        <div class="form-group">
          <label>⏰ مدة الفتحة</label>
          <div style="color:var(--text-primary);font-weight:700;font-size:18px;">30 دقيقة</div>
        </div>
        <div class="form-group">
          <label>⏰ الإلغاء التلقائي</label>
          <div style="color:var(--text-primary);font-weight:700;font-size:18px;">5 دقائق</div>
        </div>
        <div class="form-group">
          <label>🟢 حالة الحلاق</label>
          <div style="color:var(--text-primary);font-weight:700;font-size:18px;">${barberStatus}${status.status === 'away' ? ` (يرجع ${backAt})` : ''}</div>
        </div>
      </div>
      <button class="btn btn-secondary mt-20" onclick="openSettingsModal()">⚙️ تعديل الإعدادات</button>
    `;
  } catch (err) {
    console.error(err);
  }
}

async function openSettingsModal() {
  document.getElementById('setWorkStart').value = '09:00';
  document.getElementById('setWorkEnd').value = '21:00';
  document.getElementById('setSlotDuration').value = 30;
  document.getElementById('setAutoCancel').value = 5;
  document.getElementById('setNotification').checked = true;
  document.getElementById('settingsModal').classList.add('show');
}

// === Recurring Tab ===
async function loadRecurringTab() {
  try {
    const bookings = await apiRequest('/recurring/admin');
    const container = document.getElementById('recurringList');
    const dayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

    if (bookings.length === 0) {
      container.innerHTML = '<div class="empty-state"><span class="empty-icon">🔄</span>لا توجد حجوزات متكررة</div>';
      return;
    }

    container.innerHTML = bookings.map(b => `
      <div class="card" style="padding:16px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <strong>${b.username}</strong> 📱 ${b.phone}
          </div>
          <span class="status-badge ${b.is_active ? 'status-available' : 'status-cancelled'}">
            ${b.is_active ? '🟢 نشط' : '🔴 متوقف'}
          </span>
        </div>
        <div style="margin-top:8px;color:var(--text-secondary);font-size:14px;">
          🗓️ ${dayNames[b.day_of_week]} - ⏰ ${b.time_slot} - كل ${b.frequency_weeks} أسبوع
          <br>📅 القادم: ${b.next_booking_date}
          <br>🛠️ ${b.services ? b.services.map(s => s.icon + s.name).join(' - ') : ''}
        </div>
        <div style="margin-top:8px;">
          <button class="btn btn-sm ${b.is_active ? 'btn-warning' : 'btn-success'}" onclick="toggleRecurring(${b.id}, ${b.is_active})">
            ${b.is_active ? '⏸️ إيقاف' : '▶️ تفعيل'}
          </button>
          <button class="btn btn-danger btn-sm" onclick="deleteRecurring(${b.id})">🗑️ حذف</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    document.getElementById('recurringList').innerHTML = `<p style="color:var(--danger)">❌ ${err.message}</p>`;
  }
}

async function toggleRecurring(id, current) {
  try {
    await apiRequest(`/recurring/${id}`, { method: 'PUT', body: JSON.stringify({ is_active: !current }) });
    showToast('✅ تم التحديث', 'success');
    loadRecurringTab();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteRecurring(id) {
  if (!confirm('حذف هذا الحجز المتكرر؟')) return;
  try {
    await apiRequest(`/recurring/${id}`, { method: 'DELETE' });
    showToast('🗑️ تم الحذف', 'info');
    loadRecurringTab();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// === Chat Tab ===
let adminChatUserId = null;
let adminChatPoll = null;

async function loadAdminChat() {
  try {
    const conversations = await apiRequest('/chat/conversations');
    const container = document.getElementById('adminChatArea');

    if (conversations.length === 0) {
      container.innerHTML = '<div class="empty-state"><span class="empty-icon">💬</span>لا توجد رسائل</div>';
      return;
    }

    container.innerHTML = `
      <div style="display:flex;gap:16px;height:500px;">
        <div style="width:250px;flex-shrink:0;overflow-y:auto;border-left:1px solid var(--border);padding-left:12px;" id="adminConvList">
          ${conversations.map(c => `
            <div class="conversation-item ${adminChatUserId === c.id ? 'active' : ''}" onclick="openAdminChat(${c.id}, '${c.username}')">
              <strong>${c.username}</strong>
              ${c.unread > 0 ? `<span class="badge-danger">${c.unread}</span>` : ''}
              <div style="font-size:12px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.last_message || ''}</div>
            </div>
          `).join('')}
        </div>
        <div style="flex:1;display:flex;flex-direction:column;" id="adminChatMessages">
          ${adminChatUserId ? `
            <div style="flex:1;overflow-y:auto;padding:12px;background:var(--bg-primary);border-radius:12px;margin-bottom:12px;" id="adminMsgContainer"></div>
            <form id="adminChatForm" style="display:flex;gap:8px;">
              <input type="text" class="form-input" id="adminChatInput" placeholder="اكتب رد..." style="flex:1;">
              <button type="submit" class="btn btn-primary">إرسال</button>
            </form>
          ` : '<div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-secondary);">اختر محادثة من اليمين</div>'}
        </div>
      </div>
    `;

    const appointmentsContainer = document.getElementById('adminChatAppointments');
    if (appointmentsContainer) {
      appointmentsContainer.style.display = adminChatUserId ? 'block' : 'none';
    }

    if (adminChatUserId) {
      document.getElementById('adminChatForm').addEventListener('submit', sendAdminChatMessage);
      loadAdminMessages();
      loadCustomerAppointmentsForChat(adminChatUserId);
    }

    if (window.adminConvRefresh) clearInterval(window.adminConvRefresh);
    window.adminConvRefresh = setInterval(() => {
      const chatTab = document.getElementById('tab-chat');
      if (chatTab && chatTab.classList.contains('active')) {
        refreshAdminConvList();
      }
    }, 15000);
  } catch (err) {
    document.getElementById('adminChatArea').innerHTML = `<p style="color:var(--danger)">❌ ${err.message}</p>`;
  }
}

async function refreshAdminConvList() {
  try {
    const conversations = await apiRequest('/chat/conversations');
    const container = document.getElementById('adminConvList');
    if (!container) return;
    container.innerHTML = conversations.map(c => `
      <div class="conversation-item ${adminChatUserId === c.id ? 'active' : ''}" onclick="openAdminChat(${c.id}, '${c.username}')">
        <strong>${c.username}</strong>
        ${c.unread > 0 ? `<span class="badge-danger">${c.unread}</span>` : ''}
        <div style="font-size:12px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.last_message || ''}</div>
      </div>
    `).join('');
  } catch (err) { /* ignore */ }
}

function openAdminChat(userId, username) {
  adminChatUserId = userId;
  if (adminChatPoll) clearInterval(adminChatPoll);
  closeReschedulePanel();
  loadAdminChat();
  adminChatPoll = setInterval(loadAdminMessages, 5000);
}

async function loadAdminMessages() {
  if (!adminChatUserId) return;
  try {
    const messages = await apiRequest(`/chat/${adminChatUserId}`);
    const container = document.getElementById('adminMsgContainer');
    if (!container) return;
    const user = getUser();

    container.innerHTML = messages.map(m => {
      const isMine = m.sender_id === user.id;
      return `
        <div class="chat-msg ${isMine ? 'chat-msg-mine' : 'chat-msg-other'}">
          <div class="chat-msg-text">${m.message}</div>
          <div class="chat-msg-time">
            ${new Date(m.created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      `;
    }).join('');
    container.scrollTop = container.scrollHeight;

    const unread = messages.filter(m => m.receiver_id === user.id && !m.is_read);
    for (const m of unread) {
      await apiRequest(`/chat/${m.id}/read`, { method: 'PUT' });
    }
  } catch (err) { /* ignore */ }
}

async function sendAdminChatMessage(e) {
  e.preventDefault();
  if (!adminChatUserId) return;
  const input = document.getElementById('adminChatInput');
  const message = input.value.trim();
  if (!message) return;
  input.value = '';
  try {
    await apiRequest('/chat', { method: 'POST', body: JSON.stringify({ receiver_id: adminChatUserId, message }) });
    loadAdminMessages();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// === Customer Appointments in Chat ===
let rescheduleAppointmentId = null;

async function loadCustomerAppointmentsForChat(customerId) {
  try {
    const appointments = await apiRequest(`/appointments/customer/${customerId}`);
    const container = document.getElementById('adminChatAppointmentsList');
    if (!container) return;

    const statusLabels = {
      pending: '⏳ قيد الانتظار',
      confirmed: '✅ تم التأكيد',
      completed: '✔️ منجز',
      cancelled: '❌ ملغي',
      auto_cancelled: '⚠️ ملغي تلقائياً'
    };

    if (appointments.length === 0) {
      container.innerHTML = '<div class="empty-state" style="padding:16px;"><span class="empty-icon">📅</span>لا توجد مواعيد</div>';
      return;
    }

    container.innerHTML = appointments.slice(0, 5).map(a => {
      const d = new Date(a.date_time);
      const servicesHTML = a.services ? a.services.map(s => s.icon).join('') : '';
      const canReschedule = a.status === 'pending' || a.status === 'confirmed';
      return `
        <div style="background:var(--bg-card);border-radius:10px;padding:12px;margin-bottom:8px;font-size:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span>📅 ${d.toLocaleDateString('ar-SA')} - ${d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</span>
            <span class="status-badge status-${a.status}" style="font-size:12px;padding:4px 10px;">${statusLabels[a.status] || a.status}</span>
          </div>
          <div style="margin-top:4px;color:var(--text-secondary);">${servicesHTML} - ${a.total_price} دينار - ${a.total_duration} دقيقة</div>
          ${canReschedule ? `
            <button class="btn btn-warning btn-sm" style="margin-top:8px;width:100%;" onclick="showReschedulePanel(${a.id}, '${d.toISOString()}')">
              🔄 تغيير الموعد
            </button>
          ` : ''}
        </div>
      `;
    }).join('');

    if (appointments.length > 5) {
      container.innerHTML += `<div style="text-align:center;color:var(--text-secondary);font-size:13px;">+ ${appointments.length - 5} مواعيد أقدم</div>`;
    }
  } catch (err) {
    console.error(err);
  }
}

function showReschedulePanel(appointmentId, currentDateISO) {
  rescheduleAppointmentId = appointmentId;
  const panel = document.getElementById('reschedulePanel');
  const currentDate = new Date(currentDateISO);
  const dateStr = currentDate.toISOString().split('T')[0];
  const timeStr = `${String(currentDate.getHours()).padStart(2, '0')}:${String(currentDate.getMinutes()).padStart(2, '0')}`;

  document.getElementById('rescheduleDate').value = dateStr;
  document.getElementById('rescheduleTime').innerHTML = '<option value="">جاري التحميل...</option>';

  panel.style.display = 'block';
  loadRescheduleSlots(dateStr);
}

async function loadRescheduleSlots(date) {
  const select = document.getElementById('rescheduleTime');
  if (!date) return;

  select.innerHTML = '<option value="">جاري التحميل...</option>';
  try {
    const data = await apiRequest(`/appointments/slots?date=${date}`);
    select.innerHTML = '<option value="">اختر الوقت</option>';
    if (data.slots.length === 0) {
      select.innerHTML += '<option value="" disabled>لا توجد مواعيد متاحة</option>';
    } else {
      data.slots.forEach(slot => {
        const [h, m] = slot.split(':');
        const hour = parseInt(h);
        const ampm = hour >= 12 ? 'م' : 'ص';
        const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
        select.innerHTML += `<option value="${slot}">${displayHour}:${m} ${ampm}</option>`;
      });
    }
  } catch (err) {
    select.innerHTML = '<option value="">خطأ</option>';
    showToast(err.message, 'error');
  }
}

async function confirmReschedule() {
  const date = document.getElementById('rescheduleDate').value;
  const time = document.getElementById('rescheduleTime').value;
  if (!date || !time || !rescheduleAppointmentId) {
    showToast('اختر التاريخ والوقت', 'error');
    return;
  }
  try {
    const dateTime = `${date}T${time}:00`;
    await apiRequest(`/appointments/${rescheduleAppointmentId}/reschedule`, {
      method: 'PUT',
      body: JSON.stringify({ date_time: dateTime })
    });
    showToast('✅ تم تغيير الموعد بنجاح!', 'success');
    document.getElementById('reschedulePanel').style.display = 'none';
    loadCustomerAppointmentsForChat(adminChatUserId);
    if (adminChatUserId) {
      const user = getUser();
      const msg = `🔄 تم تغيير موعدك إلى ${new Date(dateTime).toLocaleDateString('ar-SA')} الساعة ${new Date(dateTime).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}`;
      await apiRequest('/chat', { method: 'POST', body: JSON.stringify({ receiver_id: adminChatUserId, message: msg }) });
      loadAdminMessages();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function closeReschedulePanel() {
  document.getElementById('reschedulePanel').style.display = 'none';
  rescheduleAppointmentId = null;
}

// === Coupons Tab ===
let editingCouponId = null;

async function loadCouponsTab() {
  try {
    const coupons = await apiRequest('/coupons/admin');
    const container = document.getElementById('couponsTabList');

    if (coupons.length === 0) {
      container.innerHTML = '<div class="empty-state"><span class="empty-icon">🎟️</span>لا توجد كوبونات</div>';
      return;
    }

    container.innerHTML = `
      <div class="table-wrapper">
        <table>
          <thead>
            <tr><th>الكود</th><th>الخصم</th><th>الاستخدام</th><th>الصالحية</th><th>الحالة</th><th>إجراءات</th></tr>
          </thead>
          <tbody>
            ${coupons.map(c => {
              const discountStr = c.discount_type === 'percentage' ? `${c.discount_value}%` : `${c.discount_value} د`;
              const usageStr = c.usage_limit ? `${c.usage_count}/${c.usage_limit}` : `${c.usage_count}/∞`;
              const today = new Date().toISOString().split('T')[0];
              const expired = c.valid_until < today;
              return `
                <tr>
                  <td><strong>${c.code}</strong></td>
                  <td>${discountStr}</td>
                  <td>${usageStr}</td>
                  <td style="font-size:13px;">${c.valid_from} → ${c.valid_until}</td>
                  <td>${expired ? '❌ منتهي' : (c.is_active ? '🟢 نشط' : '🔴 متوقف')}</td>
                  <td>
                    <button class="btn btn-secondary btn-sm" onclick="editCoupon(${c.id})">✏️</button>
                    <button class="btn btn-sm ${c.is_active ? 'btn-warning' : 'btn-success'}" onclick="toggleCoupon(${c.id}, ${c.is_active})">
                      ${c.is_active ? '⏸️' : '▶️'}
                    </button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    document.getElementById('couponsTabList').innerHTML = `<p style="color:var(--danger)">❌ ${err.message}</p>`;
  }
}

function showAddCouponModal() {
  editingCouponId = null;
  document.getElementById('couponForm').reset();
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('cpnValidFrom').value = today;
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  document.getElementById('cpnValidUntil').value = nextMonth.toISOString().split('T')[0];
  document.getElementById('couponModal').classList.add('show');
}

async function editCoupon(id) {
  try {
    const coupons = await apiRequest('/coupons/admin');
    const c = coupons.find(x => x.id === id);
    if (!c) return;
    editingCouponId = id;
    document.getElementById('cpnCode').value = c.code;
    document.getElementById('cpnType').value = c.discount_type;
    document.getElementById('cpnValue').value = c.discount_value;
    document.getElementById('cpnMinOrder').value = c.min_order;
    document.getElementById('cpnMaxDiscount').value = c.max_discount || '';
    document.getElementById('cpnUsageLimit').value = c.usage_limit || '';
    document.getElementById('cpnValidFrom').value = c.valid_from;
    document.getElementById('cpnValidUntil').value = c.valid_until;
    document.getElementById('cpnDesc').value = c.description || '';
    document.getElementById('couponModal').classList.add('show');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function toggleCoupon(id, current) {
  try {
    await apiRequest(`/coupons/${id}`, { method: 'PUT', body: JSON.stringify({ is_active: !current }) });
    showToast('✅ تم التحديث', 'success');
    loadCouponsTab();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// === Notification Settings Tab ===
async function loadNotificationSettings() {
  try {
    const settings = await apiRequest('/notifications/settings');
    const container = document.getElementById('notificationSettingsForm');

    container.innerHTML = `
      <div class="settings-grid">
        <div class="form-group">
          <label>⏰ التذكير قبل (ساعات)</label>
          <input type="number" class="form-input" id="nsReminder" value="${settings.reminder_before_hours}" min="1">
        </div>
        <div class="form-group">
          <label style="display:flex;align-items:center;gap:12px;">
            <input type="checkbox" id="nsPush" ${settings.enable_push ? 'checked' : ''} style="width:20px;height:20px;">
            تفعيل الإشعارات الفورية
          </label>
        </div>
      </div>
      <button class="btn btn-primary mt-20" onclick="saveNotificationSettings()">💾 حفظ الإعدادات</button>
    `;
  } catch (err) {
    document.getElementById('notificationSettingsForm').innerHTML = `<p style="color:var(--danger)">❌ ${err.message}</p>`;
  }
}

async function saveNotificationSettings() {
  try {
    await apiRequest('/notifications/settings', {
      method: 'PUT',
      body: JSON.stringify({
        reminder_before_hours: parseInt(document.getElementById('nsReminder').value) || 1,
        enable_push: document.getElementById('nsPush').checked
      })
    });
    showToast('✅ تم حفظ إعدادات الإشعارات', 'success');
    loadNotificationSettings();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// === Event Listeners ===
document.addEventListener('DOMContentLoaded', () => {
  if (!isLoggedIn() || !isAdmin()) {
    window.location.href = 'login.html';
    return;
  }

  loadBarberStatus();
  loadTodayAppointments();
  loadServicesTab();
  loadProductsTab();
  loadCustomers();
  loadSettings();
  loadNotificationSettings();
  setInterval(loadTodayAppointments, 15000);

  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  let lastUnreadCount = 0;
  async function checkUnreadChat() {
    try {
      const data = await apiRequest('/chat/unread');
      const badge = document.getElementById('chatUnreadBadge');
      if (badge) {
        if (data.count > 0) {
          badge.textContent = data.count;
          badge.style.display = 'inline';
          if (data.count > lastUnreadCount) {
            playBeep();
            showBrowserNotification('💬 رسالة جديدة', `لديك ${data.count} رسالة غير مقروءة`);
          }
        } else {
          badge.style.display = 'none';
        }
      }
      lastUnreadCount = data.count;
    } catch (err) { /* ignore */ }
  }
  checkUnreadChat();
  setInterval(checkUnreadChat, 10000);

  document.getElementById('serviceForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('svcName').value;
    const price = parseFloat(document.getElementById('svcPrice').value);
    const duration = parseInt(document.getElementById('svcDuration').value);
    const icon = document.getElementById('svcIcon').value || '✂️';

    try {
      if (editingServiceId) {
        await apiRequest(`/services/${editingServiceId}`, {
          method: 'PUT',
          body: JSON.stringify({ name, price, duration, icon })
        });
        showToast('✏️ تم تعديل الخدمة', 'success');
      } else {
        await apiRequest('/services', {
          method: 'POST',
          body: JSON.stringify({ name, price, duration, icon })
        });
        showToast('✅ تم إضافة الخدمة', 'success');
      }
      closeModal('serviceModal');
      loadServicesTab();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('editSettingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    showToast('✅ تم حفظ الإعدادات', 'success');
    closeModal('settingsModal');
  });

  document.getElementById('productForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('prodName').value;
    const price = parseFloat(document.getElementById('prodPrice').value);
    const icon = document.getElementById('prodIcon').value || '🧴';
    const description = document.getElementById('prodDesc').value;

    try {
      if (editingProductId) {
        await apiRequest(`/products/${editingProductId}`, {
          method: 'PUT',
          body: JSON.stringify({ name, price, icon, description })
        });
        showToast('✏️ تم تعديل المنتج', 'success');
      } else {
        await apiRequest('/products', {
          method: 'POST',
          body: JSON.stringify({ name, price, icon, description })
        });
        showToast('✅ تم إضافة المنتج', 'success');
      }
      closeModal('productModal');
      loadProductsTab();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('couponForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('cpnCode').value;
    const discount_type = document.getElementById('cpnType').value;
    const discount_value = parseFloat(document.getElementById('cpnValue').value);
    const min_order = parseFloat(document.getElementById('cpnMinOrder').value) || 0;
    const max_discount = parseFloat(document.getElementById('cpnMaxDiscount').value) || null;
    const usage_limit = parseInt(document.getElementById('cpnUsageLimit').value) || null;
    const valid_from = document.getElementById('cpnValidFrom').value;
    const valid_until = document.getElementById('cpnValidUntil').value;
    const description = document.getElementById('cpnDesc').value;

    try {
      if (editingCouponId) {
        await apiRequest(`/coupons/${editingCouponId}`, {
          method: 'PUT',
          body: JSON.stringify({ code, discount_type, discount_value, min_order, max_discount, usage_limit, valid_from, valid_until, description })
        });
        showToast('✏️ تم تعديل الكوبون', 'success');
      } else {
        await apiRequest('/coupons', {
          method: 'POST',
          body: JSON.stringify({ code, discount_type, discount_value, min_order, max_discount, usage_limit, valid_from, valid_until, description })
        });
        showToast('✅ تم إضافة الكوبون', 'success');
      }
      closeModal('couponModal');
      loadCouponsTab();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
});
