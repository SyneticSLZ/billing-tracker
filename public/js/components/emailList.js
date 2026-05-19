// Emails tab — full audit surface.
//
// Every email is listed (billable, flagged non-billable, rolled-up children,
// the combined parent entry). Each row carries a coloured status badge that
// tells you AT A GLANCE why it will or won't export, with action buttons that
// mirror the Calendar view so you can fix things from this page too. A Status
// filter at the top isolates a single state (e.g. show me only what the
// internal filter caught) so the page doubles as the verification tool before
// uploading the XLSX to Rocket Matter.

import { store } from '../state.js';
import { escapeHtml, truncate, toast } from '../utils.js';
import { DataTable } from './dataTable.js';
import { open as openDrilldown } from './drilldownPanel.js';
import { openEditModal } from './editModal.js';
import { setEntryExcluded } from '../api.js';

const STATUS = {
  BILLABLE:        { label: 'Billable',        color: 'var(--success)', emoji: '' },
  COMBINED:        { label: 'Combined',        color: 'var(--accent)',  emoji: '🔗 ' },
  IN_COMBINED:    { label: 'In combined',     color: 'var(--muted)',   emoji: '↳ ' },
  INTERNAL:        { label: 'Internal',        color: '#e0a458',         emoji: '' },
  MEETING:         { label: 'Meeting invite',  color: '#e0a458',         emoji: '' },
  MANUAL:          { label: 'Manually excluded', color: 'var(--muted)', emoji: '' },
  UNMERGED:        { label: 'Un-merged',       color: 'var(--muted)',   emoji: '' },
  EXCLUDED:        { label: 'Excluded',        color: 'var(--muted)',   emoji: '' },
};

function statusFor(item) {
  if (item.isConsolidated && !item.billingExcluded) return STATUS.COMBINED;
  if (item.isConsolidated && item.billingExcluded)  return STATUS.UNMERGED;
  if (item.consolidatedInto)                         return STATUS.IN_COMBINED;
  if (item.excludeKind === 'internal')               return STATUS.INTERNAL;
  if (item.excludeKind === 'meeting')                return STATUS.MEETING;
  if (item.excludeKind === 'manual')                 return STATUS.MANUAL;
  if (item.billingExcluded)                          return STATUS.EXCLUDED;
  return STATUS.BILLABLE;
}

function refreshBillStatus(items) {
  items.forEach(i => { i.billStatus = statusFor(i).label; });
}

function renderBadge(item) {
  const s = statusFor(item);
  const extra = item.isConsolidated ? ' (' + item.mergedCount + ')' : '';
  const tip = item.excludeReason || (item.isConsolidated ? item.mergedCount + ' same-subject emails combined' : '');
  return '<span style="color:' + s.color + ';font-size:11px;white-space:nowrap" title="' + escapeHtml(tip) + '">'
       + s.emoji + s.label + extra + '</span>';
}

function renderActions(item) {
  const id = escapeHtml(item.id);
  if (item.isConsolidated && !item.billingExcluded) {
    return btn('unmerge', id, 'un-merge', 'Split back into individual emails');
  }
  if (item.isConsolidated && item.billingExcluded) {
    return btn('recombine', id, 'recombine', 'Re-combine into one entry', 'var(--accent)');
  }
  if (item.consolidatedInto) {
    return btn('unmerge', id, 'split out', 'Split this group back into individual emails');
  }
  if (item.billingExcluded) {
    return btn('addback', id, 'add back', escapeHtml(item.excludeReason || 'Add back to billing'), 'var(--success)');
  }
  return btn('exclude', id, 'exclude', 'Mark non-billable (reversible)', 'var(--muted)');
}

function btn(action, id, label, title, color) {
  return '<button data-row-action="' + action + '" data-row-id="' + id + '" class="btn btn-ghost btn-xs"'
       + (color ? ' style="color:' + color + ';padding:2px 6px"' : ' style="padding:2px 6px"')
       + ' title="' + title + '">' + label + '</button>';
}

