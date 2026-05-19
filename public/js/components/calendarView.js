import { store } from '../state.js';
import { escapeHtml, truncate, isBillable, billableItems, toast } from '../utils.js';
import { deleteEntry, setEntryExcluded } from '../api.js';
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
    const billable = billableItems(items);
    const count = billable.length;
    const hours = billable.reduce((s, i) => s + (i.durationHours || 0.1), 0).toFixed(1);
    const hasDupes = billable.some(i => i.possibleDuplicate);
    const hasData = items.length > 0;

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

  const billableAll = billableItems(store.billingItems);
  const totalItems = billableAll.length;
  const totalHours = billableAll.reduce((s, i) => s + (i.durationHours || 0.1), 0).toFixed(1);
  const dupeCount = billableAll.filter(i => i.possibleDuplicate).length;
  const flaggedCount = store.billingItems.filter(i => i.billingExcluded && !i.consolidatedInto).length;
  const combinedCount = store.billingItems.filter(i => i.isConsolidated && isBillable(i)).length;

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <h1 style="font-size:16px;font-weight:600">Calendar Review</h1>
      <div style="display:flex;gap:8px;font-size:12px;color:var(--muted)">
        <span>${totalItems} billable entries</span>
        <span>·</span>
        <span>${totalHours}h total</span>
        ${combinedCount ? `<span>·</span><span style="color:var(--accent)">${combinedCount} combined</span>` : ''}
        ${flaggedCount ? `<span>·</span><span style="color:var(--muted)">${flaggedCount} flagged non-billable</span>` : ''}
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
  const billable = billableItems(items);
  const totalHours = billable.reduce((s, i) => s + (i.durationHours || 0.1), 0).toFixed(1);
  const flagged = items.length - billable.length;

  detail.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div style="display:flex;align-items:center;gap:8px">
          <button class="btn btn-ghost btn-xs" id="cal-back">&larr; Month</button>
          <h2 style="font-size:13px">${dateLabel}</h2>
        </div>
        <span style="font-size:12px;color:var(--muted)">${billable.length} billable · ${totalHours}h${flagged ? ` · ${flagged} flagged` : ''}</span>
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

  // Re-render month totals + this day after any change (month view clears detail)
  const rerender = () => {
    updateNavBadges();
    renderMonthView(container);
    if (viewingDay) setTimeout(() => renderDayDetail(container), 0);
  };

  // Apply a set of {id, fields} updates to the session + local store.
  const applyUpdates = async (updates) => {
    for (const u of updates) {
      const local = store.billingItems.find(i => i.id === u.id);
      if (local) Object.assign(local, u.fields);
      await setEntryExcluded(u.id, !!u.fields.billingExcluded, u.fields);
    }
  };

  const findGroupFor = (item) => {
    if (item.isConsolidated) return item;
    return store.billingItems.find(g => g.isConsolidated && (g.mergedSourceIds || []).includes(item.id));
  };

  // Delete (hard remove — unchanged behavior)
  detail.querySelectorAll('[data-delete-id]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.deleteId;
      if (!confirm('Remove this entry?')) return;
      try {
        await deleteEntry(id);
        store.billingItems = store.billingItems.filter(i => i.id !== id);
        rerender();
      } catch (err) { console.error('Delete failed:', err); }
    });
  });

  // Exclude a billable entry (reversible)
  detail.querySelectorAll('[data-exclude-id]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await applyUpdates([{ id: btn.dataset.excludeId, fields: { billingExcluded: true, excludeReason: 'Manually excluded', excludeKind: 'manual' } }]);
        toast('Excluded from billing — use “Add back” to undo');
        rerender();
      } catch (err) { toast('Could not exclude entry', true); }
    });
  });

  // Add a flagged entry back into billing (reversible)
  detail.querySelectorAll('[data-addback-id]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await applyUpdates([{ id: btn.dataset.addbackId, fields: { billingExcluded: false, excludeReason: '', excludeKind: '' } }]);
        toast('Added back to billing');
        rerender();
      } catch (err) { toast('Could not add entry back', true); }
    });
  });

  // Un-merge a combined entry back into its individual emails
  detail.querySelectorAll('[data-unmerge-id]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const group = findGroupFor(store.billingItems.find(i => i.id === btn.dataset.unmergeId) || {});
      if (!group) return;
      try {
        const updates = [{ id: group.id, fields: { billingExcluded: true, excludeReason: 'Un-merged (split back to individual emails)', excludeKind: 'unmerged-group' } }];
        (group.mergedSourceIds || []).forEach(cid =>
          updates.push({ id: cid, fields: { billingExcluded: false, consolidatedInto: null, excludeReason: '', excludeKind: '' } }));
        await applyUpdates(updates);
        toast(`Un-merged — ${group.mergedSourceIds.length} individual emails restored`);
        rerender();
      } catch (err) { toast('Could not un-merge', true); }
    });
  });

  // Re-combine a previously un-merged group
  detail.querySelectorAll('[data-recombine-id]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const group = store.billingItems.find(i => i.id === btn.dataset.recombineId);
      if (!group) return;
      const groupKey = String(group.id).replace(/^group-/, '');
      try {
        const updates = [{ id: group.id, fields: { billingExcluded: false, excludeReason: '', excludeKind: '' } }];
        (group.mergedSourceIds || []).forEach(cid =>
          updates.push({ id: cid, fields: { billingExcluded: true, consolidatedInto: groupKey, excludeReason: `Rolled into combined entry (${group.mergedSourceIds.length} emails, same subject/day)`, excludeKind: 'consolidated-child' } }));
        await applyUpdates(updates);
        toast('Re-combined into one entry');
        rerender();
      } catch (err) { toast('Could not re-combine', true); }
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
        const isChild = !!item.consolidatedInto;
        const isCombined = !!item.isConsolidated;
        const excluded = !!item.billingExcluded;
        const typeClass = (item.type || '').toLowerCase().includes('email') ? 'type-email'
          : (item.type || '').toLowerCase().includes('teams') || (item.type || '').toLowerCase().includes('meeting') ? 'type-teams'
          : 'type-call';

        // Row background by state
        let rowBg = '';
        if (isCombined && !excluded) rowBg = 'background:rgba(99,102,241,0.07)';
        else if (excluded) rowBg = 'background:rgba(120,120,120,0.06)';
        else if (isDupe) rowBg = 'background:rgba(251,191,36,0.06)';
        const dim = excluded ? 'opacity:0.6' : '';

        // State badge next to type
        let stateBadge = '';
        if (isCombined) stateBadge = `<span style="color:var(--accent);font-size:11px;margin-left:6px" title="Combined: ${item.mergedCount} same-subject emails this day">🔗 ${item.mergedCount} emails</span>`;
        else if (isChild) stateBadge = `<span style="color:var(--muted);font-size:11px;margin-left:6px" title="${escapeHtml(item.excludeReason || '')}">↳ in combined entry</span>`;
        else if (excluded) stateBadge = `<span style="color:var(--muted);font-size:11px;margin-left:6px" title="${escapeHtml(item.excludeReason || '')}">excluded</span>`;
        else if (isDupe) stateBadge = '<span style="color:var(--warning);font-size:11px;margin-left:4px" title="Possible duplicate">dup</span>';

        // Reversible action button(s)
        let actions;
        if (isCombined) {
          actions = excluded
            ? `<button data-recombine-id="${escapeHtml(item.id)}" class="btn btn-ghost btn-xs" style="color:var(--accent);padding:2px 6px" title="Re-combine into one entry">recombine</button>`
            : `<button data-unmerge-id="${escapeHtml(item.id)}" class="btn btn-ghost btn-xs" style="padding:2px 6px" title="Split back into individual emails">un-merge</button>`;
        } else if (isChild) {
          actions = `<button data-unmerge-id="${escapeHtml(item.id)}" class="btn btn-ghost btn-xs" style="padding:2px 6px" title="Split this group back into individual emails">split out</button>`;
        } else if (excluded) {
          actions = `<button data-addback-id="${escapeHtml(item.id)}" class="btn btn-ghost btn-xs" style="color:var(--success);padding:2px 6px" title="${escapeHtml(item.excludeReason || 'Add back to billing')}">add back</button>`;
        } else {
          actions = `<button data-exclude-id="${escapeHtml(item.id)}" class="btn btn-ghost btn-xs" style="color:var(--muted);padding:2px 6px" title="Mark non-billable (reversible)">exclude</button>`
            + ` <button data-delete-id="${escapeHtml(item.id)}" class="btn btn-ghost btn-xs" style="color:var(--danger);padding:2px 6px" title="Remove entry">&times;</button>`;
        }

        return `
          <tr data-entry-id="${escapeHtml(item.id)}" style="border-bottom:1px solid var(--border);cursor:pointer;${rowBg};${dim}" ${item.excludeReason ? `title="${escapeHtml(item.excludeReason)}"` : (isDupe ? 'title="Possible duplicate — this entry appears to match a calendar event"' : '')}>
            <td style="padding:8px 12px;font-variant-numeric:tabular-nums;color:var(--text-secondary);white-space:nowrap">
              ${escapeHtml(item.startFormatted || '')}
              ${item.endFormatted ? ` - ${escapeHtml(item.endFormatted)}` : ''}
            </td>
            <td style="padding:8px 12px">
              <span class="type-badge ${typeClass}">${escapeHtml(item.type || '-')}</span>
              ${stateBadge}
            </td>
            <td style="padding:8px 12px;font-weight:500;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${(!item.client || item.client.includes('UNKNOWN')) ? 'color:var(--warning)' : ''}">${escapeHtml(item.client || 'UNKNOWN')}</td>
            <td style="padding:8px 12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-secondary)">${escapeHtml(truncate(item.subject || item.activityDescription || '', 50))}</td>
            <td style="padding:8px 12px;text-align:right"><span class="duration-chip" style="${excluded ? 'text-decoration:line-through;opacity:0.6' : ''}">${item.durationHours || 0.1}h</span></td>
            <td style="padding:8px 12px;text-align:center;white-space:nowrap">${actions}</td>
          </tr>`;
      }).join('')}
    </tbody>
  </table>`;
}
