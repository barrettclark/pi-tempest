/**
 * app.js — boot and auto-refresh.
 *
 * Single-page dashboard: all rows are always visible.
 * Fetches current + all history + forecast in parallel on load,
 * then refreshes every 60 seconds.
 */

import { renderCurrent }  from './current.js';
import { renderAllRows }  from './history.js';

const LOADING     = document.getElementById('loading');
const LOADING_SUB = document.getElementById('loading-sub');

async function refresh() {
  await renderAllRows();
}

(async () => {
  LOADING_SUB.textContent = 'Fetching weather data…';
  try {
    await renderAllRows();
  } catch (err) {
    console.error('Initial load failed:', err);
  } finally {
    LOADING.classList.add('hidden');
  }
  setInterval(refresh, 60_000);
})();
