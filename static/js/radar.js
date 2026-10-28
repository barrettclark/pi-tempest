import { fetchJson } from './api.js';

const CENTER = [32.97, -96.99]; // Coppell, TX — mirrors config.py's LAT/LON
const ZOOM = 7; // RainViewer's radar tiles don't support zoom 8+ (served as a 200 OK "Zoom Level Not Supported" placeholder)

let map = null;
let radarLayer = null;
let state = { host: '', frames: [], activeFrames: [], frameIndex: 0, playing: true };
let activeRange = '2h';
let pollTimerId = null;
let animTimerId = null;

const RANGE_FRAME_COUNTS = { '30m': 6, '1h': 12 }; // frames are ~10min apart; '2h' (or unknown) takes all

const playBtn = document.getElementById('radar-play-btn');
const trackFill = document.getElementById('radar-track-fill');
const dot = document.getElementById('radar-dot');
const frameTimeLabel = document.getElementById('radar-frame-time');

const PLAY_ICON =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 4l15 8-15 8V4z"/></svg>';
const PAUSE_ICON =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="4" width="5" height="16" rx="1"/><rect x="14" y="4" width="5" height="16" rx="1"/></svg>';

function buildTileUrl(frame) {
  return `${state.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;
}

function renderFrame(frame) {
  if (!frame) return;
  radarLayer.setUrl(buildTileUrl(frame));
}

function sliceFrames(rangeKey) {
  activeRange = rangeKey;
  const count = RANGE_FRAME_COUNTS[rangeKey];
  state.activeFrames = count ? state.frames.slice(-count) : state.frames.slice();
  state.frameIndex = 0;
  stopAnimation();

  if (state.activeFrames.length === 0) {
    playBtn.disabled = true;
    trackFill.style.width = '0%';
    dot.style.left = '0%';
    frameTimeLabel.textContent = 'no data';
    return;
  }

  playBtn.disabled = false;
  advanceFrame();
}

function updatePlayButton() {
  playBtn.innerHTML = state.playing ? PAUSE_ICON : PLAY_ICON;
  playBtn.title = state.playing ? 'Pause loop' : 'Play loop';
  playBtn.setAttribute('aria-label', playBtn.title);
}

function advanceFrame({ schedule = true } = {}) {
  if (state.activeFrames.length === 0) return;

  const frame = state.activeFrames[state.frameIndex];
  renderFrame(frame);

  const last = state.activeFrames.length - 1;
  const pct = last === 0 ? 0 : (state.frameIndex / last) * 100;
  trackFill.style.width = `${pct}%`;
  dot.style.left = `${pct}%`;
  frameTimeLabel.textContent =
    state.frameIndex === last ? 'now' : new Date(frame.time * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (!schedule || !state.playing) return;

  const isLastFrame = state.frameIndex === last;
  const delay = isLastFrame ? 800 : 500;
  animTimerId = setTimeout(() => {
    state.frameIndex = isLastFrame ? 0 : state.frameIndex + 1;
    advanceFrame();
  }, delay);
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
  try {
    const data = await fetchJson('/api/radar/frames');
    state.host = data.host;
    state.frames = data.frames;
    sliceFrames(activeRange);
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
    radarLayer = L.tileLayer('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', { opacity: 0.75 }).addTo(map);
    L.circleMarker(CENTER, { radius: 5, color: '#00c8ff', fillColor: '#00c8ff', fillOpacity: 1, interactive: false }).addTo(map);

    const tileWarn = document.getElementById('radar-tile-warn');
    const showWarn = () => tileWarn.classList.remove('hidden');
    const hideWarn = () => tileWarn.classList.add('hidden');
    // catches real network/DNS tile failures; RainViewer's "unsupported zoom" response is a 200 OK and won't trigger this
    [baseLayer, radarLayer].forEach((layer) => {
      layer.on('tileerror', showWarn);
      layer.on('tileload', hideWarn);
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
  stopAnimation();
  if (pollTimerId !== null) {
    clearInterval(pollTimerId);
    pollTimerId = null;
  }
}
