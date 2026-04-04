import { getEmailBody } from '../api.js';
import { escapeHtml, formatDate, formatTime, stripHtml } from '../utils.js';
let panelEl = null, overlayEl = null;
function ensurePanel() {
  if (panelEl) return;
  overlayEl = document.createElement('div'); overlayEl.className = 'drilldown-overlay'; overlayEl.addEventListener('click', close); document.body.appendChild(overlayEl);
  panelEl = document.createElement('div'); panelEl.className = 'drilldown-panel';
  panelEl.innerHTML = '<div class="drilldown-header"><h3 id="drilldown-title"></h3><button class="drilldown-close">✕</button></div><div class="drilldown-body" id="drilldown-body"></div><div class="drilldown-footer" id="drilldown-footer"></div>';
  document.body.appendChild(panelEl);
  panelEl.querySelector('.drilldown-close').addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panelEl.classList.contains('open')) close(); });
}
export function open(type, item, onEdit) {
  ensurePanel();
  const titleEl = panelEl.querySelector('#drilldown-title'), bodyEl = panelEl.querySelector('#drilldown-body'), footerEl = panelEl.querySelector('#drilldown-footer');
  const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
  titleEl.innerHTML = '<span class="type-badge type-' + type + '" style="margin-right:6px">' + escapeHtml(typeLabel) + '</span>' + escapeHtml(item.subject || item.chatTopic || 'Entry');
  let html = '<div class="detail-meta">';
  html += '<div class="detail-meta-item">📅 ' + escapeHtml(item.date || '') + '</div>';
  html += '<div class="detail-meta-item">⏱ ' + escapeHtml(item.startFormatted || '') + '</div>';
  html += '<div class="detail-meta-item">⏳ ' + (item.durationHours || 0.1) + 'h</div>';
  if (item.matterKey) html += '<div class="detail-meta-item">🔑 Key: ' + item.matterKey + '</div>';
  if (item.rate) html += '<div class="detail-meta-item">💲 $' + item.rate + '/hr</div>';
  html += '</div>';
  if (item.participants) html += '<div class="detail-section"><div class="detail-label">From/With</div><div class="detail-value">' + escapeHtml(item.participants) + '</div></div>';
  if (item.client) html += '<div class="detail-section"><div class="detail-label">Client</div><div class="detail-value" style="font-weight:600;color:' + (item.client.includes('UNKNOWN') ? 'var(--warning)' : 'var(--accent)') + '">' + escapeHtml(item.client) + (item.rmKeyMatched ? ' <span style="font-size:0.7rem;color:var(--success)">✓ RM Key</span>' : '') + '</div></div>';
  if (item.activityDescription) html += '<div class="detail-section"><div class="detail-label">Activity Description</div><div class="detail-value">' + escapeHtml(item.activityDescription) + '</div></div>';
  if (item.bodyPreview) html += '<div class="detail-section"><div class="detail-label">Preview</div><div class="detail-value" style="color:var(--text-secondary)">' + escapeHtml(item.bodyPreview) + '</div></div>';
  if (type === 'email' && item.sourceId) html += '<div class="detail-section"><div class="detail-label">Full Email Body</div><div class="email-body-content" id="email-body-container"><div class="email-body-loading">Loading...</div></div></div>';
  bodyEl.innerHTML = html;
  if (type === 'email' && item.sourceId) {
    getEmailBody(item.sourceId).then(data => { const c = document.getElementById('email-body-container'); if (c && data?.body) c.innerHTML = data.body.contentType === 'html' ? data.body.content : '<pre style="white-space:pre-wrap">' + escapeHtml(data.body.content) + '</pre>'; else if (c) c.innerHTML = '<span style="color:var(--muted)">Could not load</span>'; }).catch(() => { const c = document.getElementById('email-body-container'); if (c) c.innerHTML = '<span style="color:var(--muted)">Could not load</span>'; });
  }
  footerEl.innerHTML = onEdit ? '<button class="btn btn-primary btn-sm" id="drilldown-edit-btn">Edit Entry</button><button class="btn btn-ghost btn-sm" onclick="document.querySelector(\'.drilldown-panel\').classList.remove(\'open\');document.querySelector(\'.drilldown-overlay\').classList.remove(\'open\')">Close</button>' : '<button class="btn btn-ghost btn-sm" onclick="document.querySelector(\'.drilldown-panel\').classList.remove(\'open\');document.querySelector(\'.drilldown-overlay\').classList.remove(\'open\')">Close</button>';
  if (onEdit) footerEl.querySelector('#drilldown-edit-btn').addEventListener('click', () => { close(); onEdit(item); });
  overlayEl.classList.add('open'); panelEl.classList.add('open');
}
export function close() { if (overlayEl) overlayEl.classList.remove('open'); if (panelEl) panelEl.classList.remove('open'); }
