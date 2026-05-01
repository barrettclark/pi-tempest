# Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current chart-row dashboard with a gauge-and-sparkline layout featuring a NOW tab (current conditions, sparklines, wind gauge, AQI, upcoming hourly strip) and a FORECAST tab (24h hourly cards + 5-day daily + moon panel).

**Architecture:** FastAPI backend gains AQI (AirNow.gov proxy) and Moon (ephem, local compute) endpoints; the existing forecast endpoint is extended to 24h hourly + daily data; the current endpoint gains a rain rate field. The frontend is a full rewrite using ES modules: Wind/Arc SVG gauges, thin Chart.js sparklines, a wunderground-style upcoming strip, and a separate forecast-tab renderer.

**Tech Stack:** Python 3.11 / FastAPI / aiosqlite / httpx / ephem; Chart.js 4.4.6; vanilla ES modules; 1024×600 Chromium kiosk on Raspberry Pi 4.

---

## File Map

**Create:**
- `tests/__init__.py` — makes tests a package
- `tests/test_aqi.py` — AQI parsing unit tests
- `tests/test_moon.py` — moon phase calculation tests
- `tests/test_forecast.py` — daily forecast conversion tests
- `tests/test_current.py` — rain rate calculation tests
- `requirements-dev.txt` — pytest + httpx test deps
- `api/routers/aqi.py` — AirNow proxy endpoint
- `api/routers/moon.py` — ephem moon endpoint
- `static/js/icons.js` — WeatherFlow icon → emoji map
- `static/js/gauges.js` — WindGauge and MiniArcGauge SVG classes
- `static/js/sparklines.js` — thin Chart.js sparkline wrappers
- `static/js/upcoming.js` — wunderground-style hourly strip renderer
- `static/js/now.js` — NOW tab: fetch all data + render all rows
- `static/js/forecast.js` — FORECAST tab: hourly cards + daily cards + moon panel

**Modify:**
- `config.py` — add AIRNOW_API_KEY, LAT, LON
- `.env` — add AIRNOW_API_KEY, LAT, LON
- `.env.example` — add placeholder entries
- `requirements.txt` — add ephem
- `api/schemas.py` — add AqiResponse, MoonResponse; add rain_rate_in_hr to CurrentResponse
- `api/routers/forecast.py` — extend to 24h hourly + daily array
- `api/routers/current.py` — add rain_rate_in_hr field
- `api/main.py` — register aqi and moon routers
- `static/index.html` — complete rewrite (two-tab structure)
- `static/css/dashboard.css` — complete rewrite (new row layout)
- `static/js/app.js` — complete rewrite (tab switching + 60s refresh)

**Delete** (Task 17):
- `static/js/charts.js`
- `static/js/history.js`
- `static/js/current.js`

---

## Task 1: Git Repository Setup

**Files:**
- Create: `.gitignore`
- Run: `git init` in project root

- [ ] **Step 1: Initialize repo and create .gitignore**

```bash
cd /Users/barrettclark/Projects/pi-tempest
git init
```

Create `.gitignore`:
```
.venv/
__pycache__/
*.pyc
*.pyo
.env
data/
*.db
.DS_Store
.superpowers/brainstorm/
```

- [ ] **Step 2: Stage and make initial commit**

```bash
git add -A
git commit -m "chore: initial commit — existing pi-tempest codebase"
```

Expected: commit hash printed, `main` branch created.

---

## Task 2: Config and Dependencies

**Files:**
- Modify: `config.py`
- Modify: `.env`
- Modify: `.env.example`
- Modify: `requirements.txt`
- Create: `requirements-dev.txt`

- [ ] **Step 1: Add new config vars to config.py**

In `config.py`, add after the existing vars:
```python
AIRNOW_API_KEY = os.environ.get("AIRNOW_API_KEY", "")
LAT = os.environ.get("LAT", "32.97")
LON = os.environ.get("LON", "-96.99")
```

- [ ] **Step 2: Add vars to .env**

Append to `.env`:
```
AIRNOW_API_KEY=REDACTED-AIRNOW-KEY
LAT=32.97
LON=-96.99
```

- [ ] **Step 3: Add vars to .env.example**

Append to `.env.example`:
```
AIRNOW_API_KEY=your_airnow_key_here
LAT=32.97
LON=-96.99
```

- [ ] **Step 4: Add ephem to requirements.txt**

Append to `requirements.txt`:
```
ephem
```

- [ ] **Step 5: Create requirements-dev.txt**

Create `requirements-dev.txt`:
```
pytest==8.3.5
httpx==0.28.1
```

- [ ] **Step 6: Verify config loads**

```bash
cd /Users/barrettclark/Projects/pi-tempest
.venv/bin/python -c "import config; print(config.AIRNOW_API_KEY[:8], config.LAT, config.LON)"
```

Expected output: `75E23460 32.97 -96.99`

- [ ] **Step 7: Commit**

```bash
git add config.py .env.example requirements.txt requirements-dev.txt
git commit -m "feat: add AIRNOW_API_KEY, LAT, LON config; add ephem dependency"
```

---

## Task 3: Test Infrastructure + AQI Router

**Files:**
- Create: `tests/__init__.py`
- Create: `tests/test_aqi.py`
- Create: `api/routers/aqi.py`
- Modify: `api/schemas.py`

- [ ] **Step 1: Install ephem and test deps**

```bash
.venv/bin/pip install ephem pytest httpx
```

Expected: `Successfully installed ephem-...`

- [ ] **Step 2: Pin ephem version in requirements.txt**

```bash
.venv/bin/pip show ephem | grep Version
```

Replace the bare `ephem` line in `requirements.txt` with the pinned version, e.g.:
```
ephem==4.1.6
```

- [ ] **Step 3: Write the failing test**

Create `tests/__init__.py` (empty file).

Create `tests/test_aqi.py`:
```python
import pytest
from api.routers.aqi import _parse_airnow_response


def test_parse_picks_highest_aqi():
    data = [
        {"ParameterName": "PM2.5", "AQI": 42, "Category": {"Name": "Good"}},
        {"ParameterName": "OZONE", "AQI": 35, "Category": {"Name": "Good"}},
    ]
    result = _parse_airnow_response(data)
    assert result["aqi"] == 42
    assert result["category"] == "Good"
    assert result["pm25_aqi"] == 42
    assert result["ozone_aqi"] == 35


def test_parse_empty_returns_nones():
    result = _parse_airnow_response([])
    assert result["aqi"] is None
    assert result["category"] is None


def test_parse_missing_pollutant_is_none():
    data = [{"ParameterName": "PM2.5", "AQI": 10, "Category": {"Name": "Good"}}]
    result = _parse_airnow_response(data)
    assert result["ozone_aqi"] is None
    assert result["pm25_aqi"] == 10
```

