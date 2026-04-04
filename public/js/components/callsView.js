import { store } from '../state.js';
import { escapeHtml, truncate } from '../utils.js';
import { DataTable } from './dataTable.js';
import { open as openDrilldown } from './drilldownPanel.js';
import { openEditModal } from './editModal.js';
import { initUploadZone } from './uploadZone.js';
export function renderCalls(container) {
  const items = store.billingItems.filter(i => i.type?.toLowerCase().includes('call'));
  container.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem"><h1 style="font-size:1.2rem;font-weight:600;display:flex;align-items:center;gap:8px"><span style="font-size:1.3rem">📞</span> Calls <span style="font-size:0.8rem;color:var(--muted);font-weight:400">' + items.length + ' calls</span></h1></div><div class="upload-zone" id="calls-upload-zone" style="margin-bottom:1rem"><div class="upload-zone-icon">📞</div><div class="upload-zone-text"><h3>Upload AT&T Call Log</h3><p>CSV format</p></div><button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="event.stopPropagation();this.closest(\'.upload-zone\').querySelector(\'input\').click()">Choose File</button><input type="file" accept=".csv" style="display:none"></div><div id="calls-table-container"></div>';
  initUploadZone(container.querySelector('#calls-upload-zone'), () => renderCalls(container));
  const table = new DataTable({
    container: container.querySelector('#calls-table-container'),
    columns: [
      { key: 'subject', label: 'Contact', sortable: true, class: 'truncate', render: (i) => escapeHtml(truncate(i.subject || 'Unknown', 40)) },
      { key: 'client', label: 'Client', sortable: true, class: 'client-cell', render: (i) => '<span class="' + ((!i.client || i.client.includes('UNKNOWN')) ? 'unknown' : '') + '">' + escapeHtml(i.client || 'UNKNOWN') + '</span>' },
      { key: 'date', label: 'Date', sortable: true, sortType: 'date', width: '90px', class: 'mono' },
      { key: 'durationHours', label: 'Duration', sortable: true, sortType: 'number', width: '70px', render: (i) => '<span class="duration-chip">' + (i.durationHours || 0.1) + 'h</span>' },
    ],
    data: items, pageSize: store.settings.pageSize || 50, sortColumn: 'date', sortDir: 'desc',
    searchFields: ['subject', 'participants', 'client'], emptyMessage: 'No calls found', emptyIcon: '📞',
    onRowClick: (item) => { openDrilldown('call', item, () => openEditModal(item, () => renderCalls(container))); }
  });
  table.render();
}
