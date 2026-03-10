import { store } from '../state.js';
import { escapeHtml, truncate, formatDate, formatTime, stripHtml } from '../utils.js';
import { DataTable } from './dataTable.js';
import { open as openDrilldown } from './drilldownPanel.js';
import { openEditModal } from './editModal.js';

export function renderTeams(container) {
  const teamsItems = store.billingItems.filter(i => i.type === 'Teams Message');

  // Group by chatTopic/chatId
  const chatGroups = {};
  teamsItems.forEach(item => {
    const key = item.chatId || item.chatTopic || 'unknown';
    if (!chatGroups[key]) {
      chatGroups[key] = {
        chatId: item.chatId,
        topic: item.chatTopic || 'Teams Chat',
        chatType: item.chatType,
        messages: [],
        totalHours: 0,
      };
    }
    chatGroups[key].messages.push(item);
    chatGroups[key].totalHours += (item.durationHours || 0.1);
  });

  const chats = Object.values(chatGroups).sort((a, b) => b.messages.length - a.messages.length);

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">
      <h1 style="font-size:1.2rem;font-weight:600;display:flex;align-items:center;gap:8px">
        <span style="font-size:1.3rem">💬</span> Teams Messages
        <span style="font-size:0.8rem;color:var(--muted);font-weight:400">${teamsItems.length} messages in ${chats.length} chats</span>
      </h1>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm ${store._teamsViewMode === 'chat' ? 'active' : ''}" id="teams-chat-view">Chat View</button>
        <button class="btn btn-ghost btn-sm ${store._teamsViewMode !== 'chat' ? 'active' : ''}" id="teams-list-view">List View</button>
      </div>
    </div>
    <div id="teams-content"></div>
  `;

  if (store._teamsViewMode === 'chat') {
    renderChatView(container.querySelector('#teams-content'), chats, container);
  } else {
    renderListView(container.querySelector('#teams-content'), teamsItems, container);
  }

  container.querySelector('#teams-chat-view').addEventListener('click', () => {
    store._teamsViewMode = 'chat';
    renderTeams(container);
  });
  container.querySelector('#teams-list-view').addEventListener('click', () => {
    store._teamsViewMode = 'list';
    renderTeams(container);
  });
}

function renderChatView(contentEl, chats, parentContainer) {
  if (!chats.length) {
    contentEl.innerHTML = '<div class="empty-state"><div class="empty-icon">💬</div><h3>No Teams messages</h3><p>Pull data to see Teams chat messages.</p></div>';
    return;
  }

  let html = '<div style="display:grid;grid-template-columns:280px 1fr;gap:1rem;min-height:400px">';

  // Chat list sidebar
  html += '<div class="card" style="overflow-y:auto;max-height:600px"><div class="card-body no-padding" style="padding:0.5rem">';
  chats.forEach((chat, idx) => {
    html += `<button class="nav-item ${idx === 0 ? 'active' : ''}" data-chat-idx="${idx}" style="margin-bottom:2px">
      <span class="nav-icon">💬</span>
      <span class="nav-label" style="flex:1;text-align:left">
        <div style="font-weight:500;font-size:0.8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(chat.topic)}</div>
        <div style="font-size:0.65rem;color:var(--muted)">${chat.messages.length} msgs · ${chat.totalHours.toFixed(1)}h</div>
      </span>
    </button>`;
  });
  html += '</div></div>';

  // Chat messages area
  html += '<div class="card"><div class="card-header"><h2 id="chat-title">' + escapeHtml(chats[0]?.topic || 'Chat') + '</h2></div>';
  html += '<div class="card-body" id="chat-messages-area" style="max-height:500px;overflow-y:auto">';
  html += renderChatMessages(chats[0]?.messages || []);
  html += '</div></div>';

  html += '</div>';
  contentEl.innerHTML = html;

  // Bind chat switching
  contentEl.querySelectorAll('[data-chat-idx]').forEach(btn => {
    btn.addEventListener('click', () => {
      contentEl.querySelectorAll('[data-chat-idx]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const idx = parseInt(btn.dataset.chatIdx);
      const chat = chats[idx];
      contentEl.querySelector('#chat-title').textContent = chat.topic;
      contentEl.querySelector('#chat-messages-area').innerHTML = renderChatMessages(chat.messages);

      // Bind message clicks
      bindMessageClicks(contentEl, chat.messages, parentContainer);
    });
  });

  bindMessageClicks(contentEl, chats[0]?.messages || [], parentContainer);
}

function renderChatMessages(messages) {
  if (!messages.length) return '<div class="empty-state"><p>No messages</p></div>';

  const sorted = [...messages].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  return `<div class="chat-messages">${sorted.map(msg => `
    <div class="chat-bubble" data-msg-id="${escapeHtml(msg.id)}" style="cursor:pointer">
      <div class="chat-bubble-meta">
        <span class="chat-bubble-sender">${escapeHtml(msg.participants || 'Unknown')}</span>
        <span>${escapeHtml(msg.date || '')} ${escapeHtml(msg.startFormatted || '')}</span>
      </div>
      <div>${escapeHtml(stripHtml(msg.bodyPreview || ''))}</div>
    </div>
  `).join('')}</div>`;
}

function bindMessageClicks(contentEl, messages, parentContainer) {
  contentEl.querySelectorAll('[data-msg-id]').forEach(el => {
    el.addEventListener('click', () => {
      const item = messages.find(m => m.id === el.dataset.msgId);
      if (item) openDrilldown('teams', item, () => openEditModal(item, () => renderTeams(parentContainer)));
    });
  });
}

function renderListView(contentEl, teamsItems, parentContainer) {
  const table = new DataTable({
    container: contentEl,
    columns: [
      { key: 'chatTopic', label: 'Chat', sortable: true, class: 'truncate', render: (i) => escapeHtml(truncate(i.chatTopic || i.subject || '', 30)) },
      { key: 'participants', label: 'From', sortable: true, class: 'truncate muted', render: (i) => escapeHtml(truncate(i.participants || '', 25)) },
      { key: 'client', label: 'Client', sortable: true, class: 'client-cell', render: (i) => `<span class="${(!i.client || i.client.includes('UNKNOWN')) ? 'unknown' : ''}">${escapeHtml(i.client || 'UNKNOWN')}</span>` },
      { key: 'date', label: 'Date', sortable: true, sortType: 'date', width: '90px', class: 'mono' },
      { key: 'startFormatted', label: 'Time', width: '80px', class: 'mono muted' },
      { key: 'durationHours', label: 'Duration', sortable: true, sortType: 'number', width: '70px', render: (i) => `<span class="duration-chip">${i.durationHours || 0.1}h</span>` },
      { key: 'bodyPreview', label: 'Content', class: 'truncate muted', render: (i) => escapeHtml(truncate(stripHtml(i.bodyPreview || ''), 40)) },
    ],
    data: teamsItems,
    pageSize: store.settings.pageSize || 50,
    sortColumn: 'date',
    sortDir: 'desc',
    searchFields: ['chatTopic', 'participants', 'client', 'bodyPreview'],
    emptyMessage: 'No Teams messages found',
    emptyIcon: '💬',
    onRowClick: (item) => {
      openDrilldown('teams', item, () => openEditModal(item, () => renderTeams(parentContainer)));
    }
  });
  table.render();
}