- [ ] **Step 4: Run tests — expect failure (module not found)**

```bash
.venv/bin/pytest tests/test_aqi.py -v
```

Expected: `ImportError: cannot import name '_parse_airnow_response' from 'api.routers.aqi'` or `ModuleNotFoundError`

- [ ] **Step 5: Add AqiResponse to schemas.py**

In `api/schemas.py`, append:
```python
class AqiResponse(BaseModel):
    aqi: Optional[int]
    category: Optional[str]
    pm25_aqi: Optional[int]
    ozone_aqi: Optional[int]
    fetched_at: int
```

- [ ] **Step 6: Implement api/routers/aqi.py**

Create `api/routers/aqi.py`:
```python
"""GET /api/aqi — proxies AirNow.gov current AQI for Coppell TX (zip 75019)."""

import time
import logging

import httpx
from fastapi import APIRouter

import config
from api.schemas import AqiResponse

log = logging.getLogger("tempest.aqi")
router = APIRouter()

_cache: dict = {"data": None, "fetched_at": 0}
_CACHE_TTL = 1800  # 30 minutes


def _parse_airnow_response(data: list) -> dict:
    if not data:
        return {"aqi": None, "category": None, "pm25_aqi": None, "ozone_aqi": None}
    overall = max(data, key=lambda x: x.get("AQI", 0))
    pm25_aqi = next(
        (x["AQI"] for x in data if "PM2.5" in x.get("ParameterName", "")), None
    )
    ozone_aqi = next(
        (x["AQI"] for x in data if "OZONE" in x.get("ParameterName", "").upper()), None
    )
    return {
        "aqi": overall.get("AQI"),
        "category": overall.get("Category", {}).get("Name"),
        "pm25_aqi": pm25_aqi,
        "ozone_aqi": ozone_aqi,
    }


async def _fetch_aqi() -> dict:
    url = "https://www.airnowapi.org/aq/observation/zipCode/current/"
    params = {
        "format": "application/json",
        "zipCode": "75019",
        "distance": "25",
        "API_KEY": config.AIRNOW_API_KEY,
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, params=params)
    resp.raise_for_status()
    return _parse_airnow_response(resp.json())


@router.get("/aqi", response_model=AqiResponse)
async def get_aqi():
    now = time.time()
    if _cache["data"] is None or (now - _cache["fetched_at"]) > _CACHE_TTL:
        log.info("Refreshing AQI cache...")
        try:
            _cache["data"] = await _fetch_aqi()
        except Exception as exc:
            log.error("AQI fetch failed: %s", exc)
            if _cache["data"] is None:
                _cache["data"] = {"aqi": None, "category": None, "pm25_aqi": None, "ozone_aqi": None}
        _cache["fetched_at"] = int(now)

    return AqiResponse(fetched_at=int(_cache["fetched_at"]), **_cache["data"])
```

- [ ] **Step 7: Run tests — expect pass**

```bash
.venv/bin/pytest tests/test_aqi.py -v
```

Expected:
```
tests/test_aqi.py::test_parse_picks_highest_aqi PASSED
tests/test_aqi.py::test_parse_empty_returns_nones PASSED
tests/test_aqi.py::test_parse_missing_pollutant_is_none PASSED
3 passed
```

- [ ] **Step 8: Commit**

```bash
git add api/routers/aqi.py api/schemas.py tests/ requirements.txt requirements-dev.txt
git commit -m "feat: add AQI endpoint with AirNow proxy and 30min cache"
```

---

## Task 4: Moon Router

**Files:**
- Create: `tests/test_moon.py`
- Create: `api/routers/moon.py`
- Modify: `api/schemas.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_moon.py`:
```python
import pytest
from api.routers.moon import _phase_from_age, compute_moon


@pytest.mark.parametrize("age,expected_phase", [
    (0.5,  "New Moon"),
    (3.0,  "Waxing Crescent"),
    (8.0,  "First Quarter"),
    (11.0, "Waxing Gibbous"),
    (15.5, "Full Moon"),
    (19.0, "Waning Gibbous"),
    (23.0, "Last Quarter"),
    (27.0, "Waning Crescent"),
])
def test_phase_from_age(age, expected_phase):
    name, _ = _phase_from_age(age)
    assert name == expected_phase


def test_compute_moon_illumination_in_range():
    result = compute_moon()
    assert 0.0 <= result["illumination_pct"] <= 100.0


def test_compute_moon_has_required_keys():
    result = compute_moon()
    for key in ("phase_name", "emoji", "illumination_pct", "moonrise", "moonset",
                "next_full_moon", "next_new_moon"):
        assert key in result
```

- [ ] **Step 2: Run tests — expect failure**

```bash
.venv/bin/pytest tests/test_moon.py -v
```

Expected: `ImportError: cannot import name '_phase_from_age' from 'api.routers.moon'`

- [ ] **Step 3: Add MoonResponse to schemas.py**

In `api/schemas.py`, append:
```python
class MoonResponse(BaseModel):
    phase_name: str
    emoji: str
    illumination_pct: float
    moonrise: Optional[str]
    moonset: Optional[str]
    next_full_moon: str
    next_new_moon: str
    computed_at: int
```

- [ ] **Step 4: Implement api/routers/moon.py**

