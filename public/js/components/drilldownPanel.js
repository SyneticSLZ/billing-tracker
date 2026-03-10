import { getEmailBody } from '../api.js';
import { escapeHtml, formatDate, formatTime, stripHtml, getTypeClass } from '../utils.js';

let panelEl = null;
let overlayEl = null;

function ensurePanel() {
  if (panelEl) return;

  overlayEl = document.createElement('div');
  overlayEl.className = 'drilldown-overlay';
  overlayEl.addEventListener('click', close);
  document.body.appendChild(overlayEl);

  panelEl = document.createElement('div');
  panelEl.className = 'drilldown-panel';
  panelEl.innerHTML = `
    <div class="drilldown-header">
      <h3 id="drilldown-title"></h3>
      <button class="drilldown-close" onclick="this.closest('.drilldown-panel').classList.remove('open');document.querySelector('.drilldown-overlay').classList.remove('open')">✕</button>
    </div>
    <div class="drilldown-body" id="drilldown-body"></div>
    <div class="drilldown-footer" id="drilldown-footer"></div>
  `;
  document.body.appendChild(panelEl);

  panelEl.querySelector('.drilldown-close').addEventListener('click', close);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panelEl.classList.contains('open')) close();
  });
}

export function open(type, item, onEdit) {
  ensurePanel();

  const titleEl = panelEl.querySelector('#drilldown-title');
  const bodyEl = panelEl.querySelector('#drilldown-body');
  const footerEl = panelEl.querySelector('#drilldown-footer');

  if (type === 'email') renderEmail(titleEl, bodyEl, item);
  else if (type === 'meeting' || type === 'event') renderMeeting(titleEl, bodyEl, item);
  else if (type === 'teams') renderTeamsMessage(titleEl, bodyEl, item);
  else if (type === 'call') renderCall(titleEl, bodyEl, item);
  else renderGeneric(titleEl, bodyEl, item);

  footerEl.innerHTML = onEdit
    ? `<button class="btn btn-primary btn-sm" id="drilldown-edit-btn">Edit Entry</button><button class="btn btn-ghost btn-sm" onclick="document.querySelector('.drilldown-panel').classList.remove('open');document.querySelector('.drilldown-overlay').classList.remove('open')">Close</button>`
    : `<button class="btn btn-ghost btn-sm" onclick="document.querySelector('.drilldown-panel').classList.remove('open');document.querySelector('.drilldown-overlay').classList.remove('open')">Close</button>`;

  if (onEdit) {
    footerEl.querySelector('#drilldown-edit-btn').addEventListener('click', () => {
      close();
      onEdit(item);
    });
  }

  overlayEl.classList.add('open');
  panelEl.classList.add('open');
}

export function close() {
  if (overlayEl) overlayEl.classList.remove('open');
  if (panelEl) panelEl.classList.remove('open');
}

