import { createLineSparkline, updateLineSparkline } from './sparklines.js';
import { iconEmoji }                                from './icons.js';
import { fetchJson }                                from './api.js';

const sp = {};
let lastObsEpoch = null;  // newest observation seen
let lastOkAt = 0;        // ms timestamp of last successful /api/current

// ── Temperature gradient helpers ──────────────────────────
const TEMP_STOPS = [
  [32,  '#9b59b6'],
  [45,  '#4a90d9'],
  [55,  '#00c8ff'],
  [65,  '#00e5b0'],
  [75,  '#a8e063'],
  [80,  '#ffd166'],
  [90,  '#ff6b35'],
  [100, '#ff4e4e'],
  [106, '#7b1818'],
];

function _hexRgb(h) { return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); }

function _lerpColor(c1, c2, t) {
  const [r1, g1, b1] = _hexRgb(c1), [r2, g2, b2] = _hexRgb(c2);
  return `rgb(${Math.round(r1+(r2-r1)*t)},${Math.round(g1+(g2-g1)*t)},${Math.round(b1+(b2-b1)*t)})`;
}

function _tempColor(f) {
  if (f <= TEMP_STOPS[0][0]) return TEMP_STOPS[0][1];
  if (f >= TEMP_STOPS[TEMP_STOPS.length-1][0]) return TEMP_STOPS[TEMP_STOPS.length-1][1];
  for (let i = 0; i < TEMP_STOPS.length - 1; i++) {
    const [t0, c0] = TEMP_STOPS[i], [t1, c1] = TEMP_STOPS[i+1];
    if (f >= t0 && f <= t1) return _lerpColor(c0, c1, (f - t0) / (t1 - t0));
  }
}

function _buildGradient(lo, hi) {
  const N = 24, stops = [];
  for (let i = 0; i <= N; i++) {
    const f = lo + (hi - lo) * (i / N);
    stops.push(`${_tempColor(f)} ${(i / N * 100).toFixed(1)}%`);
  }
  return `linear-gradient(90deg,${stops.join(',')})`;
}

// ── Arc gauge — SVG semicircle ────────────────────────────
const _esc = s => String(s).replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);

function _arcGauge(svgId, value, max, valStr, catStr, color) {
  const el = document.getElementById(svgId);
  if (!el) return;
  const cx = 130, cy = 95, r = 78;
  const pct = Math.min(0.999, Math.max(0.001, value / max));
  const ang = Math.PI * (1 - pct);
  const fx  = (cx + r * Math.cos(ang)).toFixed(1);
  const fy  = (cy - r * Math.sin(ang)).toFixed(1);
  el.innerHTML = `
    <path d="M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}"
      fill="none" stroke="rgba(90,127,168,0.18)" stroke-width="11" stroke-linecap="round"/>
    <path d="M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${fx} ${fy}"
      fill="none" stroke="${color}" stroke-width="11" stroke-linecap="round"/>
    <text x="${cx}" y="${cy-26}" text-anchor="middle" dominant-baseline="middle"
      fill="#e8f0fe" font-size="30" font-family="Segoe UI,system-ui,sans-serif"
      font-weight="200">${_esc(valStr)}</text>
    <text x="${cx}" y="${cy-7}" text-anchor="middle" dominant-baseline="middle"
      fill="rgba(90,127,168,0.9)" font-size="12" font-family="Segoe UI,system-ui,sans-serif">${_esc(catStr)}</text>
  `;
}

