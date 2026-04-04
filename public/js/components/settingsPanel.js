import { store, saveSettings } from '../state.js';
import { toast } from '../utils.js';
import { setTimekeeperName } from '../api.js';
export function renderSettings(container) {
  const s = store.settings;
  container.innerHTML = '<div style="margin-bottom:1rem"><h1 style="font-size:1.2rem;font-weight:600;display:flex;align-items:center;gap:8px"><span style="font-size:1.3rem">⚙️</span> Settings</h1></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;max-width:800px"><div class="card"><div class="card-header"><h2>Data Fetching</h2></div><div class="card-body"><div class="form-group"><label>Max Emails to Fetch</label><select id="setting-emailLimit"><option value="100" ' + (s.emailFetchLimit===100?'selected':'') + '>100</option><option value="250" ' + (s.emailFetchLimit===250?'selected':'') + '>250</option><option value="500" ' + (s.emailFetchLimit===500?'selected':'') + '>500</option></select></div></div></div><div class="card"><div class="card-header"><h2>Display</h2></div><div class="card-body"><div class="form-group"><label>Items per Page</label><select id="setting-pageSize"><option value="25" ' + (s.pageSize===25?'selected':'') + '>25</option><option value="50" ' + (s.pageSize===50?'selected':'') + '>50</option><option value="100" ' + (s.pageSize===100?'selected':'') + '>100</option></select></div><div class="form-group"><label>Show Charts</label><select id="setting-showCharts"><option value="true" ' + (s.showCharts!==false?'selected':'') + '>Yes</option><option value="false" ' + (s.showCharts===false?'selected':'') + '>No</option></select></div></div></div><div class="card"><div class="card-header"><h2>Export / Billing</h2></div><div class="card-body"><div class="form-group"><label>Timekeeper Name (for XLSX export)</label><input type="text" id="setting-timekeeper" value="' + escapeHtml(s.timekeeperName || 'Mark Paxton') + '" placeholder="e.g. Mark Paxton"></div><div class="form-group"><label>Hourly Rate ($) — for estimates</label><input type="number" id="setting-hourlyRate" value="' + (s.hourlyRate||'') + '" placeholder="0 = disabled" min="0" step="25"></div><div style="display:flex;gap:8px;margin-top:1rem"><button class="btn btn-success btn-sm" onclick="window.open(\'/export/xlsx\',\'_blank\')">Export NextGen XLSX</button><button class="btn btn-ghost btn-sm" onclick="window.open(\'/export/csv\',\'_blank\')">Export CSV</button></div></div></div></div><div style="margin-top:1.5rem"><button class="btn btn-primary" id="save-settings">Save Settings</button><span id="settings-saved" style="margin-left:12px;font-size:0.8rem;color:var(--success);display:none">Saved!</span></div>';
  function escapeHtml(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  container.querySelector('#save-settings').addEventListener('click', async () => {
    store.settings.emailFetchLimit = parseInt(container.querySelector('#setting-emailLimit').value);
    store.settings.pageSize = parseInt(container.querySelector('#setting-pageSize').value);
    store.settings.showCharts = container.querySelector('#setting-showCharts').value === 'true';
    store.settings.hourlyRate = parseFloat(container.querySelector('#setting-hourlyRate').value) || 0;
    store.settings.timekeeperName = container.querySelector('#setting-timekeeper').value || 'Mark Paxton';
    store.pagination.pageSize = store.settings.pageSize;
    saveSettings();
    await setTimekeeperName(store.settings.timekeeperName);
    const savedEl = container.querySelector('#settings-saved');
    savedEl.style.display = 'inline';
    setTimeout(() => { savedEl.style.display = 'none'; }, 2000);
    toast('Settings saved');
  });
}
