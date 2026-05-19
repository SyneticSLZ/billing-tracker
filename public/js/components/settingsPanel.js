import { store, saveSettings } from '../state.js';
import { toast } from '../utils.js';
import { setTimekeeperName, getInternalAddresses, setInternalAddresses } from '../api.js';

export function renderSettings(container) {
  const s = store.settings;
  function escapeHtml(v) { if (!v) return ''; const d = document.createElement('div'); d.textContent = v; return d.innerHTML; }

  container.innerHTML = `
    <div style="margin-bottom:16px"><h1 style="font-size:16px;font-weight:600">Settings</h1></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;max-width:800px">
      <div class="card"><div class="card-header"><h2>Data Fetching</h2></div><div class="card-body">
        <div class="form-group"><label>Max Emails to Fetch</label>
          <select id="setting-emailLimit">
            <option value="100" ${s.emailFetchLimit===100?'selected':''}>100</option>
            <option value="250" ${s.emailFetchLimit===250?'selected':''}>250</option>
            <option value="500" ${s.emailFetchLimit===500?'selected':''}>500</option>
          </select>
        </div>
        <div class="form-group"><label>Combine same-day, same-subject email into one entry</label>
          <select id="setting-group">
            <option value="true" ${s.groupEmailsByThread!==false?'selected':''}>Yes — 3 emails → one .30 entry (recommended)</option>
            <option value="false" ${s.groupEmailsByThread===false?'selected':''}>No — keep each email as a separate .10</option>
          </select>
        </div>
      </div></div>
      <div class="card"><div class="card-header"><h2>Display</h2></div><div class="card-body">
        <div class="form-group"><label>Items per Page</label>
          <select id="setting-pageSize">
            <option value="25" ${s.pageSize===25?'selected':''}>25</option>
            <option value="50" ${s.pageSize===50?'selected':''}>50</option>
            <option value="100" ${s.pageSize===100?'selected':''}>100</option>
          </select>
        </div>
        <div class="form-group"><label>Show Charts</label>
          <select id="setting-showCharts">
            <option value="true" ${s.showCharts!==false?'selected':''}>Yes</option>
            <option value="false" ${s.showCharts===false?'selected':''}>No</option>
          </select>
        </div>
      </div></div>
      <div class="card" style="grid-column:1 / -1"><div class="card-header"><h2>Non-billable email filter</h2></div><div class="card-body">
        <div class="form-group">
          <label>Internal / non-billable addresses (Karisha &amp; Mark, firm domain)</label>
          <textarea id="setting-internal" rows="3" placeholder="karisha@firm.com, mark@firm.com, firm.com" style="width:100%;font-family:inherit"></textarea>
          <p style="font-size:11px;color:var(--muted);margin-top:6px">
            Comma / newline separated. Full addresses or a whole domain. An email is flagged
            non-billable only when <strong>every</strong> sender &amp; recipient is in this list —
            anything involving a client stays billable. Flagged email stays visible and can be
            added back from the Calendar view before export.
          </p>
        </div>
      </div></div>
      <div class="card" style="grid-column:1 / -1"><div class="card-header"><h2>Export / Billing</h2></div><div class="card-body">
        <div class="form-group"><label>Timekeeper Name (for XLSX export)</label>
          <input type="text" id="setting-timekeeper" value="${escapeHtml(s.timekeeperName || 'Mark Paxton')}" placeholder="e.g. Mark Paxton">
        </div>
        <div class="form-group"><label>Hourly Rate ($) — for estimates</label>
          <input type="number" id="setting-hourlyRate" value="${s.hourlyRate||''}" placeholder="0 = disabled" min="0" step="25">
        </div>
        <div style="display:flex;gap:8px;margin-top:1rem">
          <button class="btn btn-success btn-sm" onclick="window.open('/export/xlsx','_blank')">Export NextGen XLSX</button>
          <button class="btn btn-ghost btn-sm" onclick="window.open('/export/csv','_blank')">Export CSV</button>
        </div>
      </div></div>
    </div>
    <div style="margin-top:1.5rem">
      <button class="btn btn-primary" id="save-settings">Save Settings</button>
      <span id="settings-saved" style="margin-left:12px;font-size:0.8rem;color:var(--success);display:none">Saved!</span>
    </div>`;

  // Load the saved internal-address list from the server
  getInternalAddresses()
    .then(r => { const ta = container.querySelector('#setting-internal'); if (ta) ta.value = r.internalAddresses || ''; })
    .catch(() => {});

  container.querySelector('#save-settings').addEventListener('click', async () => {
    store.settings.emailFetchLimit = parseInt(container.querySelector('#setting-emailLimit').value);
    store.settings.pageSize = parseInt(container.querySelector('#setting-pageSize').value);
    store.settings.showCharts = container.querySelector('#setting-showCharts').value === 'true';
    store.settings.groupEmailsByThread = container.querySelector('#setting-group').value === 'true';
    store.settings.hourlyRate = parseFloat(container.querySelector('#setting-hourlyRate').value) || 0;
    store.settings.timekeeperName = container.querySelector('#setting-timekeeper').value || 'Mark Paxton';
    store.pagination.pageSize = store.settings.pageSize;
    saveSettings();
    try {
      await setTimekeeperName(store.settings.timekeeperName);
      await setInternalAddresses(container.querySelector('#setting-internal').value || '');
    } catch (e) { toast('Could not save server settings', true); }
    const savedEl = container.querySelector('#settings-saved');
    savedEl.style.display = 'inline';
    setTimeout(() => { savedEl.style.display = 'none'; }, 2000);
    toast('Settings saved — re-pull data to apply the email filter & combining');
  });
}
