import { store } from '../state.js';
import { escapeHtml, truncate } from '../utils.js';
import { DataTable } from './dataTable.js';
import { open as openDrilldown } from './drilldownPanel.js';
import { openEditModal } from './editModal.js';
export function renderEmails(container) {
  const emailItems = store.billingItems.filter(i => i.type?.toLowerCase().includes('email'));
  container.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem"><h1 style="font-size:1.2rem;font-weight:600;display:flex;align-items:center;gap:8px"><span style="font-size:1.3rem">📧</span> Emails <span style="font-size:0.8rem;color:var(--muted);font-weight:400">' + emailItems.length + ' entries</span></h1></div><div id="emails-table-container"></div>';
  const table = new DataTable({
    container: container.querySelector('#emails-table-container'),
    columns: [
      { key: 'subject', label: 'Subject', sortable: true, class: 'truncate', render: (i) => escapeHtml(truncate(i.subject || 'No Subject', 60)) + (i.hasAttachments ? ' 📎' : '') },
      { key: 'participants', label: 'From', sortable: true, class: 'truncate muted', render: (i) => escapeHtml(truncate(i.participants || '', 30)) },
      { key: 'folderName', label: 'Folder', sortable: true, class: 'mono muted', render: (i) => escapeHtml(truncate(i.folderName || '', 20)) },
      { key: 'client', label: 'Client', sortable: true, class: 'client-cell', render: (i) => '<span class="' + ((!i.client || i.client.includes('UNKNOWN')) ? 'unknown' : '') + '">' + escapeHtml(i.client || 'UNKNOWN') + '</span>' + (i.rmKeyMatched ? ' <span style="color:var(--success);font-size:0.65rem">✓</span>' : '') },
      { key: 'date', label: 'Date', sortable: true, sortType: 'date', width: '90px', class: 'mono' },
      { key: 'durationHours', label: 'Duration', sortable: true, sortType: 'number', width: '70px', render: (i) => '<span class="duration-chip">' + (i.durationHours || 0.1) + 'h</span>' },
      { key: 'activityDescription', label: 'Description', class: 'truncate muted', render: (i) => escapeHtml(truncate(i.activityDescription || '', 40)) },
    ],
    data: emailItems, pageSize: store.settings.pageSize || 50, sortColumn: 'date', sortDir: 'desc',
    searchFields: ['subject', 'participants', 'client', 'activityDescription', 'bodyPreview', 'folderName'],
    emptyMessage: 'No emails found', emptyIcon: '📧',
    onRowClick: (item) => { openDrilldown('email', item, () => openEditModal(item, () => renderEmails(container))); }
  });
  table.render();
}
