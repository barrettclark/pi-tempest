"""GET /api/radar/frames — proxies RainViewer past radar frames, trimmed and cached."""

import asyncio
import logging
import time

import httpx
from fastapi import APIRouter

from api.schemas import RadarFramesResponse

log = logging.getLogger("tempest.radar")
router = APIRouter()

_cache: dict = {"data": None, "fetched_at": 0}
_CACHE_TTL = 120  # 2 minutes
_UPSTREAM_TIMEOUT = 6.0  # total deadline, kept under the frontend's 8s fetch-abort window


async def _fetch_radar_frames() -> dict:
    url = "https://api.rainviewer.com/public/weather-maps.json"
    # httpx's `timeout=` kwarg caps each phase (connect/write/read/pool) independently, not
    # the request as a whole — a slow connect followed by a slow read could still exceed the
    # frontend's deadline. wait_for() enforces a genuine total deadline instead.
    async with httpx.AsyncClient(timeout=_UPSTREAM_TIMEOUT) as client:
        resp = await asyncio.wait_for(client.get(url), timeout=_UPSTREAM_TIMEOUT)
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
            fetched = await _fetch_radar_frames()
            RadarFramesResponse(**fetched)  # raises if upstream reshaped something we can't model
            if fetched["frames"] and not fetched["host"]:
                raise ValueError("RainViewer response has frames but no host")
            _cache["data"] = fetched
            _cache["fetched_at"] = int(now)
        except httpx.HTTPStatusError as exc:
            log.error("Radar fetch failed: HTTP %d", exc.response.status_code)
        except Exception as exc:
            log.error("Radar fetch failed: %s", type(exc).__name__)

    data = _cache["data"] or {"host": "", "frames": []}
    return RadarFramesResponse(**data)
