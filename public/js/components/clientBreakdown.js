import { store } from '../state.js';
import { escapeHtml, truncate } from '../utils.js';
import { DataTable } from './dataTable.js';
import { open as openDrilldown } from './drilldownPanel.js';
import { openEditModal } from './editModal.js';
let selectedClient = null;
export function renderClients(container) {
  container.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem"><h1 style="font-size:1.2rem;font-weight:600;display:flex;align-items:center;gap:8px"><span style="font-size:1.3rem">👥</span> Client Breakdown</h1></div><div id="clients-grid-container"></div><div id="client-detail-container" style="margin-top:1rem"></div>';
  const items = store.billingItems;
  const clientMap = {};
  items.forEach(item => { const c = item.client || 'UNKNOWN'; if (!clientMap[c]) clientMap[c] = { client: c, totalEntries: 0, totalHours: 0, matterKey: item.matterKey, rate: item.rate, breakdown: { email:{count:0,hours:0}, teams:{count:0,hours:0}, meeting:{count:0,hours:0}, call:{count:0,hours:0} } }; const m = clientMap[c]; m.totalEntries++; m.totalHours += item.durationHours || 0.1; const type = (item.type||'').toLowerCase(); if (type.includes('email')) { m.breakdown.email.count++; m.breakdown.email.hours += item.durationHours||0.1; } else if (type.includes('teams')) { m.breakdown.teams.count++; } else if (type.includes('meeting')) { m.breakdown.meeting.count++; } else if (type.includes('call')) { m.breakdown.call.count++; } });
  const clients = Object.values(clientMap).map(c => ({...c, totalHours: parseFloat(c.totalHours.toFixed(1))})).sort((a,b) => b.totalHours - a.totalHours);
  const gridContainer = container.querySelector('#clients-grid-container');
  if (!clients.length) { gridContainer.innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div><h3>No clients</h3><p>Pull data to see client breakdowns.</p></div>'; return; }
  let html = '<div class="clients-grid">';
  clients.forEach(c => {
    const total = c.totalEntries;
    const emailPct = total ? (c.breakdown.email.count/total*100) : 0;
    html += '<div class="client-card" data-client="' + escapeHtml(c.client) + '"><div class="client-card-header"><span class="client-name ' + (c.client.includes('UNKNOWN') ? 'unknown' : '') + '">' + escapeHtml(c.client) + '</span><span class="client-hours">' + c.totalHours + 'h</span></div><div class="client-entries-count">' + c.totalEntries + ' entries' + (c.matterKey ? ' · Key: ' + c.matterKey : '') + (c.rate ? ' · $' + c.rate + '/hr' : '') + '</div><div class="client-source-bar"><div class="source-segment email" style="width:' + emailPct + '%"></div></div></div>';
  });
  html += '</div>';
  gridContainer.innerHTML = html;
}
