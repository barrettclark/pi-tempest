import { fetchJson } from './api.js';
import { initNow, refreshNow, renderStatus } from './now.js';

const LOADING      = document.getElementById('loading');
const STATUSBAR_T  = document.getElementById('statusbar-time');
const STATUS_OBS   = document.getElementById('status-obs');
const POLL_MS      = 60_000;

let inFlight = false;

function tickClock() {
  STATUSBAR_T.textContent = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
  });
}

async function refreshStatus() {
  try {
    const s = await fetchJson('/api/status');
    STATUS_OBS.textContent = `${s.db_row_count} obs`;
  } catch (_) {}
}

async function refresh() {
  if (inFlight) return;
  inFlight = true;
  try {
    await Promise.allSettled([refreshNow(), refreshStatus()]);
    renderStatus();
  } finally {
    inFlight = false;
  }
}

document.getElementById('exit-btn')?.addEventListener('click', () => {
  fetch('/api/exit', { method: 'POST' }).catch(() => {});
});

(async () => {
  tickClock();
  setInterval(tickClock, 1000);
  // Registered before the first await so a slow or failed initial load still polls.
  setInterval(refresh, POLL_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh();
  });
  try {
    initNow();
    await refresh();
  } catch (err) {
    console.error('Load error:', err);
    document.getElementById('loading-sub').textContent = String(err);
    await new Promise(r => setTimeout(r, 8000));
  } finally {
    LOADING.classList.add('hidden');
  }
})();
