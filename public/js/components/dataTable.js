import { debounce, escapeHtml, getTypeClass } from '../utils.js';
export class DataTable {
  constructor(options) {
    this.container = options.container; this.columns = options.columns; this.data = options.data || [];
    this.pageSize = options.pageSize || 50; this.page = 1;
    this.sortColumn = options.sortColumn || null; this.sortDir = options.sortDir || 'desc';
    this.searchQuery = ''; this.searchFields = options.searchFields || [];
    this.filters = options.filters || []; this.filterValues = {};
    this.onRowClick = options.onRowClick || null; this.onAction = options.onAction || null;
    this.emptyMessage = options.emptyMessage || 'No data available'; this.emptyIcon = options.emptyIcon || '📂';
    this.showSearch = options.showSearch !== false; this.actions = options.actions || [];
    this.rowClass = options.rowClass || null;
    this._searchHandler = debounce(() => { this.page = 1; this.render(); }, 300);
  }
  setData(data) { this.data = data; this.page = 1; this.render(); }
  getFiltered() {
    let filtered = [...this.data];
    if (this.searchQuery && this.searchFields.length) {
      const q = this.searchQuery.toLowerCase();
      filtered = filtered.filter(item => this.searchFields.some(field => { const val = field.split('.').reduce((o, k) => o?.[k], item); return val && String(val).toLowerCase().includes(q); }));
    }
    Object.entries(this.filterValues).forEach(([key, value]) => { if (value) filtered = filtered.filter(item => item[key] === value); });
    if (this.sortColumn) {
      const col = this.columns.find(c => c.key === this.sortColumn);
      filtered.sort((a, b) => {
        let valA = a[this.sortColumn] ?? ''; let valB = b[this.sortColumn] ?? '';
        if (col?.sortType === 'number') { valA = parseFloat(valA) || 0; valB = parseFloat(valB) || 0; }
        else if (col?.sortType === 'date') { valA = new Date(valA).getTime() || 0; valB = new Date(valB).getTime() || 0; }
        else { valA = String(valA).toLowerCase(); valB = String(valB).toLowerCase(); }
        if (valA < valB) return this.sortDir === 'asc' ? -1 : 1;
        if (valA > valB) return this.sortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return filtered;
  }
  render() {
    const filtered = this.getFiltered();
    const totalPages = Math.ceil(filtered.length / this.pageSize) || 1;
    if (this.page > totalPages) this.page = totalPages;
    const start = (this.page - 1) * this.pageSize;
    const pageItems = filtered.slice(start, start + this.pageSize);
    let html = '<div class="data-table-wrapper"><div class="data-table-toolbar"><div class="toolbar-left">';
    if (this.showSearch) html += '<input type="text" class="table-search" placeholder="Search..." value="' + escapeHtml(this.searchQuery) + '" data-action="search">';
    this.filters.forEach(f => { html += '<select class="table-filter" data-filter-key="' + f.key + '"><option value="">All ' + f.label + '</option>' + f.options.map(o => '<option value="' + escapeHtml(o) + '"' + (this.filterValues[f.key] === o ? ' selected' : '') + '>' + escapeHtml(o) + '</option>').join('') + '</select>'; });
    html += '</div><div class="toolbar-right">';
    this.actions.forEach(a => { html += '<button class="btn ' + (a.class || 'btn-ghost btn-sm') + '" data-table-action="' + a.id + '">' + a.label + '</button>'; });
    html += '<span style="font-size:11px;color:var(--muted)">' + filtered.length + ' items</span></div></div>';
    html += '<div class="table-scroll"><table class="data-table"><thead><tr>';
    this.columns.forEach(col => {
      const sortable = col.sortable ? 'sortable' : '';
      let sortClass = '', sortIcon = '↕';
      if (col.key === this.sortColumn) { sortClass = this.sortDir === 'asc' ? 'sort-asc' : 'sort-desc'; sortIcon = this.sortDir === 'asc' ? '↑' : '↓'; }
      const width = col.width ? 'style="width:' + col.width + '"' : '';
      html += '<th class="' + sortable + ' ' + sortClass + '" data-sort-key="' + col.key + '" ' + width + '>' + col.label + (col.sortable ? '<span class="sort-icon">' + sortIcon + '</span>' : '') + '</th>';
    });
    html += '</tr></thead><tbody>';
    if (!pageItems.length) {
      html += '<tr><td colspan="' + this.columns.length + '"><div class="empty-state"><div class="empty-icon">' + this.emptyIcon + '</div><h3>' + this.emptyMessage + '</h3></div></td></tr>';
    } else {
      pageItems.forEach(item => {
        const rowCls = this.rowClass ? this.rowClass(item) : '';
        html += '<tr data-id="' + escapeHtml(item.id || '') + '" class="' + rowCls + '">';
        this.columns.forEach(col => { const cls = col.class || ''; const val = col.render ? col.render(item) : escapeHtml(String(item[col.key] ?? '')); html += '<td class="' + cls + '">' + val + '</td>'; });
        html += '</tr>';
      });
    }
    html += '</tbody></table></div>';
    if (filtered.length > this.pageSize) {
      const showStart = start + 1, showEnd = Math.min(start + this.pageSize, filtered.length);
      html += '<div class="table-pagination"><span class="pagination-info">Showing ' + showStart + '-' + showEnd + ' of ' + filtered.length + '</span><div class="pagination-controls">';
      html += '<button class="pagination-btn" data-page="prev"' + (this.page <= 1 ? ' disabled' : '') + '>Prev</button>';
      const maxButtons = 5;
      let startPage = Math.max(1, this.page - Math.floor(maxButtons / 2));
      let endPage = Math.min(totalPages, startPage + maxButtons - 1);
      if (endPage - startPage < maxButtons - 1) startPage = Math.max(1, endPage - maxButtons + 1);
      for (let p = startPage; p <= endPage; p++) html += '<button class="pagination-btn' + (p === this.page ? ' active' : '') + '" data-page="' + p + '">' + p + '</button>';
      html += '<button class="pagination-btn" data-page="next"' + (this.page >= totalPages ? ' disabled' : '') + '>Next</button></div></div>';
    }
    html += '</div>';
    this.container.innerHTML = html;
    this._bindEvents();
  }
  _bindEvents() {
    const searchInput = this.container.querySelector('[data-action="search"]');
    if (searchInput) searchInput.addEventListener('input', (e) => { this.searchQuery = e.target.value; this._searchHandler(); });
    this.container.querySelectorAll('.table-filter').forEach(select => { select.addEventListener('change', (e) => { this.filterValues[e.target.dataset.filterKey] = e.target.value; this.page = 1; this.render(); }); });
    this.container.querySelectorAll('th.sortable').forEach(th => { th.addEventListener('click', () => { const key = th.dataset.sortKey; if (this.sortColumn === key) this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc'; else { this.sortColumn = key; this.sortDir = 'desc'; } this.render(); }); });
    if (this.onRowClick) this.container.querySelectorAll('tbody tr[data-id]').forEach(tr => { tr.addEventListener('click', (e) => { if (e.target.closest('button')) return; const id = tr.dataset.id; const item = this.data.find(i => String(i.id) === id); if (item) this.onRowClick(item); }); });
    this.container.querySelectorAll('[data-page]').forEach(btn => { btn.addEventListener('click', () => { const p = btn.dataset.page; if (p === 'prev') this.page = Math.max(1, this.page - 1); else if (p === 'next') this.page++; else this.page = parseInt(p); this.render(); }); });
    this.container.querySelectorAll('[data-table-action]').forEach(btn => { btn.addEventListener('click', () => { if (this.onAction) this.onAction(btn.dataset.tableAction); }); });
  }
}
