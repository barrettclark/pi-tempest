"""GET /api/radar/frames — proxies RainViewer past radar frames, trimmed and cached."""

import logging
import time

import httpx
from fastapi import APIRouter

from api.schemas import RadarFramesResponse

log = logging.getLogger("tempest.radar")
router = APIRouter()

_cache: dict = {"data": None, "fetched_at": 0}
_CACHE_TTL = 120  # 2 minutes


async def _fetch_radar_frames() -> dict:
    url = "https://api.rainviewer.com/public/weather-maps.json"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url)
    resp.raise_for_status()
    data = resp.json()
    past = data.get("radar", {}).get("past", [])
    frames = [f for f in past if "time" in f and "path" in f]
    return {
        "host": data.get("host", ""),
        "frames": frames,
    }


@router.get("/radar/frames", response_model=RadarFramesResponse)
async def get_radar_frames() -> RadarFramesResponse:
    now = time.time()
    if _cache["data"] is None or (now - _cache["fetched_at"]) > _CACHE_TTL:
        log.info("Refreshing radar frames cache...")
        try:
            _cache["data"] = await _fetch_radar_frames()
            _cache["fetched_at"] = int(now)
        except httpx.HTTPStatusError as exc:
            log.error("Radar fetch failed: HTTP %d", exc.response.status_code)
        except Exception as exc:
            log.error("Radar fetch failed: %s", type(exc).__name__)

    data = _cache["data"] or {"host": "", "frames": []}
    return RadarFramesResponse(**data)
