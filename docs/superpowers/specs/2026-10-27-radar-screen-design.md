# Radar Screen — Design Spec
**Date:** 2026-10-27
**Status:** Approved for implementation
**Issue:** [#1 — Weather map / radar overlay](https://github.com/barrettclark/pi-tempest/issues/1)

---

## Overview

Add a second, full-screen radar view that Barrett can switch to on demand from the main 3×3 grid, and back again. It is not a permanent grid cell and not a timed carousel — it's a screen you tap into when you want it and tap out of when you don't.

Mockups for the three layout directions considered: https://claude.ai/artifact/ByiCfeweKgPnwj5ZyihsMi (private to Barrett). Option C — "framed radar cell" — is the approved direction: it reuses the dashboard's existing cell grammar (uppercase label row, track-and-dot scrubber styled like the humidity/temp bars) rather than inventing a new visual language.

Screen: 1024×600px, fixed, no scroll, capacitive touch only (no mouse/keyboard) — same constraints as the rest of the dashboard.

---

## Goals / Non-Goals / Anti-Goals

**Goals**
- See recent precipitation movement around Coppell, TX at a glance.
- Fits the existing visual language — looks like "one more screen of Tempest," not a bolted-on app.
- Free data sources, no new API key.

**Non-goals (v1)**
- No pan/zoom/drag on the map — fixed center, fixed zoom, matching the rest of the dashboard's non-interactive gauges.
- No nowcast/forecast radar frames — past observed frames only.
- No severe weather alerts/warnings overlay.
- No configurable center/zoom in a settings UI — fixed in code.

**Anti-goals**
- Don't turn this into a general-purpose interactive map. If it grows pinch-zoom, search, multiple layers — that's a new feature, not this one.
- Don't require a paid or keyed service.
- Don't block the main grid's 60s refresh loop while the radar screen is open, or vice versa.

---

## Navigation

The app stays a single page with no router — same pattern as the rest of the dashboard. Two top-level containers, `.grid` (current — note: a class, not an id, in `static/index.html`) and `#radar-screen` (new), toggled by one JS function that shows/hides each (e.g. a `hidden` class, same mechanism the page already uses for `#loading`); only one is visible at a time.

The real `#statusbar` (22px, bottom of screen, shared by both screens — see Correction below) gets two new icon buttons, styled like the existing `#exit-btn` (transparent background, `border-left: 1px solid var(--border)`, full-height tap target):

- **Radar icon** (sonar/signal glyph) — visible only on the main grid. Tap → show `#radar-screen`, hide `.grid`.
- **Grid icon** (2×2 squares) — visible only on the radar screen. Tap → show `.grid`, hide `#radar-screen`.

Only one of the two buttons is ever visible, so there's no ambiguity about which screen you're on or where the tap goes. This is the symmetric icon pair Barrett asked for: radar icon takes you to radar, grid icon takes you back to the grid.

**Correction vs. the mockup:** the Option C artboard draws its own status strip at the *top* of the frame, as a standalone full-screen rendering. In the real app, the status bar lives at the *bottom* (`#statusbar`, 22px, shared across all screens — see `static/index.html`). The implementation should add the two icon buttons into the real, existing `#statusbar`, not duplicate a second status bar at the top of `#radar-screen`.

---

## Layout (Option C, applied to the real page)

Within the 578px content area (1024×600 minus the 22px status bar), `#radar-screen` reuses the dashboard's `.cell` conventions:

- **Label row:** `.cell-label`-style row — uppercase, 9px, bold, letter-spaced, `var(--text-dim)`, with a radar/sonar icon — reading "RADAR". To its right: a horizontal intensity legend (light → heavy gradient bar, matching the hum/temp track gradients already in `dashboard.css`) and loop-range chips. There's no existing pill/chip pattern in `dashboard.css` to reuse — this is a new element. Style it with the same `--accent` (`#00c8ff`) token already used elsewhere on the page, at ~18% opacity for the active-chip background and full opacity for its text/border, so it reads as "accented" the same way the rest of the dashboard does, without inventing a new color.
- **Map body:** fills the remaining space below the label row, rounded corners (`border-radius: 6px`), centered on Coppell, TX.
- **Playback bar:** bottom strip, reusing the track-and-dot visual already established for the humidity/temperature bars (`.hum-track` / `.temp-bar-track` pattern) — play/pause circular button, left, then a labeled track (`-2h` … `now`) with a filled progress segment and a dot marking the current frame.

**Correction vs. the mockup:** the mockup's loop-range chips read "1H / 3H / 6H." RainViewer's free public endpoint only retains roughly the last **2 hours** of observed frames (~12 frames at 10-minute steps) — there's no 3h or 6h of real data to show. Relabel the chips to reflect what's actually available: **30M / 1H / 2H**, default to **2H** (all available frames). This is a correction to the mockup, not a new decision point — flagging it here so the chip labels in the shipped code don't promise data that doesn't exist.

---

## Data Sources

| Data | Source | Notes |
|------|--------|-------|
| Radar frame list | `https://api.rainviewer.com/public/weather-maps.json` | Free, no API key. Returns `{"host": "...", "radar": {"past": [{"time", "path"}, ...], "nowcast": [...]}}`. Use `radar.past` only (see Non-goals). |
| Radar tiles | `{host}{path}/256/{z}/{x}/{y}/2/1_1.png` from RainViewer's tile host | No key. `2` = the "Universal Blue" color scheme (closest match to the dashboard's `--rain: #74b0ff` accent); `1_1` = smoothing + snow coloring on. Served directly to the browser — not proxied. |
| Base map tiles | CARTO `dark_nolabels` basemap: `https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png` | Free, no key, served directly to the browser. Requires a visible attribution line ("© OpenStreetMap contributors © CARTO") — Leaflet's built-in (non-interactive) attribution control satisfies this; style it to blend with the dark theme. |
| Map center | `config.LAT` / `config.LON` (already `32.97` / `-96.99` — Coppell, TX) | Already defined in `config.py`; no new config needed. |

