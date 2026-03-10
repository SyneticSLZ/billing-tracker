import { store } from '../state.js';
import { escapeHtml, truncate } from '../utils.js';
import { DataTable } from './dataTable.js';
import { open as openDrilldown } from './drilldownPanel.js';
import { openEditModal } from './editModal.js';
import { initUploadZone } from './uploadZone.js';

export function renderCalls(container) {
  const callItems = store.billingItems.filter(i => i.type?.toLowerCase().includes('call'));

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">
      <h1 style="font-size:1.2rem;font-weight:600;display:flex;align-items:center;gap:8px">
        <span style="font-size:1.3rem">📞</span> Calls
        <span style="font-size:0.8rem;color:var(--muted);font-weight:400">${callItems.length} calls</span>
      </h1>
    </div>

    <!-- Upload zone for calls page -->
    <div class="upload-zone" id="calls-upload-zone" style="margin-bottom:1rem">
      <div class="upload-zone-icon">📞</div>
      <div class="upload-zone-text">
        <h3>Upload AT&T Call Log</h3>
        <p>CSV format · drag & drop or click</p>
      </div>
      <button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="event.stopPropagation();this.closest('.upload-zone').querySelector('input').click()">Choose File</button>
      <input type="file" accept=".csv" style="display:none">
    </div>

    <div id="calls-table-container"></div>
  `;

  initUploadZone(container.querySelector('#calls-upload-zone'), () => renderCalls(container));

  const table = new DataTable({
    container: container.querySelector('#calls-table-container'),
    columns: [
      {
        key: 'subject', label: 'Contact', sortable: true, class: 'truncate',
        render: (item) => escapeHtml(truncate(item.subject || 'Unknown Call', 40))
      },
      {
        key: 'participants', label: 'Number', sortable: true, class: 'mono muted',
        render: (item) => escapeHtml(item.participants || '')
      },
      {
        key: 'client', label: 'Client', sortable: true, class: 'client-cell',
        render: (item) => `<span class="${(!item.client || item.client.includes('UNKNOWN')) ? 'unknown' : ''}">${escapeHtml(item.client || 'UNKNOWN')}</span>`
      },
      { key: 'date', label: 'Date', sortable: true, sortType: 'date', width: '90px', class: 'mono' },
      { key: 'startFormatted', label: 'Time', width: '80px', class: 'mono muted' },
      {
        key: 'durationHours', label: 'Duration', sortable: true, sortType: 'number', width: '70px',
        render: (item) => `<span class="duration-chip">${item.durationHours || 0.1}h</span>`
      },
      {
        key: 'bodyPreview', label: 'Details', class: 'truncate muted',
        render: (item) => escapeHtml(truncate(item.bodyPreview || '', 30))
      },
      {
        key: 'activityDescription', label: 'Description', class: 'truncate muted',
        render: (item) => escapeHtml(truncate(item.activityDescription || '', 35))
      },
    ],
    data: callItems,
    pageSize: store.settings.pageSize || 50,
    sortColumn: 'date',
    sortDir: 'desc',
    searchFields: ['subject', 'participants', 'client', 'activityDescription'],
    emptyMessage: 'No calls found. Upload an AT&T call log or pull data.',
    emptyIcon: '📞',
    onRowClick: (item) => {
      openDrilldown('call', item, () => openEditModal(item, () => renderCalls(container)));
    }
  });
  table.render();
}