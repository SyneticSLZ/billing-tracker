import { store, saveSettings } from '../state.js';
import { toast } from '../utils.js';

export function renderSettings(container) {
  const s = store.settings;

  container.innerHTML = `
    <div style="margin-bottom:1rem">
      <h1 style="font-size:1.2rem;font-weight:600;display:flex;align-items:center;gap:8px">
        <span style="font-size:1.3rem">&#9881;&#65039;</span> Settings
      </h1>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;max-width:800px">
      <!-- Data Fetch Settings -->
      <div class="card">
        <div class="card-header"><h2>Data Fetching</h2></div>
        <div class="card-body">
          <div class="form-group">
            <label>Max Emails to Fetch</label>
            <select id="setting-emailLimit">
              <option value="100" ${s.emailFetchLimit === 100 ? 'selected' : ''}>100</option>
              <option value="250" ${s.emailFetchLimit === 250 ? 'selected' : ''}>250</option>
              <option value="500" ${s.emailFetchLimit === 500 ? 'selected' : ''}>500</option>
            </select>
          </div>
          <div class="form-group">
            <label>Max Teams Chats to Scan</label>
            <select id="setting-chatLimit">
              <option value="25" ${s.chatLimit === 25 ? 'selected' : ''}>25</option>
              <option value="50" ${s.chatLimit === 50 ? 'selected' : ''}>50</option>
              <option value="100" ${s.chatLimit === 100 ? 'selected' : ''}>100</option>
            </select>
          </div>
          <div class="form-group">
            <label>Messages per Chat</label>
            <select id="setting-messagesPerChat">
              <option value="25" ${s.messagesPerChat === 25 ? 'selected' : ''}>25</option>
              <option value="50" ${s.messagesPerChat === 50 ? 'selected' : ''}>50</option>
              <option value="100" ${s.messagesPerChat === 100 ? 'selected' : ''}>100</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Display Settings -->
      <div class="card">
        <div class="card-header"><h2>Display</h2></div>
        <div class="card-body">
          <div class="form-group">
            <label>Default Date Range</label>
            <select id="setting-dateRange">
              <option value="week" ${s.defaultDateRange === 'week' ? 'selected' : ''}>This Week</option>
              <option value="month" ${s.defaultDateRange === 'month' ? 'selected' : ''}>This Month</option>
              <option value="lastMonth" ${s.defaultDateRange === 'lastMonth' ? 'selected' : ''}>Last Month</option>
            </select>
          </div>
          <div class="form-group">
            <label>Items per Page</label>
            <select id="setting-pageSize">
              <option value="25" ${s.pageSize === 25 ? 'selected' : ''}>25</option>
              <option value="50" ${s.pageSize === 50 ? 'selected' : ''}>50</option>
              <option value="100" ${s.pageSize === 100 ? 'selected' : ''}>100</option>
            </select>
          </div>
          <div class="form-group">
            <label>Show Charts on Dashboard</label>
            <select id="setting-showCharts">
              <option value="true" ${s.showCharts !== false ? 'selected' : ''}>Yes</option>
              <option value="false" ${s.showCharts === false ? 'selected' : ''}>No</option>
            </select>
          </div>
          <div class="form-group">
            <label>Group Emails by Thread</label>
            <select id="setting-groupThreads">
              <option value="false" ${!s.groupEmailsByThread ? 'selected' : ''}>No (flat list)</option>
              <option value="true" ${s.groupEmailsByThread ? 'selected' : ''}>Yes (threaded)</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Billing Settings -->
      <div class="card">
        <div class="card-header"><h2>Billing</h2></div>
        <div class="card-body">
          <div class="form-group">
            <label>Hourly Rate ($) — for estimates</label>
            <input type="number" id="setting-hourlyRate" value="${s.hourlyRate || ''}" placeholder="0 = disabled" min="0" step="25">
          </div>
          <p style="font-size:0.72rem;color:var(--muted);margin-top:0.5rem">
            If set, the dashboard will show estimated billing value based on tracked hours.
          </p>
        </div>
      </div>

      <!-- Export Settings -->
      <div class="card">
        <div class="card-header"><h2>Export</h2></div>
        <div class="card-body">
          <p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:1rem">
            Export format is currently set to Rocket Matter CSV. More formats coming soon.
          </p>
          <button class="btn btn-success btn-sm" onclick="window.open('/export/csv','_blank')">
            Download Rocket Matter CSV
          </button>
        </div>
      </div>
    </div>

    <div style="margin-top:1.5rem">
      <button class="btn btn-primary" id="save-settings">Save Settings</button>
      <span id="settings-saved" style="margin-left:12px;font-size:0.8rem;color:var(--success);display:none">Settings saved!</span>
    </div>
  `;

  container.querySelector('#save-settings').addEventListener('click', () => {
    store.settings.emailFetchLimit = parseInt(container.querySelector('#setting-emailLimit').value);
    store.settings.chatLimit = parseInt(container.querySelector('#setting-chatLimit').value);
    store.settings.messagesPerChat = parseInt(container.querySelector('#setting-messagesPerChat').value);
    store.settings.defaultDateRange = container.querySelector('#setting-dateRange').value;
    store.settings.pageSize = parseInt(container.querySelector('#setting-pageSize').value);
    store.settings.showCharts = container.querySelector('#setting-showCharts').value === 'true';
    store.settings.groupEmailsByThread = container.querySelector('#setting-groupThreads').value === 'true';
    store.settings.hourlyRate = parseFloat(container.querySelector('#setting-hourlyRate').value) || 0;
    store.pagination.pageSize = store.settings.pageSize;

    saveSettings();

    const savedEl = container.querySelector('#settings-saved');
    savedEl.style.display = 'inline';
    setTimeout(() => { savedEl.style.display = 'none'; }, 2000);
    toast('Settings saved');
  });
}