Create `api/routers/moon.py`:
```python
"""GET /api/moon — moon phase, rise/set, and upcoming phases via ephem."""

import time
import logging
from datetime import timezone
from zoneinfo import ZoneInfo

import ephem
from fastapi import APIRouter

import config
from api.schemas import MoonResponse

log = logging.getLogger("tempest.moon")
router = APIRouter()

# Cache until midnight local time — phase doesn't change intra-day
_cache: dict = {"data": None, "cache_date": None}


def _phase_from_age(age_days: float) -> tuple[str, str]:
    if age_days < 1.84:  return "New Moon",        "🌑"
    if age_days < 7.38:  return "Waxing Crescent",  "🌒"
    if age_days < 9.22:  return "First Quarter",    "🌓"
    if age_days < 14.76: return "Waxing Gibbous",   "🌔"
    if age_days < 16.61: return "Full Moon",        "🌕"
    if age_days < 22.15: return "Waning Gibbous",   "🌖"
    if age_days < 23.99: return "Last Quarter",     "🌗"
    return "Waning Crescent", "🌘"


def _ephem_to_local(ephem_date, tz: ZoneInfo) -> str:
    dt = ephem.Date(ephem_date).datetime().replace(tzinfo=timezone.utc).astimezone(tz)
    return dt.strftime("%-I:%M %p")


def compute_moon() -> dict:
    tz = ZoneInfo(config.TIMEZONE)
    now = ephem.now()

    obs = ephem.Observer()
    obs.lat = config.LAT
    obs.lon = config.LON
    obs.date = now
    obs.pressure = 0
    obs.horizon = "-0:34"

    moon = ephem.Moon()
    moon.compute(obs)

    age_days = float(now - ephem.previous_new_moon(now))
    phase_name, emoji = _phase_from_age(age_days)

    try:
        moonrise = _ephem_to_local(obs.next_rising(moon), tz)
    except (ephem.NeverUpError, ephem.AlwaysUpError):
        moonrise = None

    try:
        moonset = _ephem_to_local(obs.next_setting(moon), tz)
    except (ephem.NeverUpError, ephem.AlwaysUpError):
        moonset = None

    tz_obj = ZoneInfo(config.TIMEZONE)
    next_full = ephem.next_full_moon(now)
    next_new = ephem.next_new_moon(now)

    full_dt = ephem.Date(next_full).datetime().replace(tzinfo=timezone.utc).astimezone(tz_obj)
    new_dt = ephem.Date(next_new).datetime().replace(tzinfo=timezone.utc).astimezone(tz_obj)

    return {
        "phase_name": phase_name,
        "emoji": emoji,
        "illumination_pct": round(moon.phase, 1),
        "moonrise": moonrise,
        "moonset": moonset,
        "next_full_moon": full_dt.strftime("%b %-d"),
        "next_new_moon": new_dt.strftime("%b %-d"),
    }


@router.get("/moon", response_model=MoonResponse)
async def get_moon():
    tz = ZoneInfo(config.TIMEZONE)
    today = time.strftime("%Y-%m-%d", time.localtime())
    if _cache["data"] is None or _cache["cache_date"] != today:
        log.info("Computing moon data...")
        _cache["data"] = compute_moon()
        _cache["cache_date"] = today
    return MoonResponse(computed_at=int(time.time()), **_cache["data"])
```

- [ ] **Step 5: Run tests — expect pass**

```bash
.venv/bin/pytest tests/test_moon.py -v
```

Expected:
```
tests/test_moon.py::test_phase_from_age[...] PASSED  (8 parametrized cases)
tests/test_moon.py::test_compute_moon_illumination_in_range PASSED
tests/test_moon.py::test_compute_moon_has_required_keys PASSED
10 passed
```

- [ ] **Step 6: Commit**

```bash
git add api/routers/moon.py api/schemas.py tests/test_moon.py
git commit -m "feat: add moon phase endpoint via ephem (phase, rise/set, next phases)"
```

---

## Task 5: Extend Forecast Endpoint

**Files:**
- Create: `tests/test_forecast.py`
- Modify: `api/routers/forecast.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_forecast.py`:
```python
import pytest
from api.routers.forecast import _convert_daily, _convert_hourly


def test_convert_daily_temps():
    day = {
        "air_temp_high": 25.0, "air_temp_low": 10.0,
        "day_start_local": 1000000, "conditions": "Clear",
        "icon": "clear-day", "precip_probability": 10,
        "precip": 2.0, "wind_avg": 5.0,
        "wind_direction": 90, "wind_direction_cardinal": "E",
    }
    result = _convert_daily(day)
    assert result["high_f"] == pytest.approx(77.0, abs=0.1)
    assert result["low_f"] == pytest.approx(50.0, abs=0.1)
    assert result["precip_prob_pct"] == 10
    assert result["wind_avg_mph"] == pytest.approx(11.2, abs=0.1)
    assert result["icon"] == "clear-day"


def test_convert_daily_null_temps():
    day = {
        "air_temp_high": None, "air_temp_low": None,
        "day_start_local": 1000000, "conditions": None,
        "icon": None, "precip_probability": 0,
        "precip": None, "wind_avg": None,
        "wind_direction": None, "wind_direction_cardinal": None,
    }
    result = _convert_daily(day)
    assert result["high_f"] is None
    assert result["low_f"] is None
    assert result["precip_in"] == 0.0
```

- [ ] **Step 2: Run tests — expect failure**

```bash
.venv/bin/pytest tests/test_forecast.py -v
```

Expected: `ImportError: cannot import name '_convert_daily'`

- [ ] **Step 3: Update api/routers/forecast.py**

Replace the entire file content:
```python
"""
GET /api/forecast — proxies WeatherFlow better_forecast endpoint.

Returns:
  hourly: next 24h of hourly forecast data, converted to imperial units
  daily:  next 7 days of daily forecast data, converted to imperial units

Cached in memory for 10 minutes.
"""

import time
import logging

import httpx
from fastapi import APIRouter

import config
from api import units

log = logging.getLogger("tempest.forecast")
router = APIRouter()

_cache: dict = {"data": None, "fetched_at": 0}
_CACHE_TTL = 600  # 10 minutes


def _convert_hourly(h: dict) -> dict:
    temp_c = h.get("air_temperature")
    feels_c = h.get("feels_like")
    wind_ms = h.get("wind_avg")
    gust_ms = h.get("wind_gust")
    return {
        "time":                     h.get("time"),
        "conditions":               h.get("conditions"),
        "icon":                     h.get("icon"),
        "temperature_f":            units.c_to_f(temp_c),
        "feels_like_f":             units.c_to_f(feels_c),
        "humidity_pct":             h.get("relative_humidity"),
        "precip_in":                units.mm_to_in(h.get("precip") or 0),
        "precip_prob_pct":          h.get("precip_probability"),
        "wind_avg_mph":             units.ms_to_mph(wind_ms),
        "wind_gust_mph":            units.ms_to_mph(gust_ms),
        "wind_direction_deg":       h.get("wind_direction"),
        "wind_direction_cardinal":  h.get("wind_direction_cardinal"),
        "uv_index":                 h.get("uv"),
        "pressure_inhg":            units.mb_to_inhg(h.get("sea_level_pressure")),
    }


def _convert_daily(d: dict) -> dict:
    return {
        "date_epoch":               d.get("day_start_local"),
        "conditions":               d.get("conditions"),
        "icon":                     d.get("icon"),
        "high_f":                   units.c_to_f(d.get("air_temp_high")),
        "low_f":                    units.c_to_f(d.get("air_temp_low")),
        "precip_prob_pct":          d.get("precip_probability"),
        "precip_in":                units.mm_to_in(d.get("precip") or 0),
        "wind_avg_mph":             units.ms_to_mph(d.get("wind_avg")),
        "wind_direction_deg":       d.get("wind_direction"),
        "wind_direction_cardinal":  d.get("wind_direction_cardinal"),
    }


async def _fetch_forecast() -> dict:
    url = f"{config.WEATHERFLOW_API_BASE}/better_forecast"
    params = {"station_id": config.STATION_ID, "token": config.TOKEN}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()
        hourly = data.get("forecast", {}).get("hourly", [])
        daily = data.get("forecast", {}).get("daily", [])
        return {
            "hourly": [_convert_hourly(h) for h in hourly],
            "daily":  [_convert_daily(d) for d in daily[:7]],
        }
    except Exception as exc:
        log.error("Failed to fetch forecast: %s", exc)
        return {"hourly": [], "daily": []}


@router.get("/forecast")
async def get_forecast():
    now = time.time()
    if _cache["data"] is None or (now - _cache["fetched_at"]) > _CACHE_TTL:
        log.info("Refreshing forecast cache...")
        _cache["data"] = await _fetch_forecast()
        _cache["fetched_at"] = now

    forecast_data = _cache["data"] or {"hourly": [], "daily": []}

    # Return hourly for next 24h
    cutoff = int(now) + 24 * 3600
    upcoming = [
        h for h in forecast_data["hourly"]
        if h.get("time") and now <= h["time"] <= cutoff
    ]

    return {
        "fetched_at": int(_cache["fetched_at"]),
        "hourly":     upcoming,
        "daily":      forecast_data["daily"],
    }
```

