import { initNow, refreshNow } from './now.js';

const LOADING    = document.getElementById('loading');
const TABBAR_T   = document.getElementById('tabbar-time');
const STATUS_OBS = document.getElementById('status-obs');

function tickClock() {
  TABBAR_T.textContent = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
  });
}

async function refreshStatus() {
  try {
    const s = await fetch('/api/status').then(r => r.json());
    STATUS_OBS.textContent = `${s.db_row_count} obs`;
  } catch (_) {}
}

async function refresh() {
  await Promise.allSettled([refreshNow(), refreshStatus()]);
}

(async () => {
  initNow();
  tickClock();
  setInterval(tickClock, 1000);
  try {
    await refresh();
  } catch (err) {
    console.error('Initial load error:', err);
  } finally {
    LOADING.classList.add('hidden');
  }
  setInterval(refresh, 60_000);
})();
