// Toast notification
export function toast(msg, isError = false) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.style.borderColor = isError ? 'var(--danger)' : 'var(--border)';
  el.classList.add('show');
  clearTimeout(el._timeout);
  el._timeout = setTimeout(() => el.classList.remove('show'), 3000);
}

// Debounce
export function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// Format date
export function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

// Format time
export function formatTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// Date range helpers
export function setDateRange(range) {
  const now = new Date();
  const end = now.toISOString().split('T')[0];
  let start;

  if (range === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    start = d.toISOString().split('T')[0];
  } else if (range === 'lastMonth') {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    start = d.toISOString().split('T')[0];
    const endD = new Date(now.getFullYear(), now.getMonth(), 0);
    return { start, end: endD.toISOString().split('T')[0] };
  } else if (range === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  } else {
    // Support specific month names: "jan", "feb", "march", "october", etc.
    const monthMap = {
      jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
      apr: 3, april: 3, may: 4, jun: 5, june: 5,
      jul: 6, july: 6, aug: 7, august: 7, sep: 8, september: 8,
      oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
    };
    const monthIdx = monthMap[range.toLowerCase()];
    if (monthIdx !== undefined) {
      // Use current year, but if the month is in the future, use last year
      let year = now.getFullYear();
      if (monthIdx > now.getMonth()) year--;
      const first = new Date(year, monthIdx, 1);
      const last = new Date(year, monthIdx + 1, 0);
      return {
        start: first.toISOString().split('T')[0],
        end: last.toISOString().split('T')[0]
      };
    }
    // Default: this month
    start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  }
  return { start, end };
}

// Get the most recent complete month name and range key
export function getRecentCompleteMonth() {
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const names = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return { name: names[prevMonth.getMonth()], key: names[prevMonth.getMonth()].toLowerCase() };
}

// Escape HTML
export function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Get type CSS class
export function getTypeClass(type) {
  if (!type) return '';
  const t = type.toLowerCase();
  if (t.includes('email')) return 'type-email';
  if (t.includes('teams message')) return 'type-teams';
  if (t.includes('meeting')) return 'type-meeting';
  if (t.includes('call')) return 'type-call';
  return '';
}

// Get type color for charts
export function getTypeColor(type) {
  if (!type) return '#7a8499';
  const t = type.toLowerCase();
  if (t.includes('email')) return '#667eea';
  if (t.includes('teams message')) return '#4fd1c5';
  if (t.includes('meeting')) return '#b794f4';
  if (t.includes('call')) return '#ed8936';
  return '#7a8499';
}

// Strip HTML tags
export function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').trim();
}

// Truncate text
export function truncate(str, len = 80) {
  if (!str) return '';
  return str.length > len ? str.substring(0, len) + '...' : str;
}

// Get initials
export function getInitials(name) {
  if (!name) return '?';
  return name.split(/[\s@]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}
