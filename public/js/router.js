import { store } from './state.js';

const routes = {};
let currentCleanup = null;

export function registerRoute(hash, renderFn) {
  routes[hash] = renderFn;
}

export function navigate(hash) {
  if (window.location.hash !== '#' + hash) {
    window.location.hash = hash;
  } else {
    handleRoute();
  }
}

function handleRoute() {
  const hash = window.location.hash.slice(1) || 'dashboard';
  store.currentView = hash;

  // Cleanup previous view
  if (currentCleanup && typeof currentCleanup === 'function') {
    currentCleanup();
    currentCleanup = null;
  }

  const container = document.getElementById('view-container');
  if (!container) return;

  const renderFn = routes[hash];
  if (renderFn) {
    currentCleanup = renderFn(container) || null;
  } else {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">404</div><h3>View not found</h3><p>The view "${hash}" does not exist.</p></div>`;
  }

  // Update nav active state
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === hash);
  });
}

export function initRouter() {
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}
