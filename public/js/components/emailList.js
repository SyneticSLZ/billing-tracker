import { store, getFilteredItems } from '../state.js';
import { getEntries } from '../api.js';
import { escapeHtml, getTypeClass, truncate } from '../utils.js';
import { DataTable } from './dataTable.js';
import { open as openDrilldown } from './drilldownPanel.js';
import { openEditModal } from './editModal.js';
import { updateNavBadges } from './nav.js';

export function renderEmails(container) {
  const emailItems = store.billingItems.filter(i => i.type?.toLowerCase().includes('email'));

  // Check if we should group by thread
  const grouped = store.settings.groupEmailsByThread;

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">
      <h1 style="font-size:1.2rem;font-weight:600;display:flex;align-items:center;gap:8px">
        <span style="font-size:1.3rem">📧</span> Emails
        <span style="font-size:0.8rem;color:var(--muted);font-weight:400">${emailItems.length} entries</span>
      </h1>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm ${grouped ? 'active' : ''}" id="thread-toggle">
          ${grouped ? '📂 Threaded' : '📋 Flat List'}
        </button>
      </div>
    </div>
    <div id="emails-table-container"></div>
  `;

  let displayItems = emailItems;

  if (grouped && emailItems.length) {
    // Group by conversationId
    const threads = {};
    emailItems.forEach(item => {
      const key = item.conversationId || item.id;
      if (!threads[key]) threads[key] = [];
      threads[key].push(item);
    });

    // For threaded view, show one row per thread (latest email)
    displayItems = Object.values(threads).map(threadItems => {
      const sorted = threadItems.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
      return {
        ...sorted[0],
        _threadCount: threadItems.length,
        _threadItems: sorted,
      };
    });
  }

  const table = new DataTable({
    container: container.querySelector('#emails-table-container'),
    columns: [
      {
        key: 'subject', label: 'Subject', sortable: true,
        class: 'truncate',
        render: (item) => {
          let html = escapeHtml(truncate(item.subject || 'No Subject', 60));
          if (item._threadCount > 1) {
            html += ` <span style="font-size:0.65rem;color:var(--accent);font-family:'DM Mono',monospace">(${item._threadCount})</span>`;
          }
          if (item.hasAttachments) html += ' <span style="font-size:0.7rem">📎</span>';
          if (item.importance === 'high') html += ' <span style="font-size:0.7rem">❗</span>';
          return html;
        }
      },
      {
        key: 'participants', label: 'From', sortable: true,
        class: 'truncate muted',
        render: (item) => escapeHtml(truncate(item.participants || '', 30))
      },
      {
        key: 'client', label: 'Client', sortable: true,
        class: 'client-cell',
        render: (item) => `<span class="${(!item.client || item.client.includes('UNKNOWN')) ? 'unknown' : ''}">${escapeHtml(item.client || 'UNKNOWN')}</span>`
      },
      { key: 'date', label: 'Date', sortable: true, sortType: 'date', width: '90px', class: 'mono' },
      { key: 'startFormatted', label: 'Time', width: '80px', class: 'mono muted' },
      {
        key: 'durationHours', label: 'Duration', sortable: true, sortType: 'number', width: '70px',
        render: (item) => `<span class="duration-chip">${item.durationHours || 0.1}h</span>`
      },
      {
        key: 'activityDescription', label: 'Description',
        class: 'truncate muted',
        render: (item) => escapeHtml(truncate(item.activityDescription || '', 40))
      },
    ],
    data: displayItems,
    pageSize: store.settings.pageSize || 50,
    sortColumn: 'date',
    sortDir: 'desc',
    searchFields: ['subject', 'participants', 'client', 'activityDescription', 'bodyPreview'],
    showSearch: true,
    emptyMessage: 'No emails found',
    emptyIcon: '📧',
    onRowClick: (item) => {
      openDrilldown('email', item, () => openEditModal(item, () => {
        renderEmails(container);
      }));
    }
  });

  table.render();

  // Thread toggle
  container.querySelector('#thread-toggle').addEventListener('click', () => {
    store.settings.groupEmailsByThread = !store.settings.groupEmailsByThread;
    renderEmails(container);
  });
}