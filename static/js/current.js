/**
 * current.js — updates the stat blocks from /api/current data.
 * Called by history.js after all data is fetched.
 */

const STATUS_DOT = document.getElementById('status-dot');
const STATUS_TIME = document.getElementById('status-time');
const STATUS_BACKFILL = document.getElementById('status-backfill');

function set(id, val, fallback = '—') {
  const el = document.getElementById(id);
  if (el) el.textContent = (val !== null && val !== undefined) ? val : fallback;
}

function timeSince(epoch) {
  const s = Math.floor(Date.now() / 1000) - epoch;
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const TREND_ARROW = { rising: '▲', falling: '▼', steady: '►' };
const TREND_CLASS = { rising: 'trend-rising', falling: 'trend-falling', steady: 'trend-steady' };

export function renderCurrent(d) {
  // ── Temperature ──
  set('cur-temp',      d.temperature_f != null ? `${d.temperature_f}°F` : '—');
  set('cur-feels',     d.feels_like_f  != null ? `Feels like ${d.feels_like_f}°F` : '');
  set('cur-dewpoint',  d.dew_point_f   != null ? `Dew Pt ${d.dew_point_f}°F` : '');
  set('cur-humidity',  d.humidity_pct  != null ? `Humidity ${Math.round(d.humidity_pct)}%` : '');

  // ── Wind ──
  set('cur-wind-avg',  d.wind_avg_mph  != null ? `${d.wind_avg_mph}` : '—');
  set('cur-wind-unit', 'mph');
  set('cur-wind-dir',  d.wind_direction_cardinal || '—');
  set('cur-wind-gust', d.wind_gust_mph != null ? `Gust ${d.wind_gust_mph} mph` : '');
  set('cur-wind-lull', d.wind_lull_mph != null ? `Lull ${d.wind_lull_mph} mph` : '');

  // ── Rain ──
  set('cur-rain-today', d.rain_today_in != null ? `${d.rain_today_in}"` : '—');
  set('cur-rain-label', 'today');

  // ── Pressure ──
  set('cur-pressure',    d.pressure_inhg != null ? `${d.pressure_inhg}"` : '—');
  const trendEl = document.getElementById('cur-pressure-trend');
  if (trendEl) {
    const tr = d.pressure_trend || 'steady';
    trendEl.textContent = `${TREND_ARROW[tr] || '►'} ${tr.charAt(0).toUpperCase() + tr.slice(1)}`;
    trendEl.className = `stat-secondary ${TREND_CLASS[tr] || ''}`;
  }

  // ── Solar / UV ──
  set('cur-solar', d.solar_radiation_wm2 != null ? `${Math.round(d.solar_radiation_wm2)} W/m²` : '—');
  set('cur-uv',    d.uv_index != null ? `UV ${d.uv_index.toFixed(1)}` : '—');

  // ── Lightning ──
  set('cur-lightning', d.lightning_count_1h != null ? `${d.lightning_count_1h}/hr` : '0/hr');
  if (d.lightning_last_epoch) {
    set('cur-lightning-last',
      `Last ${timeSince(d.lightning_last_epoch)}` +
      (d.lightning_last_distance_km ? ` · ${d.lightning_last_distance_km} km` : '')
    );
  } else {
    set('cur-lightning-last', 'No recent strikes');
  }

  // ── Status bar ──
  const age = Math.floor(Date.now() / 1000) - d.epoch;
  STATUS_DOT.className = age > 300 ? 'stale' : '';
  const updated = new Date(d.epoch * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (STATUS_TIME) STATUS_TIME.textContent = `Updated ${updated}`;
}

export async function fetchStatus() {
  try {
    const r = await fetch('/api/status');
    if (!r.ok) return;
    const s = await r.json();
    if (STATUS_BACKFILL) {
      STATUS_BACKFILL.textContent = s.backfill_complete
        ? `${s.db_row_count.toLocaleString()} obs`
        : 'Backfilling…';
    }
  } catch {}
}
