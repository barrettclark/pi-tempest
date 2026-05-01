/**
 * charts.js — Chart.js configuration for all six metric rows.
 *
 * The key pattern is a "blended" chart that shows:
 *   - Left of NOW:  historical data (solid line / opaque bars)
 *   - NOW marker:   dashed vertical white line
 *   - Right of NOW: forecast data (dashed line / translucent bars)
 *
 * Charts are created with Chart.js using numeric epoch x-values.
 * A shared custom plugin draws the NOW line on every chart.
 */

// ── Palette ────────────────────────────────────────────────
const C = {
  accent:    '#00c8ff',
  accent2:   '#00e5b0',
  warn:      '#ffb347',
  solar:     '#ffd166',
  rain:      '#74b0ff',
  pink:      '#ff6b9d',
  dim:       '#5a7fa8',
  grid:      '#162d4a',
  text:      '#e8f0fe',
  forecast:  'rgba(255,255,255,0.55)',
  nowLine:   'rgba(255,255,255,0.7)',
};

Chart.defaults.color = C.dim;
Chart.defaults.borderColor = C.grid;
Chart.defaults.font.family = "'Segoe UI', system-ui, sans-serif";
Chart.defaults.font.size = 10;

// ── NOW-line plugin ────────────────────────────────────────
const nowLinePlugin = {
  id: 'nowLine',
  afterDraw(chart) {
    const { ctx, chartArea: ca, scales } = chart;
    if (!ca || !scales.x) return;
    const nowEpoch = Math.floor(Date.now() / 1000);
    const x = scales.x.getPixelForValue(nowEpoch);
    if (x < ca.left || x > ca.right) return;

    ctx.save();
    ctx.strokeStyle = C.nowLine;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, ca.top);
    ctx.lineTo(x, ca.bottom);
    ctx.stroke();

    // "NOW" label
    ctx.fillStyle = C.nowLine;
    ctx.font = `bold 9px 'Segoe UI', sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('NOW', x, ca.top - 2);
    ctx.restore();
  },
};
Chart.register(nowLinePlugin);

// ── Shared helpers ─────────────────────────────────────────
function epochLabel(epoch) {
  return new Date(epoch * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function xTickCallback(val, idx, ticks) {
  // Show roughly 6 labels; skip others
  const step = Math.max(1, Math.floor(ticks.length / 6));
  return idx % step === 0 ? epochLabel(val) : '';
}

const BASE = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 250 },
  interaction: { mode: 'nearest', intersect: false, axis: 'x' },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#0d1e35',
      borderColor: C.grid,
      borderWidth: 1,
      titleColor: C.dim,
      bodyColor: C.text,
      padding: 8,
      callbacks: {
        title: items => epochLabel(items[0].parsed.x),
      },
    },
  },
  scales: {
    x: {
      type: 'linear',
      grid: { color: C.grid, lineWidth: 0.5 },
      ticks: { color: C.dim, maxRotation: 0, callback: xTickCallback, font: { size: 10 } },
    },
    y: {
      grid: { color: C.grid, lineWidth: 0.5 },
      ticks: { color: C.dim, font: { size: 10 }, maxTicksLimit: 4 },
    },
  },
};

function merge(base, over) {
  const out = structuredClone(base);
  function deep(dst, src) {
    for (const k in src) {
      if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) {
        dst[k] = dst[k] || {};
        deep(dst[k], src[k]);
      } else {
        dst[k] = src[k];
      }
    }
  }
  deep(out, over);
  return out;
}

// ── Point-format helpers ───────────────────────────────────
// Chart.js line datasets use {x: epoch, y: value} point objects
// so both actual and forecast can share one linear x scale.

function toPoints(labels, values) {
  return labels.map((x, i) => ({ x, y: values[i] }));
}

function forecastPoints(hourly, field) {
  return hourly.map(h => ({ x: h.time, y: h[field] ?? null }));
}


// ══════════════════════════════════════════════════════════
// TEMPERATURE
// ══════════════════════════════════════════════════════════
export function createTemperatureChart(canvasId) {
  return new Chart(document.getElementById(canvasId), merge(BASE, {
    type: 'line',
    data: {
      datasets: [
        // Actual temperature
        {
          label: 'Actual °F',
          data: [],
          borderColor: C.accent,
          backgroundColor: 'rgba(0,200,255,0.08)',
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 2,
          order: 2,
        },
        // Forecast temperature
        {
          label: 'Forecast °F',
          data: [],
          borderColor: C.forecast,
          backgroundColor: 'rgba(255,255,255,0.04)',
          fill: false,
          tension: 0.4,
          pointRadius: 3,
          pointBackgroundColor: C.forecast,
          borderWidth: 1.5,
          borderDash: [5, 4],
          order: 1,
        },
        // Actual dew point
        {
          label: 'Dew Pt °F',
          data: [],
          borderColor: C.accent2,
          fill: false,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 1,
          borderDash: [3, 4],
          order: 3,
        },
      ],
    },
    options: {
      scales: {
        y: { ticks: { callback: v => `${v}°` } },
      },
    },
  }));
}

export function updateTemperatureChart(chart, histData, forecast) {
  chart.data.datasets[0].data = toPoints(histData.labels, histData.temperature_f);
  chart.data.datasets[1].data = forecastPoints(forecast, 'temperature_f');
  chart.data.datasets[2].data = toPoints(histData.labels, histData.dew_point_f);
  chart.update('none');
}


// ══════════════════════════════════════════════════════════
// WIND
// ══════════════════════════════════════════════════════════
export function createWindChart(canvasId) {
  return new Chart(document.getElementById(canvasId), merge(BASE, {
    type: 'line',
    data: {
      datasets: [
        // Actual gust
        {
          label: 'Gust',
          data: [],
          borderColor: C.warn,
          fill: false,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 1.5,
          borderDash: [4, 3],
          order: 3,
        },
        // Actual avg (filled)
        {
          label: 'Avg',
          data: [],
          borderColor: C.accent,
          backgroundColor: 'rgba(0,200,255,0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 2,
          order: 2,
        },
        // Forecast wind avg
        {
          label: 'Forecast',
          data: [],
          borderColor: C.forecast,
          fill: false,
          tension: 0.3,
          pointRadius: 3,
          pointBackgroundColor: C.forecast,
          borderWidth: 1.5,
          borderDash: [5, 4],
          order: 1,
        },
      ],
    },
    options: {
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => `${v}` } },
      },
    },
  }));
}

export function updateWindChart(chart, histData, forecast) {
  chart.data.datasets[0].data = toPoints(histData.labels, histData.wind_gust_mph);
  chart.data.datasets[1].data = toPoints(histData.labels, histData.wind_avg_mph);
  chart.data.datasets[2].data = forecastPoints(forecast, 'wind_avg_mph');
  chart.update('none');
}


// ══════════════════════════════════════════════════════════
// RAIN — bar chart: actual hourly bars + forecast prob line
// ══════════════════════════════════════════════════════════
export function createRainChart(canvasId) {
  return new Chart(document.getElementById(canvasId), merge(BASE, {
    type: 'bar',
    data: {
      datasets: [
        // Actual hourly rain (bars)
        {
          label: 'Rain (in)',
          data: [],
          backgroundColor: C.rain,
          borderRadius: 2,
          barPercentage: 0.8,
          order: 2,
          type: 'bar',
        },
        // Forecast precip probability (line on secondary axis)
        {
          label: 'Chance %',
          data: [],
          borderColor: C.forecast,
          backgroundColor: 'rgba(255,255,255,0.06)',
          fill: true,
          tension: 0.4,
          pointRadius: 2,
          pointBackgroundColor: C.forecast,
          borderWidth: 1.5,
          borderDash: [5, 4],
          order: 1,
          type: 'line',
          yAxisID: 'y2',
        },
      ],
    },
    options: {
      scales: {
        x: { offset: true },
        y: {
          beginAtZero: true,
          ticks: { callback: v => `${v}"`, maxTicksLimit: 4 },
          title: { display: false },
        },
        y2: {
          position: 'right',
          beginAtZero: true,
          max: 100,
          grid: { drawOnChartArea: false },
          ticks: { callback: v => `${v}%`, maxTicksLimit: 3, color: 'rgba(255,255,255,0.3)' },
        },
      },
    },
  }));
}

