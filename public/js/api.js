// API wrappers
export async function checkAuthStatus() {
  const res = await fetch('/auth/status');
  return res.json();
}

export async function fetchBillingData(startDate, endDate, settings = {}) {
  const response = await fetch('/api/fetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startDate,
      endDate,
      emailLimit: settings.emailFetchLimit || 250,
      chatLimit: settings.chatLimit || 50,
      messagesPerChat: settings.messagesPerChat || 50,
    })
  });
  return response;
}

export async function getEntries() {
  const res = await fetch('/api/entries');
  return res.json();
}

export async function updateEntry(id, updates) {
  const res = await fetch(`/api/entry/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  return res.json();
}

export async function deleteEntry(id) {
  const res = await fetch(`/api/entry/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function clearAllEntries() {
  const res = await fetch('/api/entries', { method: 'DELETE' });
  return res.json();
}

export async function uploadCallLog(file) {
  const formData = new FormData();
  formData.append('calllog', file);
  const res = await fetch('/api/upload-calls', { method: 'POST', body: formData });
  return res.json();
}

export async function getRawEmails(page = 1, pageSize = 50) {
  const res = await fetch(`/api/raw/emails?page=${page}&pageSize=${pageSize}`);
  return res.json();
}

export async function getEmailBody(emailId) {
  const res = await fetch(`/api/raw/emails/${emailId}/body`);
  return res.json();
}

export async function getRawEvents() {
  const res = await fetch('/api/raw/events');
  return res.json();
}

export async function getRawTeams() {
  const res = await fetch('/api/raw/teams');
  return res.json();
}

export async function getRawCalls() {
  const res = await fetch('/api/raw/calls');
  return res.json();
}

export async function getClients() {
  const res = await fetch('/api/clients');
  return res.json();
}

export async function getClientEntries(clientName) {
  const res = await fetch(`/api/clients/${encodeURIComponent(clientName)}`);
  return res.json();
}

export async function logout() {
  await fetch('/auth/logout');
}
