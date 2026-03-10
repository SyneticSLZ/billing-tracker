import { uploadCallLog as apiUpload } from '../api.js';
import { store } from '../state.js';
import { toast } from '../utils.js';

export function initUploadZone(zone, onUploaded) {
  if (!zone) return;

  const input = zone.querySelector('input[type="file"]');
  if (!input) return;

  zone.addEventListener('click', (e) => {
    if (e.target.closest('button') || e.target === input) return;
    input.click();
  });

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('drag-over');
  });

  zone.addEventListener('dragleave', () => {
    zone.classList.remove('drag-over');
  });

  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
      handleUpload(file, onUploaded);
    } else {
      toast('Please upload a CSV file', true);
    }
  });

  input.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleUpload(file, onUploaded);
  });
}

async function handleUpload(file, callback) {
  toast('Processing call log...');
  try {
    const data = await apiUpload(file);
    if (data.success) {
      store.billingItems = [...store.billingItems, ...(data.items || [])];
      toast(`Added ${data.added} call entries`);
      if (callback) callback();
    } else {
      toast(data.error || 'Upload failed', true);
    }
  } catch (err) {
    toast('Upload failed: ' + err.message, true);
  }
}
