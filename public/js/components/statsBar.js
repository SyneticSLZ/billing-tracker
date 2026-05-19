import { store } from '../state.js';
import { billableItems } from '../utils.js';
import { navigate } from '../router.js';
export function renderStatsBar(container) {
  const all = store.billingItems;
  if (!all.length) { container.innerHTML = ''; return; }
  // Totals reflect what will actually export (excludes flagged + rolled-up).
  const items = billableItems(all);
  const flagged = all.filter(i => i.billingExcluded && !i.consolidatedInto).length;
  const totalHours = items.reduce((s, i) => s + (i.durationHours || 0.1), 0).toFixed(1);
  const emails = items.filter(i => i.type?.toLowerCase().includes('email')).length;
  const meetings = items.filter(i => i.type?.toLowerCase().includes('meeting')).length;
  const teamsMessages = items.filter(i => i.type === 'Teams Message').length;
  const calls = items.filter(i => i.type?.toLowerCase().includes('call')).length;
  const stats = [
    { label: 'Billable Entries', value: items.length, view: null },
    { label: 'Billable Hours', value: totalHours, view: null },
    { label: 'Emails', value: emails, view: 'emails' },
    { label: 'Meetings', value: meetings, view: 'meetings' },
    { label: 'Teams Messages', value: teamsMessages, view: 'teams' },
    { label: flagged ? 'Non-billable' : 'Calls', value: flagged ? flagged : calls, view: flagged ? null : 'calls' },
  ];
  container.innerHTML = stats.map(s => '<div class="stat-card" ' + (s.view ? 'onclick="navigateTo(\'' + s.view + '\')" style="cursor:pointer"' : '') + '><div class="stat-label">' + s.label + '</div><div class="stat-value">' + s.value + '</div></div>').join('');
}