export function renderEmails(container) {
  const emailItems = store.billingItems.filter(i => i.type?.toLowerCase().includes('email'));
  refreshBillStatus(emailItems);

  // Per-bucket counts — drives both the visible breakdown chips and the
  // DataTable's Status filter options.
  const counts = {
    [STATUS.BILLABLE.label]:    emailItems.filter(i => !i.billingExcluded && !i.isConsolidated && !i.consolidatedInto).length,
    [STATUS.COMBINED.label]:    emailItems.filter(i => i.isConsolidated && !i.billingExcluded).length,
    [STATUS.IN_COMBINED.label]: emailItems.filter(i => i.consolidatedInto).length,
    [STATUS.INTERNAL.label]:    emailItems.filter(i => i.excludeKind === 'internal').length,
    [STATUS.MEETING.label]:     emailItems.filter(i => i.excludeKind === 'meeting').length,
    [STATUS.MANUAL.label]:      emailItems.filter(i => i.excludeKind === 'manual').length,
    [STATUS.UNMERGED.label]:    emailItems.filter(i => i.isConsolidated && i.billingExcluded).length,
  };
  const totalHours = emailItems
    .filter(i => !i.billingExcluded)
    .reduce((s, i) => s + (i.durationHours || 0.1), 0)
    .toFixed(1);

  // Clickable chip per status — clicking one applies that filter immediately.
  const chip = (label, count, color) => count
    ? `<button data-chip-status="${label}" class="btn btn-ghost btn-xs" style="font-size:11px;padding:3px 9px;color:${color};border:1px solid ${color}33;background:${color}11" title="Click to filter">${label} <strong>${count}</strong></button>`
    : '';

  container.innerHTML = `
    <div style="margin-bottom:12px">
      <h1 style="font-size:16px;font-weight:600;display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
        Emails
        <span style="font-size:13px;color:var(--muted);font-weight:400">${emailItems.length} total</span>
        <span style="font-size:12px;color:var(--success);font-weight:400">·  ${totalHours}h billable</span>
      </h1>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <button data-chip-status="" class="btn btn-ghost btn-xs" style="font-size:11px;padding:3px 9px;color:var(--muted);border:1px solid var(--border)" title="Clear status filter">All <strong>${emailItems.length}</strong></button>
        ${chip(STATUS.BILLABLE.label,    counts[STATUS.BILLABLE.label],    STATUS.BILLABLE.color)}
        ${chip(STATUS.COMBINED.label,    counts[STATUS.COMBINED.label],    STATUS.COMBINED.color)}
        ${chip(STATUS.IN_COMBINED.label, counts[STATUS.IN_COMBINED.label], STATUS.IN_COMBINED.color)}
        ${chip(STATUS.INTERNAL.label,    counts[STATUS.INTERNAL.label],    STATUS.INTERNAL.color)}
        ${chip(STATUS.MEETING.label,     counts[STATUS.MEETING.label],     STATUS.MEETING.color)}
        ${chip(STATUS.MANUAL.label,      counts[STATUS.MANUAL.label],      STATUS.MANUAL.color)}
        ${chip(STATUS.UNMERGED.label,    counts[STATUS.UNMERGED.label],    STATUS.UNMERGED.color)}
      </div>
    </div>
    <div id="emails-table-container"></div>`;

  const tc = container.querySelector('#emails-table-container');

  const table = new DataTable({
    container: tc,
    columns: [
      { key: 'subject', label: 'Subject', sortable: true, class: 'truncate',
        render: (i) => escapeHtml(truncate(i.subject || 'No Subject', 60)) },
      { key: 'participants', label: 'From', sortable: true, class: 'truncate muted',
        render: (i) => escapeHtml(truncate(i.participants || '', 30)) },
      { key: 'folderName', label: 'Folder', sortable: true, class: 'mono muted',
        render: (i) => escapeHtml(truncate(i.folderName || '', 20)) },
      { key: 'client', label: 'Client', sortable: true, class: 'client-cell',
        render: (i) => '<span class="' + ((!i.client || i.client.includes('UNKNOWN')) ? 'unknown' : '') + '">'
          + escapeHtml(i.client || 'UNKNOWN') + '</span>'
          + (i.rmKeyMatched ? ' <span style="color:var(--success);font-size:10px">matched</span>' : '') },
      { key: 'date', label: 'Date', sortable: true, sortType: 'date', width: '90px', class: 'mono' },
      { key: 'durationHours', label: 'Duration', sortable: true, sortType: 'number', width: '80px',
        render: (i) => '<span class="duration-chip"'
          + (i.billingExcluded ? ' style="text-decoration:line-through;opacity:0.6"' : '')
          + '>' + (i.durationHours || 0.1) + 'h</span>' },
      { key: 'billStatus', label: 'Status', sortable: true, width: '140px', render: renderBadge },
      { key: 'activityDescription', label: 'Description', class: 'truncate muted',
        render: (i) => escapeHtml(truncate(i.activityDescription || '', 40)) },
      { key: '_actions', label: '', width: '110px', render: renderActions },
    ],
    data: emailItems,
    pageSize: store.settings.pageSize || 50,
    sortColumn: 'date',
    sortDir: 'desc',
    searchFields: ['subject', 'participants', 'client', 'activityDescription', 'bodyPreview', 'folderName'],
    filters: [
      { key: 'billStatus', label: 'Status', options: [
        STATUS.BILLABLE.label, STATUS.COMBINED.label, STATUS.IN_COMBINED.label,
        STATUS.INTERNAL.label, STATUS.MEETING.label, STATUS.MANUAL.label,
        STATUS.UNMERGED.label,
      ] },
    ],
    emptyMessage: 'No emails found',
    emptyIcon: '',
    onRowClick: (item) => {
      openDrilldown('email', item, () => openEditModal(item, () => renderEmails(container)));
    },
  });
  table.render();

  // Status chips → apply (or clear) the DataTable's Status filter. Chips live
  // outside the table container so they survive table.render() and double as
  // a visible breakdown of how many emails landed in each bucket.
  container.querySelectorAll('[data-chip-status]').forEach(b => {
    b.addEventListener('click', () => {
      const value = b.dataset.chipStatus;
      table.filterValues = value ? { billStatus: value } : {};
      table.page = 1;
      table.render();
      // Visual "active" cue on the chosen chip
      container.querySelectorAll('[data-chip-status]').forEach(x => {
        x.style.outline = x.dataset.chipStatus === value ? '2px solid currentColor' : 'none';
      });
    });
  });

  // Action buttons — event delegation on the persistent container so it
  // survives DataTable re-renders (page/sort/search/filter).
  tc.addEventListener('click', async (e) => {
    const btnEl = e.target.closest('[data-row-action]');
    if (!btnEl) return;
    e.stopPropagation();
    const id = btnEl.dataset.rowId;
    const action = btnEl.dataset.rowAction;
    try {
      await dispatchAction(action, id);
    } catch (err) {
      toast('Action failed: ' + err.message, true);
      return;
    }
    // Full re-render so chip counts + breakdown reflect the new state too.
    renderEmails(container);
  });
}