// ── Wind compass — SVG ────────────────────────────────────
function _drawCompass(svgId, dirDeg) {
  const el = document.getElementById(svgId);
  if (!el) return;
  const cx = 65, cy = 65, r = 50;
  let h = `<circle cx="${cx}" cy="${cy}" r="${r}"
    fill="rgba(13,30,53,0.6)" stroke="rgba(90,127,168,0.25)" stroke-width="1.5"/>`;
  for (let i = 0; i < 36; i++) {
    const a = (i * 10 - 90) * Math.PI / 180;
    const isCard = (i % 9 === 0), isMaj = (i % 3 === 0);
    const r0 = isCard ? r - 10 : isMaj ? r - 6 : r - 3;
    h += `<line x1="${(cx+r0*Math.cos(a)).toFixed(1)}" y1="${(cy+r0*Math.sin(a)).toFixed(1)}"
               x2="${(cx+r*Math.cos(a)).toFixed(1)}" y2="${(cy+r*Math.sin(a)).toFixed(1)}"
      stroke="${isCard ? 'rgba(232,240,254,0.5)' : 'rgba(90,127,168,0.25)'}"
      stroke-width="${isCard ? 1.5 : 0.8}"/>`;
  }
  [['N', 0], ['E', 90], ['S', 180], ['W', 270]].forEach(([l, d]) => {
    const a = (d - 90) * Math.PI / 180;
    h += `<text x="${(cx+(r+13)*Math.cos(a)).toFixed(1)}" y="${(cy+(r+13)*Math.sin(a)).toFixed(1)}"
      text-anchor="middle" dominant-baseline="middle"
      fill="rgba(232,240,254,0.6)" font-size="10" font-family="system-ui">${l}</text>`;
  });
  const aRad = (dirDeg - 90) * Math.PI / 180;
  const arrowLen = r * 0.6;
  const tipX  = (cx + arrowLen * Math.cos(aRad)).toFixed(1);
  const tipY  = (cy + arrowLen * Math.sin(aRad)).toFixed(1);
  const tailX = (cx - arrowLen * 0.45 * Math.cos(aRad)).toFixed(1);
  const tailY = (cy - arrowLen * 0.45 * Math.sin(aRad)).toFixed(1);
  const perpRad = aRad + Math.PI / 2, hw = 6;
  const p1x = (cx + (arrowLen-hw)*Math.cos(aRad) + hw*Math.cos(perpRad)).toFixed(1);
  const p1y = (cy + (arrowLen-hw)*Math.sin(aRad) + hw*Math.sin(perpRad)).toFixed(1);
  const p2x = (cx + (arrowLen-hw)*Math.cos(aRad) - hw*Math.cos(perpRad)).toFixed(1);
  const p2y = (cy + (arrowLen-hw)*Math.sin(aRad) - hw*Math.sin(perpRad)).toFixed(1);
  h += `<line x1="${tailX}" y1="${tailY}" x2="${tipX}" y2="${tipY}"
    stroke="#00c8ff" stroke-width="2.5" stroke-linecap="round"/>
  <polygon points="${tipX},${tipY} ${p1x},${p1y} ${p2x},${p2y}" fill="#00c8ff"/>
  <circle cx="${cx}" cy="${cy}" r="3" fill="rgba(0,200,255,0.4)" stroke="#00c8ff" stroke-width="1.5"/>`;
  el.innerHTML = h;
}

