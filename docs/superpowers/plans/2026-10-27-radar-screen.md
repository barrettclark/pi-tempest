# Radar Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-screen radar view, reachable from the main dashboard via a status-bar icon and reversible via a second icon, showing the last ~2 hours of RainViewer precipitation frames over a dark-inverted OpenStreetMap basemap centered on Coppell, TX.

**Architecture:** A new cached FastAPI proxy endpoint (`GET /api/radar/frames`) trims RainViewer's public frame-list JSON to `{host, frames}`. The frontend stays a single page with no router — a new `#radar-screen` div and `.grid` are shown/hidden by one toggle, matching the existing `#loading` show/hide convention. A vendored, fully non-interactive Leaflet map renders the basemap + a single RainViewer tile layer whose URL is swapped per frame to animate.

**Tech Stack:** FastAPI + httpx (backend, already in use); vanilla JS modules + Leaflet 1.9.4 (vendored, no CDN/build step) on the frontend.

**Spec:** `docs/superpowers/specs/2026-10-27-radar-screen-design.md`

## Global Constraints

- Screen is fixed 1024×600, no scroll, capacitive touch only (no mouse/keyboard) — every new element needs a real tap target, not a hover state.
- No new API keys, no new paid service (RainViewer + OpenStreetMap standard basemap tiles, both free/keyless — CARTO was the original plan (found to require an API key) and Esri's free tile service was the first replacement attempt (found to fail with "not supported" placeholders for most tiles when fetched from a real browser, despite working via `curl`); see Task 4 for the full story).
- Map is permanently non-interactive: no pan, zoom, drag, or markers users can manipulate.
- Past radar frames only — no nowcast/forecast frames.
- Don't block the main grid's 60s refresh loop while the radar screen is open, or vice versa — the radar screen's own polling/animation must start only while visible and stop while hidden.
- CI gates on `ruff check .`, `ruff format --check .`, `mypy api collector config.py`, and `pytest` (`.github/workflows/ci.yml`) — run all four before every backend commit.

## Review Focus

- RainViewer's `weather-maps.json` missing or reshaping its `radar`/`past` keys (upstream API change or partial response) — frames should come back empty, never a 500. *(Task 1)*
- A radar or basemap tile image failing to load (flaky network, not a full outage) leaves stale or blank imagery with no feedback that anything's wrong. *(Task 4)*
- The radar screen is opened before `/api/radar/frames` has resolved, or resolves to zero frames — the play button and frame renderer must no-op instead of throwing on an empty array. *(Task 5)*
- Tapping the radar icon twice in quick succession calls Leaflet's map constructor twice on the same DOM node, which throws ("Map container is already initialized") rather than silently reusing the existing map. *(Task 4)*
- Tapping back to the grid mid-animation must stop both the animation interval and the frame-polling interval — otherwise they keep running invisibly in the background for as long as the kiosk stays up. *(Task 5)*

---

### Task 1: Backend — `GET /api/radar/frames`

**Files:**
- Create: `api/routers/radar.py`
- Modify: `api/schemas.py` (add `RadarFrame`, `RadarFramesResponse`)
- Modify: `api/main.py` (register router at `/api`, add route to the module docstring's route list)
- Modify: `tests/test_upstream_cache.py` (extend `fresh_caches`, add radar test cases)

**Interfaces:**
- Produces: `api.routers.radar.router` (`APIRouter`, included with `prefix="/api"` so the route is `GET /api/radar/frames`); `api.routers.radar._cache: dict` (`{"data": dict | None, "fetched_at": float}`); `api.routers.radar._CACHE_TTL = 120`; `api.routers.radar._fetch_radar_frames() -> dict` returning `{"host": str, "frames": [{"time": int, "path": str}, ...]}`; `api.routers.radar.get_radar_frames() -> RadarFramesResponse`. JSON response shape: `{"host": str, "frames": [{"time": int, "path": str}, ...]}`.
- Consumes: nothing new — `httpx.AsyncClient` and the cache-dict pattern already used in `api/routers/aqi.py`.

- [ ] **Step 1: Write the failing tests in `tests/test_upstream_cache.py`**

Add `radar` to the existing import (`from api.routers import aqi, forecast, radar`) and to `fresh_caches`:
```python
monkeypatch.setattr(radar, "_cache", {"data": None, "fetched_at": 0})
```

Add a fixture payload and five tests, following the existing `_FORECAST_OK`/`test_forecast_*` pattern exactly:

```python
_RADAR_OK = {
    "host": "https://tilecache.rainviewer.com",
    "radar": {
        "past": [
            {"time": 1000, "path": "/v2/radar/1000"},
            {"time": 1600, "path": "/v2/radar/1600"},
        ],
        "nowcast": [{"time": 2200, "path": "/v2/radar/2200"}],
    },
}


async def test_radar_strips_nowcast_frames(mock_upstream, fresh_caches):
    mock_upstream(lambda req: httpx.Response(200, json=_RADAR_OK))
    body = await radar.get_radar_frames()
    assert body.host == "https://tilecache.rainviewer.com"
    assert [f.time for f in body.frames] == [1000, 1600]


async def test_radar_failure_is_not_cached(mock_upstream, fresh_caches):
    mock_upstream(lambda req: httpx.Response(500))
    body = await radar.get_radar_frames()
    assert body.frames == []
    assert body.host == ""
    assert radar._cache["data"] is None


async def test_radar_keeps_last_good_data_on_failure(mock_upstream, fresh_caches):
    mock_upstream(lambda req: httpx.Response(200, json=_RADAR_OK))
    good = await radar.get_radar_frames()

    radar._cache["fetched_at"] -= radar._CACHE_TTL + 1
    mock_upstream(lambda req: httpx.Response(500))
    stale = await radar.get_radar_frames()
    assert stale.frames == good.frames


async def test_radar_cache_hit_skips_fetch(mock_upstream, fresh_caches):
    seen: list[httpx.Request] = []

    def handler(req):
        seen.append(req)
        return httpx.Response(200, json=_RADAR_OK)

    mock_upstream(handler)
    await radar.get_radar_frames()
    await radar.get_radar_frames()
    assert len(seen) == 1


async def test_radar_missing_radar_key_returns_empty_frames(mock_upstream, fresh_caches):
    mock_upstream(lambda req: httpx.Response(200, json={"host": "https://x"}))
    body = await radar.get_radar_frames()
    assert body.frames == []
    assert body.host == "https://x"
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pytest tests/test_upstream_cache.py -v`
Expected: FAIL/ERROR — `ImportError: cannot import name 'radar'` (the module doesn't exist yet).

- [ ] **Step 3: Add `RadarFrame` and `RadarFramesResponse` to `api/schemas.py`**

```python
class RadarFrame(BaseModel):
    time: int
    path: str


class RadarFramesResponse(BaseModel):
    host: str
    frames: list[RadarFrame]
```

- [ ] **Step 4: Implement `api/routers/radar.py`**

Mirror `api/routers/aqi.py`'s structure (module docstring, `log`, `router`, `_cache`, `_CACHE_TTL`, try/except around the fetch, `data = _cache["data"] or <default>`). `_fetch_radar_frames()` fetches `https://api.rainviewer.com/public/weather-maps.json` with a 10s timeout, raises on non-2xx (`resp.raise_for_status()`), then builds the trimmed dict from `data.get("host", "")` and `data.get("radar", {}).get("past", [])` (defensive `.get()` chains — this is what makes the missing-key test pass). Default when nothing cached: `{"host": "", "frames": []}`.

- [ ] **Step 5: Register the router in `api/main.py`**

Add `from api.routers import aqi, current, forecast, history, moon, radar, status` and `app.include_router(radar.router, prefix="/api")`. Add `GET  /api/radar/frames        — RainViewer past radar frames (trimmed, cached)` to the module docstring's route list.

- [ ] **Step 6: Run the tests and verify they pass**

Run: `pytest tests/test_upstream_cache.py -v`
Expected: PASS (all 5 new tests, plus the existing forecast/aqi ones still passing).

- [ ] **Step 7: Run the full gate**

Run: `ruff check . && ruff format --check . && mypy api collector config.py && pytest`
Expected: all pass, no new lint/type errors.

- [ ] **Step 8: Commit**

```bash
git add api/routers/radar.py api/schemas.py api/main.py tests/test_upstream_cache.py
git commit -m "feat: add GET /api/radar/frames (RainViewer proxy, cached)"
```

---

### Task 2: Frontend — radar screen markup and styling (static, hidden)

**Files:**
- Modify: `static/index.html`
- Modify: `static/css/dashboard.css`

**Interfaces:**
- Produces: `#radar-screen` (hidden by default via a `#radar-screen.hidden { display: none; }` compound-selector rule — a bare `.hidden` utility class loses the specificity fight against `#radar-screen`'s own ID-selector `display` rule, same reason `#loading.hidden` is a compound selector today), containing `#radar-map` (the element Task 4's Leaflet map mounts into), `.radar-legend` (a class, not an id), three range-chip buttons with `data-range="30m|1h|2h"` and class `.radar-chip` (one carrying `.radar-chip-active`), `#radar-play-btn`, `#radar-track`, `#radar-track-fill`, `#radar-dot`, `#radar-frame-time`. Two new `#statusbar` buttons: `#radar-btn` (visible) and `#back-btn` (`.hidden` by default).
- Consumes: nothing new — reuses `--bg`, `--bg-cell`, `--accent`, `--text-dim`, `--border` from `:root` in `dashboard.css`, and the `.cell-label` typography rule.

No backend or JS behavior yet — this task only has to render correctly; nothing is wired to click.

- [ ] **Step 1: Add the `.hidden` utility and `#radar-*` rules to `static/css/dashboard.css`**

Add a generic `.hidden { display: none; }` rule, plus `#radar-screen.hidden { display: none; }` and `#radar-btn.hidden, #back-btn.hidden { display: none; }` compound-selector overrides — any element whose own base rule sets `display` via an ID selector needs its own `<id>.hidden` override, because a bare class selector never outranks an ID selector regardless of source order; this is why `#loading.hidden` is already written as a compound selector elsewhere in this file, and it's the actual lesson from the bug this plan hit during implementation, not an optional extra. Add rules for the radar screen's label row (reuse `.cell-label`'s exact properties: 9px/700/uppercase/0.1em/`var(--text-dim)`), the legend gradient bar (`linear-gradient(90deg, var(--accent2), var(--warn), var(--danger))`, 6px tall, 70px wide), the chips (pill buttons: `border-radius: 11px`, `padding: 4px 8px`, `font-size: 9px`, `font-weight: 700`; default `color: var(--text-dim); border: 1px solid var(--border)`; `.radar-chip-active { background: rgba(0,200,255,0.18); color: var(--accent); border-color: rgba(0,200,255,0.4); }`), the map body (`border-radius: 6px`, fills remaining space, `position: relative; overflow: hidden`), a small absolutely-positioned `.radar-tile-warn` banner (centered, `background: rgba(6,15,28,0.85)`, `color: var(--warn)`, `font-size: 11px`, `padding: 6px 12px`, `border-radius: 6px`), and the playback track (copy `.hum-track`/`.hum-dot`'s exact box model — 8px tall rounded track, 13px dot — under new `.radar-track`/`.radar-track-fill`/`.radar-dot` names so this component doesn't collide with the hero cell's humidity styling). Style `#radar-btn`/`#back-btn` identically to the existing `#exit-btn` rule (`border-left: 1px solid var(--border)`, transparent background, full-height tap target).

- [ ] **Step 2: Add the markup to `static/index.html`**

After `</div><!-- /grid -->` and before the `#statusbar` div, add:
```html
<div id="radar-screen" class="hidden">
  <div class="radar-label-row">
    <div class="cell-label"><svg ...sonar icon.../> Radar</div>
    <div class="radar-legend">...</div>
    <div class="radar-chips">
      <button class="radar-chip" data-range="30m">30M</button>
      <button class="radar-chip" data-range="1h">1H</button>
      <button class="radar-chip radar-chip-active" data-range="2h">2H</button>
    </div>
  </div>
  <div id="radar-map">
    <div id="radar-tile-warn" class="radar-tile-warn hidden">Tiles unavailable</div>
  </div>
  <div class="radar-playback">
    <button id="radar-play-btn" aria-label="Pause loop">...</button>
    <span>-2h</span>
    <div id="radar-track" class="radar-track">
      <div id="radar-track-fill" class="radar-track-fill"></div>
      <div id="radar-dot" class="radar-dot"></div>
    </div>
    <span id="radar-frame-time">now</span>
  </div>
</div>
```
Copy the sonar-icon and grid-icon inline `<svg>` markup verbatim from the Option C mockup (`https://claude.ai/artifact/ByiCfeweKgPnwj5ZyihsMi`) for the label row's icon and for the two new statusbar buttons below.

In `#statusbar`, before `#exit-btn`, add:
```html
<button id="radar-btn" title="Show radar" aria-label="Show radar">...sonar svg...</button>
<button id="back-btn" title="Back to dashboard" aria-label="Back to dashboard" class="hidden">...grid svg...</button>
```

- [ ] **Step 3: Manual verification**

Run `uvicorn api.main:app --reload` from the repo root, open `http://localhost:8000`. Confirm the main grid renders exactly as before (unaffected) and the new `#radar-btn` icon appears in the status bar. In the browser devtools console, run `document.getElementById('radar-screen').classList.remove('hidden'); document.querySelector('.grid').classList.add('hidden')` and visually compare the result to the Option C mockup — label row, legend, chips, empty map body, playback bar should all be in place (the map itself will be blank; Leaflet isn't wired in until Task 4). Then re-add `.hidden` to `#radar-screen` and remove it from `.grid` to confirm the toggle state resets cleanly.

- [ ] **Step 4: Commit**

```bash
git add static/index.html static/css/dashboard.css
git commit -m "feat: add static radar screen markup and styling (hidden, unwired)"
```

---

### Task 3: Frontend — screen toggle (show/hide, no map yet)

**Files:**
- Modify: `static/js/app.js`

**Interfaces:**
- Produces: `showRadar()` and `showGrid()` functions in `app.js` (not exported — called only from the two new click handlers in this file). Both are the hook points Task 4 will extend: `showRadar()` is where a Leaflet-init call gets added, `showGrid()` is where cleanup gets added.
- Consumes: `.grid`, `#radar-screen`, `#radar-btn`, `#back-btn`, `.hidden` from Task 2.

- [ ] **Step 1: Add DOM refs and toggle functions to `static/js/app.js`**

```js
const GRID         = document.querySelector('.grid');
const RADAR_SCREEN = document.getElementById('radar-screen');
const RADAR_BTN    = document.getElementById('radar-btn');
const BACK_BTN     = document.getElementById('back-btn');

function showRadar() {
  GRID.classList.add('hidden');
  RADAR_SCREEN.classList.remove('hidden');
  RADAR_BTN.classList.add('hidden');
  BACK_BTN.classList.remove('hidden');
}

function showGrid() {
  RADAR_SCREEN.classList.add('hidden');
  GRID.classList.remove('hidden');
  BACK_BTN.classList.add('hidden');
  RADAR_BTN.classList.remove('hidden');
}

RADAR_BTN.addEventListener('click', showRadar);
BACK_BTN.addEventListener('click', showGrid);
```

Place this near the existing `exit-btn` listener, not inside the `(async () => { ... })()` IIFE — it doesn't depend on the initial data load.

- [ ] **Step 2: Manual verification**

Run `uvicorn api.main:app --reload`, open the dashboard, tap the radar icon in the status bar: the grid hides, the (still-empty) radar screen shows, and the status bar's icon swaps from radar to grid. Tap the grid icon: it reverses cleanly. Repeat several times rapidly to confirm no visual glitches from double-toggling.

- [ ] **Step 3: Commit**

```bash
git add static/js/app.js
git commit -m "feat: wire radar/grid screen toggle"
```

---

### Task 4: Frontend — Leaflet map + current frame

**Files:**
- Create: `static/js/vendor/leaflet.js` (pinned v1.9.4)
- Create: `static/css/vendor/leaflet.css` (pinned v1.9.4, matching)
- Create: `static/js/radar.js`
- Modify: `static/index.html` (vendor `<link>`/`<script>` tags, import radar.js)
- Modify: `static/js/app.js` (call into radar.js from `showRadar()`/`showGrid()`)
- Modify: `static/css/dashboard.css` (`.map-tiles-dark` filter rule for the OSM base layer)

**Interfaces:**
- Produces: `static/js/radar.js` exports `onRadarShown()` and `onRadarHidden()`. `onRadarShown()`: idempotently creates the Leaflet map (module-level `let map = null` guard — calling it twice is a no-op after the first call), adds the dark-inverted OSM base layer and a RainViewer tile layer (initially blank), fetches `/api/radar/frames` and renders the most recent frame. `onRadarHidden()`: present but empty in this task (Task 5 adds the cleanup body — same exported name, so `app.js` never changes again after this task).

**Correction found during implementation (three rounds):** the plan originally specified CARTO's `basemaps.cartocdn.com` as the base layer, matching the design doc. A live browser check found CARTO now returns an "API KEY REQUIRED" placeholder image instead of map tiles for that URL — confirmed via direct curl of the tile URL, a real, permanent change in CARTO's free tier, not a code bug. The first replacement, Esri's `World_Dark_Gray_Base`, was dropped based on what turned out to be a **misdiagnosis**: tiles rendered through the full radar screen showed "Zoom Level Not Supported" placeholders for most cells, which was blamed on Esri gating by Referer/Origin header. Settled on OpenStreetMap's standard tiles (`tile.openstreetmap.org`) as a second replacement, verified genuinely working via a standalone 3×3 `<img>` grid — but the *same* "Zoom Level Not Supported" placeholders then reappeared once viewed through the actual radar screen (both layers rendered together). That inconsistency — standalone basemap tests always passing, the full radar screen always failing in the same visual pattern — was the tell: the placeholder was coming from the **RainViewer overlay layer**, not either basemap. RainViewer's radar tiles don't support zoom 8+ for this frame path, confirmed directly: `z=7` returns real (mostly-transparent, precipitation-blob) tile data, `z=8` and `z=9` both return the identical "Zoom Level Not Supported" placeholder (a 200 OK, so Leaflet's `tileerror` never fires on it — this fails silently, no "Tiles unavailable" banner). Esri was very likely fine the whole time. The map's `ZOOM` constant is `7`, not `8` (see the code below) — this is the actual fix; OSM stays the basemap choice since it's confirmed working and there's no reason to revert it. The lesson: **when a test environment has two independently-sourced image layers stacked together, isolate which layer is actually failing before concluding anything about either data source** — testing the basemap alone (curl, or a standalone tile grid) will pass even when the real, user-visible failure is coming from the other layer. The design doc has been updated to match.
- Consumes: `fetchJson` from `static/js/api.js` (`fetchJson(url) -> Promise<any>`, defined in Task-1-independent existing code); the `/api/radar/frames` response shape from Task 1 (`{host, frames: [{time, path}]}`); `#radar-map` from Task 2.

- [ ] **Step 1: Vendor Leaflet 1.9.4**

```bash
curl -fsSL https://unpkg.com/leaflet@1.9.4/dist/leaflet.js -o static/js/vendor/leaflet.js
curl -fsSL https://unpkg.com/leaflet@1.9.4/dist/leaflet.css -o static/css/vendor/leaflet.css
```
(Leaflet's default marker icon images aren't needed — this map never uses `L.marker`, only `L.tileLayer` and `L.circleMarker`, both vector/image-URL based.)

- [ ] **Step 2: Add the vendor tags and `radar.js` import to `static/index.html`**

In `<head>`, after the existing `chart.umd.min.js` script tag:
```html
<link rel="stylesheet" href="/css/vendor/leaflet.css">
<script src="/js/vendor/leaflet.js"></script>
```
`radar.js` is imported from `app.js` (Step 4 below), not tagged separately in the HTML.

- [ ] **Step 3: Implement `static/js/radar.js`**

```js
import { fetchJson } from './api.js';

const CENTER = [32.97, -96.99]; // Coppell, TX — mirrors config.py's LAT/LON
const ZOOM = 7; // RainViewer's radar tiles don't support zoom 8+ (served as a 200 OK "Zoom Level Not Supported" placeholder, confirmed live)

let map = null;
let radarLayer = null;
let state = { host: '', frames: [] };

function buildTileUrl(frame) {
  return `${state.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;
}

function renderFrame(frame) {
  if (!frame) return;
  radarLayer.setUrl(buildTileUrl(frame));
}

async function loadFrames() {
  try {
    const data = await fetchJson('/api/radar/frames');
    state = data;
    renderFrame(state.frames[state.frames.length - 1]);
  } catch (err) {
    console.error('Radar frames load error:', err);
  }
}

export function onRadarShown() {
  if (!map) {
    map = L.map('radar-map', {
      center: CENTER, zoom: ZOOM,
      zoomControl: false, dragging: false, scrollWheelZoom: false,
      touchZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, tap: false,
    });
    const baseLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
      className: 'map-tiles-dark',
    }).addTo(map);
    radarLayer = L.tileLayer('', { opacity: 0.75 }).addTo(map);
    L.circleMarker(CENTER, { radius: 5, color: '#00c8ff', fillColor: '#00c8ff', fillOpacity: 1 }).addTo(map);

    const tileWarn = document.getElementById('radar-tile-warn');
    const showWarn = () => tileWarn.classList.remove('hidden');
    const hideWarn = () => tileWarn.classList.add('hidden');
    [baseLayer, radarLayer].forEach((layer) => {
      layer.on('tileerror', showWarn);
      layer.on('tileload', hideWarn);
    });
  }
  loadFrames();
}

export function onRadarHidden() {
  // Task 5 adds animation/polling cleanup here.
}
```

- [ ] **Step 4: Add the dark-tile filter to `static/css/dashboard.css`**

```css
.map-tiles-dark { filter: invert(1) hue-rotate(180deg) brightness(0.9) contrast(0.9); }
```
(Leaflet's `className` tile-layer option puts this class on each `<img>` tile it creates. The RainViewer overlay layer doesn't get this class, so the precipitation colors stay true.)

- [ ] **Step 5: Wire into `static/js/app.js`**

```js
import { onRadarShown, onRadarHidden } from './radar.js';
```
Call `onRadarShown()` at the end of `showRadar()`, and `onRadarHidden()` at the end of `showGrid()`.

- [ ] **Step 6: Manual verification**

Run `uvicorn api.main:app --reload`, open the dashboard, tap the radar icon. Confirm: the OSM basemap renders centered on Coppell, TX, inverted to a dark palette (real roads/labels, not a placeholder image) — zoom out mentally and check it actually looks like a map, not an abstract color blob; a cyan dot marks the center; the most recent RainViewer frame renders as an overlay in its true (non-inverted) colors (compare against `rainviewer.com`'s own site for the same timestamp to confirm it's the right data, not just "an image loaded"). Confirm the map doesn't respond to click-drag or scroll (non-interactive). Tap back to grid and back to radar several times rapidly — confirm no "Map container is already initialized" error in the console. In devtools, temporarily set the network throttling to "Offline," tap back to grid then back to radar, and confirm the "Tiles unavailable" banner appears over the map instead of silently showing blank/broken tiles; restore the network and confirm the banner clears on the next successful tile load. Given this task's history, don't trust a `curl` check of the tile URL as sufficient — the actual rendered tiles in the browser are what matters.

- [ ] **Step 6: Commit**

```bash
git add static/js/vendor/leaflet.js static/css/vendor/leaflet.css static/js/radar.js static/index.html static/js/app.js
git commit -m "feat: render current radar frame on a non-interactive Leaflet map"
```

---

### Task 5: Frontend — playback, range chips, polling

**Files:**
- Modify: `static/js/radar.js`

**Interfaces:**
- Produces: nothing new exported — `onRadarShown()`/`onRadarHidden()` keep their Task 4 signatures; this task fills in `onRadarHidden()`'s body and adds animation/chip/poll logic reachable only through those two functions and the chip/play-button DOM listeners set up inside `onRadarShown()`.
- Consumes: `#radar-play-btn`, `.radar-chip` (+ `data-range`), `#radar-track-fill`, `#radar-dot`, `#radar-frame-time` from Task 2; `state.frames`/`renderFrame()` from Task 4.

- [ ] **Step 1: Add frame-slicing, animation loop, and play/pause to `radar.js`**

Extend `state` with `activeFrames: []`, `frameIndex: 0`, `playing: true`. `sliceFrames(rangeKey)` maps `'30m' -> 6, '1h' -> 6*2, '2h' -> all` (frames are ~10 min apart) by slicing `state.frames` from the end; guard the empty case (`state.frames.length === 0` → `activeFrames = []`, disable `#radar-play-btn`, show a "no data" label in `#radar-frame-time` instead of a timestamp). `advanceFrame()`: if `activeFrames.length === 0`, return without scheduling anything; otherwise render `activeFrames[frameIndex]`, update `#radar-track-fill` width and `#radar-dot` left to `frameIndex / (activeFrames.length - 1) * 100%` (0% when only one frame), update `#radar-frame-time` (12-hour `toLocaleTimeString` on the frame's `time`, or "now" on the last frame), then schedule the next call via `setTimeout` — 800ms if this was the last frame before wrapping to 0, else 500ms. Store the timer id so it can be cancelled. `#radar-play-btn` click toggles `state.playing` and starts/stops the loop accordingly (play icon ⇄ pause icon swap, matching the `#exit-btn`-style icon-only button convention).

- [ ] **Step 2: Add range chips and polling**

Each `.radar-chip` click: set `.radar-chip-active` on the clicked one only, call `sliceFrames(this.dataset.range)`, reset `frameIndex = 0`, re-render. `loadFrames()` (from Task 4) should call `sliceFrames()` with the currently-active chip's range after updating `state.frames`, so a poll refresh doesn't silently drop the user's chip selection. Add polling: `onRadarShown()` starts `setInterval(loadFrames, 120000)` (stores the id); `onRadarHidden()` now calls `clearInterval` on both the polling id and the animation timeout id, and leaves `map`/`radarLayer` alone (they're reused next time, per Task 4's idempotent init).

- [ ] **Step 3: Manual verification**

Tap into the radar screen: confirm playback animates frame-by-frame with a visible pause on "now" before looping. Tap pause: it stops on the current frame; tap play: it resumes. Tap each range chip: the track/dot and loop length visibly change, and the previously-active chip's highlight moves to the new one. Tap back to the grid mid-loop, wait a few seconds, then reopen radar — confirm (via a `console.log` temporarily, or just by the UI not glitching) that no duplicate timers are stacking: the frame shouldn't visibly "double-speed" after several open/close cycles. Temporarily stub `fetchJson` in the console to resolve `{host: '', frames: []}` and re-run `onRadarShown()` to confirm the empty-frames path doesn't throw and shows "no data" instead of a blank/looping track.

- [ ] **Step 4: Commit**

```bash
git add static/js/radar.js
git commit -m "feat: add radar playback, range chips, and background polling"
```
