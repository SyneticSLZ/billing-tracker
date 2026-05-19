// Client Mapping (RM Key) — standalone tab.
//
// Subfolder name (= client identity in Outlook) is matched against this list
// to assign Matter-Key + Rate to every billing entry. The whole pipeline
// depends on it: no mapping → "UNKNOWN" client in the export.
//
// Defaults are auto-saved to the server on first boot so Pull Data works
// out-of-the-box. Edits here persist via /api/rmkey/manual.

import { store } from '../state.js';
import { escapeHtml, toast } from '../utils.js';
import { uploadRMKey, getRMKeyStatus, clearRMKey, saveRMKeyManual } from '../api.js';

const DEFAULT_RM_KEYS = [
  { clientName: 'A1 Pulse Technologies, LLC', matterKey: '13', rate: '400' },
  { clientName: 'Altrazeal Life Sciences Inc.', matterKey: '25', rate: '400' },
  { clientName: 'Altro Pharmaceuticals, Inc', matterKey: '30', rate: '450' },
  { clientName: 'Amici Pharmaceuticals, Inc.', matterKey: '27', rate: '400' },
  { clientName: 'AppCo Pharma, LLC', matterKey: '12', rate: '300' },
  { clientName: 'AroCell AB', matterKey: '18', rate: '400' },
  { clientName: 'Asieris Pharmaceuticals', matterKey: '6', rate: '400' },
  { clientName: 'Avast Therapeutics, Inc.', matterKey: '37', rate: '450' },
  { clientName: 'Avem Healthcare', matterKey: '5', rate: '200' },
  { clientName: 'BHC Management, LLC', matterKey: '14', rate: '450' },
  { clientName: 'Bright Path Labs, Inc. - ANDA', matterKey: '2', rate: '150' },
  { clientName: 'CeleCor Therapeutics, Inc.', matterKey: '38', rate: '450' },
  { clientName: 'Denovo Biopharma', matterKey: '7', rate: '450' },
  { clientName: 'Elora Medical LLC and Vixel Agency LLC', matterKey: '24', rate: '400' },
  { clientName: 'Entegrion', matterKey: '1', rate: '150' },
  { clientName: 'Fourth Axis, LLC', matterKey: '20', rate: '400' },
  { clientName: 'Hilom LLC', matterKey: '39', rate: '450' },
  { clientName: 'HyMed', matterKey: '11', rate: '400' },
  { clientName: 'KELLS, Inc.', matterKey: '3', rate: '150' },
  { clientName: 'NutriFlair', matterKey: '29', rate: '450' },
  { clientName: 'PEARL GROUP LLC', matterKey: '23', rate: '400' },
  { clientName: 'PHARMASSETX INC.', matterKey: '33', rate: '450' },
  { clientName: 'PSI Research Center LLC', matterKey: '34', rate: '450' },
  { clientName: 'RAIS INTERNATIONAL LLC', matterKey: '28', rate: '400' },
  { clientName: 'Raphael Pharmaceutical, Inc.', matterKey: '35', rate: '450' },
  { clientName: 'Regenerative Research Group LLC', matterKey: '26', rate: '400' },
  { clientName: 'RNA BIO/ PHARMA INC.', matterKey: '32', rate: '450' },
  { clientName: 'Shanghai Innogen Pharmaceutical Technology Co., Ltd.', matterKey: '31', rate: '450' },
  { clientName: 'Spark Biomedical Inc', matterKey: '22', rate: '400' },
  { clientName: 'TCOYF Applications LLC', matterKey: '8', rate: '450' },
  { clientName: 'Trucker\'s Body Shop, Inc.', matterKey: '15', rate: '450' },
];

// Module-scoped working set so edits survive nav-away-and-back. Synced with
// store.rmKeyClients (display copy) + server (/api/rmkey/manual).
let rmKeyRows = [];

