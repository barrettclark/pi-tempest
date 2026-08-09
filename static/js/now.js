import { createLineSparkline, updateLineSparkline } from './sparklines.js';
import { iconEmoji }                                from './icons.js';

const sp = {};

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
      font-weight="200">${valStr}</text>
    <text x="${cx}" y="${cy-7}" text-anchor="middle" dominant-baseline="middle"
      fill="rgba(90,127,168,0.9)" font-size="12" font-family="Segoe UI,system-ui,sans-serif">${catStr}</text>
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
  const [cur, tempH, rainH, pressH, forecast, aqi, moonR] = await Promise.allSettled([
    fetch('/api/current').then(r => r.json()),
    fetch('/api/history/temperature?hours=24').then(r => r.json()),
    fetch('/api/history/rain').then(r => r.json()),
    fetch('/api/history/pressure?hours=6').then(r => r.json()),
    fetch('/api/forecast').then(r => r.json()),
    fetch('/api/aqi').then(r => r.json()),
    fetch('/api/moon').then(r => r.json()),
  ]);

  const c  = cur.status      === 'fulfilled' ? cur.value      : null;
  const fc = forecast.status === 'fulfilled' ? forecast.value : { hourly: [], daily: [] };
  const _try = fn => { try { fn(); } catch (e) { console.error(e); } };

  if (c) {
    _try(() => _updateHero(c, fc));
    _try(() => _updateWind(c));
    _try(() => _updateUV(c));
    _try(() => _updateStatusBar(c));
  }
  if (c && tempH.status === 'fulfilled')  _try(() => _updateHeroBar(c, fc.daily));
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

function _updateWind(c) {
  _drawCompass('wind-svg', c.wind_direction_deg ?? 0);
  const mph = c.wind_avg_mph;
  document.getElementById('wind-speed').textContent    = mph != null ? mph.toFixed(1) : '—';
  document.getElementById('wind-dir-unit').textContent =
    `mph · ${c.wind_direction_cardinal ?? ''}`;
  document.getElementById('wind-meta').innerHTML =
    `<div>Lull <b>${c.wind_lull_mph ?? '—'}</b> mph</div>` +
    `<div>Gust <b>${c.wind_gust_mph ?? '—'}</b> mph</div>`;
}

function _updateUV(c) {
  const uv = c.uv_index;
  _arcGauge('uv-svg', uv ?? 0, 11,
    uv != null ? String(Math.round(uv)) : '—',
    _uvCat(uv), _uvColor(uv));
}

function _updateAQI(aqiData) {
  const aqi   = aqiData?.aqi ?? 0;
  const cat   = aqiData?.category ?? '—';
  const color = AQI_COLORS[cat] ?? '#e8f0fe';
  _arcGauge('aqi-svg', aqi, 300, String(aqi), cat, color);
}

function _updatePressure(c, histData) {
  const val = c.pressure_inhg;
  document.getElementById('pressure-val').innerHTML =
    val != null ? `${val.toFixed(2)}<span> inHg</span>` : '—';

  const trend = c.pressure_trend ?? 'steady';
  const trendMap = {
    rising:  { sym: '▲', label: 'Rising',  desc: 'Improving', cls: 'pressure-trend-lbl trend-rising'  },
    falling: { sym: '▼', label: 'Falling', desc: 'Worsening', cls: 'pressure-trend-lbl trend-falling' },
    steady:  { sym: '►', label: 'Steady',  desc: 'No change', cls: 'pressure-trend-lbl trend-steady'  },
  };
  const t = trendMap[trend] ?? trendMap.steady;

  const vals = (histData.pressure_inhg ?? []).filter(v => v != null);
  let lineColor = '#00e5b0';
  let deltaStr  = '';
  if (vals.length >= 2) {
    const delta = vals[vals.length - 1] - vals[0];
    const abs   = Math.abs(delta);
    if      (abs > 0.30) lineColor = '#ff4e4e';
    else if (abs > 0.12) lineColor = '#ffb347';
    const sign = delta >= 0 ? '+' : '';
    deltaStr = ` <span class="pressure-delta" style="color:${lineColor}">${sign}${delta.toFixed(2)}" / 6h</span>`;
  }

  const trendEl = document.getElementById('pressure-trend');
  trendEl.className = t.cls;
  trendEl.innerHTML = `${t.sym} ${t.label} <span style="color:#5a7fa8">· ${t.desc}</span>${deltaStr}`;

  if (sp.pressure) {
    sp.pressure.data.datasets[0].borderColor     = lineColor;
    sp.pressure.data.datasets[0].backgroundColor = lineColor + '18';
    updateLineSparkline(sp.pressure, histData.labels, histData.pressure_inhg);
  }
}

