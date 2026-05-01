# Dashboard Redesign — Design Spec
**Date:** 2026-05-01  
**Status:** Approved for implementation

---

## Overview

Replace the current single-page chart-row layout with a gauge-and-sparkline dashboard that displays richer at-a-glance data. Two tabs: **Now** (always-visible current conditions) and **Forecast** (hourly + daily + moon). A third tab (weather map) is deferred.

Screen: 1024×600px, fixed, no scroll, Chromium kiosk on Raspberry Pi 4.  
All times displayed in **12-hour format** (2:32 PM, not 14:32).

---

## Page Structure

```
┌─[● NOW]──[FORECAST]────────────────────[2:32 PM · Coppell, TX]─┐  30px tab bar
│                                                                   │
│                  tab content (548px tall)                         │
│                                                                   │
└───────────────────────────────── ● 2:31 PM · 847 obs ───────────┘  22px status bar
```

- Tab bar: 30px, dark background (`#060f1c`), active tab accented with top cyan border
- Status bar: 22px, pulse dot + last-obs time, location ("Coppell, TX"), obs count
- Content area: 548px tall × 1024px wide

---

## NOW Tab

### Left Panel (260px wide, full 548px height)

| Element | Detail |
|---------|--------|
| Conditions icon | Emoji mapped from WeatherFlow `icon` field (e.g. ☀️ ⛅ 🌧️) |
| Description | WeatherFlow conditions text, uppercase, small |
| Current temperature | Large (56px), light weight |
| Sub-line | Feels like · Dew point · Humidity — single inline line |
| Rain intensity | **Only shown when `precipitation_type > 0`** — rate in/hr derived from recent `rain_accumulated` delta. Hidden when dry. |
| Wind circular gauge | 124px circle: cardinal direction + degrees, avg speed center, lull + gust flanking below. Direction needle rendered in SVG/Canvas. |

### Right Panel (764px wide)

Six rows, total = 548px:

| # | Row | Height | Content |
|---|-----|--------|---------|
| 1 | **Temperature** | 110px | Current temp (large) · feels like · dew point · Hi/Lo with times · delta from yesterday · 24h sparkline blending actual (solid) + forecast (dashed) with vertical NOW line |
| 2 | **Upcoming** | 130px | Wunderground-style hourly strip: 9 columns (Now + next 8 hours), each showing time · condition icon · temperature · rain %. Behind columns: continuous SVG temperature curve (red with circle dots) + rain probability gradient area (blue). Night hours have subtle dark tint. |
| 3 | **Rain** | 83px | Today / Month / Year totals · 24h bar sparkline (hourly buckets) + precip-probability line overlay |
| 4 | **Pressure** | 72px | Current inHg · rising/steady/falling indicator · plain-English description · 6h sparkline |
| 5 | **UV · Solar · AQI** | 78px | UV mini arc gauge + label · divider · Solar W/m² + today's bell-curve sparkline · divider · AQI mini arc gauge + Good/Moderate/etc label · PM2.5 + O₃ readings |
| 6 | **Lightning** | 75px | Strikes/hr · last strike distance + time elapsed · Month + Year cumulative totals |

**Total: 110 + 130 + 83 + 72 + 78 + 75 = 548px ✓**

---

## FORECAST Tab

### Hourly Strip (top, ~230px)

- Section label: "Hourly · Next 24 hours"
- Horizontal row of cards, one per hour, showing: time (12h format) · condition icon · temperature · precip-probability bar + % · wind speed + cardinal
- NOW card highlighted with cyan border
- All cards visible without scrolling; at ~90px per card, 10 cards fit in 1024px minus the 260px left panel = 764px (≈8 cards + NOW)

### Daily + Moon (bottom, ~318px)

**Daily section (flex: 1):**
- 5–6 day cards (Today + next 4-5 days from WeatherFlow `better_forecast` daily array; capped to what fills the ~824px available width at ~130px per card)
- Each card: day name · condition icon · Hi° | Lo° · precip-probability bar + % · wind speed + cardinal
- Today card highlighted with green accent border

**Moon panel (200px wide):**
- Moon phase emoji glyph (large)
- Phase name (e.g. "Waxing Gibbous")
- Illumination %
- Moonrise / Moonset times (12h format)
- Next Full Moon and New Moon dates
- Computed locally via Python `ephem` — no API, no network

---

## Data Sources

| Data | Source | Notes |
|------|--------|-------|
| Current conditions | WeatherFlow UDP (live) | Already collecting |
| Historical observations | Local SQLite | Already collecting |
| Hourly forecast | WeatherFlow `better_forecast` | Already wired; extend to 24h |
| Daily forecast | WeatherFlow `better_forecast` daily array | New — not yet parsed |
| Condition icons | WeatherFlow `icon` field | Map to emoji or SVG set |
| AQI | AirNow.gov API | New endpoint; API key in `.env` |
| Moon phase/times | Python `ephem` library | New; computed server-side |
| Rain intensity | Derived from `rain_accumulated` delta | Computed in `/api/current` |

