import { store } from '../state.js';
import { escapeHtml, truncate, stripHtml } from '../utils.js';
import { DataTable } from './dataTable.js';
import { open as openDrilldown } from './drilldownPanel.js';
import { openEditModal } from './editModal.js';
export function renderTeams(container) {
  const items = store.billingItems.filter(i => i.type === 'Teams Message');
  container.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px"><h1 style="font-size:16px;font-weight:600;display:flex;align-items:center;gap:8px">Teams Messages <span style="font-size:13px;color:var(--muted);font-weight:400">' + items.length + ' messages</span></h1></div><div id="teams-table-container"></div>';
  const table = new DataTable({
    container: container.querySelector('#teams-table-container'),
    columns: [
      { key: 'chatTopic', label: 'Chat', sortable: true, class: 'truncate', render: (i) => escapeHtml(truncate(i.chatTopic || '', 30)) },
      { key: 'participants', label: 'From', sortable: true, class: 'truncate muted', render: (i) => escapeHtml(truncate(i.participants || '', 25)) },
      { key: 'client', label: 'Client', sortable: true, class: 'client-cell', render: (i) => '<span class="' + ((!i.client || i.client.includes('UNKNOWN')) ? 'unknown' : '') + '">' + escapeHtml(i.client || 'UNKNOWN') + '</span>' },
      { key: 'date', label: 'Date', sortable: true, sortType: 'date', width: '90px', class: 'mono' },
      { key: 'durationHours', label: 'Duration', sortable: true, sortType: 'number', width: '70px', render: (i) => '<span class="duration-chip">' + (i.durationHours || 0.1) + 'h</span>' },
      { key: 'bodyPreview', label: 'Content', class: 'truncate muted', render: (i) => escapeHtml(truncate(stripHtml(i.bodyPreview || ''), 40)) },
    ],
    data: items, pageSize: store.settings.pageSize || 50, sortColumn: 'date', sortDir: 'desc',
    searchFields: ['chatTopic', 'participants', 'client', 'bodyPreview'], emptyMessage: 'No Teams messages found', emptyIcon: '',
    onRowClick: (item) => { openDrilldown('teams', item, () => openEditModal(item, () => renderTeams(container))); }
  });
  table.render();
}