function renderEmail(titleEl, bodyEl, item) {
  titleEl.innerHTML = `<span class="type-badge type-email" style="margin-right:6px">Email</span>${escapeHtml(item.subject || 'No Subject')}`;

  let html = `
    <div class="detail-meta">
      <div class="detail-meta-item">📅 ${escapeHtml(item.date || formatDate(item.startTime))}</div>
      <div class="detail-meta-item">⏱ ${escapeHtml(item.startFormatted || formatTime(item.startTime))}</div>
      <div class="detail-meta-item">⏳ ${item.durationHours || 0.1}h</div>
      ${item.hasAttachments ? '<div class="detail-meta-item">📎 Attachments</div>' : ''}
      ${item.importance === 'high' ? '<div class="detail-meta-item" style="color:var(--danger)">❗ High Priority</div>' : ''}
    </div>
    <div class="detail-section">
      <div class="detail-label">From</div>
      <div class="detail-value">${escapeHtml(item.participants || '')}</div>
    </div>`;

  if (item.toRecipients) {
    html += `<div class="detail-section"><div class="detail-label">To</div><div class="detail-value">${escapeHtml(item.toRecipients)}</div></div>`;
  }
  if (item.ccRecipients) {
    html += `<div class="detail-section"><div class="detail-label">CC</div><div class="detail-value">${escapeHtml(item.ccRecipients)}</div></div>`;
  }
  if (item.client) {
    html += `<div class="detail-section"><div class="detail-label">Client</div><div class="detail-value" style="font-weight:600;color:${item.client.includes('UNKNOWN') ? 'var(--warning)' : 'var(--accent)'}">${escapeHtml(item.client)}</div></div>`;
  }
  if (item.activityDescription) {
    html += `<div class="detail-section"><div class="detail-label">Activity Description</div><div class="detail-value">${escapeHtml(item.activityDescription)}</div></div>`;
  }

  html += `<div class="detail-section"><div class="detail-label">Preview</div><div class="detail-value" style="color:var(--text-secondary)">${escapeHtml(item.bodyPreview || '')}</div></div>`;

  // Full body (fetch on-demand)
  if (item.sourceId) {
    html += `<div class="detail-section"><div class="detail-label">Full Email Body</div><div class="email-body-content" id="email-body-container"><div class="email-body-loading">Loading full email body...</div></div></div>`;
  }

  bodyEl.innerHTML = html;

  // Fetch full body
  if (item.sourceId) {
    getEmailBody(item.sourceId).then(data => {
      const container = document.getElementById('email-body-container');
      if (container && data?.body) {
        container.innerHTML = data.body.contentType === 'html'
          ? data.body.content
          : `<pre style="white-space:pre-wrap;font-family:'DM Sans',sans-serif">${escapeHtml(data.body.content)}</pre>`;
      } else if (container) {
        container.innerHTML = '<span style="color:var(--muted)">Could not load email body</span>';
      }
    }).catch(() => {
      const container = document.getElementById('email-body-container');
      if (container) container.innerHTML = '<span style="color:var(--muted)">Could not load email body</span>';
    });
  }
}

function renderMeeting(titleEl, bodyEl, item) {
  const badge = item.isOnlineMeeting || item.type === 'Teams Meeting' ? 'type-teams' : 'badge-meeting-type';
  titleEl.innerHTML = `<span class="type-badge ${badge}" style="margin-right:6px">${escapeHtml(item.type || 'Meeting')}</span>${escapeHtml(item.subject || 'No Title')}`;

  let html = `
    <div class="detail-meta">
      <div class="detail-meta-item">📅 ${escapeHtml(item.date || formatDate(item.startTime))}</div>
      <div class="detail-meta-item">⏱ ${escapeHtml(item.startFormatted || formatTime(item.startTime))} - ${escapeHtml(item.endFormatted || formatTime(item.endTime))}</div>
      <div class="detail-meta-item">⏳ ${item.durationHours || 0}h</div>
      ${item.isOnlineMeeting ? '<div class="detail-meta-item">🎥 Online</div>' : '<div class="detail-meta-item">🏢 In-Person</div>'}
    </div>`;

  if (item.organizer) {
    html += `<div class="detail-section"><div class="detail-label">Organizer</div><div class="detail-value">${escapeHtml(item.organizer)}</div></div>`;
  }
  if (item.participants) {
    html += `<div class="detail-section"><div class="detail-label">Attendees</div><div class="detail-value">${escapeHtml(item.participants).split(',').map(p => `<div style="padding:2px 0">${p.trim()}</div>`).join('')}</div></div>`;
  }
  if (item.location) {
    html += `<div class="detail-section"><div class="detail-label">Location</div><div class="detail-value">${escapeHtml(item.location)}</div></div>`;
  }
  if (item.client) {
    html += `<div class="detail-section"><div class="detail-label">Client</div><div class="detail-value" style="font-weight:600;color:var(--accent)">${escapeHtml(item.client)}</div></div>`;
  }
  if (item.activityDescription) {
    html += `<div class="detail-section"><div class="detail-label">Activity Description</div><div class="detail-value">${escapeHtml(item.activityDescription)}</div></div>`;
  }
  if (item.bodyPreview) {
    html += `<div class="detail-section"><div class="detail-label">Notes</div><div class="detail-value" style="color:var(--text-secondary)">${escapeHtml(item.bodyPreview)}</div></div>`;
  }

  bodyEl.innerHTML = html;
}