- [ ] **Step 4: Run tests — expect pass**

```bash
.venv/bin/pytest tests/test_forecast.py -v
```

Expected:
```
tests/test_forecast.py::test_convert_daily_temps PASSED
tests/test_forecast.py::test_convert_daily_null_temps PASSED
2 passed
```

- [ ] **Step 5: Commit**

```bash
git add api/routers/forecast.py tests/test_forecast.py
git commit -m "feat: extend forecast to 24h hourly + 7-day daily with _convert_daily"
```

---

## Task 6: Rain Rate in Current Endpoint

**Files:**
- Create: `tests/test_current.py`
- Modify: `api/routers/current.py`
- Modify: `api/schemas.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_current.py`:
```python
import pytest
from api.routers.current import _compute_rain_rate_in_hr
from api import units


def test_rain_rate_half_mm_per_minute():
    # 0.5mm in a 1-minute interval → 30mm/hr → ~1.181 in/hr
    result = _compute_rain_rate_in_hr(rain_mm=0.5, report_interval_min=1)
    assert result == pytest.approx(units.mm_to_in(30.0), rel=0.01)


def test_rain_rate_zero_returns_none():
    assert _compute_rain_rate_in_hr(rain_mm=0.0, report_interval_min=1) is None


def test_rain_rate_none_rain_returns_none():
    assert _compute_rain_rate_in_hr(rain_mm=None, report_interval_min=1) is None


def test_rain_rate_two_minute_interval():
    # 1mm in a 2-minute interval → 30mm/hr
    result = _compute_rain_rate_in_hr(rain_mm=1.0, report_interval_min=2)
    assert result == pytest.approx(units.mm_to_in(30.0), rel=0.01)
```

- [ ] **Step 2: Run tests — expect failure**

```bash
.venv/bin/pytest tests/test_current.py -v
```

Expected: `ImportError: cannot import name '_compute_rain_rate_in_hr'`

- [ ] **Step 3: Add rain_rate_in_hr to CurrentResponse in schemas.py**

In `api/schemas.py`, add to `CurrentResponse`:
```python
class CurrentResponse(BaseModel):
    epoch: int
    timestamp_local: str
    temperature_f: Optional[float]
    feels_like_f: Optional[float]
    dew_point_f: Optional[float]
    humidity_pct: Optional[float]
    pressure_inhg: Optional[float]
    pressure_trend: str
    wind_avg_mph: Optional[float]
    wind_gust_mph: Optional[float]
    wind_lull_mph: Optional[float]
    wind_direction_deg: Optional[int]
    wind_direction_cardinal: Optional[str]
    rain_today_in: float
    rain_rate_in_hr: Optional[float]        # NEW
    uv_index: Optional[float]
    solar_radiation_wm2: Optional[float]
    lightning_count_1h: int
    lightning_last_epoch: Optional[int]
    lightning_last_distance_km: Optional[int]
    battery_v: Optional[float]
    rapid_wind: Optional[RapidWind]
```

- [ ] **Step 4: Add _compute_rain_rate_in_hr and wire into get_current**

In `api/routers/current.py`, add this pure helper function before `get_current`:
```python
def _compute_rain_rate_in_hr(
    rain_mm: Optional[float], report_interval_min: Optional[int]
) -> Optional[float]:
    """Rain rate in in/hr from accumulated mm in one reporting interval."""
    if not rain_mm:
        return None
    interval = report_interval_min or 1
    rate_mm_hr = (rain_mm / interval) * 60
    return units.mm_to_in(rate_mm_hr) if rate_mm_hr > 0 else None
```

In `get_current`, after `row = await cursor.fetchone()` and before the `if row is None` check, the null response needs the new field. Update the null-return block to include:
```python
rain_rate_in_hr=None,
```

In the main return at the bottom of `get_current`, add:
```python
rain_rate_in_hr=_compute_rain_rate_in_hr(
    row["rain_accumulated"], row["report_interval"]
) if row["precipitation_type"] else None,
```

- [ ] **Step 5: Run all tests — expect pass**

```bash
.venv/bin/pytest tests/ -v
```

Expected: all tests pass (13 total across all test files)

- [ ] **Step 6: Commit**

```bash
git add api/routers/current.py api/schemas.py tests/test_current.py
git commit -m "feat: add rain_rate_in_hr to /api/current endpoint"
```

---

## Task 7: Register New Routers

**Files:**
- Modify: `api/main.py`

- [ ] **Step 1: Add aqi and moon routers to main.py**

Replace `api/main.py` content:
```python
"""
FastAPI application factory.

Routes:
  GET /api/current          — latest observation + derived fields
  GET /api/history/temperature
  GET /api/history/rain
  GET /api/history/pressure
  GET /api/history/wind
  GET /api/history/solar
  GET /api/history/lightning
  GET /api/forecast         — hourly 24h + daily 7d from WeatherFlow
  GET /api/aqi              — AirNow.gov AQI for Coppell TX
  GET /api/moon             — moon phase, rise/set, upcoming phases
  GET /api/status           — health check
  GET /                     — serves static/index.html
"""

from contextlib import asynccontextmanager
import logging
import os

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from api.routers import current, history, status, forecast, aqi, moon

log = logging.getLogger("tempest.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    from collector.db import init_schema
    await init_schema()
    log.info("Database schema ready.")
    yield


app = FastAPI(title="Tempest Weather Dashboard", lifespan=lifespan)

app.include_router(current.router, prefix="/api")
app.include_router(history.router, prefix="/api/history")
app.include_router(forecast.router, prefix="/api")
app.include_router(aqi.router, prefix="/api")
app.include_router(moon.router, prefix="/api")
app.include_router(status.router, prefix="/api")

_static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
if os.path.isdir(_static_dir):
    app.mount("/", StaticFiles(directory=_static_dir, html=True), name="static")
```

- [ ] **Step 2: Verify API starts**

