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

export function createLineSparkline(canvasEl, color, fill = true) {
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
    options: BASE_OPTS,
  });
}

export function createBarSparkline(canvasEl, color) {
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
    options: BASE_OPTS,
  });
}

export function createBlendedSparkline(canvasEl) {
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
    options: BASE_OPTS,
  });
}

export function updateLineSparkline(chart, labels, values) {
  chart.data.datasets[0].data = labels.map((x, i) => ({ x, y: values[i] }));
  chart.update('none');
}

export function updateBarSparkline(chart, labels, values) {
  chart.data.datasets[0].data = labels.map((x, i) => ({ x, y: values[i] }));
  chart.update('none');
}

export function updateBlendedSparkline(chart, histLabels, histValues, forecastHourly, field) {
  chart.data.datasets[0].data = histLabels.map((x, i) => ({ x, y: histValues[i] }));
  chart.data.datasets[1].data = (forecastHourly || []).map(h => ({ x: h.time, y: h[field] ?? null }));
  chart.update('none');
}
