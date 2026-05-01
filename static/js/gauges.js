export class WindGauge {
  constructor(svgEl) {
    this.svg = svgEl;
    this._build();
  }

  _build() {
    this.svg.innerHTML = `
      <circle cx="62" cy="62" r="58" fill="none" stroke="#162d4a" stroke-width="1.5"/>
      <text x="62" y="12" text-anchor="middle" fill="#5a7fa8" font-size="10" font-family="'Segoe UI',sans-serif">N</text>
      <text x="114" y="66" text-anchor="middle" fill="#5a7fa8" font-size="10" font-family="'Segoe UI',sans-serif">E</text>
      <text x="62" y="118" text-anchor="middle" fill="#5a7fa8" font-size="10" font-family="'Segoe UI',sans-serif">S</text>
      <text x="10" y="66" text-anchor="middle" fill="#5a7fa8" font-size="10" font-family="'Segoe UI',sans-serif">W</text>
      <line id="wg-needle" x1="62" y1="62" x2="62" y2="16"
        stroke="#00c8ff" stroke-width="2" stroke-linecap="round"/>
      <circle cx="62" cy="62" r="5" fill="#0a1628" stroke="#00c8ff" stroke-width="1.5"/>
      <text id="wg-dir" x="62" y="46" text-anchor="middle"
        fill="#00c8ff" font-size="13" font-weight="300"
        font-family="'Segoe UI',sans-serif">—</text>
      <text id="wg-speed" x="62" y="68" text-anchor="middle"
        fill="#e8f0fe" font-size="24" font-weight="200"
        font-family="'Segoe UI',sans-serif">—</text>
      <text x="62" y="80" text-anchor="middle"
        fill="#5a7fa8" font-size="9" font-family="'Segoe UI',sans-serif">mph avg</text>
    `;
    this._needle = this.svg.getElementById('wg-needle');
    this._dir    = this.svg.getElementById('wg-dir');
    this._speed  = this.svg.getElementById('wg-speed');
  }

  update({ direction_deg, avg_mph, cardinal }) {
    const deg = direction_deg ?? 0;
    this._needle.setAttribute('transform', `rotate(${deg}, 62, 62)`);
    this._dir.textContent   = cardinal ?? '—';
    this._speed.textContent = avg_mph != null ? avg_mph.toFixed(1) : '—';
  }
}


export class MiniArcGauge {
  // 270° gauge (open at bottom). r=20, circumference=125.66
  // Arc spans from 135° to 45° (clockwise). Max fill = 94.25px.
  // dashoffset = -47.12 rotates start to 135° position.
  static _C   = 125.66;   // 2π×20
  static _MAX = 94.25;    // 270/360 × 125.66
  static _OFF = -47.12;   // 135/360 × 125.66, negated

  constructor(svgEl, { max, color }) {
    this.svg   = svgEl;
    this.max   = max;
    this.color = color;
    this._build();
  }

  _build() {
    this.svg.innerHTML = `
      <circle cx="26" cy="26" r="20" fill="none" stroke="#162d4a" stroke-width="5"/>
      <circle id="mag-arc" cx="26" cy="26" r="20" fill="none"
        stroke="${this.color}" stroke-width="5"
        stroke-dasharray="0 ${MiniArcGauge._C}"
        stroke-dashoffset="${MiniArcGauge._OFF}"
        stroke-linecap="round"/>
      <text id="mag-val" x="26" y="30" text-anchor="middle"
        fill="#e8f0fe" font-size="12" font-weight="200"
        font-family="'Segoe UI',sans-serif">—</text>
    `;
    this._arc = this.svg.getElementById('mag-arc');
    this._val = this.svg.getElementById('mag-val');
  }

  update(value) {
    const pct    = Math.min(1, Math.max(0, (value ?? 0) / this.max));
    const filled = MiniArcGauge._MAX * pct;
    const empty  = MiniArcGauge._C - filled;
    this._arc.setAttribute('stroke-dasharray', `${filled.toFixed(2)} ${empty.toFixed(2)}`);
    this._val.textContent = value != null ? Math.round(value) : '—';
  }
}