---

## Backend Changes

### New endpoint: `GET /api/radar/frames`

Mirrors `aqi.py`'s in-memory-dict caching *shape* (`api/routers/aqi.py` — `_cache`/`_CACHE_TTL`/try-except-log-and-keep-stale-cache):

- Fetches `https://api.rainviewer.com/public/weather-maps.json`.
- Returns a trimmed shape: `{"host": str, "frames": [{"time": epoch_seconds, "path": str}, ...]}` — `frames` = `radar.past` only, nowcast frames dropped server-side so the frontend never has to filter them out.
- Cache TTL: 120s (RainViewer's source data updates roughly every 10 minutes; a short cache just avoids re-fetching the JSON on every poll while the radar screen is open).
- No new config, no new secret.
- Test coverage: table-driven (happy path with nowcast stripped, upstream timeout/5xx falling back to a stale cache or an empty `frames` list with no exception reaching the client, cache-hit-skips-fetch). Note: `tests/test_aqi.py` only covers the pure parsing helper today — it doesn't yet have an httpx-mocking harness for the caching/fallback behavior, so this endpoint's tests will need to build that scaffolding rather than copy it from `test_aqi.py` directly.

No changes to any existing endpoint.

### New dependency

None — `httpx` (already a dependency, used by `aqi.py` and `history.py`) covers the fetch.

---

## Frontend Changes

### New vendored library

`static/js/vendor/leaflet.js` + a matching `leaflet.css`, vendored the same way `chart.umd.min.js` already is (no CDN dependency, no build step). Leaflet is the map renderer; configured non-interactive:

```js
L.map(el, { zoomControl: false, dragging: false, scrollWheelZoom: false, touchZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false });
```

### New file: `static/js/radar.js`

- `initRadar()` — constructs the Leaflet map once (lazily, on first visit to the radar screen, not on page load — it costs nothing while you're never looking at it), adds the CARTO base layer and a RainViewer tile layer, centered on `config`'s lat/lon (passed through from a small addition to `/api/status` or hardcoded to match `config.py`'s existing default — builder's call, either is fine since the value doesn't change at runtime).
- `loadFrames()` — calls `/api/radar/frames`; on failure, shows an "Radar unavailable" state in the map body rather than a blank tile grid.
- Animation: cycles through the frames selected by the active range chip at 500ms/frame while playing, with an 800ms hold on the most recent (current) frame before looping back to the start — long enough to read "now" before the loop restarts.
- Play/pause button toggles the loop; range chips (30M/1H/2H) re-slice the frame list and restart the loop from the beginning.
- Independent polling: refetch `/api/radar/frames` every 2 minutes while the radar screen is visible (matches the backend cache TTL). Note: `app.js`'s existing `setInterval(refresh, POLL_MS)` is *not* paused when the tab is hidden today — its `visibilitychange` listener only triggers an extra immediate refresh on becoming visible again, it doesn't stop the interval. Don't copy that; `radar.js`'s poll should be started when the radar screen is shown and explicitly `clearInterval`'d when it's hidden (driven by the same show/hide toggle in Navigation, not `visibilitychange`), so it isn't a no-op fetch running while nobody's looking.

### `static/index.html`

- Add `#radar-screen` as a sibling of `.grid`, hidden by default (mirrors the existing `#loading` show/hide pattern already in the page).
- Add the two new buttons into the existing `#statusbar`, both using inline stroke SVG (copy the sonar and grid-icon markup from the Option C mockup). Note: this is a new convention, not a reuse of an existing one — today's icon-ish elements (`#exit-btn`'s "✕", `.cell-label`'s emoji) are literal text glyphs. Inline SVG is the better fit here because there's no clean single Unicode glyph for "sonar" or "2×2 grid," and it gives icon-only buttons a real `aria-label` per the usual accessibility baseline. Initial visibility: radar icon shown, grid icon hidden.

### `static/css/dashboard.css`

- `#radar-screen` layout rules (label row, legend, chips, map body, playback bar) following the `.cell`/`.cell-label` conventions already in the file — no new color variables needed, everything maps onto the existing `--bg`, `--bg-cell`, `--accent`, `--text-dim`, `--border` tokens.
- Leaflet's default CSS needs its z-index and control-positioning assumptions checked against the dashboard's `overflow: hidden` / fixed-size body — the base Leaflet stylesheet is close to drop-in but the attribution control's default bottom-right placement should be restyled to sit unobtrusively inside the map body's rounded corner, not full-bleed to the screen edge.

### `static/js/app.js`

- Wire the two new buttons' click handlers to the show/hide toggle.
- Call `initRadar()` the first time the radar button is tapped (not eagerly on load).

---

## Constraints

- 1024×600, no scroll, Chromium kiosk (`--ozone-platform=wayland`), touch-only input — same environment as the rest of the dashboard.
- Requires network access to `api.rainviewer.com`, RainViewer's tile host, and CARTO's tile CDN. If the Pi is offline, the radar screen should degrade to the "Radar unavailable" state rather than hang — the rest of the dashboard already has this problem for AQI/forecast and handles it the same way (stale-cache-or-empty, no crash).

---

## What's Left to the Builder

- Exact Leaflet zoom level (visually tune on the real device so the ~2-hour precipitation window around Coppell reads clearly at 1024×600 — somewhere in the zoom 7–9 range is a reasonable starting point).
- Exact tile size (256 vs 512) — 256 is the safer default for a Pi 4's GPU budget; revisit if frames look soft.
- Whether `/api/status` grows a `lat`/`lon` field or `radar.js` just imports the same default from a small shared constant — either is fine, it's a static value either way.