function _updateRain(rainData, c) {
  const rate = c?.rain_rate_in_hr;
  const intensityEl = document.getElementById('rain-intensity-block');
  if (rate != null && rate > 0) {
    const { cat, color, pct } = _rainCategory(rate);
    intensityEl.innerHTML =
      `<div class="rain-status-row">` +
      `<div class="rain-cat-lbl" style="color:${color}">${cat}</div>` +
      `<div class="rain-bar-track"><div class="rain-bar-fill" style="width:${pct}%;background:${color}"></div></div>` +
      `<div class="rain-rate-lbl">${rate.toFixed(2)} in/hr</div>` +
      `</div>`;
  } else {
    intensityEl.innerHTML = `<div class="rain-norain">No Rain</div>`;
  }

  const today     = c?.rain_today_in          ?? 0;
  const yesterday = rainData.rain_yesterday_in ?? 0;
  const sevenDay  = rainData.rain_7day_in      ?? 0;
  const year      = rainData.rain_year_in      ?? 0;
  document.getElementById('rain-totals').innerHTML =
    `<div class="rain-total"><div class="rain-val">${today.toFixed(2)}"</div><div class="rain-lbl">Today</div></div>` +
    `<div class="rain-total"><div class="rain-val">${yesterday.toFixed(2)}"</div><div class="rain-lbl">Yesterday</div></div>` +
    `<div class="rain-total"><div class="rain-val">${sevenDay.toFixed(2)}"</div><div class="rain-lbl">7-Day</div></div>` +
    `<div class="rain-total"><div class="rain-val">${year.toFixed(2)}"</div><div class="rain-lbl">Year</div></div>`;

  const lcRate   = c?.lightning_count_1h ?? 0;
  const lcLast   = c?.lightning_last_epoch;
  const lcDist   = c?.lightning_last_distance_km;
  const lcDetail = lcLast ? `${lcDist ?? '?'} km · ${_fmtAgo(lcLast)}` : 'No recent strikes';
  document.getElementById('lightning-row').innerHTML =
    `<div class="lc-icon">⚡</div>` +
    `<div class="lc-rate">${lcRate}</div>` +
    `<div class="lc-unit">/hr</div>` +
    `<div class="lc-detail">· ${lcDetail}</div>`;
}

function _updateMoon(moon) {
  document.getElementById('moon-emoji').textContent = moon.emoji     ?? '🌙';
  document.getElementById('moon-phase').textContent = moon.phase_name ?? '—';
  document.getElementById('moon-times').innerHTML   =
    `${moon.moonrise ?? '—'} ↑ rise<br>${moon.moonset ?? '—'} ↓ set`;
}

function _updateSunrise(moon) {
  document.getElementById('sunrise-time').textContent = moon.sunrise    ?? '—';
  document.getElementById('sunset-time').textContent  = moon.sunset     ?? '—';
  document.getElementById('day-length').textContent   =
    moon.day_length ? `${moon.day_length} of daylight` : '—';
}

function _updateStatusBar(c) {
  const dot = document.getElementById('status-dot');
  const age = c.epoch ? Math.floor(Date.now() / 1000) - c.epoch : null;
  dot.className = 'dot' + (age == null || age > 180 ? ' stale' : '');
  document.getElementById('status-time').textContent = _fmt12(c.epoch);
}
