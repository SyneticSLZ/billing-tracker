import { store } from '../state.js';
import { escapeHtml, truncate } from '../utils.js';
import { DataTable } from './dataTable.js';
import { open as openDrilldown } from './drilldownPanel.js';
import { openEditModal } from './editModal.js';
export function renderEmails(container) {
  const emailItems = store.billingItems.filter(i => i.type?.toLowerCase().includes('email'));
  container.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px"><h1 style="font-size:16px;font-weight:600;display:flex;align-items:center;gap:8px">Emails <span style="font-size:13px;color:var(--muted);font-weight:400">' + emailItems.length + ' entries</span></h1></div><div id="emails-table-container"></div>';
  const table = new DataTable({
    container: container.querySelector('#emails-table-container'),
    columns: [
      { key: 'subject', label: 'Subject', sortable: true, class: 'truncate', render: (i) => escapeHtml(truncate(i.subject || 'No Subject', 60)) },
      { key: 'participants', label: 'From', sortable: true, class: 'truncate muted', render: (i) => escapeHtml(truncate(i.participants || '', 30)) },
      { key: 'folderName', label: 'Folder', sortable: true, class: 'mono muted', render: (i) => escapeHtml(truncate(i.folderName || '', 20)) },
      { key: 'client', label: 'Client', sortable: true, class: 'client-cell', render: (i) => '<span class="' + ((!i.client || i.client.includes('UNKNOWN')) ? 'unknown' : '') + '">' + escapeHtml(i.client || 'UNKNOWN') + '</span>' + (i.rmKeyMatched ? ' <span style="color:var(--success);font-size:10px">matched</span>' : '') },
      { key: 'date', label: 'Date', sortable: true, sortType: 'date', width: '90px', class: 'mono' },
      { key: 'durationHours', label: 'Duration', sortable: true, sortType: 'number', width: '70px', render: (i) => '<span class="duration-chip"' + (i.billingExcluded ? ' style="text-decoration:line-through;opacity:0.6"' : '') + '>' + (i.durationHours || 0.1) + 'h</span>' },
      { key: 'billStatus', label: 'Status', width: '120px', render: (i) => {
          if (i.isConsolidated) return '<span style="color:var(--accent);font-size:11px" title="' + i.mergedCount + ' same-subject emails combined into one entry">🔗 combined (' + i.mergedCount + ')</span>';
          if (i.consolidatedInto) return '<span style="color:var(--muted);font-size:11px" title="' + escapeHtml(i.excludeReason || '') + '">↳ in combined</span>';
          if (i.billingExcluded) return '<span style="color:var(--muted);font-size:11px" title="' + escapeHtml(i.excludeReason || '') + '">excluded</span>';
          return '<span style="color:var(--success);font-size:11px">billable</span>';
        } },
      { key: 'activityDescription', label: 'Description', class: 'truncate muted', render: (i) => escapeHtml(truncate(i.activityDescription || '', 40)) },
    ],
    data: emailItems, pageSize: store.settings.pageSize || 50, sortColumn: 'date', sortDir: 'desc',
    searchFields: ['subject', 'participants', 'client', 'activityDescription', 'bodyPreview', 'folderName'],
    emptyMessage: 'No emails found', emptyIcon: '',
    onRowClick: (item) => { openDrilldown('email', item, () => openEditModal(item, () => renderEmails(container))); }
  });
  table.render();
}