```bash
.venv/bin/uvicorn api.main:app --host 127.0.0.1 --port 8001 &
sleep 2
curl -s http://127.0.0.1:8001/api/aqi | python3 -m json.tool | head -10
curl -s http://127.0.0.1:8001/api/moon | python3 -m json.tool | head -10
kill %1
```

Expected: JSON responses with AQI data and moon data (no 404 or 500)

- [ ] **Step 3: Commit**

```bash
git add api/main.py
git commit -m "feat: register /api/aqi and /api/moon routers"
```

---

## Task 8: HTML Structure

**Files:**
- Modify: `static/index.html`

- [ ] **Step 1: Replace index.html entirely**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=1024, initial-scale=1.0">
  <title>Tempest</title>
  <link rel="stylesheet" href="/css/dashboard.css">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.min.js"></script>
</head>
<body>

<!-- ── Tab bar ─────────────────────────────────────────── -->
<div id="tabbar">
  <button class="tab active" id="tab-now">Now</button>
  <button class="tab" id="tab-forecast">Forecast</button>
  <div class="tab-spacer"></div>
  <div id="tabbar-time">—</div>
</div>

<!-- ── NOW panel ──────────────────────────────────────── -->
<div id="panel-now" class="panel">

  <div id="left-panel">
    <div id="cond-icon">—</div>
    <div id="cond-desc">—</div>
    <div id="now-temp">—</div>
    <div id="now-sublabel">—</div>
    <div id="rain-intensity" class="hidden">—</div>
    <div id="wind-gauge-wrap">
      <svg id="wind-gauge" viewBox="0 0 124 124" width="124" height="124"></svg>
      <div id="wind-sub">—</div>
    </div>
  </div>

  <div id="right-panel">

    <div class="row row-temp">
      <div class="row-label">Temperature</div>
      <div id="temp-val">—</div>
      <div id="temp-meta">—</div>
      <div class="spark-wrap"><canvas id="sp-temp"></canvas></div>
    </div>

    <div class="row row-upcoming">
      <div class="row-label">Upcoming</div>
      <div id="upcoming-inner"></div>
    </div>

    <div class="row row-rain">
      <div class="row-label">Rain</div>
      <div id="rain-totals"></div>
      <div class="spark-wrap spark-rain"><canvas id="sp-rain"></canvas></div>
    </div>

    <div class="row row-pressure">
      <div class="row-label">Pressure</div>
      <div id="pressure-val">—</div>
      <div id="pressure-trend">—</div>
      <div class="spark-wrap"><canvas id="sp-pressure"></canvas></div>
    </div>

    <div class="row row-uvaqi">
      <div class="row-label">UV · Solar · AQI</div>
      <svg id="uv-gauge" viewBox="0 0 52 52" width="44" height="44"></svg>
      <div id="uv-val">—</div>
      <div class="row-divider"></div>
      <div id="solar-val">—</div>
      <div class="spark-wrap spark-solar"><canvas id="sp-solar"></canvas></div>
      <div class="row-divider"></div>
      <svg id="aqi-gauge" viewBox="0 0 52 52" width="44" height="44"></svg>
      <div id="aqi-val">—</div>
      <div id="aqi-pollutants">—</div>
    </div>

    <div class="row row-lightning">
      <div class="row-label">Lightning</div>
      <div id="lightning-rate">—</div>
      <div id="lightning-last">—</div>
      <div id="lightning-totals">—</div>
    </div>

  </div>
</div>

<!-- ── FORECAST panel ─────────────────────────────────── -->
<div id="panel-forecast" class="panel hidden">

  <div id="hourly-section">
    <div class="section-label">Hourly · Next 24 hours</div>
    <div id="hourly-cards"></div>
  </div>

  <div id="daily-moon-section">
    <div id="daily-section">
      <div class="section-label">5-Day Forecast</div>
      <div id="daily-cards"></div>
    </div>
    <div id="moon-panel"></div>
  </div>

</div>

<!-- ── Status bar ─────────────────────────────────────── -->
<div id="statusbar">
  <span><span id="status-dot" class="dot"></span><span id="status-time">—</span></span>
  <span>Coppell, TX</span>
  <span id="status-obs">—</span>
</div>

<div id="loading">
  <div>Tempest Weather</div>
  <div id="loading-sub">Loading…</div>
</div>

<script type="module" src="/js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add static/index.html
git commit -m "feat: rewrite index.html with two-tab structure and new DOM layout"
```

---

## Task 9: CSS

**Files:**
- Modify: `static/css/dashboard.css`

- [ ] **Step 1: Replace dashboard.css entirely**

```css
/* ============================================================
   Tempest Dashboard — 1024×600, two-tab layout
   Tab bar 30px + content 548px + status bar 22px = 600px
   Left panel 260px | Right panel 764px
   ============================================================ */

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:        #0a1628;
  --bg-row:    #0d1e35;
  --bg-alt:    #0b1a2e;
  --bg-dark:   #060f1c;
  --accent:    #00c8ff;
  --accent2:   #00e5b0;
  --warn:      #ffb347;
  --solar:     #ffd166;
  --rain:      #74b0ff;
  --pink:      #ff6b9d;
  --danger:    #ff4e4e;
  --text:      #e8f0fe;
  --text-dim:  #5a7fa8;
  --border:    #162d4a;
  --status-h:  22px;
  --tab-h:     30px;
  --content-h: calc(600px - var(--tab-h) - var(--status-h)); /* 548px */
  --left-w:    260px;
}

html, body {
  width: 1024px;
  height: 600px;
  overflow: hidden;
  background: var(--bg);
  color: var(--text);
  font-family: 'Segoe UI', system-ui, sans-serif;
  font-size: 14px;
  user-select: none;
  -webkit-user-select: none;
}

/* ── Tab bar ────────────────────────────────────────── */
#tabbar {
  height: var(--tab-h);
  background: var(--bg-dark);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: stretch;
  flex-shrink: 0;
}

.tab {
  padding: 0 20px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  background: transparent;
  border: none;
  border-right: 1px solid var(--border);
  color: var(--text-dim);
  cursor: pointer;
  display: flex;
  align-items: center;
}

.tab.active {
  background: var(--bg);
  color: var(--accent);
  border-top: 2px solid var(--accent);
  margin-top: -1px;
}

.tab-spacer { flex: 1; }

#tabbar-time {
  padding: 0 16px;
  font-size: 11px;
  color: var(--text-dim);
  display: flex;
  align-items: center;
}

/* ── Panels ─────────────────────────────────────────── */
.panel {
  display: flex;
  width: 1024px;
  height: var(--content-h);
  overflow: hidden;
}

.panel.hidden { display: none; }

/* ── LEFT PANEL ─────────────────────────────────────── */
#left-panel {
  width: var(--left-w);
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  background: var(--bg-row);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-evenly;
  padding: 8px 10px;
}

