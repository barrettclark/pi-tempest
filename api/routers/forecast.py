"""
GET /api/forecast — proxies WeatherFlow better_forecast endpoint.

Returns:
  hourly: next 24h of hourly forecast data, converted to imperial units
  daily:  next 7 days of daily forecast data, converted to imperial units

Cached in memory for 10 minutes.
"""

import logging
import time

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
        "time": h.get("time"),
        "conditions": h.get("conditions"),
        "icon": h.get("icon"),
        "temperature_f": units.c_to_f(temp_c),
        "feels_like_f": units.c_to_f(feels_c),
        "humidity_pct": h.get("relative_humidity"),
        "precip_in": units.mm_to_in(h.get("precip") or 0),
        "precip_prob_pct": h.get("precip_probability"),
        "wind_avg_mph": units.ms_to_mph(wind_ms),
        "wind_gust_mph": units.ms_to_mph(gust_ms),
        "wind_direction_deg": h.get("wind_direction"),
        "wind_direction_cardinal": h.get("wind_direction_cardinal"),
        "uv_index": h.get("uv"),
        "pressure_inhg": units.mb_to_inhg(h.get("sea_level_pressure")),
    }


def _convert_daily(d: dict) -> dict:
    return {
        "date_epoch": d.get("day_start_local"),
        "conditions": d.get("conditions"),
        "icon": d.get("icon"),
        "high_f": units.c_to_f(d.get("air_temp_high")),
        "low_f": units.c_to_f(d.get("air_temp_low")),
        "precip_prob_pct": d.get("precip_probability"),
        "precip_in": units.mm_to_in(d.get("precip") or 0),
        "wind_avg_mph": units.ms_to_mph(d.get("wind_avg")),
        "wind_direction_deg": d.get("wind_direction"),
        "wind_direction_cardinal": d.get("wind_direction_cardinal"),
    }


async def _fetch_forecast() -> dict:
    url = f"{config.WEATHERFLOW_API_BASE}/better_forecast"
    params: dict[str, str | int] = {"station_id": config.STATION_ID, "token": config.TOKEN}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()
        hourly = data.get("forecast", {}).get("hourly", [])
        daily = data.get("forecast", {}).get("daily", [])
        return {
            "hourly": [_convert_hourly(h) for h in hourly],
            "daily": [_convert_daily(d) for d in daily[:7]],
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
    upcoming = [h for h in forecast_data["hourly"] if h.get("time") and now <= h["time"] <= cutoff]

    return {
        "fetched_at": int(_cache["fetched_at"]),
        "hourly": upcoming,
        "daily": forecast_data["daily"],
    }
