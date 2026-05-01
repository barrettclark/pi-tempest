/**
 * history.js — fetches all data in parallel and drives all chart/stat updates.
 *
 * Called on boot and every 60 seconds by app.js.
 */

import { renderCurrent, fetchStatus } from './current.js';
import {
  createTemperatureChart, updateTemperatureChart,
  createWindChart,        updateWindChart,
  createRainChart,        updateRainChart,
  createPressureChart,    updatePressureChart,
  createSolarChart,       updateSolarChart,
  createLightningChart,   updateLightningChart,
} from './charts.js';

// Chart instances (created once, updated in place)
const charts = {};

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json();
}

export async function renderAllRows() {
  // Fetch everything in parallel
  const [current, tempHist, windHist, rainHist, pressHist, solarHist, lightningHist, forecastData] =
    await Promise.allSettled([
      fetchJSON('/api/current'),
      fetchJSON('/api/history/temperature?hours=12'),
      fetchJSON('/api/history/wind?hours=12'),
      fetchJSON('/api/history/rain'),
      fetchJSON('/api/history/pressure?hours=12'),
      fetchJSON('/api/history/solar'),
      fetchJSON('/api/history/lightning?hours=24'),
      fetchJSON('/api/forecast'),
    ]);

  const ok = r => r.status === 'fulfilled' ? r.value : null;

  const cur      = ok(current);
  const temp     = ok(tempHist);
  const wind     = ok(windHist);
  const rain     = ok(rainHist);
  const pressure = ok(pressHist);
  const solar    = ok(solarHist);
  const lightning = ok(lightningHist);
  const forecast  = ok(forecastData);
  const hourly    = forecast?.hourly ?? [];

  // ── Current stat blocks ──────────────────────────────────
  if (cur) renderCurrent(cur);
  fetchStatus();

  // ── Temperature ──────────────────────────────────────────
  if (temp) {
    if (!charts.temp) charts.temp = createTemperatureChart('chart-temperature');
    updateTemperatureChart(charts.temp, temp, hourly);

    // Stat: 12h high/low
    const vals = temp.temperature_f.filter(v => v != null);
    if (vals.length) {
      const hi = Math.max(...vals);
      const lo = Math.min(...vals);
      _set('temp-range', `12h: ${lo}° – ${hi}°F`);
    }
  }

  // ── Wind ─────────────────────────────────────────────────
  if (wind) {
    if (!charts.wind) charts.wind = createWindChart('chart-wind');
    updateWindChart(charts.wind, wind, hourly);

    const gusts = wind.wind_gust_mph.filter(v => v != null);
    if (gusts.length) _set('wind-peak', `Peak gust ${Math.max(...gusts)} mph`);
  }

  // ── Rain ─────────────────────────────────────────────────
  if (rain) {
    if (!charts.rain) charts.rain = createRainChart('chart-rain');
    updateRainChart(charts.rain, rain, hourly);

    // Trim hourly_rain to last 12h for the chart x-axis alignment
    // (Rain chart uses its own time range from the API)
    const total = rain.hourly_rain_in.reduce((s, v) => s + (v || 0), 0);
    _set('rain-24h-total', `24h: ${total.toFixed(2)}"`);
  }

  // ── Pressure ─────────────────────────────────────────────
  if (pressure) {
    if (!charts.pressure) charts.pressure = createPressureChart('chart-pressure');
    updatePressureChart(charts.pressure, pressure);
  }

  // ── Solar / UV ───────────────────────────────────────────
  if (solar) {
    if (!charts.solar) charts.solar = createSolarChart('chart-solar');
    updateSolarChart(charts.solar, solar, hourly);

    const peakSolar = Math.max(...solar.solar_radiation_wm2.filter(v => v != null), 0);
    const peakUV    = Math.max(...solar.uv_index.filter(v => v != null), 0);
    if (peakSolar > 0) _set('solar-peak', `Peak ${Math.round(peakSolar)} W/m²`);
    if (peakUV > 0)    _set('uv-peak', `Peak UV ${peakUV.toFixed(1)}`);
  }

  // ── Lightning ────────────────────────────────────────────
  if (lightning) {
    if (!charts.lightning) charts.lightning = createLightningChart('chart-lightning');
    updateLightningChart(charts.lightning, lightning);
  }
}

function _set(id, val) {
  const el = document.getElementById(id);
  if (el && val != null) el.textContent = val;
}