#cond-icon { font-size: 48px; line-height: 1; }

#cond-desc {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-dim);
}

#now-temp {
  font-size: 58px;
  font-weight: 200;
  line-height: 1;
  color: var(--text);
}

#now-sublabel {
  font-size: 10px;
  color: var(--text-dim);
  text-align: center;
}

#rain-intensity {
  font-size: 12px;
  color: var(--rain);
  text-align: center;
}

#rain-intensity.hidden { display: none; }

#wind-gauge-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

#wind-sub {
  font-size: 11px;
  color: var(--text-dim);
  display: flex;
  gap: 14px;
}

/* ── RIGHT PANEL ────────────────────────────────────── */
#right-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.row {
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--border);
  padding: 0 12px;
  gap: 10px;
  flex-shrink: 0;
  overflow: hidden;
  position: relative;
}

.row:last-child { border-bottom: none; }
.row:nth-child(even) { background: var(--bg-alt); }

/* Row heights — total = 548px */
.row-temp     { height: 110px; }
.row-upcoming { height: 130px; padding: 0; }
.row-rain     { height: 83px; }
.row-pressure { height: 72px; }
.row-uvaqi    { height: 78px; }
.row-lightning{ height: 75px; }

.row-label {
  position: absolute;
  top: 5px;
  left: 12px;
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-dim);
  z-index: 1;
}

.row-divider {
  width: 1px;
  height: 36px;
  background: var(--border);
  flex-shrink: 0;
}

/* ── Sparklines ─────────────────────────────────────── */
.spark-wrap {
  flex: 1;
  height: 42px;
  position: relative;
  overflow: hidden;
  min-width: 60px;
}

.spark-wrap canvas {
  display: block;
  width: 100% !important;
  height: 100% !important;
}

.spark-rain   { height: 36px; }
.spark-solar  { height: 36px; max-width: 160px; flex: none; }

/* ── Temperature row specifics ──────────────────────── */
#temp-val {
  font-size: 34px;
  font-weight: 200;
  color: var(--text);
  white-space: nowrap;
  margin-top: 14px;
  align-self: flex-start;
}

#temp-meta {
  font-size: 10px;
  color: var(--text-dim);
  white-space: nowrap;
  align-self: flex-end;
  padding-bottom: 8px;
}

/* ── Upcoming row ───────────────────────────────────── */
#upcoming-inner {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
}

/* ── Rain row ───────────────────────────────────────── */
#rain-totals {
  display: flex;
  gap: 16px;
  margin-top: 14px;
  align-self: flex-start;
  flex-shrink: 0;
}

.rain-total { text-align: center; }
.rain-total .rain-val {
  font-size: 18px;
  font-weight: 200;
  color: var(--rain);
  line-height: 1;
}
.rain-total .rain-lbl {
  font-size: 9px;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* ── Pressure row ───────────────────────────────────── */
#pressure-val {
  font-size: 20px;
  font-weight: 200;
  color: var(--text);
  white-space: nowrap;
  margin-top: 14px;
  align-self: flex-start;
}

#pressure-trend {
  font-size: 10px;
  color: var(--text-dim);
  white-space: nowrap;
  flex-shrink: 0;
}

.trend-rising  { color: var(--warn); }
.trend-falling { color: var(--rain); }
.trend-steady  { color: var(--text-dim); }

/* ── UV+AQI row ─────────────────────────────────────── */
#uv-val, #aqi-val {
  flex-shrink: 0;
}
#uv-val .uv-num    { font-size: 14px; font-weight: 200; color: var(--text); line-height: 1; }
#uv-val .uv-cat    { font-size: 9px;  color: var(--text-dim); }
#solar-val .sol-num { font-size: 14px; font-weight: 200; color: var(--solar); line-height: 1; }
#solar-val .sol-lbl { font-size: 9px;  color: var(--text-dim); }
#aqi-val .aqi-num   { font-size: 14px; font-weight: 200; line-height: 1; }
#aqi-val .aqi-cat   { font-size: 9px;  }
#aqi-pollutants    { font-size: 9px;  color: var(--text-dim); line-height: 1.8; }

/* ── Lightning row ──────────────────────────────────── */
#lightning-rate {
  font-size: 22px;
  font-weight: 200;
  color: var(--warn);
  white-space: nowrap;
  flex-shrink: 0;
}

#lightning-last {
  font-size: 10px;
  color: var(--text-dim);
  flex-shrink: 0;
}

#lightning-totals {
  margin-left: auto;
  font-size: 10px;
  color: var(--text-dim);
  text-align: right;
  flex-shrink: 0;
}

/* ── FORECAST PANEL ─────────────────────────────────── */
#panel-forecast {
  flex-direction: column;
}

#hourly-section {
  flex: 0 0 230px;
  border-bottom: 2px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.section-label {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-dim);
  padding: 5px 14px 3px;
  flex-shrink: 0;
}

#hourly-cards {
  flex: 1;
  display: flex;
  gap: 4px;
  padding: 0 8px 6px;
  overflow: hidden;
}

#daily-moon-section {
  flex: 1;
  display: flex;
  overflow: hidden;
}

#daily-section {
  flex: 1;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

#daily-cards {
  flex: 1;
  display: flex;
  gap: 5px;
  padding: 0 8px 8px;
  overflow: hidden;
}

/* ── Hourly cards ───────────────────────────────────── */
.hour-card {
  flex: 1;
  background: var(--bg-row);
  border: 1px solid var(--border);
  border-radius: 5px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 2px;
  gap: 3px;
  min-width: 0;
  overflow: hidden;
}

.hour-card.now-card { border-color: var(--accent); background: #0f2540; }

.hc-time   { font-size: 9px;  font-weight: 700; color: var(--text-dim); }
.now-card .hc-time { color: var(--accent); }
.hc-icon   { font-size: 22px; line-height: 1; }
.hc-temp   { font-size: 15px; font-weight: 200; color: var(--text); }
.hc-bar    { width: 60%; height: 3px; background: var(--border); border-radius: 2px; overflow: hidden; }
.hc-bar-fill { height: 100%; background: var(--rain); border-radius: 2px; }
.hc-rain   { font-size: 9px;  color: var(--rain); }
.hc-wind   { font-size: 9px;  color: var(--text-dim); text-align: center; }

/* ── Daily cards ────────────────────────────────────── */
.day-card {
  flex: 1;
  background: var(--bg-row);
  border: 1px solid var(--border);
  border-radius: 5px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 4px;
  gap: 4px;
  min-width: 0;
}

.day-card.today-card { border-color: var(--accent2); }

.dc-day    { font-size: 10px; font-weight: 700; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.06em; }
.today-card .dc-day { color: var(--accent2); }
.dc-icon   { font-size: 28px; line-height: 1; }
.dc-hilo   { display: flex; gap: 8px; font-size: 13px; font-weight: 300; }
.dc-hi     { color: var(--text); }
.dc-lo     { color: var(--text-dim); }
.dc-bar    { width: 55%; height: 3px; background: var(--border); border-radius: 2px; overflow: hidden; }
.dc-bar-fill { height: 100%; background: var(--rain); border-radius: 2px; }
.dc-rain   { font-size: 10px; color: var(--rain); }
.dc-wind   { font-size: 9px;  color: var(--text-dim); text-align: center; }

/* ── Moon panel ─────────────────────────────────────── */
#moon-panel {
  width: 200px;
  flex-shrink: 0;
  background: var(--bg-alt);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 14px;
  gap: 6px;
}

