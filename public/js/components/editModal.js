import { updateEntry } from '../api.js';
import { store } from '../state.js';
import { toast, escapeHtml } from '../utils.js';
let modalEl = null;
let currentCallback = null;
function ensureModal() { if (modalEl) return; modalEl = document.getElementById('edit-modal'); if (!modalEl) return; modalEl.addEventListener('click', (e) => { if (e.target === modalEl) closeModal(); }); document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modalEl.classList.contains('open')) closeModal(); }); }
export function openEditModal(item, onSave) {
  ensureModal(); if (!modalEl) return;
  currentCallback = onSave;
  document.getElementById('edit-id').value = item.id || '';
  document.getElementById('edit-client').value = item.client || '';
  document.getElementById('edit-description').value = item.activityDescription || '';
  document.getElementById('edit-date').value = item.date || '';
  document.getElementById('edit-duration').value = item.durationHours || 0.1;
  document.getElementById('edit-start').value = item.startFormatted || '';
  document.getElementById('edit-end').value = item.endFormatted || '';
  modalEl.classList.add('open');
}
export function closeModal() { if (modalEl) modalEl.classList.remove('open'); currentCallback = null; }
export async function saveEdit() {
  const id = document.getElementById('edit-id').value;
  const updates = { client: document.getElementById('edit-client').value, activityDescription: document.getElementById('edit-description').value, date: document.getElementById('edit-date').value, durationHours: parseFloat(document.getElementById('edit-duration').value) || 0.1, startFormatted: document.getElementById('edit-start').value, endFormatted: document.getElementById('edit-end').value };
  try { const data = await updateEntry(id, updates); if (data.success) { const idx = store.billingItems.findIndex(i => i.id === id); if (idx !== -1) store.billingItems[idx] = { ...store.billingItems[idx], ...updates }; closeModal(); toast('Entry updated'); if (currentCallback) currentCallback(); } } catch { toast('Save failed', true); }
}
window.saveEditEntry = saveEdit;
window.closeEditModal = closeModal;
