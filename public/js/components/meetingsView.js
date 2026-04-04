import { store } from '../state.js';
import { escapeHtml, truncate } from '../utils.js';
import { DataTable } from './dataTable.js';
import { open as openDrilldown } from './drilldownPanel.js';
import { openEditModal } from './editModal.js';
export function renderMeetings(container) {
  const items = store.billingItems.filter(i => i.type?.toLowerCase().includes('meeting'));
  container.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem"><h1 style="font-size:1.2rem;font-weight:600;display:flex;align-items:center;gap:8px"><span style="font-size:1.3rem">📅</span> Meetings <span style="font-size:0.8rem;color:var(--muted);font-weight:400">' + items.length + ' meetings</span></h1></div><div id="meetings-table-container"></div>';
  const table = new DataTable({
    container: container.querySelector('#meetings-table-container'),
    columns: [
      { key: 'type', label: 'Type', width: '100px', render: (i) => '<span class="type-badge type-teams">' + escapeHtml(i.type || 'Meeting') + '</span>' },
      { key: 'subject', label: 'Title', sortable: true, class: 'truncate', render: (i) => escapeHtml(truncate(i.subject || '', 50)) },
      { key: 'client', label: 'Client', sortable: true, class: 'client-cell', render: (i) => '<span class="' + ((!i.client || i.client.includes('UNKNOWN')) ? 'unknown' : '') + '">' + escapeHtml(i.client || 'UNKNOWN') + '</span>' },
      { key: 'date', label: 'Date', sortable: true, sortType: 'date', width: '90px', class: 'mono' },
      { key: 'startFormatted', label: 'Start', width: '80px', class: 'mono muted' },
      { key: 'durationHours', label: 'Duration', sortable: true, sortType: 'number', width: '70px', render: (i) => '<span class="duration-chip">' + (i.durationHours || 0) + 'h</span>' },
    ],
    data: items, pageSize: store.settings.pageSize || 50, sortColumn: 'date', sortDir: 'desc',
    searchFields: ['subject', 'participants', 'client'], emptyMessage: 'No meetings found', emptyIcon: '📅',
    onRowClick: (item) => { openDrilldown('meeting', item, () => openEditModal(item, () => renderMeetings(container))); }
  });
  table.render();
}