.moon-section-label {
  font-size: 9px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.1em; color: var(--text-dim); align-self: flex-start;
}

#moon-glyph { font-size: 58px; line-height: 1; filter: drop-shadow(0 0 10px rgba(200,200,255,0.3)); }
#moon-phase { font-size: 12px; color: var(--text); font-weight: 300; }
#moon-illum { font-size: 10px; color: var(--text-dim); }

.moon-times { width: 100%; display: flex; flex-direction: column; gap: 3px; margin-top: 2px; }
.moon-time-row { display: flex; justify-content: space-between; font-size: 10px; }
.moon-time-lbl { color: var(--text-dim); }
.moon-time-val { color: var(--text); }

.moon-divider { width: 100%; height: 1px; background: var(--border); }
.moon-next { width: 100%; display: flex; flex-direction: column; gap: 3px; }
.moon-next-row { display: flex; justify-content: space-between; font-size: 9px; }
.moon-next-lbl { color: var(--text-dim); }
.moon-next-val { color: var(--solar); }

/* ── Status bar ─────────────────────────────────────── */
#statusbar {
  height: var(--status-h);
  background: var(--bg-dark);
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  font-size: 11px;
  color: var(--text-dim);
  flex-shrink: 0;
}

.dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent2);
  margin-right: 6px;
  animation: pulse 2s infinite;
}
.dot.stale   { background: var(--warn); }
.dot.offline { background: var(--danger); animation: none; }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.25; }
}

/* ── Loading overlay ─────────────────────────────────── */
#loading {
  position: fixed;
  inset: 0;
  background: var(--bg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: var(--text-dim);
  z-index: 999;
  flex-direction: column;
  gap: 12px;
}
#loading.hidden { display: none; }
#loading-sub { font-size: 13px; color: var(--text-dim); opacity: 0.6; }
```

- [ ] **Step 2: Commit**

```bash
git add static/css/dashboard.css
git commit -m "feat: rewrite dashboard.css for two-tab gauge layout"
```

---

## Task 10: icons.js

**Files:**
- Create: `static/js/icons.js`

- [ ] **Step 1: Create icons.js**

Create `static/js/icons.js`:
```javascript
/**
 * icons.js — maps WeatherFlow icon field values to display emoji.
 */

export const ICONS = {
  'clear-day':          '☀️',
  'clear-night':        '🌙',
  'cloudy':             '☁️',
  'partly-cloudy-day':  '⛅',
  'partly-cloudy-night':'🌙',
  'rain':               '🌧️',
  'snow':               '❄️',
  'sleet':              '🌨️',
  'wind':               '💨',
  'fog':                '🌫️',
  'thunderstorm':       '⛈️',
  'tornado':            '🌪️',
};

export function iconEmoji(iconStr) {
  return ICONS[iconStr] || '🌡️';
}
```

- [ ] **Step 2: Commit**

```bash
git add static/js/icons.js
git commit -m "feat: add icons.js WeatherFlow icon → emoji map"
```

---

## Task 11: gauges.js

**Files:**
- Create: `static/js/gauges.js`

- [ ] **Step 1: Create gauges.js**

Create `static/js/gauges.js`:
```javascript
/**
 * gauges.js — SVG-based wind compass gauge and mini arc gauge.
 */

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
```

- [ ] **Step 2: Commit**

```bash
git add static/js/gauges.js
git commit -m "feat: add gauges.js with WindGauge and MiniArcGauge SVG classes"
```

---

## Task 12: sparklines.js

**Files:**
- Create: `static/js/sparklines.js`

- [ ] **Step 1: Create sparklines.js**

Create `static/js/sparklines.js`:
```javascript
/**
 * sparklines.js — minimal Chart.js sparklines with no axes/labels.
 *
 * All x values are epoch integers; Chart.js uses linear scale.
 * Types: 'line' | 'bar' | 'blended' (actual solid + forecast dashed)
 */

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
      }],
    },
    options: BASE_OPTS,
  });
}

