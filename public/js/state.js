// Central state store
export const store = {
  account: null,
  authenticated: false,
  billingItems: [],
  rawData: {
    emails: [],
    events: [],
    teamsMessages: [],
    callRecords: [],
    uploadedCalls: []
  },
  // RM Key state
  rmKeyLoaded: false,
  rmKeyClients: [],
  // UI state
  currentView: 'dashboard',
  drilldownOpen: false,
  drilldownItem: null,
  drilldownType: null,
  filters: { type: '', client: '', search: '' },
  sort: { column: 'date', direction: 'desc' },
  pagination: { page: 1, pageSize: 50 },
  settings: {
    pageSize: 50,
    defaultDateRange: 'month',
    emailFetchLimit: 250,
    chatLimit: 50,
    messagesPerChat: 50,
    showCharts: true,
    groupEmailsByThread: false,
    hourlyRate: 0,
    timekeeperName: 'Mark Paxton',
  }
};

export function loadSettings() {
  try {
    const saved = localStorage.getItem('billingTrackerSettings');
    if (saved) {
      Object.assign(store.settings, JSON.parse(saved));
      store.pagination.pageSize = store.settings.pageSize;
    }
  } catch (e) { /* ignore */ }
}

export function saveSettings() {
  try {
    localStorage.setItem('billingTrackerSettings', JSON.stringify(store.settings));
  } catch (e) { /* ignore */ }
}

export function getUniqueClients() {
  const clients = new Set();
  store.billingItems.forEach(item => { if (item.client) clients.add(item.client); });
  return [...clients].sort();
}

export function getUniqueTypes() {
  const types = new Set();
  store.billingItems.forEach(item => { if (item.type) types.add(item.type); });
  return [...types].sort();
}

export function getFilteredItems(items = null) {
  let filtered = items || store.billingItems;
  if (store.filters.type) filtered = filtered.filter(i => i.type === store.filters.type);
  if (store.filters.client) filtered = filtered.filter(i => i.client === store.filters.client);
  if (store.filters.search) {
    const q = store.filters.search.toLowerCase();
    filtered = filtered.filter(i =>
      (i.client || '').toLowerCase().includes(q) ||
      (i.subject || '').toLowerCase().includes(q) ||
      (i.activityDescription || '').toLowerCase().includes(q) ||
      (i.participants || '').toLowerCase().includes(q)
    );
  }
  const { column, direction } = store.sort;
  filtered.sort((a, b) => {
    let valA = a[column] || '';
    let valB = b[column] || '';
    if (column === 'durationHours') { valA = parseFloat(valA) || 0; valB = parseFloat(valB) || 0; }
    else if (column === 'date' || column === 'startTime') { valA = new Date(valA).getTime() || 0; valB = new Date(valB).getTime() || 0; }
    else { valA = String(valA).toLowerCase(); valB = String(valB).toLowerCase(); }
    if (valA < valB) return direction === 'asc' ? -1 : 1;
    if (valA > valB) return direction === 'asc' ? 1 : -1;
    return 0;
  });
  return filtered;
}

export function getPaginatedItems(filtered) {
  const { page, pageSize } = store.pagination;
  const start = (page - 1) * pageSize;
  return {
    items: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page, pageSize,
    totalPages: Math.ceil(filtered.length / pageSize)
  };
}
