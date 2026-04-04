export function showProgress(container) { if (!container) return; container.classList.add('visible'); }
export function hideProgress(container) { if (!container) return; setTimeout(() => container.classList.remove('visible'), 1500); }
export function setProgress(container, pct, msg) {
  if (!container) return;
  const bar = container.querySelector('.progress-bar-fill');
  const pctEl = container.querySelector('.progress-pct');
  const msgEl = container.querySelector('.progress-message');
  if (bar) bar.style.width = pct + '%';
  if (pctEl) pctEl.textContent = pct + '%';
  if (msgEl) msgEl.textContent = msg;
}
