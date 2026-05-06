const _sparkMinMaxPlugin = {
  id: 'sparkMinMax',
  afterDraw(chart) {
    try {
      const fmt = chart.options.sparkFormat;
      if (!fmt) return;
      const allVals = chart.data.datasets
        .flatMap(ds => ds.data.map(d => (d != null && typeof d === 'object' ? d.y : d)))
        .filter(v => typeof v === 'number' && isFinite(v));
      if (allVals.length < 2) return;
      const max = Math.max(...allVals);
      const min = Math.min(...allVals);
      if (max === min) return;
      const { ctx, chartArea, scales } = chart;
      if (!scales?.y) return;
      const maxY = scales.y.getPixelForValue(max);
      const minY = scales.y.getPixelForValue(min);
      const rightX = chartArea.right - 2;
      ctx.save();
      ctx.font = '8px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(90, 127, 168, 0.9)';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(fmt(max), rightX, maxY);
      ctx.textBaseline = 'top';
      ctx.fillText(fmt(min), rightX, minY);
      ctx.restore();
    } catch (_) {}
  },
};
if (typeof Chart !== 'undefined') Chart.register(_sparkMinMaxPlugin);

const _C_GRID = 'rgba(90,127,168,0.12)';
const _C_TICK = 'rgba(90,127,168,0.85)';

const _nowLinePlugin = {
  id: 'nowLine',
  afterDraw(chart) {
    try {
      if (!chart.options.showNowLine) return;
      const { ctx, chartArea, scales } = chart;
      if (!scales?.x) return;
      const now = Math.floor(Date.now() / 1000);
      const xPx = scales.x.getPixelForValue(now);
      if (xPx < chartArea.left || xPx > chartArea.right) return;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(xPx, chartArea.top);
      ctx.lineTo(xPx, chartArea.bottom);
      ctx.stroke();
      ctx.restore();
    } catch (_) {}
  },
};
if (typeof Chart !== 'undefined') Chart.register(_nowLinePlugin);

const BASE_OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  plugins: {
    legend:  { display: false },
    tooltip: { enabled: false },
  },
  scales: {
    x: { display: false, type: 'linear' },
    y: { display: false },
  },
};

export function createLineSparkline(canvasEl, color, fill = true, format = null) {
  return new Chart(canvasEl, {
    type: 'line',
    data: {
      datasets: [{
        data: [],
        borderColor: color,
        backgroundColor: color + '18',
        fill,
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.4,
      }],
    },
    options: { ...BASE_OPTS, sparkFormat: format },
  });
}

export function createBarSparkline(canvasEl, color, showYAxis = false) {
  const scales = showYAxis ? {
    x: { display: false, type: 'linear' },
    y: {
      display: true,
      position: 'right',
      grid: { color: _C_GRID, drawBorder: false },
      border: { display: false },
      ticks: {
        color: _C_TICK,
        font: { size: 8 },
        maxTicksLimit: 3,
        callback: v => v > 0 ? `${v}"` : '',
      },
    },
  } : BASE_OPTS.scales;

  return new Chart(canvasEl, {
    type: 'bar',
    data: {
      datasets: [{
        data: [],
        backgroundColor: color,
        borderRadius: 1,
        barPercentage: 0.8,
        maxBarThickness: 10,
      }],
    },
    options: { ...BASE_OPTS, scales },
  });
}

export function createBlendedSparkline(canvasEl, format = null, showAxes = false) {
  const scales = showAxes ? {
    x: {
      type: 'linear',
      display: true,
      grid: { color: _C_GRID, drawBorder: false },
      border: { display: false },
      ticks: {
        color: _C_TICK,
        font: { size: 8 },
        maxTicksLimit: 7,
        callback(val) {
          const now = Math.floor(Date.now() / 1000);
          if (Math.abs(val - now) < 900) return 'Now';
          return new Date(val * 1000).toLocaleTimeString('en-US', {
            hour: 'numeric', hour12: true,
          });
        },
      },
    },
    y: {
      display: true,
      position: 'left',
      grid: { color: _C_GRID, drawBorder: false },
      border: { display: false },
      ticks: {
        color: _C_TICK,
        font: { size: 8 },
        maxTicksLimit: 5,
        callback: v => `${v}°`,
      },
    },
  } : BASE_OPTS.scales;

  return new Chart(canvasEl, {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'actual',
          data: [],
          borderColor: '#00c8ff',
          backgroundColor: 'rgba(0,200,255,0.08)',
          fill: true,
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.4,
        },
        {
          label: 'forecast',
          data: [],
          borderColor: 'rgba(255,255,255,0.35)',
          fill: false,
          borderWidth: 1.5,
          borderDash: [4, 3],
          pointRadius: 0,
          tension: 0.4,
        },
      ],
    },
    options: { ...BASE_OPTS, sparkFormat: format, showNowLine: showAxes, scales },
  });
}

export function updateLineSparkline(chart, labels, values) {
  chart.data.datasets[0].data = labels.map((x, i) => ({ x, y: values[i] }));
  chart.update('none');
}

export function updateBarSparkline(chart, labels, values, colorFn = null) {
  const pts = labels.map((x, i) => ({ x, y: values[i] }));
  chart.data.datasets[0].data = pts;
  if (colorFn) chart.data.datasets[0].backgroundColor = pts.map(p => colorFn(p.y));
  chart.update('none');
}

export function updateBlendedSparkline(chart, histLabels, histValues, forecastHourly, field) {
  const actual   = histLabels
    .map((x, i) => ({ x, y: histValues[i] }))
    .filter(pt => pt.y != null);
  const forecast = (forecastHourly || [])
    .map(h => ({ x: h.time, y: h[field] ?? null }))
    .filter(pt => pt.y != null);

  chart.data.datasets[0].data = actual;
  chart.data.datasets[1].data = forecast;

  const allX = [...actual, ...forecast].map(p => p.x);
  if (allX.length) {
    chart.options.scales.x.min = Math.min(...allX);
    chart.options.scales.x.max = Math.max(...allX);
  }

  chart.update('none');
}