function renderTeamsMessage(titleEl, bodyEl, item) {
  titleEl.innerHTML = `<span class="type-badge type-teams" style="margin-right:6px">Teams</span>${escapeHtml(item.chatTopic || item.subject || 'Teams Chat')}`;

  let html = `
    <div class="detail-meta">
      <div class="detail-meta-item">📅 ${escapeHtml(item.date || formatDate(item.startTime))}</div>
      <div class="detail-meta-item">⏱ ${escapeHtml(item.startFormatted || formatTime(item.startTime))}</div>
      <div class="detail-meta-item">💬 ${escapeHtml(item.chatType || 'Chat')}</div>
    </div>`;

  if (item.participants) {
    html += `<div class="detail-section"><div class="detail-label">From</div><div class="detail-value">${escapeHtml(item.participants)}</div></div>`;
  }
  if (item.client) {
    html += `<div class="detail-section"><div class="detail-label">Client</div><div class="detail-value" style="font-weight:600;color:var(--accent)">${escapeHtml(item.client)}</div></div>`;
  }
  if (item.activityDescription) {
    html += `<div class="detail-section"><div class="detail-label">Activity Description</div><div class="detail-value">${escapeHtml(item.activityDescription)}</div></div>`;
  }

  html += `<div class="detail-section"><div class="detail-label">Message Content</div><div class="email-body-content">${escapeHtml(item.bodyPreview || stripHtml(item.bodyPreview) || '')}</div></div>`;

  bodyEl.innerHTML = html;
}

function renderCall(titleEl, bodyEl, item) {
  titleEl.innerHTML = `<span class="type-badge type-call" style="margin-right:6px">Call</span>${escapeHtml(item.subject || 'Phone Call')}`;

  let html = `
    <div class="detail-meta">
      <div class="detail-meta-item">📅 ${escapeHtml(item.date || formatDate(item.startTime))}</div>
      <div class="detail-meta-item">⏱ ${escapeHtml(item.startFormatted || formatTime(item.startTime))} - ${escapeHtml(item.endFormatted || formatTime(item.endTime))}</div>
      <div class="detail-meta-item">⏳ ${item.durationHours || 0}h</div>
    </div>`;

  if (item.participants) {
    html += `<div class="detail-section"><div class="detail-label">Contact</div><div class="detail-value">${escapeHtml(item.participants)}</div></div>`;
  }
  if (item.client) {
    html += `<div class="detail-section"><div class="detail-label">Client</div><div class="detail-value" style="font-weight:600;color:var(--accent)">${escapeHtml(item.client)}</div></div>`;
  }
  if (item.activityDescription) {
    html += `<div class="detail-section"><div class="detail-label">Activity Description</div><div class="detail-value">${escapeHtml(item.activityDescription)}</div></div>`;
  }
  if (item.bodyPreview) {
    html += `<div class="detail-section"><div class="detail-label">Details</div><div class="detail-value" style="color:var(--text-secondary)">${escapeHtml(item.bodyPreview)}</div></div>`;
  }

  bodyEl.innerHTML = html;
}

function renderGeneric(titleEl, bodyEl, item) {
  titleEl.textContent = item.subject || item.type || 'Entry Detail';
  bodyEl.innerHTML = `<pre style="white-space:pre-wrap;font-size:0.8rem;color:var(--text-secondary)">${escapeHtml(JSON.stringify(item, null, 2))}</pre>`;
}
