import { fetchJson } from './api.js';

const CENTER = [32.97, -96.99]; // Coppell, TX — mirrors config.py's LAT/LON
const ZOOM = 7; // RainViewer's radar tiles don't support zoom 8+ (served as a 200 OK "Zoom Level Not Supported" placeholder)

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
  }
  loadFrames();
}

export function onRadarHidden() {
  // Task 5 adds animation/polling cleanup here.
}
