import { store } from '../state.js';
import { billableItems } from '../utils.js';
import { navigate } from '../router.js';
export function renderStatsBar(container) {
  const all = store.billingItems;
  if (!all.length) { container.innerHTML = ''; return; }

  // Billable totals = what will actually export.
  const items = billableItems(all);
  const totalHours = items.reduce((s, i) => s + (i.durationHours || 0.1), 0).toFixed(1);
  const emails = items.filter(i => i.type?.toLowerCase().includes('email')).length;
  const meetings = items.filter(i => i.type?.toLowerCase().includes('meeting')).length;
  const teamsMessages = items.filter(i => i.type === 'Teams Message').length;
  const calls = items.filter(i => i.type?.toLowerCase().includes('call')).length;

  // Non-billable breakdown (visible so a wrong filter is obvious).
  const internal  = all.filter(i => i.excludeKind === 'internal').length;
  const meetingEx = all.filter(i => i.excludeKind === 'meeting').length;
  const manualEx  = all.filter(i => i.excludeKind === 'manual').length;
  const childEx   = all.filter(i => i.excludeKind === 'consolidated-child').length;
  const combined  = all.filter(i => i.isConsolidated && !i.billingExcluded).length;
  const nonBillable = internal + meetingEx + manualEx; // children are not "extra" — they roll up

  const stats = [
    { label: 'Billable Entries', value: items.length },
    { label: 'Billable Hours',   value: totalHours },
    { label: 'Emails',           value: emails,        view: 'emails' },
    { label: 'Meetings',         value: meetings,      view: 'meetings' },
    { label: 'Teams Messages',   value: teamsMessages, view: 'teams' },
    { label: 'Calls',            value: calls,         view: 'calls' },
  ];
  // Always-visible audit tiles when there is anything to show.
  if (combined)    stats.push({ label: 'Combined',     value: combined,    view: 'emails', accent: 'var(--accent)' });
  if (nonBillable) stats.push({ label: 'Non-billable', value: nonBillable, view: 'emails', accent: 'var(--warning)' });
  if (childEx)     stats.push({ label: 'Rolled-up',    value: childEx,     view: 'emails', accent: 'var(--muted)',
                                 title: `${childEx} child email(s) folded into combined entries` });

  container.innerHTML = stats.map(s =>
    '<div class="stat-card" '
    + (s.view ? `onclick="navigateTo('${s.view}')" style="cursor:pointer` + (s.accent ? `;border-color:${s.accent}` : '') + '"' : (s.accent ? `style="border-color:${s.accent}"` : ''))
    + (s.title ? ` title="${s.title}"` : '')
    + '><div class="stat-label"' + (s.accent ? ` style="color:${s.accent}"` : '') + '>' + s.label + '</div>'
    + '<div class="stat-value">' + s.value + '</div></div>'
  ).join('');
}
