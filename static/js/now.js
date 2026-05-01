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

  sp.temp     = createBlendedSparkline(document.getElementById('sp-temp'));
  sp.rain     = createBarSparkline(document.getElementById('sp-rain'),     '#74b0ff');
  sp.pressure = createLineSparkline(document.getElementById('sp-pressure'),'#00e5b0', false);
  sp.solar    = createLineSparkline(document.getElementById('sp-solar'),   '#ffd166', true);
}

export async function refreshNow() {
  const [cur, tempH, rainH, pressH, solarH, forecast, aqi] = await Promise.allSettled([
    fetch('/api/current').then(r => r.json()),
    fetch('/api/history/temperature?hours=24').then(r => r.json()),
    fetch('/api/history/rain').then(r => r.json()),
    fetch('/api/history/pressure?hours=6').then(r => r.json()),
    fetch('/api/history/solar').then(r => r.json()),
    fetch('/api/forecast').then(r => r.json()),
    fetch('/api/aqi').then(r => r.json()),
  ]);

  const c = cur.status === 'fulfilled' ? cur.value : null;
  const fc = forecast.status === 'fulfilled' ? forecast.value : { hourly: [], daily: [] };

  if (c) {
    _updateLeft(c);
    _updateStatusBar(c);
  }

  if (c && tempH.status === 'fulfilled') {
    _updateTempRow(c, tempH.value, fc.hourly);
  }

  _updateUpcoming(fc.hourly);

  if (rainH.status === 'fulfilled') _updateRainRow(rainH.value, c);
  if (c && pressH.status === 'fulfilled') _updatePressureRow(c, pressH.value);
  if (c && solarH.status === 'fulfilled') _updateSolarRow(c, solarH.value);
  if (aqi.status === 'fulfilled') _updateAqiRow(aqi.value, c);
  if (c) _updateLightningRow(c);
}

function _updateLeft(c) {
  document.getElementById('cond-icon').textContent = iconEmoji(null);
  document.getElementById('cond-desc').textContent = '';
  document.getElementById('now-temp').textContent =
    c.temperature_f != null ? `${c.temperature_f.toFixed(1)}°` : '—';
  document.getElementById('now-sublabel').textContent =
    `Feels ${c.feels_like_f?.toFixed(0) ?? '—'}°  ·  Dew ${c.dew_point_f?.toFixed(0) ?? '—'}°  ·  ${c.humidity_pct?.toFixed(0) ?? '—'}%`;

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

function _updateTempRow(c, histData, hourly) {
  document.getElementById('temp-val').textContent =
    c.temperature_f != null ? `${c.temperature_f.toFixed(1)}°F` : '—';

  const temps = histData.temperature_f?.filter(t => t != null) ?? [];
  const hi = temps.length ? Math.max(...temps).toFixed(1) : '—';
  const lo = temps.length ? Math.min(...temps).toFixed(1) : '—';
  document.getElementById('temp-meta').textContent =
    `Hi ${hi}°  ·  Lo ${lo}°`;

  updateBlendedSparkline(sp.temp, histData.labels, histData.temperature_f, hourly, 'temperature_f');
}

function _updateUpcoming(hourly) {
  renderUpcoming(document.getElementById('upcoming-inner'), hourly);
}

function _updateRainRow(rainData, c) {
  const today = c?.rain_today_in ?? 0;
  const html = [
    `<div class="rain-total"><div class="rain-val">${today.toFixed(2)}"</div><div class="rain-lbl">Today</div></div>`,
  ].join('');
  document.getElementById('rain-totals').innerHTML = html;
  updateBarSparkline(sp.rain, rainData.hourly_labels, rainData.hourly_rain_in);
}

function _updatePressureRow(c, histData) {
  const val = c.pressure_inhg;
  document.getElementById('pressure-val').innerHTML =
    val != null ? `${val.toFixed(2)}<span style="font-size:11px;color:#5a7fa8"> inHg</span>` : '—';

  const trendEl = document.getElementById('pressure-trend');
  const trend = c.pressure_trend ?? 'steady';
  const trendMap = { rising: '▲ Rising', falling: '▼ Falling', steady: '► Steady' };
  const classMap = { rising: 'trend-rising', falling: 'trend-falling', steady: 'trend-steady' };
  trendEl.textContent = trendMap[trend] ?? '► Steady';
  trendEl.className = classMap[trend] ?? 'trend-steady';

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

function _updateLightningRow(c) {
  document.getElementById('lightning-rate').textContent =
    `${c.lightning_count_1h ?? 0} /hr`;
  const last = c.lightning_last_epoch;
  document.getElementById('lightning-last').textContent = last
    ? `Last: ${c.lightning_last_distance_km ?? '?'} km · ${fmtAgo(last)}`
    : 'No recent strikes';
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
