import { store, loadSettings } from './state.js';
import { checkAuthStatus } from './api.js';
import { initRouter, registerRoute, navigate } from './router.js';
import { renderNav } from './components/nav.js';
import { renderDashboard } from './components/dashboard.js';
import { renderEmails } from './components/emailList.js';
import { renderTeams } from './components/teamsView.js';
import { renderMeetings } from './components/meetingsView.js';
import { renderCalls } from './components/callsView.js';
import { renderClients } from './components/clientBreakdown.js';
import { renderSettings } from './components/settingsPanel.js';
import { toast, debounce } from './utils.js';

async function init() {
  loadSettings();
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('error')) {
    setTimeout(() => toast('Error: ' + urlParams.get('error'), true), 500);
  }
  try {
    const authData = await checkAuthStatus();
    if (authData.authenticated) {
      store.authenticated = true;
      store.account = authData.account;
      showApp();
    } else {
      showLogin();
    }
  } catch {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app-container').style.display = 'none';
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-container').style.display = 'block';
  if (store.account) {
    document.getElementById('user-name').textContent = store.account.name || store.account.email || '';
    document.getElementById('logout-btn').style.display = 'inline-flex';
  }
  renderNav(document.getElementById('sidebar-nav'));
  registerRoute('dashboard', renderDashboard);
  registerRoute('emails', renderEmails);
  registerRoute('teams', renderTeams);
  registerRoute('meetings', renderMeetings);
  registerRoute('calls', renderCalls);
  registerRoute('clients', renderClients);
  registerRoute('settings', renderSettings);
  initRouter();
  const globalSearch = document.getElementById('global-search');
  if (globalSearch) {
    globalSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && globalSearch.value.trim()) {
        const viewSearch = document.querySelector('#view-container .table-search');
        if (viewSearch) {
          viewSearch.value = globalSearch.value;
          viewSearch.dispatchEvent(new Event('input'));
          viewSearch.focus();
        }
      }
    });
  }
}

window.appLogin = () => { window.location.href = '/auth/login'; };
window.appLogout = async () => {
  await fetch('/auth/logout');
  store.authenticated = false;
  store.account = null;
  store.billingItems = [];
  showLogin();
};
window.navigateTo = navigate;

init();