// ── Helpers ───────────────────────────────────────────────
function _fmt12(epoch) {
  if (!epoch) return '—';
  return new Date(epoch * 1000).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function _fmtAgo(epoch) {
  if (!epoch) return '';
  const s = Math.floor(Date.now() / 1000) - epoch;
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

// Builds nodes without innerHTML so API strings are never parsed as markup.
function _el(tag, text, cls) {
  const n = document.createElement(tag);
  if (text != null) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}

function _uvColor(uv) {
  if (uv == null) return '#00e5b0';
  if (uv < 3)  return '#00e5b0';
  if (uv < 6)  return '#ffd166';
  if (uv < 8)  return '#ffb347';
  if (uv < 11) return '#ff4e4e';
  return '#ff6b9d';
}

function _uvCat(uv) {
  if (uv == null) return '—';
  if (uv < 3)  return 'Low';
  if (uv < 6)  return 'Moderate';
  if (uv < 8)  return 'High';
  if (uv < 11) return 'Very High';
  return 'Extreme';
}

const AQI_COLORS = {
  'Good':                           '#00e5b0',
  'Moderate':                       '#ffd166',
  'Unhealthy for Sensitive Groups': '#ffb347',
  'Unhealthy':                      '#ff6b9d',
  'Very Unhealthy':                 '#ff4e4e',
  'Hazardous':                      '#8b2fc9',
};

function _rainCategory(rate) {
  if (rate >= 0.60) return { cat: 'Violent',  color: '#ff6b9d', pct: 100 };
  if (rate >= 0.30) return { cat: 'Heavy',    color: '#ffd166', pct: Math.round(rate / 0.6 * 100) };
  if (rate >= 0.10) return { cat: 'Moderate', color: '#00c8ff', pct: Math.round(rate / 0.6 * 100) };
  if (rate >= 0.01) return { cat: 'Light',    color: '#74b0ff', pct: Math.max(8, Math.round(rate / 0.6 * 100)) };
  return                    { cat: 'Drizzle', color: '#74b0ff', pct: 4 };
}

// ── Init ──────────────────────────────────────────────────
export function initNow() {
  try {
    sp.pressure = createLineSparkline(
      document.getElementById('sp-pressure'),
      '#00e5b0', false,
      v => `${Number(v).toFixed(2)}`
    );
  } catch (_) {}
}

// ── Refresh ───────────────────────────────────────────────
export async function refreshNow() {
  const [cur, rainH, pressH, forecast, aqi, moonR] = await Promise.allSettled([
    fetchJson('/api/current'),
    fetchJson('/api/history/rain'),
    fetchJson('/api/history/pressure?hours=6'),
    fetchJson('/api/forecast'),
    fetchJson('/api/aqi'),
    fetchJson('/api/moon'),
  ]);

  const c  = cur.status      === 'fulfilled' ? cur.value      : null;
  const fc = forecast.status === 'fulfilled' ? forecast.value : { hourly: [], daily: [] };
  const _try = fn => { try { fn(); } catch (e) { console.error(e); } };

  if (c) {
    lastObsEpoch = c.epoch || null;
    lastOkAt = Date.now();
    _try(() => _updateHero(c, fc));
    _try(() => _updateWind(c));
    _try(() => _updateUV(c));
  }
  if (c && fc.daily?.length)              _try(() => _updateHeroBar(c, fc.daily));
  if (rainH.status === 'fulfilled')       _try(() => _updateRain(rainH.value, c));
  if (c && pressH.status === 'fulfilled') _try(() => _updatePressure(c, pressH.value));
  if (aqi.status === 'fulfilled')         _try(() => _updateAQI(aqi.value));
  if (moonR.status === 'fulfilled') {
    _try(() => _updateMoon(moonR.value));
    _try(() => _updateSunrise(moonR.value));
  }
}

// ── Cell updaters ─────────────────────────────────────────

function _updateHero(c, fc) {
  const h0 = fc.hourly?.[0];
  document.getElementById('hero-icon').textContent    = iconEmoji(h0?.icon ?? null);
  document.getElementById('hero-condlbl').textContent = h0?.conditions ?? '';
  document.getElementById('hero-temp').textContent    =
    c.temperature_f != null ? `${c.temperature_f.toFixed(1)}°` : '—';
  document.getElementById('hero-feels').textContent   =
    c.feels_like_f != null ? `${c.feels_like_f.toFixed(0)}°` : '—';

  const hum = c.humidity_pct;
  document.getElementById('hero-hum-val').textContent = hum != null ? `${hum.toFixed(0)}%` : '—';
  if (hum != null) {
    document.getElementById('hum-comfort').style.cssText = 'left:30%;width:40%';
    document.getElementById('hum-dot').style.left = `${Math.min(100, Math.max(0, hum))}%`;
  }
}

function _updateHeroBar(c, daily) {
  const today = daily?.[0];
  const lo  = today?.low_f;
  const hi  = today?.high_f;
  const cur = c.temperature_f;

  document.getElementById('temp-lo-lbl').textContent  = lo  != null ? `${Math.round(lo)}°`  : '—';
  document.getElementById('temp-hi-lbl').textContent  = hi  != null ? `${Math.round(hi)}°`  : '—';
  document.getElementById('temp-now-lbl').textContent = cur != null ? `${cur.toFixed(0)}° now` : '';

  if (lo != null && hi != null && hi !== lo) {
    document.getElementById('temp-gradient').style.background = _buildGradient(lo, hi);
    if (cur != null) {
      const pct = Math.min(100, Math.max(0, (cur - lo) / (hi - lo) * 100));
      document.getElementById('temp-dot').style.left = `${pct.toFixed(1)}%`;
    }
  }
}

function _statLine(label, val) {
  const d = _el('div', `${label} `);
  d.append(_el('b', val ?? '—'), ' mph');
  return d;
}

function _updateWind(c) {
  _drawCompass('wind-svg', c.wind_direction_deg ?? 0);
  const mph = c.wind_avg_mph;
  document.getElementById('wind-speed').textContent    = mph != null ? mph.toFixed(1) : '—';
  document.getElementById('wind-dir-unit').textContent =
    `mph · ${c.wind_direction_cardinal ?? ''}`;
  document.getElementById('wind-meta').replaceChildren(
    _statLine('Lull', c.wind_lull_mph),
    _statLine('Gust', c.wind_gust_mph),
  );
}

function _updateUV(c) {
  const uv = c.uv_index;
  _arcGauge('uv-svg', uv ?? 0, 11,
    uv != null ? String(Math.round(uv)) : '—',
    _uvCat(uv), _uvColor(uv));
}

function _updateAQI(aqiData) {
  const aqi   = aqiData?.aqi ?? null;
  const cat   = aqiData?.category ?? '—';
  const color = AQI_COLORS[cat] ?? '#e8f0fe';
  _arcGauge('aqi-svg', aqi ?? 0, 300, aqi != null ? String(aqi) : '—', cat, color);
}

function _updatePressure(c, histData) {
  const val = c.pressure_inhg;
  const pv = document.getElementById('pressure-val');
  if (val != null) pv.replaceChildren(`${val.toFixed(2)}`, _el('span', ' inHg'));
  else pv.textContent = '—';

  const trend = c.pressure_trend ?? 'steady';
  const trendMap = {
    rising:  { sym: '▲', label: 'Rising',  desc: 'Improving', cls: 'pressure-trend-lbl trend-rising'  },
    falling: { sym: '▼', label: 'Falling', desc: 'Worsening', cls: 'pressure-trend-lbl trend-falling' },
    steady:  { sym: '►', label: 'Steady',  desc: 'No change', cls: 'pressure-trend-lbl trend-steady'  },
  };
  const t = trendMap[trend] ?? trendMap.steady;

  const vals = (histData.pressure_inhg ?? []).filter(v => v != null);
  let lineColor = '#00e5b0';
  const desc = _el('span', `· ${t.desc}`);
  desc.style.color = '#5a7fa8';
  const parts = [`${t.sym} ${t.label} `, desc];
  if (vals.length >= 2) {
    const delta = vals[vals.length - 1] - vals[0];
    const abs   = Math.abs(delta);
    if      (abs > 0.30) lineColor = '#ff4e4e';
    else if (abs > 0.12) lineColor = '#ffb347';
    const sign = delta >= 0 ? '+' : '';
    const d = _el('span', `${sign}${delta.toFixed(2)}" / 6h`, 'pressure-delta');
    d.style.color = lineColor;
    parts.push(' ', d);
  }

  const trendEl = document.getElementById('pressure-trend');
  trendEl.className = t.cls;
  trendEl.replaceChildren(...parts);

  if (sp.pressure) {
    sp.pressure.data.datasets[0].borderColor     = lineColor;
    sp.pressure.data.datasets[0].backgroundColor = lineColor + '18';
    updateLineSparkline(sp.pressure, histData.labels, histData.pressure_inhg);
  }
}

function _updateRain(rainData, c) {
  if (c) {
    const rate = c.rain_rate_in_hr;
    const intensityEl = document.getElementById('rain-intensity-block');
    if (rate != null && rate > 0) {
      const { cat, color, pct } = _rainCategory(rate);
      const fill = _el('div', null, 'rain-bar-fill');
      fill.style.width = `${pct}%`;
      fill.style.background = color;
      const track = _el('div', null, 'rain-bar-track');
      track.append(fill);
      const status = _el('div', null, 'rain-status-row');
      const catEl = _el('div', cat, 'rain-cat-lbl');
      catEl.style.color = color;
      status.append(catEl, track, _el('div', `${rate.toFixed(2)} in/hr`, 'rain-rate-lbl'));
      intensityEl.replaceChildren(status);
    } else {
      intensityEl.replaceChildren(_el('div', 'No Rain', 'rain-norain'));
    }

    const lcLast   = c.lightning_last_epoch;
    const lcDetail = lcLast
      ? `${c.lightning_last_distance_km ?? '?'} km · ${_fmtAgo(lcLast)}`
      : 'No recent strikes';
    document.getElementById('lightning-row').replaceChildren(
      _el('div', '⚡', 'lc-icon'),
      _el('div', String(c.lightning_count_1h ?? 0), 'lc-rate'),
      _el('div', '/hr', 'lc-unit'),
      _el('div', `· ${lcDetail}`, 'lc-detail'),
    );
  }

  if (rainData) {
    const fmt = v => (v != null ? `${v.toFixed(2)}"` : '—');
    const totals = [
      [fmt(c?.rain_today_in),           'Today'],
      [fmt(rainData.rain_yesterday_in), 'Yesterday'],
      [fmt(rainData.rain_7day_in),      '7-Day'],
      [fmt(rainData.rain_year_in),      'Year'],
    ];
    document.getElementById('rain-totals').replaceChildren(
      ...totals.map(([val, lbl]) => {
        const d = _el('div', null, 'rain-total');
        d.append(_el('div', val, 'rain-val'), _el('div', lbl, 'rain-lbl'));
        return d;
      }),
    );
  }
}

function _updateMoon(moon) {
  document.getElementById('moon-emoji').textContent = moon.emoji     ?? '🌙';
  document.getElementById('moon-phase').textContent = moon.phase_name ?? '—';
  document.getElementById('moon-times').replaceChildren(
    `${moon.moonrise ?? '—'} ↑ rise`,
    document.createElement('br'),
    `${moon.moonset ?? '—'} ↓ set`,
  );
}

function _updateSunrise(moon) {
  document.getElementById('sunrise-time').textContent = moon.sunrise    ?? '—';
  document.getElementById('sunset-time').textContent  = moon.sunset     ?? '—';
  document.getElementById('day-length').textContent   =
    moon.day_length ? `${moon.day_length} of daylight` : '—';
}

const STALE_S = 180;    // station or API data older than this is flagged
const OFFLINE_S = 900;

function _fmtStamp(epoch) {
  return new Date(epoch * 1000).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

export function renderStatus() {
  const dot = document.getElementById('status-dot');
  const el  = document.getElementById('status-time');
  const nowS = Date.now() / 1000;
  const obsAge = lastObsEpoch ? nowS - lastObsEpoch : Infinity;
  const apiAge = lastOkAt ? nowS - lastOkAt / 1000 : Infinity;
  const age = Math.max(obsAge, apiAge);

  dot.className = 'dot' + (age > OFFLINE_S ? ' offline' : age > STALE_S ? ' stale' : '');
  if (!lastObsEpoch) el.textContent = 'No data';
  else el.textContent = age > STALE_S ? _fmtStamp(lastObsEpoch) : _fmt12(lastObsEpoch);
}
