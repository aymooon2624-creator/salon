let activeChatUser = null;
let chatPollInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  if (!isLoggedIn()) return;
  loadConversations();
  document.getElementById('chatForm').addEventListener('submit', sendChatMessage);
});

async function loadConversations() {
  try {
    const conversations = await apiRequest('/chat/conversations');
    const container = document.getElementById('conversationsList');

    if (conversations.length === 0) {
      container.innerHTML = '<div class="empty-state" style="padding:20px;"><span class="empty-icon">💬</span>لا توجد محادثات</div>';
      return;
    }

    container.innerHTML = conversations.map(c => `
      <div class="conversation-item ${activeChatUser === c.id ? 'active' : ''}" onclick="openChat(${c.id}, '${c.username}')">
        <div style="display:flex;justify-content:space-between;">
          <strong>${c.username}</strong>
          ${c.unread > 0 ? `<span class="badge-danger">${c.unread}</span>` : ''}
        </div>
        <div style="font-size:13px;color:var(--text-secondary);margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          ${c.last_message || '...'}
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

function openChat(userId, username) {
  activeChatUser = userId;
  document.getElementById('chatPartnerName').textContent = username;
  document.getElementById('messageArea').style.display = 'flex';
  document.getElementById('conversationsView').style.display = 'none';

  if (chatPollInterval) clearInterval(chatPollInterval);
  loadMessages();
  chatPollInterval = setInterval(loadMessages, 5000);
}

async function loadMessages() {
  if (!activeChatUser) return;
  try {
    const messages = await apiRequest(`/chat/${activeChatUser}`);
    const container = document.getElementById('chatMessages');
    const user = getUser();

    container.innerHTML = messages.map(m => {
      const isMine = m.sender_id === user.id;
      return `
        <div class="chat-msg ${isMine ? 'chat-msg-mine' : 'chat-msg-other'}">
          <div class="chat-msg-text">${m.message}</div>
          <div class="chat-msg-time">
            ${new Date(m.created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
            ${isMine && m.is_read ? ' ✓✓' : ''}
          </div>
        </div>
      `;
    }).join('');

    container.scrollTop = container.scrollHeight;

    const unread = messages.filter(m => m.receiver_id === user.id && !m.is_read);
    for (const m of unread) {
      await apiRequest(`/chat/${m.id}/read`, { method: 'PUT' });
    }
  } catch (err) {
    console.error(err);
  }
}

async function sendChatMessage(e) {
  e.preventDefault();
  if (!activeChatUser) return;

  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (!message) return;

  input.value = '';
  try {
    await apiRequest('/chat', {
      method: 'POST',
      body: JSON.stringify({ receiver_id: activeChatUser, message })
    });
    loadMessages();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function backToConversations() {
  activeChatUser = null;
  if (chatPollInterval) clearInterval(chatPollInterval);
  document.getElementById('messageArea').style.display = 'none';
  document.getElementById('conversationsView').style.display = 'block';
  loadConversations();
}
