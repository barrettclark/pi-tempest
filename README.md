# Pi Tempest Weather Dashboard

A single-page touchscreen weather dashboard for the [WeatherFlow Tempest](https://shop.tempest.earth/) station, running on a Raspberry Pi. Displays real-time conditions alongside blended historical and forecast charts — all six metrics visible simultaneously, no tabs, no scrolling.

![Current setup running WeatherFlow_PiConsole](img/IMG_0440.png)
*Previous setup (WeatherFlow_PiConsole) — replaced by this app*

---

## Screen Layout

The dashboard fills the full 1024×600 display. Every metric is always on screen.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ TEMPERATURE  │                                                                  │
│              │  ━━━━━━━━━━━━━━━━━━━━━━━━━━╋╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌          │
│  62.4°F      │  (12h actual temp + dew pt) NOW  (12h forecast temp)            │
│  Feels 60°F  │                            ▲                                    │
│  Dew 55.8°F  │                         62.4°F                                  │
├──────────────┼─────────────────────────────────────────────────────────────────┤
│ WIND         │                                                                  │
│              │  ━━━━━━━━━━━━━━━━━━━━━━━━━━╋╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌          │
│  2.5 mph NNE │  avg ── gust - - lull ···  NOW  forecast avg ╌╌╌╌╌╌╌╌╌         │
│  Gust 9.6    │                                                                  │
├──────────────┼─────────────────────────────────────────────────────────────────┤
│ PRECIPITATION│                                                                  │
│              │  ▌▌▌▌  ▌▌▌  ▌▌▌▌▌▌▌▌▌▌▌▌▌▌╋░░░░░░░░░░░░░░░░░░░░░░░░░░          │
│  0.06" today │  (actual hourly rain bars)  NOW  (forecast precip chance %)     │
│  24h: 0.06"  │                                                                  │
├──────────────┼─────────────────────────────────────────────────────────────────┤
│ BAROMETER    │                                                                  │
│              │  ━━━━━━━━━━━━━━━━━━━━━━━━━━╋                                   │
│  29.952" inHg│  (12h actual pressure)      NOW  (history only)                 │
│  ▼ Falling   │                                                                  │
├──────────────┼─────────────────────────────────────────────────────────────────┤
│ SOLAR / UV   │                                                                  │
│              │  ━━━━━━━━━━━━━━━━━━━━━━━━━━╋╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌          │
│  180 W/m²    │  (today actual solar W/m²)  NOW  (forecast UV index ╌╌╌╌)      │
│  UV 1.2      │                                                                  │
├──────────────┼─────────────────────────────────────────────────────────────────┤
│ LIGHTNING  0/hr  Last: 1d ago · 21 km  │  ▌  ▌▌  ▌  (24h hourly bars)       │
├──────────────────────────────────────────────────────────────────────────────  ┤
│  ● Updated 14:46   Coppell, TX   43,021 obs                                    │
└─────────────────────────────────────────────────────────────────────────────────┘
  190px stat block           834px chart area
```

**Chart key:**
- `━━━` Solid line — actual historical data (last 12 hours)
- `╌╌╌` Dashed line — forecast data (next 12 hours)
- `▋` Bars — actual hourly accumulation
- `░` Shaded area — forecast precipitation probability
- `╋` Vertical dashed line — **NOW** marker (current time)

---

## Hardware

| Component | Details |
|---|---|
| Computer | Raspberry Pi 4 Model B, 4GB RAM |
| Display | ROADOM 10.1" IPS, 1024×600, capacitive touch, HDMI |
| OS | Raspberry Pi OS Bookworm (64-bit), Wayland/labwc |
| Weather station | WeatherFlow Tempest |

---

## Architecture

```
WeatherFlow Hub
      │
      │  UDP broadcast (port 50222, ~60s intervals)
      ▼
┌─────────────────────────────────────────────────────┐
│  tempest-collector  (systemd service)               │
│                                                     │
│  collector/udp_listener.py                          │
│  ├─ obs_st packets    → observations table          │
│  ├─ rapid_wind        → rapid_wind table            │
│  ├─ evt_strike        → lightning_events table      │
│  └─ evt_precip        → rain_events table           │
│                                                     │
│  collector/backfill.py  (first run only)            │
│  └─ REST API → 30 days of history → observations   │
└──────────────────────┬──────────────────────────────┘
                       │  aiosqlite (WAL mode)
                       ▼
               data/tempest.db (SQLite)
                       │
                       │  async reads
                       ▼
┌─────────────────────────────────────────────────────┐
│  tempest-api  (systemd service)                     │
│                                                     │
│  FastAPI + Uvicorn on localhost:8000                │
│                                                     │
│  GET /api/current          latest obs + derived     │
│  GET /api/history/temperature?hours=12              │
│  GET /api/history/wind?hours=12                     │
│  GET /api/history/rain                              │
│  GET /api/history/pressure?hours=12                 │
│  GET /api/history/solar                             │
│  GET /api/history/lightning?hours=24                │
│  GET /api/forecast         WeatherFlow hourly,      │
│                            10-min cached            │
│  GET /api/status           health check             │
│  GET /                     serves static/           │
└──────────────────────┬──────────────────────────────┘
                       │  HTTP on localhost
                       ▼
┌─────────────────────────────────────────────────────┐
│  Chromium (kiosk mode, --ozone-platform=wayland)    │
│                                                     │
│  static/index.html   six-row dashboard              │
│  static/js/          vanilla JS ES modules          │
│  ├─ app.js           boot + 60s refresh loop        │
│  ├─ current.js       stat block rendering           │
│  ├─ history.js       parallel data fetching         │
│  └─ charts.js        Chart.js wrappers + NOW plugin │
│  static/css/         dark theme, 1024×600 layout    │
└─────────────────────────────────────────────────────┘
```

### Data flow on each 60-second refresh

1. `history.js` fires 8 parallel `fetch()` calls: `/api/current`, six history endpoints, `/api/forecast`
2. FastAPI reads from SQLite (history) and WeatherFlow REST (forecast, cached 10 min)
3. Each chart is updated in-place with `chart.update('none')` — no animation flicker
4. Stat blocks update with current values; the NOW line redraws at the correct position

### Derived metrics (computed server-side in `api/units.py`)

| Metric | Formula |
|---|---|
| Feels Like | NWS heat index (≥80°F) or wind chill (≤50°F, wind ≥3mph) |
| Dew Point | Magnus formula from temperature + relative humidity |
| Pressure trend | Slope of last 3h of pressure readings (rising/falling/steady) |
| Rain today | Sum of `rain_accumulated` since local midnight |
| Wind cardinal | 16-point compass from degrees |

---

## Project Structure

```
pi-tempest/
├── config.py                      # loads .env, single source of truth
├── requirements.txt
├── .env                           # secrets — never committed
├── .env.example                   # template
│
├── collector/
│   ├── db.py                      # schema init, insert helpers, WAL mode
│   ├── udp_listener.py            # asyncio UDP server, packet dispatch
│   ├── backfill.py                # 30-day REST backfill on first run
│   └── rest_client.py             # httpx wrapper with rate-limit backoff
│
├── api/
│   ├── main.py                    # FastAPI app factory, lifespan, static mount
│   ├── deps.py                    # get_db() dependency
│   ├── schemas.py                 # Pydantic response models
│   ├── units.py                   # unit conversions + derived calculations
│   └── routers/
│       ├── current.py             # GET /api/current
│       ├── history.py             # GET /api/history/*
│       ├── forecast.py            # GET /api/forecast (cached proxy)
│       └── status.py              # GET /api/status
│
├── static/
│   ├── index.html                 # single-page dashboard shell
│   ├── css/dashboard.css          # dark theme, row layout, touch targets
│   └── js/
│       ├── app.js                 # boot, 60s refresh loop
│       ├── current.js             # stat block updates
│       ├── history.js             # parallel fetch + chart dispatch
│       └── charts.js              # Chart.js configs + NOW-line plugin
│
├── systemd/
│   ├── tempest-collector.service
│   └── tempest-api.service
│
├── autostart/
│   └── chromium-kiosk.sh          # waits for API, launches Chromium
│
└── scripts/
    └── install.sh                 # one-shot installer
```

---

## Database Schema

**`observations`** — one row per Tempest obs_st packet (~1 minute resolution)

| Column | Type | Source |
|---|---|---|
| epoch | INTEGER (unique) | packet field [0] |
| source | TEXT | `'udp'` or `'rest'` |
| wind_lull / wind_avg / wind_gust | REAL (m/s) | fields [1–3] |
| wind_direction | INTEGER (°) | field [4] |
| station_pressure | REAL (mb) | field [6] |
| air_temperature | REAL (°C) | field [7] |
| relative_humidity | REAL (%) | field [8] |
| illuminance | INTEGER (lux) | field [9] |
| uv | REAL | field [10] |
| solar_radiation | REAL (W/m²) | field [11] |
| rain_accumulated | REAL (mm) | field [12] |
| lightning_avg_distance | INTEGER (km) | field [14] |
| lightning_count | INTEGER | field [15] |
| battery | REAL (V) | field [16] |

Additional tables: `rapid_wind` (3s wind, 24h retention), `lightning_events`, `rain_events`, `backfill_log`.

---

## Setup

### Prerequisites

- Raspberry Pi 4 running Raspberry Pi OS Bookworm (64-bit)
- Wayland/labwc desktop environment
- WeatherFlow Tempest hub on the same local network
- WeatherFlow Personal Access Token ([create one here](https://tempestwx.com/settings/tokens))

### 1. Copy the project to the Pi

```bash
rsync -av --exclude '.git' --exclude 'data/' \
  /path/to/pi-tempest/ \
  barrettclark@<pi-ip>:/home/barrettclark/pi-tempest/
```

### 2. Configure credentials

On the Pi:
```bash
cd /home/barrettclark/pi-tempest
cp .env.example .env
nano .env
```

Fill in your values:
```
WEATHERFLOW_TOKEN=your_token_here
STATION_ID=your_station_id
DEVICE_ID=your_tempest_device_id
TZ=America/Chicago
DB_PATH=/home/barrettclark/pi-tempest/data/tempest.db
UDP_PORT=50222
API_HOST=127.0.0.1
API_PORT=8000
```

To find your station and device IDs:
```bash
curl "https://swd.weatherflow.com/swd/rest/stations?token=YOUR_TOKEN"
```

### 3. Run the installer

```bash
bash scripts/install.sh
```

This will:
- Install system packages (`python3-venv`, `chromium-browser`, `curl`)
- Create a Python virtual environment and install dependencies
- Enable and start both systemd services
- Add the Chromium kiosk launch to `~/.config/labwc/autostart`

### 4. Watch the backfill

On first start the collector fetches 30 days of history from the WeatherFlow REST API:

```bash
journalctl -u tempest-collector -f
```

This takes a few minutes. The dashboard works immediately but charts will fill in as data loads.

### 5. Reboot to verify autostart

```bash
sudo reboot
```

The dashboard should appear automatically when the desktop loads.

---

## Service Management

```bash
# Check status
sudo systemctl status tempest-collector tempest-api

# View live logs
journalctl -u tempest-collector -f
journalctl -u tempest-api -f

# Restart after code changes
sudo systemctl restart tempest-collector tempest-api

# Manually launch kiosk (without reboot)
/home/barrettclark/pi-tempest/autostart/chromium-kiosk.sh
```

---

## Dependencies

| Package | Version | Purpose |
|---|---|---|
| fastapi | 0.115.6 | Web framework |
| uvicorn[standard] | 0.32.1 | ASGI server |
| aiosqlite | 0.20.0 | Async SQLite |
| httpx | 0.28.1 | Async HTTP client (REST API + forecast) |
| python-dotenv | 1.0.1 | .env loading |
| Chart.js | 4.4.6 | Charts (loaded from CDN) |

---

## WeatherFlow API Reference

- [UDP Broadcast spec v171](https://weatherflow.github.io/Tempest/api/udp/v171/)
- [REST API reference](https://apidocs.tempestwx.com/reference/quick-start)
- [WebSocket API](https://weatherflow.github.io/Tempest/api/ws.html)