export function createBlendedSparkline(canvasEl) {
  // Two datasets: actual (solid) and forecast (dashed)
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
```

- [ ] **Step 2: Commit**

```bash
git add static/js/sparklines.js
git commit -m "feat: add sparklines.js thin Chart.js wrappers (line, bar, blended)"
```

---

## Task 13: upcoming.js

**Files:**
- Create: `static/js/upcoming.js`

- [ ] **Step 1: Create upcoming.js**

Create `static/js/upcoming.js`:
```javascript
/**
 * upcoming.js — wunderground-style hourly forecast strip.
 *
 * Renders 9 columns (NOW + next 8 hours) with:
 *   - Time, condition icon, temperature, rain % (per column)
 *   - Continuous SVG temperature curve + rain probability gradient overlay
 *   - Night columns subtly darkened (hours 20-23 and 0-5)
 */

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

  // ── Column divs ──────────────────────────────────────
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

  // ── SVG overlay: temperature curve + rain area ──────
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

  // Rain gradient fill
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

  // Rain path (bottom area)
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

  // Temperature polyline
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

    // Dot at each point
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
```

- [ ] **Step 2: Commit**

```bash
git add static/js/upcoming.js
git commit -m "feat: add upcoming.js wunderground-style hourly strip with SVG temp curve"
```

---

## Task 14: now.js

**Files:**
- Create: `static/js/now.js`

- [ ] **Step 1: Create now.js**

Create `static/js/now.js`:
```javascript
/**
 * now.js — renders and refreshes the NOW tab.
 *
 * Exports: initNow(), refreshNow()
 */

import { WindGauge, MiniArcGauge }                    from './gauges.js';
import { createBlendedSparkline, createLineSparkline,
         createBarSparkline, updateBlendedSparkline,
         updateLineSparkline, updateBarSparkline }     from './sparklines.js';
import { renderUpcoming }                              from './upcoming.js';
import { iconEmoji }                                   from './icons.js';

let windGauge = null;
let uvGauge   = null;
let aqiGauge  = null;
const sp = {};  // sparklines keyed by name

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

// AQI color by category
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
  document.getElementById('cond-icon').textContent = iconEmoji(null);  // WeatherFlow UDP has no icon; use forecast
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

  // Hi/Lo from history
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
```

- [ ] **Step 2: Commit**

```bash
git add static/js/now.js
git commit -m "feat: add now.js — fetches all NOW tab data and renders rows"
```

---

## Task 15: forecast.js

**Files:**
- Create: `static/js/forecast.js`

- [ ] **Step 1: Create forecast.js**

Create `static/js/forecast.js`:
```javascript
/**
 * forecast.js — renders the FORECAST tab.
 *
 * Exports: refreshForecast()
 * Renders: 24h hourly cards, 5-day daily cards, moon panel.
 */

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

function isNight(epoch) {
  const h = new Date(epoch * 1000).getHours();
  return h < 6 || h >= 20;
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
  // "Now" card + up to 9 upcoming hours = 10 cards
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
```

- [ ] **Step 2: Commit**

```bash
git add static/js/forecast.js
git commit -m "feat: add forecast.js — renders hourly cards, daily cards, moon panel"
```

---

## Task 16: app.js

**Files:**
- Modify: `static/js/app.js`

- [ ] **Step 1: Replace app.js**

```javascript
/**
 * app.js — bootstrap, tab switching, 60s auto-refresh.
 */

import { initNow, refreshNow }       from './now.js';
import { refreshForecast }           from './forecast.js';

const LOADING   = document.getElementById('loading');
const TAB_NOW   = document.getElementById('tab-now');
const TAB_FC    = document.getElementById('tab-forecast');
const PANEL_NOW = document.getElementById('panel-now');
const PANEL_FC  = document.getElementById('panel-forecast');
const TABBAR_T  = document.getElementById('tabbar-time');
const STATUS_OBS = document.getElementById('status-obs');

let activeTab = 'now';

function showTab(name) {
  activeTab = name;
  TAB_NOW.classList.toggle('active', name === 'now');
  TAB_FC.classList.toggle('active', name === 'forecast');
  PANEL_NOW.classList.toggle('hidden', name !== 'now');
  PANEL_FC.classList.toggle('hidden', name !== 'forecast');
}

TAB_NOW.addEventListener('click', () => showTab('now'));
TAB_FC.addEventListener('click',  () => showTab('forecast'));

function tickClock() {
  TABBAR_T.textContent = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
  });
}

async function refreshStatus() {
  try {
    const s = await fetch('/api/status').then(r => r.json());
    STATUS_OBS.textContent = `${s.db_row_count} obs`;
  } catch (_) {}
}

async function refresh() {
  await Promise.allSettled([
    refreshNow(),
    refreshForecast(),
    refreshStatus(),
  ]);
}

(async () => {
  initNow();
  tickClock();
  setInterval(tickClock, 1000);

  try {
    await refresh();
  } catch (err) {
    console.error('Initial load error:', err);
  } finally {
    LOADING.classList.add('hidden');
  }

  setInterval(refresh, 60_000);
})();
```

- [ ] **Step 2: Commit**

```bash
git add static/js/app.js
git commit -m "feat: rewrite app.js — tab switching, 60s refresh, live clock"
```

---

## Task 17: Remove Old Frontend Files

**Files:**
- Delete: `static/js/charts.js`
- Delete: `static/js/history.js`
- Delete: `static/js/current.js`

- [ ] **Step 1: Delete obsolete files**

```bash
git rm static/js/charts.js static/js/history.js static/js/current.js
```

- [ ] **Step 2: Commit**

```bash
git commit -m "chore: remove charts.js, history.js, current.js — replaced by new modules"
```

---

## Task 18: Deploy to Pi and Verify

- [ ] **Step 1: Install ephem on the Pi**

```bash
ssh barrettclark@192.0.2.122 "cd /home/barrettclark/pi-tempest && .venv/bin/pip install ephem"
```

Expected: `Successfully installed ephem-...`

- [ ] **Step 2: Sync code to Pi**

```bash
rsync -avz --exclude='.venv' --exclude='data/' --exclude='__pycache__' \
  --exclude='.git' --exclude='.env' \
  /Users/barrettclark/Projects/pi-tempest/ \
  barrettclark@192.0.2.122:/home/barrettclark/pi-tempest/
```

- [ ] **Step 3: Update .env on Pi with new variables**

```bash
ssh barrettclark@192.0.2.122 "
  grep -q AIRNOW_API_KEY /home/barrettclark/pi-tempest/.env || \
    echo 'AIRNOW_API_KEY=REDACTED-AIRNOW-KEY' >> /home/barrettclark/pi-tempest/.env
  grep -q '^LAT=' /home/barrettclark/pi-tempest/.env || \
    echo 'LAT=32.97' >> /home/barrettclark/pi-tempest/.env
  grep -q '^LON=' /home/barrettclark/pi-tempest/.env || \
    echo 'LON=-96.99' >> /home/barrettclark/pi-tempest/.env
"
```

- [ ] **Step 4: Restart services**

```bash
ssh barrettclark@192.0.2.122 "sudo systemctl restart tempest-api tempest-collector"
sleep 3
ssh barrettclark@192.0.2.122 "systemctl is-active tempest-api tempest-collector"
```

Expected: both `active`

- [ ] **Step 5: Smoke test all new endpoints**

```bash
ssh barrettclark@192.0.2.122 "
  echo '=== /api/aqi ==='
  curl -s http://localhost:8000/api/aqi | python3 -m json.tool
  echo '=== /api/moon ==='
  curl -s http://localhost:8000/api/moon | python3 -m json.tool
  echo '=== /api/forecast (daily count) ==='
  curl -s http://localhost:8000/api/forecast | python3 -c \"import sys,json; d=json.load(sys.stdin); print('hourly:', len(d['hourly']), 'daily:', len(d['daily']))\"
  echo '=== /api/current (rain_rate_in_hr) ==='
  curl -s http://localhost:8000/api/current | python3 -c \"import sys,json; d=json.load(sys.stdin); print('rain_rate_in_hr:', d.get('rain_rate_in_hr'))\"
"
```

Expected: valid JSON for all endpoints, daily array has 5-7 entries, no 500 errors.

- [ ] **Step 6: Open dashboard in browser on Mac**

```bash
open http://192.0.2.122:8000
```

Verify:
- NOW tab loads with current conditions
- Wind gauge renders and shows direction + speed
- Upcoming strip shows hourly cards with temperature curve
- All 6 rows visible with sparklines
- Click FORECAST tab → hourly cards, daily cards, moon panel all render
- Status bar shows live clock in 12h format

- [ ] **Step 7: Final commit tag**

```bash
git add -A
git commit -m "chore: dashboard redesign complete"
git tag v2.0.0
```