---

## Backend Changes

### New API endpoints

**`GET /api/aqi`**
- Fetches from `https://www.airnowapi.org/aq/observation/zipCode/current/`
- Parameters: zip `75019` (Coppell TX), API key from env `AIRNOW_API_KEY`
- Returns: overall AQI, category, PM2.5, O₃
- Cache: 30 minutes (updates hourly at source)

**`GET /api/moon`**
- Computed via `ephem` library (add to `requirements.txt`)
- Returns: phase name, illumination %, moonrise, moonset, next full moon date, next new moon date
- Cache: until midnight local time (phase doesn't change intra-day)

### Modified endpoints

**`GET /api/forecast`** — extend to return daily data
- Currently returns next 12h hourly; extend to 24h (WeatherFlow `better_forecast` provides 48h+ by default — just widen the cutoff filter)
- Add `daily` array parsed from `better_forecast` daily section
- Each daily entry: date, icon, conditions, hi temp °F, lo temp °F, precip probability, precip amount, wind avg mph, wind direction cardinal

**`GET /api/current`** — add rain intensity
- When `precipitation_type > 0`, compute rate as delta of `rain_accumulated` over the last 2 non-null observations within the past 5 minutes, scaled to in/hr
- Return as `rain_rate_in_hr` field (null when dry or no recent delta available)

### Config changes

Add to `.env` and `config.py`:
```
AIRNOW_API_KEY=REDACTED-AIRNOW-KEY
```

### New dependency
```
ephem
```
(Pin version after install: `pip show ephem` on the Pi)

---

## Frontend Architecture

### Files to replace/rewrite

| File | Action | Reason |
|------|--------|--------|
| `static/index.html` | Rewrite | New two-tab structure, new row layout |
| `static/css/dashboard.css` | Rewrite | New row heights, tab bar, left panel, sparkline rows |
| `static/js/app.js` | Rewrite | Tab switching, refresh logic |
| `static/js/charts.js` | Remove | Full Chart.js charts replaced by sparklines |
| `static/js/history.js` | Replace with `sparklines.js` | Inline sparklines instead of full charts |
| `static/js/current.js` | Rewrite | New left panel, new row stats |

### New frontend files

**`static/js/gauges.js`**
- `WindGauge(canvasEl)` — draws circular wind gauge with SVG/Canvas needle
- `MiniArcGauge(svgEl, value, max, color)` — arc gauge for UV and AQI

**`static/js/sparklines.js`**
- Thin Chart.js wrappers for inline sparklines (no axes, no labels, minimal chrome)
- `createSparkline(canvasEl, data, color, type)` — line or bar
- Used for: temperature 24h, pressure 6h, solar today, rain 24h bars

**`static/js/upcoming.js`**
- Renders the wunderground-style hourly strip
- Builds column divs from forecast data
- Draws SVG temperature curve + rain area overlay dynamically

**`static/js/forecast.js`**
- Renders the Forecast tab: hourly cards + daily cards + moon panel

### Tab switching
- Pure CSS + one JS toggle: clicking a tab adds/removes `.active` class
- No router, no history API — two divs, one visible at a time
- Auto-refresh (60s) refreshes data for the active tab; both tabs refresh on each cycle

---

## Condition Icon Mapping

WeatherFlow `icon` field values → emoji:

| Icon value | Emoji |
|------------|-------|
| `clear-day` | ☀️ |
| `clear-night` | 🌙 |
| `cloudy` | ☁️ |
| `partly-cloudy-day` | ⛅ |
| `partly-cloudy-night` | 🌙 |
| `rain` | 🌧️ |
| `snow` | ❄️ |
| `sleet` | 🌨️ |
| `wind` | 💨 |
| `fog` | 🌫️ |
| `thunderstorm` | ⛈️ |
| `tornado` | 🌪️ |
| (unknown) | 🌡️ |

---

## Out of Scope (Deferred)

- Weather map tab (third tab) — RainViewer radar tiles, deferred post-launch
- REST API backfill — WeatherFlow returns `obs: null` for historical device data regardless of time range; this is a confirmed API access limitation. Live UDP collection (started 2026-04-30) is the only source of historical data. As of 2026-05-01 the database has ~400+ observations covering ~14 hours; sparklines will fill naturally over 24–48h.
- Humidity as a standalone sparkline row — covered inline in Temperature sub-line and Upcoming strip
