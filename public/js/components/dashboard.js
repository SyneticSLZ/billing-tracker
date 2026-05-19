import { store } from '../state.js';
import { fetchBillingData, getEntries, clearAllEntries, getSubfolders, getMailboxOverview } from '../api.js';
import { toast, setDateRange as getDateRange, getRecentCompleteMonth, escapeHtml, getTypeColor, billableItems, isBillable } from '../utils.js';
import { renderStatsBar } from './statsBar.js';
import { renderDonutChart, renderBarChart } from './chartPanel.js';
import { showProgress, hideProgress, setProgress } from './progressBar.js';
import { initUploadZone } from './uploadZone.js';
import { DataTable } from './dataTable.js';
import { open as openDrilldown } from './drilldownPanel.js';
import { openEditModal } from './editModal.js';
import { updateNavBadges } from './nav.js';
import { navigate } from '../router.js';

// ─── Module-level state for folder selection ───
let selectedFolders = new Set(); // displayName strings
let allFolderNames = [];

function buildMonthButtons() {
  const now = new Date();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fullNames = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  const recent = getRecentCompleteMonth();
  const buttons = [];

  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mIdx = d.getMonth();
    const year = d.getFullYear();
    const key = fullNames[mIdx];
    const isCurrent = (mIdx === now.getMonth() && year === now.getFullYear());
    const isRecent = (key === recent.key && year === now.getFullYear()) || (key === recent.key && year === now.getFullYear() - 1 && now.getMonth() === 0);
    const label = `${months[mIdx]} ${year !== now.getFullYear() ? year : ''}`.trim();
    const cls = isRecent ? 'btn btn-accent btn-sm' : 'btn btn-ghost btn-sm';
    buttons.push(`<button class="${cls}" data-range="${key}" data-year="${year}" title="${isCurrent ? 'Current month (incomplete)' : ''}">${label}${isRecent ? ' (latest)' : ''}</button>`);
  }

  return buttons.join('');
}

