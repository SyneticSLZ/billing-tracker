import { store } from '../state.js';
import { getClients } from '../api.js';
import { escapeHtml, truncate, getTypeColor } from '../utils.js';
import { DataTable } from './dataTable.js';
import { open as openDrilldown } from './drilldownPanel.js';
import { openEditModal } from './editModal.js';

let selectedClient = null;

export function renderClients(container) {
  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">
      <h1 style="font-size:1.2rem;font-weight:600;display:flex;align-items:center;gap:8px">
        <span style="font-size:1.3rem">👥</span> Client Breakdown
      </h1>
    </div>
    <div id="clients-grid-container"></div>
    <div id="client-detail-container" style="margin-top:1rem"></div>
  `;

  renderClientCards(container);
}

function renderClientCards(parentContainer) {
  const items = store.billingItems;
  const clientMap = {};

  items.forEach(item => {
    const client = item.client || 'UNKNOWN';
    if (!clientMap[client]) {
      clientMap[client] = { client, totalEntries: 0, totalHours: 0, breakdown: { email: { count: 0, hours: 0 }, teams: { count: 0, hours: 0 }, meeting: { count: 0, hours: 0 }, call: { count: 0, hours: 0 } } };
    }
    const c = clientMap[client];
    c.totalEntries++;
    c.totalHours += item.durationHours || 0.1;

    const type = (item.type || '').toLowerCase();
    if (type.includes('email')) { c.breakdown.email.count++; c.breakdown.email.hours += item.durationHours || 0.1; }
    else if (type.includes('teams message')) { c.breakdown.teams.count++; c.breakdown.teams.hours += item.durationHours || 0.1; }
    else if (type.includes('meeting')) { c.breakdown.meeting.count++; c.breakdown.meeting.hours += item.durationHours || 0.1; }
    else if (type.includes('call')) { c.breakdown.call.count++; c.breakdown.call.hours += item.durationHours || 0.1; }
  });

  const clients = Object.values(clientMap)
    .map(c => ({ ...c, totalHours: parseFloat(c.totalHours.toFixed(1)) }))
    .sort((a, b) => b.totalHours - a.totalHours);

  const gridContainer = parentContainer.querySelector('#clients-grid-container');

  if (!clients.length) {
    gridContainer.innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div><h3>No clients</h3><p>Pull data to see client breakdowns.</p></div>';
    return;
  }

  // Summary stats
  const totalClients = clients.length;
  const totalHours = clients.reduce((s, c) => s + c.totalHours, 0).toFixed(1);
  const unknownCount = clients.filter(c => c.client.includes('UNKNOWN')).length;

  let html = `<div style="display:flex;gap:1rem;margin-bottom:1rem;flex-wrap:wrap">
    <div class="stat-card" style="flex:1;min-width:120px"><div class="stat-label">Total Clients</div><div class="stat-value">${totalClients}</div></div>
    <div class="stat-card" style="flex:1;min-width:120px"><div class="stat-label">Total Hours</div><div class="stat-value">${totalHours}h</div></div>
    ${unknownCount ? `<div class="stat-card" style="flex:1;min-width:120px;border-color:var(--warning)"><div class="stat-label">Needs Review</div><div class="stat-value" style="color:var(--warning)">${unknownCount}</div></div>` : ''}
  </div>`;

  html += '<div class="clients-grid">';
  clients.forEach(c => {
    const isActive = selectedClient === c.client;
    const total = c.totalEntries;
    const emailPct = total ? (c.breakdown.email.count / total * 100) : 0;
    const teamsPct = total ? (c.breakdown.teams.count / total * 100) : 0;
    const meetingPct = total ? (c.breakdown.meeting.count / total * 100) : 0;
    const callPct = total ? (c.breakdown.call.count / total * 100) : 0;

    const sourceLabels = [];
    if (c.breakdown.email.count) sourceLabels.push(`<span class="source-label"><span class="source-label-dot" style="background:var(--email-color)"></span>${c.breakdown.email.count} emails</span>`);
    if (c.breakdown.teams.count) sourceLabels.push(`<span class="source-label"><span class="source-label-dot" style="background:var(--teams-color)"></span>${c.breakdown.teams.count} teams</span>`);
    if (c.breakdown.meeting.count) sourceLabels.push(`<span class="source-label"><span class="source-label-dot" style="background:var(--meeting-color)"></span>${c.breakdown.meeting.count} meetings</span>`);
    if (c.breakdown.call.count) sourceLabels.push(`<span class="source-label"><span class="source-label-dot" style="background:var(--call-color)"></span>${c.breakdown.call.count} calls</span>`);

    html += `<div class="client-card ${isActive ? 'active' : ''}" data-client="${escapeHtml(c.client)}">
      <div class="client-card-header">
        <span class="client-name ${c.client.includes('UNKNOWN') ? 'unknown' : ''}">${escapeHtml(c.client)}</span>
        <span class="client-hours">${c.totalHours}h</span>
      </div>
      <div class="client-entries-count">${c.totalEntries} entries</div>
      <div class="client-source-bar">
        ${emailPct ? `<div class="source-segment email" style="width:${emailPct}%"></div>` : ''}
        ${teamsPct ? `<div class="source-segment teams" style="width:${teamsPct}%"></div>` : ''}
        ${meetingPct ? `<div class="source-segment meeting" style="width:${meetingPct}%"></div>` : ''}
        ${callPct ? `<div class="source-segment call" style="width:${callPct}%"></div>` : ''}
      </div>
      <div class="client-source-labels">${sourceLabels.join('')}</div>
    </div>`;
  });
  html += '</div>';
  gridContainer.innerHTML = html;

  // Bind card clicks
  gridContainer.querySelectorAll('.client-card').forEach(card => {
    card.addEventListener('click', () => {
      const name = card.dataset.client;
      selectedClient = selectedClient === name ? null : name;
      gridContainer.querySelectorAll('.client-card').forEach(c => c.classList.toggle('active', c.dataset.client === selectedClient));

      if (selectedClient) {
        renderClientDetail(parentContainer.querySelector('#client-detail-container'), selectedClient, items, parentContainer);
      } else {
        parentContainer.querySelector('#client-detail-container').innerHTML = '';
      }
    });
  });

  // Show selected client detail if any
  if (selectedClient) {
    renderClientDetail(parentContainer.querySelector('#client-detail-container'), selectedClient, items, parentContainer);
  }
}

function renderClientDetail(detailContainer, clientName, allItems, parentContainer) {
  const clientItems = allItems.filter(i => i.client === clientName);

  if (!clientItems.length) {
    detailContainer.innerHTML = '';
    return;
  }

  // Stacked bar
  const totalHours = clientItems.reduce((s, i) => s + (i.durationHours || 0.1), 0);
  const emailHours = clientItems.filter(i => (i.type || '').toLowerCase().includes('email')).reduce((s, i) => s + (i.durationHours || 0.1), 0);
  const teamsHours = clientItems.filter(i => i.type === 'Teams Message').reduce((s, i) => s + (i.durationHours || 0.1), 0);
  const meetingHours = clientItems.filter(i => (i.type || '').toLowerCase().includes('meeting')).reduce((s, i) => s + (i.durationHours || 0.1), 0);
  const callHours = clientItems.filter(i => (i.type || '').toLowerCase().includes('call')).reduce((s, i) => s + (i.durationHours || 0.1), 0);

  detailContainer.innerHTML = `
    <div class="client-detail">
      <div class="client-detail-header">
        <h2>${escapeHtml(clientName)} — ${clientItems.length} entries · ${totalHours.toFixed(1)}h</h2>
        <button class="btn btn-ghost btn-sm" id="close-client-detail">Close</button>
      </div>
      <div class="stacked-bar">
        ${emailHours ? `<div class="stacked-segment" style="width:${emailHours / totalHours * 100}%;background:var(--email-color)">${emailHours.toFixed(1)}h</div>` : ''}
        ${teamsHours ? `<div class="stacked-segment" style="width:${teamsHours / totalHours * 100}%;background:var(--teams-color)">${teamsHours.toFixed(1)}h</div>` : ''}
        ${meetingHours ? `<div class="stacked-segment" style="width:${meetingHours / totalHours * 100}%;background:var(--meeting-color)">${meetingHours.toFixed(1)}h</div>` : ''}
        ${callHours ? `<div class="stacked-segment" style="width:${callHours / totalHours * 100}%;background:var(--call-color)">${callHours.toFixed(1)}h</div>` : ''}
      </div>
      <div id="client-entries-table" style="padding:0"></div>
    </div>
  `;

  detailContainer.querySelector('#close-client-detail').addEventListener('click', () => {
    selectedClient = null;
    detailContainer.innerHTML = '';
    detailContainer.closest('#view-container')?.querySelectorAll('.client-card').forEach(c => c.classList.remove('active'));
  });

  const table = new DataTable({
    container: detailContainer.querySelector('#client-entries-table'),
    columns: [
      { key: 'type', label: 'Type', width: '100px', render: (i) => { const cls = (i.type||'').toLowerCase().includes('email') ? 'type-email' : (i.type||'').toLowerCase().includes('teams') || (i.type||'').toLowerCase().includes('meeting') ? 'type-teams' : 'type-call'; return `<span class="type-badge ${cls}">${escapeHtml(i.type || '-')}</span>`; }},
      { key: 'subject', label: 'Subject', sortable: true, class: 'truncate', render: (i) => escapeHtml(truncate(i.subject || '', 40)) },
      { key: 'date', label: 'Date', sortable: true, sortType: 'date', width: '90px', class: 'mono' },
      { key: 'startFormatted', label: 'Time', width: '80px', class: 'mono muted' },
      { key: 'durationHours', label: 'Duration', sortable: true, sortType: 'number', width: '70px', render: (i) => `<span class="duration-chip">${i.durationHours || 0.1}h</span>` },
      { key: 'activityDescription', label: 'Description', class: 'truncate muted', render: (i) => escapeHtml(truncate(i.activityDescription || '', 40)) },
    ],
    data: clientItems,
    pageSize: 25,
    sortColumn: 'date',
    sortDir: 'desc',
    searchFields: ['subject', 'activityDescription', 'type'],
    emptyMessage: 'No entries for this client',
    onRowClick: (item) => {
      const type = (item.type || '').toLowerCase().includes('email') ? 'email' : (item.type || '').toLowerCase().includes('meeting') ? 'meeting' : (item.type || '').toLowerCase().includes('teams') ? 'teams' : 'call';
      openDrilldown(type, item, () => openEditModal(item, () => renderClients(parentContainer)));
    }
  });
  table.render();
}