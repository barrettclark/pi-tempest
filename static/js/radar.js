import { fetchJson } from './api.js';

const CENTER = [32.97, -96.99]; // Coppell, TX — mirrors config.py's LAT/LON
const ZOOM = 7; // RainViewer's radar tiles don't support zoom 8+ (served as a 200 OK "Zoom Level Not Supported" placeholder)

const BLANK_TILE_URL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const RADAR_OPACITY = 0.75;
const SWAP_TIMEOUT_MS = 2000; // fallback if a preloaded frame's tiles never finish loading
const NOW_RECENCY_SECONDS = 900; // only label the newest frame "now" if it's this fresh

let map = null;
let radarLayers = []; // two-layer pool: one visible, one preloading the next frame
let radarLayerReady = [false, false]; // has this pool slot's CURRENT url actually finished loading?
let activeRadarIndex = 0;
let radarSwapTimeoutId = null;
let radarSwapHandler = null;

const baseFailedTiles = new Set();
const radarFailedTiles = [new Set(), new Set()]; // one Set per pool slot — a hidden layer's own tiles shouldn't affect the visible layer's warning

function updateTileWarn() {
  const tileWarn = document.getElementById('radar-tile-warn');
  if (!tileWarn) return;
  const activeFailures = radarFailedTiles[activeRadarIndex];
  tileWarn.classList.toggle('hidden', !(baseFailedTiles.size > 0 || activeFailures.size > 0));
}

let state = { host: '', frames: [], activeFrames: [], frameIndex: 0, playing: true };
let activeRange = '2h';
let pollTimerId = null;
let animTimerId = null;
let loadSeq = 0;

const RANGE_SECONDS = { '30m': 1800, '1h': 3600 }; // frames are ~10min apart, but this filters by actual elapsed time; '2h' (or unknown) takes all

const playBtn = document.getElementById('radar-play-btn');
const trackFill = document.getElementById('radar-track-fill');
const dot = document.getElementById('radar-dot');
const frameTimeLabel = document.getElementById('radar-frame-time');

const PLAY_ICON =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 4l15 8-15 8V4z"/></svg>';
const PAUSE_ICON =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="4" width="5" height="16" rx="1"/><rect x="14" y="4" width="5" height="16" rx="1"/></svg>';

function tileKey(coords) {
  return `${coords.z}/${coords.x}/${coords.y}`;
}