export function updateRainChart(chart, histData, forecast) {
  // Actual: hourly buckets from history API
  chart.data.datasets[0].data = histData.hourly_labels.map((x, i) => ({
    x, y: histData.hourly_rain_in[i],
  }));

  // Forecast probability as points
  chart.data.datasets[1].data = forecast.map(h => ({
    x: h.time,
    y: h.precip_prob_pct ?? 0,
  }));

  chart.update('none');
}


// ══════════════════════════════════════════════════════════
// PRESSURE — history only (no hourly forecast available)
// ══════════════════════════════════════════════════════════
export function createPressureChart(canvasId) {
  return new Chart(document.getElementById(canvasId), merge(BASE, {
    type: 'line',
    data: {
      datasets: [{
        label: 'Pressure inHg',
        data: [],
        borderColor: C.warn,
        backgroundColor: 'rgba(255,179,71,0.07)',
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        borderWidth: 2,
      }],
    },
    options: {
      scales: {
        y: { ticks: { callback: v => `${v}"`, maxTicksLimit: 4 } },
      },
    },
  }));
}

export function updatePressureChart(chart, histData) {
  chart.data.datasets[0].data = toPoints(histData.labels, histData.pressure_inhg);
  chart.update('none');
}


// ══════════════════════════════════════════════════════════
// SOLAR / UV — today actual + forecast UV
// ══════════════════════════════════════════════════════════
export function createSolarChart(canvasId) {
  return new Chart(document.getElementById(canvasId), merge(BASE, {
    type: 'line',
    data: {
      datasets: [
        // Actual solar radiation
        {
          label: 'Solar W/m²',
          data: [],
          borderColor: C.solar,
          backgroundColor: 'rgba(255,209,102,0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 2,
          yAxisID: 'y',
          order: 2,
        },
        // Forecast UV
        {
          label: 'Forecast UV',
          data: [],
          borderColor: C.pink,
          fill: false,
          tension: 0.4,
          pointRadius: 3,
          pointBackgroundColor: C.pink,
          borderWidth: 1.5,
          borderDash: [5, 4],
          yAxisID: 'y2',
          order: 1,
        },
        // Actual UV
        {
          label: 'Actual UV',
          data: [],
          borderColor: 'rgba(255,107,157,0.5)',
          fill: false,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 1,
          yAxisID: 'y2',
          order: 3,
        },
      ],
    },
    options: {
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: v => `${v}`, maxTicksLimit: 4 },
        },
        y2: {
          position: 'right',
          beginAtZero: true,
          grid: { drawOnChartArea: false },
          ticks: { callback: v => `UV${v}`, maxTicksLimit: 4, color: 'rgba(255,107,157,0.6)' },
        },
      },
    },
  }));
}

