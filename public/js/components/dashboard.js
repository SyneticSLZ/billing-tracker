import { store } from '../state.js';
import { fetchBillingData, getEntries, clearAllEntries } from '../api.js';
import { toast, setDateRange as getDateRange, escapeHtml, getTypeColor } from '../utils.js';
import { renderStatsBar } from './statsBar.js';
import { renderDonutChart, renderBarChart } from './chartPanel.js';
import { showProgress, hideProgress, setProgress } from './progressBar.js';
import { initUploadZone } from './uploadZone.js';
import { DataTable } from './dataTable.js';
import { open as openDrilldown } from './drilldownPanel.js';
import { openEditModal } from './editModal.js';
import { updateNavBadges } from './nav.js';
import { navigate } from '../router.js';

export function renderDashboard(container) {
  const dates = getDateRange(store.settings.defaultDateRange || 'month');

  container.innerHTML = `
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
      </div>
    </div>

    <!-- Upload Zone -->
    <div class="upload-zone" id="upload-zone">
      <div class="upload-zone-icon">📞</div>
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

      <!-- Source indicators -->
      <div class="progress-sources" id="progress-sources" style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">
        <div class="progress-source" data-source="emails">
          <span class="progress-source-icon">📧</span>
          <span class="progress-source-label">Emails</span>
          <span class="progress-source-count" data-count="emails">...</span>
        </div>
        <div class="progress-source" data-source="meetings">
          <span class="progress-source-icon">📅</span>
          <span class="progress-source-label">Meetings</span>
          <span class="progress-source-count" data-count="meetings">...</span>
        </div>
        <div class="progress-source" data-source="teams">
          <span class="progress-source-icon">💬</span>
          <span class="progress-source-label">Teams</span>
          <span class="progress-source-count" data-count="teams">...</span>
        </div>
        <div class="progress-source" data-source="calls">
          <span class="progress-source-icon">📞</span>
          <span class="progress-source-label">Calls</span>
          <span class="progress-source-count" data-count="calls">...</span>
        </div>
      </div>

      <!-- AI processing live feed -->
      <div id="ai-live-feed" style="display:none;margin-top:12px">
        <div style="font-size:0.72rem;color:var(--muted);font-family:'DM Mono',monospace;margin-bottom:6px">
          AI Processing <span id="ai-counter">0/0</span>
        </div>
        <div id="ai-feed-items" style="max-height:160px;overflow-y:auto;display:flex;flex-direction:column;gap:3px"></div>
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
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:1rem;margin-bottom:1.25rem" id="bottom-grid">
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
            <button class="btn btn-success btn-xs" id="export-btn" style="display:none" onclick="window.open('/export/csv','_blank')">Export CSV</button>
            <button class="btn btn-danger btn-xs" id="clear-btn" style="display:none">Clear All</button>
          </div>
        </div>
        <div class="card-body no-padding" id="recent-entries-container">
          <div class="empty-state"><p>No entries yet</p></div>
        </div>
      </div>
    </div>
  `;

  // Bind events
  const fetchBtn = container.querySelector('#fetch-btn');
  fetchBtn.addEventListener('click', () => handleFetch(container));

  container.querySelectorAll('[data-range]').forEach(btn => {
    btn.addEventListener('click', () => {
      const range = getDateRange(btn.dataset.range);
      container.querySelector('#start-date').value = range.start;
      container.querySelector('#end-date').value = range.end;
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

  // Load existing entries
  loadExisting(container);
}

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

  const fetchBtn = container.querySelector('#fetch-btn');
  const progressEl = container.querySelector('#progress-section');
  const aiFeed = container.querySelector('#ai-live-feed');
  const aiFeedItems = container.querySelector('#ai-feed-items');
  const aiCounter = container.querySelector('#ai-counter');

  fetchBtn.disabled = true;
  fetchBtn.textContent = 'Fetching...';
  showProgress(progressEl);
  setProgress(progressEl, 0, 'Connecting to Microsoft 365...');

  // Reset source indicators
  container.querySelectorAll('.progress-source').forEach(el => {
    el.style.opacity = '0.4';
    el.querySelector('.progress-source-count').textContent = '...';
  });
  aiFeed.style.display = 'none';
  aiFeedItems.innerHTML = '';

  try {
    const response = await fetchBillingData(startDate, endDate, store.settings);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line in buffer

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));

          if (data.type === 'progress') {
            setProgress(progressEl, data.percent, data.message);
            // Highlight active source
            if (data.source) {
              const srcEl = container.querySelector(`.progress-source[data-source="${data.source}"]`);
              if (srcEl) {
                srcEl.style.opacity = '1';
                srcEl.classList.add('fetching');
              }
            }
            // Show AI feed when entering AI phase
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
            // Add streamed items to the live feed
            if (data.items) {
              data.items.forEach(item => {
                const row = document.createElement('div');
                row.className = 'ai-feed-row';
                const typeClass = (item.type || '').toLowerCase().includes('email') ? 'type-email'
                  : (item.type || '').toLowerCase().includes('teams') || (item.type || '').toLowerCase().includes('meeting') ? 'type-teams'
                  : 'type-call';
                row.innerHTML = `<span class="type-badge ${typeClass}" style="font-size:0.6rem;padding:1px 5px">${escapeHtml(item.type || '')}</span> <span style="color:var(--accent);font-weight:500">${escapeHtml(item.client || 'UNKNOWN')}</span> <span style="color:var(--muted)">—</span> <span style="color:var(--text-secondary)">${escapeHtml((item.activityDescription || item.subject || '').substring(0, 60))}</span>`;
                aiFeedItems.appendChild(row);
                aiFeedItems.scrollTop = aiFeedItems.scrollHeight;
              });
            }
          }

          if (data.type === 'complete') {
            store.billingItems = data.items;
            refreshDashboard(container);
            toast(`${data.count} entries loaded`);
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
  const items = store.billingItems;
  updateNavBadges();

  // Stats
  renderStatsBar(container.querySelector('#stats-grid'));

  if (!items.length) {
    container.querySelector('#charts-row').style.display = 'none';
    container.querySelector('#export-btn').style.display = 'none';
    container.querySelector('#clear-btn').style.display = 'none';
    container.querySelector('#top-clients-container').innerHTML = '<div class="empty-state"><p>Pull data to see clients</p></div>';
    container.querySelector('#recent-entries-container').innerHTML = '<div class="empty-state"><p>No entries yet</p></div>';
    return;
  }

  container.querySelector('#export-btn').style.display = 'inline-flex';
  container.querySelector('#clear-btn').style.display = 'inline-flex';

  // Charts
  if (store.settings.showCharts !== false) {
    container.querySelector('#charts-row').style.display = 'grid';

    // Donut chart data
    const typeCounts = {};
    items.forEach(i => {
      const t = i.type || 'Other';
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    });
    const donutData = Object.entries(typeCounts).map(([label, value]) => ({
      label, value, color: getTypeColor(label)
    }));
    renderDonutChart(container.querySelector('#donut-chart'), donutData);

    // Bar chart - daily activity
    const dayCounts = {};
    items.forEach(i => {
      // Use startTime (ISO) for reliable sorting, fall back to date string
      const iso = i.startTime;
      const dateKey = iso ? iso.split('T')[0] : (i.date || '');
      if (dateKey) {
        if (!dayCounts[dateKey]) dayCounts[dateKey] = { count: 0, display: i.date || dateKey };
        dayCounts[dateKey].count++;
      }
    });
    const barData = Object.entries(dayCounts)
      .sort(([a], [b]) => a.localeCompare(b))  // YYYY-MM-DD sorts lexicographically
      .map(([key, { count, display }]) => {
        // Short label: MM/DD
        const parts = display.split('/');
        const shortLabel = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : display;
        return { label: shortLabel, fullLabel: display, value: count, color: '#4fd1c5' };
      });
    renderBarChart(container.querySelector('#bar-chart'), barData);
  } else {
    container.querySelector('#charts-row').style.display = 'none';
  }

  // Top clients
  renderTopClients(container.querySelector('#top-clients-container'), items);

  // Recent entries
  renderRecentEntries(container.querySelector('#recent-entries-container'), items);
}

function renderTopClients(container, items) {
  const clientMap = {};
  items.forEach(i => {
    const c = i.client || 'UNKNOWN';
    if (!clientMap[c]) clientMap[c] = { hours: 0, count: 0 };
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
    <thead><tr><th>Client</th><th>Hours</th><th></th><th>Entries</th></tr></thead>
    <tbody>${clients.map(c => `<tr onclick="navigateTo('clients')" style="cursor:pointer">
      <td style="font-weight:500;${c.name.includes('UNKNOWN') ? 'color:var(--warning)' : ''}">${escapeHtml(c.name)}</td>
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
      return `<tr style="cursor:pointer" data-recent-id="${escapeHtml(i.id)}">
        <td><span class="type-badge ${typeClass}">${escapeHtml(i.type || '-')}</span></td>
        <td style="font-weight:500;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${(!i.client || i.client.includes('UNKNOWN')) ? 'color:var(--warning)' : ''}">${escapeHtml(i.client || 'UNKNOWN')}</td>
        <td style="color:var(--muted);font-size:0.75rem">${escapeHtml(i.date || '-')}</td>
        <td><span class="duration-chip">${i.durationHours || 0.1}h</span></td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;

  // Bind click handlers for recent entries
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