function buildTileUrl(frame) {
  return `${state.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;
}

function cancelPendingSwap() {
  if (radarSwapTimeoutId !== null) {
    clearTimeout(radarSwapTimeoutId);
    radarSwapTimeoutId = null;
  }
  if (radarSwapHandler !== null) {
    radarLayers[activeRadarIndex === 0 ? 1 : 0].off('load', radarSwapHandler);
    radarSwapHandler = null;
  }
}

function swapRadarLayer(url) {
  const nextIndex = activeRadarIndex === 0 ? 1 : 0;
  const nextLayer = radarLayers[nextIndex];
  const activeLayer = radarLayers[activeRadarIndex];

  cancelPendingSwap();

  const applySwap = () => {
    nextLayer.setOpacity(RADAR_OPACITY);
    nextLayer.bringToFront();
    activeLayer.setOpacity(0);
    activeRadarIndex = nextIndex;
    updateTileWarn(); // the warning only reflects the now-visible layer's failures
  };

  // Only take the immediate-swap shortcut when this exact url already finished loading on
  // this slot (radarLayerReady), not merely when the url string matches — Leaflet's setUrl()
  // is a no-op for an unchanged url, so a url that's still loading, or that failed last time,
  // would never fire another 'load' event for us to wait on.
  if (nextLayer._url === url && radarLayerReady[nextIndex]) {
    applySwap();
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const finish = (confirmedGood) => {
      nextLayer.off('load', radarSwapHandler);
      radarSwapHandler = null;
      clearTimeout(radarSwapTimeoutId);
      radarSwapTimeoutId = null;
      // Leaflet's 'load' fires once the tile queue drains, whether or not individual tiles
      // errored — and a timeout means we gave up waiting at all. Only trust this slot as
      // "ready" (eligible for the immediate-swap shortcut next time) when the load genuinely
      // finished with zero failed tiles; otherwise leave it eligible for a redraw/retry.
      radarLayerReady[nextIndex] = confirmedGood && radarFailedTiles[nextIndex].size === 0;
      applySwap();
      resolve();
    };

    radarSwapHandler = () => finish(true);
    radarLayerReady[nextIndex] = false;
    nextLayer.on('load', radarSwapHandler);
    radarSwapTimeoutId = setTimeout(() => finish(false), SWAP_TIMEOUT_MS);
    if (nextLayer._url === url) {
      // Same url as before, but not confirmed loaded (still in flight, or failed last time) —
      // force a fresh attempt so 'load' actually fires again for us to catch.
      nextLayer.redraw();
    } else {
      nextLayer.setUrl(url);
    }
  });
}

function clearRadarLayer() {
  cancelPendingSwap();
  radarLayers.forEach((layer, i) => {
    layer.setUrl(BLANK_TILE_URL);
    layer.setOpacity(i === 0 ? RADAR_OPACITY : 0);
    radarLayerReady[i] = false;
    radarFailedTiles[i].clear();
  });
  activeRadarIndex = 0;
  updateTileWarn();
}

function renderFrame(frame) {
  if (!frame) return Promise.resolve();
  return swapRadarLayer(buildTileUrl(frame));
}

function sliceFrames(rangeKey) {
  activeRange = rangeKey;
  const pausedFrame = !state.playing ? state.activeFrames[state.frameIndex] : null;

  if (rangeKey === 'now') {
    // a single still of the most recent frame — not a time window
    state.activeFrames = state.frames.slice(-1);
  } else {
    const seconds = RANGE_SECONDS[rangeKey];
    if (seconds && state.frames.length > 0) {
      const newestTime = state.frames[state.frames.length - 1].time;
      state.activeFrames = state.frames.filter((f) => newestTime - f.time <= seconds);
    } else {
      state.activeFrames = state.frames.slice();
    }
  }

  stopAnimation();

  if (state.activeFrames.length === 0) {
    state.frameIndex = 0;
    playBtn.disabled = true;
    trackFill.style.width = '0%';
    dot.style.left = '0%';
    frameTimeLabel.textContent = 'no data';
    clearRadarLayer();
    return;
  }

  playBtn.disabled = false;

  if (pausedFrame) {
    const matchIndex = state.activeFrames.findIndex((f) => f.time === pausedFrame.time);
    state.frameIndex = matchIndex !== -1 ? matchIndex : state.activeFrames.length - 1;
    advanceFrame({ schedule: false });
  } else {
    state.frameIndex = 0;
    advanceFrame();
  }
}

function updatePlayButton() {
  playBtn.innerHTML = state.playing ? PAUSE_ICON : PLAY_ICON;
  playBtn.title = state.playing ? 'Pause loop' : 'Play loop';
  playBtn.setAttribute('aria-label', playBtn.title);
}

function advanceFrame({ schedule = true } = {}) {
  if (state.activeFrames.length === 0) return;

  const frame = state.activeFrames[state.frameIndex];
  const swapPromise = renderFrame(frame);

  const last = state.activeFrames.length - 1;
  const newestFrame = state.activeFrames[last];
  const isNewestRecent = Date.now() / 1000 - newestFrame.time <= NOW_RECENCY_SECONDS;
  const pct = last === 0 ? 0 : (state.frameIndex / last) * 100;
  trackFill.style.width = `${pct}%`;
  dot.style.left = `${pct}%`;
  frameTimeLabel.textContent =
    state.frameIndex === last && isNewestRecent
      ? 'now'
      : new Date(frame.time * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  // A single-frame set (the "now" snapshot) has nothing to loop between — leave it static
  // rather than repeatedly re-rendering the same frame every 800ms.
  if (!schedule || !state.playing || state.activeFrames.length <= 1) return;

  const isLastFrame = state.frameIndex === last;
  const delay = isLastFrame ? 800 : 500;

  // Pace ticks off actual tile-swap completion, not a fixed clock — otherwise a slow
  // network never gets a chance to finish a swap before the next tick preempts it.
  swapPromise.then(() => {
    if (!state.playing) return;
    animTimerId = setTimeout(() => {
      state.frameIndex = isLastFrame ? 0 : state.frameIndex + 1;
      advanceFrame();
    }, delay);
  });
}

function stopAnimation() {
  if (animTimerId !== null) {
    clearTimeout(animTimerId);
    animTimerId = null;
  }
}

function togglePlay() {
  if (state.activeFrames.length === 0) return;
  state.playing = !state.playing;
  updatePlayButton();
  if (state.playing) {
    stopAnimation();
    advanceFrame();
  } else {
    stopAnimation();
  }
}

async function loadFrames() {
  const seq = ++loadSeq;
  try {
    const data = await fetchJson('/api/radar/frames');
    if (seq !== loadSeq) return; // a newer loadFrames() call has since started; this response is stale
    state.host = data.host;
    state.frames = data.frames;
    sliceFrames(activeRange);
  } catch (err) {
    console.error('Radar frames load error:', err);
    if (seq !== loadSeq) return;
    // no prior good data to fall back to (most likely the first load) — surface the "no data" state
    if (state.frames.length === 0) {
      sliceFrames(activeRange);
    } else if (state.playing && animTimerId === null) {
      // prior good data is retained, but the animation loop isn't running (e.g. the screen
      // was just reshown) — resume it instead of leaving a frozen frame behind the pause icon
      advanceFrame();
    }
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
    radarLayers = [0, 1].map((i) =>
      L.tileLayer(BLANK_TILE_URL, { opacity: i === 0 ? RADAR_OPACITY : 0 }).addTo(map)
    );
    activeRadarIndex = 0;
    L.circleMarker(CENTER, { radius: 5, color: '#00c8ff', fillColor: '#00c8ff', fillOpacity: 1, interactive: false }).addTo(map);

    // catches real network/DNS tile failures; RainViewer's "unsupported zoom" response is a 200 OK and won't trigger this
    baseLayer.on('tileerror', (e) => { baseFailedTiles.add(tileKey(e.coords)); updateTileWarn(); });
    baseLayer.on('tileload', (e) => { baseFailedTiles.delete(tileKey(e.coords)); updateTileWarn(); });
    radarLayers.forEach((layer, i) => {
      layer.on('tileerror', (e) => { radarFailedTiles[i].add(tileKey(e.coords)); updateTileWarn(); });
      layer.on('tileload', (e) => { radarFailedTiles[i].delete(tileKey(e.coords)); updateTileWarn(); });
    });

    playBtn.addEventListener('click', togglePlay);
    document.querySelectorAll('.radar-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.radar-chip').forEach((c) => {
          c.classList.remove('radar-chip-active');
          c.setAttribute('aria-pressed', 'false');
        });
        chip.classList.add('radar-chip-active');
        chip.setAttribute('aria-pressed', 'true');
        sliceFrames(chip.dataset.range);
      });
    });
  }

  state.playing = true;
  updatePlayButton();
  loadFrames();
  pollTimerId = setInterval(loadFrames, 120000);
}

export function onRadarHidden() {
  loadSeq++; // invalidate any in-flight loadFrames() response so it can't resurrect playback
  stopAnimation();
  cancelPendingSwap(); // don't let a mid-flight tile preload restyle the map after it's hidden
  if (pollTimerId !== null) {
    clearInterval(pollTimerId);
    pollTimerId = null;
  }
}