// Mirrors the calendarView reversible-action semantics. Mutates the matching
// item(s) in store.billingItems in place and persists via PUT /api/entry/:id
// (no re-fetch — toggles are flag-only).
async function dispatchAction(action, id) {
  const findGroupFor = (item) => {
    if (item?.isConsolidated) return item;
    return store.billingItems.find(g => g.isConsolidated && (g.mergedSourceIds || []).includes(item?.id));
  };
  const apply = async (updates) => {
    for (const u of updates) {
      const local = store.billingItems.find(i => i.id === u.id);
      if (local) Object.assign(local, u.fields);
      await setEntryExcluded(u.id, !!u.fields.billingExcluded, u.fields);
    }
  };

  if (action === 'exclude') {
    await apply([{ id, fields: { billingExcluded: true, excludeReason: 'Manually excluded', excludeKind: 'manual' } }]);
    toast('Excluded — use “add back” to undo');
    return;
  }
  if (action === 'addback') {
    await apply([{ id, fields: { billingExcluded: false, excludeReason: '', excludeKind: '' } }]);
    toast('Added back to billing');
    return;
  }
  if (action === 'unmerge') {
    const item = store.billingItems.find(i => i.id === id);
    const group = findGroupFor(item);
    if (!group) return;
    const updates = [
      { id: group.id, fields: { billingExcluded: true, excludeReason: 'Un-merged (split back to individual emails)', excludeKind: 'unmerged-group' } },
      ...(group.mergedSourceIds || []).map(cid => ({
        id: cid, fields: { billingExcluded: false, consolidatedInto: null, excludeReason: '', excludeKind: '' },
      })),
    ];
    await apply(updates);
    toast(`Un-merged — ${group.mergedSourceIds.length} individual emails restored`);
    return;
  }
  if (action === 'recombine') {
    const group = store.billingItems.find(i => i.id === id);
    if (!group) return;
    const groupKey = String(group.id).replace(/^group-/, '');
    const updates = [
      { id: group.id, fields: { billingExcluded: false, excludeReason: '', excludeKind: '' } },
      ...(group.mergedSourceIds || []).map(cid => ({
        id: cid, fields: {
          billingExcluded: true,
          consolidatedInto: groupKey,
          excludeReason: `Rolled into combined entry (${group.mergedSourceIds.length} emails, same subject/day)`,
          excludeKind: 'consolidated-child',
        },
      })),
    ];
    await apply(updates);
    toast('Re-combined into one entry');
  }
}