export function updateSolarChart(chart, histData, forecast) {
  chart.data.datasets[0].data = toPoints(histData.labels, histData.solar_radiation_wm2);
  chart.data.datasets[1].data = forecastPoints(forecast, 'uv_index');
  chart.data.datasets[2].data = toPoints(histData.labels, histData.uv_index);
  chart.update('none');
}


// ══════════════════════════════════════════════════════════
// LIGHTNING — 24h hourly bars, history only
// ══════════════════════════════════════════════════════════
export function createLightningChart(canvasId) {
  return new Chart(document.getElementById(canvasId), merge(BASE, {
    type: 'bar',
    data: {
      datasets: [{
        label: 'Strikes/hr',
        data: [],
        backgroundColor: 'rgba(255,179,71,0.65)',
        borderColor: C.warn,
        borderWidth: 1,
        borderRadius: 2,
        barPercentage: 0.9,
      }],
    },
    options: {
      scales: {
        x: { offset: true },
        y: { beginAtZero: true, ticks: { stepSize: 1, maxTicksLimit: 3 } },
      },
    },
  }));
}

export function updateLightningChart(chart, histData) {
  chart.data.datasets[0].data = histData.labels.map((x, i) => ({
    x, y: histData.strike_count[i],
  }));
  chart.update('none');
}
