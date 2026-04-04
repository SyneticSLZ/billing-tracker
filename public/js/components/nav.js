import { store } from '../state.js';
import { navigate } from '../router.js';
const navItems = [
  { section: 'Overview' },
  { id: 'dashboard', icon: '📊', label: 'Dashboard' },
  { section: 'Data Sources' },
  { id: 'emails', icon: '📧', label: 'Emails', countKey: 'email' },
  { id: 'teams', icon: '💬', label: 'Teams', countKey: 'teams' },
  { id: 'meetings', icon: '📅', label: 'Meetings', countKey: 'meeting' },
  { id: 'calls', icon: '📞', label: 'Calls', countKey: 'call' },
  { section: 'Analysis' },
  { id: 'clients', icon: '👥', label: 'Clients' },
  { section: 'Preferences' },
  { id: 'settings', icon: '⚙️', label: 'Settings' },
];
export function renderNav(container) {
  if (!container) return;
  let html = '';
  let sectionOpen = false;
  navItems.forEach(item => {
    if (item.section) { if (sectionOpen) html += '</div>'; html += '<div class="nav-section"><div class="nav-section-label">' + item.section + '</div>'; sectionOpen = true; return; }
    const isActive = store.currentView === item.id;
    const count = item.countKey ? getCounts(item.countKey) : null;
    const badge = count !== null ? '<span class="nav-badge" data-count-key="' + item.countKey + '">' + count + '</span>' : '';
    html += '<button class="nav-item ' + (isActive ? 'active' : '') + '" data-view="' + item.id + '" onclick="navigateTo(\'' + item.id + '\')">';
    html += '<span class="nav-icon">' + item.icon + '</span><span class="nav-label">' + item.label + '</span>' + badge + '</button>';
  });
  if (sectionOpen) html += '</div>';
  container.innerHTML = html;
}
function getCounts(key) {
  const items = store.billingItems;
  if (!items.length) return 0;
  if (key === 'email') return items.filter(i => i.type?.toLowerCase().includes('email')).length;
  if (key === 'teams') return items.filter(i => i.type === 'Teams Message').length;
  if (key === 'meeting') return items.filter(i => i.type?.toLowerCase().includes('meeting')).length;
  if (key === 'call') return items.filter(i => i.type?.toLowerCase().includes('call')).length;
  return 0;
}
export function updateNavBadges() {
  document.querySelectorAll('.nav-badge[data-count-key]').forEach(el => { el.textContent = getCounts(el.dataset.countKey); });
}
