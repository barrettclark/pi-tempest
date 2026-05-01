import { iconEmoji } from './icons.js';

function fmt12h(epoch) {
  return new Date(epoch * 1000).toLocaleTimeString('en-US', {
    hour: 'numeric', hour12: true,
  });
}

function isNight(epoch) {
  const h = new Date(epoch * 1000).getHours();
  return h < 6 || h >= 20;
}

export function renderUpcoming(containerEl, hourly) {
  if (!containerEl) return;
  containerEl.innerHTML = '';

  const cols = hourly.slice(0, 9);
  if (cols.length === 0) return;

  const W = containerEl.offsetWidth || 764;
  const H = containerEl.offsetHeight || 130;
  const colW = W / cols.length;

  const colsDiv = document.createElement('div');
  colsDiv.style.cssText = 'position:absolute;inset:0;display:flex;';

  cols.forEach((h, i) => {
    const col = document.createElement('div');
    col.style.cssText = [
      'flex:1;display:flex;flex-direction:column;align-items:center;',
      'padding-top:18px;gap:3px;position:relative;overflow:hidden;',
      isNight(h.time) ? 'background:rgba(0,0,0,0.18);' : '',
      i === 0 ? 'background:rgba(0,200,255,0.06);' : '',
    ].join('');

    const timeEl = document.createElement('div');
    timeEl.style.cssText = `font-size:10px;font-weight:700;color:${i===0?'#00c8ff':'#5a7fa8'};white-space:nowrap;`;
    timeEl.textContent = i === 0 ? 'Now' : fmt12h(h.time);

    const iconEl = document.createElement('div');
    iconEl.style.cssText = 'font-size:20px;line-height:1;';
    iconEl.textContent = iconEmoji(h.icon);

    const tempEl = document.createElement('div');
    tempEl.style.cssText = 'font-size:16px;font-weight:200;color:#e8f0fe;line-height:1;';
    tempEl.textContent = h.temperature_f != null ? `${Math.round(h.temperature_f)}°` : '—';

    const rainEl = document.createElement('div');
    rainEl.style.cssText = 'font-size:9px;color:#74b0ff;';
    rainEl.textContent = `${h.precip_prob_pct ?? 0}%`;

    col.append(timeEl, iconEl, tempEl, rainEl);
    colsDiv.appendChild(col);
  });
  containerEl.appendChild(colsDiv);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} 52`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.style.cssText = `position:absolute;bottom:0;left:0;width:${W}px;height:52px;pointer-events:none;`;

  const temps = cols.map(h => h.temperature_f).filter(t => t != null);
  if (temps.length < 2) { containerEl.appendChild(svg); return; }

  const minT = Math.min(...temps) - 3;
  const maxT = Math.max(...temps) + 3;
  const toY  = t => t != null ? 48 - ((t - minT) / (maxT - minT)) * 44 : null;
  const toX  = i => i * colW + colW / 2;

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  grad.setAttribute('id', 'rainGrad');
  grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0');
  grad.setAttribute('x2', '0'); grad.setAttribute('y2', '1');
  const s1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  s1.setAttribute('offset', '0%'); s1.setAttribute('stop-color', '#74b0ff'); s1.setAttribute('stop-opacity', '0.35');
  const s2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  s2.setAttribute('offset', '100%'); s2.setAttribute('stop-color', '#74b0ff'); s2.setAttribute('stop-opacity', '0.05');
  grad.append(s1, s2);
  defs.appendChild(grad);
  svg.appendChild(defs);

  const maxRain = 100;
  const rainPts = cols.map((h, i) => {
    const prob = h.precip_prob_pct ?? 0;
    const y = 52 - (prob / maxRain) * 20;
    return `${toX(i).toFixed(1)},${y.toFixed(1)}`;
  });
  const rainPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  rainPath.setAttribute('d', `M0,52 L${rainPts[0]} ${rainPts.slice(1).map((p,i)=>`L${p}`).join(' ')} L${W},52 Z`);
  rainPath.setAttribute('fill', 'url(#rainGrad)');
  svg.appendChild(rainPath);

  const points = cols.map((h, i) => {
    const y = toY(h.temperature_f);
    return y != null ? `${toX(i).toFixed(1)},${y.toFixed(1)}` : null;
  }).filter(Boolean);

  if (points.length > 1) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', '#e87070');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-linejoin', 'round');
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('points', points.join(' '));
    svg.appendChild(line);

    cols.forEach((h, i) => {
      const y = toY(h.temperature_f);
      if (y == null) return;
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', toX(i).toFixed(1));
      c.setAttribute('cy', y.toFixed(1));
      c.setAttribute('r', '3');
      c.setAttribute('fill', '#0a1628');
      c.setAttribute('stroke', '#e87070');
      c.setAttribute('stroke-width', '1.5');
      svg.appendChild(c);
    });
  }

  containerEl.appendChild(svg);
}