// Eager bootstrap on app load: pull server state; if empty, push defaults so
// the very first Pull Data already has clients mapped. Idempotent.
export async function initClientMapping() {
  try {
    const data = await getRMKeyStatus();
    if (data.loaded && data.clients?.length) {
      store.rmKeyLoaded = true;
      store.rmKeyClients = data.clients;
      rmKeyRows = data.clients.map(c => ({ clientName: c.clientName, matterKey: c.matterKey, rate: c.rate }));
      return;
    }
  } catch { /* ignore — fall through to defaults */ }

  rmKeyRows = DEFAULT_RM_KEYS.map(r => ({ ...r }));
  try {
    const saved = await saveRMKeyManual(rmKeyRows);
    if (saved?.success) {
      store.rmKeyLoaded = true;
      store.rmKeyClients = saved.clients;
    }
  } catch { /* ignore — user can edit on the tab */ }
}

export function renderClientMapping(container) {
  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <div>
        <h1 style="font-size:16px;font-weight:600">Client Mapping</h1>
        <p style="font-size:12px;color:var(--muted);margin-top:4px;max-width:680px">
          Each Outlook subfolder name (your "client folder") is matched against this list to assign
          the Rocket Matter <strong>Matter-Key</strong> and <strong>Rate</strong> on every billing entry.
          A client missing here will export as "UNKNOWN — No RM Key match".
        </p>
      </div>
    </div>
    <div class="card">
      <div class="card-header">
        <h2>Clients</h2>
        <div style="display:flex;gap:8px;align-items:center">
          <span id="rmkey-status" style="font-size:12px;color:var(--muted)">No clients configured</span>
          <button class="btn btn-ghost btn-xs" id="rmkey-upload-btn" title="Import from Excel">Upload Excel</button>
          <input type="file" id="rmkey-file-input" accept=".xlsx,.xls" style="display:none">
          <button class="btn btn-ghost btn-xs" id="rmkey-defaults-btn" title="Re-populate the firm's default list">Load Defaults</button>
          <button class="btn btn-primary btn-xs" id="rmkey-save-btn">Save</button>
          <button class="btn btn-ghost btn-xs" id="rmkey-clear-btn" style="display:none">Clear All</button>
        </div>
      </div>
      <div class="card-body">
        <div id="rmkey-editor"></div>
      </div>
    </div>`;

  wireHeaderButtons(container);

  // If we haven't loaded anything yet (cold visit before initClientMapping
  // finished), kick a load now; otherwise just render what we have.
  if (!rmKeyRows.length) {
    initClientMapping().then(() => {
      renderRMKeyEditor(container);
      updateRMKeyStatus(container);
    });
  } else {
    renderRMKeyEditor(container);
    updateRMKeyStatus(container);
  }
}

function wireHeaderButtons(container) {
  const uploadBtn = container.querySelector('#rmkey-upload-btn');
  const fileInput = container.querySelector('#rmkey-file-input');
  const saveBtn = container.querySelector('#rmkey-save-btn');
  const clearBtn = container.querySelector('#rmkey-clear-btn');
  const defaultsBtn = container.querySelector('#rmkey-defaults-btn');

  uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    toast('Processing RM Key file...');
    try {
      const data = await uploadRMKey(file);
      if (data.success) {
        store.rmKeyLoaded = true;
        store.rmKeyClients = data.clients;
        rmKeyRows = data.clients.map(c => ({ clientName: c.clientName, matterKey: c.matterKey, rate: c.rate }));
        renderRMKeyEditor(container);
        updateRMKeyStatus(container);
        toast(`RM Key loaded: ${data.clientCount} clients`);
      } else {
        toast(data.error || 'Upload failed', true);
      }
    } catch (err) {
      toast('Upload failed: ' + err.message, true);
    }
    fileInput.value = '';
  });

  saveBtn.addEventListener('click', async () => {
    collectRMKeyFromInputs(container);
    const validRows = rmKeyRows.filter(r => r.clientName.trim());
    try {
      const data = await saveRMKeyManual(validRows);
      if (data.success) {
        store.rmKeyLoaded = true;
        store.rmKeyClients = data.clients;
        rmKeyRows = data.clients.map(c => ({ clientName: c.clientName, matterKey: c.matterKey, rate: c.rate }));
        renderRMKeyEditor(container);
        updateRMKeyStatus(container);
        toast(`Saved: ${data.clientCount} clients`);
      }
    } catch (err) {
      toast('Save failed: ' + err.message, true);
    }
  });

  clearBtn.addEventListener('click', async () => {
    if (!confirm('Clear all client mappings? You can re-load the defaults afterwards.')) return;
    try {
      await clearRMKey();
      store.rmKeyLoaded = false;
      store.rmKeyClients = [];
      rmKeyRows = [];
      renderRMKeyEditor(container);
      updateRMKeyStatus(container);
      toast('Client mapping cleared');
    } catch (err) {
      toast('Clear failed: ' + err.message, true);
    }
  });

  defaultsBtn.addEventListener('click', async () => {
    if (rmKeyRows.some(r => r.clientName?.trim())
        && !confirm('Replace the current list with the firm defaults?')) return;
    rmKeyRows = DEFAULT_RM_KEYS.map(r => ({ ...r }));
    try {
      const data = await saveRMKeyManual(rmKeyRows);
      if (data?.success) {
        store.rmKeyLoaded = true;
        store.rmKeyClients = data.clients;
        rmKeyRows = data.clients.map(c => ({ clientName: c.clientName, matterKey: c.matterKey, rate: c.rate }));
      }
    } catch { /* ignore */ }
    renderRMKeyEditor(container);
    updateRMKeyStatus(container);
    toast(`Loaded ${rmKeyRows.length} default clients`);
  });
}

function renderRMKeyEditor(container) {
  const editor = container.querySelector('#rmkey-editor');
  if (!editor) return;

  const clearBtn = container.querySelector('#rmkey-clear-btn');
  const hasData = rmKeyRows.some(r => r.clientName.trim());
  clearBtn.style.display = hasData ? 'inline-flex' : 'none';

  if (!rmKeyRows.length) rmKeyRows.push({ clientName: '', matterKey: '', rate: '' });

  editor.innerHTML = `
    <table style="width:100%;font-size:13px;border-collapse:collapse" id="rmkey-table">
      <thead>
        <tr style="border-bottom:1px solid var(--border)">
          <th style="text-align:left;padding:6px 8px;color:var(--muted);font-variant-numeric:tabular-nums;font-size:11px;font-weight:500;width:45%">CLIENT NAME</th>
          <th style="text-align:left;padding:6px 8px;color:var(--muted);font-variant-numeric:tabular-nums;font-size:11px;font-weight:500;width:20%">MATTER KEY</th>
          <th style="text-align:left;padding:6px 8px;color:var(--muted);font-variant-numeric:tabular-nums;font-size:11px;font-weight:500;width:20%">RATE ($)</th>
          <th style="width:40px"></th>
        </tr>
      </thead>
      <tbody>
        ${rmKeyRows.map((row, i) => `
          <tr data-row-idx="${i}" style="border-bottom:1px solid rgba(42,48,68,0.3)">
            <td style="padding:3px 4px"><input type="text" class="rmkey-input rmkey-client" value="${escapeHtml(row.clientName || '')}" placeholder="Client name" data-idx="${i}" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:5px 8px;color:var(--fg);font-size:13px"></td>
            <td style="padding:3px 4px"><input type="text" class="rmkey-input rmkey-key" value="${escapeHtml(row.matterKey || '')}" placeholder="Key" data-idx="${i}" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:5px 8px;color:var(--fg);font-variant-numeric:tabular-nums;font-size:13px"></td>
            <td style="padding:3px 4px"><input type="number" class="rmkey-input rmkey-rate" value="${row.rate || ''}" placeholder="0" data-idx="${i}" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:5px 8px;color:var(--fg);font-variant-numeric:tabular-nums;font-size:13px" step="any"></td>
            <td style="padding:3px 4px;text-align:center"><button class="btn btn-ghost btn-xs rmkey-delete-row" data-idx="${i}" style="color:var(--danger);font-size:1rem;padding:2px 6px" title="Remove row">&times;</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <button class="btn btn-ghost btn-sm" id="rmkey-add-row" style="margin-top:8px;font-size:12px">+ Add Row</button>
    <div style="margin-top:6px;font-size:11px;color:var(--muted)">
      Tip: paste tab-separated rows (Client, Key, Rate) into the first cell to bulk-add.
      Edits aren't applied to billing until you click <strong>Save</strong> and re-pull data.
    </div>`;

  editor.querySelectorAll('.rmkey-delete-row').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      collectRMKeyFromInputs(container);
      rmKeyRows.splice(idx, 1);
      if (rmKeyRows.length === 0) rmKeyRows.push({ clientName: '', matterKey: '', rate: '' });
      renderRMKeyEditor(container);
    });
  });

  editor.querySelector('#rmkey-add-row').addEventListener('click', () => {
    collectRMKeyFromInputs(container);
    rmKeyRows.push({ clientName: '', matterKey: '', rate: '' });
    renderRMKeyEditor(container);
    const inputs = editor.querySelectorAll('.rmkey-client');
    if (inputs.length) inputs[inputs.length - 1].focus();
  });

  editor.querySelectorAll('.rmkey-client').forEach(input => {
    input.addEventListener('paste', (e) => {
      const pasted = (e.clipboardData || window.clipboardData).getData('text');
      if (pasted.includes('\t') || pasted.includes('\n')) {
        e.preventDefault();
        collectRMKeyFromInputs(container);
        const lines = pasted.split(/\r?\n/).filter(l => l.trim());
        const newRows = [];
        for (const line of lines) {
          const parts = line.split('\t');
          if (parts.length >= 1) {
            newRows.push({
              clientName: (parts[0] || '').trim(),
              matterKey: (parts[1] || '').trim(),
              rate: parseFloat(parts[2]) || '',
            });
          }
        }
        if (newRows.length) {
          const idx = parseInt(input.dataset.idx);
          if (!rmKeyRows[idx]?.clientName?.trim()) {
            rmKeyRows.splice(idx, 1, ...newRows);
          } else {
            rmKeyRows.push(...newRows);
          }
          renderRMKeyEditor(container);
          toast(`Pasted ${newRows.length} rows`);
        }
      }
    });
  });
}

function collectRMKeyFromInputs(container) {
  const table = container.querySelector('#rmkey-table');
  if (!table) return;
  const rows = table.querySelectorAll('tbody tr');
  rows.forEach((tr, i) => {
    const client = tr.querySelector('.rmkey-client')?.value || '';
    const key = tr.querySelector('.rmkey-key')?.value || '';
    const rate = tr.querySelector('.rmkey-rate')?.value || '';
    if (rmKeyRows[i]) {
      rmKeyRows[i].clientName = client;
      rmKeyRows[i].matterKey = key;
      rmKeyRows[i].rate = rate;
    }
  });
}

function updateRMKeyStatus(container) {
  const statusEl = container.querySelector('#rmkey-status');
  if (!statusEl) return;
  const validCount = rmKeyRows.filter(r => r.clientName?.trim()).length;
  if (validCount > 0) {
    statusEl.innerHTML = `<span style="color:var(--success)">&#10003;</span> ${validCount} clients configured`;
    statusEl.style.color = 'var(--success)';
  } else {
    statusEl.textContent = 'No clients configured';
    statusEl.style.color = 'var(--muted)';
  }
}
