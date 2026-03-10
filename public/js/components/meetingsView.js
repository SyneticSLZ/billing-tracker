import { store } from '../state.js';
import { escapeHtml, truncate, getTypeClass } from '../utils.js';
import { DataTable } from './dataTable.js';
import { open as openDrilldown } from './drilldownPanel.js';
import { openEditModal } from './editModal.js';

export function renderMeetings(container) {
  const meetingItems = store.billingItems.filter(i =>
    i.type?.toLowerCase().includes('meeting')
  );

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">
      <h1 style="font-size:1.2rem;font-weight:600;display:flex;align-items:center;gap:8px">
        <span style="font-size:1.3rem">📅</span> Meetings
        <span style="font-size:0.8rem;color:var(--muted);font-weight:400">${meetingItems.length} meetings</span>
      </h1>
    </div>
    <div id="meetings-table-container"></div>
  `;

  const table = new DataTable({
    container: container.querySelector('#meetings-table-container'),
    columns: [
      {
        key: 'type', label: 'Type', width: '100px',
        render: (item) => {
          const cls = item.isOnlineMeeting || item.type === 'Teams Meeting' ? 'type-teams' : 'badge-meeting-type';
          return `<span class="type-badge ${cls}">${escapeHtml(item.type || 'Meeting')}</span>`;
        }
      },
      {
        key: 'subject', label: 'Title', sortable: true, class: 'truncate',
        render: (item) => escapeHtml(truncate(item.subject || 'No Title', 50))
      },
      {
        key: 'participants', label: 'Attendees', class: 'truncate muted',
        render: (item) => {
          const parts = (item.participants || '').split(',').filter(Boolean);
          if (parts.length <= 2) return escapeHtml(item.participants || '');
          return escapeHtml(parts.slice(0, 2).join(', ')) + ` <span style="color:var(--accent)">+${parts.length - 2}</span>`;
        }
      },
      {
        key: 'client', label: 'Client', sortable: true, class: 'client-cell',
        render: (item) => `<span class="${(!item.client || item.client.includes('UNKNOWN')) ? 'unknown' : ''}">${escapeHtml(item.client || 'UNKNOWN')}</span>`
      },
      { key: 'date', label: 'Date', sortable: true, sortType: 'date', width: '90px', class: 'mono' },
      { key: 'startFormatted', label: 'Start', width: '80px', class: 'mono muted' },
      { key: 'endFormatted', label: 'End', width: '80px', class: 'mono muted' },
      {
        key: 'durationHours', label: 'Duration', sortable: true, sortType: 'number', width: '70px',
        render: (item) => `<span class="duration-chip">${item.durationHours || 0}h</span>`
      },
    ],
    data: meetingItems,
    pageSize: store.settings.pageSize || 50,
    sortColumn: 'date',
    sortDir: 'desc',
    searchFields: ['subject', 'participants', 'client', 'activityDescription', 'organizer'],
    filters: [
      {
        key: 'type', label: 'Types',
        options: [...new Set(meetingItems.map(i => i.type).filter(Boolean))]
      }
    ],
    emptyMessage: 'No meetings found',
    emptyIcon: '📅',
    onRowClick: (item) => {
      openDrilldown('meeting', item, () => openEditModal(item, () => renderMeetings(container)));
    }
  });
  table.render();
}