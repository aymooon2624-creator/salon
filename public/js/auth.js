const API = '/api';

function getToken() {
  return localStorage.getItem('token');
}

function getUser() {
  const data = localStorage.getItem('user');
  return data ? JSON.parse(data) : null;
}

function isLoggedIn() {
  return !!getToken();
}

function isAdmin() {
  const user = getUser();
  return user && user.role === 'admin';
}

function handleLogout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = 'login.html';
}

function showToast(message, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 3500);
}

async function apiRequest(endpoint, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API}${endpoint}`, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    if (!window.location.pathname.includes('login.html') && !window.location.pathname.includes('register.html')) {
      window.location.href = 'login.html';
    }
    throw new Error('غير مصرح');
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'حدث خطأ');
  return data;
}

document.addEventListener('DOMContentLoaded', () => {
  const userDisplay = document.getElementById('userDisplay');
  const logoutBtn = document.getElementById('logoutBtn');
  const adminBtn = document.getElementById('adminBtn');

  if (isLoggedIn()) {
    const user = getUser();
    if (userDisplay) userDisplay.textContent = `👤 ${user.username}`;
    if (logoutBtn) logoutBtn.style.display = 'inline-flex';
    if (adminBtn && isAdmin()) adminBtn.style.display = 'inline-flex';
  } else {
    const currentPage = window.location.pathname.split('/').pop();
    if (!['login.html', 'register.html'].includes(currentPage)) {
      window.location.href = 'login.html';
    }
  }

  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;

      try {
        const data = await apiRequest('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username, password })
        });
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        window.location.href = data.user.role === 'admin' ? '/dashboard' : 'index.html';
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;
      const phone = document.getElementById('phone').value;

      try {
        const data = await apiRequest('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ username, password, phone })
        });
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        showToast('تم التسجيل بنجاح!', 'success');
        setTimeout(() => window.location.href = data.user.role === 'admin' ? 'admin.html' : 'index.html', 500);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }
});
