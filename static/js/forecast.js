import { iconEmoji } from './icons.js';

function fmt12h(epoch) {
  if (!epoch) return '—';
  return new Date(epoch * 1000).toLocaleTimeString('en-US', {
    hour: 'numeric', hour12: true,
  });
}

function fmtDay(epoch) {
  if (!epoch) return '—';
  const d = new Date(epoch * 1000);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function precip_bar_html(pct, cssClass) {
  const w = Math.min(100, pct ?? 0);
  return `<div class="${cssClass}"><div class="${cssClass}-fill" style="width:${w}%"></div></div>`;
}

function _renderHourly(hourly) {
  const container = document.getElementById('hourly-cards');
  if (!container) return;
  container.innerHTML = '';

  const now = Math.floor(Date.now() / 1000);
  const cols = hourly.slice(0, 10);

  cols.forEach((h, i) => {
    const card = document.createElement('div');
    const isFirst = i === 0 && h.time <= now + 3600;
    card.className = 'hour-card' + (isFirst ? ' now-card' : '');
    card.innerHTML = `
      <div class="hc-time">${isFirst ? 'Now' : fmt12h(h.time)}</div>
      <div class="hc-icon">${iconEmoji(h.icon)}</div>
      <div class="hc-temp">${h.temperature_f != null ? Math.round(h.temperature_f) + '°' : '—'}</div>
      ${precip_bar_html(h.precip_prob_pct, 'hc-bar')}
      <div class="hc-rain">${h.precip_prob_pct ?? 0}%</div>
      <div class="hc-wind">${h.wind_avg_mph != null ? h.wind_avg_mph.toFixed(0) : '—'} ${h.wind_direction_cardinal ?? ''}</div>
    `;
    container.appendChild(card);
  });
}

function _renderDaily(daily) {
  const container = document.getElementById('daily-cards');
  if (!container) return;
  container.innerHTML = '';

  const today = new Date().toDateString();

  daily.slice(0, 6).forEach(d => {
    const isToday = d.date_epoch
      ? new Date(d.date_epoch * 1000).toDateString() === today
      : false;
    const card = document.createElement('div');
    card.className = 'day-card' + (isToday ? ' today-card' : '');
    card.innerHTML = `
      <div class="dc-day">${fmtDay(d.date_epoch)}</div>
      <div class="dc-icon">${iconEmoji(d.icon)}</div>
      <div class="dc-hilo">
        <span class="dc-hi">${d.high_f != null ? Math.round(d.high_f) + '°' : '—'}</span>
        <span class="dc-lo">${d.low_f  != null ? Math.round(d.low_f)  + '°' : '—'}</span>
      </div>
      ${precip_bar_html(d.precip_prob_pct, 'dc-bar')}
      <div class="dc-rain">${d.precip_prob_pct ?? 0}%</div>
      <div class="dc-wind">${d.wind_avg_mph != null ? d.wind_avg_mph.toFixed(0) : '—'} ${d.wind_direction_cardinal ?? ''}</div>
    `;
    container.appendChild(card);
  });
}

function _renderMoon(moon) {
  const panel = document.getElementById('moon-panel');
  if (!panel) return;
  panel.innerHTML = `
    <div class="moon-section-label">Moon</div>
    <div id="moon-glyph">${moon.emoji ?? '🌙'}</div>
    <div id="moon-phase">${moon.phase_name ?? '—'}</div>
    <div id="moon-illum">${moon.illumination_pct != null ? moon.illumination_pct.toFixed(0) + '% illuminated' : '—'}</div>
    <div class="moon-times">
      <div class="moon-time-row">
        <span class="moon-time-lbl">Moonrise</span>
        <span class="moon-time-val">${moon.moonrise ?? '—'}</span>
      </div>
      <div class="moon-time-row">
        <span class="moon-time-lbl">Moonset</span>
        <span class="moon-time-val">${moon.moonset ?? '—'}</span>
      </div>
    </div>
    <div class="moon-divider"></div>
    <div class="moon-next">
      <div class="moon-next-row">
        <span class="moon-next-lbl">Full Moon</span>
        <span class="moon-next-val">${moon.next_full_moon ?? '—'}</span>
      </div>
      <div class="moon-next-row">
        <span class="moon-next-lbl">New Moon</span>
        <span class="moon-next-val">${moon.next_new_moon ?? '—'}</span>
      </div>
    </div>
  `;
}

export async function refreshForecast() {
  const [fcResult, moonResult] = await Promise.allSettled([
    fetch('/api/forecast').then(r => r.json()),
    fetch('/api/moon').then(r => r.json()),
  ]);

  if (fcResult.status === 'fulfilled') {
    _renderHourly(fcResult.value.hourly ?? []);
    _renderDaily(fcResult.value.daily ?? []);
  }

  if (moonResult.status === 'fulfilled') {
    _renderMoon(moonResult.value);
  }
}
