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

export function updateLineSparkline(chart, labels, values) {
  chart.data.datasets[0].data = labels.map((x, i) => ({ x, y: values[i] }));
  chart.update('none');
}
