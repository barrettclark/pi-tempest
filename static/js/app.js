import { initNow, refreshNow }       from './now.js';
import { refreshForecast }           from './forecast.js';

const LOADING   = document.getElementById('loading');
const TAB_NOW   = document.getElementById('tab-now');
const TAB_FC    = document.getElementById('tab-forecast');
const PANEL_NOW = document.getElementById('panel-now');
const PANEL_FC  = document.getElementById('panel-forecast');
const TABBAR_T  = document.getElementById('tabbar-time');
const STATUS_OBS = document.getElementById('status-obs');

let activeTab = 'now';

function showTab(name) {
  activeTab = name;
  TAB_NOW.classList.toggle('active', name === 'now');
  TAB_FC.classList.toggle('active', name === 'forecast');
  PANEL_NOW.classList.toggle('hidden', name !== 'now');
  PANEL_FC.classList.toggle('hidden', name !== 'forecast');
}

TAB_NOW.addEventListener('click', () => showTab('now'));
TAB_FC.addEventListener('click',  () => showTab('forecast'));

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
  await Promise.allSettled([
    refreshNow(),
    refreshForecast(),
    refreshStatus(),
  ]);
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