export function renderDashboard(container) {
  const dates = getDateRange(store.settings.defaultDateRange || 'month');

  container.innerHTML = `
    <!-- Mailbox Overview -->
    <div class="card" style="margin-bottom:16px" id="mailbox-overview-section">
      <div class="card-header">
        <h2>
          Mailbox Overview
          <span id="mailbox-total-badge" style="font-size:11px;background:var(--accent);color:var(--bg);padding:2px 8px;border-radius:10px;display:none"></span>
        </h2>
        <button class="btn btn-ghost btn-sm" id="refresh-mailbox-btn">Refresh</button>
      </div>
      <div class="card-body" id="mailbox-overview-body">
        <div style="font-size:13px;color:var(--muted);padding:8px 0">Loading mailbox...</div>
      </div>
    </div>

    <!-- Controls -->
    <div class="controls-panel">
      <div class="control-group">
        <label>From Date</label>
        <input type="date" id="start-date" value="${dates.start}">
      </div>
      <div class="control-group">
        <label>To Date</label>
        <input type="date" id="end-date" value="${dates.end}">
      </div>
      <div class="quick-actions">
        <button class="btn btn-primary" id="fetch-btn">Pull Data</button>
        <button class="btn btn-ghost btn-sm" data-range="week">This Week</button>
        <button class="btn btn-ghost btn-sm" data-range="month">This Month</button>
        <button class="btn btn-ghost btn-sm" data-range="lastMonth">Last Month</button>
        <span class="quick-actions-sep"></span>
        <button class="btn btn-ghost btn-sm" id="month-picker-toggle">Pick Month</button>
      </div>
      <div class="month-picker" id="month-picker" style="display:none">
        ${buildMonthButtons()}
      </div>
    </div>

    <!-- Upload Zone -->
    <div class="upload-zone" id="upload-zone">
      <div class="upload-zone-icon" style="font-size:16px;color:var(--muted)">CSV</div>
      <div class="upload-zone-text">
        <h3>Upload AT&T Call Log</h3>
        <p>CSV format · drag & drop or click to browse</p>
      </div>
      <button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="event.stopPropagation();this.closest('.upload-zone').querySelector('input').click()">Choose File</button>
      <input type="file" accept=".csv" style="display:none">
    </div>

    <!-- Progress -->
    <div class="progress-section" id="progress-section">
      <div class="progress-header">
        <span id="progress-title">Fetching billing data...</span>
        <span class="progress-pct">0%</span>
      </div>
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill"></div>
      </div>
      <div class="progress-message">Starting...</div>
      <div class="progress-sources" id="progress-sources" style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">
        <div class="progress-source" data-source="emails">
          <span class="progress-source-label" style="font-weight:600">E</span>
          <span class="progress-source-label">Emails</span>
          <span class="progress-source-count" data-count="emails">...</span>
        </div>
        <div class="progress-source" data-source="meetings">
          <span class="progress-source-label" style="font-weight:600">M</span>
          <span class="progress-source-label">Meetings</span>
          <span class="progress-source-count" data-count="meetings">...</span>
        </div>
        <div class="progress-source" data-source="teams">
          <span class="progress-source-label" style="font-weight:600">T</span>
          <span class="progress-source-label">Teams</span>
          <span class="progress-source-count" data-count="teams">...</span>
        </div>
        <div class="progress-source" data-source="calls">
          <span class="progress-source-label" style="font-weight:600">C</span>
          <span class="progress-source-label">Calls</span>
          <span class="progress-source-count" data-count="calls">...</span>
        </div>
      </div>
      <div id="ai-live-feed" style="display:none;margin-top:8px">
        <div style="font-size:11px;color:var(--muted)">
          AI Processing <span id="ai-counter">0/0</span>
        </div>
      </div>
    </div>

    <!-- Stats -->
    <div class="stats-grid" id="stats-grid"></div>

    <!-- Charts -->
    <div class="charts-row" id="charts-row" style="display:none">
      <div class="chart-card">
        <h3>Source Distribution</h3>
        <div id="donut-chart"></div>
      </div>
      <div class="chart-card">
        <h3>Daily Activity</h3>
        <div id="bar-chart"></div>
      </div>
    </div>

    <!-- Two columns: top clients + recent entries -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:1rem;margin-bottom:16px" id="bottom-grid">
      <div class="card">
        <div class="card-header">
          <h2>Top Clients</h2>
          <button class="btn btn-ghost btn-xs" onclick="navigateTo('clients')">View All</button>
        </div>
        <div class="card-body no-padding" id="top-clients-container">
          <div class="empty-state"><p>Pull data to see clients</p></div>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <h2>Recent Entries</h2>
          <div style="display:flex;gap:6px">
            <button class="btn btn-success btn-xs" id="export-xlsx-btn" style="display:none" onclick="window.open('/export/xlsx','_blank')">Export NextGen XLSX</button>
            <button class="btn btn-ghost btn-xs" id="export-csv-btn" style="display:none" onclick="window.open('/export/csv','_blank')">Export CSV</button>
            <button class="btn btn-danger btn-xs" id="clear-btn" style="display:none">Clear All</button>
          </div>
        </div>
        <div class="card-body no-padding" id="recent-entries-container">
          <div class="empty-state"><p>No entries yet</p></div>
        </div>
      </div>
    </div>
  `;

  // ── Bind events ──
  const fetchBtn = container.querySelector('#fetch-btn');
  fetchBtn.addEventListener('click', () => handleFetch(container));

  const monthPickerToggle = container.querySelector('#month-picker-toggle');
  const monthPicker = container.querySelector('#month-picker');
  monthPickerToggle.addEventListener('click', () => {
    const visible = monthPicker.style.display !== 'none';
    monthPicker.style.display = visible ? 'none' : 'flex';
    monthPickerToggle.textContent = visible ? 'Pick Month' : 'Hide Months';
  });

  container.querySelectorAll('[data-range]').forEach(btn => {
    btn.addEventListener('click', () => {
      let range;
      if (btn.dataset.year) {
        const year = parseInt(btn.dataset.year);
        const monthMap = {
          january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
          july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
        };
        const mIdx = monthMap[btn.dataset.range];
        if (mIdx !== undefined) {
          const first = new Date(year, mIdx, 1);
          const last = new Date(year, mIdx + 1, 0);
          range = { start: first.toISOString().split('T')[0], end: last.toISOString().split('T')[0] };
        } else {
          range = getDateRange(btn.dataset.range);
        }
      } else {
        range = getDateRange(btn.dataset.range);
      }
      container.querySelector('#start-date').value = range.start;
      container.querySelector('#end-date').value = range.end;
      if (monthPicker.contains(btn)) {
        monthPicker.style.display = 'none';
        monthPickerToggle.textContent = 'Pick Month';
      }
    });
  });

  const clearBtn = container.querySelector('#clear-btn');
  clearBtn.addEventListener('click', async () => {
    if (!confirm('Clear all billing entries?')) return;
    await clearAllEntries();
    store.billingItems = [];
    store.rawData = { emails: [], events: [], teamsMessages: [], callRecords: [], uploadedCalls: [] };
    refreshDashboard(container);
    toast('All entries cleared');
  });

  initUploadZone(container.querySelector('#upload-zone'), () => refreshDashboard(container));

  // ── Mailbox overview ──
  container.querySelector('#refresh-mailbox-btn').addEventListener('click', () => loadMailboxOverview(container));
  loadMailboxOverview(container);

  // ── Load existing entries ──
  loadExisting(container);

  // Client Mapping lives on its own tab; it self-bootstraps at app start.
}

