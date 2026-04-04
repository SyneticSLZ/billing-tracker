import { store } from '../state.js';
import { escapeHtml, truncate } from '../utils.js';
import { deleteEntry } from '../api.js';
import { open as openDrilldown } from './drilldownPanel.js';
import { openEditModal } from './editModal.js';
import { updateNavBadges } from './nav.js';

let viewingMonth = null; // { year, month } (0-indexed month)
let viewingDay = null;   // 'YYYY-MM-DD' or null

export function renderCalendar(container) {
  if (!viewingMonth) {
    const now = new Date();
    viewingMonth = { year: now.getFullYear(), month: now.getMonth() };
  }
  viewingDay = null;
  renderMonthView(container);
}

function getItemsByDate() {
  const map = {};
  store.billingItems.forEach(item => {
    const dk = item.date; // MM/DD/YYYY
    if (!dk) return;
    // Convert to YYYY-MM-DD for consistent keying
    const parts = dk.split('/');
    if (parts.length !== 3) return;
    const key = `${parts[2]}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
    if (!map[key]) map[key] = [];
    map[key].push(item);
  });
  return map;
}

function renderMonthView(container) {
  const { year, month } = viewingMonth;
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const itemsByDate = getItemsByDate();

  // Build day cells
  let dayCells = '';
  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) {
    dayCells += '<div class="cal-day cal-day-empty"></div>';
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const items = itemsByDate[key] || [];
    const count = items.length;
    const hours = items.reduce((s, i) => s + (i.durationHours || 0.1), 0).toFixed(1);
    const hasDupes = items.some(i => i.possibleDuplicate);
    const hasData = count > 0;

    dayCells += `
      <div class="cal-day ${hasData ? 'cal-day-active' : ''} ${hasDupes ? 'cal-day-warn' : ''}" ${hasData ? `data-date="${key}"` : ''}>
        <div class="cal-day-num">${d}</div>
        ${hasData ? `
          <div class="cal-day-count">${count}</div>
          <div class="cal-day-hours">${hours}h</div>
          ${hasDupes ? '<div class="cal-day-dupe">!</div>' : ''}
        ` : ''}
      </div>`;
  }

  const totalItems = store.billingItems.length;
  const totalHours = store.billingItems.reduce((s, i) => s + (i.durationHours || 0.1), 0).toFixed(1);
  const dupeCount = store.billingItems.filter(i => i.possibleDuplicate).length;

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <h1 style="font-size:16px;font-weight:600">Calendar Review</h1>
      <div style="display:flex;gap:8px;font-size:12px;color:var(--muted)">
        <span>${totalItems} entries</span>
        <span>·</span>
        <span>${totalHours}h total</span>
        ${dupeCount ? `<span>·</span><span style="color:var(--warning)">${dupeCount} possible duplicates</span>` : ''}
      </div>
    </div>
    <div class="card">
      <div class="card-header">
        <button class="btn btn-ghost btn-sm" id="cal-prev">&larr;</button>
        <h2 style="font-size:14px">${monthNames[month]} ${year}</h2>
        <button class="btn btn-ghost btn-sm" id="cal-next">&rarr;</button>
      </div>
      <div class="card-body" style="padding:12px">
        <div class="cal-header">
          ${dayNames.map(d => `<div class="cal-header-cell">${d}</div>`).join('')}
        </div>
        <div class="cal-grid">
          ${dayCells}
        </div>
      </div>
    </div>
    <div id="cal-day-detail" style="margin-top:16px"></div>
  `;

  // Nav
  container.querySelector('#cal-prev').addEventListener('click', () => {
    viewingMonth.month--;
    if (viewingMonth.month < 0) { viewingMonth.month = 11; viewingMonth.year--; }
    renderMonthView(container);
  });
  container.querySelector('#cal-next').addEventListener('click', () => {
    viewingMonth.month++;
    if (viewingMonth.month > 11) { viewingMonth.month = 0; viewingMonth.year++; }
    renderMonthView(container);
  });

  // Day click
  container.querySelectorAll('.cal-day-active').forEach(el => {
    el.addEventListener('click', () => {
      viewingDay = el.dataset.date;
      renderDayDetail(container);
    });
  });
}

function renderDayDetail(container) {
  const detail = container.querySelector('#cal-day-detail');
  if (!detail || !viewingDay) return;

  const itemsByDate = getItemsByDate();
  const items = (itemsByDate[viewingDay] || []).sort((a, b) => {
    return new Date(a.startTime) - new Date(b.startTime);
  });

  const parts = viewingDay.split('-');
  const dateLabel = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]))
    .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const totalHours = items.reduce((s, i) => s + (i.durationHours || 0.1), 0).toFixed(1);

  detail.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div style="display:flex;align-items:center;gap:8px">
          <button class="btn btn-ghost btn-xs" id="cal-back">&larr; Month</button>
          <h2 style="font-size:13px">${dateLabel}</h2>
        </div>
        <span style="font-size:12px;color:var(--muted)">${items.length} entries · ${totalHours}h</span>
      </div>
      <div class="card-body" style="padding:0">
        ${items.length ? renderTimeline(items) : '<div class="empty-state"><p>No entries for this day</p></div>'}
      </div>
    </div>
  `;

  detail.querySelector('#cal-back').addEventListener('click', () => {
    viewingDay = null;
    detail.innerHTML = '';
  });

  // Delete buttons
  detail.querySelectorAll('[data-delete-id]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.deleteId;
      if (!confirm('Remove this entry?')) return;
      try {
        await deleteEntry(id);
        store.billingItems = store.billingItems.filter(i => i.id !== id);
        updateNavBadges();
        renderDayDetail(container);
        // Also re-render month totals
        renderMonthView(container);
        // Re-open the day detail since renderMonthView clears it
        if (viewingDay) {
          setTimeout(() => renderDayDetail(container), 0);
        }
      } catch (err) {
        console.error('Delete failed:', err);
      }
    });
  });

  // Row click for drilldown
  detail.querySelectorAll('[data-entry-id]').forEach(row => {
    row.addEventListener('click', () => {
      const item = store.billingItems.find(i => i.id === row.dataset.entryId);
      if (!item) return;
      const type = (item.type || '').toLowerCase().includes('email') ? 'email'
        : (item.type || '').toLowerCase().includes('meeting') ? 'meeting'
        : (item.type || '').toLowerCase().includes('teams') ? 'teams' : 'call';
      openDrilldown(type, item, () => openEditModal(item, () => {
        renderDayDetail(container);
      }));
    });
  });
}

function renderTimeline(items) {
  return `<table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead>
      <tr>
        <th style="text-align:left;padding:8px 12px;font-size:11px;font-weight:500;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border)">Time</th>
        <th style="text-align:left;padding:8px 12px;font-size:11px;font-weight:500;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border)">Type</th>
        <th style="text-align:left;padding:8px 12px;font-size:11px;font-weight:500;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border)">Client</th>
        <th style="text-align:left;padding:8px 12px;font-size:11px;font-weight:500;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border)">Subject</th>
        <th style="text-align:right;padding:8px 12px;font-size:11px;font-weight:500;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border)">Duration</th>
        <th style="width:40px;border-bottom:1px solid var(--border)"></th>
      </tr>
    </thead>
    <tbody>
      ${items.map(item => {
        const isDupe = item.possibleDuplicate;
        const typeClass = (item.type || '').toLowerCase().includes('email') ? 'type-email'
          : (item.type || '').toLowerCase().includes('teams') || (item.type || '').toLowerCase().includes('meeting') ? 'type-teams'
          : 'type-call';
        return `
          <tr data-entry-id="${escapeHtml(item.id)}" style="border-bottom:1px solid var(--border);cursor:pointer;${isDupe ? 'background:rgba(251,191,36,0.06)' : ''}" ${isDupe ? 'title="Possible duplicate — this entry appears to match a calendar event"' : ''}>
            <td style="padding:8px 12px;font-variant-numeric:tabular-nums;color:var(--text-secondary);white-space:nowrap">
              ${escapeHtml(item.startFormatted || '')}
              ${item.endFormatted ? ` - ${escapeHtml(item.endFormatted)}` : ''}
            </td>
            <td style="padding:8px 12px">
              <span class="type-badge ${typeClass}">${escapeHtml(item.type || '-')}</span>
              ${isDupe ? '<span style="color:var(--warning);font-size:11px;margin-left:4px" title="Possible duplicate">dup</span>' : ''}
            </td>
            <td style="padding:8px 12px;font-weight:500;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${(!item.client || item.client.includes('UNKNOWN')) ? 'color:var(--warning)' : ''}">${escapeHtml(item.client || 'UNKNOWN')}</td>
            <td style="padding:8px 12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-secondary)">${escapeHtml(truncate(item.subject || item.activityDescription || '', 50))}</td>
            <td style="padding:8px 12px;text-align:right"><span class="duration-chip">${item.durationHours || 0.1}h</span></td>
            <td style="padding:8px 12px;text-align:center">
              <button data-delete-id="${escapeHtml(item.id)}" class="btn btn-ghost btn-xs" style="color:var(--danger);padding:2px 6px" title="Remove entry">&times;</button>
            </td>
          </tr>`;
      }).join('')}
    </tbody>
  </table>`;
}
