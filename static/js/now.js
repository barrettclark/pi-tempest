import { WindGauge, MiniArcGauge }                    from './gauges.js';
import { createBlendedSparkline, createLineSparkline,
         createBarSparkline, updateBlendedSparkline,
         updateLineSparkline, updateBarSparkline }     from './sparklines.js';
import { renderUpcoming }                              from './upcoming.js';
import { iconEmoji }                                   from './icons.js';

let windGauge = null;
let uvGauge   = null;
let aqiGauge  = null;
const sp = {};

function fmt12(epoch) {
  if (!epoch) return '—';
  return new Date(epoch * 1000).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function fmtAgo(epoch) {
  if (!epoch) return '';
  const s = Math.floor(Date.now() / 1000) - epoch;
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

const AQI_COLORS = {
  'Good':                  '#00e5b0',
  'Moderate':              '#ffd166',
  'Unhealthy for Sensitive Groups': '#ffb347',
  'Unhealthy':             '#ff6b9d',
  'Very Unhealthy':        '#ff4e4e',
  'Hazardous':             '#8b2fc9',
};

export function initNow() {
  windGauge = new WindGauge(document.getElementById('wind-gauge'));
  uvGauge   = new MiniArcGauge(document.getElementById('uv-gauge'),  { max: 11,  color: '#ff6b9d' });
  aqiGauge  = new MiniArcGauge(document.getElementById('aqi-gauge'), { max: 300, color: '#00e5b0' });

  try { sp.temp     = createBlendedSparkline(document.getElementById('sp-temp'),      v => `${Number(v).toFixed(1)}°`, true); } catch(_) {}
  try { sp.rain     = createBarSparkline(document.getElementById('sp-rain'),          '#74b0ff'); } catch(_) {}
  try { sp.pressure = createLineSparkline(document.getElementById('sp-pressure'), '#00e5b0', false, v => `${Number(v).toFixed(2)}`); } catch(_) {}
  try { sp.solar    = createLineSparkline(document.getElementById('sp-solar'),    '#ffd166', true,  v => `${Math.round(Number(v))}`); } catch(_) {}
}

export async function refreshNow() {
  const [cur, tempH, rainH, pressH, solarH, forecast, aqi, moonR] = await Promise.allSettled([
    fetch('/api/current').then(r => r.json()),
    fetch('/api/history/temperature?hours=24').then(r => r.json()),
    fetch('/api/history/rain').then(r => r.json()),
    fetch('/api/history/pressure?hours=6').then(r => r.json()),
    fetch('/api/history/solar').then(r => r.json()),
    fetch('/api/forecast').then(r => r.json()),
    fetch('/api/aqi').then(r => r.json()),
    fetch('/api/moon').then(r => r.json()),
  ]);

  const c = cur.status === 'fulfilled' ? cur.value : null;
  const fc = forecast.status === 'fulfilled' ? forecast.value : { hourly: [], daily: [] };

  const _try = (fn) => { try { fn(); } catch(e) { console.error(e); } };

  if (c) {
    _try(() => _updateLeft(c, fc.hourly));
    _try(() => _updateStatusBar(c));
  }

  if (tempH.status === 'fulfilled')        _try(() => _updateTempRow(tempH.value, fc.hourly));
  _try(() => _updateUpcoming(fc.hourly));
  if (rainH.status === 'fulfilled')       _try(() => _updateRainRow(rainH.value, c));
  if (c && pressH.status === 'fulfilled') _try(() => _updatePressureRow(c, pressH.value));
  if (c && solarH.status === 'fulfilled') _try(() => _updateSolarRow(c, solarH.value));
  if (aqi.status === 'fulfilled')         _try(() => _updateAqiRow(aqi.value, c));
  if (c)                                  _try(() => _updateLightningCompact(c));
  _try(() => _updateDailyRow(fc.daily ?? []));
  if (moonR.status === 'fulfilled')       _try(() => _updateMoonMini(moonR.value));
}

function _updateLeft(c, hourly = []) {
  const h0 = hourly[0];
  document.getElementById('cond-icon').textContent = iconEmoji(h0?.icon ?? null);
  document.getElementById('cond-desc').textContent = h0?.conditions ?? '';
  document.getElementById('now-temp').textContent =
    c.temperature_f != null ? `${c.temperature_f.toFixed(1)}°` : '—';
  document.getElementById('now-feels').textContent =
    `Feels ${c.feels_like_f?.toFixed(0) ?? '—'}°`;
  document.getElementById('now-humidity').textContent =
    `${c.humidity_pct?.toFixed(0) ?? '—'}%`;

  const ri = document.getElementById('rain-intensity');
  if (c.rain_rate_in_hr != null && c.rain_rate_in_hr > 0) {
    ri.textContent = `☔ ${c.rain_rate_in_hr.toFixed(2)} in/hr`;
    ri.classList.remove('hidden');
  } else {
    ri.classList.add('hidden');
  }

  windGauge.update({
    direction_deg: c.wind_direction_deg,
    avg_mph: c.wind_avg_mph,
    cardinal: c.wind_direction_cardinal,
  });

  document.getElementById('wind-sub').innerHTML =
    `<span><b style="color:#e8f0fe;font-size:12px">${c.wind_lull_mph ?? '—'}</b> lull</span>` +
    `<span><b style="color:#e8f0fe;font-size:12px">${c.wind_gust_mph ?? '—'}</b> gust</span>`;
}

function _updateTempRow(histData, hourly) {
  const temps = histData.temperature_f?.filter(t => t != null) ?? [];
  document.querySelector('.th-hi').textContent = temps.length ? `Hi ${Math.max(...temps).toFixed(1)}°` : 'Hi —';
  document.querySelector('.th-lo').textContent = temps.length ? `Lo ${Math.min(...temps).toFixed(1)}°` : 'Lo —';
  updateBlendedSparkline(sp.temp, histData.labels, histData.temperature_f, hourly, 'temperature_f');
}

function _updateUpcoming(hourly) {
  renderUpcoming(document.getElementById('upcoming-inner'), hourly);
}

function _updateRainRow(rainData, c) {
  const today = c?.rain_today_in ?? 0;
  const month = rainData.rain_month_in ?? 0;
  const year  = rainData.rain_year_in  ?? 0;
  document.getElementById('rain-totals').innerHTML =
    `<div class="rain-total"><div class="rain-val">${today.toFixed(2)}"</div><div class="rain-lbl">Today</div></div>` +
    `<div class="rain-total"><div class="rain-val">${month.toFixed(2)}"</div><div class="rain-lbl">Month</div></div>` +
    `<div class="rain-total"><div class="rain-val">${year.toFixed(2)}"</div><div class="rain-lbl">Year</div></div>`;
  updateBarSparkline(sp.rain, rainData.hourly_labels, rainData.hourly_rain_in);
}

function _updatePressureRow(c, histData) {
  const val = c.pressure_inhg;
  document.getElementById('pressure-val').innerHTML =
    val != null ? `${val.toFixed(2)}<span style="font-size:11px;color:#5a7fa8"> inHg</span>` : '—';

  const trendEl = document.getElementById('pressure-trend');
  const trend = c.pressure_trend ?? 'steady';
  const trendMap = {
    rising:  { sym: '▲', label: 'Rising',  desc: 'Improving',   cls: 'trend-rising'  },
    falling: { sym: '▼', label: 'Falling', desc: 'Worsening',   cls: 'trend-falling' },
    steady:  { sym: '►', label: 'Steady',  desc: 'No change',   cls: 'trend-steady'  },
  };
  const t = trendMap[trend] ?? trendMap.steady;

  const vals = (histData.pressure_inhg ?? []).filter(v => v != null);
  let lineColor = '#00e5b0';
  let deltaStr = '';
  if (vals.length >= 2) {
    const delta = vals[vals.length - 1] - vals[0];
    const abs = Math.abs(delta);
    if (abs > 0.30) {
      lineColor = '#ff4e4e';
    } else if (abs > 0.12) {
      lineColor = '#ffb347';
    }
    const sign = delta >= 0 ? '+' : '';
    deltaStr = ` <span style="color:${lineColor};font-size:9px">${sign}${delta.toFixed(2)}" / 6h</span>`;
  }

  trendEl.innerHTML = `${t.sym} ${t.label} <span style="color:#5a7fa8">· ${t.desc}</span>${deltaStr}`;
  trendEl.className = t.cls;

  sp.pressure.data.datasets[0].borderColor = lineColor;
  sp.pressure.data.datasets[0].backgroundColor = lineColor + '18';
  updateLineSparkline(sp.pressure, histData.labels, histData.pressure_inhg);
}

function _updateSolarRow(c, histData) {
  const uv  = c.uv_index;
  const sol = c.solar_radiation_wm2;

  document.getElementById('uv-val').innerHTML =
    `<div class="uv-num">UV ${uv != null ? uv.toFixed(0) : '—'}</div>` +
    `<div class="uv-cat">${_uvCategory(uv)}</div>`;
  uvGauge.update(uv ?? 0);

  document.getElementById('solar-val').innerHTML =
    `<div class="sol-num">${sol != null ? sol.toFixed(0) : '—'} W/m²</div>` +
    `<div class="sol-lbl">Solar</div>`;
  updateLineSparkline(sp.solar, histData.labels, histData.solar_radiation_wm2);
}

function _updateAqiRow(aqiData, c) {
  const aqi  = aqiData?.aqi;
  const cat  = aqiData?.category ?? '—';
  const color = AQI_COLORS[cat] ?? '#e8f0fe';

  aqiGauge.update(aqi ?? 0);

  document.getElementById('aqi-val').innerHTML =
    `<div class="aqi-num" style="color:${color}">${aqi ?? '—'}</div>` +
    `<div class="aqi-cat" style="color:${color}">${cat}</div>`;

  const pm  = aqiData?.pm25_aqi;
  const oz  = aqiData?.ozone_aqi;
  document.getElementById('aqi-pollutants').innerHTML =
    (pm  != null ? `PM2.5: ${pm}<br>` : '') +
    (oz  != null ? `O₃: ${oz}` : '');
}

function _updateLightningCompact(c) {
  const rate = c.lightning_count_1h ?? 0;
  const last = c.lightning_last_epoch;
  const lastStr = last
    ? `${c.lightning_last_distance_km ?? '?'} km · ${fmtAgo(last)}`
    : 'No recent strikes';
  document.getElementById('lightning-compact').innerHTML =
    `<span class="lc-rate">${rate}</span> <span style="color:#5a7fa8">/hr</span><br>${lastStr}`;
}

function _updateDailyRow(daily) {
  const container = document.getElementById('daily-cards-main');
  if (!container) return;
  container.innerHTML = '';
  const today = new Date().toDateString();
  daily.slice(0, 6).forEach(d => {
    const isToday = d.date_epoch
      ? new Date(d.date_epoch * 1000).toDateString() === today
      : false;
    const dayLabel = isToday ? 'Today' : (d.date_epoch
      ? new Date(d.date_epoch * 1000).toLocaleDateString('en-US', { weekday: 'short' })
      : '—');
    const card = document.createElement('div');
    card.className = 'main-day-card' + (isToday ? ' today-card' : '');
    card.innerHTML =
      `<div class="mdc-day">${dayLabel}</div>` +
      `<div class="mdc-icon">${iconEmoji(d.icon)}</div>` +
      `<div class="mdc-hilo">${d.high_f != null ? Math.round(d.high_f) : '—'}°` +
      `<span class="mdc-lo"> / ${d.low_f != null ? Math.round(d.low_f) : '—'}°</span></div>` +
      `<div class="mdc-rain">${d.precip_prob_pct ?? 0}%</div>`;
    container.appendChild(card);
  });
}

function _updateMoonMini(moon) {
  const el = document.getElementById('moon-mini');
  if (!el || !moon) return;
  el.innerHTML =
    `<div class="moon-emoji">${moon.emoji ?? '🌙'}</div>` +
    `<div class="moon-name">${moon.phase_name ?? '—'}</div>` +
    `<div class="moon-times">${moon.moonrise ?? '—'} ↑<br>${moon.moonset ?? '—'} ↓</div>`;
}

function _updateStatusBar(c) {
  const dot = document.getElementById('status-dot');
  const age = c.epoch ? Math.floor(Date.now() / 1000) - c.epoch : null;
  dot.className = 'dot' + (age == null || age > 180 ? ' stale' : '');
  document.getElementById('status-time').textContent = fmt12(c.epoch);
}

function _uvCategory(uv) {
  if (uv == null) return '—';
  if (uv < 3)  return 'Low';
  if (uv < 6)  return 'Moderate';
  if (uv < 8)  return 'High';
  if (uv < 11) return 'Very High';
  return 'Extreme';
}