// ─── MAILBOX OVERVIEW ───

async function loadMailboxOverview(container) {
  const body = container.querySelector('#mailbox-overview-body');
  const badge = container.querySelector('#mailbox-total-badge');
  if (!body) return;

  body.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:8px 0">Loading mailbox...</div>';
  badge.style.display = 'none';

  try {
    const data = await getMailboxOverview();
    if (data.error) {
      body.innerHTML = `<div style="font-size:12px;color:var(--danger)">${escapeHtml(data.error)}</div>`;
      return;
    }

    const { inboxTotal, subfolders } = data;
    allFolderNames = subfolders.map(f => f.displayName);

    // Default: all selected
    if (selectedFolders.size === 0) {
      allFolderNames.forEach(n => selectedFolders.add(n));
    }

    badge.textContent = `${inboxTotal} total emails`;
    badge.style.display = 'inline-block';

    renderMailboxFolders(body, subfolders);
  } catch (err) {
    body.innerHTML = `<div style="font-size:12px;color:var(--danger)">Failed to load mailbox: ${escapeHtml(err.message)}</div>`;
  }
}

function renderMailboxFolders(body, subfolders) {
  const selCount = selectedFolders.size;
  const totalCount = subfolders.length;
  const allSelected = selCount === totalCount;

  body.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:var(--muted)">
        <input type="checkbox" id="select-all-folders" ${allSelected ? 'checked' : ''} style="accent-color:var(--accent)">
        Select All (${totalCount} folders)
      </label>
      <span style="font-size:11px;font-variant-numeric:tabular-nums;color:var(--accent)" id="folder-sel-count">${selCount} selected</span>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px" id="folder-grid">
      ${subfolders.map(f => {
        const selected = selectedFolders.has(f.displayName);
        return `
          <div class="folder-card" data-folder="${escapeHtml(f.displayName)}" style="
            padding:8px 14px;
            border-radius:8px;
            font-size:13px;
            border:1.5px solid ${selected ? 'var(--accent)' : 'var(--border)'};
            background:${selected ? 'rgba(79,209,197,0.08)' : 'var(--surface2)'};
            cursor:pointer;
            transition:all 0.15s ease;
            display:flex;align-items:center;gap:8px;
            user-select:none;
          ">
            <input type="checkbox" ${selected ? 'checked' : ''} style="accent-color:var(--accent);pointer-events:none">
            <div>
              <div style="font-weight:500;color:${selected ? 'var(--fg)' : 'var(--muted)'}">${escapeHtml(f.displayName)}</div>
              <div style="font-variant-numeric:tabular-nums;font-size:11px;color:var(--muted);margin-top:1px">${f.totalItemCount} emails${f.unreadItemCount ? ` · ${f.unreadItemCount} unread` : ''}</div>
            </div>
          </div>`;
      }).join('')}
    </div>
  `;

  // Toggle individual folder
  body.querySelectorAll('.folder-card').forEach(card => {
    card.addEventListener('click', () => {
      const name = card.dataset.folder;
      if (selectedFolders.has(name)) {
        selectedFolders.delete(name);
      } else {
        selectedFolders.add(name);
      }
      renderMailboxFolders(body, subfolders);
    });
  });

  // Select all toggle
  const selectAllCb = body.querySelector('#select-all-folders');
  if (selectAllCb) {
    selectAllCb.addEventListener('change', () => {
      if (selectAllCb.checked) {
        allFolderNames.forEach(n => selectedFolders.add(n));
      } else {
        selectedFolders.clear();
      }
      renderMailboxFolders(body, subfolders);
    });
  }
}

// ─── RM Key UI moved to its own tab — see clientMappingView.js ───
// (Eager bootstrap of defaults runs from app.js → initClientMapping().)


// ─── EXISTING FUNCTIONS (modified) ───

async function loadExisting(container) {
  try {
    const data = await getEntries();
    if (data.items?.length) {
      store.billingItems = data.items;
      refreshDashboard(container);
    }
  } catch { /* ignore */ }
}

async function handleFetch(container) {
  const startDate = container.querySelector('#start-date').value;
  const endDate = container.querySelector('#end-date').value;
  if (!startDate || !endDate) { toast('Please select a date range'); return; }

  // Collect selected folders
  const foldersToFetch = selectedFolders.size > 0 && selectedFolders.size < allFolderNames.length
    ? Array.from(selectedFolders)
    : null; // null = all folders

  const fetchBtn = container.querySelector('#fetch-btn');
  const progressEl = container.querySelector('#progress-section');
  const aiFeed = container.querySelector('#ai-live-feed');
  const aiCounter = container.querySelector('#ai-counter');

  fetchBtn.disabled = true;
  fetchBtn.textContent = 'Fetching...';
  showProgress(progressEl);
  setProgress(progressEl, 0, 'Connecting to Microsoft 365...');

  container.querySelectorAll('.progress-source').forEach(el => {
    el.style.opacity = '0.4';
    el.querySelector('.progress-source-count').textContent = '...';
  });
  aiFeed.style.display = 'none';

  store.billingItems = [];
  refreshDashboard(container);

  try {
    const response = await fetchBillingData(startDate, endDate, store.settings, foldersToFetch);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));

          if (data.type === 'progress') {
            setProgress(progressEl, data.percent, data.message);
            if (data.source) {
              const srcEl = container.querySelector(`.progress-source[data-source="${data.source}"]`);
              if (srcEl) {
                srcEl.style.opacity = '1';
                srcEl.classList.add('fetching');
              }
            }
            if (data.phase === 'ai') {
              aiFeed.style.display = 'block';
              aiCounter.textContent = `0/${data.totalItems || '?'}`;
            }
          }

          if (data.type === 'source-done') {
            setProgress(progressEl, data.percent, data.message);
            const srcEl = container.querySelector(`.progress-source[data-source="${data.source}"]`);
            if (srcEl) {
              srcEl.style.opacity = '1';
              srcEl.classList.remove('fetching');
              srcEl.classList.add('done');
              srcEl.querySelector('.progress-source-count').textContent = data.count;
            }
          }

          if (data.type === 'ai-batch') {
            setProgress(progressEl, data.percent, data.message);
            aiCounter.textContent = `${data.processed}/${data.total}`;
            if (data.items?.length) {
              store.billingItems.push(...data.items);
              refreshDashboard(container);
            }
          }

          if (data.type === 'complete') {
            store.billingItems = data.items;
            refreshDashboard(container);
            const rmNote = data.rmKeyLoaded ? ' (RM Key mapped)' : '';
            toast(`${data.count} entries loaded${rmNote}`);
          }

          if (data.type === 'error') toast('Error: ' + data.message, true);
        } catch { /* skip bad JSON */ }
      }
    }
  } catch (err) {
    toast(err.message, true);
  } finally {
    fetchBtn.disabled = false;
    fetchBtn.textContent = 'Pull Data';
    hideProgress(progressEl);
  }
}

function refreshDashboard(container) {
  const allItems = store.billingItems;
  // Charts/clients reflect what will export; recent list shows all (flagged dimmed).
  const items = billableItems(allItems);
  updateNavBadges();
  renderStatsBar(container.querySelector('#stats-grid'));

  if (!allItems.length) {
    container.querySelector('#charts-row').style.display = 'none';
    container.querySelector('#export-xlsx-btn').style.display = 'none';
    container.querySelector('#export-csv-btn').style.display = 'none';
    container.querySelector('#clear-btn').style.display = 'none';
    container.querySelector('#top-clients-container').innerHTML = '<div class="empty-state"><p>Pull data to see clients</p></div>';
    container.querySelector('#recent-entries-container').innerHTML = '<div class="empty-state"><p>No entries yet</p></div>';
    return;
  }

  container.querySelector('#export-xlsx-btn').style.display = 'inline-flex';
  container.querySelector('#export-csv-btn').style.display = 'inline-flex';
  container.querySelector('#clear-btn').style.display = 'inline-flex';

  // Charts
  if (store.settings.showCharts !== false) {
    container.querySelector('#charts-row').style.display = 'grid';

    const typeCounts = {};
    items.forEach(i => { const t = i.type || 'Other'; typeCounts[t] = (typeCounts[t] || 0) + 1; });
    const donutData = Object.entries(typeCounts).map(([label, value]) => ({ label, value, color: getTypeColor(label) }));
    renderDonutChart(container.querySelector('#donut-chart'), donutData);

    const dayCounts = {};
    items.forEach(i => {
      const iso = i.startTime;
      const dateKey = iso ? iso.split('T')[0] : (i.date || '');
      if (dateKey) {
        if (!dayCounts[dateKey]) dayCounts[dateKey] = { count: 0, display: i.date || dateKey };
        dayCounts[dateKey].count++;
      }
    });
    const barData = Object.entries(dayCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, { count, display }]) => {
        const parts = display.split('/');
        const shortLabel = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : display;
        return { label: shortLabel, fullLabel: display, value: count, color: '#4fd1c5' };
      });
    renderBarChart(container.querySelector('#bar-chart'), barData);
  } else {
    container.querySelector('#charts-row').style.display = 'none';
  }

  renderTopClients(container.querySelector('#top-clients-container'), items);
  renderRecentEntries(container.querySelector('#recent-entries-container'), allItems);
}

function renderTopClients(container, items) {
  const clientMap = {};
  items.forEach(i => {
    const c = i.client || 'UNKNOWN';
    if (!clientMap[c]) clientMap[c] = { hours: 0, count: 0, matterKey: i.matterKey };
    clientMap[c].hours += (i.durationHours || 0.1);
    clientMap[c].count++;
  });

  const clients = Object.entries(clientMap)
    .map(([name, data]) => ({ name, ...data, hours: parseFloat(data.hours.toFixed(1)) }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 8);

  if (!clients.length) {
    container.innerHTML = '<div class="empty-state"><p>No clients found</p></div>';
    return;
  }

  const maxHours = clients[0].hours;

  container.innerHTML = `<table class="top-clients-table">
    <thead><tr><th>Client</th><th>Key</th><th>Hours</th><th></th><th>Entries</th></tr></thead>
    <tbody>${clients.map(c => `<tr onclick="navigateTo('clients')" style="cursor:pointer">
      <td style="font-weight:500;${c.name.includes('UNKNOWN') ? 'color:var(--warning)' : ''}">${escapeHtml(c.name)}</td>
      <td style="font-variant-numeric:tabular-nums;font-size:11px;color:var(--muted)">${c.matterKey || '-'}</td>
      <td class="mono" style="color:var(--accent)">${c.hours}h</td>
      <td><div class="hours-bar"><div class="hours-bar-fill" style="width:${(c.hours / maxHours * 100)}%"></div></div></td>
      <td style="color:var(--muted)">${c.count}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

function renderRecentEntries(container, items) {
  const recent = [...items].sort((a, b) => new Date(b.startTime) - new Date(a.startTime)).slice(0, 8);

  if (!recent.length) {
    container.innerHTML = '<div class="empty-state"><p>No entries</p></div>';
    return;
  }

  container.innerHTML = `<table class="top-clients-table">
    <thead><tr><th>Type</th><th>Client</th><th>Date</th><th>Duration</th></tr></thead>
    <tbody>${recent.map(i => {
      const typeClass = (i.type || '').toLowerCase().includes('email') ? 'type-email'
        : (i.type || '').toLowerCase().includes('teams') || (i.type || '').toLowerCase().includes('meeting') ? 'type-teams'
        : 'type-call';
      const excluded = !isBillable(i);
      const stateBadge = i.isConsolidated ? `<span style="color:var(--accent);font-size:10px;margin-left:5px" title="${i.mergedCount} same-subject emails combined">🔗 ${i.mergedCount}</span>`
        : excluded ? `<span style="color:var(--muted);font-size:10px;margin-left:5px" title="${escapeHtml(i.excludeReason || 'Non-billable')}">excl</span>` : '';
      return `<tr style="cursor:pointer;${excluded ? 'opacity:0.55' : ''}" data-recent-id="${escapeHtml(i.id)}" ${i.excludeReason ? `title="${escapeHtml(i.excludeReason)}"` : ''}>
        <td><span class="type-badge ${typeClass}">${escapeHtml(i.type || '-')}</span>${stateBadge}</td>
        <td style="font-weight:500;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${(!i.client || i.client.includes('UNKNOWN')) ? 'color:var(--warning)' : ''}">${escapeHtml(i.client || 'UNKNOWN')}</td>
        <td style="color:var(--muted);font-size:12px">${escapeHtml(i.date || '-')}</td>
        <td><span class="duration-chip" style="${excluded ? 'text-decoration:line-through;opacity:0.6' : ''}">${i.durationHours || 0.1}h</span></td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;

  container.querySelectorAll('[data-recent-id]').forEach(tr => {
    tr.addEventListener('click', () => {
      const item = items.find(i => i.id === tr.dataset.recentId);
      if (item) {
        const type = (item.type || '').toLowerCase().includes('email') ? 'email'
          : (item.type || '').toLowerCase().includes('meeting') ? 'meeting'
          : (item.type || '').toLowerCase().includes('teams') ? 'teams'
          : 'call';
        openDrilldown(type, item, () => openEditModal(item, () => refreshDashboard(container.closest('#view-container') || container)));
      }
    });
  });
}
