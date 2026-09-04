"""GET /api/aqi — proxies AirNow.gov current AQI for Coppell TX (zip 75019)."""

import logging
import time

import httpx
from fastapi import APIRouter

import config
from api.schemas import AqiResponse

log = logging.getLogger("tempest.aqi")
router = APIRouter()

_cache: dict = {"data": None, "fetched_at": 0}
_CACHE_TTL = 1800  # 30 minutes


def _parse_airnow_response(data: list) -> dict:
    if not data:
        return {"aqi": None, "category": None, "pm25_aqi": None, "ozone_aqi": None}
    overall = max(data, key=lambda x: x.get("AQI", 0))
    pm25_aqi = next((x["AQI"] for x in data if "PM2.5" in x.get("ParameterName", "")), None)
    ozone_aqi = next(
        (x["AQI"] for x in data if "OZONE" in x.get("ParameterName", "").upper()), None
    )
    return {
        "aqi": overall.get("AQI"),
        "category": overall.get("Category", {}).get("Name"),
        "pm25_aqi": pm25_aqi,
        "ozone_aqi": ozone_aqi,
    }


async def _fetch_aqi() -> dict:
    url = "https://www.airnowapi.org/aq/observation/zipCode/current/"
    params = {
        "format": "application/json",
        "zipCode": "75019",
        "distance": "25",
        "API_KEY": config.AIRNOW_API_KEY,
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, params=params)
    resp.raise_for_status()
    return _parse_airnow_response(resp.json())


@router.get("/aqi", response_model=AqiResponse)
async def get_aqi():
    now = time.time()
    if _cache["data"] is None or (now - _cache["fetched_at"]) > _CACHE_TTL:
        log.info("Refreshing AQI cache...")
        try:
            _cache["data"] = await _fetch_aqi()
        except Exception as exc:
            log.error("AQI fetch failed: %s", exc)
            if _cache["data"] is None:
                _cache["data"] = {
                    "aqi": None,
                    "category": None,
                    "pm25_aqi": None,
                    "ozone_aqi": None,
                }
        _cache["fetched_at"] = int(now)

    return AqiResponse(fetched_at=int(_cache["fetched_at"]), **_cache["data"])
