"""
GET /api/forecast — proxies WeatherFlow better_forecast endpoint.

Returns the next 12 hours of hourly forecast data, converted to
imperial units. Cached in memory for 10 minutes to avoid hammering
the WeatherFlow API on every dashboard refresh.
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
        "time":              h.get("time"),
        "conditions":        h.get("conditions"),
        "icon":              h.get("icon"),
        "temperature_f":     units.c_to_f(temp_c),
        "feels_like_f":      units.c_to_f(feels_c),
        "humidity_pct":      h.get("relative_humidity"),
        "precip_in":         units.mm_to_in(h.get("precip") or 0),
        "precip_prob_pct":   h.get("precip_probability"),
        "wind_avg_mph":      units.ms_to_mph(wind_ms),
        "wind_gust_mph":     units.ms_to_mph(gust_ms),
        "wind_direction_deg":       h.get("wind_direction"),
        "wind_direction_cardinal":  h.get("wind_direction_cardinal"),
        "uv_index":          h.get("uv"),
        "pressure_inhg":     units.mb_to_inhg(h.get("sea_level_pressure")),
    }


async def _fetch_forecast() -> list[dict]:
    url = f"{config.WEATHERFLOW_API_BASE}/better_forecast"
    params = {
        "station_id": config.STATION_ID,
        "token": config.TOKEN,
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()
        hourly = data.get("forecast", {}).get("hourly", [])
        return [_convert_hourly(h) for h in hourly]
    except Exception as exc:
        log.error("Failed to fetch forecast: %s", exc)
        return []


@router.get("/forecast")
async def get_forecast():
    now = time.time()
    if _cache["data"] is None or (now - _cache["fetched_at"]) > _CACHE_TTL:
        log.info("Refreshing forecast cache...")
        _cache["data"] = await _fetch_forecast()
        _cache["fetched_at"] = now

    hourly = _cache["data"] or []

    # Return the next 12 hours only
    cutoff = int(now) + 12 * 3600
    upcoming = [h for h in hourly if h.get("time") and now <= h["time"] <= cutoff]

    return {
        "fetched_at": int(_cache["fetched_at"]),
        "hourly":     upcoming,
    }
